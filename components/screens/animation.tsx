"use client";

import { useState, useCallback, useRef } from "react";
import { useReelStore } from "@/lib/store";
import { animateImage, generateDirectVideo, saveAssetToServer, updateProjectOnServer } from "@/lib/api";
import type { AnimationProvider } from "@/lib/api";
import { ANIMATION_STYLE_PREFIX } from "@/lib/prompts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { ArrowLeft, ArrowRight, Check, RefreshCw, X, Film, Loader2, Play, Upload } from "lucide-react";

// Build a cinematic Kling prompt from scene data (optimized for text-to-video)
function buildKlingDirectPrompt(scene: { image_prompt: string; animation_prompt: string; color_mood?: string; voiceover_text: string }): string {
  // Kling prompt formula: [Subject], [subject description], [subject movement], [scene]. [Scene description]. [camera, lighting, atmosphere]
  // Extract the visual scene from image_prompt (skip the "Oil painting" prefix since Kling does video)
  const visualScene = scene.image_prompt
    .replace(/^Oil painting,?\s*/i, "")
    .replace(/9:16 vertical composition\.?\s*/i, "")
    .replace(/visible brushwork.*?texture\.?\s*/i, "")
    .replace(/oil on canvas.*?\.?\s*/i, "")
    .replace(/No text.*?image\.?\s*/i, "")
    .replace(/no watermark.*?\.?\s*/i, "")
    .trim();

  // Build cinematic video prompt
  return `Cinematic scene, ${visualScene}. ${scene.animation_prompt.replace(/maintain.*?style.*?\./i, "").replace(/painterly texture preserved.*?\./i, "").trim()}. Dramatic cinematic lighting, shallow depth of field, film grain, 24fps cinematic motion. ${scene.color_mood ? `Color mood: ${scene.color_mood}.` : ""}`;
}

