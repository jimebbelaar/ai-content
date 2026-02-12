import type { WordTimestamp, Scene, SubtitleStyle } from "./store";
import { DEFAULT_SUBTITLE_STYLE } from "./store";

interface AssemblyConfig {
  scenes: Scene[];
  videos: Record<number, string>;
  images: Record<number, string>;
  voiceover: { audioBase64: string; wordTimestamps: WordTimestamp[]; audioUrl?: string } | null;
  backgroundMusic: { dataUrl: string } | null;
  volumes: { voiceover: number; music: number };
  musicStartOffset: number;
  musicSongStart: number;
  aspectRatio: "9:16" | "16:9";
  subtitleStyle?: SubtitleStyle;
  onProgress?: (progress: number, message: string) => void;
}

function cleanSubtitle(text: string): string {
  return text.replace(/\[.*?\]/g, "").replace(/\s{2,}/g, " ").trim();
}

async function toBlobUrl(src: string, type: string): Promise<string> {
  if (src.startsWith("blob:")) return src;
  if (src.startsWith("data:") || src.startsWith("/api/") || src.startsWith("http")) {
    return URL.createObjectURL(await (await fetch(src)).blob());
  }
  const bin = atob(src);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return URL.createObjectURL(new Blob([arr], { type }));
}

async function loadAudioBuffer(ctx: AudioContext, audioBase64: string, audioUrl?: string): Promise<AudioBuffer> {
  let resp: Response;
  if (audioUrl && (!audioBase64 || audioBase64.length < 100)) resp = await fetch(audioUrl);
  else if (audioBase64.startsWith("data:") || audioBase64.startsWith("/api/") || audioBase64.startsWith("http")) resp = await fetch(audioBase64);
  else {
    const bin = atob(audioBase64);
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    return ctx.decodeAudioData(buf.buffer);
  }
  return ctx.decodeAudioData(await resp.arrayBuffer());
}

function prerenderImage(img: HTMLImageElement, w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const cx = c.getContext("2d")!;
  cx.fillStyle = "#0a0e1a";
  cx.fillRect(0, 0, w, h);
  const sa = img.naturalWidth / img.naturalHeight, ca = w / h;
  let dw: number, dh: number, ox: number, oy: number;
  if (sa > ca) { dh = h; dw = h * sa; ox = (w - dw) / 2; oy = 0; }
  else { dw = w; dh = w / sa; ox = 0; oy = (h - dh) / 2; }
  cx.drawImage(img, ox, oy, dw, dh);
  return c;
}

function prerenderSubtitle(
  lines: string[], W: number, fontSize: number, strokeW: number, lineH: number,
  style: SubtitleStyle = DEFAULT_SUBTITLE_STYLE,
): HTMLCanvasElement | null {
  if (!lines.length) return null;
  const pad = 20;
  const cH = lines.length * lineH + pad * 2;
  const c = document.createElement("canvas");
  c.width = W; c.height = cH;
  const cx = c.getContext("2d")!;
  cx.font = `${style.fontWeight === "bold" ? "bold " : ""}${fontSize}px ${style.fontFamily}`;
  cx.textAlign = "center";
  cx.textBaseline = "middle";
  cx.lineJoin = "round";

  // Shadow
  if (style.shadowEnabled) {
    cx.shadowColor = style.shadowColor;
    cx.shadowBlur = style.shadowBlur;
    cx.shadowOffsetX = 0;
    cx.shadowOffsetY = 2;
  }

  // Stroke
  if (style.strokeEnabled) {
    cx.strokeStyle = style.strokeColor;
    cx.lineWidth = strokeW;
    for (let i = 0; i < lines.length; i++) cx.strokeText(lines[i], W / 2, pad + i * lineH + lineH / 2);
  }

  // Reset shadow for fill (so shadow doesn't double)
  cx.shadowColor = "transparent";
  cx.shadowBlur = 0;
  cx.shadowOffsetX = 0;
  cx.shadowOffsetY = 0;

  cx.fillStyle = style.color;
  for (let i = 0; i < lines.length; i++) cx.fillText(lines[i], W / 2, pad + i * lineH + lineH / 2);
  return c;
}

function prerenderWatermark(W: number, H: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = W; c.height = Math.round(H * 0.06);
  const cx = c.getContext("2d")!;
  cx.font = `italic ${Math.round(W * 0.028)}px Georgia, 'Times New Roman', serif`;
  cx.textAlign = "center";
  cx.textBaseline = "middle";
  cx.fillStyle = "white";
  cx.fillText("@adhdharmony", W / 2, c.height / 2);
  return c;
}

