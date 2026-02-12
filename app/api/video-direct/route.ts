import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";

const KLING_API_BASE = "https://api.klingai.com/v1";

function generateKlingToken(): string {
  const ak = process.env.KLING_ACCESS_KEY;
  const sk = process.env.KLING_SECRET_KEY;
  if (!ak || !sk) throw new Error("KLING_ACCESS_KEY and KLING_SECRET_KEY are required");
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign({ iss: ak, exp: now + 1800, nbf: now - 5 }, sk, { algorithm: "HS256", header: { alg: "HS256", typ: "JWT" } });
}

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

export async function POST(req: NextRequest) {
  try {
    const { prompt, aspectRatio, negativePrompt } = await req.json();

    if (!process.env.KLING_ACCESS_KEY || !process.env.KLING_SECRET_KEY) {
      return NextResponse.json({ error: "KLING_ACCESS_KEY and KLING_SECRET_KEY are not configured" }, { status: 500 });
    }

    const token = generateKlingToken();

    // Kling text-to-video with latest available model
    const body = {
      model_name: "kling-v2-6",
      prompt,
      duration: "10",
      aspect_ratio: aspectRatio === "16:9" ? "16:9" : "9:16",
      cfg_scale: 0.5,
      mode: "pro",
      sound: false,  // No audio — we add our own voiceover + music (also halves credit cost)
      negative_prompt: negativePrompt || "text overlay, watermark, UI elements, blurry, distorted, low quality",
    };

    // Retry with backoff on 429 (shorter waits, let client retry if needed)
    for (let attempt = 0; attempt <= 2; attempt++) {
      const response = await fetch(`${KLING_API_BASE}/videos/text2video`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errBody = await response.text();
        console.error(`Kling text2video error (${response.status}):`, errBody);

        if (response.status === 429) {
          // Log full details to debug auth issues vs real rate limits
          console.error("429 details — AK:", process.env.KLING_ACCESS_KEY?.slice(0, 8) + "...", "Response:", errBody);
          if (attempt < 2) {
            const wait = (attempt + 1) * 10;
            console.warn(`Retrying in ${wait}s (attempt ${attempt + 1}/3)...`);
            await sleep(wait * 1000);
            continue;
          }
          return NextResponse.json({ error: `Kling error: ${errBody || "Rate limited. Wait 1-2 minutes."}` }, { status: 429 });
        }

        return NextResponse.json({ error: `Kling API error: ${response.status} — ${errBody}` }, { status: response.status });
      }

      const data = await response.json();
      const taskId = data.data?.task_id || data.task_id;
      if (!taskId) {
        console.error("No task_id from Kling text2video:", JSON.stringify(data));
        return NextResponse.json({ error: "No task ID returned" }, { status: 500 });
      }

      return NextResponse.json({ operationName: `kling-direct:${taskId}` });
    }

    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  } catch (error) {
    console.error("Kling text2video error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed" }, { status: 500 });
  }
}
