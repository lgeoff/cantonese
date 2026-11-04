// Main screens: Path (home), Practice, Words, Speak lab, Me.
import { h, jpNode, jpHTML, todayStr, toneOf, TONES, sJP, esc } from './util.js';
import { UNITS, UNIT, LEVELS, ITEMS, unitProgress, nextLesson, buildLesson, buildReview, buildDrill, learnedWords, learnedSentences } from './course.js';
import { S, dueKeys, strength, streakAlive, todayXP, lessonState, setting, toggleStar, exportJSON, importJSON, resetAll, card, save } from './store.js';
import { runSession } from './session.js';
import { canto, speakerBtn, toneChartSVG, recorderWidget, ICON } from './exercises.js';
import { speak, speakSlow, hasVoice, cantoVoices, supported as ttsSupported, whenReady } from './tts.js';
import * as SP from './speak.js';

export const UNIT_ZH = {
  u01: ['我嘅生字', 'ngo5 ge3 saang1 zi6'], u02: ['聲調', 'sing1 diu6'], u03: ['打招呼', 'daa2 ziu1 fu1'], u04: ['自我介紹', 'zi6 ngo5 gaai3 siu6'],
  u05: ['數字同錢', 'sou3 zi6 tung4 cin2'], u06: ['日子同時間', 'jat6 zi2 tung4 si4 gaan3'], u07: ['屋企人', 'uk1 kei2 jan4'], u08: ['飲茶', 'jam2 caa4'],
  u09: ['搭車', 'daap3 ce1'], u10: ['買嘢', 'maai5 je5'], u11: ['我嘅一日', 'ngo5 ge3 jat1 jat6'], u12: ['屋企電器', 'uk1 kei2 din6 hei3'],
  u13: ['天氣心情', 'tin1 hei3 sam1 cing4'], u14: ['文法', 'man4 faat3'], u15: ['興趣', 'hing3 ceoi3'], u16: ['健康', 'gin6 hong1'],
  u17: ['返工讀書', 'faan1 gung1 duk6 syu1'], u18: ['約人', 'joek3 jan4'], u19: ['意見', 'ji3 gin3'], u20: ['講故事', 'gong2 gu3 si6'],
  u21: ['進階句式', 'zeon3 gaai1 geoi3 sik1'], u22: ['香港俗語', 'hoeng1 gong2 zuk6 jyu5'], u23: ['節日祝福', 'zit3 jat6 zuk1 fuk1'], u24: ['新聞社會', 'san1 man4 se5 wui2'],
};

const view = () => document.getElementById('view');
let refresh = () => {};
export function setRefresh(f) { refresh = f; }

export function sheet(content, { title } = {}) {
  const back = h('div', { class: 'sheet-back', onclick: (e) => { if (e.target === back) close(); } });
  const panel = h('div', { class: 'sheet', role: 'dialog', 'aria-label': title || 'Details' },
    h('div', { class: 'sheet-head' }, h('h2', {}, title || ''), h('button', { class: 'x', type: 'button', 'aria-label': 'Close', onclick: () => close() }, '✕')), content);
  back.append(panel);
  document.body.append(back);
  requestAnimationFrame(() => back.classList.add('open'));
  function close() { back.classList.remove('open'); setTimeout(() => back.remove(), 220); }
  return close;
}

function startLesson(l, replay) {
  const u = UNIT.get(l.unit);
  runSession({ title: u.title, steps: buildLesson(l, { replay }), lessonId: l.id, onExit: refresh });
}
export function startReview(mode = 'mixed', n = 12) {
  runSession({ title: 'Review', steps: buildReview(n, { mode }), onExit: refresh, kind: 'review' });
}

