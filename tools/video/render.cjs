// Génère la vidéo de présentation (1080×1920, 30 i/s) à partir de tools/video/promo.html.
//
//   node tools/video/render.cjs [sortie.mp4] [--preview]
//
// Nécessite Playwright (Chromium) et ffmpeg. --preview : rendu rapide en basse définition.
const { spawn, execFileSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '../..');
const OUT = path.resolve(process.argv.find((a) => a.endsWith('.mp4')) || path.join(ROOT, 'promo.mp4'));
const PREVIEW = process.argv.includes('--preview');
const FPS = PREVIEW ? 15 : 30;
const SCALE = PREVIEW ? 1 : 2;
const PORT = 8791;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'promo-'));

const READING_START = 11.4; // le lecteur démarre (clic sur « Écouter ») : on y place l'audio réel de l'application

function ffmpeg(args) {
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });
}

/** Musique d'ambiance douce (accords tenus) générée par ffmpeg. */
function makeMusic(duration, file) {
  const chords = [
    [130.81, 196.0, 329.63, 493.88], // Do maj7
    [110.0, 164.81, 392.0, 523.25], // La m7
    [87.31, 130.81, 220.0, 329.63], // Fa maj7
    [98.0, 146.83, 246.94, 293.66], // Sol
  ];
  const len = 6.5;
  const step = 5;
  const inputs = [];
  const parts = [];
  let i = 0;
  for (let t = 0; t < duration; t += step, i++) {
    const f = chords[i % chords.length];
    const expr = f
      .map((hz, k) => `${(k === 0 ? 0.22 : 0.14).toFixed(2)}*sin(2*PI*${hz}*t)+0.05*sin(2*PI*${(hz * 1.003).toFixed(3)}*t)`)
      .join('+');
    inputs.push('-f', 'lavfi', '-i', `aevalsrc='(${expr})*min(1,t/2)*min(1,(${len}-t)/2)':s=44100:d=${len}`);
    parts.push(`[${i}]adelay=${Math.round(t * 1000)}|${Math.round(t * 1000)}[c${i}]`);
  }
  const mix = parts.map((_, k) => `[c${k}]`).join('');
  ffmpeg([
    ...inputs,
    '-filter_complex',
    `${parts.join(';')};${mix}amix=inputs=${parts.length}:normalize=0,lowpass=f=2400,aecho=0.8:0.7:180|420:0.35|0.25,` +
      `volume=0.55,afade=t=in:d=1.5,afade=t=out:st=${duration - 3}:d=3,atrim=0:${duration}[m]`,
    '-map', '[m]', '-ac', '2', file,
  ]);
}

/** Petits sons de toucher. */
function makeTap(file) {
  ffmpeg(['-f', 'lavfi', '-i', "aevalsrc='0.5*sin(2*PI*1400*t)*exp(-t*55)':s=44100:d=0.15", '-ac', '2', file]);
}

