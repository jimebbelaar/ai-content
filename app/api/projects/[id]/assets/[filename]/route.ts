import { NextRequest, NextResponse } from "next/server";
import { loadAsset } from "@/lib/project-io";

// GET /api/projects/[id]/assets/[filename] — serve a saved asset
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; filename: string }> }) {
  try {
    const { id, filename } = await params;
    const data = loadAsset(id, filename);

    if (!data) {
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    }

    // Determine content type from extension
    const ext = filename.split(".").pop()?.toLowerCase();
    const mimeMap: Record<string, string> = {
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      webp: "image/webp",
      mp4: "video/mp4",
      webm: "video/webm",
      mp3: "audio/mpeg",
      wav: "audio/wav",
      m4a: "audio/mp4",
    };
    const contentType = mimeMap[ext || ""] || "application/octet-stream";

    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": contentType,
        "Content-Length": data.length.toString(),
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    console.error("Serve asset error:", error);
    return NextResponse.json({ error: "Failed to serve asset" }, { status: 500 });
  }
}
