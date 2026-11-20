// Lecteur audio de l'application.
//
// Deux moteurs :
//  1. Fichiers MP3 pré-enregistrés (passages clés des thèmes) joués par un élément <audio> :
//     la lecture continue écran éteint / application en arrière-plan, avec les commandes
//     sur l'écran de verrouillage (Media Session). Les silences de méditation sont eux aussi
//     des fichiers audio, pour que le téléphone ne coupe pas la session audio entre deux passages.
//  2. Synthèse vocale de l'appareil (Web Speech API) pour tout le reste de la Bible :
//     elle ne fonctionne que tant que l'écran reste allumé.
import { spokenRef, formatRef } from './books.js';
import { speechText } from './speech-text.js';
import { store } from './store.js';

const hasWindow = typeof window !== 'undefined';
const synth = hasWindow ? window.speechSynthesis : undefined;
export const ttsSupported = Boolean(synth && window.SpeechSynthesisUtterance);
const el = hasWindow && typeof Audio !== 'undefined' ? new Audio() : null;
if (el) el.preload = 'auto';
const ms = hasWindow && 'mediaSession' in navigator ? navigator.mediaSession : null;

const listeners = new Set();
let voices = [];
function refreshVoices() {
  if (!ttsSupported) return;
  voices = synth.getVoices().filter((v) => /^fr/i.test(v.lang));
  emit();
}

/** Voix françaises de l'appareil, les plus naturelles d'abord. */
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
  const clean = speechText(text);
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

// ---- fichiers audio disponibles -------------------------------------------------
let manifest = { items: {}, silences: [] };
export function setAudioManifest(m) {
  if (m?.items) manifest = m;
}
const fileKey = (p) => `${p.b}-${p.c}-${p.f}-${p.t ?? p.f}`;
/** Ce passage a-t-il un enregistrement (écoute possible écran éteint) ? */
export const hasAudioFile = (p) => Boolean(p && manifest.items[fileKey(p)]);
/** Toute la liste peut-elle être écoutée écran éteint ? */
export const playlistHasFiles = (list) => Boolean(list?.items.length) && list.items.every(hasAudioFile);

// ---- état -------------------------------------------------------------------
const state = {
  playlist: null, // { id, title, route, items: [{b,c,f,t,x}] }
  index: 0,
  status: 'idle', // idle | playing | paused | waiting
  countdown: 0,
  sleepAt: 0,
  error: '',
  ended: false,
  background: false, // le passage en cours est un fichier audio (écoute écran éteint possible)
};
let session = 0; // incrémenté à chaque arrêt : invalide les boucles de lecture en cours
let keepAlive = []; // garde une référence aux énoncés (bug Chrome : onend jamais appelé sinon)
let wakeLock = null;
let pendingFile = null; // fonction qui termine la lecture de fichier en cours
let filePaused = null; // statut à rétablir après une pause d'un fichier
let unlocked = false;

