"use client";

import { useReelStore } from "@/lib/store";
import { useAutoPersist } from "@/lib/use-auto-persist";
import { StepWizard } from "@/components/step-wizard";
import { ProjectBrowser } from "@/components/project-browser";
import { ConceptInput } from "@/components/screens/concept-input";
import { ScriptReview } from "@/components/screens/script-review";
import { ImageGeneration } from "@/components/screens/image-generation";
import { Animation } from "@/components/screens/animation";
import { Voiceover } from "@/components/screens/voiceover";
import { FinalAssembly } from "@/components/screens/final-assembly";
import { Button } from "@/components/ui/button";
import { FolderOpen } from "lucide-react";

// New order: Concept → Script → Voice → Images → Animation → Assembly
const SCREENS = [ConceptInput, ScriptReview, Voiceover, ImageGeneration, Animation, FinalAssembly];

export default function Home() {
  // Auto-persist: loads last project on mount, auto-saves changes
  useAutoPersist();

  const currentStep = useReelStore((s) => s.currentStep);
  const projectId = useReelStore((s) => s.projectId);
  const setShowProjectBrowser = useReelStore((s) => s.setShowProjectBrowser);
  const CurrentScreen = SCREENS[currentStep];

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border/50">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-sm">AH</span>
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">ADHD Harmony</h1>
              <p className="text-xs text-muted-foreground">AI Reels Generator</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {projectId && (
              <span className="text-xs text-muted-foreground font-mono bg-muted/30 px-2 py-1 rounded">
                {projectId.slice(0, 20)}...
              </span>
            )}
            <Button variant="outline" size="sm" onClick={() => setShowProjectBrowser(true)} className="gap-2">
              <FolderOpen className="h-4 w-4" />
              My Reels
            </Button>
          </div>
        </div>
      </header>

      <StepWizard />

      <main className={`mx-auto w-full flex-1 pb-12 ${currentStep === 5 ? "max-w-[99%] px-[0.5%]" : "max-w-6xl px-6"}`}>
        <CurrentScreen />
      </main>

      <ProjectBrowser />
    </div>
  );
}
