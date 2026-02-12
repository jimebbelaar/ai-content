import { NextRequest, NextResponse } from "next/server";
import { loadProjectMeta, saveProjectMeta, deleteProject } from "@/lib/project-io";

// GET /api/projects/[id] — load a project
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const meta = loadProjectMeta(id);
    if (!meta) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    return NextResponse.json({ project: meta });
  } catch (error) {
    console.error("Load project error:", error);
    return NextResponse.json({ error: "Failed to load project" }, { status: 500 });
  }
}

// PUT /api/projects/[id] — update project metadata
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const updated = saveProjectMeta(id, body);
    return NextResponse.json({ project: updated });
  } catch (error) {
    console.error("Update project error:", error);
    return NextResponse.json({ error: "Failed to update project" }, { status: 500 });
  }
}

// DELETE /api/projects/[id] — delete a project
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    deleteProject(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete project error:", error);
    return NextResponse.json({ error: "Failed to delete project" }, { status: 500 });
  }
}
