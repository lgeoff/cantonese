// Loads the course, indexes items, and builds lessons and practice sessions.
import { shuffle, sample, pick, sHK, wordTokens } from './util.js';
import { S, card, dueKeys, strength, lessonState } from './store.js';

export const LEVELS = [
  { n: 1, name: 'First steps', zh: '起步', color: 'var(--l1)' },
  { n: 2, name: 'Everyday life', zh: '日常', color: 'var(--l2)' },
  { n: 3, name: 'Real conversations', zh: '傾偈', color: 'var(--l3)' },
  { n: 4, name: 'Advanced', zh: '進階', color: 'var(--l4)' },
];

export let UNITS = [];
export const ITEMS = new Map();   // key -> { kind:'w'|'s', key, unit, hk, jp, en, fr, parts, ... }
export const UNIT = new Map();

const WORDS_PER_LESSON = 5;

export async function loadCourse() {
  const res = await fetch('data/course.json', { cache: 'no-cache' }).catch(() => fetch('data/course.json'));
  const data = await res.json();
  UNITS = data.units;
  for (const u of UNITS) {
    UNIT.set(u.id, u);
    u.wordKeys = [];
    for (const w of u.words) {
      const key = 'w:' + w.hk + (w.sense ? '#' + w.sense : '');
      w.key = key; w.unit = u.id; w.kind = 'w';
      if (!ITEMS.has(key)) ITEMS.set(key, w);
      u.wordKeys.push(key);
    }
    const sents = [...(u.sentences || [])];
    u.sentKeys = [];
    for (const s of sents) {
      s.hk = sHK(s.parts); s.key = 's:' + s.hk; s.unit = u.id; s.kind = 's';
      if (!ITEMS.has(s.key)) ITEMS.set(s.key, s);
      u.sentKeys.push(s.key);
    }
    for (const w of u.words) if (w.ex) {
      const e = w.ex; e.hk = sHK(e.parts); e.unit = u.id; e.kind = 's'; e.key = 's:' + e.hk;
      if (!ITEMS.has(e.key)) ITEMS.set(e.key, e);
    }
    if (u.dialogue) for (const l of u.dialogue.lines) {
      l.hk = sHK(l.parts); l.unit = u.id; l.kind = 's'; l.key = 's:' + l.hk; l.dlg = true;
      if (!ITEMS.has(l.key) && wordTokens(l.parts).length >= 2) ITEMS.set(l.key, l);
    }
    for (const g of u.grammar || []) for (const e of g.examples || []) e.hk = sHK(e.parts);
    u.lessons = planLessons(u);
  }
  return UNITS;
}

// Split a unit into lessons: word lessons of ~5 words, then a conversation lesson.
function planLessons(u) {
  const words = u.words;
  const chunks = [];
  for (let i = 0; i < words.length; i += WORDS_PER_LESSON) chunks.push(words.slice(i, i + WORDS_PER_LESSON));
  if (chunks.length > 1 && chunks[chunks.length - 1].length < 3) chunks[chunks.length - 2].push(...chunks.pop());
  const idxOf = new Map();
  chunks.forEach((c, i) => c.forEach((w) => idxOf.set(w.hk, i)));
  const sentBy = chunks.map(() => []);
  let rr = 0;
  for (const s of u.sentences || []) {
    let m = -1;
    for (const [hk] of wordTokens(s.parts)) if (idxOf.has(hk)) m = Math.max(m, idxOf.get(hk));
    if (m < 0) { m = rr % chunks.length; rr++; }
    sentBy[m].push(s);
  }
  const lessons = chunks.map((c, i) => ({
    id: `${u.id}:${i}`, unit: u.id, idx: i, kind: 'words',
    title: u.special === 'tones' ? toneLessonTitle(c) : `${c.slice(0, 3).map((w) => w.hk).join(' · ')}`,
    words: c, sentences: sentBy[i],
    grammar: (u.grammar || []).filter((_, gi) => Math.min(gi + (chunks.length > 1 ? 1 : 0), chunks.length - 1) === i),
  }));
  if (u.dialogue) lessons.push({ id: `${u.id}:${lessons.length}`, unit: u.id, idx: lessons.length, kind: 'dialogue', title: u.dialogue.title, dialogue: u.dialogue });
  return lessons;
}
function toneLessonTitle(c) {
  const set = c[0].set;
  return { si: 'The six tones', fu: 'Tone sets', ji: 'Tone sets', stop: 'Short -p -t -k syllables', vowel: 'Tricky sounds' }[set] || 'Sounds';
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
function wordPool(w) {
  const u = UNIT.get(w.unit);
  let pool = u.words.filter((x) => x.hk !== w.hk && x.en !== w.en);
  if (pool.length < 6) pool = pool.concat(learnedWords().filter((x) => x.hk !== w.hk && x.en !== w.en));
  if (pool.length < 6) pool = pool.concat([...ITEMS.values()].filter((x) => x.kind === 'w' && x.hk !== w.hk && x.en !== w.en).slice(0, 60));
  const seen = new Set(); return pool.filter((x) => !seen.has(x.en) && seen.add(x.en));
}
export const distractors = (w, n = 3) => sample(wordPool(w), n);
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
    const lines = sample(d.lines.filter((l) => ITEMS.has(l.key) && wordTokens(l.parts).length >= 3 && wordTokens(l.parts).length <= 9), 3);
    return [{ type: 'dialogue', item: d },
      ...(d.questions || []).map((q) => ({ type: 'dq', item: q, dialogue: d })),
      ...lines.map((l, i) => sentEx(l, i === 1 ? 'dictation' : 'tiles')),
      ...(lines[0] ? [{ type: 'speak', item: lines[0], key: null }] : [])];
  }
  const W = lesson.words, steps = [];
  if (u.special === 'tones') return buildToneLesson(lesson, replay);
  for (const g of lesson.grammar || []) if (!replay) steps.push({ type: 'grammar', item: g });
  for (let i = 0; i < W.length; i += 2) {
    const pair = W.slice(i, i + 2);
    if (!replay) pair.forEach((w) => steps.push({ type: 'teach', key: w.key, item: w }));
    pair.forEach((w, j) => steps.push(wordEx(w, (i + j) % 2 ? 'seePick' : 'listenPick')));
  }
  if (W.length >= 4) steps.push({ type: 'match', items: W.slice(0, 5) });
  sample(W, 2).forEach((w) => steps.push(wordEx(w, 'enPick')));
  sample(W.filter((w) => w.jp.split(' ').length <= 3), 1).forEach((w) => steps.push(wordEx(w, 'tone')));
  const sents = [...lesson.sentences, ...shuffle(W.filter((w) => w.ex).map((w) => w.ex))].slice(0, 4);
  sents.slice(0, 4).forEach((s, i) => steps.push(sentEx(s, i % 3 === 1 ? 'dictation' : i % 3 === 2 ? 'gap' : 'tiles')));
  if (sents.length) steps.push({ type: 'speak', item: sents[0], key: null });
  return steps;
}