// Pre-render sparkle glow images (tiny dust particles)
function prerenderSparkleImgs(): HTMLCanvasElement[] {
  return [4, 6, 8].map(d => {
    const c = document.createElement("canvas");
    const s = d * 3;
    c.width = s; c.height = s;
    const cx = c.getContext("2d")!;
    const ctr = s / 2, r = d / 2;
    const g = cx.createRadialGradient(ctr, ctr, 0, ctr, ctr, r * 2.5);
    g.addColorStop(0, "rgba(255,255,250,1)");
    g.addColorStop(0.3, "rgba(255,250,235,0.4)");
    g.addColorStop(0.7, "rgba(255,245,215,0.08)");
    g.addColorStop(1, "rgba(255,245,215,0)");
    cx.fillStyle = g;
    cx.beginPath();
    cx.arc(ctr, ctr, r * 2.5, 0, Math.PI * 2);
    cx.fill();
    return c;
  });
}

// Pre-render low-res noise canvases (scaled up = chunky retro grain, very cheap)
function prerenderNoiseFrames(W: number, H: number, count: number): HTMLCanvasElement[] {
  const nw = Math.ceil(W / 8), nh = Math.ceil(H / 8); // 1/8th resolution
  return Array.from({ length: count }, () => {
    const c = document.createElement("canvas");
    c.width = nw; c.height = nh;
    const cx = c.getContext("2d")!;
    const img = cx.createImageData(nw, nh);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = Math.random() * 255;
      d[i] = d[i + 1] = d[i + 2] = v;
      d[i + 3] = 255;
    }
    cx.putImageData(img, 0, 0);
    return c;
  });
}

interface Sparkle { bx: number; by: number; sx: number; sy: number; ph: number; hz: number; a0: number; a1: number; si: number; }
function makeSparkles(n: number, W: number, H: number): Sparkle[] {
  const out: Sparkle[] = [];
  for (let i = 0; i < n; i++) {
    const s = i * 137.508;
    out.push({ bx: (Math.sin(s) * .5 + .5) * W, by: (Math.cos(s * 1.3) * .5 + .5) * H, sx: 15 + (i % 5) * 12, sy: -(10 + (i % 6) * 8), ph: s, hz: 1.2 + (i % 5) * .3, a0: .15, a1: .55, si: i % 3 });
  }
  return out;
}

