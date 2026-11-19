// Lecteur audio : lit une liste de passages à voix haute avec la synthèse vocale de l'appareil
// (Web Speech API), avec pauses de méditation, répétition, boucle et minuterie d'arrêt.
import { spokenRef } from './books.js';
import { store } from './store.js';

const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
export const ttsSupported = Boolean(synth && window.SpeechSynthesisUtterance);

const listeners = new Set();
let voices = [];
function refreshVoices() {
  if (!ttsSupported) return;
  voices = synth.getVoices().filter((v) => /^fr/i.test(v.lang));
  emit();
}
if (ttsSupported) {
  refreshVoices();
  synth.addEventListener?.('voiceschanged', refreshVoices);
}

/** Voix françaises, les plus naturelles d'abord. */
export function frenchVoices() {
  const score = (v) =>
    (/natural|neural|online|premium|enhanced|google/i.test(v.name) ? 0 : 1) + (/fr-FR/i.test(v.lang) ? 0 : 0.5);
  return [...voices].sort((a, b) => score(a) - score(b) || a.name.localeCompare(b.name));
}

function pickVoice() {
  const wanted = store.settings.voice;
  const list = frenchVoices();
  return list.find((v) => v.voiceURI === wanted) || list[0] || null;
}

/** Découpe en morceaux courts : évite les coupures de certains navigateurs sur les longues phrases. */
export function chunkText(text, max = 220) {
  const clean = text.replace(/\s*-?Pause\.?\s*$/i, '').replace(/\s-Pause\.\s/gi, ' ').trim();
  const sentences = clean.match(/[^.!?;:]+[.!?;:]*\s*/g) || [clean];
  const out = [];
  let cur = '';
  for (const s of sentences) {
    if ((cur + s).length > max && cur) {
      out.push(cur.trim());
      cur = '';
    }
    if (s.length > max) {
      for (const part of s.split(/(?<=,)\s+/)) {
        if ((cur + ' ' + part).length > max && cur) {
          out.push(cur.trim());
          cur = '';
        }
        cur += (cur ? ' ' : '') + part;
      }
    } else cur += s;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

// ---- état -------------------------------------------------------------------
const state = {
  playlist: null, // { title, route, items: [{b,c,f,t,x}] }
  index: 0,
  status: 'idle', // idle | playing | paused | waiting
  countdown: 0,
  sleepAt: 0,
  error: '',
  ended: false,
};
let session = 0; // incrémenté à chaque arrêt : invalide les boucles de lecture en cours
let keepAlive = []; // garde une référence aux énoncés (bug Chrome : onend jamais appelé sinon)
let wakeLock = null;

function emit() {
  listeners.forEach((fn) => fn(state));
}

export const player = {
  state,
  onChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  get current() {
    return state.playlist?.items[state.index] || null;
  },
  load(playlist, startIndex = 0, autoplay = true) {
    stopSpeech();
    state.playlist = playlist;
    state.ended = false;
    state.index = Math.max(0, Math.min(startIndex, playlist.items.length - 1));
    state.status = 'idle';
    emit();
    if (autoplay) this.play();
  },
  play() {
    if (!state.playlist) return;
    if (!ttsSupported) {
      state.error = "La lecture audio n'est pas disponible sur ce navigateur.";
      emit();
      return;
    }
    if (state.ended) {
      state.ended = false;
      state.index = 0;
    }
    if (store.settings.sleep && !state.sleepAt) state.sleepAt = Date.now() + store.settings.sleep * 60000;
    run(++session);
  },
  pause() {
    stopSpeech();
    state.status = 'paused';
    emit();
  },
  toggle() {
    if (state.status === 'playing' || state.status === 'waiting') this.pause();
    else this.play();
  },
  goto(i) {
    if (!state.playlist) return;
    const wasActive = state.status === 'playing' || state.status === 'waiting';
    stopSpeech();
    state.ended = false;
    state.index = Math.max(0, Math.min(i, state.playlist.items.length - 1));
    state.status = wasActive ? 'idle' : 'paused';
    emit();
    if (wasActive) this.play();
  },
  next() {
    this.goto(state.index + 1);
  },
  prev() {
    this.goto(state.index - 1);
  },
  stop() {
    stopSpeech();
    state.playlist = null;
    state.status = 'idle';
    state.sleepAt = 0;
    emit();
  },
  resetSleep() {
    state.sleepAt = store.settings.sleep ? Date.now() + store.settings.sleep * 60000 : 0;
    emit();
  },
};

function stopSpeech() {
  session++;
  if (ttsSupported) synth.cancel();
  keepAlive = [];
  releaseWakeLock();
}

function speak(text, my) {
  return new Promise((resolve) => {
    if (my !== session) return resolve(false);
    const u = new SpeechSynthesisUtterance(text);
    const v = pickVoice();
    if (v) u.voice = v;
    u.lang = v?.lang || 'fr-FR';
    u.rate = store.settings.rate;
    u.pitch = 1;
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      clearTimeout(guard);
      resolve(ok && my === session);
    };
    u.onend = () => finish(true);
    u.onerror = (e) => finish(e.error !== 'interrupted' && e.error !== 'canceled');
    // garde-fou si le navigateur n'émet jamais "end"
    const guard = setTimeout(() => finish(true), 4000 + text.length * 160 / u.rate);
    keepAlive.push(u);
    synth.speak(u);
  });
}

function wait(seconds, my) {
  return new Promise((resolve) => {
    state.countdown = seconds;
    emit();
    if (seconds <= 0) return resolve(my === session);
    const tick = setInterval(() => {
      if (my !== session) {
        clearInterval(tick);
        return resolve(false);
      }
      state.countdown--;
      emit();
      if (state.countdown <= 0) {
        clearInterval(tick);
        resolve(true);
      }
    }, 1000);
  });
}

async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator && !wakeLock) wakeLock = await navigator.wakeLock.request('screen');
  } catch {
    wakeLock = null;
  }
}
function releaseWakeLock() {
  wakeLock?.release?.().catch(() => {});
  wakeLock = null;
}

async function run(my) {
  synth.cancel();
  state.status = 'playing';
  state.error = '';
  emit();
  requestWakeLock();
  const s = store.settings;

  while (my === session && state.playlist) {
    const item = state.playlist.items[state.index];
    for (let r = 0; r < Math.max(1, s.repeat) && my === session; r++) {
      state.status = 'playing';
      emit();
      if (s.readRef && r === 0 && !(await speak(spokenRef(item.b, item.c, item.f, item.t) + '.', my))) return;
      for (const verse of item.x) {
        for (const chunk of chunkText(verse)) {
          if (!(await speak(chunk, my))) return;
        }
      }
      if (r < s.repeat - 1 && !(await wait(Math.min(3, s.gap), my))) return;
    }
    if (my !== session) return;

    if (state.sleepAt && Date.now() >= state.sleepAt) {
      state.status = 'paused';
      state.sleepAt = 0;
      releaseWakeLock();
      emit();
      return;
    }

    const last = state.index >= state.playlist.items.length - 1;
    if (last && !s.loop) {
      state.status = 'paused';
      state.ended = true;
      releaseWakeLock();
      emit();
      return;
    }
    state.status = 'waiting';
    if (!(await wait(s.gap, my))) return;
    state.index = last ? 0 : state.index + 1;
    emit();
  }
}

// Le navigateur suspend la synthèse quand la page est masquée sur certains mobiles :
// on rétablit le verrou d'écran au retour.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && state.status === 'playing') requestWakeLock();
  });
}
