use serde::Serialize;
use std::io::{BufRead, BufReader, Read};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use tauri::Emitter;

fn exe_name(name: &str) -> String {
    if cfg!(windows) {
        format!("{name}.exe")
    } else {
        name.to_string()
    }
}

/// settings.json 的位置（目前只存使用者手動指定的 ffmpeg 資料夾）
fn config_file() -> Option<PathBuf> {
    let base = if cfg!(windows) {
        std::env::var("APPDATA").ok().map(PathBuf::from)
    } else if cfg!(target_os = "macos") {
        std::env::var("HOME")
            .ok()
            .map(|h| PathBuf::from(h).join("Library/Application Support"))
    } else {
        std::env::var("XDG_CONFIG_HOME")
            .ok()
            .map(PathBuf::from)
            .or_else(|| std::env::var("HOME").ok().map(|h| PathBuf::from(h).join(".config")))
    };
    base.map(|b| b.join("simplecut").join("settings.json"))
}

fn custom_ffmpeg_dir() -> Option<PathBuf> {
    let content = std::fs::read_to_string(config_file()?).ok()?;
    let v: serde_json::Value = serde_json::from_str(&content).ok()?;
    v["ffmpeg_dir"].as_str().map(PathBuf::from)
}

/// GUI apps don't reliably see the shell PATH (macOS apps never inherit it;
/// on Windows a PATH updated by winget only reaches processes started after a
/// re-login), so probe the user-configured dir and common install locations
/// before falling back to the bare command name.
fn find_tool(name: &str) -> String {
    let exe = exe_name(name);
    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Some(dir) = custom_ffmpeg_dir() {
        candidates.push(dir.join(&exe));
    }
    if cfg!(windows) {
        let from_env = |var: &str, sub: &str| -> Option<PathBuf> {
            std::env::var(var)
                .ok()
                .map(|d| PathBuf::from(d).join(sub).join(&exe))
        };
        candidates.extend(
            [
                from_env("LOCALAPPDATA", r"Microsoft\WinGet\Links"),
                from_env("ProgramFiles", r"WinGet\Links"),
                from_env("USERPROFILE", r"scoop\shims"),
                from_env("ProgramData", r"chocolatey\bin"),
                Some(PathBuf::from(format!(r"C:\ffmpeg\bin\{exe}"))),
            ]
            .into_iter()
            .flatten(),
        );
    } else {
        candidates.extend(
            ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin"]
                .iter()
                .map(|d| PathBuf::from(d).join(name)),
        );
    }
    for c in &candidates {
        if c.exists() {
            return c.to_string_lossy().into_owned();
        }
    }
    name.to_string()
}

/// On Windows suppress the console window that would otherwise flash on
/// every ffprobe/ffmpeg call.
fn make_command(program: &str) -> Command {
    let cmd = Command::new(program);
    #[cfg(windows)]
    let cmd = {
        use std::os::windows::process::CommandExt;
        let mut cmd = cmd;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
        cmd
    };
    cmd
}

fn tool_command(name: &str) -> Command {
    make_command(&find_tool(name))
}

fn install_hint() -> &'static str {
    if cfg!(windows) {
        "請先安裝 ffmpeg（winget install ffmpeg，裝完重開本程式），或在右上角「設定」手動指定 ffmpeg 位置"
    } else {
        "請先安裝 ffmpeg（brew install ffmpeg），或在右上角「設定」手動指定 ffmpeg 位置"
    }
}

#[derive(Serialize)]
pub struct ToolStatus {
    ffmpeg: Option<String>,
    ffprobe: Option<String>,
    custom_dir: Option<String>,
}

/// 路徑存在不代表能跑（可能是壞的符號連結或損毀檔），用 -version 實測
fn resolve_verified(name: &str) -> Option<String> {
    let p = find_tool(name);
    let ok = make_command(&p)
        .arg("-version")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false);
    ok.then_some(p)
}

#[tauri::command]
fn tool_status() -> ToolStatus {
    ToolStatus {
        ffmpeg: resolve_verified("ffmpeg"),
        ffprobe: resolve_verified("ffprobe"),
        custom_dir: custom_ffmpeg_dir().map(|p| p.to_string_lossy().into_owned()),
    }
}

#[tauri::command]
fn set_ffmpeg_dir(dir: Option<String>) -> Result<ToolStatus, String> {
    let file = config_file().ok_or("找不到設定檔位置")?;
    match dir {
        Some(d) => {
            let exe = exe_name("ffmpeg");
            let mut p = PathBuf::from(d);
            // 使用者選到解壓根目錄時自動往下找 bin/
            if !p.join(&exe).exists() && p.join("bin").join(&exe).exists() {
                p = p.join("bin");
            }
            if !p.join(&exe).exists() {
                return Err(format!("該資料夾內找不到 {exe}"));
            }
            std::fs::create_dir_all(file.parent().unwrap()).map_err(|e| e.to_string())?;
            let json = serde_json::json!({ "ffmpeg_dir": p.to_string_lossy() });
            std::fs::write(&file, serde_json::to_string_pretty(&json).unwrap())
                .map_err(|e| e.to_string())?;
        }
        None => {
            let _ = std::fs::remove_file(&file);
        }
    }
    Ok(tool_status())
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
    let out = tool_command("ffprobe")
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
        .map_err(|e| format!("無法執行 ffprobe：{e}（{}）", install_hint()))?;
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
    let mut child = tool_command("ffmpeg")
        .args(&args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("無法執行 ffmpeg：{e}（{}）", install_hint()))?;

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
            paths_exist,
            tool_status,
            set_ffmpeg_dir
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
