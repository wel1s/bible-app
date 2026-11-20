import { BOOKS, parseRef, formatRef } from './books.js';
import {
  loadThemes, loadBible, isBibleLoaded, getChapter, chapterCount, findByPatterns, searchText,
  queryToPatterns, matchRanges, matchThemes, testamentOf,
} from './bible.js';
import { store, passageKey } from './store.js';
import { player, ttsSupported, frenchVoices, setAudioManifest, playlistHasFiles } from './audio.js';

const $ = (sel, root = document) => root.querySelector(sel);
const view = $('#view');
const PAGE = 60;

let THEMES = [];
let currentList = null; // playlist de la vue affichée
let cleanup = [];

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('show'), 2200);
}

const ICONS = {
  play: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>',
  heart: '<svg viewBox="0 0 24 24"><path d="M12 21.4 10.6 20C5.4 15.4 2 12.3 2 8.5 2 5.4 4.4 3 7.5 3c1.7 0 3.4.8 4.5 2.1C13.1 3.8 14.8 3 16.5 3 19.6 3 22 5.4 22 8.5c0 3.8-3.4 6.9-8.6 11.5z"/></svg>',
  note: '<svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.8 9.94l-3.75-3.75zM20.7 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75z"/></svg>',
  book: '<svg viewBox="0 0 24 24"><path d="M21 5c-1.1-.35-2.3-.5-3.5-.5-1.95 0-4.05.4-5.5 1.5-1.45-1.1-3.55-1.5-5.5-1.5S2.45 4.9 1 6v14.65c0 .25.25.5.5.5.1 0 .15-.05.25-.05C3.1 20.45 5.05 20 6.5 20c1.95 0 4.05.4 5.5 1.5 1.35-.85 3.8-1.5 5.5-1.5 1.65 0 3.35.3 4.75 1.05.1.05.15.05.25.05.25 0 .5-.25.5-.5V6c-.6-.45-1.25-.75-2-1zm0 13.5c-1.1-.35-2.3-.5-3.5-.5-1.7 0-4.15.65-5.5 1.5V8c1.35-.85 3.8-1.5 5.5-1.5 1.2 0 2.4.15 3.5.5z"/></svg>',
  medit: '<svg viewBox="0 0 24 24"><path d="M12 2a3 3 0 1 1 0 6 3 3 0 0 1 0-6zm9 14v-2c-2.2 0-4.2-1-5.6-2.6l-1.3-1.6A2 2 0 0 0 12.5 9h-1a2 2 0 0 0-1.6.8L8.6 11.4A7.4 7.4 0 0 1 3 14v2c2.8 0 5.3-1.2 7-3.1V15l-4 4v1h12v-1l-4-4v-2.1c1.7 1.9 4.2 3.1 7 3.1z"/></svg>',
  headphones: '<svg viewBox="0 0 24 24"><path d="M12 3a9 9 0 0 0-9 9v7a2 2 0 0 0 2 2h2v-8H5v-1a7 7 0 0 1 14 0v1h-2v8h2a2 2 0 0 0 2-2v-7a9 9 0 0 0-9-9z"/></svg>',
};

// ---- rendu d'un passage ---------------------------------------------------------
function highlight(text, patterns) {
  if (!patterns?.length) return esc(text);
  const ranges = matchRanges(text, patterns);
  let out = '';
  let pos = 0;
  for (const [a, b] of ranges) {
    out += esc(text.slice(pos, a)) + '<mark>' + esc(text.slice(a, b)) + '</mark>';
    pos = b;
  }
  return out + esc(text.slice(pos));
}

function passageText(p, patterns) {
  if (p.x.length === 1) return highlight(p.x[0], patterns);
  return p.x.map((t, i) => `<sup>${p.f + i}</sup>${highlight(t, patterns)}`).join(' ');
}

function passageCard(p, idx, opts = {}) {
  const fav = store.isFavorite(p);
  const note = store.getNote(p);
  const ref = formatRef(p.b, p.c, p.f, p.t);
  return `
  <article class="passage${opts.active ? ' active' : ''}" data-idx="${idx}" id="p-${idx}">
    <header>
      <a class="ref" href="${chapterHref(p)}" data-act="chapter" title="Lire tout le chapitre">${esc(ref)}</a>
      ${opts.badge ? `<span class="badge">${esc(opts.badge)}</span>` : ''}
    </header>
    <p class="text" data-act="chapter" title="Toucher pour lire tout le chapitre">${passageText(p, opts.patterns)}</p>
    ${note ? `<p class="note-preview">✎ ${esc(note)}</p>` : ''}
    <div class="actions">
      <button class="act" data-act="play" title="Écouter à partir d'ici">${ICONS.play}<span>Écouter</span></button>
      <button class="act" data-act="meditate" title="Méditer ce passage">${ICONS.medit}<span>Méditer</span></button>
      <button class="act${fav ? ' on' : ''}" data-act="fav" aria-pressed="${fav}" title="Ajouter à mes versets">${ICONS.heart}<span>${fav ? 'Gardé' : 'Garder'}</span></button>
      <button class="act${note ? ' on' : ''}" data-act="note" title="Écrire une note">${ICONS.note}<span>Note</span></button>
      <button class="act" data-act="chapter" title="Lire tout le chapitre">${ICONS.book}<span>Chapitre ${p.c}</span></button>
    </div>
    <div class="note-editor" hidden>
      <textarea rows="3" placeholder="Ce que Dieu me dit à travers ce passage…">${esc(note)}</textarea>
    </div>
  </article>`;
}

