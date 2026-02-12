import { NextRequest, NextResponse } from "next/server";

const GOOGLE_AI_BASE = "https://generativelanguage.googleapis.com/v1beta";

export async function POST(req: NextRequest) {
  try {
    const { operationName } = await req.json();
    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "GOOGLE_AI_API_KEY is not configured in .env.local" }, { status: 500 });

    const response = await fetch(`${GOOGLE_AI_BASE}/${operationName}?key=${apiKey}`, { method: "GET", headers: { "Content-Type": "application/json" } });
    if (!response.ok) { const errBody = await response.text(); console.error("Veo status error:", response.status, errBody); return NextResponse.json({ error: `Veo status error: ${response.status}` }, { status: response.status }); }

    const data = await response.json();
    if (!data.done) return NextResponse.json({ done: false });

    const generatedSamples = data.response?.generateVideoResponse?.generatedSamples || [];
    if (generatedSamples.length === 0) return NextResponse.json({ error: "Animation completed but no video was generated" }, { status: 500 });

    const videoUri = generatedSamples[0]?.video?.uri;
    if (!videoUri) return NextResponse.json({ error: "No video URI in response" }, { status: 500 });

    const sep = videoUri.includes("?") ? "&" : "?";
    const videoResponse = await fetch(`${videoUri}${sep}key=${apiKey}`, { method: "GET" });
    if (!videoResponse.ok) return NextResponse.json({ error: "Failed to download generated video" }, { status: 500 });

    const videoBuffer = await videoResponse.arrayBuffer();
    const videoBase64 = Buffer.from(videoBuffer).toString("base64");
    return NextResponse.json({ done: true, videoBase64 });
  } catch (error) {
    console.error("Animation status error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Animation status check failed" }, { status: 500 });
  }
}
