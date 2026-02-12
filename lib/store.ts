"use client";

import { create } from "zustand";
import { DEFAULT_VOICE_SETTINGS, DEFAULT_VOICE_MODEL, VOICE_PRESETS } from "./prompts";
import type { VoiceModelId } from "./prompts";

export interface Scene {
  scene_number: number;
  time_range?: string;          // calculated from actual voiceover timing
  voiceover_text: string;
  image_prompt: string;
  animation_prompt: string;
  subtitle_text: string;
  color_mood?: string;          // e.g. "deep indigo with cold silver light"
  display_duration?: number;    // user-adjustable duration in seconds (overrides equal split)
  subtitle_position?: number;   // 0.0 = top, 0.5 = center, 1.0 = bottom (default 0.50)
  // Populated after voiceover generation — actual audio timing per scene
  audio_start?: number;         // seconds
  audio_end?: number;           // seconds
  audio_duration?: number;      // seconds
}

export interface SubtitleStyle {
  fontFamily: string;       // CSS font-family string
  fontWeight: string;       // "normal" | "bold"
  fontSize: number;         // fraction of video width (0.03–0.07, default 0.046)
  color: string;            // hex color, default "#ffffff"
  strokeEnabled: boolean;   // default true
  strokeColor: string;      // default "#000000"
  strokeWidth: number;      // fraction of W (0.001–0.008, default 0.003)
  shadowEnabled: boolean;   // default false
  shadowBlur: number;       // 0–20 px
  shadowColor: string;      // default "rgba(0,0,0,0.8)"
}

export const DEFAULT_SUBTITLE_STYLE: SubtitleStyle = {
  fontFamily: "Georgia, 'Times New Roman', serif",
  fontWeight: "normal",
  fontSize: 0.046,
  color: "#ffffff",
  strokeEnabled: true,
  strokeColor: "#000000",
  strokeWidth: 0.003,
  shadowEnabled: false,
  shadowBlur: 8,
  shadowColor: "rgba(0,0,0,0.8)",
};

export const FONT_PRESETS = [
  { id: "georgia", label: "Georgia", family: "Georgia, 'Times New Roman', serif" },
  { id: "system", label: "System", family: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" },
  { id: "courier", label: "Courier", family: "'Courier New', Courier, monospace" },
  { id: "impact", label: "Impact", family: "Impact, 'Arial Black', sans-serif" },
] as const;

export interface WordTimestamp { word: string; start: number; end: number; }

export interface VoiceSettings {
  stability: number;
  similarity_boost: number;
  style: number;
  use_speaker_boost: boolean;
}

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
  wordTimestamps: WordTimestamp[];
  backgroundMusicName: string | null;
  hasFinalVideo: boolean;
  audioMode?: AudioMode;
  subtitlesDuration?: number;
  selectedStyleId?: string;
  animationProvider?: string;
  subtitleStyle?: SubtitleStyle;
}

export type AudioMode = "voiceover" | "subtitles-only";
export type StepId = "concept" | "script" | "voiceover" | "images" | "animation" | "assembly";

// New order: Script → Voice FIRST → then Images/Animation matched to audio timing
export const STEPS: { id: StepId; label: string; number: number }[] = [
  { id: "concept", label: "Concept", number: 1 },
  { id: "script", label: "Script", number: 2 },
  { id: "voiceover", label: "Voice", number: 3 },
  { id: "images", label: "Images", number: 4 },
  { id: "animation", label: "Animation", number: 5 },
  { id: "assembly", label: "Assembly", number: 6 },
];

interface ReelStore {
  // Project
  projectId: string | null;
  setProjectId: (id: string | null) => void;