function isPlayingList(list) {
  return player.state.playlist && list && player.state.playlist.id === list.id;
}

function listHTML(list, from, to, opts) {
  const active = isPlayingList(list) ? player.state.index : -1;
  return list.items
    .slice(from, to)
    .map((p, i) => passageCard(p, from + i, { ...opts, active: from + i === active, badge: opts.badgeFor?.(p) }))
    .join('');
}

/** Liste paginée de passages + bouton « Afficher plus ». */
function renderList(container, list, opts = {}) {
  let shown = Math.min(PAGE, list.items.length);
  container.innerHTML = `<div class="list">${listHTML(list, 0, shown, opts)}</div>
    ${list.items.length > shown ? `<button class="btn more">Afficher plus (${list.items.length - shown} restants)</button>` : ''}`;
  const more = $('.more', container);
  more?.addEventListener('click', () => {
    const next = Math.min(shown + PAGE, list.items.length);
    $('.list', container).insertAdjacentHTML('beforeend', listHTML(list, shown, next, opts));
    shown = next;
    if (shown >= list.items.length) more.remove();
    else more.textContent = `Afficher plus (${list.items.length - shown} restants)`;
  });
  list.ensureVisible = (idx) => {
    while (idx >= shown && more?.isConnected) more.click();
  };
}

/** Lien vers le chapitre complet, avec le ou les versets mis en évidence. */
const chapterHref = (p) => `#/lire/${p.b}/${p.c}?v=${p.f}${p.t && p.t !== p.f ? `&to=${p.t}` : ''}`;

// Page d'où l'on vient quand on ouvre un chapitre (pour y revenir au même endroit).
let returnTo = null;
function openChapter(p, idx = null) {
  const here = location.hash || '#/';
  if (!here.startsWith('#/lire/')) returnTo = { hash: here, idx };
  location.hash = chapterHref(p);
}

const verseToPassage = (v) => ({ b: v.b, c: v.c, f: v.v, t: v.v, x: [v.t] });

function loadingHTML(msg = 'Chargement de la Bible…') {
  return `<div class="loading"><span class="spinner"></span>${esc(msg)}</div>`;
}

// ---- vues -----------------------------------------------------------------------
function verseOfTheDay() {
  const seen = new Set();
  const all = [];
  for (const t of THEMES)
    for (const p of t.passages) {
      const k = passageKey(p);
      if (!seen.has(k) && p.x.join(' ').length < 320) {
        seen.add(k);
        all.push({ p, t });
      }
    }
  const day = Math.floor((Date.now() - new Date().getTimezoneOffset() * 60000) / 86400000);
  return all[(day * 7919) % all.length];
}

