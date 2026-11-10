// Add words learnt outside the app. The learner types what they remember (any spelling, the
// meaning, or both); course words are matched by sound and meaning, and the AI partner suggests
// the real Cantonese word when it isn't in the course. Nothing is added until the learner confirms.
import { h, R, jpNode } from './util.js';
import { ITEMS, UNIT, glosses, registerCustom } from './course.js';
import { card, introduce, addCustom } from './store.js';
import { speakerBtn, canto } from './exercises.js';
import { speak } from './tts.js';
import { loadJyut, fixJp, soundMatch } from './jyut.js';
import { aiReady, askJSON, AIError } from './llm.js';

const isHan = (s) => /\p{Script=Han}/u.test(s);
const WORD = { type: 'OBJECT', properties: { hk: { type: 'STRING' }, jp: { type: 'STRING' } }, required: ['hk', 'jp'] };
const SCHEMA = {
  type: 'OBJECT',
  properties: {
    results: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          input: { type: 'STRING' },
          candidates: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                hk: { type: 'STRING' }, jp: { type: 'STRING' }, en: { type: 'STRING' }, fr: { type: 'STRING' },
                note: { type: 'STRING' }, confidence: { type: 'NUMBER' },
                ex: { type: 'OBJECT', properties: { words: { type: 'ARRAY', items: WORD }, punct: { type: 'STRING' }, en: { type: 'STRING' } } },
              },
              required: ['hk', 'jp', 'en', 'note', 'confidence'],
              propertyOrdering: ['hk', 'jp', 'en', 'fr', 'note', 'confidence', 'ex'],
            },
          },
        },
        required: ['input', 'candidates'],
      },
    },
  },
  required: ['results'],
};
const KEYS_HINT = 'results: [{ input, candidates: [{ hk, jp, en, fr, note, confidence (0-1), ex: { words: [{hk, jp}], punct, en } }] }]';

const SYSTEM = `You are a careful Hong Kong Cantonese lexicographer helping an adult learner (they speak English and French) add words they picked up by ear outside their course.
Each numbered input line is one word or expression as they remember it: a rough phonetic spelling in any system (Jyutping, Yale, English- or French-style spelling, usually without tones and often misheard), and/or its meaning in English or French, sometimes Chinese characters.
Examples: "lo gan yu" → 落緊雨 lok6 gan2 jyu5 "it's raining"; "m goi" → 唔該 m4 goi1; "chizi" → 紙巾 zi2 gan1 "napkin, tissue" or 廁紙 ci3 zi2 "toilet paper"; "umbrella" → 遮 ze1.
For each line return up to 3 candidates, most likely first:
- hk: the word as written in everyday spoken Hong Kong Cantonese (Traditional characters, colloquial forms such as 嘢 咗 唔 冇 佢 睇 嚟), never a Mandarin or written-Chinese equivalent.
- jp: Jyutping with tone numbers, one syllable per character, separated by spaces, as people actually say it (including colloquial changed tones such as 錢 cin2).
- en and fr: short meanings.
- note: at most 20 English words: usage or register, and when the learner's spelling suggests a mishearing, which sound differs (for example: you wrote "lo"; it is lok6, with a final k). Write any Chinese in the note as 漢字 (jyutping).
- confidence: 0 to 1, how likely this is what they meant.
- ex: one short natural everyday sentence using the word, given as words (each with hk and jp) plus the final punctuation, and its English.
Give more than one candidate only when the line is genuinely ambiguous (different words that sound alike, or a meaning with several common Cantonese words); otherwise give one. If a line is too unclear to guess, return no candidates for it. Never invent words. Keep "input" exactly as the learner wrote the line.`;

