import { useEffect, useState } from "react";
import "./App.css";
import ExportDialog from "./components/ExportDialog";
import Inspector from "./components/Inspector";
import MediaBin from "./components/MediaBin";
import Preview from "./components/Preview";
import SettingsDialog from "./components/SettingsDialog";
import Timeline from "./components/Timeline";
import { openProject, saveProject } from "./project";
import { useStore } from "./store";

const baseName = (p: string) => p.split("/").pop()?.split("\\").pop() ?? p;

function App() {
  const [showExport, setShowExport] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const projectPath = useStore((s) => s.projectPath);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "s" || e.key === "S")) {
        e.preventDefault();
        saveProject(e.shiftKey).catch((err) => alert(`儲存失敗：${err}`));
        return;
      }
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const st = useStore.getState();
      if (e.code === "Space") {
        e.preventDefault();
        st.setPlaying(!st.playing);
      } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        st.deleteSelection();
      } else if (e.key === "s" || e.key === "S") {
        st.splitAtPlayhead();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-left">
          <div className="brand">SimpleCut</div>
          {projectPath && (
            <span className="proj-name" title={projectPath}>
              {baseName(projectPath)}
            </span>
          )}
        </div>
        <div className="topbar-actions">
          <button onClick={() => openProject().catch((err) => alert(`開啟失敗：${err}`))}>
            開啟專案
          </button>
          <button
            onClick={() => saveProject().catch((err) => alert(`儲存失敗：${err}`))}
            title="儲存專案（⌘S，⌘⇧S 另存新檔）"
          >
            儲存專案
          </button>
          <button className="primary" onClick={() => setShowExport(true)}>
            匯出影片
          </button>
          <button onClick={() => setShowSettings(true)} title="設定">
            ⚙
          </button>
        </div>
      </header>
      <div className="main">
        <MediaBin />
        <Preview />
        <Inspector />
      </div>
      <Timeline />
      {showExport && <ExportDialog onClose={() => setShowExport(false)} />}
      {showSettings && <SettingsDialog onClose={() => setShowSettings(false)} />}
    </div>
  );
}

export default App;
