import { NextRequest, NextResponse } from "next/server";

const GOOGLE_AI_BASE = "https://generativelanguage.googleapis.com/v1beta";

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

export async function POST(req: NextRequest) {
  try {
    const { imageBase64, mimeType, animationPrompt, aspectRatio } = await req.json();
    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "GOOGLE_AI_API_KEY is not configured in .env.local" }, { status: 500 });

    const body = JSON.stringify({
      instances: [{ prompt: animationPrompt, image: { bytesBase64Encoded: imageBase64, mimeType: mimeType || "image/png" } }],
      parameters: { aspectRatio: aspectRatio || "9:16", durationSeconds: 8, personGeneration: "allow_adult", negativePrompt: "fast motion, dramatic movement, photorealistic, 3D render, blurry, distorted" },
    });

    // Retry with exponential backoff on 429 rate limit
    const maxRetries = 4;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const response = await fetch(`${GOOGLE_AI_BASE}/models/veo-3.1-generate-preview:predictLongRunning?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });

      if (response.status === 429) {
        if (attempt < maxRetries) {
          const waitSec = Math.pow(2, attempt + 1) * 15; // 30s, 60s, 120s, 240s
          console.warn(`Veo rate limited (attempt ${attempt + 1}/${maxRetries + 1}), waiting ${waitSec}s...`);
          await sleep(waitSec * 1000);
          continue;
        }
        return NextResponse.json({ error: "Veo rate limit exceeded after retries. Wait a few minutes and try again." }, { status: 429 });
      }

      if (!response.ok) {
        const errBody = await response.text();
        console.error("Veo API error:", response.status, errBody);
        return NextResponse.json({ error: `Veo API error: ${response.status}` }, { status: response.status });
      }

      const data = await response.json();
      if (!data.name) return NextResponse.json({ error: "No operation name returned from Veo" }, { status: 500 });
      return NextResponse.json({ operationName: data.name });
    }

    return NextResponse.json({ error: "Veo rate limit exceeded" }, { status: 429 });
  } catch (error) {
    console.error("Animation start error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Animation start failed" }, { status: 500 });
  }
}
