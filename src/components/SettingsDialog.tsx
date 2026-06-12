import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { useEffect, useState } from "react";

interface ToolStatus {
  ffmpeg: string | null;
  ffprobe: string | null;
  custom_dir: string | null;
}

export default function SettingsDialog({ onClose }: { onClose: () => void }) {
  const [status, setStatus] = useState<ToolStatus | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    invoke<ToolStatus>("tool_status").then(setStatus);
  }, []);

  async function pickDir() {
    const dir = await open({
      directory: true,
      title: "選擇 ffmpeg 所在資料夾",
    });
    if (!dir) return;
    setError("");
    try {
      setStatus(await invoke<ToolStatus>("set_ffmpeg_dir", { dir }));
    } catch (err) {
      setError(String(err));
    }
  }

  async function resetAuto() {
    setError("");
    setStatus(await invoke<ToolStatus>("set_ffmpeg_dir", { dir: null }));
  }

  const row = (name: string, path: string | null) => (
    <div className="tool-row">
      <span className={`tool-mark ${path ? "ok" : "bad"}`}>
        {path ? "✓" : "✗"}
      </span>
      <span className="tool-name">{name}</span>
      <span className="tool-path" title={path ?? undefined}>
        {path ?? "找不到"}
      </span>
    </div>
  );

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="panel-title">設定</div>

        <div className="field">
          <span>ffmpeg 偵測狀態</span>
          {status ? (
            <>
              {row("ffmpeg", status.ffmpeg)}
              {row("ffprobe", status.ffprobe)}
            </>
          ) : (
            <div className="hint">偵測中…</div>
          )}
        </div>

        <div className="field">
          <span>手動指定位置</span>
          {status?.custom_dir ? (
            <div className="hint" title={status.custom_dir}>
              目前使用：{status.custom_dir}
            </div>
          ) : (
            <div className="hint">未設定（自動偵測常見安裝位置）</div>
          )}
          <div className="modal-actions" style={{ justifyContent: "flex-start" }}>
            <button onClick={pickDir}>選擇 ffmpeg 所在資料夾…</button>
            {status?.custom_dir && (
              <button onClick={resetAuto}>恢復自動偵測</button>
            )}
          </div>
        </div>

        {error && <div className="error-box">{error}</div>}

        {status && !status.ffmpeg && (
          <div className="hint">
            尚未安裝 ffmpeg？macOS：brew install ffmpeg；Windows：winget
            install ffmpeg（裝完請重開本程式）。若解壓到自訂資料夾，用上方按鈕指向
            ffmpeg.exe 所在的資料夾（選到解壓根目錄也可以，會自動找 bin）。
          </div>
        )}

        <div className="modal-actions">
          <button className="primary" onClick={onClose}>
            完成
          </button>
        </div>
      </div>
    </div>
  );
}
