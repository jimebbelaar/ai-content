"use client";

import { useState, useRef, useCallback } from "react";
import { useReelStore } from "@/lib/store";
import type { AudioMode } from "@/lib/store";
import { generateVoiceover, saveAssetToServer, updateProjectOnServer } from "@/lib/api";
import { VOICE_PRESETS, MODEL_PRESETS } from "@/lib/prompts";
import type { VoiceModelId } from "@/lib/prompts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, ArrowRight, Mic, RefreshCw, Upload, Volume2, Music, Loader2, Play, Pause, Trash2, Film, Type } from "lucide-react";

export function Voiceover() {
  const scenes = useReelStore((s) => s.scenes);
  const voiceModelId = useReelStore((s) => s.voiceModelId);
  const setVoiceModelId = useReelStore((s) => s.setVoiceModelId);
  const voiceId = useReelStore((s) => s.voiceId);
  const setVoiceId = useReelStore((s) => s.setVoiceId);
  const voiceSettings = useReelStore((s) => s.voiceSettings);
  const setVoiceSettings = useReelStore((s) => s.setVoiceSettings);
  const voiceover = useReelStore((s) => s.voiceover);
  const setVoiceover = useReelStore((s) => s.setVoiceover);
  const backgroundMusic = useReelStore((s) => s.backgroundMusic);
  const setBackgroundMusic = useReelStore((s) => s.setBackgroundMusic);
  const volumes = useReelStore((s) => s.volumes);
  const setVolumes = useReelStore((s) => s.setVolumes);
  const updateScene = useReelStore((s) => s.updateScene);
  const animationProvider = useReelStore((s) => s.animationProvider);
  const setAnimationProvider = useReelStore((s) => s.setAnimationProvider);
  const projectId = useReelStore((s) => s.projectId);
  const setStep = useReelStore((s) => s.setStep);
  const audioMode = useReelStore((s) => s.audioMode);
  const setAudioMode = useReelStore((s) => s.setAudioMode);
  const subtitlesDuration = useReelStore((s) => s.subtitlesDuration);
  const setSubtitlesDuration = useReelStore((s) => s.setSubtitlesDuration);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const musicInputRef = useRef<HTMLInputElement>(null);
  // Join voiceover text with natural paragraph breaks for v3
  const fullScript = scenes.map((s) => s.voiceover_text).join("\n\n");

  const handleGenerate = useCallback(async () => {
    setIsGenerating(true); setError(null);
    try {
      // Pass scenes so the API can calculate per-scene timing from audio
      const result = await generateVoiceover(fullScript, voiceId, voiceSettings, scenes.map(s => ({ voiceover_text: s.voiceover_text, subtitle_text: s.subtitle_text })), voiceModelId);
      setVoiceover(result);

      // Update each scene with actual audio timing
      if (result.sceneTimings) {
        result.sceneTimings.forEach((timing: { start: number; end: number; duration: number }, i: number) => {
          if (i < scenes.length) {
            const startMin = Math.floor(timing.start / 60);
            const startSec = Math.floor(timing.start % 60);
            const endMin = Math.floor(timing.end / 60);
            const endSec = Math.floor(timing.end % 60);
            updateScene(i, {
              audio_start: timing.start,
              audio_end: timing.end,
              audio_duration: timing.duration,
              display_duration: Math.round(timing.duration * 100) / 100, // keep full precision
              time_range: `${startMin}:${startSec.toString().padStart(2, '0')}-${endMin}:${endSec.toString().padStart(2, '0')}`,
            });
          }
        });
      }

      // Auto-save
      if (projectId && result.audioBase64) {
        await saveAssetToServer(projectId, "voiceover.mp3", result.audioBase64);
        await updateProjectOnServer(projectId, { hasVoiceover: true, wordTimestamps: result.wordTimestamps, currentStep: 2 });
      }
    } catch (err) { setError(err instanceof Error ? err.message : "Voiceover generation failed"); } finally { setIsGenerating(false); }
  }, [fullScript, voiceId, voiceModelId, voiceSettings, scenes, setVoiceover, updateScene, projectId]);

  function togglePlayback() {
    if (!voiceover) return;
    if (!audioRef.current) {
      const src = voiceover.audioBase64 ? `data:audio/mpeg;base64,${voiceover.audioBase64}` : (voiceover as unknown as { audioUrl?: string }).audioUrl || "";
      audioRef.current = new Audio(src);
      audioRef.current.onended = () => setIsPlaying(false);
    }
    if (isPlaying) { audioRef.current.pause(); setIsPlaying(false); } else { audioRef.current.play(); setIsPlaying(true); }
  }

  function handleMusicUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader(); reader.onload = async () => {
      setBackgroundMusic({ dataUrl: reader.result as string, name: file.name });
      if (projectId) {
        const base64 = (reader.result as string).split(",")[1];
        await saveAssetToServer(projectId, "music.mp3", base64);
        await updateProjectOnServer(projectId, { backgroundMusicName: file.name });
      }
    }; reader.readAsDataURL(file);
  }

  const isSubtitlesOnly = audioMode === "subtitles-only";

  // Apply scene durations for subtitles-only mode
  function applySubtitlesDurations(durationPerScene: number) {
    scenes.forEach((_, i) => {
      const start = i * durationPerScene;
      const end = start + durationPerScene;
      const startMin = Math.floor(start / 60);
      const startSec = Math.floor(start % 60);
      const endMin = Math.floor(end / 60);
      const endSec = Math.floor(end % 60);
      updateScene(i, {
        audio_start: start,
        audio_end: end,
        audio_duration: durationPerScene,
        display_duration: durationPerScene,
        time_range: `${startMin}:${startSec.toString().padStart(2, '0')}-${endMin}:${endSec.toString().padStart(2, '0')}`,
      });
    });
  }

  function handleSetSubtitlesOnly() {
    setAudioMode("subtitles-only");
    setVoiceover(null);
    // Set default volumes for subtitles-only: no voiceover, full music
    setVolumes({ voiceover: 0, music: 80 });
    applySubtitlesDurations(subtitlesDuration);
  }

  function handleSetVoiceover() {
    setAudioMode("voiceover");
    setVolumes({ voiceover: 80, music: 30 });
  }

  const canProceed = isSubtitlesOnly ? scenes.length > 0 : !!voiceover;

  return (
    <div className="space-y-8 pt-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Audio & Subtitles</h2>
          <p className="text-muted-foreground mt-1">Choose between AI voiceover or subtitles-only with music.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setStep(1)} className="gap-2"><ArrowLeft className="h-4 w-4" />Script</Button>
          <Button onClick={() => setStep(3)} disabled={!canProceed} className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"><Film className="h-4 w-4" />Next<ArrowRight className="h-4 w-4" /></Button>
        </div>
      </div>

      {/* ===== MODE TOGGLE ===== */}
      <div className="flex gap-3">
        <button
          onClick={handleSetVoiceover}
          className={`flex-1 flex items-center gap-3 p-4 rounded-xl border-2 transition-all ${!isSubtitlesOnly ? "border-primary bg-primary/10 shadow-[0_0_12px_rgba(245,158,11,0.15)]" : "border-border/50 hover:border-border"}`}
        >
          <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${!isSubtitlesOnly ? "bg-primary text-primary-foreground" : "bg-muted/50 text-muted-foreground"}`}>
            <Mic className="h-5 w-5" />
          </div>
          <div className="text-left">
            <p className={`text-sm font-semibold ${!isSubtitlesOnly ? "text-foreground" : "text-muted-foreground"}`}>AI Voiceover</p>
            <p className="text-xs text-muted-foreground">Generate speech with ElevenLabs</p>
          </div>
        </button>
        <button
          onClick={handleSetSubtitlesOnly}
          className={`flex-1 flex items-center gap-3 p-4 rounded-xl border-2 transition-all ${isSubtitlesOnly ? "border-primary bg-primary/10 shadow-[0_0_12px_rgba(245,158,11,0.15)]" : "border-border/50 hover:border-border"}`}
        >
          <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${isSubtitlesOnly ? "bg-primary text-primary-foreground" : "bg-muted/50 text-muted-foreground"}`}>
            <Type className="h-5 w-5" />
          </div>
          <div className="text-left">
            <p className={`text-sm font-semibold ${isSubtitlesOnly ? "text-foreground" : "text-muted-foreground"}`}>Subtitles Only</p>
            <p className="text-xs text-muted-foreground">Text on screen with background music</p>
          </div>
        </button>
      </div>

      {isSubtitlesOnly ? (
        /* ===== SUBTITLES-ONLY MODE ===== */
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-6">
            <Card className="border-border/50"><CardHeader><CardTitle className="text-base">Full Script (as subtitles)</CardTitle></CardHeader><CardContent><div className="bg-muted/30 rounded-lg p-4 max-h-[300px] overflow-y-auto">{scenes.map((scene, i) => <p key={i} className="text-sm leading-relaxed mb-3 last:mb-0"><span className="text-primary font-medium text-xs mr-2">[{scene.scene_number}]</span>{scene.voiceover_text}</p>)}</div><p className="text-xs text-muted-foreground mt-2">{scenes.length} scenes &middot; {(scenes.length * subtitlesDuration).toFixed(0)}s total</p></CardContent></Card>
            <Card className="border-border/50"><CardHeader><CardTitle className="text-base">Scene Duration</CardTitle></CardHeader><CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">How long each scene&apos;s subtitle stays on screen.</p>
              <div className="space-y-2">
                <div className="flex items-center justify-between"><Label className="text-sm">Seconds per scene</Label><span className="text-xs font-mono text-muted-foreground">{subtitlesDuration.toFixed(1)}s</span></div>
                <Slider value={[subtitlesDuration]} onValueChange={([v]) => { setSubtitlesDuration(v); applySubtitlesDurations(v); }} min={2} max={8} step={0.5} />
                <div className="flex justify-between text-xs text-muted-foreground"><span>2s (fast)</span><span>8s (slow)</span></div>
              </div>
              <Separator />
              <div className="bg-muted/20 rounded-lg p-3 space-y-1">
                <p className="text-xs text-muted-foreground">Total duration: <span className="text-foreground font-mono">{(scenes.length * subtitlesDuration).toFixed(1)}s</span></p>
                <p className="text-xs text-muted-foreground">Scenes: <span className="text-foreground font-mono">{scenes.length}</span></p>
              </div>
            </CardContent></Card>
          </div>
          <div className="space-y-6">
            <Card className="border-primary/30 border-2 bg-primary/5"><CardContent className="pt-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="h-10 w-10 rounded-lg bg-primary/20 flex items-center justify-center"><Music className="h-5 w-5 text-primary" /></div>
                <div>
                  <p className="text-sm font-semibold">Background Music</p>
                  <p className="text-xs text-muted-foreground">Upload a track for your reel&apos;s audio</p>
                </div>
              </div>
              {backgroundMusic ? <div className="flex items-center justify-between bg-muted/30 rounded-lg p-3"><div className="flex items-center gap-2"><Music className="h-4 w-4 text-green-400" /><span className="text-sm truncate max-w-[200px]">{backgroundMusic.name}</span></div><Button size="sm" variant="ghost" onClick={() => setBackgroundMusic(null)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></Button></div> : <div className="border-2 border-dashed border-primary/30 rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all" onClick={() => musicInputRef.current?.click()}><Upload className="h-10 w-10 mx-auto text-primary/50 mb-2" /><p className="text-sm text-muted-foreground">Drop a music file or click to upload</p><p className="text-xs text-muted-foreground/60 mt-1">MP3, WAV, AAC, etc.</p></div>}
              <input ref={musicInputRef} type="file" accept="audio/*" className="hidden" onChange={handleMusicUpload} />
            </CardContent></Card>
            <Card className="border-border/50"><CardHeader><CardTitle className="text-base">Music Volume</CardTitle></CardHeader><CardContent>
              <div className="space-y-2"><div className="flex items-center justify-between"><Label className="text-sm flex items-center gap-2"><Music className="h-3.5 w-3.5" />Music</Label><span className="text-xs font-mono text-muted-foreground">{volumes.music}%</span></div><Slider value={[volumes.music]} onValueChange={([v]) => setVolumes({ music: v })} min={0} max={100} step={5} /></div>
            </CardContent></Card>
          </div>
        </div>
      ) : (
        /* ===== VOICEOVER MODE (original) ===== */
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-6">
            <Card className="border-border/50"><CardHeader><CardTitle className="text-base">Full Script</CardTitle></CardHeader><CardContent><div className="bg-muted/30 rounded-lg p-4 max-h-[300px] overflow-y-auto">{scenes.map((scene, i) => <p key={i} className="text-sm leading-relaxed mb-3 last:mb-0"><span className="text-primary font-medium text-xs mr-2">[{scene.scene_number}]</span>{scene.voiceover_text}</p>)}</div>
              {(() => {
                const activeModel = MODEL_PRESETS.find(m => m.id === voiceModelId);
                const charLimit = activeModel?.charLimit ?? 10_000;
                const overLimit = fullScript.length > charLimit;
                return (
                  <p className={`text-xs mt-2 ${overLimit ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                    {fullScript.length.toLocaleString()} / {charLimit.toLocaleString()} characters
                    {overLimit && ` — exceeds ${activeModel?.name ?? "model"} limit! Reduce scenes or switch model.`}
                  </p>
                );
              })()}
            </CardContent></Card>
            <Card className="border-border/50"><CardHeader><CardTitle className="text-base">Voice Settings</CardTitle></CardHeader><CardContent className="space-y-5">
              {/* Model selector */}
              <div className="space-y-2">
                <Label>Model</Label>
                <Select value={voiceModelId} onValueChange={(v: string) => {
                  const newModel = v as VoiceModelId;
                  setVoiceModelId(newModel);
                  // Auto-apply optimal defaults when switching models
                  const preset = MODEL_PRESETS.find(m => m.id === newModel);
                  if (preset) setVoiceSettings({ ...preset.defaultSettings });
                }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MODEL_PRESETS.map((m) => (
                      <SelectItem key={m.id} value={m.id}>{m.name} — {m.description}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {(() => {
                  const activeModel = MODEL_PRESETS.find(m => m.id === voiceModelId);
                  if (!activeModel) return null;
                  return (
                    <div className="text-xs text-muted-foreground flex items-center gap-2 mt-1">
                      <span>{activeModel.charLimit.toLocaleString()} char limit</span>
                      <span className="text-muted-foreground/40">·</span>
                      {activeModel.supportsAudioTags
                        ? <span className="text-green-500">Audio tags supported</span>
                        : <span>No audio tags</span>}
                    </div>
                  );
                })()}
              </div>
              <Separator />
              <div className="space-y-2"><Label>Voice</Label><Select value={voiceId} onValueChange={setVoiceId}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{VOICE_PRESETS.map((v) => <SelectItem key={v.id} value={v.id}>{v.name} — {v.description}</SelectItem>)}</SelectContent></Select></div>
              <Separator />
              <div className="space-y-2">
                <div className="flex items-center justify-between"><Label className="text-sm">Stability</Label><span className="text-xs font-mono text-muted-foreground">{voiceSettings.stability.toFixed(2)}</span></div>
                <Slider value={[voiceSettings.stability]} onValueChange={([v]) => setVoiceSettings({ stability: v })} min={0} max={1} step={0.05} />
                <p className="text-xs text-muted-foreground">
                  {voiceModelId === "eleven_v3"
                    ? (voiceSettings.stability <= 0.25 ? "Creative — max expressiveness, audio tags responsive" : voiceSettings.stability <= 0.75 ? "Natural — balanced, closest to original voice" : "Robust — very stable, less responsive to prompts")
                    : "Low = more emotional variation · High = more consistent, sounds more like you"}
                </p>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between"><Label className="text-sm">Similarity</Label><span className="text-xs font-mono text-muted-foreground">{voiceSettings.similarity_boost.toFixed(2)}</span></div>
                <Slider value={[voiceSettings.similarity_boost]} onValueChange={([v]) => setVoiceSettings({ similarity_boost: v })} min={0} max={1} step={0.05} />
                <p className="text-xs text-muted-foreground">Higher = sounds more like your original voice</p>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between"><Label className="text-sm">Style</Label><span className="text-xs font-mono text-muted-foreground">{voiceSettings.style.toFixed(2)}</span></div>
                <Slider value={[voiceSettings.style]} onValueChange={([v]) => setVoiceSettings({ style: v })} min={0} max={1} step={0.05} />
                <p className="text-xs text-muted-foreground">Amplifies speaker style — higher adds latency</p>
              </div>
            </CardContent></Card>
          </div>
          <div className="space-y-6">
            <Card className="border-border/50"><CardContent className="pt-6"><Button onClick={handleGenerate} disabled={isGenerating} className="w-full gap-2 bg-primary text-primary-foreground hover:bg-primary/90" size="lg">{isGenerating ? <><Loader2 className="h-5 w-5 animate-spin" />Generating Voiceover...</> : voiceover ? <><RefreshCw className="h-5 w-5" />Regenerate Voiceover</> : <><Mic className="h-5 w-5" />Generate Voiceover</>}</Button>{error && <p className="text-sm text-destructive mt-3">{error}</p>}</CardContent></Card>
            {voiceover && <Card className="border-border/50"><CardHeader><CardTitle className="text-base flex items-center gap-2"><Volume2 className="h-4 w-4 text-primary" />Voiceover Preview</CardTitle></CardHeader><CardContent><div className="flex items-center gap-3"><Button size="sm" variant="outline" onClick={togglePlayback} className="gap-2">{isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}{isPlaying ? "Pause" : "Play"}</Button><span className="text-xs text-muted-foreground">{voiceover.wordTimestamps.length} words synced</span></div></CardContent></Card>}
            <Card className="border-border/50"><CardHeader><CardTitle className="text-base flex items-center gap-2"><Music className="h-4 w-4 text-primary" />Background Music</CardTitle></CardHeader><CardContent className="space-y-4">
              {backgroundMusic ? <div className="flex items-center justify-between bg-muted/30 rounded-lg p-3"><div className="flex items-center gap-2"><Music className="h-4 w-4 text-muted-foreground" /><span className="text-sm truncate max-w-[200px]">{backgroundMusic.name}</span></div><Button size="sm" variant="ghost" onClick={() => setBackgroundMusic(null)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></Button></div> : <div className="border-2 border-dashed border-border/50 rounded-lg p-6 text-center cursor-pointer hover:border-primary/30 transition-colors" onClick={() => musicInputRef.current?.click()}><Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" /><p className="text-sm text-muted-foreground">Drop a music file or click to upload</p></div>}
              <input ref={musicInputRef} type="file" accept="audio/*" className="hidden" onChange={handleMusicUpload} />
            </CardContent></Card>
            <Card className="border-border/50"><CardHeader><CardTitle className="text-base">Volume Mixer</CardTitle></CardHeader><CardContent className="space-y-5">
              <div className="space-y-2"><div className="flex items-center justify-between"><Label className="text-sm flex items-center gap-2"><Volume2 className="h-3.5 w-3.5" />Voiceover</Label><span className="text-xs font-mono text-muted-foreground">{volumes.voiceover}%</span></div><Slider value={[volumes.voiceover]} onValueChange={([v]) => setVolumes({ voiceover: v })} min={0} max={100} step={5} /></div>
              <div className="space-y-2"><div className="flex items-center justify-between"><Label className="text-sm flex items-center gap-2"><Music className="h-3.5 w-3.5" />Music</Label><span className="text-xs font-mono text-muted-foreground">{volumes.music}%</span></div><Slider value={[volumes.music]} onValueChange={([v]) => setVolumes({ music: v })} min={0} max={100} step={5} /></div>
            </CardContent></Card>
          </div>
        </div>
      )}

      <div className="flex justify-between pt-4">
        <Button variant="outline" onClick={() => setStep(1)} className="gap-2"><ArrowLeft className="h-4 w-4" />Back to Script</Button>
        <div className="flex gap-2">
          <Button onClick={() => { setAnimationProvider("kling-direct"); setStep(4); }} disabled={!canProceed} variant="outline" className="gap-2">
            <Film className="h-4 w-4" />Skip to Direct Video
          </Button>
          <Button onClick={() => setStep(3)} disabled={!canProceed} className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"><Film className="h-4 w-4" />Generate Images<ArrowRight className="h-4 w-4" /></Button>
        </div>
      </div>
    </div>
  );
}