// ------------------------------------------------------------------ PATH
export function renderPath() {
  const v = view(); v.innerHTML = '';
  const st = S(), due = dueKeys().length, streak = streakAlive(), today = todayXP();
  const nl = nextLesson();
  const ring = goalRing(today, st.goal);
  v.append(h('header', { class: 'top' },
    h('div', { class: 'brand' }, h('span', { class: 'logo', lang: 'zh-HK' }, '識講'), h('span', { class: 'brand-jp', html: jpHTML('sik1 gong2') })),
    h('div', { class: 'top-stats' },
      h('div', { class: 'tstat', title: 'Day streak' }, h('b', {}, `🔥 ${streak}`)),
      h('div', { class: 'tstat', title: 'XP today' }, ring))));

  const hero = h('section', { class: 'next' });
  if (nl) {
    const u = UNIT.get(nl.unit);
    hero.append(
      h('div', { class: 'next-label' }, 'Next stop'),
      h('div', { class: 'next-row' }, h('div', { class: 'next-emoji' }, u.emoji),
        h('div', {}, h('h1', {}, u.title), h('p', {}, nl.kind === 'dialogue' ? `Conversation: ${nl.title}` : `Lesson ${nl.idx + 1} of ${u.lessons.length} · ${nl.title}`))),
      h('div', { class: 'next-actions' },
        h('button', { class: 'btn primary', type: 'button', onclick: () => startLesson(nl) }, 'Start lesson'),
        due ? h('button', { class: 'btn', type: 'button', onclick: () => startReview() }, `Review ${due} due`) : null));
  } else hero.append(h('h1', {}, 'You reached the end of the line 🎉'), h('p', {}, 'Keep your reviews going in Practice.'));
  v.append(hero);

  if (due >= 1 || Object.keys(st.items).length) {
    v.append(h('button', { class: 'quick', type: 'button', onclick: () => quickSession() },
      h('span', { class: 'quick-ico' }, '⚡'), h('span', {}, h('b', {}, '3-minute session'), h('small', {}, due ? `${due} reviews waiting, then new words` : 'Mixed practice of what you know'))));
  }

  const map = h('section', { class: 'map', 'aria-label': 'Course map' });
  for (const L of LEVELS) {
    const units = UNITS.filter((u) => u.level === L.n);
    if (!units.length) continue;
    const line = h('div', { class: `line line-${L.n}` });
    line.append(h('div', { class: 'line-head' }, h('span', { class: 'line-badge', lang: 'zh-HK' }, L.zh), h('span', {}, `Level ${L.n} · ${L.name}`)));
    for (const u of units) {
      const p = unitProgress(u);
      const isCurrent = nl && nl.unit === u.id;
      const stateCls = p.done === p.total ? 'done' : p.done ? 'part' : 'todo';
      const zh = UNIT_ZH[u.id];
      const station = h('button', { class: `station ${stateCls} ${isCurrent ? 'current' : ''}`, type: 'button', onclick: () => unitSheet(u) },
        h('span', { class: 'dot', style: { '--p': p.pct } }),
        h('span', { class: 'st-name' },
          zh ? h('span', { class: 'st-zh', lang: 'zh-HK' }, zh[0]) : null,
          h('span', { class: 'st-en' }, `${u.emoji} ${u.title}`),
          h('span', { class: 'st-meta' }, isCurrent ? 'You are here' : p.done === p.total ? 'Complete' : `${p.done}/${p.total} lessons`)));
      line.append(station);
    }
    map.append(line);
  }
  v.append(map);
  if (!hasVoice()) whenReady(() => { if (!hasVoice()) v.prepend(voiceBanner()); });
}

function voiceBanner() {
  return h('div', { class: 'banner' }, h('b', {}, 'No Cantonese voice found on this device. '),
    ttsSupported() ? 'iPhone: Settings → Accessibility → Spoken Content → Voices → Chinese → Chinese (Hong Kong), download a voice. Android: Settings → Text-to-speech → Google → install Cantonese (Hong Kong). Then reload.' : 'This browser cannot speak. Try Safari on iPhone or Chrome on Android.');
}

function goalRing(xp, goal) {
  const p = Math.min(1, xp / goal), r = 15, c = 2 * Math.PI * r;
  const s = h('span', { class: 'ring', html: `<svg viewBox="0 0 36 36" width="36" height="36" aria-hidden="true"><circle cx="18" cy="18" r="${r}" class="ring-bg"/><circle cx="18" cy="18" r="${r}" class="ring-fg" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - p)}"/></svg><b>${xp}</b>` });
  s.setAttribute('aria-label', `${xp} of ${goal} XP today`);
  return s;
}

function quickSession() {
  const due = dueKeys().length;
  const nl = nextLesson();
  if (due >= 6 || !nl) return startReview('mixed', 10);
  // a few reviews, then the next lesson
  const steps = [...buildReview(Math.max(due, 3)).slice(0, 5), ...buildLesson(nl, { replay: !!lessonState(nl.id) })];
  runSession({ title: 'Quick session', steps, lessonId: nl.id, onExit: refresh });
}

function unitSheet(u) {
  const zh = UNIT_ZH[u.id];
  const c = h('div', { class: 'unit-sheet' });
  c.append(h('div', { class: 'us-head' }, h('span', { class: 'us-emoji' }, u.emoji),
    h('div', {}, zh ? h('div', { class: 'us-zh' }, h('span', { lang: 'zh-HK' }, zh[0]), ' ', jpNode(zh[1])) : null, h('p', {}, u.desc))));
  const list = h('ol', { class: 'lessons' });
  u.lessons.forEach((l) => {
    const ls = lessonState(l.id);
    list.append(h('li', { class: ls ? 'done' : '' },
      h('div', {}, h('b', {}, l.kind === 'dialogue' ? `💬 ${l.title}` : l.title),
        h('small', {}, l.kind === 'dialogue' ? 'Conversation + questions' : `${l.words.length} words · ${l.sentences.length} sentences`)),
      h('button', { class: `btn ${ls ? '' : 'primary'} sm`, type: 'button', onclick: () => { close(); startLesson(l, !!ls); } }, ls ? 'Practise' : 'Start')));
  });
  c.append(list);
  if (u.grammar?.length) {
    c.append(h('h3', {}, 'Patterns in this unit'));
    for (const g of u.grammar) c.append(h('details', { class: 'gnote' }, h('summary', {}, g.title), h('p', {}, g.explain),
      ...(g.examples || []).map((e) => h('div', { class: 'example' }, speakerBtn(e.hk, 'sm'), h('div', {}, canto(e, { size: 'sm', forceJp: true }), h('div', { class: 'en-sm' }, e.en))))));
  }
  c.append(h('h3', {}, 'Words'), h('div', { class: 'chips' }, ...u.words.map((w) => h('button', { class: `wchip ${card(w.key) ? 'known' : ''}`, type: 'button', onclick: () => speak(w.hk) }, h('span', { lang: 'zh-HK' }, w.hk), h('small', {}, w.en)))));
  const close = sheet(c, { title: `${u.title}` });
}

