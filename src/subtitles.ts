// SRT / WebVTT 解析：只取時間與文字，樣式標籤一律剝掉

export interface SubtitleCue {
  start: number;
  end: number;
  text: string;
}

// 時碼接受 HH:MM:SS,mmm（SRT）、HH:MM:SS.mmm 與 MM:SS.mmm（VTT）
const TIME = /(?:(\d{1,2}):)?(\d{1,2}):(\d{2})[,.](\d{1,3})/;

function parseTime(s: string): number | null {
  const m = TIME.exec(s);
  if (!m) return null;
  const h = m[1] ? parseInt(m[1], 10) : 0;
  const min = parseInt(m[2], 10);
  const sec = parseInt(m[3], 10);
  const ms = parseInt(m[4].padEnd(3, "0"), 10);
  return h * 3600 + min * 60 + sec + ms / 1000;
}

export function parseSubtitles(content: string): SubtitleCue[] {
  const lines = content.replace(/^﻿/, "").replace(/\r/g, "").split("\n");
  const cues: SubtitleCue[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.includes("-->")) {
      const [a, b] = line.split("-->");
      const start = parseTime(a);
      const end = parseTime(b);
      i++;
      const textLines: string[] = [];
      while (i < lines.length && lines[i].trim() !== "") {
        textLines.push(lines[i].replace(/<[^>]+>/g, "").trim());
        i++;
      }
      const text = textLines.join("\n").trim();
      if (start !== null && end !== null && end > start && text) {
        cues.push({ start, end, text });
      }
    } else {
      i++;
    }
  }
  return cues;
}
