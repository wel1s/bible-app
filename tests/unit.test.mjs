import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseRef, formatRef, spokenRef, normalize } from '../js/books.js';
import { chunkText } from '../js/audio.js';
import { queryToPatterns, matchRanges, matchThemes } from '../js/bible.js';

test('analyse des références', () => {
  const cases = [
    ['Jean 3:16', 43, 3, 16, 16],
    ['jn 3.16', 43, 3, 16, 16],
    ['1 Co 13.4-7', 46, 13, 4, 7],
    ['1 Corinthiens 13', 46, 13, undefined, undefined],
    ['Psaume 23', 19, 23, undefined, undefined],
    ['ps 91,1-2', 19, 91, 1, 2],
    ['Esaie 40:31', 23, 40, 31, 31],
    ['1er Jean 4:8', 62, 4, 8, 8],
    ['Apocalypse 21:4', 66, 21, 4, 4],
  ];
  for (const [input, b, c, f, t] of cases) {
    const r = parseRef(input);
    assert.ok(r, input);
    assert.deepEqual([r.book.id, r.chapter, r.from, r.to], [b, c, f, t], input);
  }
  assert.equal(parseRef('amour'), null);
  assert.equal(parseRef('ne crains point'), null);
});

test('affichage et lecture vocale des références', () => {
  assert.equal(formatRef(43, 3, 16, 16), 'Jean 3:16');
  assert.equal(formatRef(19, 23, 1, 6), 'Psaume 23:1-6');
  assert.equal(spokenRef(43, 3, 16, 16), 'Jean, chapitre 3, verset 16');
  assert.equal(spokenRef(46, 13, 4, 7), 'Première épître aux Corinthiens, chapitre 13, versets 4 à 7');
  assert.equal(spokenRef(19, 23, 1, 1), 'Psaume 23, verset 1');
});

test('découpage du texte pour la synthèse vocale', () => {
  const long = 'Car j\'ai l\'assurance que ni la mort ni la vie, ni les anges ni les dominations, ni les choses présentes ni les choses à venir, ni les puissances, ni la hauteur, ni la profondeur, ni aucune autre créature ne pourra nous séparer de l\'amour de Dieu manifesté en Jésus-Christ notre Seigneur.';
  const parts = chunkText(long, 120);
  assert.ok(parts.length > 1);
  assert.ok(parts.every((p) => p.length <= 130));
  assert.equal(parts.join(' ').replace(/\s+/g, ' '), long);
  assert.deepEqual(chunkText("Le salut est auprès de l'Eternel! -Pause."), ["Le salut est auprès de l'Eternel!"]);
});

test('recherche : motifs et surlignage sans accents', () => {
  assert.deepEqual(queryToPatterns('Grâce paix'), ['\\bgrace', '\\bpaix']);
  assert.deepEqual(queryToPatterns('"ne crains point"'), ['\\bne crains point\\b']);
  const text = "Que la grâce et la paix vous soient données!";
  const r = matchRanges(text, queryToPatterns('grace paix'));
  assert.deepEqual(r.map(([a, b]) => text.slice(a, b)), ['grâce', 'paix']);
  assert.equal(normalize('Éternel œuvre'), 'eternel oeuvre');
});

test('données : thèmes valides et Bible complète', () => {
  const themes = JSON.parse(readFileSync(new URL('../data/themes.json', import.meta.url)));
  const bible = JSON.parse(readFileSync(new URL('../data/bible.json', import.meta.url)));
  assert.equal(bible.b.length, 66);
  assert.equal(bible.b.flat(2).length, 31102);
  assert.ok(themes.length >= 20);
  for (const t of themes) {
    assert.ok(t.passages.length >= 10, t.id);
    for (const p of t.passages) assert.equal(p.x.length, p.t - p.f + 1);
  }
  assert.deepEqual(matchThemes(themes, 'amour').map((t) => t.id), ['amour']);
  assert.ok(matchThemes(themes, 'louange').some((t) => t.id === 'louange'));
  assert.equal(bible.b[42][2][15].startsWith('Car Dieu a tant aimé le monde'), true);
  assert.ok(!bible.b.flat(2).some((v) => v.includes("''")));
});
