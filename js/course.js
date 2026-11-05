// Loads the course, indexes items, and builds lessons and practice sessions.
import { shuffle, sample, pick, sHK, wordTokens } from './util.js';
import { S, card, dueKeys, strength, lessonState } from './store.js';
import { hasVoice, supported as ttsSupported } from './tts.js';

export const LEVELS = [
  { n: 1, name: 'First steps', zh: '起步', jp: 'hei2 bou6', color: 'var(--l1)' },
  { n: 2, name: 'Everyday life', zh: '日常', jp: 'jat6 soeng4', color: 'var(--l2)' },
  { n: 3, name: 'Real conversations', zh: '傾偈', jp: 'king1 gai2', color: 'var(--l3)' },
  { n: 4, name: 'Advanced', zh: '進階', jp: 'zeon3 gaai1', color: 'var(--l4)' },
];

export let UNITS = [];
export const ITEMS = new Map();   // key -> { kind:'w'|'s'|'t', key, unit, hk, jp, en, fr, parts, ... }
export const UNIT = new Map();

const lessonSize = (u) => (u.level <= 1 ? 4 : 5);

export async function loadCourse() {
  const res = await fetch('data/course.json', { cache: 'no-cache' }).catch(() => fetch('data/course.json'));
  const data = await res.json();
  UNITS = data.units;
  for (const u of UNITS) {
    UNIT.set(u.id, u);
    u.wordKeys = [];
    const tones = u.special === 'tones';
    for (const w of u.words) {
      // pronunciation-drill items live under their own keys so they never clash with vocabulary
      const key = (tones ? 't:' : 'w:') + w.hk + (w.sense ? '#' + w.sense : '');
      w.key = key; w.unit = u.id; w.kind = tones ? 't' : 'w';
      if (!ITEMS.has(key)) ITEMS.set(key, w);
      u.wordKeys.push(key);
    }
    for (const t of (u.toneLesson && u.toneLesson.items) || []) {
      t.key = 't:' + t.hk; t.unit = u.id; t.kind = 't';
      if (!ITEMS.has(t.key)) ITEMS.set(t.key, t);
    }
    u.sentKeys = [];
    for (const s of u.sentences || []) {
      s.hk = sHK(s.parts); s.key = 's:' + s.hk; s.unit = u.id; s.kind = 's';
      if (!ITEMS.has(s.key)) ITEMS.set(s.key, s);
      u.sentKeys.push(s.key);
    }
    for (const w of u.words) if (w.ex) {
      const e = w.ex; e.hk = sHK(e.parts); e.unit = u.id; e.kind = 's'; e.key = 's:' + e.hk;
      if (!ITEMS.has(e.key)) ITEMS.set(e.key, e);
    }
    // dialogue lines are for listening, not for the review queue
    if (u.dialogue) for (const l of u.dialogue.lines) { l.hk = sHK(l.parts); l.unit = u.id; l.kind = 's'; l.key = null; l.dlg = true; }
    for (const g of u.grammar || []) for (const e of g.examples || []) {
      e.hk = sHK(e.parts); e.unit = u.id; e.kind = 's'; e.key = 's:' + e.hk;
      if (!ITEMS.has(e.key) && wordTokens(e.parts).length >= 3) ITEMS.set(e.key, e);
    }
    u.lessons = planLessons(u);
  }
  return UNITS;
}

// Split n items into k groups as evenly as possible.
function evenSplit(arr, size) {
  if (!arr.length) return [];
  const k = Math.max(1, Math.round(arr.length / size));
  const out = [];
  for (let i = 0; i < k; i++) out.push(arr.slice(Math.round((i * arr.length) / k), Math.round(((i + 1) * arr.length) / k)));
  return out;
}