export function Animation() {
  const scenes = useReelStore((s) => s.scenes);
  const images = useReelStore((s) => s.images);
  const videos = useReelStore((s) => s.videos);
  const setVideo = useReelStore((s) => s.setVideo);
  const videoApprovals = useReelStore((s) => s.videoApprovals);
  const approveVideo = useReelStore((s) => s.approveVideo);
  const clearVideo = useReelStore((s) => s.clearVideo);
  const aspectRatio = useReelStore((s) => s.aspectRatio);
  const animationProvider = useReelStore((s) => s.animationProvider);
  const setAnimationProvider = useReelStore((s) => s.setAnimationProvider);
  const projectId = useReelStore((s) => s.projectId);
  const setStep = useReelStore((s) => s.setStep);
  const [animatingScenes, setAnimatingScenes] = useState<Record<number, boolean>>({});
  const [statusMessages, setStatusMessages] = useState<Record<number, string>>({});
  const [errors, setErrors] = useState<Record<number, string>>({});
  // Manual video upload
  const videoUploadRef = useRef<HTMLInputElement>(null);
  const [uploadScene, setUploadScene] = useState<number | null>(null);

  const isDirect = animationProvider === "kling-direct";
  const approvedCount = scenes.filter((_, i) => videoApprovals[i]).length;
  const allApproved = approvedCount === scenes.length && scenes.length > 0;
  const progress = scenes.length > 0 ? (approvedCount / scenes.length) * 100 : 0;

  const handleAnimate = useCallback(async (index: number) => {
    setAnimatingScenes((s) => ({ ...s, [index]: true }));
    setErrors((e) => { const next = { ...e }; delete next[index]; return next; });

    try {
      let videoBase64: string;

      if (animationProvider === "kling-direct") {
        // Direct text-to-video — no image needed
        const scene = scenes[index];
        const prompt = buildKlingDirectPrompt(scene);
        videoBase64 = await generateDirectVideo(
          prompt, aspectRatio,
          (status) => setStatusMessages((s) => ({ ...s, [index]: status })),
          "text overlay, watermark, UI elements, blurry, distorted, low quality"
        );
      } else {
        // Image-to-video (Veo or Kling)
        const imgData = images[index];
        if (!imgData) {
          setErrors((e) => ({ ...e, [index]: "No image available. Generate an image first or switch to Kling Direct." }));
          setAnimatingScenes((s) => ({ ...s, [index]: false }));
          return;
        }

        const scene = scenes[index];
        const fullPrompt = `${ANIMATION_STYLE_PREFIX} ${scene.animation_prompt}`;

        let imageBase64 = imgData;
        if (imgData.startsWith("data:")) imageBase64 = imgData.split(",")[1];
        else if (imgData.startsWith("/api/")) {
          const resp = await fetch(imgData);
          const buf = await resp.arrayBuffer();
          // Convert to base64 in chunks to avoid stack overflow on large images
          const bytes = new Uint8Array(buf);
          let binary = "";
          const chunkSize = 8192;
          for (let i = 0; i < bytes.length; i += chunkSize) {
            binary += String.fromCharCode(...bytes.slice(i, i + chunkSize));
          }
          imageBase64 = btoa(binary);
        }

        videoBase64 = await animateImage(
          imageBase64, "image/png", fullPrompt, aspectRatio,
          (status) => setStatusMessages((s) => ({ ...s, [index]: status })),
          animationProvider as AnimationProvider
        );
      }

      setVideo(index, `data:video/mp4;base64,${videoBase64}`);
      approveVideo(index, false);

      if (projectId) {
        await saveAssetToServer(projectId, `video-${index}.mp4`, videoBase64);
        await updateProjectOnServer(projectId, { currentStep: 4 });
      }
    } catch (err) {
      setErrors((e) => ({ ...e, [index]: err instanceof Error ? err.message : "Animation failed" }));
    } finally {
      setAnimatingScenes((s) => ({ ...s, [index]: false }));
      setStatusMessages((s) => { const next = { ...s }; delete next[index]; return next; });
    }
  }, [scenes, images, aspectRatio, animationProvider, setVideo, approveVideo, projectId]);

  const handleApproveVideo = useCallback(async (index: number, approved: boolean) => {
    approveVideo(index, approved);
    if (projectId) {
      const newApprovals = { ...videoApprovals, [index]: approved };
      await updateProjectOnServer(projectId, { videoApprovals: newApprovals });
    }
  }, [approveVideo, videoApprovals, projectId]);

  async function handleBatchAnimate() {
    let generated = 0;
    for (let i = 0; i < scenes.length; i++) {
      if (!videos[i] && !animatingScenes[i]) {
        if (!isDirect && !images[i]) continue;
        // Add delay between scenes to avoid rate limits (especially for Kling)
        if (generated > 0 && (animationProvider === "kling" || animationProvider === "kling-direct")) {
          await new Promise(r => setTimeout(r, 15000)); // 15s between Kling requests
        }
        await handleAnimate(i);
        generated++;
      }
    }
  }

  // Manual video upload — directly set as the scene video
  function handleVideoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || uploadScene === null) return;
    const sceneIdx = uploadScene;
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      setVideo(sceneIdx, dataUrl);
      approveVideo(sceneIdx, false);
      // Auto-save to disk
      if (projectId) {
        const base64 = dataUrl.split(",")[1];
        await saveAssetToServer(projectId, `video-${sceneIdx}.mp4`, base64);
      }
      setUploadScene(null);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  return (
    <div className="space-y-8 pt-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">
            {isDirect ? "Generate Videos" : "Animate Images"}
          </h2>
          <p className="text-muted-foreground mt-1">
            {isDirect
              ? "Generate video clips directly from your script using Kling AI. No images needed."
              : "Add subtle living animation to each scene image."}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setStep(isDirect ? 2 : 3)} className="gap-2">
            <ArrowLeft className="h-4 w-4" />{isDirect ? "Voice" : "Images"}
          </Button>
          <Button onClick={() => setStep(5)} disabled={!allApproved} className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90">
            <Film className="h-4 w-4" />Assemble<ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Provider Selector */}
      <div className="flex items-center gap-4 bg-card/50 border border-border/50 rounded-lg p-4">
        <div className="space-y-1 flex-1">
          <Label className="text-sm font-medium">Video Generation Mode</Label>
          <p className="text-xs text-muted-foreground">
            {isDirect
              ? "Kling generates video directly from text — faster, no images needed, good for rapid iteration"
              : animationProvider === "kling"
              ? "Kling animates your approved images — good face preservation"
              : "Veo 3.1 animates your approved images — best overall quality"}
          </p>
        </div>
        <Select value={animationProvider} onValueChange={(v) => setAnimationProvider(v as "veo" | "kling" | "kling-direct")}>
          <SelectTrigger className="w-[260px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="veo">Veo 3.1 — Image-to-video (best quality)</SelectItem>
            <SelectItem value="kling">Kling — Image-to-video (good faces)</SelectItem>
            <SelectItem value="kling-direct">Kling Direct — Text-to-video (skip images)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Hidden file input for manual video upload */}
      <input ref={videoUploadRef} type="file" accept="video/*" className="hidden" onChange={handleVideoUpload} />

      {isDirect && (
        <div className="bg-primary/10 border border-primary/20 rounded-lg p-3 text-sm text-primary">
          Direct mode: Videos are generated from your script descriptions. You can skip the Images step entirely, or go back and generate images for reference.
        </div>
      )}

      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{approvedCount}/{scenes.length} clips approved</span>
          <Button variant="outline" size="sm" onClick={handleBatchAnimate} disabled={Object.values(animatingScenes).some(Boolean)} className="gap-1">
            <Film className="h-3.5 w-3.5" />{isDirect ? "Generate All" : "Animate All Missing"}
          </Button>
        </div>
        <Progress value={progress} className="h-2" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {scenes.map((scene, index) => {
          const videoData = videos[index];
          const imgData = images[index];
          const isApproved = videoApprovals[index];
          const isAnimating = animatingScenes[index];
          const statusMsg = statusMessages[index];
          const error = errors[index];
          const videoSrc = videoData?.startsWith("data:") || videoData?.startsWith("/api/") ? videoData : videoData ? `data:video/mp4;base64,${videoData}` : null;
          const imgSrc = imgData?.startsWith("data:") || imgData?.startsWith("/api/") ? imgData : imgData ? `data:image/png;base64,${imgData}` : null;
          const canAnimate = isDirect || !!imgSrc;

          return (
            <Card key={index} className={`border-border/50 overflow-hidden transition-all ${isApproved ? "ring-2 ring-green-500/50" : ""}`}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    Scene {scene.scene_number}
                    {scene.time_range && <Badge variant="secondary" className="text-xs font-mono">{scene.time_range}</Badge>}
                  </CardTitle>
                  {isApproved && <Badge className="bg-green-500/20 text-green-400 text-xs gap-1"><Check className="h-3 w-3" />Approved</Badge>}
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2">{scene.subtitle_text || scene.voiceover_text}</p>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="relative aspect-[9/16] max-h-[320px] rounded-lg overflow-hidden bg-muted/30 flex items-center justify-center">
                  {videoSrc ? (
                    <video src={videoSrc} className="h-full w-full object-cover" controls loop muted playsInline />
                  ) : isAnimating ? (
                    <div className="flex flex-col items-center justify-center gap-3 h-full">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                      <span className="text-sm text-muted-foreground">{statusMsg || "Generating..."}</span>
                    </div>
                  ) : imgSrc && !isDirect ? (
                    <div className="relative h-full w-full">
                      <img src={imgSrc} alt={`Scene ${scene.scene_number}`} className="h-full w-full object-cover opacity-60" />
                      <div className="absolute inset-0 flex items-center justify-center"><Play className="h-12 w-12 text-white/50" /></div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-3 text-muted-foreground">
                      <Film className="h-10 w-10 opacity-30" />
                      <span className="text-xs">{isDirect ? "Ready to generate" : "No image"}</span>
                    </div>
                  )}
                </div>
                {error && <p className="text-xs text-destructive">{error}</p>}
                {isDirect && !videoSrc && (
                  <p className="text-xs text-muted-foreground font-mono bg-muted/30 rounded-md p-2 line-clamp-3">
                    {buildKlingDirectPrompt(scene).slice(0, 200)}...
                  </p>
                )}
                <div className="flex gap-2 flex-wrap">
                  {!videoSrc && !isAnimating && canAnimate && (
                    <Button size="sm" onClick={() => handleAnimate(index)} className="gap-1 text-xs bg-primary text-primary-foreground">
                      <Film className="h-3 w-3" />{isDirect ? "Generate" : "Animate"}
                    </Button>
                  )}
                  {!videoSrc && !isAnimating && (
                    <Button size="sm" variant="outline" onClick={() => { setUploadScene(index); videoUploadRef.current?.click(); }} className="gap-1 text-xs">
                      <Upload className="h-3 w-3" />Upload
                    </Button>
                  )}
                  {videoSrc && !isApproved && (
                    <>
                      <Button size="sm" onClick={() => handleApproveVideo(index, true)} className="gap-1 text-xs bg-green-600 text-white hover:bg-green-500"><Check className="h-3 w-3" />Approve</Button>
                      <Button size="sm" variant="outline" onClick={() => { clearVideo(index); handleAnimate(index); }} disabled={isAnimating} className="gap-1 text-xs"><RefreshCw className="h-3 w-3" />Retry</Button>
                    </>
                  )}
                  {videoSrc && (
                    <Button size="sm" variant="ghost" onClick={() => { setUploadScene(index); videoUploadRef.current?.click(); }} className="gap-1 text-xs text-muted-foreground">
                      <Upload className="h-3 w-3" />Replace
                    </Button>
                  )}
                  {isApproved && (
                    <Button size="sm" variant="ghost" onClick={() => handleApproveVideo(index, false)} className="gap-1 text-xs text-muted-foreground"><X className="h-3 w-3" />Unapprove</Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="flex justify-between pt-4">
        <Button variant="outline" onClick={() => setStep(isDirect ? 2 : 3)} className="gap-2">
          <ArrowLeft className="h-4 w-4" />Back to {isDirect ? "Voice" : "Images"}
        </Button>
        <Button onClick={() => setStep(5)} disabled={!allApproved} className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90">
          <Film className="h-4 w-4" />Assemble Video<ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
