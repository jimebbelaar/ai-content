import { NextRequest, NextResponse } from "next/server";

const AUPHONIC_API = "https://auphonic.com/api";

/**
 * GET /api/auphonic/status?uuid=xxx
 * Polls the Auphonic production status.
 * When complete, downloads the output file and returns it as base64.
 *
 * Auphonic status codes:
 *   0 = "Incomplete" (file upload incomplete)
 *   1 = "Not Started"
 *   2 = "Waiting" (waiting for file transfer)
 *   3 = "Error"
 *   4 = "Done"
 *   5 = "Expired" (files deleted)
 *   6 = "Stopped" (aborted by user)
 *   7 = "In Review"
 *   8 = "Not Enough Credits"
 *   9 = "Waiting (audio processing)"
 *  10 = "Audio Processing"
 *  11 = "Audio Encoding"
 *  12 = "Outgoing File Transfer"
 *  13 = "Audio Mono Mixdown"
 *  14 = "Audio Splitting"
 */
export async function GET(req: NextRequest) {
  const apiKey = process.env.AUPHONIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "AUPHONIC_API_KEY not configured" }, { status: 500 });
  }

  const uuid = req.nextUrl.searchParams.get("uuid");
  if (!uuid) {
    return NextResponse.json({ error: "Missing uuid parameter" }, { status: 400 });
  }

  try {
    const res = await fetch(`${AUPHONIC_API}/production/${uuid}.json`, {
      headers: { "Authorization": `Bearer ${apiKey}` },
    });

    if (!res.ok) {
      return NextResponse.json({ error: "Failed to query Auphonic" }, { status: 500 });
    }

    const data = await res.json();
    const production = data.data;
    const statusCode = production?.status;
    const statusString = production?.status_string || "Unknown";

    // Error states
    if (statusCode === 3) {
      return NextResponse.json({ status: "error", message: production?.error_message || "Auphonic processing error" });
    }
    if (statusCode === 6) {
      return NextResponse.json({ status: "error", message: "Production was stopped" });
    }
    if (statusCode === 8) {
      return NextResponse.json({ status: "error", message: "Not enough Auphonic credits" });
    }

    // Still processing
    if (statusCode !== 4) {
      return NextResponse.json({ status: "processing", statusCode, statusString });
    }

    // Done! Download the output file
    const outputFiles = production?.output_files;
    if (!outputFiles || outputFiles.length === 0) {
      return NextResponse.json({ status: "error", message: "No output files available" });
    }

    // Get the download URL for the first output file
    const downloadUrl = outputFiles[0]?.download_url;
    if (!downloadUrl) {
      return NextResponse.json({ status: "error", message: "No download URL available" });
    }

    // Download the processed audio
    const audioRes = await fetch(downloadUrl, {
      headers: { "Authorization": `Bearer ${apiKey}` },
    });

    if (!audioRes.ok) {
      return NextResponse.json({ status: "error", message: "Failed to download processed audio" });
    }

    const audioBuffer = Buffer.from(await audioRes.arrayBuffer());
    const audioBase64 = audioBuffer.toString("base64");

    return NextResponse.json({
      status: "done",
      audioBase64,
      format: outputFiles[0]?.format || "wav",
      filename: outputFiles[0]?.filename || "enhanced.wav",
    });
  } catch (err) {
    console.error("Auphonic status error:", err);
    return NextResponse.json({ error: "Failed to check Auphonic status" }, { status: 500 });
  }
}
