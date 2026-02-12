"use client";

import { useState } from "react";
import { useReelStore } from "@/lib/store";
import { generateScript, createProjectOnServer, updateProjectOnServer } from "@/lib/api";
import { expandScenes } from "@/lib/scene-splitter";
import { VISUAL_STYLES } from "@/lib/styles";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkles, AlertCircle, Palette } from "lucide-react";

export function ConceptInput() {
  const concept = useReelStore((s) => s.concept);
  const setConcept = useReelStore((s) => s.setConcept);
  const sceneCount = useReelStore((s) => s.sceneCount);
  const setSceneCount = useReelStore((s) => s.setSceneCount);
  const aspectRatio = useReelStore((s) => s.aspectRatio);
  const setAspectRatio = useReelStore((s) => s.setAspectRatio);
  const selectedStyleId = useReelStore((s) => s.selectedStyleId);
  const setSelectedStyleId = useReelStore((s) => s.setSelectedStyleId);
  const voiceModelId = useReelStore((s) => s.voiceModelId);
  const voiceId = useReelStore((s) => s.voiceId);
  const voiceSettings = useReelStore((s) => s.voiceSettings);
  const setScenes = useReelStore((s) => s.setScenes);
  const setStep = useReelStore((s) => s.setStep);
  const setProjectId = useReelStore((s) => s.setProjectId);
  const loading = useReelStore((s) => s.loading);
  const setLoading = useReelStore((s) => s.setLoading);
  const [error, setError] = useState<string | null>(null);
  const isGenerating = loading["script"];

  const selectedStyle = VISUAL_STYLES.find(s => s.id === selectedStyleId) || VISUAL_STYLES[0];

  async function handleGenerate() {
    if (!concept.trim()) return;
    setError(null);
    setLoading("script", true);
    try {
      const rawScenes = await generateScript(concept, sceneCount, selectedStyleId, aspectRatio);
      const scenes = expandScenes(rawScenes);
      setScenes(scenes);
      const project = await createProjectOnServer(concept, { aspectRatio, sceneCount, voiceModelId, voiceId, voiceSettings, selectedStyleId });
      setProjectId(project.id);
      await updateProjectOnServer(project.id, { scenes: scenes as unknown as Record<string, unknown>[], currentStep: 1 });
      setStep(1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate script");
    } finally {
      setLoading("script", false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8 pt-4">
      <div className="text-center space-y-3">
        <h2 className="text-3xl font-bold tracking-tight">What&apos;s the concept for this reel?</h2>
        <p className="text-muted-foreground max-w-lg mx-auto">Describe your idea and we&apos;ll generate a complete script with scenes, visuals, and voiceover.</p>
      </div>

      <Textarea placeholder={`e.g. "Nietzsche's quote about seeing too much — how it relates to ADHD hyperawareness and why it's actually a gift, not a curse"`} value={concept} onChange={(e) => setConcept(e.target.value)} className="min-h-[140px] resize-none text-base leading-relaxed bg-card border-border/50 focus:border-primary/50" disabled={isGenerating} />

      {/* Style Selector */}
      <Card className="border-border/50 bg-card/50">
        <CardContent className="pt-5 space-y-3">
          <div className="flex items-center gap-2 mb-2">
            <Palette className="h-4 w-4 text-primary" />
            <Label className="text-sm font-medium">Visual Style</Label>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {VISUAL_STYLES.map((style) => (
              <button
                key={style.id}
                onClick={() => setSelectedStyleId(style.id)}
                disabled={isGenerating}
                className={`text-left p-3 rounded-lg border transition-all ${
                  selectedStyleId === style.id
                    ? "border-primary bg-primary/10 ring-1 ring-primary/30"
                    : "border-border/50 hover:border-border hover:bg-muted/20"
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-medium">{style.name}</span>
                  <Badge variant="secondary" className="text-[10px] px-1 py-0">T{style.tier}</Badge>
                </div>
                <p className="text-[11px] text-muted-foreground line-clamp-2">{style.description}</p>
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">{selectedStyle.bestFor}</p>
        </CardContent>
      </Card>

      {/* Settings */}
      <Card className="border-border/50 bg-card/50">
        <CardContent className="pt-6 space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="space-y-3">
              <div className="flex items-center justify-between"><Label>Number of Scenes</Label><span className="text-sm font-mono text-primary">{sceneCount}</span></div>
              <Slider value={[sceneCount]} onValueChange={([v]) => setSceneCount(v)} min={6} max={20} step={1} disabled={isGenerating} />
              <p className="text-xs text-muted-foreground">6 scenes (~25s) to 20 scenes (~80s). More scenes = faster cuts = higher retention.</p>
            </div>
            <div className="space-y-3">
              <Label>Aspect Ratio</Label>
              <Select value={aspectRatio} onValueChange={(v) => setAspectRatio(v as "9:16" | "16:9")} disabled={isGenerating}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="9:16">9:16 — Vertical (Reels / TikTok)</SelectItem>
                  <SelectItem value="16:9">16:9 — Horizontal (YouTube)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {error && <div className="flex items-start gap-3 rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive"><AlertCircle className="h-5 w-5 shrink-0 mt-0.5" /><p>{error}</p></div>}

      <div className="flex justify-center">
        <Button size="lg" onClick={handleGenerate} disabled={!concept.trim() || isGenerating} className="gap-2 px-8 text-base bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          {isGenerating ? (<><div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />Generating Script...</>) : (<><Sparkles className="h-5 w-5" />Generate Script</>)}
        </Button>
      </div>
    </div>
  );
}
