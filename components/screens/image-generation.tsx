"use client";

import { useState, useCallback, useRef } from "react";
import { useReelStore } from "@/lib/store";
import { generateImage, saveAssetToServer, updateProjectOnServer } from "@/lib/api";
import { getStyleById, buildChainedImagePrompt } from "@/lib/styles";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, ArrowRight, Check, RefreshCw, Pencil, X, Image as ImageIcon, Film, Loader2, Upload, Trash2, Link } from "lucide-react";

export function ImageGeneration() {
  const scenes = useReelStore((s) => s.scenes);
  const images = useReelStore((s) => s.images);
  const setImage = useReelStore((s) => s.setImage);
  const imageApprovals = useReelStore((s) => s.imageApprovals);
  const approveImage = useReelStore((s) => s.approveImage);
  const clearImage = useReelStore((s) => s.clearImage);
  const concept = useReelStore((s) => s.concept);
  const selectedStyleId = useReelStore((s) => s.selectedStyleId);
  const aspectRatio = useReelStore((s) => s.aspectRatio);
  const projectId = useReelStore((s) => s.projectId);
  const setStep = useReelStore((s) => s.setStep);
  const [generatingScenes, setGeneratingScenes] = useState<Record<number, boolean>>({});
  const [editingPrompt, setEditingPrompt] = useState<number | null>(null);
  const [editedPrompt, setEditedPrompt] = useState("");
  const [errors, setErrors] = useState<Record<number, string>>({});
  // Reference images per scene (optional, for guided regeneration)
  const [referenceImages, setReferenceImages] = useState<Record<number, { base64: string; mimeType: string; name: string }>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeUploadScene, setActiveUploadScene] = useState<number | null>(null);
  // Manual image upload
  const manualImageInputRef = useRef<HTMLInputElement>(null);
  const [manualUploadScene, setManualUploadScene] = useState<number | null>(null);

  const approvedCount = scenes.filter((_, i) => imageApprovals[i]).length;
  const allApproved = approvedCount === scenes.length && scenes.length > 0;
  const progress = scenes.length > 0 ? (approvedCount / scenes.length) * 100 : 0;

  const handleGenerateImage = useCallback(async (index: number, customPrompt?: string) => {
    setGeneratingScenes((s) => ({ ...s, [index]: true }));
    setErrors((e) => { const next = { ...e }; delete next[index]; return next; });
    try {
      const scene = scenes[index];
      const style = getStyleById(selectedStyleId);
      // Use chaining mechanism: context + visual bible + focus + continuity
      const prompt = customPrompt
        ? customPrompt  // Custom prompt used as-is
        : buildChainedImagePrompt(
            style,
            index,
            scenes.length,
            concept || "emotional narrative",
            scene.image_prompt,
            scenes,  // Pass ALL scenes so AI knows the full story
            aspectRatio,
          );
      const ref = referenceImages[index];
      const imageBase64 = await generateImage(prompt, ref?.base64, ref?.mimeType);
      setImage(index, `data:image/png;base64,${imageBase64}`);
      approveImage(index, false);

      // Auto-save to disk
      if (projectId) {
        await saveAssetToServer(projectId, `image-${index}.png`, imageBase64);
        await updateProjectOnServer(projectId, { currentStep: 3 });
      }
    } catch (err) {
      setErrors((e) => ({ ...e, [index]: err instanceof Error ? err.message : "Image generation failed" }));
    } finally {
      setGeneratingScenes((s) => ({ ...s, [index]: false }));
    }
  }, [scenes, setImage, approveImage, projectId, referenceImages]);

  const handleApprove = useCallback(async (index: number, approved: boolean) => {
    approveImage(index, approved);
    if (projectId) {
      const newApprovals = { ...imageApprovals, [index]: approved };
      await updateProjectOnServer(projectId, { imageApprovals: newApprovals });
    }
  }, [approveImage, imageApprovals, projectId]);

  function handleReferenceUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || activeUploadScene === null) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(",")[1];
      const mimeType = file.type || "image/png";
      setReferenceImages((prev) => ({
        ...prev,
        [activeUploadScene]: { base64, mimeType, name: file.name },
      }));
      setActiveUploadScene(null);
    };
    reader.readAsDataURL(file);
    // Reset input so the same file can be re-selected
    e.target.value = "";
  }

  function removeReference(index: number) {
    setReferenceImages((prev) => {
      const next = { ...prev };
      delete next[index];
      return next;
    });
  }

  // Manual image upload — directly set as the scene image
  function handleManualImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || manualUploadScene === null) return;
    const sceneIdx = manualUploadScene;
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      setImage(sceneIdx, dataUrl);
      approveImage(sceneIdx, false);
      // Auto-save to disk
      if (projectId) {
        const base64 = dataUrl.split(",")[1];
        await saveAssetToServer(projectId, `image-${sceneIdx}.png`, base64);
      }
      setManualUploadScene(null);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  // Use previous scene's image as style reference
  async function usePrevAsReference(index: number) {
    if (index <= 0) return;
    const prevImg = images[index - 1];
    if (!prevImg) return;

    // Extract base64 from the previous image (could be data URL, asset URL, or raw)
    let base64: string;
    let mimeType = "image/png";
    if (prevImg.startsWith("data:")) {
      mimeType = prevImg.split(";")[0].split(":")[1] || "image/png";
      base64 = prevImg.split(",")[1];
    } else if (prevImg.startsWith("/api/") || prevImg.startsWith("http")) {
      const resp = await fetch(prevImg);
      const blob = await resp.blob();
      mimeType = blob.type || "image/png";
      const buf = await blob.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary = "";
      const chunk = 8192;
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.slice(i, i + chunk));
      }
      base64 = btoa(binary);
    } else {
      base64 = prevImg;
    }

    setReferenceImages((prev) => ({
      ...prev,
      [index]: { base64, mimeType, name: `Scene ${index} style` },
    }));
  }

  async function handleBatchGenerate() {
    for (let i = 0; i < scenes.length; i++) {
      if (!images[i] && !generatingScenes[i]) {
        // Auto-use previous image as reference for consistency (except scene 1)
        if (i > 0 && images[i - 1] && !referenceImages[i]) {
          await usePrevAsReference(i);
        }
        await handleGenerateImage(i);
      }
    }
  }

  return (
    <div className="space-y-8 pt-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Generate Images</h2>
          <p className="text-muted-foreground mt-1">Generate oil paintings for each scene. Upload a reference image for style guidance.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setStep(2)} className="gap-2"><ArrowLeft className="h-4 w-4" />Voice</Button>
          <Button onClick={() => setStep(4)} disabled={!allApproved} className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"><Film className="h-4 w-4" />Animate<ArrowRight className="h-4 w-4" /></Button>
        </div>
      </div>

      {/* Hidden file inputs */}
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleReferenceUpload} />
      <input ref={manualImageInputRef} type="file" accept="image/*,video/*" className="hidden" onChange={handleManualImageUpload} />

      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{approvedCount}/{scenes.length} scenes approved</span>
          <Button variant="outline" size="sm" onClick={handleBatchGenerate} disabled={Object.values(generatingScenes).some(Boolean)} className="gap-1">
            <ImageIcon className="h-3.5 w-3.5" />Generate All Missing
          </Button>
        </div>
        <Progress value={progress} className="h-2" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {scenes.map((scene, index) => {
          const imageData = images[index];
          const isApproved = imageApprovals[index];
          const isGenerating = generatingScenes[index];
          const error = errors[index];
          const isEditingPrompt = editingPrompt === index;
          const ref = referenceImages[index];
          const imgSrc = imageData?.startsWith("data:") || imageData?.startsWith("/api/") ? imageData : imageData ? `data:image/png;base64,${imageData}` : null;

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
                {/* Image Preview */}
                <div className="relative aspect-[9/16] max-h-[320px] rounded-lg overflow-hidden bg-muted/30 flex items-center justify-center">
                  {imgSrc ? (
                    <img src={imgSrc} alt={`Scene ${scene.scene_number}`} className="h-full w-full object-cover" />
                  ) : isGenerating ? (
                    <div className="flex flex-col items-center gap-3 text-muted-foreground">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                      <span className="text-sm">Generating...</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-3 text-muted-foreground">
                      <ImageIcon className="h-10 w-10 opacity-30" />
                      <span className="text-xs">No image yet</span>
                    </div>
                  )}
                </div>

                {/* Error */}
                {error && <p className="text-xs text-destructive">{error}</p>}

                {/* Reference Image (if attached) */}
                {ref && (
                  <div className="flex items-center gap-2 bg-muted/30 rounded-md p-2">
                    <img src={`data:${ref.mimeType};base64,${ref.base64}`} alt="Reference" className="h-10 w-10 rounded object-cover" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{ref.name}</p>
                      <p className="text-xs text-muted-foreground">Reference image</p>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => removeReference(index)} className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                )}

                {/* Prompt Editor */}
                {isEditingPrompt && (
                  <div className="space-y-2">
                    <Textarea value={editedPrompt} onChange={(e) => setEditedPrompt(e.target.value)} className="text-xs font-mono min-h-[80px]" />
                    <div className="flex gap-1">
                      <Button size="sm" onClick={() => { handleGenerateImage(index, editedPrompt); setEditingPrompt(null); }} className="gap-1 text-xs bg-primary text-primary-foreground">
                        <RefreshCw className="h-3 w-3" />Regenerate
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingPrompt(null)}>
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex gap-2 flex-wrap">
                  {!imgSrc && !isGenerating && (
                    <>
                      <Button size="sm" onClick={() => handleGenerateImage(index)} className="gap-1 text-xs bg-primary text-primary-foreground">
                        <ImageIcon className="h-3 w-3" />Generate
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => { setManualUploadScene(index); manualImageInputRef.current?.click(); }} className="gap-1 text-xs">
                        <Upload className="h-3 w-3" />Upload
                      </Button>
                    </>
                  )}

                  {imgSrc && !isApproved && (
                    <>
                      <Button size="sm" onClick={() => handleApprove(index, true)} className="gap-1 text-xs bg-green-600 text-white hover:bg-green-500">
                        <Check className="h-3 w-3" />Approve
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleGenerateImage(index)} disabled={isGenerating} className="gap-1 text-xs">
                        <RefreshCw className="h-3 w-3" />Retry
                      </Button>
                    </>
                  )}

                  {imgSrc && (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => { setEditedPrompt(scene.image_prompt); setEditingPrompt(index); }} className="gap-1 text-xs text-muted-foreground">
                        <Pencil className="h-3 w-3" />Edit Prompt
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => { setActiveUploadScene(index); fileInputRef.current?.click(); }} className="gap-1 text-xs text-muted-foreground">
                        <Upload className="h-3 w-3" />Reference
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => { setManualUploadScene(index); manualImageInputRef.current?.click(); }} className="gap-1 text-xs text-muted-foreground">
                        <Upload className="h-3 w-3" />Replace
                      </Button>
                    </>
                  )}

                  {/* Use previous scene's image as style reference */}
                  {index > 0 && images[index - 1] && (
                    <Button size="sm" variant="ghost" onClick={() => usePrevAsReference(index)} className={`gap-1 text-xs ${ref ? "text-primary" : "text-muted-foreground"}`}>
                      <Link className="h-3 w-3" />{ref ? "Linked" : "Match prev"}
                    </Button>
                  )}

                  {!imgSrc && !isGenerating && !ref && index > 0 && !images[index - 1] && (
                    <Button size="sm" variant="ghost" onClick={() => { setActiveUploadScene(index); fileInputRef.current?.click(); }} className="gap-1 text-xs text-muted-foreground">
                      <Upload className="h-3 w-3" />Add Reference
                    </Button>
                  )}

                  {isApproved && (
                    <Button size="sm" variant="ghost" onClick={() => handleApprove(index, false)} className="gap-1 text-xs text-muted-foreground">
                      <X className="h-3 w-3" />Unapprove
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="flex justify-between pt-4">
        <Button variant="outline" onClick={() => setStep(2)} className="gap-2"><ArrowLeft className="h-4 w-4" />Back to Voice</Button>
        <div className="flex gap-2">
          <Button onClick={() => setStep(5)} disabled={!allApproved} variant="outline" className="gap-2">
            <Film className="h-4 w-4" />Skip to Assembly (images only)
          </Button>
          <Button onClick={() => setStep(4)} disabled={!allApproved} className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"><Film className="h-4 w-4" />Animate Images<ArrowRight className="h-4 w-4" /></Button>
        </div>
      </div>
    </div>
  );
}
