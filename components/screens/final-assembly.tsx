"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useReelStore, FONT_PRESETS, DEFAULT_SUBTITLE_STYLE } from "@/lib/store";
import { assembleVideo } from "@/lib/video-assembler";
import { generateCaption, saveAssetToServer } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  ArrowLeft, Download, Film, Loader2, Play, Pause, RotateCcw,
  Music, Volume2, Upload, Trash2, Wand2, Copy, Check, RefreshCw, MessageSquareText,
  Type, ChevronDown, ChevronUp, Sparkles,
} from "lucide-react";

function fmt(s: number) {
  const m = Math.floor(s / 60);
  const sec = (s % 60).toFixed(2);
  return `${m}:${sec.padStart(5, "0")}`;
}

export function FinalAssembly() {
  const scenes = useReelStore((s) => s.scenes);
  const videos = useReelStore((s) => s.videos);
  const images = useReelStore((s) => s.images);
  const voiceover = useReelStore((s) => s.voiceover);
  const setVoiceover = useReelStore((s) => s.setVoiceover);
  const projectId = useReelStore((s) => s.projectId);
  const backgroundMusic = useReelStore((s) => s.backgroundMusic);
  const setBackgroundMusic = useReelStore((s) => s.setBackgroundMusic);
  const volumes = useReelStore((s) => s.volumes);
  const setVolumes = useReelStore((s) => s.setVolumes);
  const musicStartOffset = useReelStore((s) => s.musicStartOffset);
  const musicSongStart = useReelStore((s) => s.musicSongStart);
  const setMusicSongStart = useReelStore((s) => s.setMusicSongStart);
  const aspectRatio = useReelStore((s) => s.aspectRatio);
  const finalVideoUrl = useReelStore((s) => s.finalVideoUrl);
  const setFinalVideoUrl = useReelStore((s) => s.setFinalVideoUrl);
  const updateScene = useReelStore((s) => s.updateScene);
  const reorderScenes = useReelStore((s) => s.reorderScenes);
  const setStep = useReelStore((s) => s.setStep);

  const [isAssembling, setIsAssembling] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [editingSubtitle, setEditingSubtitle] = useState(false);
  const [editText, setEditText] = useState("");

  // Caption generation state
  const concept = useReelStore((s) => s.concept);
  const [isGeneratingCaption, setIsGeneratingCaption] = useState(false);
  const [captionText, setCaptionText] = useState("");
  const [captionHashtags, setCaptionHashtags] = useState<string[]>([]);
  const [captionError, setCaptionError] = useState<string | null>(null);
  const [captionCopied, setCaptionCopied] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const musicInputRef = useRef<HTMLInputElement>(null);
  const voiceInputRef = useRef<HTMLInputElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  // ===== AUDIO: Web Audio API for sample-accurate sync =====
  const audioCtxRef = useRef<AudioContext | null>(null);
  const voBufferRef = useRef<AudioBuffer | null>(null);
  const musicBufferRef = useRef<AudioBuffer | null>(null);
  const voSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const musicSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const voGainRef = useRef<GainNode | null>(null);
  const musicGainRef = useRef<GainNode | null>(null);
  const startTimeRef = useRef(0);
  const startOffsetRef = useRef(0);

  const [isPlaying, setIsPlaying] = useState(false);
  const isPlayingRef = useRef(false);
  const [playTime, setPlayTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(0);
  const [musicDuration, setMusicDuration] = useState(0);
  const rafRef = useRef<number | null>(null);
  const [isDraggingPlayhead, setIsDraggingPlayhead] = useState(false);
  const [isDraggingEdge, setIsDraggingEdge] = useState(false);

  const audioMode = useReelStore((s) => s.audioMode);
  const isSubtitlesOnly = audioMode === "subtitles-only";
  const subtitleStyle = useReelStore((s) => s.subtitleStyle);
  const setSubtitleStyle = useReelStore((s) => s.setSubtitleStyle);
  const [styleOpen, setStyleOpen] = useState(false);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);

  // ===== Scene timing =====
  const equalSplit = totalDuration > 0 ? totalDuration / (scenes.length || 1) : 3;
  const sceneDurs = scenes.map((s) => s.display_duration || s.audio_duration || equalSplit);
  // When we have a voiceover, correct rounding drift so scenes sum to voiceover exactly.
  // In subtitles-only mode, the total is flexible — scenes define the total, not the other way around.
  if (!isSubtitlesOnly && totalDuration > 0 && sceneDurs.length > 0) {
    const rawSum = sceneDurs.reduce((a, b) => a + b, 0);
    const drift = totalDuration - rawSum;
    sceneDurs[sceneDurs.length - 1] = Math.max(0.1, sceneDurs[sceneDurs.length - 1] + drift);
  }
  const sceneStarts: number[] = [];
  let cumul = 0;
  for (const d of sceneDurs) { sceneStarts.push(cumul); cumul += d; }
  // In subtitles-only mode, totalSceneDur is always the live sum of scene durations.
  // effectiveDuration is the authoritative total used everywhere (timeline, seek, playback display).
  const totalSceneDur = isSubtitlesOnly ? cumul || 1 : (totalDuration || cumul || 1);
  const effectiveDuration = totalSceneDur;

  // Active scene based on playhead position
  // Use sceneStarts[i+1] directly instead of re-adding sceneStarts[i]+sceneDurs[i]
  // to avoid floating-point drift mismatches with the visual timeline boundaries.
  const activeIdx = (() => {
    for (let i = 0; i < scenes.length; i++) {
      const end = i < scenes.length - 1 ? sceneStarts[i + 1] : effectiveDuration;
      if (playTime < end) return i;
    }
    return Math.max(0, scenes.length - 1);
  })();

  // ===== Load voiceover into AudioBuffer (or set duration from scene timings) =====
  useEffect(() => {
    // Subtitles-only with no voiceover: duration comes from scene timings
    if (isSubtitlesOnly && !voiceover) {
      const sceneDurTotal = scenes.reduce((sum, s) => sum + (s.display_duration || s.audio_duration || 4), 0);
      setTotalDuration(sceneDurTotal);
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioContext();
      }
      voBufferRef.current = null;
      return;
    }
    if (!voiceover) {
      voBufferRef.current = null;
      return;
    }
    // Load voiceover audio (works in both voiceover and subtitles-only mode)
    const vo = voiceover as { audioBase64: string; audioUrl?: string };
    const src = vo.audioUrl && (!vo.audioBase64 || vo.audioBase64.length < 100)
      ? vo.audioUrl : vo.audioBase64.startsWith("data:") ? vo.audioBase64 : `data:audio/mpeg;base64,${vo.audioBase64}`;
    let cancelled = false;
    (async () => {
      try {
        const ctx = new AudioContext();
        if (cancelled) { ctx.close(); return; }
        audioCtxRef.current = ctx;
        const resp = await fetch(src);
        const buf = await ctx.decodeAudioData(await resp.arrayBuffer());
        if (!cancelled) {
          voBufferRef.current = buf;
          // In subtitles-only mode, use the longer of voiceover duration or scene durations
          if (isSubtitlesOnly) {
            const sceneDurTotal = scenes.reduce((sum, s) => sum + (s.display_duration || s.audio_duration || 4), 0);
            setTotalDuration(Math.max(buf.duration, sceneDurTotal));
          } else {
            setTotalDuration(buf.duration);
          }
        }
      } catch (e) { console.error("Failed to load voiceover:", e); }
    })();
    return () => { cancelled = true; audioCtxRef.current?.close(); audioCtxRef.current = null; voBufferRef.current = null; };
  }, [voiceover, isSubtitlesOnly, scenes]);

  // ===== Load music into AudioBuffer =====
  useEffect(() => {
    if (!backgroundMusic) { musicBufferRef.current = null; setMusicDuration(0); return; }
    (async () => {
      try {
        const ctx = audioCtxRef.current;
        if (!ctx) return;
        const resp = await fetch(backgroundMusic.dataUrl);
        const buf = await ctx.decodeAudioData(await resp.arrayBuffer());
        musicBufferRef.current = buf;
        setMusicDuration(buf.duration);
      } catch (e) { console.error("Failed to load music:", e); }
    })();
  }, [backgroundMusic]);

  // ===== Playback =====
  function startPlayback(fromTime: number) {
    const ctx = audioCtxRef.current;
    if (!ctx) {
      // Create one if needed (subtitles-only mode)
      const newCtx = new AudioContext();
      audioCtxRef.current = newCtx;
    }
    const actx = audioCtxRef.current!;
    if (actx.state === "suspended") actx.resume();
    try { voSourceRef.current?.stop(); } catch {}
    try { musicSourceRef.current?.stop(); } catch {}

    const voBuf = voBufferRef.current;
    if (voBuf) {
      const voSrc = actx.createBufferSource();
      voSrc.buffer = voBuf;
      const voGain = actx.createGain();
      voGain.gain.value = volumes.voiceover / 100;
      voSrc.connect(voGain).connect(actx.destination);
      voSrc.onended = () => { if (isPlayingRef.current) { stopPlayback(); setPlayTime(0); startOffsetRef.current = 0; } };
      voSourceRef.current = voSrc;
      voGainRef.current = voGain;
      voSrc.start(0, fromTime);
    }

    const musBuf = musicBufferRef.current;
    if (musBuf) {
      const musSrc = actx.createBufferSource();
      musSrc.buffer = musBuf;
      musSrc.loop = true;
      const musGain = actx.createGain();
      musGain.gain.value = volumes.music / 100;
      musSrc.connect(musGain).connect(actx.destination);
      musicSourceRef.current = musSrc;
      musicGainRef.current = musGain;
      const musicFrom = musicSongStart + Math.max(0, fromTime - musicStartOffset);
      if (fromTime >= musicStartOffset) musSrc.start(0, musicFrom);
      else musSrc.start(actx.currentTime + (musicStartOffset - fromTime), musicSongStart);

      // In subtitles-only mode (no voiceover), music end triggers playback stop
      if (!voBuf) {
        // We handle stop via tick checking totalDuration
      }
    }

    startTimeRef.current = actx.currentTime;
    startOffsetRef.current = fromTime;
    isPlayingRef.current = true;
    setIsPlaying(true);

    const endTime = effectiveDuration;
    function tick() {
      if (!isPlayingRef.current) return;
      const elapsed = (audioCtxRef.current?.currentTime || 0) - startTimeRef.current;
      const currentTime = startOffsetRef.current + elapsed;
      if (currentTime >= endTime) {
        stopPlayback();
        setPlayTime(0);
        startOffsetRef.current = 0;
        return;
      }
      setPlayTime(currentTime);
      rafRef.current = requestAnimationFrame(tick);
    }
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(tick);
  }

  function stopPlayback() {
    isPlayingRef.current = false;
    setIsPlaying(false);
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    try { voSourceRef.current?.stop(); } catch {}
    try { musicSourceRef.current?.stop(); } catch {}
    voSourceRef.current = null;
    musicSourceRef.current = null;
  }

  function togglePlay() {
    if (isPlayingRef.current) {
      const elapsed = (audioCtxRef.current?.currentTime || 0) - startTimeRef.current;
      const pos = startOffsetRef.current + elapsed;
      stopPlayback();
      startOffsetRef.current = pos;
      setPlayTime(pos);
    } else {
      startPlayback(startOffsetRef.current);
    }
  }

  function seek(time: number) {
    const t = Math.max(0, Math.min(time, effectiveDuration));
    if (isPlayingRef.current) { stopPlayback(); startPlayback(t); }
    else { startOffsetRef.current = t; setPlayTime(t); }
  }

  // Volume updates
  useEffect(() => { if (voGainRef.current) voGainRef.current.gain.value = volumes.voiceover / 100; }, [volumes.voiceover]);
  useEffect(() => { if (musicGainRef.current) musicGainRef.current.gain.value = volumes.music / 100; }, [volumes.music]);

  // Spacebar = play/pause ALWAYS (except when typing text)
  const togglePlayRef = useRef(togglePlay);
  togglePlayRef.current = togglePlay;
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.code !== "Space") return;
      const el = e.target as HTMLElement;
      const tag = el?.tagName;
      // Only skip if user is actively typing in a text field
      if (tag === "TEXTAREA") return;
      if (tag === "INPUT" && (el as HTMLInputElement).type === "text") return;
      // Prevent ALL default behavior (scroll, button click, slider step)
      e.preventDefault();
      e.stopImmediatePropagation();
      // Blur whatever has focus so next space also works
      if (document.activeElement && document.activeElement !== document.body) {
        (document.activeElement as HTMLElement).blur();
      }
      togglePlayRef.current();
    }
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, []);

  // ===== Draggable playhead =====
  function handlePlayheadDrag(e: React.MouseEvent) {
    e.preventDefault(); e.stopPropagation();
    setIsDraggingPlayhead(true);
    const wasPlaying = isPlayingRef.current;
    if (wasPlaying) stopPlayback();
    const onMove = (ev: MouseEvent) => {
      if (!timelineRef.current || effectiveDuration === 0) return;
      const rect = timelineRef.current.getBoundingClientRect();
      const t = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width)) * effectiveDuration;
      startOffsetRef.current = t;
      setPlayTime(t);
    };
    const onUp = () => {
      setIsDraggingPlayhead(false);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      if (wasPlaying) startPlayback(startOffsetRef.current);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  function handleTimelineClick(e: React.MouseEvent<HTMLDivElement>) {
    if (isDraggingEdge) return;
    if (!timelineRef.current || effectiveDuration === 0) return;
    const rect = timelineRef.current.getBoundingClientRect();
    seek(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * effectiveDuration);
  }

  // ===== Scene edge dragging =====
  function handleEdgeDrag(e: React.MouseEvent, leftIdx: number) {
    e.preventDefault(); e.stopPropagation();
    setIsDraggingEdge(true);
    const rightIdx = leftIdx + 1;
    const origLeft = sceneDurs[leftIdx];
    const origRight = sceneDurs[rightIdx];
    const startX = e.clientX;

    const onMove = (ev: MouseEvent) => {
      if (!timelineRef.current || effectiveDuration === 0) return;
      const rect = timelineRef.current.getBoundingClientRect();
      const deltaPx = ev.clientX - startX;
      const deltaSec = (deltaPx / rect.width) * totalSceneDur;
      const newLeft = Math.max(0.5, Math.min(origLeft + origRight - 0.5, origLeft + deltaSec));
      const newRight = origLeft + origRight - newLeft;
      updateScene(leftIdx, { display_duration: Math.round(newLeft * 10) / 10 });
      updateScene(rightIdx, { display_duration: Math.round(newRight * 10) / 10 });
    };
    const onUp = () => {
      setTimeout(() => setIsDraggingEdge(false), 50);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  // ===== Re-sync: restore original voiceover-derived durations =====
  function autoSyncToVoice() {
    if (!scenes.length) return;

    // Method 1: use stored audio_duration from voiceover generation
    const hasStored = scenes.some(s => s.audio_duration && s.audio_duration > 0);
    if (hasStored) {
      scenes.forEach((s, i) => {
        if (s.audio_duration && s.audio_duration > 0) {
          updateScene(i, { display_duration: Math.round(s.audio_duration * 100) / 100 });
        }
      });
      return;
    }

    // Method 2: if no stored durations, split evenly across voiceover
    if (effectiveDuration > 0 && scenes.length > 0) {
      const even = Math.round((effectiveDuration / scenes.length) * 100) / 100;
      scenes.forEach((_, i) => {
        updateScene(i, { display_duration: even });
      });
    }
  }

  // Scene drag reorder
  const dragIdxRef = useRef<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  function onDragStart(i: number) { dragIdxRef.current = i; }
  function onDragOver(e: React.DragEvent, i: number) { e.preventDefault(); setDragOverIdx(i); }
  function onDrop(i: number) { if (dragIdxRef.current !== null && dragIdxRef.current !== i) reorderScenes(dragIdxRef.current, i); dragIdxRef.current = null; setDragOverIdx(null); }
  function onDragEnd() { dragIdxRef.current = null; setDragOverIdx(null); }

  // Assemble
  async function handleAssemble() {
    if (!isSubtitlesOnly && !voiceover) return;
    setIsAssembling(true); setError(null); setProgress(0);
    try {
      const url = await assembleVideo({ scenes, videos, images, voiceover, backgroundMusic, volumes, musicStartOffset, musicSongStart, aspectRatio, subtitleStyle, onProgress: (p, m) => { setProgress(p); setStatusMessage(m); } });
      setFinalVideoUrl(url);
    } catch (err) { setError(err instanceof Error ? err.message : "Assembly failed"); } finally { setIsAssembling(false); }
  }

  function handleDownload() {
    if (!finalVideoUrl) return;
    const a = document.createElement("a"); a.href = finalVideoUrl; a.download = `adhd-harmony-reel-${Date.now()}.mp4`; a.click();
  }

  async function handleGenerateCaption() {
    setIsGeneratingCaption(true);
    setCaptionError(null);
    setCaptionCopied(false);
    try {
      const result = await generateCaption(concept, scenes);
      setCaptionText(result.caption);
      setCaptionHashtags(result.hashtags);
    } catch (err) {
      setCaptionError(err instanceof Error ? err.message : "Caption generation failed");
    } finally {
      setIsGeneratingCaption(false);
    }
  }

  function copyCaption() {
    const fullCaption = captionHashtags.length > 0
      ? `${captionText}\n\n${captionHashtags.map(h => `#${h}`).join(" ")}`
      : captionText;
    navigator.clipboard.writeText(fullCaption);
    setCaptionCopied(true);
    setTimeout(() => setCaptionCopied(false), 2000);
  }

  const handleMusicUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setBackgroundMusic({ dataUrl: reader.result as string, name: file.name });
    reader.readAsDataURL(file); e.target.value = "";
  }, [setBackgroundMusic]);

  const handleVoiceUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      // Set voiceover in store (dataUrl as audioBase64 — the loader handles data: URLs)
      setVoiceover({ audioBase64: dataUrl, wordTimestamps: [] });
      // Persist to server
      if (projectId) {
        try {
          const base64 = dataUrl.split(",")[1];
          if (base64) await saveAssetToServer(projectId, "voiceover.mp3", base64);
        } catch (err) { console.warn("Failed to save voiceover asset:", err); }
      }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }, [setVoiceover, projectId]);

  // ===== Auphonic voice enhancement =====
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [enhanceStatus, setEnhanceStatus] = useState("");

  async function handleAuphonicEnhance() {
    if (!voiceover || isEnhancing) return;
    setIsEnhancing(true);
    setEnhanceStatus("Uploading to Auphonic...");
    try {
      // Get the audio as base64
      const vo = voiceover as { audioBase64: string; audioUrl?: string };
      let base64Data: string;
      if (vo.audioUrl && (!vo.audioBase64 || vo.audioBase64.length < 100)) {
        // Fetch from URL and convert to base64
        const resp = await fetch(vo.audioUrl);
        const buf = await resp.arrayBuffer();
        base64Data = btoa(String.fromCharCode(...new Uint8Array(buf)));
      } else if (vo.audioBase64.startsWith("data:")) {
        base64Data = vo.audioBase64.split(",")[1];
      } else {
        base64Data = vo.audioBase64;
      }

      // Start Auphonic production
      const startRes = await fetch("/api/auphonic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audioBase64: base64Data, filename: "voiceover.mp3" }),
      });
      if (!startRes.ok) throw new Error("Failed to start Auphonic production");
      const { uuid } = await startRes.json();

      // Poll for completion
      setEnhanceStatus("Processing audio...");
      let attempts = 0;
      const maxAttempts = 120; // 10 minutes max (5s intervals)
      while (attempts < maxAttempts) {
        await new Promise(r => setTimeout(r, 5000));
        attempts++;
        const statusRes = await fetch(`/api/auphonic/status?uuid=${uuid}`);
        const statusData = await statusRes.json();

        if (statusData.status === "error") {
          throw new Error(statusData.message || "Auphonic processing failed");
        }

        if (statusData.status === "processing") {
          setEnhanceStatus(`Processing: ${statusData.statusString || "working"}...`);
          continue;
        }

        if (statusData.status === "done") {
          setEnhanceStatus("Applying enhanced audio...");
          // Convert base64 to data URL and set as voiceover
          const dataUrl = `data:audio/wav;base64,${statusData.audioBase64}`;
          setVoiceover({ audioBase64: dataUrl, wordTimestamps: voiceover.wordTimestamps || [] });
          // Save to server
          if (projectId) {
            try {
              await saveAssetToServer(projectId, "voiceover.mp3", statusData.audioBase64);
            } catch {}
          }
          setEnhanceStatus("Enhanced!");
          setTimeout(() => setEnhanceStatus(""), 3000);
          return;
        }
      }
      throw new Error("Auphonic processing timed out");
    } catch (err) {
      console.error("Auphonic enhance error:", err);
      setEnhanceStatus(err instanceof Error ? err.message : "Enhancement failed");
      setTimeout(() => setEnhanceStatus(""), 5000);
    } finally {
      setIsEnhancing(false);
    }
  }

  // Duration adjustment from detail panel
  function adjustDuration(newDur: number) {
    const clamped = Math.max(0.5, Math.min(15, newDur));
    updateScene(activeIdx, { display_duration: Math.round(clamped * 10) / 10 });

    // In subtitles-only mode (no voiceover), total duration is flexible — just set the scene directly.
    // With a voiceover, total must stay constant, so steal time from a neighbor.
    if (!isSubtitlesOnly) {
      const old = sceneDurs[activeIdx];
      const delta = clamped - old;
      if (activeIdx < scenes.length - 1) {
        const neighborDur = Math.max(0.5, sceneDurs[activeIdx + 1] - delta);
        updateScene(activeIdx + 1, { display_duration: Math.round(neighborDur * 10) / 10 });
      } else if (activeIdx > 0) {
        const neighborDur = Math.max(0.5, sceneDurs[activeIdx - 1] - delta);
        updateScene(activeIdx - 1, { display_duration: Math.round(neighborDur * 10) / 10 });
      }
    }
  }

  const playheadPct = effectiveDuration > 0 ? (playTime / effectiveDuration) * 100 : 0;
  const activeScene = scenes[activeIdx];

  // ===== Live subtitle preview canvas =====
  // Uses a `cancelled` flag to prevent stale async image/video loads from overwriting
  // the canvas when activeIdx changes rapidly (race condition fix).
  useEffect(() => {
    let cancelled = false;

    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const src = videos[activeIdx] || images[activeIdx] || null;
    const subText = activeScene?.subtitle_text || activeScene?.voiceover_text || "";

    // Canvas logical size based on aspect ratio
    const W = aspectRatio === "9:16" ? 1080 : 1920;
    const H = aspectRatio === "9:16" ? 1920 : 1080;
    canvas.width = W;
    canvas.height = H;

    // Draw background
    ctx.fillStyle = "#0a0e1a";
    ctx.fillRect(0, 0, W, H);

    function drawSubtitle() {
      if (!subText || !ctx) return;
      const style = subtitleStyle || DEFAULT_SUBTITLE_STYLE;
      const fontSize = Math.round(W * style.fontSize);
      const strokeW = Math.round(W * style.strokeWidth);
      const lineH = fontSize * 1.4;
      ctx.font = `${style.fontWeight === "bold" ? "bold " : ""}${fontSize}px ${style.fontFamily}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      // Word-wrap
      const mxW = W * 0.85;
      const cleaned = subText.replace(/\[.*?\]/g, "").replace(/\s{2,}/g, " ").trim();
      const words = cleaned.split(" ");
      const lines: string[] = [];
      let cur = "";
      for (const w of words) {
        const test = cur ? `${cur} ${w}` : w;
        if (ctx.measureText(test).width > mxW && cur) { lines.push(cur); cur = w; }
        else cur = test;
      }
      if (cur) lines.push(cur);
      if (!lines.length) return;

      const pad = 20;
      const blockH = lines.length * lineH + pad * 2;
      const pos = activeScene?.subtitle_position ?? 0.50;
      const baseY = Math.round(H * pos - blockH / 2);

      ctx.lineJoin = "round";

      // Shadow
      if (style.shadowEnabled) {
        ctx.shadowColor = style.shadowColor;
        ctx.shadowBlur = style.shadowBlur;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 2;
      }

      // Stroke
      if (style.strokeEnabled) {
        ctx.strokeStyle = style.strokeColor;
        ctx.lineWidth = strokeW;
        for (let i = 0; i < lines.length; i++) {
          ctx.strokeText(lines[i], W / 2, baseY + pad + i * lineH + lineH / 2);
        }
      }

      // Reset shadow for fill
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;

      // Fill
      ctx.fillStyle = style.color;
      for (let i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i], W / 2, baseY + pad + i * lineH + lineH / 2);
      }
    }

    function drawWatermark() {
      if (!ctx) return;
      const wmFontSize = Math.round(W * 0.028);
      ctx.font = `italic ${wmFontSize}px Georgia, 'Times New Roman', serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.fillText("@adhdharmony", W / 2, Math.round(H * 0.82));
    }

    function drawOverlays() {
      if (cancelled) return;
      drawSubtitle();
      drawWatermark();
    }

    if (!src) {
      drawOverlays();
      return () => { cancelled = true; };
    }

    // Check if it's a video thumbnail or image
    const isVid = !!videos[activeIdx];
    if (isVid) {
      // For video: grab first frame via a temp video element
      const vid = document.createElement("video");
      vid.crossOrigin = "anonymous";
      vid.muted = true;
      vid.playsInline = true;
      vid.preload = "auto";
      vid.src = src;
      const onLoaded = () => {
        if (cancelled) return;
        vid.currentTime = 0.1; // grab a frame slightly in
      };
      const onSeeked = () => {
        if (cancelled) return;
        // Cover-fit draw
        const sa = vid.videoWidth / vid.videoHeight, ca = W / H;
        let dw: number, dh: number, ox: number, oy: number;
        if (sa > ca) { dh = H; dw = H * sa; ox = (W - dw) / 2; oy = 0; }
        else { dw = W; dh = W / sa; ox = 0; oy = (H - dh) / 2; }
        ctx!.drawImage(vid, ox, oy, dw, dh);
        drawOverlays();
        vid.removeEventListener("loadeddata", onLoaded);
        vid.removeEventListener("seeked", onSeeked);
      };
      vid.addEventListener("loadeddata", onLoaded);
      vid.addEventListener("seeked", onSeeked);
      vid.load();
      // Fallback timeout
      const timeout = setTimeout(() => { if (!cancelled) drawOverlays(); }, 3000);
      return () => { cancelled = true; clearTimeout(timeout); vid.removeEventListener("loadeddata", onLoaded); vid.removeEventListener("seeked", onSeeked); };
    } else {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        if (cancelled) return;
        const sa = img.naturalWidth / img.naturalHeight, ca = W / H;
        let dw: number, dh: number, ox: number, oy: number;
        if (sa > ca) { dh = H; dw = H * sa; ox = (W - dw) / 2; oy = 0; }
        else { dw = W; dh = W / sa; ox = 0; oy = (H - dh) / 2; }
        ctx!.drawImage(img, ox, oy, dw, dh);
        drawOverlays();
      };
      img.onerror = () => { if (!cancelled) drawOverlays(); };
      img.src = src;
      return () => { cancelled = true; img.onload = null; img.onerror = null; };
    }
  }, [activeIdx, videos, images, activeScene, subtitleStyle, aspectRatio]);

  return (
    <div className="space-y-4 pt-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Timeline</h2>
          <p className="text-muted-foreground mt-1 text-sm">Preview, adjust timing, assemble your reel.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setStep(4)} className="gap-2"><ArrowLeft className="h-4 w-4" />Back</Button>
          {finalVideoUrl && <Button onClick={handleDownload} className="gap-2 bg-green-600 text-white hover:bg-green-500"><Download className="h-4 w-4" />Download</Button>}
        </div>
      </div>

      {/* ===== TRANSPORT BAR ===== */}
      <Card className="border-border/50">
        <CardContent className="py-2.5 px-4 flex items-center gap-3">
          <button onClick={togglePlay} className="h-9 w-9 rounded-lg border border-border flex items-center justify-center hover:bg-muted/50 shrink-0 transition-colors">
            {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
          </button>
          <span className="text-sm font-mono text-muted-foreground w-28">{fmt(playTime)} / {fmt(effectiveDuration)}</span>
          {!isSubtitlesOnly && (
            <button onClick={autoSyncToVoice} className="h-7 px-2.5 rounded-md text-xs text-muted-foreground hover:text-primary hover:bg-muted/30 flex items-center gap-1.5 transition-colors" title="Re-sync scene durations to voiceover">
              <Wand2 className="h-3 w-3" />Re-sync
            </button>
          )}
          <div className="flex-1" />
          {(!isSubtitlesOnly || voiceover) && (
            <div className="flex items-center gap-1.5">
              <Volume2 className="h-3.5 w-3.5 text-blue-400/70" />
              <input type="range" min={0} max={100} step={5} value={volumes.voiceover}
                onChange={(e) => setVolumes({ voiceover: Number(e.target.value) })}
                className="w-16 h-1 accent-blue-400" title={`Voice: ${volumes.voiceover}%`} />
              <span className="text-xs font-mono text-muted-foreground w-7 text-right">{volumes.voiceover}%</span>
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <Music className="h-3.5 w-3.5 text-green-400/70" />
            <input type="range" min={0} max={100} step={5} value={volumes.music}
              onChange={(e) => setVolumes({ music: Number(e.target.value) })}
              className="w-16 h-1 accent-green-400" title={`Music: ${volumes.music}%`} />
            <span className="text-xs font-mono text-muted-foreground w-7 text-right">{volumes.music}%</span>
          </div>
        </CardContent>
      </Card>

      {/* ===== PREVIEW + DETAIL PANEL ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-4">
        {/* Preview with live subtitle overlay */}
        <Card className="border-border/50 overflow-hidden">
          <CardContent className="p-2">
            <div className={`rounded-lg overflow-hidden bg-black mx-auto flex items-center justify-center ${aspectRatio === "9:16" ? "aspect-[9/16] max-h-[420px]" : "aspect-video max-h-[300px]"}`}>
              <canvas
                ref={previewCanvasRef}
                className="h-full w-full object-contain"
                style={{ imageRendering: "auto" }}
              />
            </div>
          </CardContent>
        </Card>

        {/* Detail panel */}
        <Card className="border-border/50">
          <CardContent className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">Scene {activeIdx + 1} <span className="text-muted-foreground font-normal">of {scenes.length}</span></span>
              <span className="text-xs font-mono text-muted-foreground">{sceneDurs[activeIdx]?.toFixed(2)}s</span>
            </div>

            {/* Subtitle editing */}
            {activeScene && (
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground uppercase tracking-wider">Subtitle</label>
                {editingSubtitle ? (
                  <div className="flex gap-2">
                    <input
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      className="flex-1 bg-muted/50 border border-border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:border-primary"
                      autoFocus
                      onKeyDown={(e) => { if (e.key === "Enter") { updateScene(activeIdx, { subtitle_text: editText }); setEditingSubtitle(false); } if (e.key === "Escape") setEditingSubtitle(false); }}
                    />
                    <button onClick={() => { updateScene(activeIdx, { subtitle_text: editText }); setEditingSubtitle(false); }} className="text-xs text-primary hover:underline">Save</button>
                  </div>
                ) : (
                  <p
                    className="text-sm text-foreground/80 cursor-text hover:text-foreground bg-muted/20 rounded-md px-3 py-2 transition-colors"
                    onClick={() => { setEditText(activeScene.subtitle_text || activeScene.voiceover_text); setEditingSubtitle(true); }}
                  >
                    {activeScene.subtitle_text || activeScene.voiceover_text}
                  </p>
                )}
              </div>
            )}

            {/* ===== SUBTITLE STYLE EDITOR ===== */}
            <div className="space-y-2">
              <button
                onClick={() => setStyleOpen(!styleOpen)}
                className="flex items-center justify-between w-full text-xs text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
              >
                <span className="flex items-center gap-1.5"><Type className="h-3 w-3" />Subtitle Style</span>
                {styleOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </button>

              {styleOpen && (
                <div className="space-y-3 pt-1 pb-1 border-t border-border/20">
                  {/* Font family */}
                  <div className="space-y-1">
                    <label className="text-[10px] text-muted-foreground">Font</label>
                    <div className="grid grid-cols-2 gap-1">
                      {FONT_PRESETS.map((fp) => (
                        <button
                          key={fp.id}
                          onClick={() => setSubtitleStyle({ fontFamily: fp.family })}
                          className={`px-2 py-1.5 text-xs rounded-md border transition-colors ${
                            subtitleStyle.fontFamily === fp.family
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border/40 text-muted-foreground hover:border-border hover:text-foreground"
                          }`}
                          style={{ fontFamily: fp.family }}
                        >
                          {fp.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Font size */}
                  <div className="space-y-1">
                    <label className="text-[10px] text-muted-foreground">Size</label>
                    <div className="flex items-center gap-2">
                      {([["S", 0.035], ["M", 0.046], ["L", 0.06]] as const).map(([label, val]) => (
                        <button
                          key={label}
                          onClick={() => setSubtitleStyle({ fontSize: val })}
                          className={`flex-1 px-2 py-1 text-xs rounded-md border transition-colors ${
                            Math.abs(subtitleStyle.fontSize - val) < 0.002
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border/40 text-muted-foreground hover:border-border hover:text-foreground"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Font weight */}
                  <div className="space-y-1">
                    <label className="text-[10px] text-muted-foreground">Weight</label>
                    <div className="flex items-center gap-2">
                      {([["Normal", "normal"], ["Bold", "bold"]] as const).map(([label, val]) => (
                        <button
                          key={val}
                          onClick={() => setSubtitleStyle({ fontWeight: val })}
                          className={`flex-1 px-2 py-1 text-xs rounded-md border transition-colors ${
                            subtitleStyle.fontWeight === val
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border/40 text-muted-foreground hover:border-border hover:text-foreground"
                          }`}
                          style={{ fontWeight: val }}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Color */}
                  <div className="space-y-1">
                    <label className="text-[10px] text-muted-foreground">Color</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={subtitleStyle.color}
                        onChange={(e) => setSubtitleStyle({ color: e.target.value })}
                        className="w-7 h-7 rounded border border-border/40 cursor-pointer bg-transparent p-0"
                      />
                      <span className="text-[10px] font-mono text-muted-foreground">{subtitleStyle.color}</span>
                    </div>
                  </div>

                  {/* Stroke */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] text-muted-foreground">Stroke</label>
                      <button
                        onClick={() => setSubtitleStyle({ strokeEnabled: !subtitleStyle.strokeEnabled })}
                        className={`w-8 h-4 rounded-full transition-colors relative ${
                          subtitleStyle.strokeEnabled ? "bg-primary" : "bg-muted/50"
                        }`}
                      >
                        <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${
                          subtitleStyle.strokeEnabled ? "translate-x-4" : "translate-x-0.5"
                        }`} />
                      </button>
                    </div>
                    {subtitleStyle.strokeEnabled && (
                      <div className="space-y-1.5 pl-1">
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={subtitleStyle.strokeColor}
                            onChange={(e) => setSubtitleStyle({ strokeColor: e.target.value })}
                            className="w-5 h-5 rounded border border-border/40 cursor-pointer bg-transparent p-0"
                          />
                          <input
                            type="range" min={0.001} max={0.008} step={0.001}
                            value={subtitleStyle.strokeWidth}
                            onChange={(e) => setSubtitleStyle({ strokeWidth: Number(e.target.value) })}
                            className="flex-1 h-1 accent-primary"
                          />
                          <span className="text-[9px] font-mono text-muted-foreground w-8">{(subtitleStyle.strokeWidth * 1000).toFixed(0)}</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Shadow */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] text-muted-foreground">Shadow</label>
                      <button
                        onClick={() => setSubtitleStyle({ shadowEnabled: !subtitleStyle.shadowEnabled })}
                        className={`w-8 h-4 rounded-full transition-colors relative ${
                          subtitleStyle.shadowEnabled ? "bg-primary" : "bg-muted/50"
                        }`}
                      >
                        <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${
                          subtitleStyle.shadowEnabled ? "translate-x-4" : "translate-x-0.5"
                        }`} />
                      </button>
                    </div>
                    {subtitleStyle.shadowEnabled && (
                      <div className="flex items-center gap-2 pl-1">
                        <span className="text-[9px] text-muted-foreground">Blur</span>
                        <input
                          type="range" min={0} max={20} step={1}
                          value={subtitleStyle.shadowBlur}
                          onChange={(e) => setSubtitleStyle({ shadowBlur: Number(e.target.value) })}
                          className="flex-1 h-1 accent-primary"
                        />
                        <span className="text-[9px] font-mono text-muted-foreground w-5">{subtitleStyle.shadowBlur}</span>
                      </div>
                    )}
                  </div>

                  {/* Per-scene position */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] text-muted-foreground">Position</label>
                      <span className="text-[9px] font-mono text-muted-foreground">{Math.round((activeScene?.subtitle_position ?? 0.50) * 100)}%</span>
                    </div>
                    <input
                      type="range" min={0.05} max={0.95} step={0.01}
                      value={activeScene?.subtitle_position ?? 0.50}
                      onChange={(e) => updateScene(activeIdx, { subtitle_position: Number(e.target.value) })}
                      className="w-full h-1.5 accent-primary"
                    />
                    <button
                      onClick={() => {
                        const pos = activeScene?.subtitle_position ?? 0.50;
                        scenes.forEach((_, i) => updateScene(i, { subtitle_position: pos }));
                      }}
                      className="text-[10px] text-muted-foreground hover:text-primary transition-colors"
                    >
                      Apply to all scenes
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Voiceover text (read-only) */}
            {activeScene && (
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground uppercase tracking-wider">Voiceover</label>
                <p className="text-xs text-muted-foreground/70 font-mono bg-muted/10 rounded-md px-3 py-2">{activeScene.voiceover_text}</p>
              </div>
            )}

            {/* Duration control */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs text-muted-foreground uppercase tracking-wider">Duration</label>
                <button
                  onClick={() => {
                    // Set this scene's end to where the playhead is
                    const newDur = Math.max(0.5, playTime - sceneStarts[activeIdx]);
                    adjustDuration(newDur);
                  }}
                  disabled={playTime <= sceneStarts[activeIdx]}
                  className="text-[10px] text-muted-foreground hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1 transition-colors"
                  title={`Set scene end to playhead (${fmt(playTime)})`}
                >
                  Cut at {fmt(playTime)}
                </button>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="range" min={0.5} max={15} step={0.1}
                  value={sceneDurs[activeIdx] || 3}
                  onChange={(e) => adjustDuration(Number(e.target.value))}
                  className="flex-1 h-1.5 accent-primary"
                />
                <input
                  type="number" min={0.5} max={15} step={0.01}
                  value={sceneDurs[activeIdx]?.toFixed(2)}
                  onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) adjustDuration(v); }}
                  className="w-16 text-sm font-mono text-right bg-transparent border border-transparent hover:border-border focus:border-primary rounded px-1 py-0.5 focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
              </div>
            </div>

            {/* Quick scene navigation */}
            <div className="flex gap-1 flex-wrap pt-1">
              {scenes.map((_, i) => (
                <button
                  key={i}
                  onClick={() => seek(sceneStarts[i])}
                  className={`w-7 h-7 rounded text-xs font-mono transition-colors ${i === activeIdx ? "bg-primary text-primary-foreground" : "bg-muted/30 text-muted-foreground hover:bg-muted/50"}`}
                >
                  {i + 1}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ===== TIMELINE TRACKS ===== */}
      <Card className="border-border/50 overflow-hidden">
        <CardContent className="pt-3 pb-3 px-4">
          {/* Time ruler */}
          <div className="relative h-4 ml-14 mr-2 mb-1">
            {effectiveDuration > 0 && Array.from({ length: Math.ceil(effectiveDuration / 5) + 1 }).map((_, i) => {
              const t = i * 5;
              if (t > effectiveDuration) return null;
              const pct = (t / effectiveDuration) * 100;
              return <span key={i} className="absolute text-[9px] font-mono text-muted-foreground/50 -translate-x-1/2" style={{ left: `${pct}%` }}>{fmt(t)}</span>;
            })}
          </div>

          {/* Tracks container */}
          <div ref={timelineRef} className="relative ml-14 mr-2 cursor-pointer select-none" onClick={handleTimelineClick}>
            {/* Draggable playhead */}
            <div
              className={`absolute top-0 bottom-0 z-30 ${isDraggingPlayhead ? "cursor-grabbing" : "cursor-grab"}`}
              style={{ left: `calc(${playheadPct}% - 6px)`, width: "13px" }}
              onMouseDown={handlePlayheadDrag}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="absolute left-[6px] top-0 bottom-0 w-0.5 bg-white shadow-[0_0_6px_rgba(255,255,255,0.5)]" />
              <div className="absolute left-[2px] -top-1.5 w-[9px] h-3 bg-white rounded-sm shadow-md hover:bg-primary transition-colors" />
            </div>

            {/* Track 1: VIDEO / IMAGES — absolute positioning to match playhead math exactly */}
            <div className="flex items-center mb-0.5">
              <span className="absolute -left-14 text-[10px] font-mono text-muted-foreground w-12 text-right">VIDEO</span>
              <div className="relative w-full h-14 bg-muted/10 rounded-sm overflow-visible">
                {scenes.map((scene, i) => {
                  const leftPct = totalSceneDur > 0 ? (sceneStarts[i] / totalSceneDur) * 100 : 0;
                  const widthPct = totalSceneDur > 0 ? (sceneDurs[i] / totalSceneDur) * 100 : 0;
                  const isActive = i === activeIdx;
                  return (
                    <div key={i} className="absolute top-0 h-full" style={{ left: `${leftPct}%`, width: `${widthPct}%` }}>
                      {/* Scene block */}
                      <div
                        draggable
                        onDragStart={() => onDragStart(i)}
                        onDragOver={(e) => onDragOver(e, i)}
                        onDrop={() => onDrop(i)}
                        onDragEnd={onDragEnd}
                        className={`absolute inset-0 border-r border-background/40 overflow-hidden transition-colors ${isActive ? "bg-primary/25 ring-1 ring-primary/40" : "bg-muted/30 hover:bg-muted/40"} ${dragOverIdx === i ? "ring-1 ring-primary" : ""}`}
                        onClick={(e) => { e.stopPropagation(); seek(sceneStarts[i]); }}
                      >
                        {/* Thumbnail */}
                        {images[i] && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={images[i]} alt="" className="absolute inset-0 w-full h-full object-cover opacity-40" />
                        )}
                        <span className="absolute top-0.5 left-1 text-[9px] font-bold text-white/80 drop-shadow-sm z-10">{i + 1}</span>
                        <span className="absolute bottom-0.5 right-1 text-[8px] font-mono text-white/60 drop-shadow-sm z-10">{sceneDurs[i]?.toFixed(2)}s</span>
                      </div>
                      {/* Edge drag handle (between this scene and next) */}
                      {i < scenes.length - 1 && (
                        <div
                          className="absolute right-0 top-0 bottom-0 w-[6px] -mr-[3px] z-20 cursor-col-resize hover:bg-primary/40 transition-colors group"
                          onMouseDown={(e) => handleEdgeDrag(e, i)}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="absolute inset-y-1 left-[2px] w-[2px] bg-white/20 group-hover:bg-primary rounded-full" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Track 2: VOICEOVER / SUBTITLES */}
            <div className="flex items-center mb-0.5">
              <span className="absolute -left-14 text-[10px] font-mono text-muted-foreground w-12 text-right">{isSubtitlesOnly && !voiceover ? "SUBS" : "VOICE"}</span>
              <div className={`relative w-full h-5 ${isSubtitlesOnly && !voiceover ? "bg-amber-500/10" : "bg-blue-500/10"} rounded-sm overflow-hidden`}>
                {voiceover || isSubtitlesOnly ? (
                  <>
                    <div className={`absolute inset-0 ${isSubtitlesOnly && !voiceover ? "bg-amber-500/15" : "bg-blue-500/15"}`} />
                    {scenes.map((s, i) => {
                      const leftPct = totalSceneDur > 0 ? (sceneStarts[i] / totalSceneDur) * 100 : 0;
                      const widthPct = totalSceneDur > 0 ? (sceneDurs[i] / totalSceneDur) * 100 : 0;
                      return (
                        <div key={i} className="absolute top-0 bottom-0 flex items-center overflow-hidden border-r border-background/30" style={{ left: `${leftPct}%`, width: `${widthPct}%` }}>
                          <span className={`text-[8px] ${isSubtitlesOnly && !voiceover ? "text-amber-300/50" : "text-blue-300/50"} truncate px-1`}>{(s.subtitle_text || s.voiceover_text).slice(0, 20)}</span>
                        </div>
                      );
                    })}
                  </>
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center cursor-pointer" onClick={(e) => { e.stopPropagation(); voiceInputRef.current?.click(); }}>
                    <span className="text-[9px] text-muted-foreground/40">+ Upload voiceover</span>
                  </div>
                )}
              </div>
            </div>

            {/* Track 3: MUSIC */}
            <div className="flex items-center">
              <span className="absolute -left-14 text-[10px] font-mono text-muted-foreground w-12 text-right">MUSIC</span>
              <div className="relative w-full h-5 bg-green-500/5 rounded-sm overflow-hidden">
                {backgroundMusic ? (
                  <div className="absolute inset-0 bg-green-500/15 flex items-center px-2">
                    <span className="text-[9px] text-green-400/50 truncate">{backgroundMusic.name}{musicSongStart > 0 ? ` (from ${fmt(musicSongStart)})` : ""}</span>
                  </div>
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center cursor-pointer" onClick={(e) => { e.stopPropagation(); musicInputRef.current?.click(); }}>
                    <span className="text-[9px] text-muted-foreground/40">+ Add music</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Music controls */}
          {backgroundMusic && (
            <div className="ml-14 mr-2 mt-2 flex items-center gap-3">
              <span className="text-[10px] text-muted-foreground shrink-0">Song from:</span>
              <input type="range" min={0} max={Math.max(musicDuration - 5, 0)} step={0.5}
                value={musicSongStart} onChange={(e) => setMusicSongStart(Number(e.target.value))}
                className="flex-1 h-1 accent-green-500 min-w-[80px]" />
              <span className="text-[10px] font-mono text-green-400/80 w-10 shrink-0">{fmt(musicSongStart)}</span>
              <button onClick={() => musicInputRef.current?.click()} className="text-muted-foreground hover:text-foreground" title="Replace"><Upload className="h-3 w-3" /></button>
              <button onClick={() => setBackgroundMusic(null)} className="text-muted-foreground hover:text-destructive" title="Remove"><Trash2 className="h-3 w-3" /></button>
            </div>
          )}
          {/* Voiceover controls */}
          <div className="ml-14 mr-2 mt-2 flex items-center gap-3">
            {voiceover ? (
              <>
                <span className="text-[10px] text-muted-foreground shrink-0">
                  {isEnhancing ? enhanceStatus : enhanceStatus === "Enhanced!" ? "Enhanced!" : "Voiceover loaded"}
                </span>
                <div className="flex-1" />
                <button
                  onClick={handleAuphonicEnhance}
                  disabled={isEnhancing}
                  className="text-[10px] text-amber-400 hover:text-amber-300 flex items-center gap-1 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Enhance voice quality with Auphonic (leveling, noise reduction, loudness normalization)"
                >
                  {isEnhancing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                  {isEnhancing ? "Enhancing..." : "Enhance"}
                </button>
                <button onClick={() => voiceInputRef.current?.click()} className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors" title="Replace voiceover"><Upload className="h-3 w-3" />Replace</button>
                <button onClick={() => setVoiceover(null)} className="text-[10px] text-muted-foreground hover:text-destructive flex items-center gap-1 transition-colors" title="Remove voiceover"><Trash2 className="h-3 w-3" />Remove</button>
              </>
            ) : (
              <>
                <button onClick={() => voiceInputRef.current?.click()} className="text-[10px] text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors"><Upload className="h-3 w-3" />Upload voiceover</button>
              </>
            )}
          </div>
          <input ref={voiceInputRef} type="file" accept="audio/*" className="hidden" onChange={handleVoiceUpload} />
          <input ref={musicInputRef} type="file" accept="audio/*" className="hidden" onChange={handleMusicUpload} />
        </CardContent>
      </Card>

      {/* ===== ASSEMBLE + FINAL VIDEO ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border-border/50">
          <CardContent className="pt-5 space-y-3">
            {isAssembling ? (
              <div className="space-y-2">
                <div className="flex items-center gap-3"><Loader2 className="h-4 w-4 animate-spin text-primary" /><span className="text-sm">{statusMessage}</span></div>
                <Progress value={progress} className="h-1.5" />
              </div>
            ) : (
              <Button onClick={handleAssemble} disabled={(!isSubtitlesOnly && !voiceover) || (Object.keys(videos).length === 0 && Object.keys(images).length === 0)} className="w-full gap-2 bg-primary text-primary-foreground hover:bg-primary/90">
                {finalVideoUrl ? <><RotateCcw className="h-4 w-4" />Re-Assemble</> : <><Film className="h-4 w-4" />Assemble Video</>}
              </Button>
            )}
            {error && <p className="text-xs text-destructive">{error}</p>}
            {finalVideoUrl && <Button onClick={handleDownload} className="w-full gap-2 bg-green-600 text-white hover:bg-green-500"><Download className="h-4 w-4" />Download Video</Button>}

            {/* ===== CAPTION GENERATOR ===== */}
            {finalVideoUrl && (
              <div className="border-t border-border/30 pt-3 space-y-2">
                {captionText ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs text-muted-foreground uppercase tracking-wider">Caption</label>
                      <div className="flex gap-1">
                        <button
                          onClick={handleGenerateCaption}
                          disabled={isGeneratingCaption}
                          className="text-[10px] text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors disabled:opacity-50"
                          title="Regenerate caption"
                        >
                          <RefreshCw className={`h-3 w-3 ${isGeneratingCaption ? "animate-spin" : ""}`} />Regenerate
                        </button>
                      </div>
                    </div>
                    <div
                      className="bg-muted/20 rounded-md px-3 py-2.5 text-sm text-foreground/90 cursor-pointer hover:bg-muted/30 transition-colors group relative"
                      onClick={copyCaption}
                      title="Click to copy"
                    >
                      <p>{captionText}</p>
                      {captionHashtags.length > 0 && (
                        <p className="mt-2 text-primary/70 text-xs">
                          {captionHashtags.map(h => `#${h}`).join(" ")}
                        </p>
                      )}
                      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        {captionCopied ? (
                          <Check className="h-3.5 w-3.5 text-green-400" />
                        ) : (
                          <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                      </div>
                    </div>
                    {captionCopied && (
                      <p className="text-[10px] text-green-400 flex items-center gap-1">
                        <Check className="h-3 w-3" />Copied to clipboard
                      </p>
                    )}
                  </div>
                ) : (
                  <Button
                    onClick={handleGenerateCaption}
                    disabled={isGeneratingCaption}
                    variant="outline"
                    className="w-full gap-2"
                  >
                    {isGeneratingCaption ? (
                      <><Loader2 className="h-4 w-4 animate-spin" />Generating caption...</>
                    ) : (
                      <><MessageSquareText className="h-4 w-4" />Generate Caption</>
                    )}
                  </Button>
                )}
                {captionError && (
                  <p className="text-xs text-destructive">{captionError}</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/50 overflow-hidden">
          <CardContent className="p-3">
            {finalVideoUrl ? (
              <div className={`rounded-lg overflow-hidden bg-black ${aspectRatio === "9:16" ? "aspect-[9/16]" : "aspect-video"} max-h-[300px] mx-auto`}>
                <video ref={videoRef} src={finalVideoUrl} controls playsInline className="h-full w-full object-contain" />
              </div>
            ) : (
              <div className={`flex flex-col items-center justify-center rounded-lg bg-muted/10 ${aspectRatio === "9:16" ? "aspect-[9/16]" : "aspect-video"} max-h-[300px]`}>
                <Film className="h-10 w-10 text-muted-foreground/15 mb-2" />
                <p className="text-[10px] text-muted-foreground/40">{isAssembling ? "Assembling..." : "Assemble to preview"}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
