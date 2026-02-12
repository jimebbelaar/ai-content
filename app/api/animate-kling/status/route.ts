import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";

const KLING_API_BASE = "https://api.klingai.com/v1";

function generateKlingToken(): string {
  const ak = process.env.KLING_ACCESS_KEY!;
  const sk = process.env.KLING_SECRET_KEY!;
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign({ iss: ak, exp: now + 1800, nbf: now - 5 }, sk, { algorithm: "HS256", header: { alg: "HS256", typ: "JWT" } });
}

export async function POST(req: NextRequest) {
  try {
    const { operationName } = await req.json();

    // operationName format: "kling:{taskId}"
    const taskId = operationName.replace("kling:", "");
    const token = generateKlingToken();

    const response = await fetch(`${KLING_API_BASE}/videos/image2video/${taskId}`, {
      method: "GET",
      headers: { "Authorization": `Bearer ${token}` },
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error("Kling status error:", response.status, errBody);
      return NextResponse.json({ error: `Kling status error: ${response.status}` }, { status: response.status });
    }

    const data = await response.json();
    const taskData = data.data || data;
    const status = taskData.task_status || taskData.status;

    if (status === "succeed" || status === "completed") {
      // Get the video URL from the result
      const videos = taskData.task_result?.videos || taskData.videos || [];
      const videoUrl = videos[0]?.url || videos[0]?.video_url;

      if (!videoUrl) {
        console.error("Kling completed but no video URL:", JSON.stringify(taskData));
        return NextResponse.json({ error: "Kling completed but no video URL returned" }, { status: 500 });
      }

      // Download the video and convert to base64
      const videoResponse = await fetch(videoUrl);
      if (!videoResponse.ok) {
        return NextResponse.json({ error: "Failed to download Kling video" }, { status: 500 });
      }

      const videoBuffer = await videoResponse.arrayBuffer();
      const videoBase64 = Buffer.from(videoBuffer).toString("base64");
      return NextResponse.json({ done: true, videoBase64 });
    }

    if (status === "failed" || status === "error") {
      const errMsg = taskData.task_status_msg || taskData.error_message || "Kling generation failed";
      return NextResponse.json({ error: errMsg }, { status: 500 });
    }

    // Still processing
    return NextResponse.json({ done: false });
  } catch (error) {
    console.error("Kling status check error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Kling status check failed" }, { status: 500 });
  }
}