  // Settings
  aspectRatio: "9:16" | "16:9";
  setAspectRatio: (ratio: "9:16" | "16:9") => void;
  sceneCount: number;
  setSceneCount: (count: number) => void;
  animationProvider: "veo" | "kling" | "kling-direct";
  setAnimationProvider: (p: "veo" | "kling" | "kling-direct") => void;
  audioMode: AudioMode;
  setAudioMode: (mode: AudioMode) => void;
  subtitlesDuration: number; // seconds per scene in subtitles-only mode
  setSubtitlesDuration: (d: number) => void;
  selectedStyleId: string;
  setSelectedStyleId: (id: string) => void;
  voiceModelId: VoiceModelId;
  setVoiceModelId: (id: VoiceModelId) => void;
  voiceId: string;
  setVoiceId: (id: string) => void;
  voiceSettings: VoiceSettings;
  setVoiceSettings: (settings: Partial<VoiceSettings>) => void;

  // Pipeline
  concept: string;
  setConcept: (concept: string) => void;
  scenes: Scene[];
  setScenes: (scenes: Scene[]) => void;
  updateScene: (index: number, updates: Partial<Scene>) => void;
  reorderScenes: (fromIndex: number, toIndex: number) => void;
  images: Record<number, string>;       // sceneIndex → base64 or asset URL
  setImage: (i: number, data: string) => void;
  clearImage: (i: number) => void;
  imageApprovals: Record<number, boolean>;
  approveImage: (i: number, v: boolean) => void;
  videos: Record<number, string>;
  setVideo: (i: number, data: string) => void;
  clearVideo: (i: number) => void;
  videoApprovals: Record<number, boolean>;
  approveVideo: (i: number, v: boolean) => void;
  voiceover: { audioBase64: string; wordTimestamps: WordTimestamp[] } | null;
  setVoiceover: (vo: ReelStore["voiceover"]) => void;
  backgroundMusic: { dataUrl: string; name: string } | null;
  setBackgroundMusic: (m: ReelStore["backgroundMusic"]) => void;
  volumes: { voiceover: number; music: number };
  setVolumes: (v: Partial<ReelStore["volumes"]>) => void;
  musicStartOffset: number;  // seconds — where in the VIDEO timeline music starts playing
  setMusicStartOffset: (offset: number) => void;
  musicSongStart: number;    // seconds — where in the SONG to start from (skip intro etc.)
  setMusicSongStart: (offset: number) => void;
  subtitleStyle: SubtitleStyle;
  setSubtitleStyle: (updates: Partial<SubtitleStyle>) => void;
  finalVideoUrl: string | null;
  setFinalVideoUrl: (url: string | null) => void;

  // Navigation
  currentStep: number;
  setStep: (step: number) => void;
  canProceedTo: (step: number) => boolean;

  // Loading
  loading: Record<string, boolean>;
  setLoading: (key: string, value: boolean) => void;

  // Project management
  showProjectBrowser: boolean;
  setShowProjectBrowser: (show: boolean) => void;
  loadProjectData: (meta: ProjectMeta, images: Record<number, string>, videos: Record<number, string>, voiceover: ReelStore["voiceover"], backgroundMusic: ReelStore["backgroundMusic"]) => void;
  resetPipeline: () => void;
}

const initialPipelineState = {
  projectId: null as string | null,
  concept: "",
  scenes: [] as Scene[],
  images: {} as Record<number, string>,
  imageApprovals: {} as Record<number, boolean>,
  videos: {} as Record<number, string>,
  videoApprovals: {} as Record<number, boolean>,
  voiceover: null as ReelStore["voiceover"],
  backgroundMusic: null as ReelStore["backgroundMusic"],
  volumes: { voiceover: 80, music: 30 },
  finalVideoUrl: null as string | null,
  currentStep: 0,
  loading: {} as Record<string, boolean>,
};

