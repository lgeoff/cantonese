// Progress kept in localStorage, plus spaced-repetition scheduling.
import { todayStr, dayDiff } from './util.js';

const KEY = 'gongdak.v1';
const MIN = 60e3, DAY = 864e5;

const DEFAULTS = () => ({
  version: 1,
  created: Date.now(),
  xp: 0,
  goal: 30,
  streak: { count: 0, last: null, best: 0, freezes: 1 },
  days: {},            // 'YYYY-MM-DD' -> { xp, answers, correct, secs }
  items: {},           // key -> srs card
  lessons: {},         // 'u03:2' -> { done: n, best: accuracy }
  settings: { rate: 0.85, showJp: 'always', showFr: true, voice: '', autoplay: true, sfx: true, pitchLow: 0, pitchHigh: 0 },
  stars: [],           // starred item keys
});

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      const d = DEFAULTS();
      return { ...d, ...s, settings: { ...d.settings, ...(s.settings || {}) }, streak: { ...d.streak, ...(s.streak || {}) } };
    }
  } catch (e) { console.warn('progress load failed', e); }
  return DEFAULTS();
}

let saveTimer = null;
export function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (e) { console.warn('progress save failed', e); }
  }, 50);
}
export const S = () => state;

// ---------- spaced repetition (SM-2 style with learning steps) ----------
// card: { due, ivl (days), ease, reps, lapses, seen, ok, bad, first }
export function card(key) { return state.items[key]; }

export function introduce(key) {
  if (!state.items[key]) {
    state.items[key] = { due: Date.now() + 10 * MIN, ivl: 0, ease: 2.4, reps: 0, lapses: 0, seen: 0, ok: 0, bad: 0, first: Date.now() };
    save();
  }
  return state.items[key];
}

// grade: 0 = wrong, 1 = hard (right after a mistake), 2 = good, 3 = easy
export function grade(key, g) {
  const c = introduce(key);
  const now = Date.now();
  c.seen++;
  if (g === 0) {
    c.bad++; c.lapses += c.reps > 1 ? 1 : 0;
    c.reps = 0; c.ivl = 0;
    c.ease = Math.max(1.3, c.ease - 0.2);
    c.due = now + 5 * MIN;
  } else {
    c.ok++;
    // only count a step when the card was actually due (avoid inflating in one session)
    const wasDue = c.due <= now + 2 * MIN;
    if (wasDue || c.reps === 0) {
      c.reps++;
      if (c.reps === 1) c.ivl = g === 3 ? 1 : 0.5;
      else if (c.reps === 2) c.ivl = g === 3 ? 4 : 2;
      else c.ivl = Math.min(365, c.ivl * (g === 1 ? 1.2 : c.ease * (g === 3 ? 1.3 : 1)));
      if (g === 1) c.ease = Math.max(1.3, c.ease - 0.1);
      if (g === 3) c.ease = Math.min(3.2, c.ease + 0.05);
      const fuzz = 1 + (Math.random() * 0.1 - 0.05);
      c.due = now + c.ivl * DAY * fuzz;
    }
  }
  save();
  return c;
}

// 0..5 strength used for visuals
export function strength(key) {
  const c = state.items[key];
  if (!c) return 0;
  const decay = c.due < Date.now() ? 1 : 0;
  const s = c.ivl >= 30 ? 5 : c.ivl >= 10 ? 4 : c.ivl >= 3 ? 3 : c.ivl >= 1 ? 2 : 1;
  return Math.max(1, s - decay);
}

export function dueKeys(now = Date.now()) {
  return Object.entries(state.items).filter(([, c]) => c.due <= now).sort((a, b) => a[1].due - b[1].due).map(([k]) => k);
}

// ---------- XP, streak, daily stats ----------
export function addXP(n) {
  const t = todayStr();
  const d = state.days[t] || (state.days[t] = { xp: 0, answers: 0, correct: 0, secs: 0 });
  d.xp += n; state.xp += n;
  touchStreak();
  save();
}
export function logAnswer(ok) {
  const t = todayStr();
  const d = state.days[t] || (state.days[t] = { xp: 0, answers: 0, correct: 0, secs: 0 });
  d.answers++; if (ok) d.correct++;
  save();
}
export function logTime(secs) {
  const t = todayStr();
  const d = state.days[t] || (state.days[t] = { xp: 0, answers: 0, correct: 0, secs: 0 });
  d.secs += secs; save();
}
function touchStreak() {
  const t = todayStr(), st = state.streak;
  if (st.last === t) return;
  if (!st.last) st.count = 1;
  else {
    const gap = dayDiff(st.last, t);
    if (gap === 1) st.count++;
    else if (gap === 2 && st.freezes > 0) { st.freezes--; st.count++; }
    else st.count = 1;
  }
  st.last = t;
  st.best = Math.max(st.best, st.count);
  // earn a streak freeze every 7 days (max 2)
  if (st.count % 7 === 0) st.freezes = Math.min(2, st.freezes + 1);
}
export function streakAlive() {
  const st = state.streak;
  if (!st.last) return 0;
  const gap = dayDiff(st.last, todayStr());
  return gap <= 1 || (gap === 2 && st.freezes > 0) ? st.count : 0;
}
export const todayXP = () => (state.days[todayStr()] || {}).xp || 0;

export function lessonDone(id, acc) {
  const l = state.lessons[id] || (state.lessons[id] = { done: 0, best: 0 });
  l.done++; l.best = Math.max(l.best, acc); l.last = Date.now();
  save();
}
export const lessonState = (id) => state.lessons[id];

export function toggleStar(key) {
  const i = state.stars.indexOf(key);
  if (i >= 0) state.stars.splice(i, 1); else state.stars.push(key);
  save();
  return i < 0;
}

export function setting(k, v) {
  if (v === undefined) return state.settings[k];
  state.settings[k] = v; save();
}

export function exportJSON() { return JSON.stringify(state); }
export function importJSON(txt) {
  const s = JSON.parse(txt);
  if (!s || typeof s !== 'object' || !s.items) throw new Error('This file is not a Gong Dak backup.');
  localStorage.setItem(KEY, JSON.stringify(s));
  state = load();
}
export function resetAll() { localStorage.removeItem(KEY); state = DEFAULTS(); }
