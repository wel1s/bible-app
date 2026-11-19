// Table des 66 livres (ordre protestant, Louis Segond 1910).
// [nom affiché, abréviation, nom prononcé par la voix, alias acceptés dans la recherche]
export const BOOKS = [
  ['Genèse', 'Gn', 'Genèse', ['gen', 'ge']],
  ['Exode', 'Ex', 'Exode', ['exo']],
  ['Lévitique', 'Lv', 'Lévitique', ['lev', 'le']],
  ['Nombres', 'Nb', 'Nombres', ['nom', 'no']],
  ['Deutéronome', 'Dt', 'Deutéronome', ['deut', 'deu']],
  ['Josué', 'Jos', 'Josué', []],
  ['Juges', 'Jg', 'Juges', ['jug']],
  ['Ruth', 'Rt', 'Ruth', ['ru']],
  ['1 Samuel', '1S', 'Premier livre de Samuel', ['1sam', '1sa']],
  ['2 Samuel', '2S', 'Deuxième livre de Samuel', ['2sam', '2sa']],
  ['1 Rois', '1R', 'Premier livre des Rois', ['1roi']],
  ['2 Rois', '2R', 'Deuxième livre des Rois', ['2roi']],
  ['1 Chroniques', '1Ch', 'Premier livre des Chroniques', ['1chr']],
  ['2 Chroniques', '2Ch', 'Deuxième livre des Chroniques', ['2chr']],
  ['Esdras', 'Esd', 'Esdras', []],
  ['Néhémie', 'Né', 'Néhémie', ['neh']],
  ['Esther', 'Est', 'Esther', []],
  ['Job', 'Jb', 'Job', []],
  ['Psaumes', 'Ps', 'Psaume', ['psaume', 'psa']],
  ['Proverbes', 'Pr', 'Proverbes', ['prov', 'pro']],
  ['Ecclésiaste', 'Ec', 'Ecclésiaste', ['ecc', 'qo', 'qohelet']],
  ['Cantique des cantiques', 'Ct', 'Cantique des cantiques', ['cant', 'cantique']],
  ['Ésaïe', 'És', 'Ésaïe', ['esa', 'is', 'isaie']],
  ['Jérémie', 'Jr', 'Jérémie', ['jer']],
  ['Lamentations', 'Lm', 'Lamentations', ['lam']],
  ['Ézéchiel', 'Éz', 'Ézéchiel', ['ezech', 'eze', 'ez']],
  ['Daniel', 'Dn', 'Daniel', ['dan']],
  ['Osée', 'Os', 'Osée', []],
  ['Joël', 'Jl', 'Joël', ['joe']],
  ['Amos', 'Am', 'Amos', []],
  ['Abdias', 'Ab', 'Abdias', ['abd']],
  ['Jonas', 'Jon', 'Jonas', []],
  ['Michée', 'Mi', 'Michée', ['mic']],
  ['Nahum', 'Na', 'Nahoum', ['nah']],
  ['Habacuc', 'Ha', 'Habacuc', ['hab']],
  ['Sophonie', 'So', 'Sophonie', ['soph']],
  ['Aggée', 'Ag', 'Aggée', ['agg']],
  ['Zacharie', 'Za', 'Zacharie', ['zach']],
  ['Malachie', 'Ml', 'Malachie', ['mal']],
  ['Matthieu', 'Mt', 'Matthieu', ['mat', 'matt']],
  ['Marc', 'Mc', 'Marc', ['mr', 'mar']],
  ['Luc', 'Lc', 'Luc', ['lu']],
  ['Jean', 'Jn', 'Jean', ['jea']],
  ['Actes', 'Ac', 'Actes des apôtres', ['act', 'actes des apotres']],
  ['Romains', 'Rm', 'Romains', ['rom', 'ro']],
  ['1 Corinthiens', '1Co', 'Première épître aux Corinthiens', ['1cor']],
  ['2 Corinthiens', '2Co', 'Deuxième épître aux Corinthiens', ['2cor']],
  ['Galates', 'Ga', 'Galates', ['gal']],
  ['Éphésiens', 'Ep', 'Éphésiens', ['eph']],
  ['Philippiens', 'Ph', 'Philippiens', ['phil', 'php']],
  ['Colossiens', 'Col', 'Colossiens', []],
  ['1 Thessaloniciens', '1Th', 'Première épître aux Thessaloniciens', ['1thess', '1the']],
  ['2 Thessaloniciens', '2Th', 'Deuxième épître aux Thessaloniciens', ['2thess', '2the']],
  ['1 Timothée', '1Tm', 'Première épître à Timothée', ['1tim', '1ti']],
  ['2 Timothée', '2Tm', 'Deuxième épître à Timothée', ['2tim', '2ti']],
  ['Tite', 'Tt', 'Tite', ['tit']],
  ['Philémon', 'Phm', 'Philémon', ['philem', 'phlm']],
  ['Hébreux', 'Hé', 'Hébreux', ['heb']],
  ['Jacques', 'Jc', 'Jacques', ['jac', 'ja']],
  ['1 Pierre', '1P', 'Première épître de Pierre', ['1pi', '1pie', '1pierre']],
  ['2 Pierre', '2P', 'Deuxième épître de Pierre', ['2pi', '2pie', '2pierre']],
  ['1 Jean', '1Jn', 'Première épître de Jean', ['1jean']],
  ['2 Jean', '2Jn', 'Deuxième épître de Jean', ['2jean']],
  ['3 Jean', '3Jn', 'Troisième épître de Jean', ['3jean']],
  ['Jude', 'Jud', 'Jude', []],
  ['Apocalypse', 'Ap', 'Apocalypse', ['apo', 'apoc', 'rev']],
].map(([name, abbr, spoken, aliases], i) => ({ id: i + 1, name, abbr, spoken, aliases }));