function viewHome() {
  const votd = verseOfTheDay();
  const last = THEMES.find((t) => t.id === store.lastTheme);
  currentList = { id: 'votd', title: 'Verset du jour', items: [votd.p] };
  view.innerHTML = `
    <section class="hero">
      <h1>Méditer la Parole, thème par thème</h1>
      <p>Choisissez un thème, lisez les versets, écoutez-les et prenez le temps de méditer.
        Cherchez aussi un mot ou une référence.</p>
      <form class="searchbox" id="home-search" role="search">
        <input name="q" type="search" autocomplete="off" placeholder="amour, louange, Jean 3:16…" aria-label="Rechercher" />
        <button class="btn primary">Chercher</button>
      </form>
    </section>

    <section class="votd" style="--c:${votd.t.color}">
      <div class="votd-head"><span>Verset du jour</span><a href="#/theme/${votd.t.id}">${votd.t.icon} ${esc(votd.t.name)}</a></div>
      <blockquote class="clickable" id="votd-text" title="Toucher pour lire tout le chapitre">${passageText(votd.p)}</blockquote>
      <div class="votd-foot">
        <a class="ref" href="${chapterHref(votd.p)}">${esc(formatRef(votd.p.b, votd.p.c, votd.p.f, votd.p.t))}</a>
        <span>
          <button class="btn ghost" data-votd="play">${ICONS.play} Écouter</button>
          <button class="btn ghost" data-votd="meditate">${ICONS.medit} Méditer</button>
        </span>
      </div>
    </section>

    ${last ? `<a class="continue" href="#/theme/${last.id}" style="--c:${last.color}">Reprendre : <strong>${last.icon} ${esc(last.name)}</strong> →</a>` : ''}

    <section>
      <h2 class="section-title">Les thèmes</h2>
      <div class="theme-grid">
        ${THEMES.map(
          (t) => `<a class="theme-card" href="#/theme/${t.id}" style="--c:${t.color}">
            <span class="ic" aria-hidden="true">${t.icon}</span>
            <span class="nm">${esc(t.name)}</span>
            <span class="ds">${esc(t.description)}</span>
            <span class="ct">${t.passages.length} passages clés</span>
          </a>`,
        ).join('')}
      </div>
    </section>
    ${footerHTML()}`;

  $('#home-search').addEventListener('submit', (e) => {
    e.preventDefault();
    const q = new FormData(e.target).get('q').trim();
    if (q) location.hash = `#/recherche?q=${encodeURIComponent(q)}`;
  });
  $('#votd-text').onclick = () => !window.getSelection()?.toString() && openChapter(votd.p);
  view.querySelectorAll('[data-votd]').forEach((b) =>
    b.addEventListener('click', () => {
      player.load(currentList, 0, b.dataset.votd === 'play');
      if (b.dataset.votd === 'meditate') openMeditation();
    }),
  );
}

function footerHTML() {
  return `<footer class="foot">Texte biblique : Louis Segond 1910 (domaine public).
    Audio des versets clés : voix « siwis » (Piper, données SIWIS, CC-BY 4.0) ; ailleurs, voix de votre appareil.</footer>`;
}

/** Indique si la liste peut être écoutée écran éteint. */
function audioNote(list) {
  if (!list?.items.length) return '';
  if (playlistHasFiles(list)) {
    return `<p class="audio-note ok">🔒 Écoute possible <strong>écran éteint</strong> ou en utilisant d'autres applications.</p>`;
  }
  return `<p class="audio-note">📱 Ici, la lecture utilise la voix du téléphone : <strong>gardez l'écran allumé</strong> pendant l'écoute.
    Les <a href="#/">versets clés des thèmes</a> s'écoutent aussi écran éteint.</p>`;
}

async function viewTheme(id, tab, params) {
  const theme = THEMES.find((t) => t.id === id);
  if (!theme) return viewNotFound();
  store.setLastTheme(id);
  const testament = params.get('t') || '';
  view.innerHTML = `
    <section class="theme-hero" style="--c:${theme.color}">
      <a class="back" href="#/">← Tous les thèmes</a>
      <div class="theme-title"><span class="ic">${theme.icon}</span><h1>${esc(theme.name)}</h1></div>
      <p>${esc(theme.description)}</p>
      <div class="hero-actions">
        <button class="btn primary" id="listen-all">${ICONS.headphones} Écouter ${tab === 'bible' ? 'ces versets' : 'les versets clés'}</button>
        <button class="btn light" id="meditate-all">${ICONS.medit} Méditer un à un</button>
      </div>
    </section>
    <nav class="tabs" role="tablist">
      <a role="tab" href="#/theme/${id}" aria-selected="${tab !== 'bible'}">Versets clés <span>${theme.passages.length}</span></a>
      <a role="tab" href="#/theme/${id}/bible" aria-selected="${tab === 'bible'}">Toute la Bible <span id="bible-count">…</span></a>
    </nav>
    <div id="theme-filters"></div>
    <div id="theme-list"></div>`;

  const listEl = $('#theme-list');
  let list;
  if (tab !== 'bible') {
    list = { id: `theme:${id}`, title: theme.name, items: theme.passages, route: location.hash };
    currentList = list;
    $('#theme-filters').innerHTML = audioNote(list);
    renderList(listEl, list);
  } else {
    listEl.innerHTML = loadingHTML();
  }

  const bindHero = () => {
    $('#listen-all').onclick = () => player.load(currentList, 0, true);
    $('#meditate-all').onclick = () => {
      player.load(currentList, 0, false);
      openMeditation();
    };
  };
  bindHero();

  try {
    await loadBible();
  } catch (e) {
    if (tab === 'bible') listEl.innerHTML = `<p class="empty">${esc(e.message)}. Vérifiez votre connexion.</p>`;
    return;
  }
  if (!view.contains(listEl)) return; // l'utilisateur a changé de page
  const verses = findByPatterns(theme.keywords);
  $('#bible-count').textContent = verses.length;
  if (tab === 'bible') {
    const filtered = testament ? verses.filter((v) => testamentOf(v.b) === testament) : verses;
    list = {
      id: `theme:${id}:bible:${testament}`,
      title: `${theme.name} — toute la Bible`,
      items: filtered.map(verseToPassage),
      route: location.hash,
    };
    currentList = list;
    $('#theme-filters').innerHTML = `
      <p class="intro">Tous les versets de la Bible contenant les mots liés au thème
      (${theme.keywords.length > 1 ? 'par ex.' : ''} <em>${esc(sampleWords(theme))}</em>).</p>
      <div class="chips">
        ${[['', 'Toute la Bible'], ['AT', 'Ancien Testament'], ['NT', 'Nouveau Testament']]
          .map(([k, l]) => `<a class="chip${k === testament ? ' on' : ''}" href="#/theme/${id}/bible${k ? '?t=' + k : ''}">${l}</a>`)
          .join('')}
        <span class="count">${filtered.length} versets</span>
      </div>
      ${audioNote(list)}`;
    renderList(listEl, list, { patterns: theme.keywords });
  }
}

