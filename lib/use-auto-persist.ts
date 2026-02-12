"use client";

import { useEffect, useRef } from "react";
import { useReelStore } from "./store";
import { loadProjectFromServer, updateProjectOnServer, getAssetUrl } from "./api";

const SAVE_DEBOUNCE_MS = 2000;

/**
 * Auto-persist hook:
 * 1. On mount, checks localStorage for an active project ID and loads it
 * 2. Watches key store fields and auto-saves changes to the server (debounced)
 */
export function useAutoPersist() {
  const projectId = useReelStore((s) => s.projectId);
  const scenes = useReelStore((s) => s.scenes);
  const currentStep = useReelStore((s) => s.currentStep);
  const imageApprovals = useReelStore((s) => s.imageApprovals);
  const videoApprovals = useReelStore((s) => s.videoApprovals);
  const volumes = useReelStore((s) => s.volumes);
  const audioMode = useReelStore((s) => s.audioMode);
  const subtitlesDuration = useReelStore((s) => s.subtitlesDuration);
  const selectedStyleId = useReelStore((s) => s.selectedStyleId);
  const animationProvider = useReelStore((s) => s.animationProvider);
  const subtitleStyle = useReelStore((s) => s.subtitleStyle);
  const loadProjectData = useReelStore((s) => s.loadProjectData);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasMountedRef = useRef(false);
  const isLoadingRef = useRef(false);
  // Track the last saved snapshot to avoid saving unchanged data
  const lastSavedRef = useRef<string>("");

  // ===== AUTO-LOAD on mount =====
  useEffect(() => {
    if (hasMountedRef.current) return;
    hasMountedRef.current = true;

    let cancelled = false;
    (async () => {
      try {
        const savedId = localStorage.getItem("adhd-reels-active-project");
        if (!savedId) return;

        // Check if a project is already loaded (e.g. from server-side)
        const currentId = useReelStore.getState().projectId;
        if (currentId) return;

        isLoadingRef.current = true;
        const meta = await loadProjectFromServer(savedId);
        if (cancelled) return;

        // Reconstruct images/videos from asset URLs
        const images: Record<number, string> = {};
        const videos: Record<number, string> = {};
        for (let i = 0; i < (meta.scenes?.length || 0); i++) {
          if (meta.imageApprovals?.[i] || meta.scenes?.[i]) {
            images[i] = getAssetUrl(savedId, `image-${i}.png`);
          }
          if (meta.videoApprovals?.[i]) {
            videos[i] = getAssetUrl(savedId, `video-${i}.mp4`);
          }
        }

        // Load voiceover if it exists
        let voiceover = null;
        if (meta.hasVoiceover) {
          voiceover = {
            audioBase64: "",
            wordTimestamps: meta.wordTimestamps || [],
            audioUrl: getAssetUrl(savedId, "voiceover.mp3"),
          };
        }

        loadProjectData(
          meta,
          images,
          videos,
          voiceover as Parameters<typeof loadProjectData>[3],
          meta.backgroundMusicName
            ? { dataUrl: getAssetUrl(savedId, "music.mp3"), name: meta.backgroundMusicName }
            : null,
        );
      } catch (e) {
        console.warn("Failed to auto-load project:", e);
        // Clear stale reference
        try { localStorage.removeItem("adhd-reels-active-project"); } catch {}
      } finally {
        isLoadingRef.current = false;
      }
    })();

    return () => { cancelled = true; };
  }, [loadProjectData]);

  // ===== AUTO-SAVE on changes (debounced) =====
  useEffect(() => {
    // Don't save if no project, or if we're in the middle of loading
    if (!projectId || isLoadingRef.current) return;
    // Don't save if scenes are empty (project just created, script not generated yet)
    if (scenes.length === 0) return;

    // Build a snapshot to check for actual changes
    const snapshot = JSON.stringify({
      scenes,
      currentStep,
      imageApprovals,
      videoApprovals,
      volumes,
      audioMode,
      subtitlesDuration,
      selectedStyleId,
      animationProvider,
      subtitleStyle,
    });

    // Skip if nothing changed
    if (snapshot === lastSavedRef.current) return;

    // Debounce the save
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      try {
        await updateProjectOnServer(projectId, {
          scenes: scenes as unknown as Record<string, unknown>[],
          currentStep,
          imageApprovals,
          videoApprovals,
          volumes,
          audioMode,
          subtitlesDuration,
          selectedStyleId,
          animationProvider,
          subtitleStyle,
        });
        lastSavedRef.current = snapshot;
      } catch (e) {
        console.warn("Auto-save failed:", e);
      }
    }, SAVE_DEBOUNCE_MS);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [projectId, scenes, currentStep, imageApprovals, videoApprovals, volumes, audioMode, subtitlesDuration, selectedStyleId, animationProvider, subtitleStyle]);
}