function buildToneLesson(lesson, replay) {
  const W = lesson.words, steps = [];
  for (const g of lesson.grammar || []) if (!replay) steps.push({ type: 'grammar', item: g });
  if (lesson.idx === 0 && !replay) steps.push({ type: 'toneChart' });
  if (!replay) W.forEach((w) => steps.push({ type: 'teach', key: w.key, item: w }));
  shuffle(W).forEach((w) => steps.push(wordEx(w, 'tone')));
  shuffle(W).slice(0, 4).forEach((w) => steps.push(wordEx(w, 'listenPick')));
  const u = UNIT.get(lesson.unit);
  const pairs = (u.pairs || []).filter(([a, b]) => W.some((w) => w.hk === a || w.hk === b));
  (pairs.length ? pairs : sample(u.pairs || [], 2)).forEach((p) => steps.push({ type: 'pair', item: p }));
  steps.push({ type: 'speak', item: W[0], key: null });
  return steps;
}

// A review/practice session from the SRS queue.
export function buildReview(limit = 12, { mode = 'mixed' } = {}) {
  let keys = dueKeys();
  if (keys.length < limit) {
    const weak = learnedKeys().filter((k) => !keys.includes(k)).sort((a, b) => strength(a) - strength(b) || card(a).due - card(b).due);
    keys = keys.concat(weak.slice(0, limit - keys.length));
  }
  keys = keys.slice(0, limit);
  const steps = [];
  for (const k of keys) {
    const it = ITEMS.get(k); if (!it) continue;
    const c = card(k), mature = c && c.reps >= 2;
    if (it.kind === 'w') {
      const types = mode === 'listen' ? ['listenPick'] : mode === 'tones' ? ['tone'] : mature ? ['enPick', 'listenPick', 'tone', 'enPick'] : ['listenPick', 'seePick'];
      steps.push(wordEx(it, pick(types)));
    } else {
      const types = mode === 'listen' ? ['dictation'] : mature ? ['dictation', 'gap', 'tiles'] : ['tiles', 'gap'];
      steps.push(sentEx(it, pick(types)));
    }
  }
  const ws = keys.map((k) => ITEMS.get(k)).filter((x) => x && x.kind === 'w');
  if (mode === 'mixed' && ws.length >= 5) steps.splice(Math.min(4, steps.length), 0, { type: 'match', items: sample(ws, 5) });
  return shuffleSoft(steps);
}
function shuffleSoft(steps) { return shuffle(steps); }

export function buildDrill(mode, n = 10) {
  const ws = learnedWords(), ss = learnedSentences();
  const steps = [];
  if (mode === 'listen') {
    sample(ws, Math.ceil(n * 0.6)).forEach((w) => steps.push(wordEx(w, 'listenPick')));
    sample(ss, Math.floor(n * 0.4)).forEach((s) => steps.push(sentEx(s, 'dictation')));
  } else if (mode === 'tones') {
    const pool = ws.length >= 6 ? ws : UNIT.get('u02').words;
    sample(pool.filter((w) => w.jp.split(' ').length <= 3), n).forEach((w) => steps.push(wordEx(w, 'tone')));
    sample(UNIT.get('u02').pairs, 2).forEach((p) => steps.push({ type: 'pair', item: p }));
  } else if (mode === 'build') {
    sample(ss, n).forEach((s, i) => steps.push(sentEx(s, i % 2 ? 'gap' : 'tiles')));
  } else if (mode === 'match') {
    for (let i = 0; i < 4; i++) steps.push({ type: 'match', items: sample(ws, 5), timed: true });
  } else if (mode === 'speak') {
    sample([...ss, ...ws], n).forEach((it) => steps.push({ type: 'speak', item: it, key: null }));
  }
  return shuffle(steps.filter((s) => s.item || s.items));
}