function sampleWords(theme) {
  const words = {
    amour: 'amour, aimer, charité', louange: 'louange, louer, célébrer, exalter, cantique', foi: 'foi, croire, croyant',
    esperance: 'espérance, espérer', paix: 'paix, paisible', joie: 'joie, se réjouir, allégresse', pardon: 'pardon, pardonner, rémission', misericorde: 'miséricorde, compassion, pitié',
    priere: 'prière, prier, invoquer, exaucer', grace: 'grâce, salut, sauver, rédemption', force: 'fortifier, courage, ne crains point',
    protection: 'refuge, bouclier, forteresse, confiance', consolation: 'consoler, larmes, affliction, épreuve', guerison: 'guérir, malade, santé',
    sagesse: 'sage, sagesse, intelligence, discernement', provision: 'pourvoir, besoins, nourrir, abondance, bénédiction',
    reconnaissance: 'rendre grâces, remercier', 'saint-esprit': 'Saint-Esprit, Esprit de Dieu, Consolateur', humilite: 'humble, humilier, orgueil',
    parole: 'parole, loi, Écritures, préceptes, commandements', fidelite: 'fidèle, fidélité, bonté, promesse',
    patience: 'patience, persévérance, constance', 'vie-eternelle': 'vie éternelle, résurrection, ressusciter',
  };
  return words[theme.id] || theme.name.toLowerCase();
}

async function viewSearch(params) {
  const q = params.get('q') || '';
  view.innerHTML = `
    <section class="page-head">
      <h1>Recherche</h1>
      <form class="searchbox" id="search-form" role="search">
        <input name="q" type="search" autocomplete="off" value="${esc(q)}" placeholder="amour, « ne crains point », Psaume 23…" aria-label="Rechercher" autofocus />
        <button class="btn primary">Chercher</button>
      </form>
      <p class="hint">Astuce : plusieurs mots = versets contenant tous ces mots. Entre guillemets = expression exacte. Les accents sont facultatifs.</p>
    </section>
    <div id="search-results"></div>`;
  const form = $('#search-form');
  const input = form.elements.q;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const nq = input.value.trim();
    location.hash = `#/recherche${nq ? '?q=' + encodeURIComponent(nq) : ''}`;
  });
  if (!q) {
    $('#search-results').innerHTML = `<div class="suggest"><h2 class="section-title">Idées de recherche</h2>
      <div class="chips">${['amour', 'louange', 'ne crains point', 'paix', 'lumière', 'berger', 'Psaume 23', 'Jean 3:16', '1 Corinthiens 13']
        .map((s) => `<a class="chip" href="#/recherche?q=${encodeURIComponent(s)}">${esc(s)}</a>`)
        .join('')}</div></div>`;
    input.focus();
    return;
  }

  const res = $('#search-results');
  let html = '';
  const ref = parseRef(q);
  if (ref && ref.chapter <= 150) {
    html += `<a class="ref-jump" href="#/lire/${ref.book.id}/${ref.chapter}${ref.from ? '?v=' + ref.from : ''}">
      ${ICONS.book} Lire <strong>${esc(formatRef(ref.book.id, ref.chapter, ref.from, ref.to))}</strong> →</a>`;
  }
  const themes = matchThemes(THEMES, q);
  if (themes.length) {
    html += `<h2 class="section-title">Thèmes</h2><div class="theme-row">${themes
      .map((t) => `<a class="theme-pill" href="#/theme/${t.id}" style="--c:${t.color}">${t.icon} ${esc(t.name)}</a>`)
      .join('')}</div>`;
  }
  res.innerHTML = html + loadingHTML();
  try {
    await loadBible();
  } catch (e) {
    res.innerHTML = html + `<p class="empty">${esc(e.message)}</p>`;
    return;
  }
  if (!view.contains(res)) return;
  const verses = searchText(q);
  const list = { id: `search:${q}`, title: `Recherche : ${q}`, items: verses.map(verseToPassage), route: location.hash };
  currentList = list;
  const patterns = queryToPatterns(q);
  html += `<div class="results-head"><h2 class="section-title">${verses.length} verset${verses.length > 1 ? 's' : ''} contenant « ${esc(q)} »</h2>
    ${verses.length ? `<button class="btn ghost" id="listen-results">${ICONS.headphones} Tout écouter</button>` : ''}</div>
    ${audioNote(list)}
    <div id="result-list"></div>`;
  res.innerHTML = html;
  if (!verses.length) {
    $('#result-list').innerHTML = `<p class="empty">Aucun verset trouvé. Essayez un mot plus court (ex. « aim » pour aimer, aimé, aime…).</p>`;
    return;
  }
  $('#listen-results').onclick = () => player.load(list, 0, true);
  renderList($('#result-list'), list, { patterns, badgeFor: (p) => testamentOf(p.b) });
}

