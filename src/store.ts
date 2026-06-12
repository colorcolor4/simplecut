import { create } from "zustand";
import type { Clip, MediaAsset, Music, Selection, TextOverlay } from "./types";

let counter = 0;
export const uid = () => `${Date.now().toString(36)}-${counter++}`;

export interface Segment {
  clip: Clip;
  start: number; // timeline start (seconds)
  dur: number;
}

export function computeSegments(clips: Clip[]): Segment[] {
  let t = 0;
  return clips.map((clip) => {
    const dur = clip.out - clip.in;
    const seg = { clip, start: t, dur };
    t += dur;
    return seg;
  });
}

export function totalDuration(clips: Clip[]): number {
  return clips.reduce((s, c) => s + (c.out - c.in), 0);
}

export function segmentAt(segs: Segment[], t: number): number {
  for (let i = 0; i < segs.length; i++) {
    if (t >= segs[i].start && t < segs[i].start + segs[i].dur) return i;
  }
  return -1;
}

export function formatTime(t: number): string {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, "0")}`;
}

const MIN_CLIP = 0.1;

export interface ProjectData {
  assets: MediaAsset[];
  clips: Clip[];
  texts: TextOverlay[];
  music: Music | null;
}

interface State {
  assets: MediaAsset[];
  clips: Clip[];
  texts: TextOverlay[];
  music: Music | null;
  selection: Selection;
  playhead: number;
  playing: boolean;
  zoom: number; // px per second
  projectPath: string | null;

  addAsset: (a: MediaAsset) => void;
  addClip: (assetId: string) => void;
  updateClip: (id: string, patch: Partial<Clip>) => void;
  removeClip: (id: string) => void;
  moveClip: (id: string, toIndex: number) => void;
  splitAtPlayhead: () => void;
  addText: () => void;
  importTexts: (cues: { start: number; end: number; text: string }[]) => void;
  updateText: (id: string, patch: Partial<TextOverlay>) => void;
  removeText: (id: string) => void;
  setMusic: (m: Music | null) => void;
  updateMusic: (patch: Partial<Music>) => void;
  select: (s: Selection) => void;
  deleteSelection: () => void;
  setPlayhead: (t: number) => void;
  setPlaying: (p: boolean) => void;
  setZoom: (z: number) => void;
  setProjectPath: (p: string | null) => void;
  loadProject: (data: ProjectData, path: string) => void;
}

export const useStore = create<State>((set, get) => ({
  assets: [],
  clips: [],
  texts: [],
  music: null,
  selection: null,
  playhead: 0,
  playing: false,
  zoom: 40,
  projectPath: null,

  addAsset: (a) => set((s) => ({ assets: [...s.assets, a] })),

  addClip: (assetId) => {
    const asset = get().assets.find((a) => a.id === assetId);
    if (!asset || !asset.hasVideo) return;
    const clip: Clip = {
      id: uid(),
      assetId,
      in: 0,
      out: asset.duration,
      volume: 1,
    };
    set((s) => ({ clips: [...s.clips, clip], selection: { kind: "clip", id: clip.id } }));
  },

  updateClip: (id, patch) =>
    set((s) => ({
      clips: s.clips.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    })),

  removeClip: (id) =>
    set((s) => ({
      clips: s.clips.filter((c) => c.id !== id),
      selection: s.selection?.id === id ? null : s.selection,
    })),

  moveClip: (id, toIndex) =>
    set((s) => {
      const from = s.clips.findIndex((c) => c.id === id);
      if (from < 0) return s;
      const clips = [...s.clips];
      const [moved] = clips.splice(from, 1);
      clips.splice(Math.max(0, Math.min(toIndex, clips.length)), 0, moved);
      return { clips };
    }),

  splitAtPlayhead: () => {
    const { clips, playhead } = get();
    const segs = computeSegments(clips);
    const i = segmentAt(segs, playhead);
    if (i < 0) return;
    const seg = segs[i];
    const off = playhead - seg.start;
    if (off < MIN_CLIP || seg.dur - off < MIN_CLIP) return;
    const c = seg.clip;
    const left: Clip = { ...c, id: uid(), out: c.in + off };
    const right: Clip = { ...c, id: uid(), in: c.in + off };
    const next = [...clips];
    next.splice(i, 1, left, right);
    set({ clips: next, selection: { kind: "clip", id: right.id } });
  },

  addText: () => {
    const { playhead, clips } = get();
    const total = totalDuration(clips);
    const start = Math.max(0, Math.min(playhead, Math.max(total - 0.5, 0)));
    const t: TextOverlay = {
      id: uid(),
      text: "雙擊右側面板編輯文字",
      start,
      end: start + 3,
      x: 0.5,
      y: 0.85,
      fontSize: 72,
      color: "#ffffff",
    };
    set((s) => ({ texts: [...s.texts, t], selection: { kind: "text", id: t.id } }));
  },

  importTexts: (cues) =>
    set((s) => ({
      texts: [
        ...s.texts,
        ...cues.map((c) => ({
          id: uid(),
          text: c.text,
          start: c.start,
          end: c.end,
          x: 0.5,
          y: 0.88,
          fontSize: 56,
          color: "#ffffff",
        })),
      ],
    })),

  updateText: (id, patch) =>
    set((s) => ({
      texts: s.texts.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    })),

  removeText: (id) =>
    set((s) => ({
      texts: s.texts.filter((t) => t.id !== id),
      selection: s.selection?.id === id ? null : s.selection,
    })),

  setMusic: (m) =>
    set({ music: m, selection: m ? { kind: "music", id: "music" } : null }),

  updateMusic: (patch) =>
    set((s) => (s.music ? { music: { ...s.music, ...patch } } : s)),

  select: (selection) => set({ selection }),

  deleteSelection: () => {
    const sel = get().selection;
    if (!sel) return;
    if (sel.kind === "clip") get().removeClip(sel.id);
    else if (sel.kind === "text") get().removeText(sel.id);
    else if (sel.kind === "music") set({ music: null, selection: null });
  },

  setPlayhead: (t) => set({ playhead: Math.max(0, t) }),
  setPlaying: (playing) => set({ playing }),
  setZoom: (z) => set({ zoom: Math.max(5, Math.min(200, z)) }),
  setProjectPath: (projectPath) => set({ projectPath }),

  loadProject: (data, path) =>
    set({
      assets: data.assets,
      clips: data.clips,
      texts: data.texts,
      music: data.music,
      selection: null,
      playhead: 0,
      playing: false,
      projectPath: path,
    }),
}));
