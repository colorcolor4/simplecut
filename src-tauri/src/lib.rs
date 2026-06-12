use serde::Serialize;
use std::io::{BufRead, BufReader, Read};
use std::process::{Command, Stdio};
use tauri::Emitter;

/// GUI apps on macOS don't inherit the shell PATH, so probe common install
/// locations before falling back to the bare command name.
fn find_tool(name: &str) -> String {
    let candidates = [
        format!("/opt/homebrew/bin/{name}"),
        format!("/usr/local/bin/{name}"),
        format!("/usr/bin/{name}"),
    ];
    for c in &candidates {
        if std::path::Path::new(c).exists() {
            return c.clone();
        }
    }
    name.to_string()
}

#[derive(Serialize)]
pub struct MediaInfo {
    duration: f64,
    width: u32,
    height: u32,
    has_audio: bool,
    has_video: bool,
}

#[tauri::command]
fn probe_media(path: String) -> Result<MediaInfo, String> {
    let out = Command::new(find_tool("ffprobe"))
        .args([
            "-v",
            "error",
            "-print_format",
            "json",
            "-show_format",
            "-show_streams",
            &path,
        ])
        .output()
        .map_err(|e| format!("無法執行 ffprobe：{e}（請先安裝 ffmpeg）"))?;
    if !out.status.success() {
        return Err(String::from_utf8_lossy(&out.stderr).to_string());
    }
    let v: serde_json::Value = serde_json::from_slice(&out.stdout).map_err(|e| e.to_string())?;
    let duration = v["format"]["duration"]
        .as_str()
        .and_then(|s| s.parse::<f64>().ok())
        .unwrap_or(0.0);
    let mut info = MediaInfo {
        duration,
        width: 0,
        height: 0,
        has_audio: false,
        has_video: false,
    };
    if let Some(streams) = v["streams"].as_array() {
        for s in streams {
            match s["codec_type"].as_str() {
                Some("video") => {
                    info.has_video = true;
                    info.width = s["width"].as_u64().unwrap_or(0) as u32;
                    info.height = s["height"].as_u64().unwrap_or(0) as u32;
                }
                Some("audio") => info.has_audio = true,
                _ => {}
            }
        }
    }
    Ok(info)
}

/// drawtext escaping is a minefield, so subtitle text goes through temp files
/// and the export filter uses textfile= instead of text=.
#[tauri::command]
fn write_text_file(content: String) -> Result<String, String> {
    let dir = std::env::temp_dir().join("simplecut");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let path = dir.join(format!("text_{stamp}.txt"));
    std::fs::write(&path, content).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
fn save_project_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, content).map_err(|e| e.to_string())
}

#[tauri::command]
fn read_project_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn paths_exist(paths: Vec<String>) -> Vec<bool> {
    paths
        .iter()
        .map(|p| std::path::Path::new(p).exists())
        .collect()
}

fn run_ffmpeg(app: tauri::AppHandle, args: Vec<String>) -> Result<(), String> {
    let mut child = Command::new(find_tool("ffmpeg"))
        .args(&args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("無法執行 ffmpeg：{e}（請先安裝 ffmpeg）"))?;

    let mut stderr = child.stderr.take().unwrap();
    let stderr_thread = std::thread::spawn(move || {
        let mut buf = String::new();
        let _ = stderr.read_to_string(&mut buf);
        buf
    });

    // -progress pipe:1 prints key=value lines on stdout
    let stdout = BufReader::new(child.stdout.take().unwrap());
    for line in stdout.lines().map_while(Result::ok) {
        if let Some(us) = line.strip_prefix("out_time_us=") {
            if let Ok(us) = us.trim().parse::<f64>() {
                let _ = app.emit("export-progress", us / 1_000_000.0);
            }
        }
    }

    let status = child.wait().map_err(|e| e.to_string())?;
    let err_log = stderr_thread.join().unwrap_or_default();
    if status.success() {
        Ok(())
    } else {
        let tail: Vec<&str> = err_log.lines().rev().take(15).collect();
        let tail: Vec<&str> = tail.into_iter().rev().collect();
        Err(format!("ffmpeg 匯出失敗：\n{}", tail.join("\n")))
    }
}

#[tauri::command]
async fn export_video(app: tauri::AppHandle, args: Vec<String>) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || run_ffmpeg(app, args))
        .await
        .map_err(|e| e.to_string())?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            probe_media,
            write_text_file,
            export_video,
            save_project_file,
            read_project_file,
            paths_exist
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