export async function assembleVideo(config: AssemblyConfig): Promise<string> {
  const { scenes, videos, images, voiceover, backgroundMusic, volumes, musicStartOffset, musicSongStart, aspectRatio, subtitleStyle: _subStyle, onProgress } = config;
  const subStyle = _subStyle || DEFAULT_SUBTITLE_STYLE;
  const W = aspectRatio === "9:16" ? 1080 : 1920;
  const H = aspectRatio === "9:16" ? 1920 : 1080;
  const FPS = 30;
  const FRAME_MS = 1000 / FPS;

  onProgress?.(0, "Preparing overlays...");

  // ===== PRE-RENDER EVERYTHING =====
  const sparkleImgs = prerenderSparkleImgs();
  const sparkles = makeSparkles(12, W, H);
  const watermarkC = prerenderWatermark(W, H);
  const noiseFrames = prerenderNoiseFrames(W, H, 4); // 4 unique noise textures at 1/8 res

  const vigC = document.createElement("canvas");
  vigC.width = W; vigC.height = H;
  const vCx = vigC.getContext("2d")!;
  const vg = vCx.createRadialGradient(W / 2, H / 2, W * 0.3, W / 2, H / 2, W * 0.9);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(0,0,0,0.45)");
  vCx.fillStyle = vg;
  vCx.fillRect(0, 0, W, H);

  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d", { alpha: false })!;

  // ===== LOAD MEDIA =====
  onProgress?.(2, "Loading media...");
  type VidMedia = { type: "video"; el: HTMLVideoElement };
  type ImgMedia = { type: "image"; pre: HTMLCanvasElement };
  type Media = VidMedia | ImgMedia;
  const media: (Media | null)[] = new Array(scenes.length).fill(null);
  const blobUrls: string[] = [];

  for (let i = 0; i < scenes.length; i++) {
    onProgress?.(2 + Math.round((i / scenes.length) * 6), `Loading scene ${i + 1}...`);
    if (videos[i]) {
      try {
        const url = await toBlobUrl(videos[i], "video/mp4"); blobUrls.push(url);
        const v = document.createElement("video");
        v.src = url; v.muted = true; v.playsInline = true; v.preload = "auto"; v.loop = true;
        await new Promise<void>(r => { v.oncanplaythrough = () => r(); v.onloadeddata = () => r(); setTimeout(r, 10000); });
        if (v.readyState >= 2) { media[i] = { type: "video", el: v }; continue; }
      } catch {}
    }
    if (images[i]) {
      try {
        const url = await toBlobUrl(images[i], "image/png"); blobUrls.push(url);
        const img = new Image(); img.src = url;
        await new Promise<void>(r => { img.onload = () => r(); setTimeout(r, 5000); });
        if (img.naturalWidth > 0) media[i] = { type: "image", pre: prerenderImage(img, W, H) };
      } catch {}
    }
  }
  if (!media.some(m => m)) throw new Error("No media could be loaded");

  // ===== AUDIO =====
  onProgress?.(9, "Loading audio...");
  const aCtx = new AudioContext();
  let voBuf: AudioBuffer | null = null;
  const voAudioUrl = (voiceover as { audioUrl?: string } | null)?.audioUrl;
  if (voiceover && (voiceover.audioBase64?.length > 100 || voAudioUrl)) {
    voBuf = await loadAudioBuffer(aCtx, voiceover.audioBase64 || "", voAudioUrl);
  }
  let musBuf: AudioBuffer | null = null;
  if (backgroundMusic) { try { musBuf = await loadAudioBuffer(aCtx, backgroundMusic.dataUrl); } catch {} }

  // ===== SCENE TIMING =====
  const hasVoiceover = voBuf !== null;
  // For subtitles-only: total duration = sum of display_durations
  const sceneDurSec = scenes.map(s => s.display_duration || s.audio_duration || 4);
  const totalDurSec = hasVoiceover ? voBuf!.duration : sceneDurSec.reduce((a, b) => a + b, 0);
  const voMs = totalDurSec * 1000;
  const eq = totalDurSec / (scenes.length || 1);
  const dur = scenes.map(s => (s.display_duration || s.audio_duration || eq) * 1000);
  const dSum = dur.reduce((a, b) => a + b, 0);
  if (dSum > 0 && dur.length > 0) dur[dur.length - 1] = Math.max(100, dur[dur.length - 1] + (voMs - dSum));
  const st: number[] = []; let a = 0;
  for (const d of dur) { st.push(a); a += d; }

  // ===== PRE-RENDER SUBTITLES =====
  onProgress?.(10, "Rendering subtitles...");
  const fs = Math.round(W * subStyle.fontSize);
  const sw = Math.round(W * subStyle.strokeWidth);
  const lh = fs * 1.4;
  ctx.font = `${subStyle.fontWeight === "bold" ? "bold " : ""}${fs}px ${subStyle.fontFamily}`;
  const mxW = W * 0.85;
  const subs: (HTMLCanvasElement | null)[] = scenes.map(s => {
    const t = cleanSubtitle(s.subtitle_text || s.voiceover_text || "");
    if (!t) return null;
    const words = t.split(" "); const lines: string[] = []; let cur = "";
    for (const w of words) { const test = cur ? `${cur} ${w}` : w; if (ctx.measureText(test).width > mxW && cur) { lines.push(cur); cur = w; } else cur = test; }
    if (cur) lines.push(cur);
    return prerenderSubtitle(lines, W, fs, sw, lh, subStyle);
  });
  const subYs = subs.map((sc, i) => {
    if (!sc) return 0;
    const pos = scenes[i].subtitle_position ?? 0.50;
    return Math.round(H * pos - sc.height / 2);
  });
  const wmY = Math.round(H * 0.82 - watermarkC.height / 2);

  // ===== BUFFER VIDEOS =====
  onProgress?.(11, "Buffering...");
  for (const m of media) { if (m?.type === "video") { m.el.currentTime = 0; await m.el.play().catch(() => {}); m.el.pause(); } }

  // ===== RECORDER =====
  onProgress?.(12, "Recording...");
  const dest = aCtx.createMediaStreamDestination();

  let voSrc: AudioBufferSourceNode | null = null;
  if (voBuf) {
    voSrc = aCtx.createBufferSource(); voSrc.buffer = voBuf;
    const voG = aCtx.createGain(); voG.gain.value = volumes.voiceover / 100;
    voSrc.connect(voG).connect(dest);
  }

  let musSrc: AudioBufferSourceNode | null = null;
  if (musBuf) {
    musSrc = aCtx.createBufferSource(); musSrc.buffer = musBuf; musSrc.loop = true;
    const mg = aCtx.createGain(); mg.gain.value = volumes.music / 100;
    musSrc.connect(mg).connect(dest);
  }

  // If no audio at all (no voice, no music), create a silent oscillator so MediaRecorder has an audio track
  let silentOsc: OscillatorNode | null = null;
  if (!voBuf && !musBuf) {
    silentOsc = aCtx.createOscillator();
    const silentGain = aCtx.createGain();
    silentGain.gain.value = 0;
    silentOsc.connect(silentGain).connect(dest);
  }

  // Use captureStream(0) — only capture when we explicitly call requestFrame()
  // This guarantees every rendered frame is captured, no stale/duplicate frames
  const videoStream = canvas.captureStream(0);
  const captureTrack = videoStream.getVideoTracks()[0] as MediaStreamTrack & { requestFrame?: () => void };
  const stream = new MediaStream([captureTrack, ...dest.stream.getAudioTracks()]);
  const rec = new MediaRecorder(stream, { mimeType: getSupportedMimeType(), videoBitsPerSecond: 8_000_000 });
  const chunks: Blob[] = [];
  rec.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };

  // ===== DETERMINISTIC FRAME-BY-FRAME RENDER =====
  // Instead of setInterval (unreliable, drops frames under load), we use an async for-loop
  // that renders every single frame deterministically and explicitly captures it.
  // Pacing to wall-clock time keeps audio in sync.

  onProgress?.(12, "Recording...");
  rec.start(100); // frequent data chunks for smoother recording
  if (voSrc) voSrc.start(0);
  if (musSrc) musSrc.start(musicStartOffset > 0 ? aCtx.currentTime + musicStartOffset : 0, musicSongStart || 0);
  if (silentOsc) silentOsc.start(0);

  let cur = -1;
  let lastProgressMs = 0;
  const t0 = performance.now();
  const fadeAt = voMs;
  const fadeDur = 2500;
  const endMs = fadeAt + fadeDur;
  const totalFrames = Math.ceil(endMs / FRAME_MS);

  for (let frameIdx = 0; frameIdx < totalFrames; frameIdx++) {
    // Deterministic timestamp for this frame (not wall-clock — guarantees even spacing)
    const el = frameIdx * FRAME_MS;

    // Pace to real-time so audio stays in sync
    const wallElapsed = performance.now() - t0;
    const sleepMs = el - wallElapsed;
    if (sleepMs > 2) {
      await new Promise<void>(r => setTimeout(r, sleepMs - 1));
    } else if (frameIdx % 4 === 0) {
      // Yield to event loop occasionally even when running behind, to keep UI responsive
      await new Promise<void>(r => setTimeout(r, 0));
    }

    // Progress reporting (~every 500ms of video time)
    if (el - lastProgressMs > 500) {
      lastProgressMs = el;
      onProgress?.(12 + Math.round(Math.min(el / voMs, 1) * 83), `${Math.round(el / 1000)}s / ${Math.round(voMs / 1000)}s`);
    }

    // Scene selection — use st[i+1] directly instead of st[i]+dur[i] to avoid
    // floating-point drift at scene boundaries (especially with many scenes)
    let si = scenes.length - 1;
    for (let i = 0; i < scenes.length; i++) {
      const end = i < scenes.length - 1 ? st[i + 1] : voMs;
      if (el < end) { si = i; break; }
    }
    if (si !== cur) {
      if (cur >= 0 && media[cur]?.type === "video") (media[cur] as VidMedia).el.pause();
      cur = si;
      const mm = media[cur];
      if (mm?.type === "video") { mm.el.currentTime = 0; mm.el.play().catch(() => {}); }
    }

    const se = el - st[cur];

    // === DRAW MEDIA ===
    const m = media[cur];
    if (m?.type === "video") {
      const v = m.el;
      if (v.paused) v.play().catch(() => {});
      if (v.readyState >= 2) {
        const sa = v.videoWidth / v.videoHeight, ca = W / H;
        let dw: number, dh: number, ox: number, oy: number;
        if (sa > ca) { dh = H; dw = H * sa; ox = (W - dw) / 2; oy = 0; }
        else { dw = W; dh = W / sa; ox = 0; oy = (H - dh) / 2; }
        ctx.drawImage(v, ox, oy, dw, dh);
      } else { ctx.fillStyle = "#0a0e1a"; ctx.fillRect(0, 0, W, H); }
    } else if (m?.type === "image") {
      const p = m.pre;
      // Fixed-speed Ken Burns — constant zoom rate regardless of scene duration.
      // Short clips get subtle movement; long clips get more travel. Never jarring.
      const KB_SPEED = 0.010;  // 1.0% zoom per second
      const KB_MAX   = 0.08;   // cap at 8% total zoom
      const seSec = se / 1000;
      const zoomAmt = Math.min(seSec * KB_SPEED, KB_MAX);
      // Alternate direction: even scenes zoom in, odd scenes start zoomed and pull out
      const z = cur % 2 === 0
        ? 1.0 + zoomAmt                             // zoom in
        : 1.0 + KB_MAX - Math.min(seSec * KB_SPEED, KB_MAX); // zoom out
      const dw = W * z, dh = H * z;
      ctx.drawImage(p, 0, 0, p.width, p.height, (W - dw) / 2, (H - dh) / 2, dw, dh);
    } else { ctx.fillStyle = "#0a0e1a"; ctx.fillRect(0, 0, W, H); }

    // === OVERLAYS ===
    const ts = el / 1000;

    // Warm wash + breathing
    const br = Math.sin(ts * 0.5) * 0.5 + 0.5;
    ctx.globalAlpha = 0.03 + br * 0.02;
    ctx.fillStyle = "rgba(255,200,140,1)";
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;

    // Vignette
    ctx.drawImage(vigC, 0, 0);

    // Retro noise — tiny canvas scaled up = chunky grain, near-zero cost
    ctx.globalAlpha = 0.045;
    ctx.drawImage(noiseFrames[frameIdx % noiseFrames.length], 0, 0, W, H);
    ctx.globalAlpha = 1;

    // Sparkles
    for (let i = 0; i < sparkles.length; i++) {
      const sp = sparkles[i];
      const px = (sp.bx + ts * sp.sx) % W;
      const py = ((sp.by + ts * sp.sy) % H + H) % H;
      const pu = Math.sin(ts * sp.hz + sp.ph) * 0.5 + 0.5;
      ctx.globalAlpha = sp.a0 + pu * (sp.a1 - sp.a0);
      ctx.drawImage(sparkleImgs[sp.si], px - 6, py - 6);
    }
    ctx.globalAlpha = 1;

    // Subtitle
    const inFade = el >= fadeAt;
    if (!inFade && cur >= 0 && subs[cur]) {
      ctx.drawImage(subs[cur]!, 0, subYs[cur]);
    }

    // Watermark
    if (!inFade) {
      ctx.drawImage(watermarkC, 0, wmY);
    }

    // Fade to black
    if (inFade) {
      ctx.fillStyle = `rgba(0,0,0,${Math.min((el - fadeAt) / fadeDur, 1)})`;
      ctx.fillRect(0, 0, W, H);
    }

    // Explicitly capture this fully-rendered frame into the recording stream
    captureTrack.requestFrame?.();
  }

  // ===== STOP AND FINALIZE =====
  media.forEach(m => { if (m?.type === "video") m.el.pause(); });
  try { voSrc?.stop(); } catch {} try { musSrc?.stop(); } catch {} try { silentOsc?.stop(); } catch {}

  return new Promise<string>((resolve, reject) => {
    rec.onstop = () => setTimeout(() => {
      const blob = new Blob(chunks, { type: getSupportedMimeType() });
      blobUrls.forEach(u => URL.revokeObjectURL(u));
      aCtx.close();
      onProgress?.(100, "Complete!");
      resolve(URL.createObjectURL(blob));
    }, 500);
    rec.onerror = () => reject(new Error("Recording failed"));
    rec.stop();
  });
}

function getSupportedMimeType(): string {
  // Prefer MP4 (supported in Chrome 130+), fall back to WebM
  for (const t of [
    "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
    "video/mp4",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ]) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return "video/webm";
}

function getFileExtension(mime: string): string {
  return mime.startsWith("video/mp4") ? "mp4" : "webm";
}
