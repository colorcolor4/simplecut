# SimpleCut — 開發指南

極簡無訂閱的桌面剪輯工具（CapCut 替代品）。Tauri 2 + React 19 + TypeScript + zustand，影音處理全部交給系統的 ffmpeg。

## 常用指令

```bash
npm run tauri dev      # 開發模式（前端熱更新；改 src-tauri 會自動重編重啟）
npm run tauri build    # 打包正式版（產出在 src-tauri/target/release/bundle/）
npx tsc --noEmit       # 前端型別檢查
cargo check            # Rust 檢查（在 src-tauri/ 內跑，需先 source ~/.cargo/env）
```

發版：`git tag vX.Y.Z && git push origin vX.Y.Z` → GitHub Actions 自動打包 macOS（ARM+Intel）+ Windows 並建草稿 Release（repo: colorcolor4/simplecut）。

## 架構

**Rust 端**（`src-tauri/src/lib.rs`，刻意薄）：
- `probe_media` — ffprobe 讀素材時長/解析度/有無音訊
- `export_video` — 跑 ffmpeg，stdout 用 `-progress pipe:1` 解析進度發 `export-progress` 事件
- `write_text_file` — 字幕內容寫暫存檔（drawtext 用 `textfile=` 避開跳脫地獄）
- `save_project_file` / `read_project_file` / `paths_exist` — 專案存讀
- `find_tool()` — macOS GUI app 不繼承 shell PATH，先找 /opt/homebrew/bin 等再 fallback

**前端**（`src/`）：
- `store.ts` — zustand 單一 store；`computeSegments()` 把 clips 陣列換算成時間軸位置（clip 順序＝陣列順序，無 gap）
- `ffmpeg.ts` — `buildExportArgs()` 組完整 ffmpeg 指令：每片段 `-ss/-t` 輸入 → scale+pad → concat → drawtext 字幕鏈 → amix 混背景音樂
- `project.ts` — 專案檔序列化（.json，存素材**路徑**不存媒體；載入時 `paths_exist` 檢查遺失）
- `components/Preview.tsx` — 播放引擎：單一 `<video>` 元素 + rAF 迴圈，到 clip 尾端換 src 跳下一段；音樂用獨立 `<audio>` 同步（偏差 >0.3s 才校正）
- `components/Timeline.tsx` — 三軌（影片/字幕/音樂）；HTML5 DnD 排序、mousedown+mousemove 修剪把手

## 關鍵約束（改動前先讀）

- **`time` crate 鎖在 0.3.47**（Cargo.lock）：0.3.48 與 cookie 0.18 有 E0119 trait 衝突，編不過。**不要隨便 `cargo update`**；要更新先單獨測 time
- **ffmpeg 是外部依賴**：使用者要自己裝（brew/winget）。不要嘗試打包 ffmpeg 進 app（授權與體積考量，目前定位就是依賴系統的）
- 字幕 `fontSize` 的基準是 **1920 寬畫布**，預覽和匯出都從這個基準縮放，兩邊才一致；位置 x/y 是 0~1 中心錨點（ffmpeg 端用 `x=w*X-text_w/2`）
- 字幕字體寫死平台預設（`ffmpeg.ts` 的 `defaultFontFile()`）：mac=PingFang、win=微軟雅黑、linux=Noto CJK
- 預覽用 Tauri **asset protocol**（`tauri.conf.json` 的 `assetProtocol.scope: ["**"]`）+ `convertFileSrc()`，動到安全設定時別關掉
- 匯出固定 30fps、H.264/AAC；amix 要 `normalize=0` 不然音量會減半

## 已知問題 / 未做

- 預覽在片段切換瞬間有極短停頓（換 video src），匯出不受影響；要解需要雙 video 元素預載
- 無轉場、無關鍵幀、單一影片軌、音樂只有一條且從 0 秒開始
- 專案檔存絕對路徑，素材搬家就斷（載入時會列出遺失清單）
- 無 undo/redo

## 下一步候選（與使用者討論過的優先序）

1. 轉場（先做淡入淡出，ffmpeg 用 xfade）
2. 時間軸片段縮圖（ffmpeg 抽幀）
3. 預覽畫面上直接拖曳字幕位置
4. undo/redo