// ------------------------------------------------------------------ PRACTICE
export function renderPractice() {
  const v = view(); v.innerHTML = '';
  const due = dueKeys().length, nw = learnedWords().length, ns = learnedSentences().length;
  v.append(h('header', { class: 'page-head' }, h('h1', {}, 'Practice'), h('p', {}, `${nw} words and ${ns} sentences in your review deck.`)));
  v.append(h('button', { class: 'review-card', type: 'button', disabled: !nw, onclick: () => startReview('mixed', 20) },
    h('div', { class: 'rc-num' }, String(due)), h('div', {}, h('b', {}, due ? 'Reviews due now' : 'All caught up'), h('small', {}, due ? 'Spaced repetition: these are about to slip. Clearing them is the best use of 3 minutes.' : 'Nothing is due. Drills below keep things fresh.'))));
  const drills = [
    ['listen', '👂', 'Listening drill', 'Audio only: catch words and whole sentences'],
    ['tones', '🎵', 'Tone gym', 'Hear the pitch, pick the tone'],
    ['build', '🧩', 'Sentence builder', 'Rebuild sentences from tiles'],
    ['match', '⏱️', 'Speed match', 'Four rounds of pairs against the clock'],
    ['speak', '🗣️', 'Shadowing', 'Listen, repeat, check yourself'],
  ];
  const grid = h('div', { class: 'drills' });
  for (const [mode, ico, t, d] of drills) {
    const need = mode === 'tones' ? 0 : mode === 'build' || mode === 'speak' ? 2 : 5;
    const ok = mode === 'tones' || (mode === 'build' ? ns >= need : nw >= need);
    grid.append(h('button', { class: 'drill', type: 'button', disabled: !ok, onclick: () => runSession({ title: t, steps: buildDrill(mode, 10), onExit: refresh, kind: 'drill' }) },
      h('span', { class: 'd-ico' }, ico), h('b', {}, t), h('small', {}, ok ? d : 'Unlocks after a few lessons')));
  }
  v.append(grid);
  v.append(h('h2', { class: 'sec' }, 'Conversations'));
  const dl = h('div', { class: 'dlg-list' });
  for (const u of UNITS) if (u.dialogue) {
    const l = u.lessons.find((x) => x.kind === 'dialogue');
    dl.append(h('button', { class: 'dlg-item', type: 'button', onclick: () => runSession({ title: u.dialogue.title, steps: buildLesson(l, { replay: true }), lessonId: l.id, onExit: refresh }) },
      h('span', {}, u.emoji), h('span', {}, h('b', {}, u.dialogue.title), h('small', {}, `${u.title} · ${u.dialogue.lines.length} lines`)), lessonState(l.id) ? h('span', { class: 'tick' }, '✓') : null));
  }
  v.append(dl);
  v.append(h('h2', { class: 'sec' }, 'Reference'));
  v.append(h('button', { class: 'dlg-item', type: 'button', onclick: soundGuide }, h('span', {}, '🔤'), h('span', {}, h('b', {}, 'Sound guide'), h('small', {}, 'Tones chart and how to read Jyutping'))));
}

function soundGuide() {
  const c = h('div', { class: 'guide' });
  const holder = h('div', { class: 'chart-holder', html: toneChartSVG() });
  c.append(holder);
  const set = [['詩', 'si1'], ['史', 'si2'], ['試', 'si3'], ['時', 'si4'], ['市', 'si5'], ['事', 'si6']];
  c.append(h('div', { class: 'tone-btns' }, ...set.map(([ch, j], i) => {
    const b = h('button', { class: `tbtn t${i + 1}`, type: 'button', html: `<b lang="zh-HK">${ch}</b><small>${jpHTML(j)} · ${TONES[i + 1].name}</small>` });
    b.onclick = () => { holder.innerHTML = toneChartSVG({ active: i + 1 }); speak(ch); };
    return b;
  })));
  const rows = [
    ['j', 'y in "yes"', '而家 ji4 gaa1'], ['z', 'dz / ts (unaspirated)', '做 zou6'], ['c', 'ts with a puff of air', '車 ce1'],
    ['ng', 'ng in "sing", also at the start', '我 ngo5'], ['gw / kw', 'gu / ku with rounded lips', '廣 gwong2'],
    ['aa', 'long a, as in "father"', '街 gaai1'], ['a', 'short, like u in "cut"', '雞 gai1'],
    ['eo / oe', 'like French "eu"', '去 heoi3 · 長 coeng4'], ['yu', 'French "u" (tu)', '書 syu1'], ['i / ik', 'ee / short "ick"', '詩 si1 · 食 sik6'],
    ['-p -t -k', 'stop the sound, don’t release it', '十 sap6 · 一 jat1 · 六 luk6'], ['m / ng (alone)', 'a hummed syllable', '唔 m4 · 五 ng5'],
  ];
  c.append(h('h3', {}, 'Reading Jyutping'), h('table', { class: 'jp-table' }, h('tbody', {}, ...rows.map(([a, b, e]) => {
    const [hk, ...jp] = e.split(' ');
    return h('tr', {}, h('th', {}, a), h('td', {}, b), h('td', { class: 'eg', onclick: () => speak(e.replace(/[a-z0-9·\s]+/g, '')) }, h('span', { lang: 'zh-HK' }, e.replace(/[a-z]+[1-6]/g, '').replace(/\s+/g, ' ').trim()), ' ', jpNode(e.match(/[a-z]+[1-6]/g).join(' '))));
  }))));
  c.append(h('p', { class: 'note' }, 'Tip: tones 3 and 6 are the hardest pair (mid vs low level). Exaggerate at first — your voice will settle.'));
  sheet(c, { title: 'Sound guide' });
}

