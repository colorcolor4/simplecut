import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { save } from "@tauri-apps/plugin-dialog";
import { buildExportArgs, type Quality, type VideoCodec } from "../ffmpeg";
import { formatTime, totalDuration, useStore } from "../store";

type Phase = "idle" | "running" | "done" | "error";

export default function ExportDialog({ onClose }: { onClose: () => void }) {
  const clips = useStore((s) => s.clips);
  const assets = useStore((s) => s.assets);
  const texts = useStore((s) => s.texts);
  const music = useStore((s) => s.music);

  const [res, setRes] = useState<"1080p" | "720p">("1080p");
  const [codec, setCodec] = useState<VideoCodec>("h264");
  const [quality, setQuality] = useState<Quality>("high");
  const [phase, setPhase] = useState<Phase>("idle");
  const [pct, setPct] = useState(0);
  const [msg, setMsg] = useState("");
  const [outFile, setOutFile] = useState("");

  const total = totalDuration(clips);

  async function start() {
    if (clips.length === 0) {
      setMsg("時間軸是空的，先加入片段再匯出。");
      setPhase("error");
      return;
    }
    const out = await save({
      defaultPath: "我的影片.mp4",
      filters: [{ name: "MP4 影片", extensions: ["mp4"] }],
    });
    if (!out) return;
    setPhase("running");
    setPct(0);
    setMsg("");
    const dims =
      res === "1080p" ? { width: 1920, height: 1080 } : { width: 1280, height: 720 };
    try {
      const textFiles = new Map<string, string>();
      for (const t of texts) {
        textFiles.set(t.id, await invoke<string>("write_text_file", { content: t.text }));
      }
      const args = buildExportArgs({
        clips,
        assets,
        texts,
        music,
        textFiles,
        ...dims,
        fps: 30,
        codec,
        quality,
        outPath: out,
      });
      const unlisten = await listen<number>("export-progress", (e) => {
        setPct(Math.min(100, (e.payload / Math.max(total, 0.01)) * 100));
      });
      try {
        await invoke("export_video", { args });
        setPct(100);
        setOutFile(out);
        setPhase("done");
      } finally {
        unlisten();
      }
    } catch (err) {
      setMsg(String(err));
      setPhase("error");
    }
  }

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && phase !== "running") onClose();
      }}
    >
      <div className="modal">
        <div className="panel-title">匯出影片</div>

        {(phase === "idle" || phase === "error") && (
          <>
            <label className="field">
              <span>解析度</span>
              <select value={res} onChange={(e) => setRes(e.target.value as "1080p" | "720p")}>
                <option value="1080p">1080p（1920×1080）</option>
                <option value="720p">720p（1280×720）</option>
              </select>
            </label>
            <label className="field">
              <span>編碼</span>
              <select value={codec} onChange={(e) => setCodec(e.target.value as VideoCodec)}>
                <option value="h264">H.264（相容性最佳）</option>
                <option value="hevc">H.265 / HEVC（檔案較小，轉檔較慢）</option>
              </select>
            </label>
            <label className="field">
              <span>畫質</span>
              <select value={quality} onChange={(e) => setQuality(e.target.value as Quality)}>
                <option value="high">高（檔案較大）</option>
                <option value="medium">中</option>
                <option value="low">低（檔案最小）</option>
              </select>
            </label>
            <div className="insp-sub">片長 {formatTime(total)} · AAC 192k · 30fps</div>
            {phase === "error" && <pre className="error-box">{msg}</pre>}
            <div className="modal-actions">
              <button onClick={onClose}>取消</button>
              <button className="primary" onClick={start}>
                {phase === "error" ? "重試" : "選擇位置並匯出"}
              </button>
            </div>
          </>
        )}

        {phase === "running" && (
          <>
            <div className="insp-sub">正在轉檔，請勿關閉視窗…</div>
            <div className="progress">
              <div className="progress-bar" style={{ width: `${pct}%` }} />
            </div>
            <div className="insp-sub">{pct.toFixed(0)}%</div>
          </>
        )}

        {phase === "done" && (
          <>
            <div className="insp-name">✅ 匯出完成</div>
            <div className="insp-sub" style={{ wordBreak: "break-all" }}>
              {outFile}
            </div>
            <div className="modal-actions">
              <button className="primary" onClick={onClose}>
                關閉
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
