"use client";

import { useEffect, useState, useCallback } from "react";
import { useReelStore, type ProjectMeta } from "@/lib/store";
import { listProjectsFromServer, loadProjectFromServer, deleteProjectOnServer, getAssetUrl } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { STEPS } from "@/lib/store";
import { FolderOpen, Trash2, Clock, Film, Plus, Loader2, X } from "lucide-react";

export function ProjectBrowser() {
  const showProjectBrowser = useReelStore((s) => s.showProjectBrowser);
  const setShowProjectBrowser = useReelStore((s) => s.setShowProjectBrowser);
  const loadProjectData = useReelStore((s) => s.loadProjectData);
  const resetPipeline = useReelStore((s) => s.resetPipeline);

  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const fetchProjects = useCallback(async () => {
    setLoadingList(true);
    try {
      const list = await listProjectsFromServer();
      setProjects(list);
    } catch (e) {
      console.error("Failed to load projects:", e);
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    if (showProjectBrowser) fetchProjects();
  }, [showProjectBrowser, fetchProjects]);

  async function handleLoad(id: string) {
    setLoadingId(id);
    try {
      const meta = await loadProjectFromServer(id);

      // Load images from saved assets
      const images: Record<number, string> = {};
      const videos: Record<number, string> = {};

      for (let i = 0; i < (meta.scenes?.length || 0); i++) {
        if (meta.imageApprovals?.[i] || meta.scenes?.[i]) {
          // Use asset URL instead of base64 — the browser will fetch it
          images[i] = getAssetUrl(id, `image-${i}.png`);
        }
        if (meta.videoApprovals?.[i]) {
          videos[i] = getAssetUrl(id, `video-${i}.mp4`);
        }
      }

      // Load voiceover if it exists
      let voiceover = null;
      if (meta.hasVoiceover) {
        voiceover = {
          audioBase64: "", // Will use asset URL instead
          wordTimestamps: meta.wordTimestamps || [],
          audioUrl: getAssetUrl(id, "voiceover.mp3"),
        };
      }

      loadProjectData(
        meta,
        images,
        videos,
        voiceover as Parameters<typeof loadProjectData>[3],
        meta.backgroundMusicName ? { dataUrl: getAssetUrl(id, "music.mp3"), name: meta.backgroundMusicName } : null,
      );
    } catch (e) {
      console.error("Failed to load project:", e);
    } finally {
      setLoadingId(null);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this project and all its assets?")) return;
    try {
      await deleteProjectOnServer(id);
      setProjects((p) => p.filter((pr) => pr.id !== id));
    } catch (e) {
      console.error("Failed to delete project:", e);
    }
  }

  function handleNewProject() {
    resetPipeline();
    setShowProjectBrowser(false);
  }

  if (!showProjectBrowser) return null;

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm overflow-y-auto">
      <div className="mx-auto max-w-4xl px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Your Reels</h2>
            <p className="text-muted-foreground mt-1">Open a previous project or start a new one.</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleNewProject} className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90">
              <Plus className="h-4 w-4" />New Reel
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setShowProjectBrowser(false)}>
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {loadingList ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : projects.length === 0 ? (
          <div className="text-center py-20">
            <Film className="h-16 w-16 mx-auto text-muted-foreground/20 mb-4" />
            <p className="text-muted-foreground">No projects yet. Create your first reel!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {projects.map((project) => {
              const stepInfo = STEPS[Math.min(project.currentStep, STEPS.length - 1)];
              const isLoading = loadingId === project.id;
              const date = new Date(project.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
              const approvedImages = Object.values(project.imageApprovals || {}).filter(Boolean).length;
              const approvedVideos = Object.values(project.videoApprovals || {}).filter(Boolean).length;
              const totalScenes = project.scenes?.length || 0;

              return (
                <Card key={project.id} className="border-border/50 hover:border-primary/30 transition-colors cursor-pointer group" onClick={() => handleLoad(project.id)}>
                  <CardContent className="pt-5 space-y-3">
                    {/* Thumbnail row */}
                    <div className="flex gap-1.5 h-16 rounded-md overflow-hidden bg-muted/30">
                      {totalScenes > 0 ? (
                        Array.from({ length: Math.min(totalScenes, 4) }).map((_, i) => (
                          <div key={i} className="flex-1 bg-muted/50 overflow-hidden">
                            {project.imageApprovals?.[i] && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={getAssetUrl(project.id, `image-${i}.png`)} alt="" className="h-full w-full object-cover" />
                            )}
                          </div>
                        ))
                      ) : (
                        <div className="flex-1 flex items-center justify-center"><Film className="h-6 w-6 text-muted-foreground/30" /></div>
                      )}
                    </div>

                    {/* Title */}
                    <p className="text-sm font-medium line-clamp-2 leading-snug">{project.concept || "Untitled"}</p>

                    {/* Meta */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="secondary" className="text-xs gap-1">
                        Step {stepInfo.number}: {stepInfo.label}
                      </Badge>
                      {totalScenes > 0 && <span className="text-xs text-muted-foreground">{approvedImages}/{totalScenes} images</span>}
                      {approvedVideos > 0 && <span className="text-xs text-muted-foreground">{approvedVideos} videos</span>}
                      {project.hasVoiceover && <Badge className="bg-green-500/20 text-green-400 text-xs">VO</Badge>}
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" />{date}</span>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {isLoading ? (
                          <Loader2 className="h-4 w-4 animate-spin text-primary" />
                        ) : (
                          <>
                            <Button size="sm" variant="ghost" className="h-7 px-2 gap-1 text-xs" onClick={(e) => { e.stopPropagation(); handleLoad(project.id); }}>
                              <FolderOpen className="h-3 w-3" />Open
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive hover:text-destructive" onClick={(e) => { e.stopPropagation(); handleDelete(project.id); }}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
