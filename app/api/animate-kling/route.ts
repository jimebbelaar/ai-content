import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";

const KLING_API_BASE = "https://api.klingai.com/v1";

function generateKlingToken(): string {
  const ak = process.env.KLING_ACCESS_KEY;
  const sk = process.env.KLING_SECRET_KEY;
  if (!ak || !sk) throw new Error("KLING_ACCESS_KEY and KLING_SECRET_KEY are required");

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: ak,
    exp: now + 1800, // 30 min
    nbf: now - 5,
  };
  return jwt.sign(payload, sk, { algorithm: "HS256", header: { alg: "HS256", typ: "JWT" } });
}

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

export async function POST(req: NextRequest) {
  try {
    const { imageBase64, mimeType, animationPrompt, aspectRatio } = await req.json();

    if (!process.env.KLING_ACCESS_KEY || !process.env.KLING_SECRET_KEY) {
      return NextResponse.json({ error: "KLING_ACCESS_KEY and KLING_SECRET_KEY are not configured in .env.local" }, { status: 500 });
    }

    const token = generateKlingToken();

    // Strip any data URL prefix to get clean base64
    const cleanBase64 = imageBase64.replace(/^data:[^;]+;base64,/, "");

    // Kling image2video uses "image" field as base64 string
    // Duration must be "5" or "10", sound not supported for image2video
    const body = {
      model_name: "kling-v2-6",
      prompt: animationPrompt,
      image: cleanBase64,
      duration: "10",
      aspect_ratio: aspectRatio === "16:9" ? "16:9" : "9:16",
      cfg_scale: 0.5,
      mode: "pro",
      negative_prompt: "fast motion, dramatic movement, photorealistic, 3D render, blurry, distorted, text, watermark",
    };

    console.log("Kling image2video body keys:", Object.keys(body), "image length:", cleanBase64.length);

    // Retry with backoff on 429
    const maxRetries = 3;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const response = await fetch(`${KLING_API_BASE}/videos/image2video`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errBody = await response.text();
        console.error(`Kling image2video error (${response.status}):`, errBody);

        if (response.status === 429) {
          console.error("429 details — AK:", process.env.KLING_ACCESS_KEY?.slice(0, 8) + "...", "Response:", errBody);
          if (attempt < maxRetries) {
            const waitSec = (attempt + 1) * 15;
            console.warn(`Retrying in ${waitSec}s...`);
            await sleep(waitSec * 1000);
            continue;
          }
          return NextResponse.json({ error: `Kling error: ${errBody || "Rate limited"}` }, { status: 429 });
        }

        return NextResponse.json({ error: `Kling API error: ${response.status} — ${errBody}` }, { status: response.status });
      }

      const data = await response.json();
      const taskId = data.data?.task_id || data.task_id;
      if (!taskId) {
        console.error("No task_id from Kling:", JSON.stringify(data));
        return NextResponse.json({ error: "No task ID returned from Kling" }, { status: 500 });
      }

      return NextResponse.json({ operationName: `kling:${taskId}` });
    }

    return NextResponse.json({ error: "Kling rate limit exceeded" }, { status: 429 });
  } catch (error) {
    console.error("Kling animation start error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Kling animation failed" }, { status: 500 });
  }
}
