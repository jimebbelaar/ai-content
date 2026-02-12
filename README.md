# ADHD Harmony — AI Reels Generator

A complete AI-powered pipeline for generating ADHD Harmony branded short-form video content (Instagram Reels, TikTok, YouTube Shorts).

Type a concept and the app automatically:

1. **Claude AI** generates a complete voiceover script in the ADHD Harmony voice
2. **Nano Banana Pro** (Gemini) generates painterly illustrations for each scene
3. **Veo 3.1** adds subtle living animation to each image
4. **ElevenLabs** generates the voiceover audio with word-level timestamps
5. **Canvas + MediaRecorder** stitches everything into a final video with synced subtitles and background music

## Quick Start

### 1. Install Dependencies

```bash
cd adhd-reels
npm install
```

### 2. Configure API Keys

You have two options for API keys:

**Option A: Environment Variables** (recommended for solo use)

Copy the `.env.local` file and fill in your keys:

```bash
# .env.local
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_AI_API_KEY=AIza...
ELEVENLABS_API_KEY=xi-...
```

**Option B: In-App Configuration** (recommended for shared use)

Leave `.env.local` empty and enter keys via the Settings dialog in the app header. Keys are stored in your browser's localStorage.

### 3. Get Your API Keys

| Service | Where to Get Key | What It's Used For |
|---------|-----------------|-------------------|
| **Anthropic** | [console.anthropic.com](https://console.anthropic.com) | Script generation (Claude Sonnet) |
| **Google AI Studio** | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) | Image generation (Nano Banana Pro) + Animation (Veo 3.1) |
| **ElevenLabs** | [elevenlabs.io/app/settings](https://elevenlabs.io/app/settings) | Voiceover text-to-speech |


### 4. Run the App

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Usage Walkthrough

### Step 1: Concept Input
Enter your reel concept. For example:
> "Nietzsche's quote about seeing too much — how it relates to ADHD hyperawareness and why it's actually a gift, not a curse"

Adjust the number of scenes (6-10) and aspect ratio (9:16 for Reels/TikTok, 16:9 for YouTube).

### Step 2: Script Review
Claude generates a full script with the ADHD Harmony emotional arc:
- **Hook** → **Gut Punch** → **Recognition** → **The Weight** → **The Shift** → **The Reframe** → **The Closer**

Each scene includes voiceover text, image prompts, and animation prompts. Edit any scene before proceeding.

### Step 3: Image Generation
Generate painterly illustrations for each scene using Nano Banana Pro (Gemini). Approve, retry, or edit prompts for each image individually.

### Step 4: Animation
Each approved image gets subtle living animation via Veo 3.1 — barely perceptible movement like floating particles, gentle light flicker, and soft camera drift. Each clip takes ~30-60 seconds to generate.

### Step 5: Voiceover
Generate the voiceover with ElevenLabs. Choose a voice, adjust settings (stability, similarity, style), and optionally upload background music. The volume mixer lets you balance voiceover vs. music.

### Step 6: Final Assembly
Everything gets stitched together with word-by-word synced subtitles. Preview the result and download as WebM.

## Cost Per Reel

| Step | Service | Estimated Cost |
|------|---------|---------------|
| Script | Claude Sonnet | ~$0.01 |
| 8 images | Nano Banana Pro | ~$1.07 |
| 8 animations | Veo 3.1 | ~$2.80 |
| Voiceover | ElevenLabs | ~$0.10 |
| **Total** | | **~$4/reel** |

## Tech Stack

- **Next.js 15** (App Router, TypeScript)
- **Tailwind CSS v4** + **shadcn/ui**
- **Zustand** (state management)
- **Claude Sonnet** (script generation)
- **Gemini / Nano Banana Pro** (image generation)
- **Veo 3.1** (image-to-video animation)
- **ElevenLabs** (text-to-speech with timestamps)
- **Canvas + MediaRecorder + Web Audio API** (video assembly)