// ------------------------------------------------------------------ WORDS
let wordsState = { tab: 'w', q: '', unit: '', all: false };
export function renderWords() {
  const v = view(); v.innerHTML = '';
  const st = wordsState;
  const head = h('header', { class: 'page-head' }, h('h1', {}, 'My words'));
  const tabs = h('div', { class: 'tabs', role: 'tablist' }, ...[['w', 'Words'], ['s', 'Phrases'], ['star', '★ Starred']].map(([k, l]) =>
    h('button', { class: st.tab === k ? 'on' : '', role: 'tab', type: 'button', onclick: () => { st.tab = k; renderWords(); } }, l)));
  const search = h('input', { type: 'search', placeholder: 'Search English, 中文 or jyutping', value: st.q, 'aria-label': 'Search words' });
  search.oninput = () => { st.q = search.value; draw(); };
  const unitSel = h('select', { 'aria-label': 'Filter by unit' }, h('option', { value: '' }, 'All units'), ...UNITS.map((u) => h('option', { value: u.id, selected: st.unit === u.id }, `${u.emoji} ${u.title}`)));
  unitSel.onchange = () => { st.unit = unitSel.value; draw(); };
  const allT = h('label', { class: 'switch' }, h('input', { type: 'checkbox', checked: st.all, onchange: (e) => { st.all = e.target.checked; draw(); } }), h('span', {}, 'Include words not learned yet'));
  const list = h('div', { class: 'wlist' });
  const count = h('p', { class: 'count' });
  const flash = h('button', { class: 'btn sm', type: 'button', onclick: () => flashcards(currentItems()) }, '🃏 Flashcards');
  v.append(head, tabs, h('div', { class: 'filters' }, search, unitSel), h('div', { class: 'row between' }, allT, flash), count, list);
  function currentItems() {
    const q = st.q.trim().toLowerCase();
    let items = [...ITEMS.values()];
    if (st.tab === 'star') items = S().stars.map((k) => ITEMS.get(k)).filter(Boolean);
    else items = items.filter((x) => x.kind === st.tab);
    if (!st.all && st.tab !== 'star') items = items.filter((x) => card(x.key));
    if (st.unit) items = items.filter((x) => x.unit === st.unit);
    if (q) items = items.filter((x) => [x.hk, x.en, x.fr, x.jp, x.mine, x.parts && sJP(x.parts)].filter(Boolean).join(' ').toLowerCase().replace(/[1-6]/g, '').includes(q.replace(/[1-6]/g, '')));
    return items;
  }
  function draw() {
    const items = currentItems();
    list.innerHTML = '';
    count.textContent = `${items.length} ${st.tab === 's' ? 'phrases' : 'items'}${!st.all && st.tab !== 'star' ? ' learned' : ''}`;
    if (!items.length) {
      list.append(h('div', { class: 'empty' }, st.all || st.q ? 'No matches.' : 'Words appear here as soon as you meet them in a lesson.'));
      return;
    }
    const frag = document.createDocumentFragment();
    for (const it of items.slice(0, 400)) frag.append(row(it));
    list.append(frag);
  }
  function row(it) {
    const known = card(it.key);
    const s = strength(it.key);
    const r = h('div', { class: `wrow ${known ? '' : 'unseen'}` },
      speakerBtn(it.hk, 'sm'),
      h('button', { class: 'wmain', type: 'button', onclick: () => wordSheet(it) },
        h('span', { class: 'whk', lang: 'zh-HK' }, it.hk),
        jpNode(it.jp || sJP(it.parts)),
        h('span', { class: 'wen' }, it.en, it.mine ? h('em', {}, ` · you wrote “${it.mine}”`) : null)),
      h('span', { class: 'bars', title: `Memory strength ${s}/5`, 'aria-label': `Memory strength ${s} of 5` }, ...[1, 2, 3, 4, 5].map((i) => h('i', { class: i <= s ? 'on' : '' }))));
    return r;
  }
  draw();
}

