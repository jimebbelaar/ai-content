import { NextRequest, NextResponse } from "next/server";

const CAPTION_SYSTEM_PROMPT = `You are the social media caption writer for ADHD Harmony — a brand by Jim Ebbelaar that helps ADHD minds build lives that work WITH their neurodivergent brain.

Your job: write ONE short, powerful caption that works on both Instagram Reels and TikTok.

## 2026 CAPTION RULES (data-driven)

CAPTION:
- Keep it SHORT: under 100 characters (excluding hashtags). TikTok captions under 100 chars get 21% more engagement.
- Keyword-rich — both platforms now work like search engines. Use words people actually search for.
- Hook in the first few words — this is what shows before "more"
- Match the emotional tone of the video — raw, personal, not corporate
- Use the ADHD Harmony voice: direct, intimate, like a truth bomb from a wise friend
- Can use 1-2 emojis if they add emotional weight (not decoration)
- NO calls to action ("follow for more", "like if you agree"). They kill engagement in 2026.

HASHTAGS:
- Exactly 3-5 hashtags. No more, no less.
- TikTok caps at 5 hashtags (since Aug 2025). Instagram also performs best with 3-5.
- Mix: 1-2 niche ADHD/mental health tags + 1-2 broader but relevant tags + 1 trending/topical
- Niche hashtags (10K-500K) outperform broad ones by 60-70%
- Use lowercase, no spaces in hashtags
- Hashtags should help discoverability, not just describe the content

RESPOND WITH ONLY VALID JSON:
{
  "caption": "the caption text without hashtags",
  "hashtags": ["hashtag1", "hashtag2", "hashtag3", "hashtag4"]
}

Do NOT include # in the hashtags array — just the words. No markdown, no explanation.`;

export async function POST(req: NextRequest) {
  try {
    const { concept, scenes } = await req.json();
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY is not configured in .env.local" },
        { status: 500 }
      );
    }

    if (!concept) {
      return NextResponse.json(
        { error: "No concept provided" },
        { status: 400 }
      );
    }

    // Build context from the script
    const scriptContext = scenes
      ?.map((s: { voiceover_text: string }, i: number) => `Scene ${i + 1}: ${s.voiceover_text}`)
      .join("\n") || "";

    const userMessage = `Write a caption for this ADHD Harmony reel.

CONCEPT: "${concept}"

FULL SCRIPT:
${scriptContext}

Generate a caption + hashtags that will maximize reach on both Instagram Reels and TikTok. Remember: under 100 characters for the caption, 3-5 niche-relevant hashtags.

Output ONLY valid JSON. No markdown, no backticks.`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 500,
        system: CAPTION_SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error("Claude API error:", response.status, errBody);
      return NextResponse.json(
        { error: `Claude API error: ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    const text = data.content
      ?.filter((c: { type: string }) => c.type === "text")
      .map((c: { text: string }) => c.text)
      .join("")
      .trim();

    if (!text) {
      return NextResponse.json(
        { error: "Claude returned empty response" },
        { status: 500 }
      );
    }

    // Parse JSON from response
    let result: { caption: string; hashtags: string[] };
    try {
      // Try direct parse first
      result = JSON.parse(text);
    } catch {
      // Try extracting JSON from text
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error("Could not parse caption JSON:", text);
        return NextResponse.json(
          { error: "Could not parse caption from Claude response" },
          { status: 500 }
        );
      }
      result = JSON.parse(jsonMatch[0]);
    }

    // Validate and clean
    if (!result.caption || !Array.isArray(result.hashtags)) {
      return NextResponse.json(
        { error: "Invalid caption format returned" },
        { status: 500 }
      );
    }

    // Strip # from hashtags if Claude included them
    result.hashtags = result.hashtags.map((h: string) =>
      h.replace(/^#/, "").toLowerCase()
    );

    // Cap at 5 hashtags
    result.hashtags = result.hashtags.slice(0, 5);

    console.log(`[Caption] Generated: "${result.caption}" + ${result.hashtags.length} hashtags`);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Caption generation error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Caption generation failed" },
      { status: 500 }
    );
  }
}
