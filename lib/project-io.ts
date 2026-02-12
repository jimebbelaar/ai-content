import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data", "projects");

export interface ProjectMeta {
  id: string;
  createdAt: string;
  updatedAt: string;
  concept: string;
  aspectRatio: string;
  sceneCount: number;
  voiceModelId?: string;
  voiceId: string;
  voiceSettings: Record<string, number | boolean>;
  scenes: Record<string, unknown>[];
  imageApprovals: Record<number, boolean>;
  videoApprovals: Record<number, boolean>;
  volumes: { voiceover: number; music: number };
  currentStep: number;
  hasVoiceover: boolean;
  wordTimestamps: { word: string; start: number; end: number }[];
  backgroundMusicName: string | null;
  hasFinalVideo: boolean;
  audioMode?: string;
  subtitlesDuration?: number;
  selectedStyleId?: string;
  animationProvider?: string;
  subtitleStyle?: {
    fontFamily: string;
    fontWeight: string;
    fontSize: number;
    color: string;
    strokeEnabled: boolean;
    strokeColor: string;
    strokeWidth: number;
    shadowEnabled: boolean;
    shadowBlur: number;
    shadowColor: string;
  };
}

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export function getProjectDir(id: string) {
  return path.join(DATA_DIR, id);
}

export function getAssetsDir(id: string) {
  return path.join(DATA_DIR, id, "assets");
}

export function createProject(concept: string, settings: Partial<ProjectMeta>): ProjectMeta {
  const id = `${Date.now()}-${slugify(concept)}`;
  const dir = getProjectDir(id);
  ensureDir(dir);
  ensureDir(path.join(dir, "assets"));

  const meta: ProjectMeta = {
    id,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    concept,
    aspectRatio: (settings.aspectRatio as string) || "9:16",
    sceneCount: (settings.sceneCount as number) || 6,
    voiceId: (settings.voiceId as string) || "",
    voiceSettings: (settings.voiceSettings as Record<string, number | boolean>) || {},
    scenes: [],
    imageApprovals: {},
    videoApprovals: {},
    volumes: { voiceover: 80, music: 30 },
    currentStep: 0,
    hasVoiceover: false,
    wordTimestamps: [],
    backgroundMusicName: null,
    hasFinalVideo: false,
  };

  saveProjectMeta(id, meta);
  return meta;
}

export function saveProjectMeta(id: string, meta: Partial<ProjectMeta>) {
  const dir = getProjectDir(id);
  ensureDir(dir);
  const metaPath = path.join(dir, "project.json");

  let existing: ProjectMeta | null = null;
  if (fs.existsSync(metaPath)) {
    existing = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
  }

  const merged = { ...existing, ...meta, updatedAt: new Date().toISOString() };
  fs.writeFileSync(metaPath, JSON.stringify(merged, null, 2));
  return merged;
}

export function loadProjectMeta(id: string): ProjectMeta | null {
  const metaPath = path.join(getProjectDir(id), "project.json");
  if (!fs.existsSync(metaPath)) return null;
  return JSON.parse(fs.readFileSync(metaPath, "utf-8"));
}

export function listProjects(): ProjectMeta[] {
  ensureDir(DATA_DIR);
  const dirs = fs.readdirSync(DATA_DIR).filter((d) => {
    const metaPath = path.join(DATA_DIR, d, "project.json");
    return fs.existsSync(metaPath);
  });

  return dirs
    .map((d) => loadProjectMeta(d)!)
    .filter(Boolean)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

export function saveAsset(projectId: string, filename: string, base64Data: string) {
  const assetsDir = getAssetsDir(projectId);
  ensureDir(assetsDir);
  const filePath = path.join(assetsDir, filename);
  fs.writeFileSync(filePath, Buffer.from(base64Data, "base64"));
  return filePath;
}

export function loadAsset(projectId: string, filename: string): Buffer | null {
  const filePath = path.join(getAssetsDir(projectId), filename);
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath);
}

export function listAssets(projectId: string): string[] {
  const assetsDir = getAssetsDir(projectId);
  if (!fs.existsSync(assetsDir)) return [];
  return fs.readdirSync(assetsDir);
}

export function deleteProject(id: string) {
  const dir = getProjectDir(id);
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}