function wordSheet(it) {
  const starred = S().stars.includes(it.key);
  const u = UNIT.get(it.unit);
  const c = h('div', { class: 'word-sheet' },
    h('div', { class: 'teach-top' }, speakerBtn(it.hk, 'lg'), speakerBtn(it.hk, 'md', { slow: true })),
    canto(it, { size: it.kind === 'w' ? 'xl' : 'md', forceJp: true }),
    h('div', { class: 'en' }, it.en, it.fr ? h('span', { class: 'fr' }, ' · ' + it.fr) : null),
    it.mine ? h('div', { class: 'mine' }, 'Your spelling: ', h('b', {}, it.mine)) : null,
    it.note ? h('p', { class: 'note' }, it.note) : null,
    it.ex ? h('div', { class: 'example' }, speakerBtn(it.ex.hk, 'sm'), h('div', {}, canto(it.ex, { size: 'sm', forceJp: true }), h('div', { class: 'en-sm' }, it.ex.en))) : null,
    h('p', { class: 'meta' }, `From: ${u.emoji} ${u.title}`, card(it.key) ? ` · seen ${card(it.key).seen}× · next review ${fmtDue(card(it.key).due)}` : ' · not learned yet'));
  const sb = h('button', { class: 'btn sm', type: 'button' }, starred ? '★ Starred' : '☆ Star');
  sb.onclick = () => { const on = toggleStar(it.key); sb.textContent = on ? '★ Starred' : '☆ Star'; };
  c.append(sb);
  sheet(c, { title: it.kind === 'w' ? 'Word' : 'Phrase' });
}
function fmtDue(t) {
  const d = t - Date.now();
  if (d <= 0) return 'now';
  if (d < 36e5) return `in ${Math.ceil(d / 6e4)} min`;
  if (d < 864e5) return `in ${Math.round(d / 36e5)} h`;
  return `in ${Math.round(d / 864e5)} days`;
}

function flashcards(items) {
  if (!items.length) return;
  let i = 0, flipped = false, front = 'hk';
  const c = h('div', { class: 'flash' });
  const sideSel = h('div', { class: 'tabs small' }, ...[['hk', '中 first'], ['en', 'EN first'], ['audio', '🔊 first']].map(([k, l]) =>
    h('button', { type: 'button', class: front === k ? 'on' : '', onclick: (e) => { front = k; sideSel.querySelectorAll('button').forEach((b) => b.classList.remove('on')); e.target.classList.add('on'); draw(); } }, l)));
  const cardEl = h('button', { class: 'fcard', type: 'button', onclick: () => { flipped = !flipped; draw(); } });
  const nav = h('div', { class: 'row between' },
    h('button', { class: 'btn sm', type: 'button', onclick: () => { i = (i - 1 + items.length) % items.length; flipped = false; draw(); } }, '‹ Prev'),
    h('span', { class: 'count' }),
    h('button', { class: 'btn sm primary', type: 'button', onclick: () => { i = (i + 1) % items.length; flipped = false; draw(); } }, 'Next ›'));
  c.append(sideSel, cardEl, nav);
  const order = items.slice().sort(() => Math.random() - 0.5);
  function draw() {
    const it = order[i];
    cardEl.innerHTML = '';
    nav.querySelector('.count').textContent = `${i + 1} / ${order.length}`;
    const showCanto = flipped || front === 'hk';
    if (front === 'audio' && !flipped) { cardEl.append(h('div', { class: 'big-ico', html: ICON.speaker })); speak(it.hk); }
    else if (showCanto) cardEl.append(canto(it, { size: it.kind === 'w' ? 'xl' : 'md', forceJp: flipped || front !== 'hk' ? true : false }));
    if (flipped || front === 'en') cardEl.append(h('div', { class: 'en' }, it.en));
    if (flipped) speak(it.hk);
    if (!flipped) cardEl.append(h('small', { class: 'hint' }, 'Tap to flip'));
  }
  draw();
  sheet(c, { title: `Flashcards (${items.length})` });
}

