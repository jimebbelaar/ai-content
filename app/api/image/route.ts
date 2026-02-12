import { NextRequest, NextResponse } from "next/server";

const GOOGLE_AI_BASE = "https://generativelanguage.googleapis.com/v1beta";
const IMAGE_MODEL = "gemini-3-pro-image-preview";

function sanitizePrompt(prompt: string): string {
  const patterns = [
    /\bportrait of [A-Z][a-z]+ [A-Z][a-z]+\b/gi,
    /\bGabor Mat[eé]\b/gi, /\bNietzsche\b/gi, /\bEinstein\b/gi,
    /\bFreud\b/gi, /\bJung\b/gi, /\bBren[eé] Brown\b/gi,
    /\bSimon Sinek\b/gi, /\bADHD Harmony\b/gi, /\bJim Ebbelaar\b/gi,
  ];
  let s = prompt;
  for (const p of patterns) s = s.replace(p, "a wise contemplative figure");
  return s;
}

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

type GeminiResult = { imageBase64?: string; mimeType?: string; blocked?: string; retryable?: boolean; error?: string };

async function callGeminiImage(
  apiKey: string, prompt: string, refBase64?: string, refMime?: string
): Promise<GeminiResult> {
  const parts: Record<string, unknown>[] = [{ text: prompt }];
  if (refBase64) parts.push({ inlineData: { mimeType: refMime || "image/png", data: refBase64 } });

  const response = await fetch(
    `${GOOGLE_AI_BASE}/models/${IMAGE_MODEL}:generateContent?key=${apiKey}`,
    { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts }], generationConfig: { responseModalities: ["TEXT", "IMAGE"] } }) }
  );

  if (response.status === 429) {
    return { retryable: true, error: "Rate limited" };
  }
  if (!response.ok) {
    return { error: `Google AI error: ${response.status}` };
  }

  const data = await response.json();

  if (data.promptFeedback?.blockReason) return { blocked: data.promptFeedback.blockReason };

  const candidates = data.candidates || [];
  for (const c of candidates) {
    if (c.finishReason === "SAFETY") return { blocked: "SAFETY" };
    if (c.finishReason === "IMAGE_OTHER") {
      console.warn("Gemini returned IMAGE_OTHER — retryable");
      return { retryable: true, error: "IMAGE_OTHER" };
    }
    for (const p of (c.content?.parts || [])) {
      if (p.inlineData) return { imageBase64: p.inlineData.data, mimeType: p.inlineData.mimeType || "image/png" };
    }
  }

  console.error("No image in Gemini response:", JSON.stringify(candidates.map((c: Record<string, unknown>) => ({ finishReason: c.finishReason }))));
  return { retryable: true, error: "No image generated" };
}

export async function POST(req: NextRequest) {
  try {
    const { prompt, referenceImageBase64, referenceMimeType } = await req.json();
    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "GOOGLE_AI_API_KEY is not configured in .env.local" }, { status: 500 });

    // Try up to 3 times with the original prompt (handles IMAGE_OTHER and rate limits)
    let result: GeminiResult = {};
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) {
        const waitMs = attempt * 5000;
        console.log(`Image retry attempt ${attempt + 1}, waiting ${waitMs}ms...`);
        await sleep(waitMs);
      }
      result = await callGeminiImage(apiKey, prompt, referenceImageBase64, referenceMimeType);
      if (result.imageBase64 || result.blocked) break;
      if (!result.retryable) break;
    }

    // If blocked by safety, sanitize and retry
    if (result.blocked) {
      console.warn("Image blocked, retrying sanitized. Reason:", result.blocked);
      const sanitized = sanitizePrompt(prompt);
      if (sanitized !== prompt) {
        result = await callGeminiImage(apiKey, sanitized, referenceImageBase64, referenceMimeType);
      }
    }

    // If still blocked, try minimal prompt
    if (result.blocked) {
      console.warn("Still blocked, trying minimal prompt");
      const lines = prompt.split("\n").filter((l: string) => l.trim());
      // Detect aspect ratio from the prompt itself
      const isLandscape = /16:9|horizontal|landscape/i.test(prompt);
      const composition = isLandscape ? "16:9 horizontal composition" : "9:16 vertical composition";
      const minimal = `Oil painting, ${composition}. Dramatic lighting. ${sanitizePrompt(lines[lines.length - 1] || prompt)}. No text in image.`;
      result = await callGeminiImage(apiKey, minimal);
    }

    if (result.blocked) {
      return NextResponse.json({ error: "Image blocked by safety filter after retries. Edit the prompt to remove sensitive content." }, { status: 400 });
    }
    if (!result.imageBase64) {
      return NextResponse.json({ error: result.error || "Image generation failed after retries." }, { status: 500 });
    }

    return NextResponse.json({ imageBase64: result.imageBase64, mimeType: result.mimeType });
  } catch (error) {
    console.error("Image generation error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Image generation failed" }, { status: 500 });
  }
}
