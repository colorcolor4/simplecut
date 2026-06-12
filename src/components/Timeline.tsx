import React, { useMemo, useRef, useState } from "react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { computeSegments, formatTime, totalDuration, useStore } from "../store";
import { parseSubtitles } from "../subtitles";

function dragHorizontal(
  e: React.MouseEvent,
  zoom: number,
  onMove: (dxSec: number) => void
) {
  const startX = e.clientX;
  const move = (ev: MouseEvent) => onMove((ev.clientX - startX) / zoom);
  const up = () => {
    window.removeEventListener("mousemove", move);
    window.removeEventListener("mouseup", up);
  };
  window.addEventListener("mousemove", move);
  window.addEventListener("mouseup", up);
}

export default function Timeline() {
  const clips = useStore((s) => s.clips);
  const assets = useStore((s) => s.assets);
  const texts = useStore((s) => s.texts);
  const music = useStore((s) => s.music);
  const selection = useStore((s) => s.selection);
  const playhead = useStore((s) => s.playhead);
  const playing = useStore((s) => s.playing);
  const zoom = useStore((s) => s.zoom);
  const select = useStore((s) => s.select);
  const splitAtPlayhead = useStore((s) => s.splitAtPlayhead);
  const addText = useStore((s) => s.addText);
  const importTexts = useStore((s) => s.importTexts);
  const deleteSelection = useStore((s) => s.deleteSelection);
  const setPlaying = useStore((s) => s.setPlaying);
  const setZoom = useStore((s) => s.setZoom);
  const setMusic = useStore((s) => s.setMusic);

  const segs = useMemo(() => computeSegments(clips), [clips]);
  const total = totalDuration(clips);
  const contentSec = Math.max(total, music?.duration ?? 0, 30) + 5;
  const innerRef = useRef<HTMLDivElement>(null);
  // 拖曳中的片段跟著游標畫（startSec），其餘片段由 store 重排後磁性吸附
  const [dragGhost, setDragGhost] = useState<{ id: string; startSec: number } | null>(null);

  function seekTo(clientX: number) {
    const el = innerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const st = useStore.getState();
    st.setPlaying(false);
    st.setPlayhead(Math.max(0, (clientX - rect.left) / st.zoom));
  }

  function onScrub(e: React.MouseEvent) {
    if (e.target !== e.currentTarget && !(e.target as HTMLElement).classList.contains("tick")) {
      if (!(e.currentTarget as HTMLElement).classList.contains("ruler")) return;
    }
    seekTo(e.clientX);
    const move = (ev: MouseEvent) => seekTo(ev.clientX);
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  }

  function beginClipDrag(e: React.MouseEvent, clipId: string) {
    e.preventDefault();
    e.stopPropagation();
    const st = useStore.getState();
    st.select({ kind: "clip", id: clipId });
    const inner = innerRef.current;
    if (!inner) return;
    const segsNow = computeSegments(st.clips);
    const seg = segsNow.find((s) => s.clip.id === clipId);
    if (!seg) return;
    const dur = seg.dur;
    const rect = inner.getBoundingClientRect();
    const grabOffset = (e.clientX - rect.left) / st.zoom - seg.start;
    const downX = e.clientX;
    let started = false;

    const move = (ev: MouseEvent) => {
      if (!started && Math.abs(ev.clientX - downX) < 4) return; // click ≠ drag
      started = true;
      const s = useStore.getState();
      const pointerSec = (ev.clientX - inner.getBoundingClientRect().left) / s.zoom;
      const startSec = Math.max(0, pointerSec - grabOffset);
      setDragGhost({ id: clipId, startSec });
      // 片段中心落在哪兩個鄰居之間，就插到哪個位置（磁性時間軸）
      const center = startSec + dur / 2;
      const others = s.clips.filter((c) => c.id !== clipId);
      let cum = 0;
      let target = others.length;
      for (let i = 0; i < others.length; i++) {
        const od = others[i].out - others[i].in;
        if (center < cum + od / 2) {
          target = i;
          break;
        }
        cum += od;
      }
      const current = s.clips.findIndex((c) => c.id === clipId);
      if (target !== current) s.moveClip(clipId, target);
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      setDragGhost(null);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  }

  function beginClipTrim(e: React.MouseEvent, clipId: string, side: "in" | "out") {
    e.preventDefault();
    e.stopPropagation();
    const st = useStore.getState();
    const clip = st.clips.find((c) => c.id === clipId);
    if (!clip) return;
    const asset = st.assets.find((a) => a.id === clip.assetId);
    const maxOut = asset ? asset.duration : clip.out;
    const orig = { in: clip.in, out: clip.out };
    st.select({ kind: "clip", id: clipId });
    dragHorizontal(e, st.zoom, (dx) => {
      const s = useStore.getState();
      if (side === "in") {
        s.updateClip(clipId, {
          in: Math.max(0, Math.min(orig.in + dx, orig.out - 0.1)),
        });
      } else {
        s.updateClip(clipId, {
          out: Math.max(orig.in + 0.1, Math.min(orig.out + dx, maxOut)),
        });
      }
    });
  }

  function beginTextTrim(e: React.MouseEvent, id: string, side: "start" | "end") {
    e.preventDefault();
    e.stopPropagation();
    const st = useStore.getState();
    const t = st.texts.find((x) => x.id === id);
    if (!t) return;
    const orig = { start: t.start, end: t.end };
    st.select({ kind: "text", id });
    dragHorizontal(e, st.zoom, (dx) => {
      const s = useStore.getState();
      if (side === "start") {
        s.updateText(id, {
          start: Math.max(0, Math.min(orig.start + dx, orig.end - 0.2)),
        });
      } else {
        s.updateText(id, { end: Math.max(orig.start + 0.2, orig.end + dx) });
      }
    });
  }

  async function importSubtitles() {
    const picked = await open({
      multiple: false,
      filters: [{ name: "字幕檔", extensions: ["srt", "vtt"] }],
    });
    if (!picked || Array.isArray(picked)) return;
    try {
      const content = await invoke<string>("read_project_file", { path: picked });
      const cues = parseSubtitles(content);
      if (cues.length === 0) {
        alert("沒有解析到任何字幕，請確認是 UTF-8 編碼的 SRT 或 VTT 檔。");
        return;
      }
      importTexts(cues);
    } catch (err) {
      alert(`無法讀取字幕檔：${err}\n（檔案需為 UTF-8 編碼）`);
    }
  }

  async function addMusic() {
    const picked = await open({
      multiple: false,
      filters: [
        { name: "音訊檔案", extensions: ["mp3", "m4a", "aac", "wav", "flac", "ogg"] },
      ],
    });
    if (!picked || Array.isArray(picked)) return;
    try {
      const info = await invoke<{ duration: number }>("probe_media", { path: picked });
      setMusic({
        path: picked,
        url: convertFileSrc(picked),
        name: picked.split("/").pop()?.split("\\").pop() ?? picked,
        duration: info.duration,
        volume: 0.6,
      });
    } catch (err) {
      alert(`無法讀取音樂檔：${err}`);
    }
  }

  // pick a ruler tick interval that keeps labels ~70px apart
  const tickStep = [0.5, 1, 2, 5, 10, 30, 60].find((s) => s * zoom >= 70) ?? 60;
  const tickCount = Math.ceil(contentSec / tickStep) + 1;

  return (
    <div className="timeline">
      <div className="tl-toolbar">
        <button onClick={() => setPlaying(!playing)} title="播放/暫停（空白鍵）">
          {playing ? "⏸" : "▶"}
        </button>
        <span className="tl-time">
          {formatTime(playhead)} / {formatTime(total)}
        </span>
        <span className="tl-sep" />
        <button onClick={splitAtPlayhead} title="在播放點分割選取的片段（S）">
          ✂ 分割
        </button>
        <button onClick={addText} title="在播放點加入字幕">
          T 加字幕
        </button>
        <button onClick={importSubtitles} title="匯入 SRT / VTT 字幕檔">
          📄 匯入字幕
        </button>
        <button onClick={deleteSelection} title="刪除選取項目（Delete）">
          🗑 刪除
        </button>
        <span className="tl-sep" />
        <button onClick={() => setZoom(zoom / 1.4)} title="縮小時間軸">
          −
        </button>
        <button onClick={() => setZoom(zoom * 1.4)} title="放大時間軸">
          ＋
        </button>
        <span className="tl-hint">空白鍵播放 · S 分割 · Delete 刪除</span>
      </div>

      <div className="tl-scroll">
        <div
          className="tl-inner"
          ref={innerRef}
          style={{ width: contentSec * zoom }}
        >
          <div className="ruler" onMouseDown={onScrub}>
            {Array.from({ length: tickCount }, (_, i) => (
              <div className="tick" key={i} style={{ left: i * tickStep * zoom }}>
                {formatTime(i * tickStep)}
              </div>
            ))}
          </div>

          <div className="tl-track video-track" onMouseDown={onScrub}>
            {segs.map((seg) => {
              const c = seg.clip;
              const asset = assets.find((a) => a.id === c.assetId);
              const selected = selection?.kind === "clip" && selection.id === c.id;
              const dragging = dragGhost?.id === c.id;
              const left = (dragging ? dragGhost.startSec : seg.start) * zoom;
              return (
                <div
                  key={c.id}
                  className={`clip ${selected ? "selected" : ""} ${dragging ? "dragging" : ""}`}
                  style={{ left, width: Math.max(seg.dur * zoom, 10) }}
                  onMouseDown={(e) => beginClipDrag(e, c.id)}
                >
                  <div
                    className="trim-handle left"
                    onMouseDown={(e) => beginClipTrim(e, c.id, "in")}
                  />
                  <span className="clip-label">
                    {asset?.name ?? "?"} · {formatTime(seg.dur)}
                  </span>
                  <div
                    className="trim-handle right"
                    onMouseDown={(e) => beginClipTrim(e, c.id, "out")}
                  />
                </div>
              );
            })}
            {clips.length === 0 && (
              <span className="track-hint">影片軌：從素材庫加入片段</span>
            )}
          </div>

          <div className="tl-track text-track">
            {texts.map((t) => {
              const selected = selection?.kind === "text" && selection.id === t.id;
              return (
                <div
                  key={t.id}
                  className={`text-block ${selected ? "selected" : ""}`}
                  style={{
                    left: t.start * zoom,
                    width: Math.max((t.end - t.start) * zoom, 10),
                  }}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    select({ kind: "text", id: t.id });
                    const orig = { start: t.start, end: t.end };
                    dragHorizontal(e, useStore.getState().zoom, (dx) => {
                      const len = orig.end - orig.start;
                      const ns = Math.max(0, orig.start + dx);
                      useStore.getState().updateText(t.id, { start: ns, end: ns + len });
                    });
                  }}
                >
                  <div
                    className="trim-handle left"
                    onMouseDown={(e) => beginTextTrim(e, t.id, "start")}
                  />
                  <span className="clip-label">T {t.text}</span>
                  <div
                    className="trim-handle right"
                    onMouseDown={(e) => beginTextTrim(e, t.id, "end")}
                  />
                </div>
              );
            })}
            {texts.length === 0 && <span className="track-hint">字幕軌</span>}
          </div>

          <div className="tl-track music-track">
            {music ? (
              <div
                className={`music-block ${selection?.kind === "music" ? "selected" : ""}`}
                style={{ left: 0, width: Math.max(music.duration * zoom, 10) }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  select({ kind: "music", id: "music" });
                }}
              >
                <span className="clip-label">♪ {music.name}</span>
              </div>
            ) : (
              <button className="mini track-add" onClick={addMusic}>
                ＋ 加入背景音樂
              </button>
            )}
          </div>

          <div className="playhead" style={{ left: playhead * zoom }} />
        </div>
      </div>
    </div>
  );
}