// Split a unit into lessons: word lessons of 4–6 words, a tone mini-lesson, then the conversation.
function planLessons(u) {
  const lessons = [];
  if (u.special === 'tones') {
    const groups = [];
    for (const w of u.words) { const g = w.lesson ?? 0; (groups[g] = groups[g] || []).push(w); }
    groups.filter(Boolean).forEach((c, i) => lessons.push({
      id: `${u.id}:${i}`, unit: u.id, idx: i, kind: 'tones', title: u.lessonTitles?.[i] || `Sounds ${i + 1}`, sub: u.lessonTitles?.[i] || '',
      words: c, sentences: [], grammar: (u.grammar || []).filter((g) => (g.lesson ?? 0) === i), pairs: (u.pairs || []).filter((p) => (p.length > 2 ? p[2] : 0) === i),
    }));
    return lessons;
  }
  const chunks = evenSplit(u.words, lessonSize(u));
  const idxOf = new Map();
  chunks.forEach((c, i) => c.forEach((w) => idxOf.set(w.hk, i)));
  // each sentence goes to the first lesson where all of the unit's words it uses are taught
  const sentBy = chunks.map(() => []);
  for (const s of u.sentences || []) {
    let m = 0;
    for (const [hk] of wordTokens(s.parts)) if (idxOf.has(hk)) m = Math.max(m, idxOf.get(hk));
    sentBy[m].push(s);
  }
  // carry overflow forward so every sentence is used (max 3 per lesson), leftovers go to the last lesson
  for (let i = 0; i < sentBy.length - 1; i++) while (sentBy[i].length > 3) sentBy[i + 1].unshift(sentBy[i].pop());
  // grammar cards: anchored by "after" (a word) or "lesson", else spread evenly from lesson 2
  const gBy = chunks.map(() => []);
  (u.grammar || []).forEach((g, gi) => {
    let i;
    if (g.after && idxOf.has(g.after)) i = idxOf.get(g.after);
    else if (Number.isInteger(g.lesson)) i = Math.min(g.lesson, chunks.length - 1);
    else i = Math.min(chunks.length - 1, chunks.length > 1 ? 1 + Math.floor((gi * (chunks.length - 1)) / Math.max(1, (u.grammar || []).length)) : 0);
    gBy[i].push(g);
  });
  chunks.forEach((c, i) => lessons.push({
    id: `${u.id}:${i}`, unit: u.id, idx: i, kind: 'words',
    title: c.slice(0, 3).map((w) => w.hk).join(' · '),
    sub: [...new Set(c.map((w) => w.en.split(/[\/(;,]/)[0].trim()))].slice(0, 3).join(' · '),
    words: c, sentences: sentBy[i], grammar: gBy[i],
  }));
  // tone mini-lesson sits mid-unit, as a change of pace between word lessons
  if (u.toneLesson) lessons.splice(Math.ceil(chunks.length / 2), 0, { id: `${u.id}:t`, unit: u.id, kind: 'tones', title: u.toneLesson.title || 'Tone practice', sub: u.toneLesson.title || 'Tone practice', words: u.toneLesson.items || [], sentences: [], grammar: u.toneLesson.card ? [u.toneLesson.card] : [], pairs: u.toneLesson.pairs || [] });
  if (u.dialogue) lessons.push({ id: `${u.id}:d`, unit: u.id, kind: 'dialogue', title: u.dialogue.title, sub: u.dialogue.title, dialogue: u.dialogue });
  lessons.forEach((l, i) => { l.idx = i; });
  return lessons;
}

export const unitProgress = (u) => {
  const done = u.lessons.filter((l) => lessonState(l.id)).length;
  return { done, total: u.lessons.length, pct: done / u.lessons.length };
};
export function nextLesson() {
  for (const u of UNITS) for (const l of u.lessons) if (!lessonState(l.id)) return l;
  return null;
}
export const learnedKeys = () => Object.keys(S().items).filter((k) => ITEMS.has(k));
export const learnedWords = () => learnedKeys().filter((k) => k[0] === 'w').map((k) => ITEMS.get(k));
export const learnedSentences = () => learnedKeys().filter((k) => k[0] === 's').map((k) => ITEMS.get(k));

// ---------- distractors ----------
// Normalised meaning set, so "what" and "what (full form)" never compete as options.
export function glosses(en) {
  return new Set(String(en || '').toLowerCase().replace(/\(.*?\)/g, ' ').split(/\s*[\/;,]\s*|\s+or\s+/).map((g) => g.replace(/^(to|a|an|the)\s+/, '').trim()).filter(Boolean));
}
export const clash = (a, b) => { const A = glosses(a.en), B = glosses(b.en); for (const g of A) if (B.has(g)) return true; return a.hk === b.hk; };
function wordPool(w) {
  const u = UNIT.get(w.unit);
  const ok = (x) => x.hk !== w.hk && !clash(x, w);
  let pool = u.words.filter(ok);
  if (pool.length < 6) pool = pool.concat(learnedWords().filter(ok));
  if (pool.length < 6) pool = pool.concat([...ITEMS.values()].filter((x) => x.kind === 'w' && ok(x)).slice(0, 60));
  const out = [];
  for (const x of shuffle(pool)) if (!out.some((y) => clash(x, y))) out.push(x);
  return out;
}
// pick up to n words whose meanings are all distinct (for match rounds)
export function distinctSet(words, n = 5) {
  const out = [];
  for (const w of shuffle(words)) if (!out.some((y) => clash(w, y))) { out.push(w); if (out.length === n) break; }
  return out;
}
export const distractors = (w, n = 3) => wordPool(w).slice(0, n);
export function distractorTokens(s, n = 2) {
  const have = new Set(wordTokens(s.parts).map((p) => p[0]));
  const u = UNIT.get(s.unit) || UNITS[0];
  const pool = u.words.filter((w) => !have.has(w.hk) && w.hk.length <= 3).map((w) => [w.hk, w.jp]);
  return sample(pool, n);
}

// ---------- step builders ----------
const wordEx = (w, type) => ({ type, key: w.key, item: w });
const sentEx = (s, type) => ({ type, key: s.key, item: s });

export function buildLesson(lesson, { replay = false } = {}) {
  const u = UNIT.get(lesson.unit);
  if (lesson.kind === 'dialogue') {
    const d = lesson.dialogue;
    const lines = sample(d.lines.filter((l) => wordTokens(l.parts).length >= 3 && wordTokens(l.parts).length <= 9), 2);
    return [{ type: 'dialogue', item: d, level: u.level },
      ...(d.questions || []).map((q) => ({ type: 'dq', item: q, dialogue: d })),
      ...lines.map((l, i) => ({ type: i === 0 ? 'tiles' : 'dictation', item: l, key: null })),
      ...lines.map((l) => ({ type: 'speak', item: l, key: null }))];
  }
  if (lesson.kind === 'tones') return buildToneLesson(lesson, replay);
  const W = lesson.words, steps = [];
  if (!replay && Object.keys(S().items).length === 0) steps.push({ type: 'jpIntro' }, { type: 'toneChart' });
  // 1. warm-up: two earlier items that are due or weak
  const warm = warmUp(2, new Set(W.map((w) => w.key)));
  steps.push(...warm);
  // 2. teach in pairs with an immediate (ungraded) check
  for (let i = 0; i < W.length; i += 2) {
    const pair = W.slice(i, i + 2);
    if (!replay) pair.forEach((w) => steps.push({ type: 'teach', key: w.key, item: w }));
    pair.forEach((w, j) => steps.push({ ...wordEx(w, j % 2 ? 'seePick' : 'listenPick'), noGrade: !replay }));
  }
  // 3. match
  if (W.length >= 4) { const m = distinctSet(W, 5); if (m.length >= 4) steps.push({ type: 'match', items: m, noGrade: !replay }); }
  // 4. grammar card after the words, then build one of its examples
  for (const g of lesson.grammar || []) {
    if (!replay) steps.push({ type: 'grammar', item: g });
    const ex = (g.examples || []).find((e) => wordTokens(e.parts).length >= 3);
    if (ex) steps.push({ type: 'tiles', item: ex, key: ITEMS.has(ex.key) ? ex.key : null });
  }
  // 5. delayed, graded recall for every new word (oldest first)
  W.forEach((w) => steps.push(wordEx(w, 'enPick')));
  // 6. one tone check (does not touch the meaning card)
  sample(W.filter((w) => w.jp.split(' ').length <= 3), 1).forEach((w) => steps.push({ ...wordEx(w, 'tone'), noGrade: true }));
  // 7. sentences, easiest first: tiles → gap → tiles → dictation
  const sents = [...lesson.sentences, ...shuffle(W.filter((w) => w.ex).map((w) => w.ex))].filter((s, i, a) => a.findIndex((x) => x.hk === s.hk) === i).slice(0, 4);
  const early = u.level <= 1 && lesson.idx < 2;
  const kinds = early ? ['tiles', 'gap', 'tiles', 'gap'] : ['tiles', 'gap', 'tiles', 'dictation'];
  sents.forEach((s, i) => steps.push({ ...sentEx(s, kinds[i]), key: i < 3 ? s.key : null }));
  // 8. say the sentence you just built
  if (sents.length) steps.push({ type: 'speak', item: sents[0], key: null });
  return steps;
}

function warmUp(n, exclude) {
  const keys = [...dueKeys(), ...learnedKeys().filter((k) => card(k) && strength(k) <= 2)].filter((k, i, a) => a.indexOf(k) === i && !exclude.has(k) && k[0] === 'w');
  return shuffle(keys.slice(0, 8)).slice(0, n).map((k) => wordEx(ITEMS.get(k), pick(['listenPick', 'enPick'])));
}

function buildToneLesson(lesson, replay) {
  const W = lesson.words, steps = [];
  if (lesson.idx === 0 && lesson.unit === 'u02' && !replay) steps.push({ type: 'toneChart' });
  for (const g of lesson.grammar || []) if (!replay) steps.push({ type: 'grammar', item: g });
  // hear each item first, then discriminate (same/different pairs), then name the tone, then say it
  if (!replay) W.forEach((w) => steps.push({ type: 'teach', key: w.key, item: w }));
  (lesson.pairs && lesson.pairs.length ? lesson.pairs : []).forEach((p) => steps.push({ type: 'pair', item: p.slice(0, 2) }));
  shuffle(W).forEach((w) => steps.push(wordEx(w, 'tone')));
  steps.push({ type: 'speak', item: W[0], key: null });
  return steps;
}

// A review/practice session from the SRS queue.
export function buildReview(limit = 12, { mode = 'mixed', onlyKeys = null } = {}) {
  let keys = onlyKeys ? shuffle(onlyKeys.filter((k) => ITEMS.has(k))).slice(0, limit) : dueKeys();
  if (!onlyKeys && keys.length < limit) {
    const weak = learnedKeys().filter((k) => !keys.includes(k)).sort((a, b) => strength(a) - strength(b) || card(a).due - card(b).due);
    keys = keys.concat(weak.slice(0, limit - keys.length));
  }
  keys = keys.slice(0, limit);
  const steps = [];
  for (const k of keys) {
    const it = ITEMS.get(k); if (!it) continue;
    const c = card(k), mature = c && c.reps >= 2;
    if (it.kind === 't') { steps.push(wordEx(it, 'tone')); continue; }
    if (c && c.lapses >= 6 && it.kind === 'w') steps.push({ type: 'teach', key: it.key, item: it, leech: true });
    if (it.kind === 'w') {
      const types = mode === 'listen' ? ['listenPick'] : mode === 'tones' ? ['tone'] : mature ? ['enPick', 'listenPick', 'tone', 'enPick'] : ['listenPick', 'seePick'];
      steps.push(wordEx(it, pick(types)));
    } else {
      const types = mode === 'listen' ? ['dictation'] : mature ? ['dictation', 'gap', 'tiles'] : ['tiles', 'gap'];
      steps.push(sentEx(it, pick(types)));
    }
  }
  const ws = keys.map((k) => ITEMS.get(k)).filter((x) => x && x.kind === 'w');
  if (mode === 'mixed' && ws.length >= 5) { const m = distinctSet(ws, 5); if (m.length >= 4) steps.splice(Math.min(4, steps.length), 0, { type: 'match', items: m }); }
  return shuffleSoft(steps);
}
function shuffleSoft(steps) { return shuffle(steps); }

export function buildDrill(mode, n = 10) {
  if (mode === 'numbers') return buildNumbers(n);
  const ws = learnedWords(), ss = learnedSentences();
  const steps = [];
  if (mode === 'listen') {
    sample(ws, Math.ceil(n * 0.6)).forEach((w) => steps.push(wordEx(w, 'listenPick')));
    sample(ss, Math.floor(n * 0.4)).forEach((s) => steps.push(sentEx(s, 'dictation')));
  } else if (mode === 'tones') {
    const toneItems = learnedKeys().filter((k) => k[0] === 't').map((k) => ITEMS.get(k));
    let pool = [...toneItems, ...ws].filter((w) => w.jp.split(' ').length <= 3);
    if (pool.length < 6) pool = pool.concat(UNIT.get('u02').words);
    sample(pool, n).forEach((w) => steps.push({ ...wordEx(w, 'tone'), noGrade: w.kind !== 't' }));
    const allPairs = UNITS.flatMap((u) => [...(u.pairs || []), ...((u.toneLesson && u.toneLesson.pairs) || [])]);
    sample(allPairs, 2).forEach((p) => steps.push({ type: 'pair', item: p.slice(0, 2) }));
  } else if (mode === 'build') {
    sample(ss, n).forEach((s, i) => steps.push(sentEx(s, i % 2 ? 'gap' : 'tiles')));
  } else if (mode === 'match') {
    for (let i = 0; i < 4; i++) steps.push({ type: 'match', items: distinctSet(ws, 5), timed: true });
  } else if (mode === 'speak') {
    sample([...ss, ...ws], n).forEach((it) => steps.push({ type: 'speak', item: it, key: null }));
  }
  return shuffle(steps.filter((s) => s.item || s.items));
}

// ---------- audio modes ----------
// 'normal' | 'nospeak' (no speaking exercises) | 'mute' (no audio at all)
export function audioMode() {
  const m = S().settings.mode || 'normal';
  if (!(hasVoice() && ttsSupported()) && !/[?&]audio=1/.test(location.search)) return 'mute';
  return m;
}
const longEnough = (s) => s.parts && wordTokens(s.parts).length >= 3;
export function adaptSteps(steps, mode) {
  const speakOff = mode !== 'normal' || (S().settings.speakOffUntil || 0) > Date.now();
  const out = [];
  for (const st of steps) {
    let t = st.type;
    if (t === 'speak' && speakOff) continue;
    if (mode === 'mute') {
      if (t === 'listenPick') t = 'seePick';
      else if (t === 'dictation') t = 'tiles';
      else if (t === 'pair' || t === 'tone') continue;
    }
    if ((t === 'tiles' || t === 'dictation') && st.item && !longEnough(st.item)) t = st.item.kind === 's' ? 'gap' : t;
    if (t === 'gap' && st.item && st.item.parts && wordTokens(st.item.parts).length < 2) continue;
    out.push(t === st.type ? st : { ...st, type: t });
  }
  return out;
}

// ---------- numbers listening drill (generated) ----------
const DIG = [['零', 'ling4'], ['一', 'jat1'], ['二', 'ji6'], ['三', 'saam1'], ['四', 'sei3'], ['五', 'ng5'], ['六', 'luk6'], ['七', 'cat1'], ['八', 'baat3'], ['九', 'gau2']];
function under100(n) {
  if (n < 10) return [DIG[n]];
  const t = Math.floor(n / 10), o = n % 10, out = [];
  if (t > 1) out.push(DIG[t]);
  out.push(['十', 'sap6']);
  if (o) out.push(DIG[o]);
  return out;
}
export function numParts(n, { counting = false } = {}) {
  // counting=true uses 兩 for a leading 2 before a unit (兩百, 兩千, 兩蚊)
  const out = [];
  const big = [[10000, '萬', 'maan6'], [1000, '千', 'cin1'], [100, '百', 'baak3']];
  let rest = n, zero = false, started = false;
  for (const [v, c, j] of big) {
    const q = Math.floor(rest / v);
    if (q) {
      if (zero) out.push(DIG[0]);
      out.push(q === 2 ? ['兩', 'loeng5'] : DIG[q]); out.push([c, j]);
      started = true; zero = false;
    } else if (started) zero = true;
    rest %= v;
  }
  if (rest) {
    if (zero || (started && rest < 10)) out.push(DIG[0]);
    if (started && rest >= 10 && rest < 20) out.push(DIG[1]);
    out.push(...under100(rest));
  } else if (!started) out.push(DIG[0]);
  if (counting && n === 2) return [['兩', 'loeng5']];
  return out;
}
const join = (ps) => ({ hk: ps.map((p) => p[0]).join(''), jp: ps.map((p) => p[1]).join(' ') });
function near(n, k) {
  const s = String(n), alts = new Set();
  if (s.length > 1) alts.add(+s.split('').reverse().join(''));
  [n + 10, n - 10, n + 1, n - 1, n * 10, Math.floor(n / 10), n + 100].forEach((x) => x > 0 && alts.add(x));
  alts.delete(n);
  return shuffle([...alts]).slice(0, k);
}
export function buildNumbers(n = 10) {
  const steps = [];
  for (let i = 0; i < n; i++) {
    const kind = pick(['price', 'price', 'time', 'phone', 'count']);
    if (kind === 'price') {
      const v = pick([pick([3, 5, 8, 12, 15, 18, 25, 35, 48, 60, 99]), 10 + Math.floor(Math.random() * 990)]);
      const ps = [...numParts(v, { counting: true }), ['蚊', 'man1']];
      steps.push({ type: 'num', item: { ...join(ps), en: `$${v}` }, opts: shuffle([`$${v}`, ...near(v, 3).map((x) => `$${x}`)]) });
    } else if (kind === 'time') {
      const hr = 1 + Math.floor(Math.random() * 12), m = pick([0, 30, 15, 45, 5, 20]);
      const hp = hr === 2 ? [['兩', 'loeng5']] : numParts(hr);
      let ps = [...hp, ['點', 'dim2']];
      if (m === 30) ps.push(['半', 'bun3']); else if (m) ps.push(...numParts(m / 5), ['個', 'go3'], ['字', 'zi6']);
      const fmt = (H, M) => `${H}:${String(M).padStart(2, '0')}`;
      const wrong = shuffle([fmt(hr, (m + 30) % 60), fmt(hr % 12 + 1, m), fmt(hr, m === 0 ? 5 : m === 15 ? 3 : m / 5), fmt(hr === 1 ? 7 : hr - 1, m)]).filter((x) => x !== fmt(hr, m)).slice(0, 3);
      steps.push({ type: 'num', item: { ...join(ps), en: fmt(hr, m) }, opts: shuffle([fmt(hr, m), ...wrong]) });
    } else if (kind === 'phone') {
      const d = Array.from({ length: 4 }, () => Math.floor(Math.random() * 10));
      const ps = d.map((x) => (x === 1 ? ['一', 'jat1'] : DIG[x]));
      const s = d.join('');
      const sw = [d.slice().reverse().join(''), d.map((x, i) => (i === 1 ? (x + 3) % 10 : x)).join(''), d.map((x, i) => (i === 2 ? (x + 7) % 10 : x)).join('')].filter((x) => x !== s);
      steps.push({ type: 'num', item: { ...join(ps), en: s }, opts: shuffle([s, ...[...new Set(sw)].slice(0, 3)]), prompt: 'Which phone digits did you hear?' });
    } else {
      const v = 11 + Math.floor(Math.random() * 89);
      const ps = [...numParts(v), ['個', 'go3'], ['人', 'jan4']];
      steps.push({ type: 'num', item: { ...join(ps), en: `${v} people` }, opts: shuffle([`${v} people`, ...near(v, 3).map((x) => `${x} people`)]) });
    }
  }
  return steps;
}

// ---------- test out of a unit ----------
export function buildTestOut(u) {
  const ws = sample(u.words.filter((w) => w.kind === 'w'), Math.min(12, u.words.length));
  return ws.map((w, i) => ({ ...wordEx(w, ['enPick', 'seePick', 'listenPick'][i % 3]), noGrade: true }));
}
