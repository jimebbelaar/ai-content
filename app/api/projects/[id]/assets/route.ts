import { NextRequest, NextResponse } from "next/server";
import { saveAsset, listAssets } from "@/lib/project-io";

// GET /api/projects/[id]/assets — list all assets
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const assets = listAssets(id);
    return NextResponse.json({ assets });
  } catch (error) {
    console.error("List assets error:", error);
    return NextResponse.json({ error: "Failed to list assets" }, { status: 500 });
  }
}

// POST /api/projects/[id]/assets — save an asset (image, video, audio)
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { filename, base64Data } = await req.json();

    if (!filename || !base64Data) {
      return NextResponse.json({ error: "filename and base64Data are required" }, { status: 400 });
    }

    saveAsset(id, filename, base64Data);
    return NextResponse.json({ success: true, filename });
  } catch (error) {
    console.error("Save asset error:", error);
    return NextResponse.json({ error: "Failed to save asset" }, { status: 500 });
  }
}
