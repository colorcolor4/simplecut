import type { Clip, MediaAsset, Music, TextOverlay } from "./types";

// fontSize in TextOverlay is defined against a 1920-wide canvas; both the
// preview and the export scale from this baseline so they stay consistent.
export const BASE_W = 1920;

const AFMT = "aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo";

export function defaultFontFile(): string {
  const ua = navigator.userAgent;
  if (ua.includes("Mac")) return "/System/Library/Fonts/PingFang.ttc";
  if (ua.includes("Win")) return "C:/Windows/Fonts/msyh.ttc";
  return "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc";
}

const f = (n: number) => (Math.round(n * 1000) / 1000).toString();

export interface ExportOptions {
  clips: Clip[];
  assets: MediaAsset[];
  texts: TextOverlay[];
  music: Music | null;
  /** overlay id -> temp file path containing the text (written by the Rust side) */
  textFiles: Map<string, string>;
  width: number;
  height: number;
  fps: number;
  outPath: string;
}

export function buildExportArgs(o: ExportOptions): string[] {
  const { clips, assets, width: W, height: H, fps } = o;
  const assetOf = (id: string) => assets.find((a) => a.id === id)!;

  const args: string[] = ["-y"];
  for (const c of clips) {
    args.push("-ss", f(c.in), "-t", f(c.out - c.in), "-i", assetOf(c.assetId).path);
  }
  const musicIdx = clips.length;
  if (o.music) args.push("-i", o.music.path);

  const parts: string[] = [];
  clips.forEach((c, i) => {
    parts.push(
      `[${i}:v]scale=${W}:${H}:force_original_aspect_ratio=decrease,` +
        `pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${fps}[v${i}]`
    );
    if (assetOf(c.assetId).hasAudio) {
      parts.push(`[${i}:a]volume=${f(c.volume)},${AFMT}[a${i}]`);
    } else {
      parts.push(
        `anullsrc=channel_layout=stereo:sample_rate=44100,` +
          `atrim=duration=${f(c.out - c.in)},${AFMT}[a${i}]`
      );
    }
  });

  const pairs = clips.map((_, i) => `[v${i}][a${i}]`).join("");
  parts.push(`${pairs}concat=n=${clips.length}:v=1:a=1[vcat][acat]`);

  let vout = "vcat";
  if (o.texts.length > 0) {
    const font = defaultFontFile();
    const chain = o.texts
      .map((t) => {
        const file = o.textFiles.get(t.id)!;
        const fs = Math.max(8, Math.round((t.fontSize * W) / BASE_W));
        const color = t.color.replace("#", "0x");
        const border = Math.max(2, Math.round(fs / 16));
        return (
          `drawtext=fontfile='${font}':textfile='${file}':fontsize=${fs}` +
          `:fontcolor=${color}:borderw=${border}:bordercolor=black@0.7` +
          `:x=w*${f(t.x)}-text_w/2:y=h*${f(t.y)}-text_h/2` +
          `:enable='between(t,${f(t.start)},${f(t.end)})'`
        );
      })
      .join(",");
    parts.push(`[vcat]${chain}[vtxt]`);
    vout = "vtxt";
  }

  let aout = "acat";
  if (o.music) {
    parts.push(`[${musicIdx}:a]volume=${f(o.music.volume)},${AFMT}[mus]`);
    parts.push(
      `[acat][mus]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[amix]`
    );
    aout = "amix";
  }

  args.push(
    "-filter_complex",
    parts.join(";"),
    "-map",
    `[${vout}]`,
    "-map",
    `[${aout}]`,
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "18",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-movflags",
    "+faststart",
    "-progress",
    "pipe:1",
    "-nostats",
    o.outPath
  );
  return args;
}
