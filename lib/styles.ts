// ============================================================
// STYLE BANK — Visual Style Presets
// Each style includes a Visual Bible that gets injected into every prompt
// ============================================================

export interface VisualStyle {
  id: string;
  name: string;
  tier: 1 | 2 | 3;
  description: string;
  bestFor: string;
  // The Visual Bible — injected into every image prompt for consistency
  visualBible: {
    style: string;
    colorPalette: string;
    mood: string;
    lighting: string;
    texture: string;
    camera: string;
  };
  // Short prompt keywords for the style prefix
  promptKeywords: string;
  // Style hint for Claude's script generation
  scriptHint: string;
}

export const VISUAL_STYLES: VisualStyle[] = [
  // ---- OUR SIGNATURE STYLE ----
  {
    id: "adhd-harmony-dark",
    name: "ADHD Harmony Dark",
    tier: 1,
    description: "Our signature look — dark, moody, painterly digital illustration with emotional depth and cinematic drama",
    bestFor: "ADHD content, emotional reframes, spoken word poetry",
    visualBible: {
      style: "Dark moody painterly digital illustration, rich brushstroke textures, thick impasto effect, cinematic atmosphere",
      colorPalette: "Deep navy blues, warm ambers, midnight blacks shifting to gold — driven by the emotional arc",
      mood: "Contemplative, emotionally charged, cinematic depth",
      lighting: "Dramatic Rembrandt-style single-source light, backlighting silhouettes, warm glows against cold voids",
      texture: "Visible brushstrokes, painterly impasto, atmospheric depth",
      camera: "Cinematic compositions — intimate close-ups, figures in vast spaces, dramatic angles",
    },
    promptKeywords: "Dark moody painterly digital illustration, rich brushstroke textures, thick impasto, dramatic chiaroscuro lighting, cinematic atmosphere",
    scriptHint: "Dark, atmospheric, painterly. Color arc from deep blues/blacks to warm ambers/golds.",
  },

  // ---- TIER 1: EXCELLENT AI STYLES ----
  {
    id: "cinematic-editorial",
    name: "Cinematic Editorial",
    tier: 1,
    description: "Cinematic photography with shallow depth of field, naturalistic light — like a still from an indie film",
    bestFor: "Serious emotional content, business stories, personal essays",
    visualBible: {
      style: "Cinematic editorial photography, shallow depth of field, naturalistic, shot on 35mm film",
      colorPalette: "Desaturated earth tones with teal shadows and warm amber highlights",
      mood: "Contemplative, revealing, quietly powerful",
      lighting: "Natural window light, golden hour warmth, available light only",
      texture: "Subtle film grain, organic imperfections, slightly overexposed highlights",
      camera: "85mm equivalent, shallow depth of field, intimate framing",
    },
    promptKeywords: "Shot on 35mm film, shallow depth of field, cinematic color grading, natural light, film grain",
    scriptHint: "Cinematic, photographic, documentary feel. Natural light, film grain, intimate framing.",
  },
  {
    id: "moody-documentary",
    name: "Moody Documentary",
    tier: 1,
    description: "Dark, intimate atmosphere like a documentary — handheld feel, raw and honest",
    bestFor: "Personal stories, mental health, vulnerability",
    visualBible: {
      style: "Documentary photography, handheld feel, desaturated, intimate and raw",
      colorPalette: "Desaturated naturals, muted tones, occasional warm accent",
      mood: "Intimate, vulnerable, quietly honest",
      lighting: "Available light, underexposed, shadows tell the story",
      texture: "High ISO grain, slight motion blur, imperfect focus",
      camera: "Handheld feel, close-ups of hands and details, candid framing",
    },
    promptKeywords: "Documentary style, handheld feel, desaturated, intimate framing, available light, high ISO grain",
    scriptHint: "Raw documentary feel. Desaturated, intimate, handheld. Shadows and available light.",
  },
  {
    id: "clean-minimal",
    name: "Clean Minimal",
    tier: 1,
    description: "Clean, modern visuals with lots of white space — sophisticated and calm",
    bestFor: "Educational content, professional, explainer videos",
    visualBible: {
      style: "Minimalist editorial photography, clean backgrounds, soft studio light",
      colorPalette: "Mostly white/cream with one or two accent colors, clean and airy",
      mood: "Calm, focused, sophisticated, spacious",
      lighting: "Soft diffused studio light, even illumination, no harsh shadows",
      texture: "Clean, smooth, high-key, occasional subtle grain",
      camera: "Centered compositions, lots of negative space, clean backgrounds",
    },
    promptKeywords: "Minimalist composition, clean background, soft studio light, contemporary design, negative space",
    scriptHint: "Clean, minimal, lots of white space. Sophisticated and calm. One accent color.",
  },
  {
    id: "warm-analog",
    name: "Warm Analog / Film",
    tier: 1,
    description: "Vintage film photography — Kodak Portra warmth, grain, nostalgia",
    bestFor: "Nostalgic stories, childhood, memories, personal growth",
    visualBible: {
      style: "Analog film photography, Kodak Portra 400, warm and nostalgic",
      colorPalette: "Warm amber, soft yellows, faded reds, creamy highlights, no pure blacks",
      mood: "Nostalgic, tender, bittersweet, safe",
      lighting: "Golden hour, warm window light, sun flares, slightly overexposed",
      texture: "Heavy film grain, soft focus edges, light leaks, vintage print feel",
      camera: "Snapshot aesthetic mixed with intentional composition, 50mm feel",
    },
    promptKeywords: "Kodak Portra 400, film grain, warm tones, slightly overexposed, nostalgic, golden hour light",
    scriptHint: "Warm analog film. Nostalgic, golden, soft grain. Like a cherished old photograph.",
  },
  {
    id: "dark-atmospheric",
    name: "Dark Atmospheric",
    tier: 1,
    description: "Dark, dramatic, high contrast — noir aesthetic with deep shadows",
    bestFor: "Struggle stories, dark themes, triumph over darkness",
    visualBible: {
      style: "Noir photography, chiaroscuro lighting, deep dramatic shadows, high contrast",
      colorPalette: "Near-black shadows, single warm accent light, minimal color, high contrast",
      mood: "Intense, dramatic, powerful, confrontational",
      lighting: "Single light source, deep shadows, chiaroscuro, rim lighting",
      texture: "Clean with deep blacks, sharp contrast, occasional smoke or haze",
      camera: "Low angles, dramatic perspectives, strong silhouettes, negative space in shadows",
    },
    promptKeywords: "Chiaroscuro lighting, deep shadows, single light source, dramatic, noir aesthetic, high contrast",
    scriptHint: "Dark noir aesthetic. Deep shadows, single light source, high contrast. Powerful and intense.",
  },
  {
    id: "futuristic-quantum-spiritual",
    name: "Futuristic Quantum Spiritual",
    tier: 1,
    description: "Transcendent sci-fi mysticism — sacred geometry, bioluminescent energy fields, cosmic consciousness rendered in digital light",
    bestFor: "Mindfulness content, spiritual growth, consciousness exploration, futuristic motivation, transcendence narratives",
    visualBible: {
      style: "Futuristic digital art blending sacred geometry with quantum physics aesthetics, ethereal holographic elements, bioluminescent organic forms merging with cosmic structures",
      colorPalette: "Deep cosmic indigo and ultraviolet base, electric cyan and teal energy veins, iridescent pearl whites, soft rose-gold accents, occasional prismatic rainbow refractions",
      mood: "Transcendent, awe-inspiring, deeply serene yet cosmically vast, the feeling of touching the infinite",
      lighting: "Inner glow emanating from subjects, volumetric god rays piercing through cosmic dust, bioluminescent rim lighting, holographic lens flares, light as a living energy",
      texture: "Crystalline fractal surfaces, flowing particle streams, nebula-like soft gradients layered with sharp geometric wireframes, translucent holographic overlays",
      camera: "Epic wide shots of figures in cosmic voids, extreme close-ups of eyes reflecting universes, symmetrical compositions echoing sacred geometry, slow zoom perspectives suggesting infinite depth",
    },
    promptKeywords: "Sacred geometry, bioluminescent glow, cosmic void, holographic, quantum energy fields, ethereal, ultraviolet and cyan palette, fractal patterns, transcendent digital art",
    scriptHint: "Transcendent cosmic aesthetic. Sacred geometry meets quantum physics. Deep indigo/ultraviolet with electric cyan energy. Figures glow from within against infinite cosmic backdrops.",
  },
  // ---- NEO-RETRO MELANCHOLY ----
  {
    id: "neo-retro-melancholy",
    name: "Neo-Retro Melancholy",
    tier: 1,
    description: "Dark painterly portraits with raw brushwork — Caravaggio meets Egon Schiele, emotionally devastating, warm halation glow",
    bestFor: "Emotional vulnerability, identity struggles, inner pain, poetic content, late-night feelings",
    visualBible: {
      style: "Dark painterly digital illustration in the tradition of classical portrait painting. Raw, expressive brushwork like Egon Schiele or Lucian Freud — visible strokes, rough edges, impasto texture. Faces are rendered with emotional intensity and anatomical weight, NOT stylized or cartoonish. Think art gallery painting, NOT animation. Figures have realistic proportions and gravity. Every face should feel like an oil portrait study",
      colorPalette: "Two modes driven by emotion — WARM: dusty pinks, salmon, soft peach, golden yellows, muted lavender, desaturated teal. DARK: deep blacks dominating 60-70%, rich crimson/oxblood accents, muted navy, warm amber light, pale skin tones. ALL colors desaturated and muted like faded old masters painting",
      mood: "Deeply melancholic, introspective, emotionally raw. Unapologetically sad without being melodramatic. Every image should feel like a painted study of human suffering or quiet devastation — museum quality emotional weight",
      lighting: "Warm rim lighting on figure edges creating a glow-from-within effect. Extreme chiaroscuro like Caravaggio — deep shadow pools with single warm light. Warm halation where highlights bleed into shadows like old film. Shadows tinted red-brown or deep blue, never pure black",
      texture: "Heavy visible brushstrokes, thick paint texture, rough edges where dark meets light. Subtle film grain overlay. The look of a painting photographed in a dimly lit gallery — warm halation glow bleeding from lighter areas, slight vignette at edges",
      camera: "Portrait orientation 9:16. Strong vertical centering. Generous negative space — emptiness represents isolation. Prefer single figures or extreme close-ups of faces/eyes. When showing two figures, use dramatic scale differences or silhouettes — never clean character designs",
    },
    promptKeywords: "Dark painterly digital portrait, raw expressive brushwork, thick impasto texture, dramatic chiaroscuro like Caravaggio, desaturated muted palette, warm rim light halation glow, emotional intensity, classical portrait painting style, NOT anime NOT cartoon",
    scriptHint: "Dark painterly portrait style like classical masters. Raw brushwork, thick paint, Caravaggio lighting. Two color modes: warm (dusty pinks, golden) for longing, dark (blacks with crimson) for pain. Faces painted with emotional weight, museum quality. NOT anime or cartoon.",
  },
];

