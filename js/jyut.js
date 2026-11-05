// Jyutping helpers for free text: check/fix readings from an AI, romanise learner input,
// and compare two utterances by sound so typos, homophones and informal spellings are forgiven.
// Character readings come from rime-cantonese (CC BY 4.0), loaded only when needed.
import { ITEMS } from './course.js';

let CHARS = null, WORDS = null, ONE = null, maxLen = 1;
export async function loadJyut() {
  if (CHARS) return;
  const r = await fetch('data/jyutping.json');
  const data = await r.json();
  CHARS = data.c;
  WORDS = new Map(); ONE = new Map();
  // dictionary words whose reading differs from the characters' usual readings (銀行 ngan4 hong4)
  for (const [w, jp] of Object.entries(data.w || {})) { WORDS.set(w, jp.split(' ')); maxLen = Math.max(maxLen, [...w].length); }
  for (const it of ITEMS.values()) {
    if (it.kind !== 'w' || !it.hk || !it.jp) continue;
    const syl = it.jp.split(/\s+/);
    if ([...it.hk].length !== syl.length) continue;
    if (syl.length === 1) { if (!ONE.has(it.hk)) ONE.set(it.hk, syl[0]); continue; }
    WORDS.set(it.hk, syl); // course readings win (colloquial tone changes)
    maxLen = Math.max(maxLen, [...it.hk].length);
  }
}
export const jyutReady = () => !!CHARS;

const isHan = (c) => /\p{Script=Han}/u.test(c);
const base = (s) => s.replace(/[1-6]$/, '');

// Best-guess syllables for a run of Chinese text: course words first (longest match), then the
// most common reading of each character.
export function guessJp(hk) { return guessDetail(hk).map((x) => x.s); }
function guessDetail(hk) {
  const cs = [...hk], out = [];
  for (let i = 0; i < cs.length;) {
    if (!isHan(cs[i])) { i++; continue; }
    let done = false;
    for (let n = Math.min(maxLen, cs.length - i); n > 1; n--) {
      const w = cs.slice(i, i + n).join('');
      if (WORDS && WORDS.has(w)) { out.push(...WORDS.get(w).map((s) => ({ s, word: true }))); i += n; done = true; break; }
    }
    if (done) continue;
    const r = CHARS && CHARS[cs[i]];
    // a character taught on its own in the course keeps the course reading (錢 cin2, 好 hou2)
    out.push({ s: (ONE && ONE.get(cs[i])) || (r ? r.split(' ')[0] : '?'), word: false, course: !!(ONE && ONE.has(cs[i])) });
    i++;
  }
  return out;
}

// Keep the AI's Jyutping where it is a valid reading of each character (tone changes to 1/2 are
// allowed: 錢 cin2, 名 meng2); otherwise rebuild it from the dictionary.
export function fixJp(hk, jp) {
  const han = [...(hk || '')].filter(isHan);
  const syl = (jp || '').toLowerCase().replace(/[^a-z1-6\s]/g, ' ').split(/\s+/).filter((s) => /^[a-z]+[1-6]$/.test(s));
  if (!CHARS) return syl.join(' ');
  const guess = guessDetail(hk);
  if (syl.length !== han.length) return guess.map((x) => x.s).join(' ');
  return han.map((c, i) => {
    const s = syl[i], g = guess[i], reads = (CHARS[c] || '').split(' ').filter(Boolean);
    if (!g || s === g.s) return s;
    // inside a known word, the dictionary reading wins unless the AI only changed the tone to 1/2
    if (g.word) return base(g.s) === base(s) && /[12]$/.test(s) ? s : g.s;
    if (g.course && base(g.s) === base(s)) return g.s;
    if (!reads.length || reads.includes(s)) return s;
    if (reads.some((r) => base(r) === base(s)) && /[12]$/.test(s)) return s;
    return g.s;
  }).join(' ');
}