// ---------- matching against the course ----------
function courseMatches(q) {
  const ql = q.toLowerCase().trim();
  const han = isHan(ql);
  const latin = ql.replace(/\p{Script=Han}+/gu, ' ').trim();
  const words = latin.split(/[^a-zà-ÿ'\-]+/).filter((x) => x.length > 1);
  const out = [];
  for (const it of ITEMS.values()) {
    if (it.kind !== 'w' || it.custom || !it.jp) continue;
    let score = 0;
    if (han && ql.includes(it.hk)) score = it.hk.length >= 2 || ql === it.hk ? 1 : 0.7;
    if (latin) {
      const g = new Set([...glosses(it.en), ...glosses(it.fr || '')]);
      if (g.has(latin)) score = Math.max(score, 0.97);
      else if (latin.length >= 4 && [...g].some((x) => x === latin || (x.length >= 4 && (x.startsWith(latin + ' ') || latin.split(/\s+/).includes(x))))) score = Math.max(score, 0.85);
      const m = soundMatch(it.jp, latin);
      const n = it.jp.split(' ').length;
      // a sound match counts only when it covers the whole word
      if (m.hit.every(Boolean) || (n >= 3 && m.hit.filter(Boolean).length >= n - 1)) score = Math.max(score, m.score);
      if (it.mine && it.mine.toLowerCase().replace(/[^a-z]/g, '') === latin.replace(/[^a-z]/g, '')) score = 1;
    }
    if (score >= 0.75) out.push({ it, score });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 3);
}

function cleanCandidate(c) {
  if (!c || !c.hk || !isHan(c.hk)) return null;
  const hk = c.hk.replace(/[，。！？、\s]/g, '');
  const out = { hk, jp: fixJp(hk, c.jp || ''), en: (c.en || '').trim(), fr: (c.fr || '').trim(), note: (c.note || '').trim(), confidence: +c.confidence || 0 };
  const ws = (c.ex && Array.isArray(c.ex.words) ? c.ex.words : []).filter((w) => w && w.hk && isHan(w.hk));
  if (ws.length >= 2) {
    const parts = ws.map((w) => [w.hk, fixJp(w.hk, w.jp || '')]);
    const p = (c.ex.punct || '。').trim();
    if (p) parts.push([p]);
    out.ex = { parts, en: (c.ex.en || '').trim() };
  }
  return out;
}

// ---------- the sheet ----------
// deps: { sheet, startReview, refresh, openAiSetup }
export function addWordsSheet({ sheet, startReview, refresh, openAiSetup }) {
  const c = h('div', { class: 'addw' });
  const ta = h('textarea', { rows: 3, class: 'addw-in', 'aria-label': 'Words to add', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false',
    placeholder: 'One per line, e.g.\nlo gan yu\nchizi\numbrella' });
  const find = h('button', { class: 'btn primary', type: 'button' }, 'Find');
  const status = h('p', { class: 'hint', role: 'status' });
  const results = h('div', { class: 'addw-res' });
  const foot = h('div', { class: 'addw-foot' });
  c.append(
    h('p', {}, 'Type each word the way you remember it: any spelling, the meaning in English or French, or both. Mistakes are fine; you’ll confirm the right word before it’s added.'),
    ta, h('div', { class: 'row wrap' }, find), status, results, foot);
  if (!aiReady()) {
    c.insertBefore(h('div', { class: 'ai-cta' },
      h('p', {}, h('small', {}, 'Without the AI partner, only words from the course can be found.')),
      h('button', { class: 'btn sm', type: 'button', onclick: () => close(false, openAiSetup) }, 'Set up AI')), ta);
  }
  const close = sheet(c, { title: 'Add words you know' });
  setTimeout(() => ta.focus(), 250);

  const picked = new Map(); // id -> candidate
  find.onclick = run;
  ta.onkeydown = (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) run(); };

  async function run() {
    const lines = ta.value.split(/\n|;/).map((x) => x.trim()).filter(Boolean).slice(0, 12);
    if (!lines.length) { status.textContent = 'Type at least one word.'; return; }
    find.disabled = true; results.innerHTML = ''; foot.innerHTML = ''; picked.clear();
    status.textContent = aiReady() ? 'Looking them up…' : 'Searching the course…';
    await loadJyut().catch(() => {});
    let ai = null, aiErr = null;
    if (aiReady()) {
      try {
        const res = await askJSON({ system: SYSTEM, history: [{ role: 'user', text: lines.map((l, i) => `${i + 1}. ${l}`).join('\n') }], schema: SCHEMA, keysHint: KEYS_HINT, temperature: 0.2 });
        ai = Array.isArray(res.results) ? res.results : [];
      } catch (e) { aiErr = e; }
    }
    status.textContent = aiErr ? `${aiErr instanceof AIError ? aiErr.message : 'The AI lookup failed.'} Showing course words only.` : '';
    lines.forEach((line, i) => {
      const fromAi = ai ? ((ai.find((r) => (r.input || '').trim() === line) || ai[i] || {}).candidates || []).map(cleanCandidate).filter(Boolean) : [];
      const fromCourse = courseMatches(line);
      // one list per line: course entries first when the AI agrees or is unavailable
      const list = [];
      for (const cm of fromCourse) list.push({ course: cm.it, hk: cm.it.hk, jp: cm.it.jp, en: cm.it.en, fr: cm.it.fr, note: cm.it.note, confidence: cm.score });
      for (const a of fromAi) {
        const inCourse = ITEMS.get('w:' + a.hk);
        const dup = list.find((x) => x.hk === a.hk);
        if (dup) { dup.confidence = Math.max(dup.confidence, a.confidence); if (!dup.course) Object.assign(dup, a); continue; }
        if (inCourse && inCourse.kind === 'w' && !inCourse.custom) list.push({ course: inCourse, hk: inCourse.hk, jp: inCourse.jp, en: inCourse.en, fr: inCourse.fr, note: a.note || inCourse.note, confidence: a.confidence });
        else list.push(a);
      }
      list.sort((a, b) => b.confidence - a.confidence);
      results.append(group(line, list.slice(0, 3), i));
    });
    find.disabled = false;
    drawFoot();
  }

  function group(line, list, gi) {
    const g = h('section', { class: 'addw-group' }, h('h3', {}, '“', line, '”'));
    if (!list.length) {
      g.append(h('p', { class: 'hint' }, aiReady() ? 'No match found. Try another spelling, or add the meaning in English.' : 'Not found in the course. Set up the AI partner to look up any word.'));
      return g;
    }
    list.forEach((cand, ci) => {
      const id = `${gi}:${ci}`;
      const known = cand.course && card(cand.course.key);
      const already = !cand.course && ITEMS.get('w:' + cand.hk);
      const btn = h('button', { class: 'addw-cand', type: 'button', 'aria-pressed': 'false' });
      const tag = known ? h('span', { class: 'tag' }, 'Already in your words')
        : cand.course ? h('span', { class: 'tag' }, `In the course · ${UNIT.get(cand.course.unit).title}`)
        : already ? h('span', { class: 'tag' }, 'Already added')
        : h('span', { class: 'tag new' }, 'New word');
      btn.append(
        h('span', { class: 'tick', 'aria-hidden': 'true' }),
        h('span', { class: 'body' },
          h('span', { class: 'top' }, h('span', { class: 'hk', lang: 'zh-HK' }, cand.hk), jpNode(cand.jp)),
          h('span', { class: 'en' }, R(cand.en), cand.fr && cand.fr.toLowerCase() !== (cand.en || '').toLowerCase() ? h('span', { class: 'fr' }, ` · ${cand.fr}`) : null),
          cand.note ? h('span', { class: 'cnote' }, R(cand.note)) : null,
          tag));
      const set = (on) => { btn.setAttribute('aria-pressed', String(on)); if (on) picked.set(id, cand); else picked.delete(id); drawFoot(); };
      btn.onclick = () => { speak(cand.hk); set(btn.getAttribute('aria-pressed') !== 'true'); };
      const row = h('div', { class: 'addw-row' }, speakerBtn(cand.hk, 'sm'), btn);
      if (known || already) { btn.disabled = true; }
      else if (ci === 0 && cand.confidence >= 0.6) set(true);
      g.append(row);
    });
    return g;
  }

  function drawFoot() {
    foot.innerHTML = '';
    if (!results.childElementCount) return;
    const n = picked.size;
    foot.append(h('button', { class: 'btn primary wide', type: 'button', disabled: !n, onclick: add }, n ? `Add ${n} word${n > 1 ? 's' : ''}` : 'Pick the right words above'));
  }

  function add() {
    const keys = [];
    const mine = (id) => ta.value.split(/\n|;/).map((x) => x.trim()).filter(Boolean)[+id.split(':')[0]] || '';
    for (const [id, cand] of picked) {
      if (cand.course) { introduce(cand.course.key); keys.push(cand.course.key); continue; }
      addCustom({ hk: cand.hk, jp: cand.jp, en: cand.en, fr: cand.fr, note: cand.note, mine: mine(id), ex: cand.ex });
      keys.push('w:' + cand.hk);
    }
    registerCustom();
    for (const k of keys) introduce(k);
    results.innerHTML = ''; foot.innerHTML = ''; ta.value = ''; status.textContent = '';
    results.append(h('div', { class: 'addw-done' },
      h('p', {}, h('b', {}, `Added ${keys.length} word${keys.length > 1 ? 's' : ''}.`), ' They’ll come up in your reviews, practice drills and conversations.'),
      h('div', { class: 'row wrap' },
        h('button', { class: 'btn primary', type: 'button', onclick: () => close(false, () => startReview('mixed', Math.max(6, keys.length * 2), keys)) }, 'Practise them now'),
        h('button', { class: 'btn', type: 'button', onclick: () => { results.innerHTML = ''; ta.focus(); } }, 'Add more'))));
    refresh && refresh();
  }
}
