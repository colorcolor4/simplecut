# SimpleCut

一個極簡、無訂閱、不偷裝東西的桌面剪輯工具。Tauri 2 + React + ffmpeg。

## 功能

- **影片軌**：匯入素材 → 加入時間軸 → 拖拉排序、邊緣修剪、播放點分割
- **字幕軌**：文字疊加，可調字體大小、顏色、位置、出現時間
- **音樂軌**：一條背景音樂，可調音量與原聲平衡
- **即時預覽**：HTML5 播放，不需先渲染
- **匯出**：H.264/AAC MP4（1080p / 720p），交給本機 ffmpeg

## 快捷鍵

| 鍵 | 功能 |
|---|---|
| 空白鍵 | 播放 / 暫停 |
| S | 在播放點分割選取片段 |
| Delete / Backspace | 刪除選取項目 |

## 需求

- [ffmpeg](https://ffmpeg.org)（`brew install ffmpeg`）— 匯出與素材探測都靠它
- Node.js 18+、Rust（開發用）

## 開發

```bash
npm install
npm run tauri dev
```

## 打包

```bash
npm run tauri build
```

產出在 `src-tauri/target/release/bundle/`。

## 已知限制（v0.1）

- 字幕匯出字型：macOS 用 PingFang、Windows 用微軟雅黑、Linux 用 Noto CJK；若系統缺字型需修改 `src/ffmpeg.ts` 的 `defaultFontFile()`
- 片段切換時預覽可能有極短停頓（換 src），匯出結果不受影響
- 尚無轉場、關鍵幀、多影片軌
