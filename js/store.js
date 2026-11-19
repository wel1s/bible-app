// Données personnelles (favoris, notes de méditation, réglages) stockées sur l'appareil.
const KEY = 'bible-themes:v1';

const defaults = () => ({
  favorites: {}, // clé "b:c:f-t" -> { b, c, f, t, x, added }
  notes: {}, // clé -> { text, updated }
  settings: {
    rate: 0.9,
    voice: '',
    gap: 4, // secondes de silence entre deux passages
    repeat: 1,
    readRef: true,
    loop: false,
    sleep: 0, // minutes, 0 = désactivé
    fontSize: 1,
  },
  lastTheme: null,
  lastRead: { b: 43, c: 1 },
});

let state = defaults();
try {
  const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
  if (saved) state = { ...state, ...saved, settings: { ...state.settings, ...saved.settings } };
} catch {
  /* stockage indisponible : on garde les valeurs par défaut */
}

const listeners = new Set();
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
  listeners.forEach((fn) => fn());
}

export const passageKey = (p) => `${p.b}:${p.c}:${p.f}-${p.t ?? p.f}`;

export const store = {
  onChange: (fn) => listeners.add(fn),
  get settings() {
    return state.settings;
  },
  setSetting(k, v) {
    state.settings[k] = v;
    save();
  },
  isFavorite: (p) => Boolean(state.favorites[passageKey(p)]),
  toggleFavorite(p) {
    const k = passageKey(p);
    if (state.favorites[k]) delete state.favorites[k];
    else state.favorites[k] = { b: p.b, c: p.c, f: p.f, t: p.t ?? p.f, x: p.x, added: Date.now() };
    save();
    return Boolean(state.favorites[k]);
  },
  favorites: () => Object.values(state.favorites).sort((a, b) => b.added - a.added),
  getNote: (p) => state.notes[passageKey(p)]?.text || '',
  setNote(p, text) {
    const k = passageKey(p);
    if (text.trim()) state.notes[k] = { text, updated: Date.now(), b: p.b, c: p.c, f: p.f, t: p.t ?? p.f, x: p.x };
    else delete state.notes[k];
    save();
  },
  notes: () => Object.values(state.notes).sort((a, b) => b.updated - a.updated),
  get lastTheme() {
    return state.lastTheme;
  },
  get lastRead() {
    return state.lastRead;
  },
  setLastRead(b, c) {
    state.lastRead = { b, c };
    save();
  },
  setLastTheme(id) {
    state.lastTheme = id;
    save();
  },
};
