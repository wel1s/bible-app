import { BOOKS, normalize } from './books.js';

let themesPromise = null;
let biblePromise = null;
let index = null; // { verses: [{b,c,v,t}], norm: [string] }

export function loadThemes() {
  themesPromise ??= fetch('data/themes.json').then((r) => {
    if (!r.ok) throw new Error('Impossible de charger les thèmes');
    return r.json();
  });
  return themesPromise;
}

export function loadBible() {
  biblePromise ??= fetch('data/bible.json')
    .then((r) => {
      if (!r.ok) throw new Error('Impossible de charger la Bible');
      return r.json();
    })
    .then((data) => {
      const verses = [];
      const norm = [];
      data.b.forEach((chapters, bi) =>
        chapters.forEach((vs, ci) =>
          vs.forEach((t, vi) => {
            verses.push({ b: bi + 1, c: ci + 1, v: vi + 1, t });
            norm.push(normalize(t));
          }),
        ),
      );
      index = { verses, norm, raw: data.b };
      return index;
    })
    .catch((e) => {
      biblePromise = null;
      throw e;
    });
  return biblePromise;
}

export const isBibleLoaded = () => index !== null;

export function getChapter(b, c) {
  const ch = index?.raw[b - 1]?.[c - 1];
  return ch ? ch.map((t, i) => ({ b, c, v: i + 1, t })) : null;
}

export function chapterCount(b) {
  return index?.raw[b - 1]?.length ?? 0;
}

const OT_LAST_BOOK = 39;
export const testamentOf = (b) => (b <= OT_LAST_BOOK ? 'AT' : 'NT');

/** Versets dont le texte normalisé correspond à l'une des expressions. */
export function findByPatterns(patterns) {
  const res = patterns.map((p) => new RegExp(p));
  const out = [];
  index.norm.forEach((n, i) => {
    if (res.some((r) => r.test(n))) out.push(index.verses[i]);
  });
  return out;
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Transforme une requête libre en expressions régulières (sur texte normalisé).
 * - mots séparés : tous doivent être présents (début de mot : « aim » trouve aime, aimer, aimé…)
 * - "entre guillemets" : expression exacte
 */
export function queryToPatterns(query) {
  const q = normalize(query).trim();
  const patterns = [];
  const phrase = q.match(/^"(.+)"$/);
  if (phrase) {
    patterns.push(`\\b${escapeRe(phrase[1].trim())}\\b`);
  } else {
    for (const w of q.split(/[\s,;]+/).filter((w) => w.length >= 2)) patterns.push(`\\b${escapeRe(w)}`);
  }
  return patterns;
}

export function searchText(query, limit = Infinity) {
  const patterns = queryToPatterns(query).map((p) => new RegExp(p));
  if (!patterns.length) return [];
  const out = [];
  for (let i = 0; i < index.norm.length && out.length < limit; i++) {
    const n = index.norm[i];
    if (patterns.every((r) => r.test(n))) out.push(index.verses[i]);
  }
  return out;
}

/** Version normalisée + correspondance index normalisé → index d'origine (pour surligner). */
function normalizeWithMap(text) {
  let norm = '';
  const map = [];
  for (let i = 0; i < text.length; i++) {
    const n = normalize(text[i]);
    for (let k = 0; k < n.length; k++) {
      norm += n[k];
      map.push(i);
    }
  }
  map.push(text.length);
  return { norm, map };
}

/** Plages [début, fin) du texte d'origine qui correspondent aux expressions. */
export function matchRanges(text, patterns) {
  const { norm, map } = normalizeWithMap(text);
  const ranges = [];
  for (const p of patterns) {
    const re = new RegExp(p, 'g');
    let m;
    while ((m = re.exec(norm))) {
      if (!m[0].length) {
        re.lastIndex++;
        continue;
      }
      // étend au mot entier pour un surlignage lisible
      let end = m.index + m[0].length;
      while (end < norm.length && /[a-z0-9-]/.test(norm[end])) end++;
      ranges.push([map[m.index], map[end]]);
    }
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([...r]);
  }
  return merged;
}

/** Thèmes dont le nom, la description ou les mots-clés correspondent à la requête. */
export function matchThemes(themes, query) {
  const q = normalize(query).trim();
  if (q.length < 2) return [];
  return themes.filter((t) => {
    if (normalize(t.name).includes(q) || normalize(t.id).includes(q)) return true;
    return t.keywords.some((k) => {
      try {
        return new RegExp(k).test(q);
      } catch {
        return false;
      }
    });
  });
}

export { BOOKS };
