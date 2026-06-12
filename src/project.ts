import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { useStore } from "./store";
import type { Clip, MediaAsset, Music, TextOverlay } from "./types";

const VERSION = 1;

// project files store source paths, not media — url is rebuilt on load
type StoredAsset = Omit<MediaAsset, "url">;
type StoredMusic = Omit<Music, "url">;

interface ProjectFile {
  app: "simplecut";
  version: number;
  assets: StoredAsset[];
  clips: Clip[];
  texts: TextOverlay[];
  music: StoredMusic | null;
}

export async function saveProject(saveAs = false): Promise<boolean> {
  const st = useStore.getState();
  let path = st.projectPath;
  if (!path || saveAs) {
    const picked = await save({
      defaultPath: "未命名專案.scut.json",
      filters: [{ name: "SimpleCut 專案", extensions: ["json"] }],
    });
    if (!picked) return false;
    path = picked;
  }
  const data: ProjectFile = {
    app: "simplecut",
    version: VERSION,
    assets: st.assets.map(({ url: _url, ...rest }) => rest),
    clips: st.clips,
    texts: st.texts,
    music: st.music
      ? (({ url: _url, ...rest }) => rest)(st.music)
      : null,
  };
  await invoke("save_project_file", {
    path,
    content: JSON.stringify(data, null, 2),
  });
  st.setProjectPath(path);
  return true;
}

export async function openProject(): Promise<void> {
  const picked = await open({
    multiple: false,
    filters: [{ name: "SimpleCut 專案", extensions: ["json"] }],
  });
  if (!picked || Array.isArray(picked)) return;

  const raw = await invoke<string>("read_project_file", { path: picked });
  const data = JSON.parse(raw) as ProjectFile;
  if (data.app !== "simplecut" || data.version !== VERSION) {
    throw new Error("不是有效的 SimpleCut 專案檔");
  }

  const allPaths = [
    ...data.assets.map((a) => a.path),
    ...(data.music ? [data.music.path] : []),
  ];
  const exists = await invoke<boolean[]>("paths_exist", { paths: allPaths });
  const missing = allPaths.filter((_, i) => !exists[i]);
  if (missing.length > 0) {
    alert(
      `以下素材檔找不到（可能已被移動或刪除），相關片段會無法預覽與匯出：\n\n${missing.join("\n")}`
    );
  }

  useStore.getState().loadProject(
    {
      assets: data.assets.map((a) => ({ ...a, url: convertFileSrc(a.path) })),
      clips: data.clips,
      texts: data.texts,
      music: data.music
        ? { ...data.music, url: convertFileSrc(data.music.path) }
        : null,
    },
    picked
  );
}
