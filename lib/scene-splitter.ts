// ============================================================
// Scene Splitter — Auto-expand multi-fragment scenes
// Splits scenes containing multiple sentence fragments
// (separated by "..." or ".") into separate scenes.
// ============================================================

import type { Scene } from "./store";

/**
 * Derive clean subtitle text from voiceover text (strip CAPS emphasis).
 */
function deriveSubtitle(voiceoverText: string): string {
  return voiceoverText.replace(/\b([A-Z]{2,})\b/g, (match) => {
    return match.charAt(0) + match.slice(1).toLowerCase();
  });
}

/**
 * Split voiceover text into sentence fragments at "..." and "." boundaries.
 *
 * Examples:
 *   "Called your curiosity... a DISRUPTION."  → ["Called your curiosity...", "a DISRUPTION."]
 *   "You felt that... didn't you."            → ["You felt that...", "didn't you."]
 *   "They put you in rows. Told you to sit still." → ["They put you in rows.", "Told you to sit still."]
 *   "But here's what they NEVER told you..."  → ["But here's what they NEVER told you..."] (no split)
 */
export function splitIntoFragments(text: string): string[] {
  if (!text || !text.trim()) return [text];

  // Mark split points:
  // 1. After "..." followed by whitespace → split
  // 2. After single "." (not part of "...") followed by whitespace and an uppercase letter → split
  const marked = text
    .replace(/\.\.\.\s+/g, "...\n")
    .replace(/\.(?!\.)\s+(?=[A-Z])/g, ".\n");

  const parts = marked
    .split("\n")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  if (parts.length <= 1) return [text];

  // Merge micro-fragments (< 4 chars) into the previous fragment
  const result: string[] = [];
  for (const part of parts) {
    if (part.length < 4 && result.length > 0) {
      result[result.length - 1] += " " + part;
    } else {
      result.push(part);
    }
  }

  return result.length > 0 ? result : [text];
}

/**
 * Expand scenes that contain multiple sentence fragments into separate scenes.
 * Each fragment gets its own scene with:
 *  - voiceover_text: the fragment
 *  - subtitle_text: de-capped version of the fragment
 *  - image_prompt: original prompt (first fragment) or original + variation directive (subsequent)
 *  - animation_prompt, color_mood: inherited from parent scene
 *  - scene_number: renumbered sequentially
 *
 * Scenes with a single fragment pass through unchanged (just renumbered).
 */
export function expandScenes(scenes: Scene[]): Scene[] {
  const expanded: Scene[] = [];
  let sceneNum = 1;

  for (const scene of scenes) {
    const fragments = splitIntoFragments(scene.voiceover_text);

    if (fragments.length <= 1) {
      // No split needed — pass through with renumbered scene_number
      expanded.push({ ...scene, scene_number: sceneNum++ });
      continue;
    }

    // Split into multiple scenes
    for (let i = 0; i < fragments.length; i++) {
      const fragment = fragments[i];
      const subtitleText = deriveSubtitle(fragment);

      // First fragment keeps the original image prompt;
      // subsequent fragments get a variation directive appended
      const imagePrompt =
        i === 0
          ? scene.image_prompt
          : `${scene.image_prompt}\n\n[Generate a distinct visual perspective for this beat: "${fragment}"]`;

      expanded.push({
        scene_number: sceneNum++,
        voiceover_text: fragment,
        subtitle_text: subtitleText,
        image_prompt: imagePrompt,
        animation_prompt: scene.animation_prompt,
        color_mood: scene.color_mood,
      });
    }
  }

  return expanded;
}