/** Minuscules, sans accents, apostrophes droites. */
export function normalize(s) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’`]/g, "'")
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae');
}

const compact = (s) => normalize(s).replace(/[\s.]/g, '');

const BOOK_INDEX = new Map();
for (const b of BOOKS) {
  for (const key of [b.name, b.abbr, b.spoken, ...b.aliases]) BOOK_INDEX.set(compact(key), b);
  // "1er Jean", "1ère Corinthiens", "I Jean"…
  const m = b.name.match(/^(\d) (.+)$/);
  if (m) {
    const [, n, rest] = m;
    const roman = ['i', 'ii', 'iii'][n - 1];
    for (const pre of [roman, n === '1' ? '1er' : null, n === '1' ? '1ere' : null, n === '1' ? 'premier' : null, n === '1' ? 'premiere' : null, n === '2' ? 'deuxieme' : null, n === '2' ? 'second' : null, n === '3' ? 'troisieme' : null]) {
      if (pre) BOOK_INDEX.set(compact(pre + rest), b);
    }
  }
}

export function findBook(text) {
  return BOOK_INDEX.get(compact(text)) || null;
}

/**
 * Analyse une référence : "Jean 3:16", "1 Co 13.4-7", "Ps 23", "Jn 3,16-18".
 * Renvoie { book, chapter, from, to } (from/to absents pour un chapitre entier) ou null.
 */
export function parseRef(input) {
  const m = String(input)
    .trim()
    .match(/^((?:[1-3]|i{1,3}|1er|1ère|1ere)?\s*[a-zA-ZÀ-ÿ.' -]+?)\s*(\d+)(?:\s*[:.,]\s*(\d+)(?:\s*[-–]\s*(\d+))?)?$/i);
  if (!m) return null;
  const book = findBook(m[1]);
  if (!book) return null;
  const chapter = Number(m[2]);
  const from = m[3] ? Number(m[3]) : undefined;
  const to = m[4] ? Number(m[4]) : from;
  return { book, chapter, from, to };
}

export function formatRef(bookId, chapter, from, to) {
  const b = BOOKS[bookId - 1];
  let s = `${bookId === 19 ? 'Psaume' : b.name} ${chapter}`;
  if (from) s += `:${from}`;
  if (to && to !== from) s += `-${to}`;
  return s;
}

export function spokenRef(bookId, chapter, from, to) {
  const b = BOOKS[bookId - 1];
  let s = bookId === 19 ? `Psaume ${chapter}` : `${b.spoken}, chapitre ${chapter}`;
  if (from && to && to !== from) s += `, versets ${from} à ${to}`;
  else if (from) s += `, verset ${from}`;
  return s;
}