function emit() {
  updateMediaSession();
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
    stopAll();
    state.playlist = playlist;
    state.ended = false;
    state.index = Math.max(0, Math.min(startIndex, playlist.items.length - 1));
    state.status = 'idle';
    emit();
    if (autoplay) this.play();
  },
  play() {
    if (!state.playlist) return;
    // reprise d'un fichier mis en pause : on repart exactement où on s'était arrêté
    if (filePaused && el) {
      state.status = filePaused;
      filePaused = null;
      el.play().catch(() => {});
      emit();
      return;
    }
    const first = state.playlist.items[state.ended ? 0 : state.index];
    if (!hasAudioFile(first) && !ttsSupported) {
      state.error = "La lecture audio n'est pas disponible sur ce navigateur.";
      emit();
      return;
    }
    if (state.ended) {
      state.ended = false;
      state.index = 0;
    }
    // iPhone : l'élément audio doit être démarré une première fois par un geste de l'utilisateur
    if (el && !unlocked && !hasAudioFile(first) && manifest.silences?.length) {
      el.src = 'audio/silence-1.mp3';
      el.play().catch(() => {});
    }
    unlocked = true;
    if (store.settings.sleep && !state.sleepAt) state.sleepAt = Date.now() + store.settings.sleep * 60000;
    run(++session);
  },
  pause() {
    if (pendingFile && el && !el.paused) {
      el.pause();
      filePaused = state.status === 'waiting' ? 'waiting' : 'playing';
    } else {
      stopAll();
    }
    state.status = 'paused';
    releaseWakeLock();
    emit();
  },
  toggle() {
    if (state.status === 'playing' || state.status === 'waiting') this.pause();
    else this.play();
  },
  goto(i) {
    if (!state.playlist) return;
    const wasActive = state.status === 'playing' || state.status === 'waiting';
    stopAll();
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
    stopAll();
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

function stopAll() {
  session++;
  filePaused = null;
  if (ttsSupported) synth.cancel();
  keepAlive = [];
  if (el) el.pause();
  pendingFile?.(false);
  pendingFile = null;
  releaseWakeLock();
}

// ---- moteur 1 : fichiers audio -------------------------------------------------------
/** Joue un fichier ; résout true à la fin, false si arrêté, 'error' si le fichier est indisponible. */
function playFile(src, my, rate = 1) {
  return new Promise((resolve) => {
    if (my !== session || !el) return resolve(el ? false : 'error');
    const finish = (v) => {
      el.onended = el.onerror = null;
      pendingFile = null;
      resolve(v === true ? my === session : v);
    };
    pendingFile = finish;
    el.onended = () => finish(true);
    el.onerror = () => finish('error');
    el.src = src;
    el.playbackRate = rate;
    el.defaultPlaybackRate = rate;
    el.play().catch((e) => {
      // NotAllowedError : lecture bloquée par le navigateur ; AbortError : source remplacée
      if (e?.name !== 'AbortError') finish('error');
    });
  });
}

/** Silence de méditation joué comme un fichier audio (garde la session audio active écran éteint). */
async function silence(seconds, my) {
  const sizes = [...(manifest.silences || [])].sort((a, b) => b - a);
  let left = seconds;
  state.countdown = seconds;
  emit();
  const tick = setInterval(() => {
    if (my !== session) return clearInterval(tick);
    if (!el.paused && state.countdown > 0) {
      state.countdown--;
      emit();
    }
  }, 1000);
  try {
    while (left > 0) {
      const n = sizes.find((s) => s <= left) || sizes[sizes.length - 1];
      const r = await playFile(`audio/silence-${n}.mp3`, my, 1);
      if (r === 'error') return wait(left, my);
      if (!r) return false;
      left -= n;
    }
    return my === session;
  } finally {
    clearInterval(tick);
  }
}

// ---- moteur 2 : synthèse vocale de l'appareil ------------------------------------------
function speak(text, my) {
  return new Promise((resolve) => {
    if (my !== session || !ttsSupported) return resolve(false);
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
    const guard = setTimeout(() => finish(true), 4000 + (text.length * 160) / u.rate);
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

// ---- lecture d'un passage --------------------------------------------------------------
async function speakItem(item, my, withRef) {
  if (withRef && !(await speak(spokenRef(item.b, item.c, item.f, item.t) + '.', my))) return false;
  for (const verse of item.x) {
    for (const chunk of chunkText(verse)) {
      if (!(await speak(chunk, my))) return false;
    }
  }
  return true;
}

/** Joue une fois le passage (avec ou sans annonce de la référence). */
async function playItem(item, my, withRef) {
  const s = store.settings;
  if (hasAudioFile(item)) {
    state.background = true;
    releaseWakeLock(); // l'écran peut s'éteindre : le son continue
    emit();
    const key = fileKey(item);
    let r = true;
    if (withRef) r = await playFile(`audio/ref/${key}.mp3`, my, s.rate);
    if (r === true) r = await playFile(`audio/${key}.mp3`, my, s.rate);
    if (r !== 'error') return r;
    if (!ttsSupported) {
      state.error = 'Audio indisponible (connexion ?)';
      emit();
      return false;
    }
    // fichier indisponible (hors connexion…) : on bascule sur la voix de l'appareil
  }
  state.background = false;
  requestWakeLock(); // la voix de l'appareil s'arrête si l'écran s'éteint
  emit();
  return speakItem(item, my, withRef);
}

async function pause(seconds, my, item) {
  return hasAudioFile(item) ? silence(seconds, my) : wait(seconds, my);
}

async function run(my) {
  if (ttsSupported) synth.cancel();
  state.status = 'playing';
  state.error = '';
  emit();
  const s = store.settings;

  while (my === session && state.playlist) {
    const item = state.playlist.items[state.index];
    const times = Math.max(1, s.repeat);
    for (let r = 0; r < times && my === session; r++) {
      state.status = 'playing';
      emit();
      if (!(await playItem(item, my, s.readRef && r === 0))) return;
      if (r < times - 1 && !(await pause(Math.min(3, s.gap), my, item))) return;
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
    if (s.gap > 0 && !(await pause(s.gap, my, item))) return;
    state.index = last ? 0 : state.index + 1;
    emit();
  }
}

// ---- écran de verrouillage / notification (Media Session) ------------------------------
let lastMeta = '';
function updateMediaSession() {
  if (!ms) return;
  const p = state.playlist?.items[state.index];
  if (!p) {
    ms.playbackState = 'none';
    lastMeta = '';
    return;
  }
  const title = formatRef(p.b, p.c, p.f, p.t);
  const sig = `${title}|${state.playlist.title}`;
  if (sig !== lastMeta && typeof MediaMetadata !== 'undefined') {
    lastMeta = sig;
    ms.metadata = new MediaMetadata({
      title,
      artist: state.playlist.title,
      album: 'Bible par thèmes',
      artwork: [
        { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      ],
    });
  }
  ms.playbackState = state.status === 'playing' || state.status === 'waiting' ? 'playing' : 'paused';
}
if (ms) {
  const set = (action, fn) => {
    try {
      ms.setActionHandler(action, fn);
    } catch {
      /* action non prise en charge */
    }
  };
  set('play', () => player.play());
  set('pause', () => player.pause());
  set('stop', () => player.pause());
  set('nexttrack', () => player.next());
  set('previoustrack', () => player.prev());
}

// Pause depuis les commandes système (casque débranché, appel entrant…)
if (el) {
  el.addEventListener('pause', () => {
    if (pendingFile && !filePaused && !el.ended && (state.status === 'playing' || state.status === 'waiting')) {
      filePaused = state.status;
      state.status = 'paused';
      emit();
    }
  });
  el.addEventListener('play', () => {
    if (filePaused) {
      state.status = filePaused;
      filePaused = null;
      emit();
    }
  });
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && state.status === 'playing' && !state.background) requestWakeLock();
  });
}

// (en fin de module : toutes les déclarations ci-dessus doivent exister avant le premier emit)
if (ttsSupported) {
  refreshVoices();
  synth.addEventListener?.('voiceschanged', refreshVoices);
}
