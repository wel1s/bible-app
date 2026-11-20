// Liste (JSON sur la sortie standard) des passages à enregistrer en audio :
// tous les passages clés des thèmes, sans doublon.
// Utilisé par tools/build_audio.py.
import { readFileSync } from 'node:fs';
import { spokenRef } from '../js/books.js';
import { speechText } from '../js/speech-text.js';

const themes = JSON.parse(readFileSync(new URL('../data/themes.json', import.meta.url)));
const jobs = new Map();
for (const t of themes) {
  for (const p of t.passages) {
    const key = `${p.b}-${p.c}-${p.f}-${p.t}`;
    if (!jobs.has(key)) {
      jobs.set(key, { key, ref: spokenRef(p.b, p.c, p.f, p.t) + '.', verses: p.x.map(speechText) });
    }
  }
}
process.stdout.write(JSON.stringify([...jobs.values()]));