// ------------------------------------------------------------------ SPEAK LAB
export function renderSpeak() {
  const v = view(); v.innerHTML = '';
  v.append(h('header', { class: 'page-head' }, h('h1', {}, 'Speak lab'), h('p', {}, 'There is no perfect automatic judge for Cantonese pronunciation yet, so the lab combines three honest tools.')));
  const caps = h('ul', { class: 'caps' },
    h('li', { class: hasVoice() ? 'yes' : 'no' }, hasVoice() ? `Cantonese voice: ${cantoVoices()[0]?.name}` : 'No Cantonese voice installed'),
    h('li', { class: SP.recogSupported() ? 'yes' : 'no' }, SP.recogSupported() ? 'Speech recognition available' : 'Speech recognition not available in this browser'),
    h('li', { class: SP.micSupported() ? 'yes' : 'no' }, SP.micSupported() ? 'Microphone recording available' : 'No microphone access'));
  v.append(caps);

  v.append(h('section', { class: 'lab' }, h('h2', {}, '1 · Shadowing'), h('p', {}, 'Listen, repeat immediately with the same melody, then record and compare back-to-back. This is the most reliable way to improve.'),
    h('button', { class: 'btn primary', type: 'button', disabled: learnedSentences().length + learnedWords().length < 2, onclick: () => runSession({ title: 'Shadowing', steps: buildDrill('speak', 8), onExit: refresh }) }, 'Start shadowing (8 items)')));

  // tone mirror
  const lab = h('section', { class: 'lab' }, h('h2', {}, '2 · Tone mirror'), h('p', {}, 'Say one syllable and see your pitch drawn over the six tone shapes. Calibrate once so the chart knows your voice range.'));
  const words = [...UNIT.get('u02').words.filter((w) => w.set === 'si' || w.set === 'ji' || w.set === 'fu'), ...learnedWords().filter((w) => w.hk.length === 1)];
  let target = words[0];
  const sel = h('select', { 'aria-label': 'Syllable to practise' }, ...words.map((w, i) => h('option', { value: i }, `${w.hk} ${w.jp} — ${w.en}`)));
  sel.onchange = () => { target = words[+sel.value]; chart.innerHTML = toneChartSVG({ active: toneOf(target.jp) }); };
  const chart = h('div', { class: 'chart-holder', html: toneChartSVG({ active: toneOf(target.jp) }) });
  const verdict = h('p', { class: 'verdict' });
  const mirrorBtn = h('button', { class: 'rec-btn', type: 'button', html: ICON.mic + '<span>Hold a breath, then say it</span>' });
  let live = null;
  mirrorBtn.onclick = async () => {
    if (live) { live.stop(); return; }
    try {
      live = await SP.startRecording({ maxMs: 2200, onPitch: (track) => { const pts = SP.toChao(SP.contour(track), setting('pitchLow'), setting('pitchHigh')); chart.innerHTML = toneChartSVG({ active: toneOf(target.jp), user: pts }); } });
      mirrorBtn.classList.add('live'); mirrorBtn.querySelector('span').textContent = 'Listening… (stop)';
      const r = await live.done; live = null;
      mirrorBtn.classList.remove('live'); mirrorBtn.querySelector('span').textContent = 'Try again';
      const pts = SP.toChao(SP.contour(r.track), setting('pitchLow'), setting('pitchHigh'));
      chart.innerHTML = toneChartSVG({ active: toneOf(target.jp), user: pts });
      verdict.textContent = judge(pts, toneOf(target.jp));
    } catch (e) { live = null; verdict.textContent = 'Microphone not available. Allow microphone access for this site.'; }
  };
  const calib = h('button', { class: 'link', type: 'button', onclick: calibrate }, setting('pitchHigh') ? 'Recalibrate my voice range' : 'Calibrate my voice range (30 s)');
  lab.append(h('div', { class: 'row' }, sel, speakerBtn('', 'md')), chart, mirrorBtn, verdict, calib);
  lab.querySelector('.row .spk').onclick = () => speak(target.hk);
  v.append(lab);

  // free speech
  const free = h('section', { class: 'lab' }, h('h2', {}, '3 · Free talk check'), h('p', {}, 'Say any sentence. If your phone’s Cantonese dictation writes the words you meant, a native listener would very likely understand you too.'));
  const out = h('div', { class: 'heard-big', lang: 'zh-HK' });
  const fb = h('button', { class: 'big-mic', type: 'button', disabled: !SP.recogSupported(), html: ICON.mic + '<span>Tap and speak</span>' });
  fb.onclick = async () => {
    fb.classList.add('live'); out.textContent = '…';
    try { const alts = await SP.recognize(); out.textContent = alts[0] || '(nothing recognised — try again closer to the mic)'; }
    catch (e) { out.textContent = 'Speech recognition failed: ' + e.message; }
    fb.classList.remove('live');
  };
  free.append(fb, out);
  if (!SP.recogSupported()) free.append(h('p', { class: 'hint' }, 'Tip: on iPhone, add a Cantonese keyboard (Settings → General → Keyboard) and use its microphone key in any app to test yourself the same way.'));
  v.append(free);
}

function judge(pts, t) {
  if (pts.length < 5) return 'I could not hear a clear voiced sound. Try saying the syllable a little longer and louder.';
  const n = pts.length, a = avg(pts.slice(0, Math.ceil(n / 3)).map((p) => p.c)), b = avg(pts.slice(-Math.ceil(n / 3)).map((p) => p.c));
  const slope = b - a, height = avg(pts.map((p) => p.c));
  const calibrated = !!setting('pitchHigh');
  const shape = slope > 0.7 ? 'rising' : slope < -0.6 ? 'falling' : 'level';
  const want = { 1: 'level', 2: 'rising', 3: 'level', 4: 'falling', 5: 'rising', 6: 'level' }[t];
  let msg = `Your pitch was ${shape}${calibrated ? `, around height ${height.toFixed(1)}` : ''}. Tone ${t} should be ${TONES[t].name}.`;
  if (shape !== want) msg += want === 'level' ? ' Keep it flatter.' : want === 'rising' ? ' Let it rise more at the end.' : ' Let it drop at the end.';
  else if (calibrated) {
    const target = { 1: 5, 2: 3.5, 3: 3, 4: 1.5, 5: 2.5, 6: 2 }[t];
    if (Math.abs(height - target) > 0.9) msg += height > target ? ' Shape is right — start a bit lower.' : ' Shape is right — start a bit higher.';
    else msg += ' Shape and height look right 👏';
  } else msg += ' Shape looks right 👏 (calibrate to also check the height).';
  return msg;
}
const avg = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1);

