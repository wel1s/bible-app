// Génère data/bible.json (texte complet LSG 1910) et data/themes.json (thèmes + textes des passages).
//
//   node tools/build.mjs [chemin/vers/lsg.json]
//
// Sans argument, le texte source est téléchargé depuis le dépôt public midvash/bible-data
// (Louis Segond 1910, domaine public) et mis en cache dans tools/.cache/.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BOOKS, parseRef, formatRef } from '../js/books.js';
import { THEMES } from './themes.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_URL = 'https://raw.githubusercontent.com/midvash/bible-data/main/versions/fr/lsg/lsg.json';

async function loadSource(path) {
  if (path) return JSON.parse(await readFile(path, 'utf8'));
  const cache = join(ROOT, 'tools/.cache/lsg.json');
  if (!existsSync(cache)) {
    console.log('Téléchargement du texte LSG 1910…');
    const res = await fetch(SOURCE_URL);
    if (!res.ok) throw new Error(`Téléchargement impossible (${res.status})`);
    await mkdir(dirname(cache), { recursive: true });
    await writeFile(cache, await res.text());
  }
  return JSON.parse(await readFile(cache, 'utf8'));
}

const clean = (t) =>
  t
    .replace(/''/g, "'") // apostrophes doublées dans la source
    .replace(/\s+/g, ' ')
    .trim();

const src = await loadSource(process.argv[2]);
if (src.books.length !== 66) throw new Error('66 livres attendus');

// bible.json : { b: [ [ [verset1, verset2…], …chapitres ], …livres ] }
const bible = src.books.map((book, i) => {
  if (book.bookId !== i + 1) throw new Error(`Ordre inattendu pour ${book.book}`);
  return book.chapters.map((c) => c.verses.map((v) => clean(v.text)));
});
const verseCount = bible.flat(2).length;
await writeFile(join(ROOT, 'data/bible.json'), JSON.stringify({ v: 'LSG 1910', b: bible }));

// themes.json
const errors = [];
const themes = THEMES.map((t) => {
  t.keywords.forEach((k) => new RegExp(k)); // valide les expressions
  const passages = t.refs.map((r) => {
    const p = parseRef(r);
    if (!p || !p.from) {
      errors.push(`${t.id}: référence illisible « ${r} »`);
      return null;
    }
    const ch = bible[p.book.id - 1][p.chapter - 1];
    if (!ch || !ch[p.to - 1]) {
      errors.push(`${t.id}: référence hors limites « ${r} »`);
      return null;
    }
    const verses = [];
    for (let v = p.from; v <= p.to; v++) verses.push(ch[v - 1]);
    return { b: p.book.id, c: p.chapter, f: p.from, t: p.to, x: verses };
  });
  const { refs, ...rest } = t;
  return { ...rest, passages: passages.filter(Boolean) };
});
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
await writeFile(join(ROOT, 'data/themes.json'), JSON.stringify(themes));

// Fichier de relecture (non publié) pour vérifier que chaque passage correspond bien au thème.
if (process.env.REVIEW) {
  const lines = themes.flatMap((t) => [
    `\n## ${t.name}`,
    ...t.passages.map((p) => `- ${formatRef(p.b, p.c, p.f, p.t)} : ${p.x.join(' ')}`),
  ]);
  await writeFile(process.env.REVIEW, lines.join('\n'));
}

console.log(`OK : ${BOOKS.length} livres, ${verseCount} versets, ${themes.length} thèmes, ${themes.reduce((n, t) => n + t.passages.length, 0)} passages.`);
