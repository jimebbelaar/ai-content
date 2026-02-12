"use client";

import { useState } from "react";
import { useReelStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { ArrowLeft, ArrowRight, Pencil, Check, X, Image as ImageIcon, Mic, Type, Scissors } from "lucide-react";
import { expandScenes } from "@/lib/scene-splitter";

export function ScriptReview() {
  const scenes = useReelStore((s) => s.scenes);
  const setScenes = useReelStore((s) => s.setScenes);
  const updateScene = useReelStore((s) => s.updateScene);
  const setStep = useReelStore((s) => s.setStep);
  const [editingScene, setEditingScene] = useState<number | null>(null);
  const [editValues, setEditValues] = useState<Record<string, string>>({});

  function handleResplit() {
    if (!confirm("Re-split will expand multi-sentence scenes into separate scenes. This resets images and videos. Continue?")) return;
    const expanded = expandScenes(scenes);
    setScenes(expanded);
    setEditingScene(null);
    setEditValues({});
  }

  // Derive clean subtitle text from voiceover text (strip CAPS emphasis, keep everything else)
  function deriveSubtitle(voiceoverText: string): string {
    // Convert ALL-CAPS words back to normal case, but preserve single letters like "I"
    return voiceoverText.replace(/\b([A-Z]{2,})\b/g, (match) => {
      return match.charAt(0) + match.slice(1).toLowerCase();
    });
  }

  function startEdit(index: number) {
    const scene = scenes[index];
    setEditValues({
      voiceover_text: scene.voiceover_text,
      image_prompt: scene.image_prompt,
      animation_prompt: scene.animation_prompt,
      subtitle_text: scene.subtitle_text,
    });
    setEditingScene(index);
  }

  function handleVoiceoverChange(newText: string) {
    const oldVoiceover = editValues.voiceover_text || "";
    const oldSubtitle = editValues.subtitle_text || "";
    // If subtitle was auto-derived from old voiceover (or never manually edited), auto-sync it
    const wasAutoSynced = oldSubtitle === deriveSubtitle(oldVoiceover) || oldSubtitle === oldVoiceover;
    setEditValues((v) => ({
      ...v,
      voiceover_text: newText,
      // Auto-sync subtitle unless the user had manually customized it
      ...(wasAutoSynced ? { subtitle_text: deriveSubtitle(newText) } : {}),
    }));
  }

  function saveEdit(index: number) { updateScene(index, editValues); setEditingScene(null); setEditValues({}); }
  function cancelEdit() { setEditingScene(null); setEditValues({}); }

  return (
    <div className="space-y-8 pt-4">
      <div className="flex items-center justify-between">
        <div><h2 className="text-2xl font-bold tracking-tight">Review Your Script</h2><p className="text-muted-foreground mt-1">{scenes.length} scenes generated. Edit any scene before generating the voiceover.</p></div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleResplit} className="gap-1.5 text-xs" title="Re-split multi-sentence scenes into separate scenes"><Scissors className="h-3.5 w-3.5" />Re-split</Button>
          <Button variant="outline" onClick={() => setStep(0)} className="gap-2"><ArrowLeft className="h-4 w-4" />Back</Button>
          <Button onClick={() => setStep(2)} className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"><Mic className="h-4 w-4" />Generate Voice<ArrowRight className="h-4 w-4" /></Button>
        </div>
      </div>
      <div className="space-y-4">
        {scenes.map((scene, index) => {
          const isEditing = editingScene === index;
          const isShift = index >= scenes.length - 3;
          return (
            <Card key={index} className={`border-border/50 transition-colors ${isShift ? "border-l-4 border-l-primary/60" : "border-l-4 border-l-muted/50"}`}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3"><CardTitle className="text-base">Scene {scene.scene_number}</CardTitle><Badge variant="secondary" className="text-xs font-mono">{scene.time_range}</Badge>{isShift && <Badge className="bg-primary/20 text-primary text-xs">The Shift</Badge>}</div>
                  {!isEditing ? <Button variant="ghost" size="sm" onClick={() => startEdit(index)} className="gap-1 text-muted-foreground hover:text-foreground"><Pencil className="h-3.5 w-3.5" />Edit</Button> : <div className="flex gap-1"><Button variant="ghost" size="sm" onClick={() => saveEdit(index)} className="gap-1 text-green-500 hover:text-green-400"><Check className="h-3.5 w-3.5" />Save</Button><Button variant="ghost" size="sm" onClick={cancelEdit} className="gap-1 text-muted-foreground"><X className="h-3.5 w-3.5" /></Button></div>}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wider">Voiceover</Label>
                  {isEditing ? <Textarea value={editValues.voiceover_text} onChange={(e) => handleVoiceoverChange(e.target.value)} className="text-sm min-h-[60px]" /> : <p className="text-sm leading-relaxed">{scene.voiceover_text}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-1"><Type className="h-3 w-3" />Subtitle</Label>
                  {isEditing ? (
                    <div className="space-y-1">
                      <Textarea value={editValues.subtitle_text} onChange={(e) => setEditValues((v) => ({ ...v, subtitle_text: e.target.value }))} className="text-sm min-h-[40px]" />
                      <p className="text-[10px] text-muted-foreground/60">Auto-synced from voiceover. Edit to override.</p>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground leading-relaxed">{scene.subtitle_text || scene.voiceover_text}</p>
                  )}
                </div>
                <div className="space-y-1.5"><Label className="text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-1"><ImageIcon className="h-3 w-3" />Image Prompt</Label>{isEditing ? <Textarea value={editValues.image_prompt} onChange={(e) => setEditValues((v) => ({ ...v, image_prompt: e.target.value }))} className="text-xs min-h-[80px] font-mono" /> : <p className="text-xs text-muted-foreground leading-relaxed font-mono bg-muted/30 rounded-md p-2">{scene.image_prompt}</p>}</div>
                <div className="space-y-1.5"><Label className="text-xs text-muted-foreground uppercase tracking-wider">Animation Prompt</Label>{isEditing ? <Textarea value={editValues.animation_prompt} onChange={(e) => setEditValues((v) => ({ ...v, animation_prompt: e.target.value }))} className="text-xs min-h-[60px] font-mono" /> : <p className="text-xs text-muted-foreground leading-relaxed font-mono bg-muted/30 rounded-md p-2">{scene.animation_prompt}</p>}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>
      <div className="flex justify-between pt-4">
        <Button variant="outline" onClick={() => setStep(0)} className="gap-2"><ArrowLeft className="h-4 w-4" />Back to Concept</Button>
        <Button onClick={() => setStep(2)} className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"><Mic className="h-4 w-4" />Generate Voice<ArrowRight className="h-4 w-4" /></Button>
      </div>
    </div>
  );
}
