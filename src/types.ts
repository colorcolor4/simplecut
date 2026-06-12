export interface MediaAsset {
  id: string;
  path: string;
  url: string; // asset:// URL for in-app preview
  name: string;
  duration: number;
  width: number;
  height: number;
  hasAudio: boolean;
  hasVideo: boolean;
}

export interface CropBox {
  l: number; // fraction cut from the left edge (0..1)
  t: number;
  r: number;
  b: number;
}

export interface Clip {
  id: string;
  assetId: string;
  in: number; // trim start within the source asset (seconds)
  out: number; // trim end within the source asset (seconds)
  volume: number; // 0..1
  crop?: CropBox;
}

export interface TextOverlay {
  id: string;
  text: string;
  start: number; // timeline seconds
  end: number;
  x: number; // 0..1, center anchor
  y: number; // 0..1, center anchor
  fontSize: number; // px on a 1920-wide canvas
  color: string; // #rrggbb
}

export interface Music {
  path: string;
  url: string;
  name: string;
  duration: number;
  volume: number; // 0..1
}

export type Selection = { kind: "clip" | "text" | "music"; id: string } | null;
