import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { formatTime, uid, useStore } from "../store";

interface ProbeResult {
  duration: number;
  width: number;
  height: number;
  has_audio: boolean;
  has_video: boolean;
}

const baseName = (p: string) => p.split("/").pop()?.split("\\").pop() ?? p;

export default function MediaBin() {
  const assets = useStore((s) => s.assets);
  const addAsset = useStore((s) => s.addAsset);
  const addClip = useStore((s) => s.addClip);
  const setMusic = useStore((s) => s.setMusic);

  async function importFiles() {
    const picked = await open({
      multiple: true,
      filters: [
        {
          name: "媒體檔案",
          extensions: [
            "mp4", "mov", "m4v", "mkv", "webm", "avi",
            "mp3", "m4a", "aac", "wav", "flac", "ogg",
          ],
        },
      ],
    });
    if (!picked) return;
    const paths = Array.isArray(picked) ? picked : [picked];
    for (const p of paths) {
      try {
        const info = await invoke<ProbeResult>("probe_media", { path: p });
        addAsset({
          id: uid(),
          path: p,
          url: convertFileSrc(p),
          name: baseName(p),
          duration: info.duration,
          width: info.width,
          height: info.height,
          hasAudio: info.has_audio,
          hasVideo: info.has_video,
        });
      } catch (err) {
        alert(`無法讀取 ${baseName(p)}：${err}`);
      }
    }
  }

  return (
    <aside className="media-bin">
      <div className="panel-title">素材庫</div>
      <button className="primary block" onClick={importFiles}>
        ＋ 匯入素材
      </button>
      <div className="asset-list">
        {assets.length === 0 && (
          <div className="hint">支援影片（mp4、mov…）與音訊（mp3、wav…）</div>
        )}
        {assets.map((a) => (
          <div
            key={a.id}
            className="asset-item"
            onDoubleClick={() => (a.hasVideo ? addClip(a.id) : undefined)}
            title={a.path}
          >
            <div className="asset-icon">{a.hasVideo ? "🎬" : "🎵"}</div>
            <div className="asset-meta">
              <div className="asset-name">{a.name}</div>
              <div className="asset-sub">{formatTime(a.duration)}</div>
            </div>
            {a.hasVideo ? (
              <button className="mini" onClick={() => addClip(a.id)} title="加入時間軸">
                ＋
              </button>
            ) : (
              <button
                className="mini"
                onClick={() =>
                  setMusic({
                    path: a.path,
                    url: a.url,
                    name: a.name,
                    duration: a.duration,
                    volume: 0.6,
                  })
                }
                title="設為背景音樂"
              >
                ♪
              </button>
            )}
          </div>
        ))}
      </div>
    </aside>
  );
}