async function viewReader(b, c, params) {
  b = Number(b);
  c = Number(c);
  const v = Number(params.get('v')) || 0;
  const to = Math.max(v, Number(params.get('to')) || v);
  const book = BOOKS[b - 1];
  if (!book) return viewNotFound();
  view.innerHTML = loadingHTML();
  try {
    await loadBible();
  } catch (e) {
    view.innerHTML = `<p class="empty">${esc(e.message)}</p>`;
    return;
  }
  const verses = getChapter(b, c);
  if (!verses) return viewNotFound();
  store.setLastRead(b, c);
  const n = chapterCount(b);
  const prev = c > 1 ? [b, c - 1] : b > 1 ? [b - 1, chapterCount(b - 1)] : null;
  const next = c < n ? [b, c + 1] : b < 66 ? [b + 1, 1] : null;
  const list = {
    id: `read:${b}:${c}`,
    title: formatRef(b, c),
    items: verses.map(verseToPassage),
    route: `#/lire/${b}/${c}`,
  };
  currentList = list;
  const active = isPlayingList(list) ? player.state.index : -1;
  view.innerHTML = `
    <section class="page-head reader-head">
      ${returnTo ? `<a class="back-link" href="${esc(returnTo.hash)}">← Retour ${esc(backLabel(returnTo.hash))}</a>` : ''}
      <div class="reader-nav">
        <select id="rd-book" aria-label="Livre">${BOOKS.map((x) => `<option value="${x.id}"${x.id === b ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select>
        <select id="rd-chap" aria-label="Chapitre">${Array.from({ length: n }, (_, i) => `<option${i + 1 === c ? ' selected' : ''}>${i + 1}</option>`).join('')}</select>
      </div>
      <h1>${esc(formatRef(b, c))}</h1>
      <div class="hero-actions">
        <button class="btn primary" id="rd-listen">${ICONS.headphones} Écouter le chapitre${v ? ` depuis le verset ${v}` : ''}</button>
      </div>
    </section>
    ${audioNote(list)}
    <div class="chapter">${verses
      .map(
        (x, i) => `<p class="verse${v && x.v >= v && x.v <= to ? ' target' : ''}${i === active ? ' active' : ''}" data-idx="${i}" id="p-${i}">
          <button class="vnum" data-act="menu" aria-label="Écouter depuis le verset ${x.v}" title="Écouter depuis ce verset">${x.v}</button>
          <span>${esc(x.t)}</span></p>`,
      )
      .join('')}</div>
    <nav class="pager">
      ${prev ? `<a class="btn ghost" href="#/lire/${prev[0]}/${prev[1]}">← ${esc(formatRef(prev[0], prev[1]))}</a>` : '<span></span>'}
      ${next ? `<a class="btn ghost" href="#/lire/${next[0]}/${next[1]}">${esc(formatRef(next[0], next[1]))} →</a>` : ''}
    </nav>`;
  $('#rd-book').onchange = (e) => (location.hash = `#/lire/${e.target.value}/1`);
  $('#rd-chap').onchange = (e) => (location.hash = `#/lire/${b}/${e.target.value}`);
  $('#rd-listen').onclick = () => player.load(list, v ? v - 1 : 0, true);
  if (v) requestAnimationFrame(() => $(`#p-${v - 1}`)?.scrollIntoView({ block: 'center' }));
}

function backLabel(hash) {
  const m = hash.match(/^#\/theme\/([^/?]+)/);
  if (m) {
    const t = THEMES.find((x) => x.id === decodeURIComponent(m[1]));
    if (t) return `au thème « ${t.name} »`;
  }
  if (hash.startsWith('#/recherche')) return 'à la recherche';
  if (hash.startsWith('#/mes-versets')) return 'à mes versets';
  return "à l'accueil";
}

function viewMine(params) {
  const tab = params.get('tab') === 'notes' ? 'notes' : 'fav';
  const items = tab === 'notes' ? store.notes() : store.favorites();
  const list = { id: `mine:${tab}`, title: tab === 'notes' ? 'Mes méditations' : 'Mes versets', items, route: location.hash };
  currentList = list;
  view.innerHTML = `
    <section class="page-head">
      <h1>Mes versets</h1>
      <p>Les passages que vous gardez et vos notes de méditation restent sur cet appareil.</p>
      ${items.length ? `<div class="hero-actions"><button class="btn primary" id="mine-listen">${ICONS.headphones} Tout écouter</button>
        <button class="btn ghost" id="mine-med">${ICONS.medit} Méditer un à un</button></div>${audioNote(list)}` : ''}
    </section>
    <nav class="tabs" role="tablist">
      <a role="tab" href="#/mes-versets" aria-selected="${tab === 'fav'}">Gardés <span>${store.favorites().length}</span></a>
      <a role="tab" href="#/mes-versets?tab=notes" aria-selected="${tab === 'notes'}">Mes notes <span>${store.notes().length}</span></a>
    </nav>
    <div id="mine-list"></div>`;
  if (!items.length) {
    $('#mine-list').innerHTML = `<p class="empty">${
      tab === 'notes'
        ? 'Aucune note pour le moment. Touchez « Note » sous un passage pour écrire ce que Dieu vous dit.'
        : 'Aucun verset gardé. Touchez « Garder » sous un passage pour le retrouver ici.'
    }</p>`;
    return;
  }
  renderList($('#mine-list'), list);
  $('#mine-listen').onclick = () => player.load(list, 0, true);
  $('#mine-med').onclick = () => {
    player.load(list, 0, false);
    openMeditation();
  };
}

function viewNotFound() {
  view.innerHTML = `<p class="empty">Page introuvable. <a href="#/">Retour aux thèmes</a></p>`;
}

// ---- actions sur les passages (délégation) -----------------------------------------
view.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const card = btn.closest('[data-idx]');
  const idx = Number(card.dataset.idx);
  const p = currentList?.items[idx];
  if (!p) return;
  switch (btn.dataset.act) {
    case 'chapter':
      e.preventDefault();
      // ne pas changer de page si l'utilisateur sélectionne du texte pour le copier
      if (btn.matches('.text') && window.getSelection()?.toString()) return;
      openChapter(p, idx);
      break;
    case 'play':
      if (isPlayingList(currentList)) player.goto(idx), player.state.status !== 'playing' && player.play();
      else player.load(currentList, idx, true);
      break;
    case 'meditate':
      if (!isPlayingList(currentList)) player.load(currentList, idx, false);
      else player.goto(idx);
      openMeditation();
      break;
    case 'fav': {
      const on = store.toggleFavorite(p);
      btn.classList.toggle('on', on);
      btn.setAttribute('aria-pressed', on);
      btn.querySelector('span').textContent = on ? 'Gardé' : 'Garder';
      toast(on ? 'Ajouté à « Mes versets »' : 'Retiré de « Mes versets »');
      break;
    }
    case 'note': {
      const ed = $('.note-editor', card);
      ed.hidden = !ed.hidden;
      if (!ed.hidden) $('textarea', ed).focus();
      break;
    }
    case 'menu':
      if (isPlayingList(currentList)) player.goto(idx), player.state.status !== 'playing' && player.play();
      else player.load(currentList, idx, true);
      break;
  }
});

