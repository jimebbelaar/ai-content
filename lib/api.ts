import type { Scene, WordTimestamp, ProjectMeta } from "./store";

// ==================== PROJECT MANAGEMENT ====================

export async function createProjectOnServer(concept: string, settings: Record<string, unknown>): Promise<ProjectMeta> {
  const res = await fetch("/api/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ concept, ...settings }) });
  if (!res.ok) throw new Error("Failed to create project");
  const data = await res.json();
  return data.project;
}

export async function listProjectsFromServer(): Promise<ProjectMeta[]> {
  const res = await fetch("/api/projects");
  if (!res.ok) throw new Error("Failed to list projects");
  const data = await res.json();
  return data.projects;
}

export async function loadProjectFromServer(id: string): Promise<ProjectMeta> {
  const res = await fetch(`/api/projects/${id}`);
  if (!res.ok) throw new Error("Failed to load project");
  const data = await res.json();
  return data.project;
}

export async function updateProjectOnServer(id: string, updates: Partial<ProjectMeta>): Promise<void> {
  const res = await fetch(`/api/projects/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(updates) });
  if (!res.ok) throw new Error("Failed to update project");
}

export async function deleteProjectOnServer(id: string): Promise<void> {
  const res = await fetch(`/api/projects/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete project");
}

export async function saveAssetToServer(projectId: string, filename: string, base64Data: string): Promise<void> {
  const res = await fetch(`/api/projects/${projectId}/assets`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ filename, base64Data }) });
  if (!res.ok) throw new Error("Failed to save asset");
}

export function getAssetUrl(projectId: string, filename: string): string {
  return `/api/projects/${projectId}/assets/${filename}`;
}

// ==================== SCRIPT GENERATION ====================

export async function generateScript(concept: string, sceneCount: number, styleId?: string, aspectRatio?: string): Promise<Scene[]> {
  const res = await fetch("/api/script", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ concept, sceneCount, styleId, aspectRatio }) });
  if (!res.ok) { const err = await res.json().catch(() => ({ error: "Unknown error" })); throw new Error(err.error || `Script generation failed: ${res.status}`); }
  return (await res.json()).scenes;
}

// ==================== IMAGE GENERATION ====================

export async function generateImage(
  prompt: string,
  referenceImageBase64?: string,
  referenceMimeType?: string
): Promise<string> {
  const body: Record<string, string | undefined> = { prompt };
  if (referenceImageBase64) {
    body.referenceImageBase64 = referenceImageBase64;
    body.referenceMimeType = referenceMimeType || "image/png";
  }
  const res = await fetch("/api/image", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) { const err = await res.json().catch(() => ({ error: "Unknown error" })); throw new Error(err.error || `Image generation failed: ${res.status}`); }
  return (await res.json()).imageBase64;
}

// ==================== ANIMATION (Veo + Kling) ====================

export type AnimationProvider = "veo" | "kling" | "kling-direct";

export async function startAnimation(imageBase64: string, mimeType: string, animationPrompt: string, aspectRatio: string, provider: AnimationProvider = "veo"): Promise<string> {
  const endpoint = provider === "kling" ? "/api/animate-kling" : "/api/animate";
  const res = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ imageBase64, mimeType, animationPrompt, aspectRatio }) });
  if (!res.ok) { const err = await res.json().catch(() => ({ error: "Unknown error" })); throw new Error(err.error || `Animation start failed: ${res.status}`); }
  return (await res.json()).operationName;
}

// Direct text-to-video (no image needed)
export async function startDirectVideo(prompt: string, aspectRatio: string, negativePrompt?: string): Promise<string> {
  const res = await fetch("/api/video-direct", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt, aspectRatio, negativePrompt }) });
  if (!res.ok) { const err = await res.json().catch(() => ({ error: "Unknown error" })); throw new Error(err.error || `Direct video start failed: ${res.status}`); }
  return (await res.json()).operationName;
}

export async function pollAnimationStatus(operationName: string): Promise<{ done: boolean; videoBase64?: string }> {
  let endpoint: string;
  if (operationName.startsWith("kling-direct:")) {
    endpoint = "/api/video-direct/status";
  } else if (operationName.startsWith("kling:")) {
    endpoint = "/api/animate-kling/status";
  } else {
    endpoint = "/api/animate/status";
  }
  const res = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operationName }) });
  if (!res.ok) { const err = await res.json().catch(() => ({ error: "Unknown error" })); throw new Error(err.error || `Poll failed: ${res.status}`); }
  return res.json();
}

export async function animateImage(imageBase64: string, mimeType: string, animationPrompt: string, aspectRatio: string, onProgress?: (status: string) => void, provider: AnimationProvider = "veo"): Promise<string> {
  const label = provider === "kling" ? "Kling" : "Veo 3.1";
  onProgress?.(`Starting ${label} animation...`);
  const operationName = await startAnimation(imageBase64, mimeType, animationPrompt, aspectRatio, provider);
  onProgress?.(`${label}: Generating video...`);
  let attempts = 0;
  while (attempts < 60) {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    attempts++;
    onProgress?.(`${label}: Generating video... (${attempts * 5}s)`);
    const status = await pollAnimationStatus(operationName);
    if (status.done && status.videoBase64) return status.videoBase64;
    if (status.done) throw new Error("Animation completed but no video was returned");
  }
  throw new Error(`${label} animation timed out after 5 minutes`);
}

// Direct text-to-video (Kling Direct mode)
export async function generateDirectVideo(prompt: string, aspectRatio: string, onProgress?: (status: string) => void, negativePrompt?: string): Promise<string> {
  onProgress?.("Kling Direct: Starting video generation...");
  const operationName = await startDirectVideo(prompt, aspectRatio, negativePrompt);
  onProgress?.("Kling Direct: Generating video...");
  let attempts = 0;
  while (attempts < 60) {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    attempts++;
    onProgress?.(`Kling Direct: Generating... (${attempts * 5}s)`);
    const status = await pollAnimationStatus(operationName);
    if (status.done && status.videoBase64) return status.videoBase64;
    if (status.done) throw new Error("Video completed but no data returned");
  }
  throw new Error("Kling Direct timed out after 5 minutes");
}

// ==================== VOICEOVER ====================

export interface SceneTiming { start: number; end: number; duration: number; }
export interface VoiceoverResult { audioBase64: string; wordTimestamps: WordTimestamp[]; sceneTimings: SceneTiming[]; }

export async function generateVoiceover(
  text: string,
  voiceId: string,
  voiceSettings: { stability: number; similarity_boost: number; style: number; use_speaker_boost: boolean },
  scenes?: { voiceover_text: string; subtitle_text: string }[],
  modelId?: string
): Promise<VoiceoverResult> {
  const res = await fetch("/api/voiceover", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, voiceId, voiceSettings, scenes, modelId }) });
  if (!res.ok) { const err = await res.json().catch(() => ({ error: "Unknown error" })); throw new Error(err.error || `Voiceover generation failed: ${res.status}`); }
  return res.json();
}

// ==================== CAPTION GENERATION ====================

export interface CaptionResult {
  caption: string;
  hashtags: string[];
}

/**
 * Generate an optimized caption for Instagram Reels / TikTok.
 * Uses Claude to create a short, keyword-rich caption with 3-5 niche hashtags.
 */
export async function generateCaption(
  concept: string,
  scenes: { voiceover_text: string }[]
): Promise<CaptionResult> {
  const res = await fetch("/api/caption", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ concept, scenes }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(err.error || `Caption generation failed: ${res.status}`);
  }
  return res.json();
}
