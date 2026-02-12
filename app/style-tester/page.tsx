"use client";

import { useState } from "react";
import { VISUAL_STYLES, buildVisualBible } from "@/lib/styles";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Sparkles, RefreshCw, ArrowLeft } from "lucide-react";
import Link from "next/link";

type StyleResult = {
  styleId: string;
  status: "idle" | "loading" | "done" | "error";
  imageBase64?: string;
  error?: string;
  prompt?: string;
};

export default function StyleTester() {
  const [concept, setConcept] = useState("");
  const [results, setResults] = useState<StyleResult[]>(
    VISUAL_STYLES.map((s) => ({ styleId: s.id, status: "idle" }))
  );
  const [isRunning, setIsRunning] = useState(false);

  function buildTestPrompt(styleId: string, concept: string): string {
    const style = VISUAL_STYLES.find((s) => s.id === styleId)!;
    const bible = buildVisualBible(style);
    return `${bible}\n\nFOCUS FOR THIS SCENE:\n${concept}\n\n9:16 vertical composition. No text in the image.`;
  }

  async function generateOne(styleId: string, concept: string): Promise<{ imageBase64?: string; error?: string; prompt: string }> {
    const prompt = buildTestPrompt(styleId, concept);
    try {
      const res = await fetch("/api/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        return { error: err.error || `Error ${res.status}`, prompt };
      }
      const data = await res.json();
      return { imageBase64: data.imageBase64, prompt };
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Failed", prompt };
    }
  }

  async function testAllStyles() {
    if (!concept.trim()) return;
    setIsRunning(true);
    setResults(VISUAL_STYLES.map((s) => ({ styleId: s.id, status: "loading" })));

    // Fire all in parallel
    const promises = VISUAL_STYLES.map(async (style, i) => {
      const result = await generateOne(style.id, concept);
      setResults((prev) => {
        const next = [...prev];
        next[i] = {
          styleId: style.id,
          status: result.error ? "error" : "done",
          imageBase64: result.imageBase64,
          error: result.error,
          prompt: result.prompt,
        };
        return next;
      });
    });

    await Promise.all(promises);
    setIsRunning(false);
  }

  async function retryOne(index: number) {
    const style = VISUAL_STYLES[index];
    setResults((prev) => {
      const next = [...prev];
      next[index] = { styleId: style.id, status: "loading" };
      return next;
    });
    const result = await generateOne(style.id, concept);
    setResults((prev) => {
      const next = [...prev];
      next[index] = {
        styleId: style.id,
        status: result.error ? "error" : "done",
        imageBase64: result.imageBase64,
        error: result.error,
        prompt: result.prompt,
      };
      return next;
    });
  }

  const doneCount = results.filter((r) => r.status === "done").length;

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-6 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Link href="/">
            <Button variant="ghost" size="sm" className="gap-2"><ArrowLeft className="h-4 w-4" />Back</Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Style Tester</h1>
            <p className="text-sm text-muted-foreground">Test one concept across all {VISUAL_STYLES.length} visual styles — compare side by side.</p>
          </div>
        </div>

        {/* Input */}
        <div className="space-y-3 mb-8">
          <Textarea
            placeholder={`Describe one scene, e.g. "A person sitting alone at 2am, laptop glowing, exhausted but wired — the ADHD late night clarity"`}
            value={concept}
            onChange={(e) => setConcept(e.target.value)}
            className="min-h-[80px] resize-none text-base bg-card border-border/50"
            disabled={isRunning}
          />
          <div className="flex items-center gap-3">
            <Button onClick={testAllStyles} disabled={!concept.trim() || isRunning} className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90">
              {isRunning ? (
                <><Loader2 className="h-4 w-4 animate-spin" />Generating {doneCount}/{VISUAL_STYLES.length}...</>
              ) : (
                <><Sparkles className="h-4 w-4" />Test All {VISUAL_STYLES.length} Styles</>
              )}
            </Button>
            {doneCount > 0 && !isRunning && (
              <span className="text-sm text-muted-foreground">{doneCount} images generated</span>
            )}
          </div>
        </div>

        {/* Results Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {VISUAL_STYLES.map((style, i) => {
            const r = results[i];
            return (
              <Card key={style.id} className="border-border/50 overflow-hidden">
                <CardContent className="p-0">
                  {/* Image */}
                  <div className="aspect-[9/16] max-h-[400px] bg-muted/20 flex items-center justify-center overflow-hidden">
                    {r.status === "done" && r.imageBase64 ? (
                      <img src={`data:image/png;base64,${r.imageBase64}`} alt={style.name} className="w-full h-full object-cover" />
                    ) : r.status === "loading" ? (
                      <div className="flex flex-col items-center gap-2">
                        <Loader2 className="h-6 w-6 animate-spin text-primary" />
                        <span className="text-xs text-muted-foreground">Generating...</span>
                      </div>
                    ) : r.status === "error" ? (
                      <div className="flex flex-col items-center gap-2 px-4 text-center">
                        <p className="text-xs text-destructive">{r.error}</p>
                        <Button size="sm" variant="outline" onClick={() => retryOne(i)} className="gap-1 text-xs">
                          <RefreshCw className="h-3 w-3" />Retry
                        </Button>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground/40">Waiting...</span>
                    )}
                  </div>

                  {/* Style info */}
                  <div className="p-3 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{style.name}</span>
                      <Badge variant="secondary" className="text-[10px] px-1 py-0">T{style.tier}</Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground line-clamp-2">{style.description}</p>
                    {r.status === "done" && (
                      <Button size="sm" variant="ghost" onClick={() => retryOne(i)} className="gap-1 text-xs text-muted-foreground h-6 px-1">
                        <RefreshCw className="h-3 w-3" />Regenerate
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