function calibrate() {
  const c = h('div', { class: 'calib' });
  const steps = [['high', '詩', 'si1', 'Say 詩 si1 and hold it, on a comfortably HIGH flat note.'], ['low', '時', 'si4', 'Now say 時 si4, letting your voice go to its comfortable BOTTOM.']];
  let k = 0;
  const msg = h('p', {}), btn = h('button', { class: 'rec-btn', type: 'button', html: ICON.mic + '<span>Record</span>' });
  const res = {};
  function show() { msg.textContent = steps[k][3]; }
  btn.onclick = async () => {
    try {
      const r = await (await SP.startRecording({ maxMs: 1800 })).done;
      const f0s = r.track.filter((p) => p.f0 > 0).map((p) => p.f0);
      if (f0s.length < 5) { msg.textContent = 'Did not catch that — try again, a bit louder.'; return; }
      res[steps[k][0]] = SP.median(f0s);
      k++;
      if (k < steps.length) show();
      else {
        if (res.high > res.low * 1.15) { setting('pitchHigh', res.high); setting('pitchLow', res.low); msg.textContent = `Saved: your range is about ${Math.round(res.low)}–${Math.round(res.high)} Hz.`; }
        else msg.textContent = 'The high and low notes were too close. Exaggerate the difference and try again.';
        btn.remove();
      }
    } catch (e) { msg.textContent = 'Microphone not available.'; }
  };
  show();
  c.append(msg, h('div', { class: 'row' }, speakerBtn('詩', 'sm'), speakerBtn('時', 'sm')), btn);
  sheet(c, { title: 'Calibrate voice range' });
}

// ------------------------------------------------------------------ ME
export function renderMe() {
  const v = view(); v.innerHTML = '';
  const st = S();
  const words = learnedWords().length, phr = learnedSentences().length;
  const lessons = Object.keys(st.lessons).length, totalLessons = UNITS.reduce((a, u) => a + u.lessons.length, 0);
  const days = Object.values(st.days);
  const answers = days.reduce((a, d) => a + d.answers, 0), correct = days.reduce((a, d) => a + d.correct, 0);
  const mins = Math.round(days.reduce((a, d) => a + d.secs, 0) / 60);
  const level = levelFor(st.xp);
  v.append(h('header', { class: 'page-head' }, h('h1', {}, 'Progress')));
  v.append(h('section', { class: 'level-card' },
    h('div', { class: 'lv-badge' }, h('b', {}, String(level.n)), h('small', {}, 'level')),
    h('div', { class: 'lv-info' }, h('b', {}, level.name), h('div', { class: 'goalbar' }, h('i', { style: { width: `${level.pct * 100}%` } })), h('small', {}, `${st.xp} XP · ${level.toNext} XP to level ${level.n + 1}`))));
  v.append(h('div', { class: 'stat-grid' },
    sg(words, 'words learned'), sg(phr, 'phrases'), sg(`${lessons}/${totalLessons}`, 'lessons'), sg(`🔥 ${streakAlive()}`, `streak (best ${st.streak.best})`),
    sg(answers ? `${Math.round((correct / answers) * 100)}%` : '–', 'accuracy'), sg(`${mins} min`, 'practised'), sg(st.streak.freezes, 'streak freezes'), sg(dueKeys().length, 'due now')));
  v.append(h('h2', { class: 'sec' }, 'Last 12 weeks'), heatmap(st.days));
  v.append(h('h2', { class: 'sec' }, 'Course'), h('div', { class: 'unit-bars' }, ...UNITS.map((u) => {
    const p = unitProgress(u);
    return h('div', { class: 'ub' }, h('span', {}, `${u.emoji} ${u.title}`), h('div', { class: `goalbar l${u.level}` }, h('i', { style: { width: `${p.pct * 100}%` } })));
  })));

  // settings
  const set = h('section', { class: 'settings' }, h('h2', { class: 'sec' }, 'Settings'));
  const goalSel = h('select', { 'aria-label': 'Daily goal' }, ...[[15, 'Relaxed · 15 XP (~3 min)'], [30, 'Regular · 30 XP (~5 min)'], [50, 'Serious · 50 XP (~10 min)'], [80, 'Intense · 80 XP (~15 min)']].map(([x, l]) => h('option', { value: x, selected: st.goal === x }, l)));
  goalSel.onchange = () => { st.goal = +goalSel.value; save(); };
  const rate = h('input', { type: 'range', min: 0.5, max: 1.2, step: 0.05, value: setting('rate'), 'aria-label': 'Speech speed' });
  const rateVal = h('span', {}, `${Math.round(setting('rate') * 100)}%`);
  rate.oninput = () => { setting('rate', +rate.value); rateVal.textContent = `${Math.round(rate.value * 100)}%`; };
  rate.onchange = () => speak('你好，我講緊廣東話。');
  const voiceSel = h('select', { 'aria-label': 'Voice' }, h('option', { value: '' }, 'Best available'), ...cantoVoices().map((vv) => h('option', { value: vv.voiceURI, selected: setting('voice') === vv.voiceURI }, `${vv.name} (${vv.lang})`)));
  voiceSel.onchange = () => { setting('voice', voiceSel.value); speak('你好'); };
  const tog = (k, label, on = (x) => x, off) => h('label', { class: 'switch' }, h('input', { type: 'checkbox', checked: on(setting(k)), onchange: (e) => setting(k, off ? (e.target.checked ? off[0] : off[1]) : e.target.checked) }), h('span', {}, label));
  set.append(...[
    field('Daily goal', goalSel),
    field('Speech speed', h('div', { class: 'row' }, rate, rateVal)),
    field('Voice', voiceSel),
    tog('showJp', 'Show Jyutping during exercises (off = tap to reveal)', (x) => x !== 'tap', ['always', 'tap']),
    tog('showFr', 'Show French meanings'),
    tog('autoplay', 'Play audio automatically'),
    tog('sfx', 'Sound effects'),
    setting('speakOffUntil') > Date.now() ? h('button', { class: 'link', type: 'button', onclick: () => { setting('speakOffUntil', 0); renderMe(); } }, 'Turn speaking exercises back on') : null].filter(Boolean));
  v.append(set);

  const backup = h('section', { class: 'settings' }, h('h2', { class: 'sec' }, 'Backup'),
    h('p', { class: 'hint' }, 'Progress lives only in this browser. Add the app to your home screen so it is kept safely, and export a backup now and then.'),
    h('div', { class: 'row wrap' },
      h('button', { class: 'btn sm', type: 'button', onclick: doExport }, 'Export backup'),
      h('label', { class: 'btn sm' }, 'Import backup', h('input', { type: 'file', accept: 'application/json,.json', hidden: true, onchange: doImport })),
      h('button', { class: 'btn sm danger', type: 'button', onclick: () => { if (confirm('Erase all progress on this device? This cannot be undone.')) { resetAll(); refresh(); } } }, 'Reset progress')));
  v.append(backup);

  const timeIn = h('input', { type: 'time', value: setting('remindAt') || '08:00', 'aria-label': 'Reminder time' });
  v.append(h('section', { class: 'settings' }, h('h2', { class: 'sec' }, 'Daily reminder'),
    h('p', { class: 'hint' }, 'Adds a repeating 5-minute event to your phone calendar with a link back to the app.'),
    h('div', { class: 'row' }, timeIn, h('button', { class: 'btn sm', type: 'button', onclick: () => { setting('remindAt', timeIn.value); downloadICS(timeIn.value); } }, 'Add to calendar'))));
  v.append(h('p', { class: 'credits' }, 'Jyutping checked against the rime-cantonese lexicon (CanCLID, CC BY 4.0). Audio: your device’s Cantonese voice.'));
}
function field(label, ctl) { return h('label', { class: 'field' }, h('span', {}, label), ctl); }
function sg(v, l) { return h('div', { class: 'sg' }, h('b', {}, String(v)), h('span', {}, l)); }
function heatmap(days) {
  const wrap = h('div', { class: 'heat', role: 'img', 'aria-label': 'Practice calendar' });
  const end = new Date(); const start = new Date(end); start.setDate(end.getDate() - 83 - ((end.getDay() + 6) % 7 === 6 ? 0 : 0));
  for (let i = 0; i < 84; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    const x = (days[todayStr(d)] || {}).xp || 0;
    const lvl = x === 0 ? 0 : x < 15 ? 1 : x < 30 ? 2 : x < 60 ? 3 : 4;
    wrap.append(h('i', { class: `h${lvl}`, title: `${todayStr(d)}: ${x} XP` }));
  }
  return wrap;
}
const LV_NAMES = ['Tourist', 'Newcomer', 'Yum cha regular', 'Minibus rider', 'Market haggler', 'Cha chaan teng regular', 'Local', 'Smooth talker', 'Storyteller', 'Fluent friend'];
function levelFor(xp) {
  let n = 1, need = 60, acc = 0;
  while (xp >= acc + need) { acc += need; n++; need = Math.round(need * 1.35); }
  return { n, name: LV_NAMES[Math.min(n - 1, LV_NAMES.length - 1)], pct: (xp - acc) / need, toNext: acc + need - xp };
}