let noteTimer;
view.addEventListener('input', (e) => {
  if (!e.target.matches('.note-editor textarea')) return;
  const card = e.target.closest('[data-idx]');
  const p = currentList?.items[Number(card.dataset.idx)];
  clearTimeout(noteTimer);
  noteTimer = setTimeout(() => {
    store.setNote(p, e.target.value);
    $('[data-act="note"]', card).classList.toggle('on', Boolean(e.target.value.trim()));
  }, 400);
});

// ---- lecteur ----------------------------------------------------------------------
const pl = {
  root: $('#player'),
  title: $('#pl-title'),
  ref: $('#pl-ref'),
  toggle: $('#pl-toggle'),
  bar: $('#pl-bar'),
};
$('#pl-prev').onclick = () => player.prev();
$('#pl-next').onclick = () => player.next();
$('#pl-toggle').onclick = () => player.toggle();
$('#pl-close').onclick = () => {
  player.stop();
  closeMeditation();
};
$('#pl-open').onclick = () => openMeditation();
$('#pl-settings').onclick = () => openSettings();

function statusText(s) {
  if (s.error) return s.error;
  if (s.status === 'waiting') return s.countdown > 0 ? `Silence pour méditer… ${s.countdown} s` : 'Passage suivant…';
  if (s.status === 'paused') return s.ended ? 'Terminé' : 'En pause';
  if (s.status === 'playing') return s.background ? 'Lecture · écran éteint possible 🔒' : 'Lecture (gardez l’écran allumé)';
  return '';
}

