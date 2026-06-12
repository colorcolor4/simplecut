import { formatTime, useStore } from "../store";

function Num({
  label,
  value,
  onChange,
  step = 0.1,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        step={step}
        value={Math.round(value * 100) / 100}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (!Number.isNaN(v)) onChange(v);
        }}
      />
    </label>
  );
}

export default function Inspector() {
  const selection = useStore((s) => s.selection);
  const clips = useStore((s) => s.clips);
  const assets = useStore((s) => s.assets);
  const texts = useStore((s) => s.texts);
  const music = useStore((s) => s.music);
  const updateClip = useStore((s) => s.updateClip);
  const updateText = useStore((s) => s.updateText);
  const updateMusic = useStore((s) => s.updateMusic);
  const deleteSelection = useStore((s) => s.deleteSelection);

  let body = (
    <div className="hint">
      點選時間軸上的片段、字幕或音樂來編輯屬性。
      <br />
      <br />
      快捷鍵：
      <br />
      空白鍵 — 播放/暫停
      <br />
      S — 在播放點分割
      <br />
      Delete — 刪除選取
    </div>
  );

  if (selection?.kind === "clip") {
    const clip = clips.find((c) => c.id === selection.id);
    const asset = clip && assets.find((a) => a.id === clip.assetId);
    if (clip && asset) {
      body = (
        <>
          <div className="insp-name" title={asset.path}>
            {asset.name}
          </div>
          <div className="insp-sub">
            片段長度 {formatTime(clip.out - clip.in)} / 原始 {formatTime(asset.duration)}
          </div>
          <Num
            label="起點（秒）"
            value={clip.in}
            onChange={(v) =>
              updateClip(clip.id, {
                in: Math.max(0, Math.min(v, clip.out - 0.1)),
              })
            }
          />
          <Num
            label="終點（秒）"
            value={clip.out}
            onChange={(v) =>
              updateClip(clip.id, {
                out: Math.max(clip.in + 0.1, Math.min(v, asset.duration)),
              })
            }
          />
          <label className="field">
            <span>原聲音量 {Math.round(clip.volume * 100)}%</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={clip.volume}
              onChange={(e) => updateClip(clip.id, { volume: parseFloat(e.target.value) })}
            />
          </label>
          <button className="danger block" onClick={deleteSelection}>
            刪除片段
          </button>
        </>
      );
    }
  } else if (selection?.kind === "text") {
    const t = texts.find((x) => x.id === selection.id);
    if (t) {
      body = (
        <>
          <label className="field">
            <span>文字內容</span>
            <textarea
              rows={3}
              value={t.text}
              onChange={(e) => updateText(t.id, { text: e.target.value })}
            />
          </label>
          <Num
            label="開始（秒）"
            value={t.start}
            onChange={(v) =>
              updateText(t.id, { start: Math.max(0, Math.min(v, t.end - 0.2)) })
            }
          />
          <Num
            label="結束（秒）"
            value={t.end}
            onChange={(v) => updateText(t.id, { end: Math.max(t.start + 0.2, v) })}
          />
          <Num
            label="字體大小"
            value={t.fontSize}
            step={2}
            onChange={(v) => updateText(t.id, { fontSize: Math.max(8, v) })}
          />
          <label className="field">
            <span>顏色</span>
            <input
              type="color"
              value={t.color}
              onChange={(e) => updateText(t.id, { color: e.target.value })}
            />
          </label>
          <label className="field">
            <span>水平位置 {Math.round(t.x * 100)}%</span>
            <input
              type="range"
              min={0.05}
              max={0.95}
              step={0.01}
              value={t.x}
              onChange={(e) => updateText(t.id, { x: parseFloat(e.target.value) })}
            />
          </label>
          <label className="field">
            <span>垂直位置 {Math.round(t.y * 100)}%</span>
            <input
              type="range"
              min={0.05}
              max={0.95}
              step={0.01}
              value={t.y}
              onChange={(e) => updateText(t.id, { y: parseFloat(e.target.value) })}
            />
          </label>
          <button className="danger block" onClick={deleteSelection}>
            刪除字幕
          </button>
        </>
      );
    }
  } else if (selection?.kind === "music" && music) {
    body = (
      <>
        <div className="insp-name" title={music.path}>
          ♪ {music.name}
        </div>
        <div className="insp-sub">長度 {formatTime(music.duration)}（從影片開頭播放）</div>
        <label className="field">
          <span>音樂音量 {Math.round(music.volume * 100)}%</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={music.volume}
            onChange={(e) => updateMusic({ volume: parseFloat(e.target.value) })}
          />
        </label>
        <button className="danger block" onClick={deleteSelection}>
          移除音樂
        </button>
      </>
    );
  }

  return (
    <aside className="inspector">
      <div className="panel-title">屬性</div>
      {body}
    </aside>
  );
}