export function getStyleById(id: string): VisualStyle {
  return VISUAL_STYLES.find(s => s.id === id) || VISUAL_STYLES[0];
}

// Build a Visual Bible string from a style preset
export function buildVisualBible(style: VisualStyle): string {
  return `VISUAL BIBLE:
Style: ${style.visualBible.style}
Color palette: ${style.visualBible.colorPalette}
Mood: ${style.visualBible.mood}
Lighting: ${style.visualBible.lighting}
Texture: ${style.visualBible.texture}
Camera: ${style.visualBible.camera}
Text: No text in images (added in post-production)`;
}

// Build a context-aware image prompt with FULL story context
export function buildChainedImagePrompt(
  style: VisualStyle,
  sceneIndex: number,
  totalScenes: number,
  theme: string,
  scenePrompt: string,
  allScenes?: { subtitle_text: string; voiceover_text: string; image_prompt: string; color_mood?: string }[],
  aspectRatio: "9:16" | "16:9" = "9:16",
): string {
  const bible = buildVisualBible(style);

  let prompt = `CONTEXT: This is image ${sceneIndex + 1} of ${totalScenes} in a visual story about "${theme}".\n\n`;

  // Include ALL scenes so AI knows the full narrative + visual direction
  if (allScenes && allScenes.length > 0) {
    prompt += `COMPLETE STORY — all ${totalScenes} scenes with voiceover and visual direction:\n`;
    allScenes.forEach((s, i) => {
      const isCurrent = i === sceneIndex;
      const label = isCurrent ? `>>> SCENE ${i + 1} (GENERATE THIS ONE) <<<` : `Scene ${i + 1}`;
      const mood = s.color_mood ? ` | Mood: ${s.color_mood}` : "";
      prompt += `${label}:\n`;
      prompt += `  Voice: "${s.subtitle_text || s.voiceover_text}"\n`;
      if (!isCurrent) {
        // Show abbreviated visual direction for other scenes (keep prompt manageable)
        prompt += `  Visual: ${s.image_prompt.slice(0, 150)}...\n`;
      }
      prompt += `  ${mood}\n`;
    });
    prompt += `\n`;
  }

  prompt += `${bible}\n\n`;
  prompt += `GENERATE THIS IMAGE — Scene ${sceneIndex + 1} of ${totalScenes}:\n${scenePrompt}\n\n`;

  // Explicit continuity with immediate neighbors
  if (allScenes && allScenes.length > 0) {
    prompt += `CONTINUITY:\n`;
    if (sceneIndex > 0) {
      const prev = allScenes[sceneIndex - 1];
      prompt += `  Previous (scene ${sceneIndex}): "${prev.subtitle_text || prev.voiceover_text}" — ${prev.image_prompt.slice(0, 100)}...\n`;
    }
    if (sceneIndex < allScenes.length - 1) {
      const next = allScenes[sceneIndex + 1];
      prompt += `  Next (scene ${sceneIndex + 2}): "${next.subtitle_text || next.voiceover_text}" — ${next.image_prompt.slice(0, 100)}...\n`;
    }
    prompt += `Maintain visual consistency and style across all scenes.\n`;
  }

  const compositionLabel = aspectRatio === "16:9" ? "16:9 horizontal/landscape composition" : "9:16 vertical/portrait composition";
  prompt += `\n${compositionLabel}. No text in the image.`;
  return prompt;
}