// ---------- sound-based comparison ----------
// Loose key: tones dropped, informal spellings folded (ch/ts→c, y→j, aa→a, oo→u, trailing h/r dropped).
export function looseKey(s) {
  let k = s.toLowerCase().replace(/[^a-z]/g, '');
  k = k.replace(/^ch|^ts/, 'c').replace(/^sh/, 's').replace(/^dz|^tz/, 'z');
  if (/^y(?!u$)/.test(k) || k === 'yu') k = 'j' + k.slice(1);
  k = k.replace(/aa/g, 'a').replace(/oo/g, 'u').replace(/ee/g, 'i').replace(/(eo|oe|eu)/g, 'o').replace(/jyu/g, 'ju');
  k = k.replace(/([aeiou])[hr]$/, '$1');
  return k;
}
const NEAR = new Set(['jz', 'zj', 'cz', 'zc', 'nl', 'ln', 'ou', 'uo', 'ae', 'ea', 'iy', 'yi', 'kg', 'gk', 'td', 'dt', 'pb', 'bp']);
function lev(a, b) {
  const m = a.length, n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...new Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) {
    const sub = a[i - 1] === b[j - 1] ? 0 : NEAR.has(a[i - 1] + b[j - 1]) ? 0.4 : 1;
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + sub);
  }
  return d[m][n];
}
function sylSim(a, b) {
  if (a === b) return 1;
  // dropped ng- (我 ngo → o) and n→l are everyday sounds, not mistakes
  const x = a.replace(/^ng/, ''), y = b.replace(/^ng/, '');
  if (x === y) return 0.95;
  return Math.max(0, 1 - lev(x, y) / Math.max(x.length, y.length, 1));
}

// Turn anything the learner typed or said into syllables: Chinese characters, Jyutping with or
// without tones, or informal romanisation ("ngo seung yiu nai cha", "lo gan yu").
export function toSyllables(text) {
  const out = [];
  for (const part of (text || '').split(/(\p{Script=Han}+)/u)) {
    if (!part) continue;
    if (isHan(part[0])) out.push(...guessJp(part).map((s) => ({ s, tone: +s.slice(-1) })));
    else for (const tok of part.toLowerCase().split(/[^a-z1-6]+/)) {
      if (!tok || !/[a-z]/.test(tok)) continue;
      // split glued Jyutping like "ngo5soeng2" on tone digits
      for (const t of tok.split(/(?<=[1-6])/)) if (/[a-z]/.test(t)) out.push({ s: t, tone: +(t.match(/[1-6]$/) || [0])[0] });
    }
  }
  return out;
}

// Align target and attempt by sound. Returns { score 0..1, hit: [bool per target syllable], toneMiss }.
export function soundMatch(targetJp, attemptText) {
  const T = targetJp.replace(/[^a-z1-6\s]/gi, ' ').split(/\s+/).filter(Boolean).map((s) => ({ k: looseKey(s), tone: +s.slice(-1) }));
  const A = toSyllables(attemptText).map((x) => ({ k: looseKey(x.s), tone: x.tone }));
  const m = T.length, n = A.length;
  if (!m || !n) return { score: 0, hit: T.map(() => false), toneMiss: [] };
  const S = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) {
    const s = sylSim(T[i - 1].k, A[j - 1].k);
    S[i][j] = Math.max(S[i - 1][j], S[i][j - 1], S[i - 1][j - 1] + (s >= 0.6 ? s : 0));
  }
  const hit = T.map(() => false), toneMiss = [];
  for (let i = m, j = n; i > 0 && j > 0;) {
    const s = sylSim(T[i - 1].k, A[j - 1].k);
    if (s >= 0.6 && Math.abs(S[i][j] - (S[i - 1][j - 1] + s)) < 1e-9) {
      hit[i - 1] = true;
      if (A[j - 1].tone && A[j - 1].tone !== T[i - 1].tone) toneMiss.push(i - 1);
      i--; j--;
    } else if (S[i - 1][j] >= S[i][j - 1]) i--; else j--;
  }
  const score = (2 * S[m][n]) / (m + Math.max(n, 1));
  return { score: Math.min(1, score), hit, toneMiss };
}
