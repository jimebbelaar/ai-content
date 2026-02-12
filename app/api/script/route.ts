import { NextRequest, NextResponse } from "next/server";
import { MASTER_PROMPT } from "@/lib/prompts";
import { getStyleById, buildVisualBible } from "@/lib/styles";

function extractJSON(text: string): Record<string, unknown> | null {
  // Strip BOM, null bytes, and other invisible characters
  const clean = text.replace(/^\uFEFF/, "").replace(/\0/g, "").trim();

  // 1. Direct parse
  try { return JSON.parse(clean); } catch (e) {
    console.log("Direct parse failed:", (e as Error).message?.slice(0, 100));
  }

  // 2. Find JSON boundaries
  const start = clean.indexOf('{"scenes"');
  if (start < 0) {
    // Try any opening brace
    const altStart = clean.indexOf('{');
    if (altStart < 0) return null;
    const sub = clean.slice(altStart);
    try { return JSON.parse(sub); } catch {}
    return null;
  }

  // 3. Extract from {"scenes" to the matching end
  const sub = clean.slice(start);
  try { return JSON.parse(sub); } catch (e) {
    console.log("Substring parse failed:", (e as Error).message?.slice(0, 100));
  }

  // 4. Find the ] that closes the scenes array, then build valid JSON around it
  const lastBracket = sub.lastIndexOf("]");
  if (lastBracket > 0) {
    // Try: {"scenes": [...] }
    const withClose = sub.slice(0, lastBracket + 1) + "}";
    try { return JSON.parse(withClose); } catch {}
    // Try fixing trailing commas first
    try { return JSON.parse(withClose.replace(/,\s*([}\]])/g, "$1")); } catch {}
  }

  // 5. Try progressively removing trailing chars until JSON.parse works
  for (let i = sub.length - 1; i > Math.max(sub.length - 100, 0); i--) {
    if (sub[i] === "}") {
      const candidate = sub.slice(0, i + 1);
      try { return JSON.parse(candidate); } catch {}
    }
  }

  // 6. Nuclear option: extract array directly
  const arrStart = sub.indexOf("[");
  const arrEnd = sub.lastIndexOf("]");
  if (arrStart >= 0 && arrEnd > arrStart) {
    const arrStr = sub.slice(arrStart, arrEnd + 1);
    try {
      const arr = JSON.parse(arrStr);
      if (Array.isArray(arr)) return { scenes: arr };
    } catch {}
    try {
      const arr = JSON.parse(arrStr.replace(/,\s*([}\]])/g, "$1"));
      if (Array.isArray(arr)) return { scenes: arr };
    } catch {}
  }

  return null;
}

export async function POST(req: NextRequest) {
  try {
    const { concept, sceneCount, styleId, aspectRatio } = await req.json();
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "ANTHROPIC_API_KEY is not configured in .env.local" }, { status: 500 });

    // Get the selected visual style and build the Visual Bible
    const style = getStyleById(styleId || "adhd-harmony-dark");
    const visualBible = buildVisualBible(style);

    const ar = aspectRatio || "9:16";
    const compositionNote = ar === "16:9"
      ? `ASPECT RATIO: 16:9 horizontal/landscape. End every image_prompt with "16:9 horizontal composition. No text in the image." Compose images for wide cinematic framing.`
      : `ASPECT RATIO: 9:16 vertical/portrait. End every image_prompt with "9:16 vertical composition. No text in the image." Compose images for vertical mobile framing.`;

    const userMessage = `Generate a ${sceneCount}-scene reel script for this concept:\n\n"${concept}"\n\nVISUAL STYLE FOR THIS PROJECT:\n${visualBible}\nStyle hint: ${style.scriptHint}\n\n${compositionNote}\n\nEach image_prompt should include CONTEXT (scene position in the story), reference the Visual Bible above, and describe CONTINUITY with previous/next scenes for visual consistency.\n\nThink deeply about what makes this content go viral — the emotional hooks, the pacing, the gut-punch moments that stop the scroll.\n\nOutput ONLY valid JSON. No markdown, no backticks, no explanation. The JSON must be a single object: {"scenes": [...]}`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-opus-4-6",
        max_tokens: 64000,
        thinking: { type: "adaptive" },
        output_config: { effort: "high" },
        system: MASTER_PROMPT,
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error("Claude API error:", response.status, errBody);
      return NextResponse.json({ error: `Claude API error: ${response.status}` }, { status: response.status });
    }

    const data = await response.json();
    console.log("Claude content types:", data.content?.map((c: { type: string }) => c.type));
    console.log("Claude stop_reason:", data.stop_reason);

    // Collect ALL text from all text blocks
    const allTextParts: string[] = [];
    for (const block of (data.content || [])) {
      if (block.type === "text" && block.text) {
        allTextParts.push(block.text);
      }
    }
    const fullText = allTextParts.join("\n");

    if (!fullText.trim()) {
      return NextResponse.json({ error: "Claude returned empty text. Try again." }, { status: 500 });
    }

    console.log("Text length:", fullText.length, "First 200:", fullText.trim().slice(0, 200));

    const scriptJson = extractJSON(fullText);
    if (!scriptJson) {
      console.error("JSON extraction failed. Length:", fullText.length);
      console.error("First 500:", fullText.slice(0, 500));
      console.error("Last 500:", fullText.slice(-500));
      return NextResponse.json({ error: "Could not parse JSON from Claude response" }, { status: 500 });
    }

    const scenes = (scriptJson.scenes || scriptJson) as unknown[];
    if (!Array.isArray(scenes)) {
      return NextResponse.json({ error: "Invalid format: expected scenes array" }, { status: 500 });
    }

    console.log("Successfully parsed", scenes.length, "scenes");
    return NextResponse.json({ scenes });
  } catch (error) {
    console.error("Script generation error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Script generation failed" }, { status: 500 });
  }
}