function doExport() {
  const blob = new Blob([exportJSON()], { type: 'application/json' });
  const a = h('a', { href: URL.createObjectURL(blob), download: `sik-gong-backup-${todayStr()}.json` });
  document.body.append(a); a.click(); a.remove();
}
function doImport(e) {
  const f = e.target.files[0]; if (!f) return;
  f.text().then((t) => { try { importJSON(t); alert('Backup restored.'); refresh(); } catch (err) { alert(err.message); } });
}

function downloadICS(hhmm) {
  const [H, M] = hhmm.split(':').map(Number);
  const d = new Date(); d.setHours(H, M, 0, 0); if (d < new Date()) d.setDate(d.getDate() + 1);
  const z = (n) => String(n).padStart(2, '0');
  const local = (x) => `${x.getFullYear()}${z(x.getMonth() + 1)}${z(x.getDate())}T${z(x.getHours())}${z(x.getMinutes())}00`;
  const end = new Date(d.getTime() + 5 * 60e3);
  const url = location.href.split('#')[0];
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Sik Gong//EN', 'BEGIN:VEVENT',
    `UID:sikgong-daily-${Date.now()}@lgeoff.github.io`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
    `DTSTART:${local(d)}`, `DTEND:${local(end)}`, 'RRULE:FREQ=DAILY', 'SUMMARY:識講 Cantonese · 5 minutes',
    `DESCRIPTION:Keep the streak going: ${url}`, `URL:${url}`,
    'BEGIN:VALARM', 'TRIGGER:PT0M', 'ACTION:DISPLAY', 'DESCRIPTION:Cantonese time', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  const a = h('a', { href: URL.createObjectURL(new Blob([ics], { type: 'text/calendar' })), download: 'cantonese-reminder.ics' });
  document.body.append(a); a.click(); a.remove();
}