export const useReelStore = create<ReelStore>((set, get) => ({
  ...initialPipelineState,
  showProjectBrowser: false,
  setShowProjectBrowser: (show) => set({ showProjectBrowser: show }),

  setProjectId: (id) => {
    try { if (id) localStorage.setItem("adhd-reels-active-project", id); else localStorage.removeItem("adhd-reels-active-project"); } catch {}
    set({ projectId: id });
  },

  aspectRatio: "9:16",
  setAspectRatio: (ratio) => set({ aspectRatio: ratio }),
  sceneCount: 10,
  setSceneCount: (count) => set({ sceneCount: count }),
  animationProvider: "veo" as "veo" | "kling" | "kling-direct",
  setAnimationProvider: (p) => set({ animationProvider: p }),
  audioMode: "voiceover" as AudioMode,
  setAudioMode: (mode) => set({ audioMode: mode }),
  subtitlesDuration: 4,
  setSubtitlesDuration: (d) => set({ subtitlesDuration: d }),
  selectedStyleId: "adhd-harmony-dark",
  setSelectedStyleId: (id) => set({ selectedStyleId: id }),
  voiceModelId: DEFAULT_VOICE_MODEL as VoiceModelId,
  setVoiceModelId: (id) => set({ voiceModelId: id }),
  voiceId: VOICE_PRESETS[0].id,
  setVoiceId: (id) => set({ voiceId: id }),
  voiceSettings: { ...DEFAULT_VOICE_SETTINGS },
  setVoiceSettings: (s) => set((st) => ({ voiceSettings: { ...st.voiceSettings, ...s } })),

  setConcept: (concept) => set({ concept }),
  setScenes: (scenes) => set({ scenes, images: {}, imageApprovals: {}, videos: {}, videoApprovals: {}, voiceover: null, finalVideoUrl: null }),
  updateScene: (i, u) => set((s) => ({ scenes: s.scenes.map((sc, idx) => (idx === i ? { ...sc, ...u } : sc)) })),
  reorderScenes: (fromIndex, toIndex) => set((s) => {
    const newScenes = [...s.scenes];
    const [moved] = newScenes.splice(fromIndex, 1);
    newScenes.splice(toIndex, 0, moved);
    // Rebuild index-keyed records to match new order
    const reindex = (rec: Record<number, unknown>) => {
      const entries = Object.entries(rec).map(([k, v]) => [Number(k), v] as [number, unknown]);
      const ordered = newScenes.map((_, newIdx) => {
        const oldIdx = newIdx === toIndex ? fromIndex
          : newIdx >= Math.min(fromIndex, toIndex) && newIdx <= Math.max(fromIndex, toIndex)
          ? (fromIndex < toIndex ? newIdx + 1 : newIdx - 1)
          : newIdx;
        const entry = entries.find(([k]) => k === oldIdx);
        return [newIdx, entry ? entry[1] : undefined] as [number, unknown];
      }).filter(([, v]) => v !== undefined);
      return Object.fromEntries(ordered);
    };
    return {
      scenes: newScenes,
      images: reindex(s.images) as Record<number, string>,
      videos: reindex(s.videos) as Record<number, string>,
      imageApprovals: reindex(s.imageApprovals) as Record<number, boolean>,
      videoApprovals: reindex(s.videoApprovals) as Record<number, boolean>,
    };
  }),
  setImage: (i, d) => set((s) => ({ images: { ...s.images, [i]: d } })),
  clearImage: (i) => set((s) => { const imgs = { ...s.images }; delete imgs[i]; const ap = { ...s.imageApprovals }; delete ap[i]; return { images: imgs, imageApprovals: ap }; }),
  approveImage: (i, v) => set((s) => ({ imageApprovals: { ...s.imageApprovals, [i]: v } })),
  setVideo: (i, d) => set((s) => ({ videos: { ...s.videos, [i]: d } })),
  clearVideo: (i) => set((s) => { const vids = { ...s.videos }; delete vids[i]; const ap = { ...s.videoApprovals }; delete ap[i]; return { videos: vids, videoApprovals: ap }; }),
  approveVideo: (i, v) => set((s) => ({ videoApprovals: { ...s.videoApprovals, [i]: v } })),
  setVoiceover: (vo) => set({ voiceover: vo }),
  setBackgroundMusic: (m) => set({ backgroundMusic: m }),
  setVolumes: (v) => set((s) => ({ volumes: { ...s.volumes, ...v } })),
  musicStartOffset: 0,
  setMusicStartOffset: (offset) => set({ musicStartOffset: Math.max(0, offset) }),
  musicSongStart: 0,
  setMusicSongStart: (offset) => set({ musicSongStart: Math.max(0, offset) }),
  subtitleStyle: { ...DEFAULT_SUBTITLE_STYLE },
  setSubtitleStyle: (updates) => set((s) => ({ subtitleStyle: { ...s.subtitleStyle, ...updates } })),
  setFinalVideoUrl: (url) => set({ finalVideoUrl: url }),
  setStep: (step) => set({ currentStep: step }),
  canProceedTo: (step) => {
    const s = get();
    // Steps: 0=Concept, 1=Script, 2=Voice, 3=Images, 4=Animation, 5=Assembly
    const isDirect = s.animationProvider === "kling-direct";
    const isSubtitlesOnly = s.audioMode === "subtitles-only";
    switch (step) {
      case 0: return true;
      case 1: return s.concept.trim().length > 0;
      case 2: return s.scenes.length > 0;
      case 3: return isSubtitlesOnly || s.voiceover !== null;  // Subtitles-only: can proceed without voiceover
      case 4: return isDirect
        ? (isSubtitlesOnly || s.voiceover !== null)
        : s.scenes.length > 0 && s.scenes.every((_, i) => s.imageApprovals[i]);
      case 5: {
        const hasVideos = s.scenes.length > 0 && s.scenes.every((_, i) => s.videoApprovals[i]);
        const hasImages = s.scenes.length > 0 && s.scenes.every((_, i) => s.imageApprovals[i]);
        return hasVideos || hasImages; // Can assemble with just images (Ken Burns) or videos
      }
      default: return false;
    }
  },
  setLoading: (key, value) => set((s) => ({ loading: { ...s.loading, [key]: value } })),

  loadProjectData: (meta, images, videos, voiceover, backgroundMusic) => {
    set({
      projectId: meta.id,
      concept: meta.concept,
      aspectRatio: meta.aspectRatio as "9:16" | "16:9",
      sceneCount: meta.sceneCount,
      voiceModelId: (meta.voiceModelId as VoiceModelId) || DEFAULT_VOICE_MODEL,
      voiceId: meta.voiceId || VOICE_PRESETS[0].id,
      voiceSettings: meta.voiceSettings as unknown as VoiceSettings || { ...DEFAULT_VOICE_SETTINGS },
      scenes: meta.scenes as unknown as Scene[],
      imageApprovals: meta.imageApprovals || {},
      videoApprovals: meta.videoApprovals || {},
      volumes: meta.volumes || { voiceover: 80, music: 30 },
      currentStep: meta.currentStep || 0,
      audioMode: (meta.audioMode as AudioMode) || "voiceover",
      subtitlesDuration: meta.subtitlesDuration || 4,
      selectedStyleId: meta.selectedStyleId || "adhd-harmony-dark",
      animationProvider: (meta.animationProvider as "veo" | "kling" | "kling-direct") || "veo",
      subtitleStyle: meta.subtitleStyle ? { ...DEFAULT_SUBTITLE_STYLE, ...meta.subtitleStyle } : { ...DEFAULT_SUBTITLE_STYLE },
      images,
      videos,
      voiceover,
      backgroundMusic,
      finalVideoUrl: null,
      showProjectBrowser: false,
    });
    // Save active project to localStorage for auto-resume on refresh
    try { localStorage.setItem("adhd-reels-active-project", meta.id); } catch {}
  },

  resetPipeline: () => {
    try { localStorage.removeItem("adhd-reels-active-project"); } catch {}
    set({ ...initialPipelineState, showProjectBrowser: false });
  },
}));