async function main() {
  const server = spawn('node', [path.join(ROOT, 'tools/serve.mjs'), String(PORT)], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 800));
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
  try {
    const ctx = await browser.newContext({
      viewport: { width: 540, height: 960 },
      deviceScaleFactor: SCALE,
      colorScheme: 'light',
      serviceWorkers: 'block',
    });
    await ctx.addInitScript(() => {
      try {
        localStorage.setItem('bible-themes:v1', JSON.stringify({ settings: { gap: 4 } }));
      } catch {}
      // voix de l'appareil simulée (le son réel est ajouté au montage)
      const synth = { getVoices: () => [], cancel() {}, addEventListener() {}, speak(u) { setTimeout(() => u.onend && u.onend(), 50); } };
      Object.defineProperty(window, 'speechSynthesis', { value: synth });
      window.SpeechSynthesisUtterance = function (t) { this.text = t; };
      // Pendant la capture, le temps réel passe plus vite que le temps de la vidéo : on fige la lecture
      // dans l'application (l'audio réel est ajouté au montage), pour qu'elle reste sur le bon verset.
      HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
    });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.error('Erreur page :', e.message));
    await page.goto(`http://localhost:${PORT}/tools/video/promo.html`);
    const app = page.frameLocator('#app');
    await app.locator('.theme-card').first().waitFor();
    // précharge la Bible (recherche, chapitres)
    await page.evaluate(() => document.querySelector('#app').contentWindow.location.hash = '#/recherche?q=berger');
    await app.locator('.passage').first().waitFor({ timeout: 20000 });
    await page.evaluate(() => document.querySelector('#app').contentWindow.location.hash = '#/');
    await app.locator('.theme-card').first().waitFor();
    await page.waitForTimeout(500);

    const duration = await page.evaluate(() => window.DURATION);
    const taps = await page.evaluate(() => window.TAPS);
    const frames = Math.round(duration * FPS);
    const video = path.join(TMP, 'video.mp4');
    const enc = spawn('ffmpeg', [
      '-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-',
      '-c:v', 'libx264', '-preset', PREVIEW ? 'veryfast' : 'slow', '-crf', PREVIEW ? '28' : '18',
      '-pix_fmt', 'yuv420p', '-vf', `scale=${540 * SCALE}:${960 * SCALE}`, video,
    ], { stdio: ['pipe', 'inherit', 'inherit'] });
    for (let f = 0; f < frames; f++) {
      await page.evaluate((t) => window.renderAt(t), f / FPS);
      const buf = await page.screenshot({ type: 'jpeg', quality: 92 });
      if (!enc.stdin.write(buf)) await new Promise((r) => enc.stdin.once('drain', r));
      if (f % FPS === 0) process.stdout.write(`\r${Math.round((f / frames) * 100)} %`);
    }
    enc.stdin.end();
    await new Promise((r) => enc.on('close', r));
    process.stdout.write('\r100 %\n');

    // ---- bande son ----
    const music = path.join(TMP, 'music.wav');
    const tap = path.join(TMP, 'tap.wav');
    makeMusic(duration, music);
    makeTap(tap);
    const ref = path.join(ROOT, 'audio/ref/43-3-16-16.mp3');
    const verse = path.join(ROOT, 'audio/43-3-16-16.mp3');
    const refDur = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', ref]).toString());
    const verseDur = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', verse]).toString());
    const readEnd = READING_START + refDur + verseDur;
    const ms = (s) => Math.round(s * 1000);
    const tapInputs = taps.flatMap(() => ['-i', tap]);
    const tapFilters = taps.map((t, k) => `[${3 + k}]adelay=${ms(t)}|${ms(t)},volume=0.35[t${k}]`).join(';');
    const tapLabels = taps.map((_, k) => `[t${k}]`).join('');
    ffmpeg([
      '-i', music, '-i', ref, '-i', verse, ...tapInputs,
      '-filter_complex',
      `[0]volume='if(between(t,${READING_START - 0.3},${readEnd + 0.3}),0.35,1)':eval=frame[m];` +
        `[1]adelay=${ms(READING_START)}|${ms(READING_START)},volume=1.6[r];` +
        `[2]adelay=${ms(READING_START + refDur)}|${ms(READING_START + refDur)},volume=1.6[v];` +
        `${tapFilters};[m][r][v]${tapLabels}amix=inputs=${3 + taps.length}:normalize=0,` +
        `loudnorm=I=-16:TP=-1.5,atrim=0:${duration}[a]`,
      '-map', '[a]', '-ac', '2', '-ar', '44100', path.join(TMP, 'audio.wav'),
    ]);
    ffmpeg(['-i', video, '-i', path.join(TMP, 'audio.wav'), '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k',
      '-movflags', '+faststart', '-shortest', OUT]);
    console.log(`Vidéo : ${OUT}`);
  } finally {
    await browser.close();
    server.kill();
    fs.rmSync(TMP, { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
