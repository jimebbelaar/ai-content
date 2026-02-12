import { NextRequest, NextResponse } from "next/server";

const AUPHONIC_API = "https://auphonic.com/api";

/**
 * POST /api/auphonic
 * Receives a base64 audio file, uploads it to Auphonic with optimal SM7B settings,
 * starts processing, and returns the production UUID for polling.
 */
export async function POST(req: NextRequest) {
  const apiKey = process.env.AUPHONIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "AUPHONIC_API_KEY not configured" }, { status: 500 });
  }

  try {
    const { audioBase64, filename } = await req.json();
    if (!audioBase64) {
      return NextResponse.json({ error: "No audio data provided" }, { status: 400 });
    }

    // Step 1: Create production with optimal settings for SM7B voice recording
    const productionRes = await fetch(`${AUPHONIC_API}/productions.json`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        metadata: { title: `Voice Enhancement - ${Date.now()}` },
        // Optimal algorithms for SM7B dynamic mic voice recording
        algorithms: {
          // Adaptive Leveler: smooths volume variations, essential for voice
          leveler: true,
          levelerstrength: 100,
          // Speech-optimized compressor for broadcast-quality voice
          compressor_speech: "medium",
          msclassifier: "speech",
          // Loudness normalization to -16 LUFS (optimal for social media/reels)
          normloudness: true,
          loudnesstarget: -16,
          maxpeak: -1,
          // High-pass filtering: removes rumble, plosives, low-freq noise from SM7B
          filtering: true,
          // Noise & hum reduction: SM7B is clean but this catches room noise
          denoise: true,
          denoiseamount: 0, // 0 = automatic estimation (best)
          dehum: 50,        // Remove 50Hz hum (and harmonics)
          dehumamount: 0,   // auto
        },
        // Output as high-quality WAV (lossless) for maximum quality in video assembly
        output_files: [
          { format: "wav", mono_mixdown: true },
        ],
      }),
    });

    if (!productionRes.ok) {
      const errText = await productionRes.text();
      console.error("Auphonic create production failed:", errText);
      return NextResponse.json({ error: "Failed to create Auphonic production" }, { status: 500 });
    }

    const productionData = await productionRes.json();
    const uuid = productionData.data?.uuid;
    if (!uuid) {
      return NextResponse.json({ error: "No production UUID returned" }, { status: 500 });
    }

    // Step 2: Upload the audio file
    const audioBuffer = Buffer.from(audioBase64, "base64");
    const formData = new FormData();
    const blob = new Blob([audioBuffer], { type: "audio/mpeg" });
    formData.append("input_file", blob, filename || "voiceover.mp3");

    const uploadRes = await fetch(`${AUPHONIC_API}/production/${uuid}/upload.json`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
      },
      body: formData,
    });

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      console.error("Auphonic upload failed:", errText);
      return NextResponse.json({ error: "Failed to upload audio to Auphonic" }, { status: 500 });
    }

    // Step 3: Start the production
    const startRes = await fetch(`${AUPHONIC_API}/production/${uuid}/start.json`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!startRes.ok) {
      const errText = await startRes.text();
      console.error("Auphonic start failed:", errText);
      return NextResponse.json({ error: "Failed to start Auphonic production" }, { status: 500 });
    }

    return NextResponse.json({ uuid, status: "processing" });
  } catch (err) {
    console.error("Auphonic error:", err);
    return NextResponse.json({ error: "Auphonic processing failed" }, { status: 500 });
  }
}
