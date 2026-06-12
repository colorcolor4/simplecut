import { useEffect, useMemo, useRef, useState } from "react";
import { BASE_W } from "../ffmpeg";
import {
  computeSegments,
  segmentAt,
  totalDuration,
  useStore,
  type Segment,
} from "../store";

export default function Preview() {
  const clips = useStore((s) => s.clips);
  const texts = useStore((s) => s.texts);
  const music = useStore((s) => s.music);
  const playhead = useStore((s) => s.playhead);
  const playing = useStore((s) => s.playing);

  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const curAssetRef = useRef<string | null>(null);
  const pendingSeekRef = useRef<number | null>(null);
  const segIdxRef = useRef(0);
  const [stage, setStage] = useState({ w: 640, h: 360 });

  const segs = useMemo(() => computeSegments(clips), [clips]);

  // fit a 16:9 stage inside the available space
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const pw = el.clientWidth - 16;
      const ph = el.clientHeight - 16;
      const w = Math.max(160, Math.min(pw, (ph * 16) / 9));
      setStage({ w, h: (w * 9) / 16 });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  function loadSegment(seg: Segment, t: number) {
    const v = videoRef.current;
    if (!v) return;
    const asset = useStore.getState().assets.find((a) => a.id === seg.clip.assetId);
    if (!asset) return;
    const target = seg.clip.in + (t - seg.start);
    v.volume = Math.min(1, Math.max(0, seg.clip.volume));
    if (curAssetRef.current !== asset.id) {
      curAssetRef.current = asset.id;
      pendingSeekRef.current = target;
      v.src = asset.url;
    } else if (Math.abs(v.currentTime - target) > 0.06) {
      v.currentTime = target;
    }
  }

  // seek while paused
  useEffect(() => {
    if (playing || segs.length === 0) return;
    let idx = segmentAt(segs, playhead);
    if (idx < 0) idx = playhead >= totalDuration(clips) - 1e-6 ? segs.length - 1 : 0;
    const seg = segs[idx];
    segIdxRef.current = idx;
    loadSegment(seg, Math.min(Math.max(playhead, seg.start), seg.start + seg.dur));
    const a = audioRef.current;
    if (a && music && Math.abs(a.currentTime - playhead) > 0.1) {
      a.currentTime = Math.min(playhead, music.duration);
    }
  }, [playhead, playing, segs, music]);

  // clear the video element when the timeline empties
  useEffect(() => {
    if (clips.length === 0 && videoRef.current) {
      videoRef.current.removeAttribute("src");
      videoRef.current.load();
      curAssetRef.current = null;
    }
  }, [clips.length]);

  // playback engine
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (!playing) {
      v.pause();
      audioRef.current?.pause();
      return;
    }
    const st = useStore.getState();
    const segsNow = computeSegments(st.clips);
    if (segsNow.length === 0) {
      st.setPlaying(false);
      return;
    }
    const total = totalDuration(st.clips);
    let t = st.playhead;
    if (t >= total - 0.05) {
      t = 0;
      st.setPlayhead(0);
    }
    let idx = segmentAt(segsNow, t);
    if (idx < 0) idx = 0;
    segIdxRef.current = idx;
    loadSegment(segsNow[idx], Math.max(t, segsNow[idx].start));
    v.play().catch(() => {});
    const au = audioRef.current;
    if (au && st.music) {
      au.currentTime = Math.min(t, st.music.duration);
      au.play().catch(() => {});
    }

    let raf = 0;
    const tick = () => {
      const s = useStore.getState();
      const list = computeSegments(s.clips);
      const seg = list[segIdxRef.current];
      if (!seg) {
        s.setPlaying(false);
        return;
      }
      if (pendingSeekRef.current === null) {
        if (v.currentTime >= seg.clip.out - 0.04 || v.ended) {
          if (segIdxRef.current + 1 < list.length) {
            segIdxRef.current += 1;
            const nx = list[segIdxRef.current];
            loadSegment(nx, nx.start);
            v.play().catch(() => {});
            s.setPlayhead(nx.start);
          } else {
            s.setPlayhead(seg.start + seg.dur);
            s.setPlaying(false);
            return;
          }
        } else {
          const gt = seg.start + (v.currentTime - seg.clip.in);
          s.setPlayhead(Math.max(0, Math.min(gt, seg.start + seg.dur)));
        }
      }
      const a = audioRef.current;
      if (a && s.music) {
        a.volume = Math.min(1, Math.max(0, s.music.volume));
        const now = useStore.getState().playhead;
        if (now < s.music.duration) {
          if (a.paused) a.play().catch(() => {});
          if (Math.abs(a.currentTime - now) > 0.3) a.currentTime = now;
        } else if (!a.paused) {
          a.pause();
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const fontScale = stage.w / BASE_W;
  const visibleTexts = texts.filter((t) => playhead >= t.start && playhead < t.end);

  return (
    <div className="preview" ref={wrapRef}>
      <div className="preview-stage" style={{ width: stage.w, height: stage.h }}>
        <video
          ref={videoRef}
          playsInline
          onLoadedMetadata={() => {
            const v = videoRef.current;
            if (v && pendingSeekRef.current !== null) {
              v.currentTime = pendingSeekRef.current;
              pendingSeekRef.current = null;
            }
          }}
        />
        {visibleTexts.map((t) => (
          <div
            key={t.id}
            className="overlay-text"
            style={{
              left: `${t.x * 100}%`,
              top: `${t.y * 100}%`,
              fontSize: Math.max(6, t.fontSize * fontScale),
              color: t.color,
            }}
          >
            {t.text}
          </div>
        ))}
        {clips.length === 0 && (
          <div className="preview-empty">
            從左側匯入素材，雙擊或按「＋」加入時間軸
          </div>
        )}
      </div>
      {music && <audio ref={audioRef} src={music.url} preload="auto" />}
    </div>
  );
}