let lastIndex = -1;
let lastList = null;
player.onChange((s) => {
  const cur = player.current;
  document.body.classList.toggle('has-player', Boolean(s.playlist));
  pl.root.hidden = !s.playlist;
  if (!s.playlist) {
    markActive(-1);
    return;
  }
  const playing = s.status === 'playing' || s.status === 'waiting';
  pl.title.textContent = `${s.playlist.title} · ${s.index + 1}/${s.playlist.items.length}`;
  pl.ref.textContent = `${formatRef(cur.b, cur.c, cur.f, cur.t)} — ${statusText(s)}`;
  for (const t of [pl.toggle, $('#med-toggle')]) {
    t.classList.toggle('playing', playing);
    t.setAttribute('aria-label', playing ? 'Pause' : 'Lecture');
  }
  pl.bar.style.width = `${((s.index + 1) / s.playlist.items.length) * 100}%`;
  if (s.index !== lastIndex || s.playlist !== lastList) {
    lastIndex = s.index;
    lastList = s.playlist;
    markActive(isPlayingList(currentList) ? s.index : -1, playing);
    renderMeditation();
  }
  $('#med-status').textContent = statusText(s);
});

function markActive(idx, scroll) {
  view.querySelectorAll('.active[data-idx]').forEach((el) => el.classList.remove('active'));
  if (idx < 0) return;
  currentList?.ensureVisible?.(idx);
  const el = $(`#p-${idx}`);
  if (!el) return;
  el.classList.add('active');
  if (scroll && $('#meditation').hidden) {
    const r = el.getBoundingClientRect();
    if (r.top < 70 || r.bottom > innerHeight - 110) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

// ---- méditation ----------------------------------------------------------------
const med = $('#meditation');
function openMeditation() {
  if (!player.state.playlist) return;
  med.hidden = false;
  document.body.classList.add('no-scroll');
  renderMeditation();
}
function closeMeditation() {
  med.hidden = true;
  document.body.classList.remove('no-scroll');
}
function renderMeditation() {
  if (med.hidden) return;
  const p = player.current;
  if (!p) return closeMeditation();
  const s = player.state;
  $('#med-title').textContent = `${s.playlist.title} · ${s.index + 1}/${s.playlist.items.length}`;
  $('#med-ref').textContent = formatRef(p.b, p.c, p.f, p.t);
  $('#med-chapter').textContent = `📖 Lire tout le chapitre ${p.c}`;
  $('#med-text').innerHTML = passageText(p);
  $('#med-note').value = store.getNote(p);
  $('#med-fav').classList.toggle('on', store.isFavorite(p));
  $('#med-status').textContent = statusText(s);
}
$('#med-close').onclick = closeMeditation;
$('#med-chapter').onclick = () => {
  const p = player.current;
  if (!p) return;
  const idx = isPlayingList(currentList) ? player.state.index : null;
  closeMeditation();
  openChapter(p, idx);
};
$('#med-prev').onclick = () => player.prev();
$('#med-next').onclick = () => player.next();
$('#med-toggle').onclick = () => player.toggle();
$('#med-fav').onclick = () => {
  const on = store.toggleFavorite(player.current);
  $('#med-fav').classList.toggle('on', on);
  toast(on ? 'Ajouté à « Mes versets »' : 'Retiré de « Mes versets »');
};
let medTimer;
$('#med-note').addEventListener('input', (e) => {
  const p = player.current;
  clearTimeout(medTimer);
  medTimer = setTimeout(() => store.setNote(p, e.target.value), 400);
});
document.addEventListener('keydown', (e) => {
  if (e.target.matches('input, textarea, select')) return;
  if (e.key === 'Escape' && !med.hidden) closeMeditation();
  if (!player.state.playlist) return;
  if (e.key === ' ') (e.preventDefault(), player.toggle());
  if (e.key === 'ArrowRight' && !med.hidden) player.next();
  if (e.key === 'ArrowLeft' && !med.hidden) player.prev();
});

// ---- réglages ------------------------------------------------------------------
const dlg = $('#settings');
function fillVoices() {
  const sel = $('#set-voice');
  const voices = frenchVoices();
  sel.innerHTML = voices.length
    ? voices.map((v) => `<option value="${esc(v.voiceURI)}">${esc(v.name)} (${esc(v.lang)})</option>`).join('')
    : '<option value="">Voix par défaut</option>';
  sel.value = store.settings.voice || voices[0]?.voiceURI || '';
  $('#voice-hint').textContent =
    'Les versets clés des thèmes sont lus par la voix enregistrée de l’application (écoute écran éteint possible). ' +
    (!ttsSupported
      ? 'Ailleurs, ce navigateur ne propose pas de lecture à voix haute.'
      : voices.length
        ? 'Ailleurs (chapitres, recherche), c’est la voix choisie ici qui lit : les voix « naturelles » ou « Google » sont les plus agréables.'
        : 'Ailleurs, aucune voix française n’est installée sur cet appareil (réglages → synthèse vocale).');
}
function openSettings() {
  const s = store.settings;
  fillVoices();
  $('#set-rate').value = s.rate;
  $('#rate-out').textContent = `${s.rate.toFixed(2)}×`;
  $('#set-gap').value = String(s.gap);
  $('#set-repeat').value = String(s.repeat);
  $('#set-sleep').value = String(s.sleep);
  $('#set-ref').checked = s.readRef;
  $('#set-loop').checked = s.loop;
  $('#set-font').value = s.fontSize;
  dlg.showModal();
}
$('#set-voice').onchange = (e) => store.setSetting('voice', e.target.value);
$('#set-rate').oninput = (e) => {
  store.setSetting('rate', Number(e.target.value));
  $('#rate-out').textContent = `${Number(e.target.value).toFixed(2)}×`;
};
$('#set-gap').onchange = (e) => store.setSetting('gap', Number(e.target.value));
$('#set-repeat').onchange = (e) => store.setSetting('repeat', Number(e.target.value));
$('#set-sleep').onchange = (e) => {
  store.setSetting('sleep', Number(e.target.value));
  player.resetSleep();
};
$('#set-ref').onchange = (e) => store.setSetting('readRef', e.target.checked);
$('#set-loop').onchange = (e) => store.setSetting('loop', e.target.checked);
$('#set-font').oninput = (e) => {
  store.setSetting('fontSize', Number(e.target.value));
  applyFont();
};
dlg.addEventListener('click', (e) => e.target === dlg && dlg.close());
const applyFont = () => document.documentElement.style.setProperty('--fs', store.settings.fontSize);

// ---- routeur -------------------------------------------------------------------
async function route() {
  cleanup.forEach((fn) => fn());
  cleanup = [];
  const [path, query] = location.hash.replace(/^#/, '').split('?');
  const params = new URLSearchParams(query || '');
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  const section = parts[0] || '';
  const lr = store.lastRead;
  $('[data-nav="read"]').href = `#/lire/${lr.b}/${lr.c}`;
  document.querySelectorAll('[data-nav]').forEach((a) => {
    const map = { '': 'home', theme: 'home', recherche: 'search', lire: 'read', 'mes-versets': 'mine' };
    a.classList.toggle('on', a.dataset.nav === map[section]);
  });
  currentList = null;
  window.scrollTo(0, 0);
  if (section === '') viewHome();
  else if (section === 'theme') await viewTheme(parts[1], parts[2], params);
  else if (section === 'recherche') await viewSearch(params);
  else if (section === 'lire') await viewReader(parts[1], parts[2] || 1, params);
  else if (section === 'mes-versets') viewMine(params);
  else viewNotFound();
  if (isPlayingList(currentList)) markActive(player.state.index, false);

  // Retour depuis un chapitre : on retrouve le passage d'où l'on était parti.
  if (returnTo && section !== 'lire') {
    const back = returnTo;
    returnTo = null;
    if (back.hash === location.hash && back.idx != null && currentList) {
      currentList.ensureVisible?.(back.idx);
      const el = $(`#p-${back.idx}`);
      if (el) {
        el.scrollIntoView({ block: 'center' });
        el.classList.add('flash');
        setTimeout(() => el.classList.remove('flash'), 1600);
      }
    }
  }
}

async function start() {
  applyFont();
  try {
    [THEMES] = await Promise.all([
      loadThemes(),
      fetch('data/audio.json')
        .then((r) => (r.ok ? r.json() : null))
        .then(setAudioManifest)
        .catch(() => {}),
    ]);
  } catch (e) {
    view.innerHTML = `<p class="empty">${esc(e.message)}</p>`;
    return;
  }
  window.addEventListener('hashchange', route);
  route();
  // précharge la Bible en arrière-plan pour la recherche et « Toute la Bible »
  const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 1500));
  idle(() => !isBibleLoaded() && loadBible().catch(() => {}));
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

start();
