import { NextRequest, NextResponse } from "next/server";

interface WordTimestamp { word: string; start: number; end: number; }

function aggregateToWordTimestamps(alignment: Record<string, unknown>): WordTimestamp[] {
  const chars = (alignment.characters || alignment.chars) as string[] | undefined;
  const startTimes = (alignment.character_start_times_seconds || alignment.charStartTimesMs) as number[] | undefined;
  const endTimes = (alignment.character_end_times_seconds || alignment.charDurationsMs) as number[] | undefined;

  if (!chars || !startTimes || !endTimes) {
    console.warn("Unexpected alignment format:", Object.keys(alignment));
    return [];
  }

  const words: WordTimestamp[] = [];
  let currentWord = "";
  let wordStart = 0;
  let wordEnd = 0;

  for (let i = 0; i < chars.length; i++) {
    const char = chars[i];
    const charStart = typeof startTimes[i] === "number" ? startTimes[i] : startTimes[i] / 1000;
    const charEnd = typeof endTimes[i] === "number" ? endTimes[i] : endTimes[i] / 1000;

    if (char === " " || char === "\n") {
      if (currentWord.length > 0) {
        words.push({ word: currentWord, start: wordStart, end: wordEnd });
        currentWord = "";
      }
    } else {
      if (currentWord.length === 0) wordStart = charStart;
      currentWord += char;
      wordEnd = charEnd;
    }
  }
  if (currentWord.length > 0) words.push({ word: currentWord, start: wordStart, end: wordEnd });
  return words;
}

// Get the timestamp for a character offset in the alignment data.
// Finds the first non-whitespace character at or after `offset` and returns its start time.
function getTimeAtOffset(
  offset: number,
  chars: string[],
  startTimes: number[],
  endTimes: number[]
): number {
  const len = chars.length;
  const getS = (i: number) => typeof startTimes[i] === "number" ? startTimes[i] : startTimes[i] / 1000;
  const getE = (i: number) => typeof endTimes[i] === "number" ? endTimes[i] : endTimes[i] / 1000;
  const audioDuration = len > 0 ? getE(len - 1) : 0;

  // Clamp offset to valid range
  const idx = Math.min(Math.max(0, offset), len - 1);

  // Find first non-whitespace character at or after idx
  for (let i = idx; i < len; i++) {
    if (chars[i] !== " " && chars[i] !== "\n") {
      return getS(i);
    }
  }
  return audioDuration;
}

export async function POST(req: NextRequest) {
  try {
    const { text, voiceId, voiceSettings, scenes, modelId } = await req.json();
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "ELEVENLABS_API_KEY is not configured in .env.local" }, { status: 500 });

    // ===== Model selection =====
    const VALID_MODELS = ["eleven_v3", "eleven_multilingual_v2"];
    const selectedModel = VALID_MODELS.includes(modelId) ? modelId : "eleven_multilingual_v2";
    const isV3 = selectedModel === "eleven_v3";

    // ===== Stability handling =====
    // v3: snap to Creative(0.0) / Natural(0.5) / Robust(1.0) zones for best results
    // v2: pass raw value — continuous slider works well for clone fidelity tuning
    const rawStability = voiceSettings?.stability ?? (isV3 ? 0.15 : 0.45);
    const stability = isV3
      ? (rawStability <= 0.25 ? 0.0 : rawStability <= 0.75 ? 0.5 : 1.0)
      : rawStability;

    // ===== Defaults per model =====
    const defaultSimilarity = isV3 ? 0.75 : 0.85;
    const defaultStyle = isV3 ? 0.50 : 0.35;

    console.log(`[Voiceover] Model: ${selectedModel} | Stability: ${stability} (raw: ${rawStability}) | Similarity: ${voiceSettings?.similarity_boost ?? defaultSimilarity} | Style: ${voiceSettings?.style ?? defaultStyle}`);

    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "xi-api-key": apiKey },
      body: JSON.stringify({
        text,
        model_id: selectedModel,
        voice_settings: {
          stability,
          similarity_boost: voiceSettings?.similarity_boost ?? defaultSimilarity,
          style: voiceSettings?.style ?? defaultStyle,
          use_speaker_boost: voiceSettings?.use_speaker_boost ?? true,
        },
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error("ElevenLabs error:", response.status, errBody);
      return NextResponse.json({ error: `ElevenLabs error: ${response.status}` }, { status: response.status });
    }

    const data = await response.json();
    const audioBase64 = data.audio_base64;
    if (!audioBase64) return NextResponse.json({ error: "No audio returned from ElevenLabs" }, { status: 500 });

    // Word timestamps (for subtitle sync in the player)
    let wordTimestamps: WordTimestamp[] = [];
    if (data.alignment) {
      wordTimestamps = aggregateToWordTimestamps(data.alignment);
    }

    // ===== Scene timings: use character offsets (simplest, most reliable) =====
    // `text` = scenes joined with "\n\n". We know each scene's voiceover_text.
    // Compute the char offset where each scene starts, then look up the timestamp.
    let sceneTimings: { start: number; end: number; duration: number }[] = [];

    if (scenes && Array.isArray(scenes) && scenes.length > 0 && data.alignment) {
      const chars = (data.alignment.characters || data.alignment.chars) as string[];
      const startTimes = (data.alignment.character_start_times_seconds || data.alignment.charStartTimesMs) as number[];
      const endTimes = (data.alignment.character_end_times_seconds || data.alignment.charDurationsMs) as number[];

      if (chars && startTimes && endTimes && chars.length > 0) {
        const getE = (i: number) => typeof endTimes[i] === "number" ? endTimes[i] : endTimes[i] / 1000;
        const audioDuration = getE(chars.length - 1);

        // Compute character offset of each scene in the full text
        // Full text = scene0.voiceover_text + "\n\n" + scene1.voiceover_text + "\n\n" + ...
        const sceneTexts = scenes.map((s: { voiceover_text: string }) => s.voiceover_text);
        const charOffsets: number[] = [];
        let offset = 0;
        for (let i = 0; i < sceneTexts.length; i++) {
          charOffsets.push(offset);
          offset += sceneTexts[i].length;
          if (i < sceneTexts.length - 1) offset += 2; // "\n\n" separator
        }

        // Look up the start time at each offset
        const sceneStartTimes = charOffsets.map(off =>
          getTimeAtOffset(off, chars, startTimes, endTimes)
        );

        // Tile: each scene ends where next begins, last ends at audio end
        sceneTimings = sceneStartTimes.map((start, i) => {
          const end = i < sceneStartTimes.length - 1 ? sceneStartTimes[i + 1] : audioDuration;
          const duration = Math.max(0, end - start);
          return {
            start: Math.round(start * 100) / 100,
            end: Math.round(end * 100) / 100,
            duration: Math.round(duration * 100) / 100,
          };
        });

        console.log("Scene timings (char offsets):", sceneTimings.map((t, i) =>
          `Scene ${i + 1}: ${t.start.toFixed(2)}s → ${t.end.toFixed(2)}s (${t.duration.toFixed(2)}s)`
        ));
        console.log("Audio:", audioDuration.toFixed(2), "s | Chars:", chars.length,
          "| Offsets:", charOffsets, "| Sum:", sceneTimings.reduce((a, t) => a + t.duration, 0).toFixed(2), "s");
      }
    }

    return NextResponse.json({ audioBase64, wordTimestamps, sceneTimings });
  } catch (error) {
    console.error("Voiceover generation error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Voiceover generation failed" }, { status: 500 });
  }
}
