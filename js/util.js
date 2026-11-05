// Small DOM + data helpers shared by every screen.

export function h(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat(Infinity)) {
    if (k === null || k === undefined || k === false) continue;
    e.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
  return e;
}

export const $ = (s, r = document) => r.querySelector(s);

export function shuffle(a) {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
export const pick = (a) => a[Math.floor(Math.random() * a.length)];
export function sample(a, n) { return shuffle(a).slice(0, n); }

export function todayStr(d = new Date()) {
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}
export function dayDiff(a, b) {
  return Math.round((new Date(b + 'T12:00') - new Date(a + 'T12:00')) / 864e5);
}

// Tone helpers -------------------------------------------------------------
export const TONES = {
  1: { name: 'high level', chao: [5, 5], ex: '詩 si1' },
  2: { name: 'high rising', chao: [3, 5], ex: '史 si2' },
  3: { name: 'mid level', chao: [3, 3], ex: '試 si3' },
  4: { name: 'low falling', chao: [2, 1], ex: '時 si4' },
  5: { name: 'low rising', chao: [2, 3], ex: '市 si5' },
  6: { name: 'low level', chao: [2, 2], ex: '事 si6' },
};
export const toneOf = (syl) => +(syl.match(/[1-6]$/) || [0])[0];

export function toneGlyph(t, size = 14) {
  const c = TONES[t]?.chao;
  if (!c) return '';
  const y = (v) => (5 - v) * (size - 4) / 4 + 2;
  return `<svg class="tg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true"><path d="M2 ${y(c[0])} L${size - 2} ${y(c[1])}" /></svg>`;
}

// Render jyutping with each syllable coloured by tone.
export function jpHTML(jp, { glyph = false } = {}) {
  if (!jp) return '';
  return jp.split(/(\s+)/).map((tok) => {
    if (/^\s+$/.test(tok)) return ' ';
    const m = tok.match(/^([a-z]+)([1-6])([^a-z0-9]*)$/);
    if (!m) return esc(tok);
    const t = m[2];
    return `<span class="sy t${t}">${m[1]}<sup>${t}</sup>${glyph ? toneGlyph(+t) : ''}</span>${esc(m[3])}`;
  }).join('');
}
export function jpNode(jp, opts) { const s = h('span', { class: 'jp' }); s.innerHTML = jpHTML(jp, opts); return s; }

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Sentence helpers: parts = [[hk, jp], ["，"], ...]
export const PUNCT = /^[，。？！、：；…]$/;
export const sHK = (parts) => parts.map((p) => p[0]).join('');
export function sJP(parts) {
  let out = '';
  for (const p of parts) {
    if (p.length === 1) out += ({ '，': ',', '。': '.', '？': '?', '！': '!', '、': ',', '：': ':', '；': ';' }[p[0]] || p[0]);
    else out += (out && !out.endsWith(' ') ? ' ' : '') + p[1];
  }
  return out.replace(/([,.?!:;])(\S)/g, '$1 $2');
}
export const wordTokens = (parts) => parts.filter((p) => p.length === 2);

export function vibrate(ms) { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) { /* ignore */ } }

// Free text with inline Chinese + Jyutping, e.g. "落雨 (lok6 jyu5) = to rain" -> styled HTML.
const RICH = /([㐀-鿿豈-﫿][㐀-鿿豈-﫿，。？！…、]*)(\s*)(\(?)((?:[a-z]+[1-6](?:\s+|(?=[^a-z0-9])|$))+)(\)?)/g;
export function richHTML(text) {
  if (!text) return '';
  const t = esc(text);
  return t.replace(RICH, (m, hk, sp, o, jp, c) => {
    const n = [...hk].filter((ch) => /[㐀-鿿豈-﫿]/.test(ch)).length;
    const sy = jp.trim().split(/\s+/);
    const paren = o && c;
    if (sy.length < n && !paren) return m;
    const k = paren ? sy.length : n;
    const used = sy.slice(0, k).join(' '), rest = sy.slice(k).join(' ');
    const tail = /\s$/.test(jp) && !c ? ' ' : '';
    return `<span class="rk" lang="zh-HK">${hk}</span> <span class="jp rjp">${jpHTML(used)}</span>${rest ? ' ' + rest : ''}${tail}`;
  }).replace(/([㐀-鿿豈-﫿]+)(?![^<]*<\/span>)/g, '<span class="rk" lang="zh-HK">$1</span>');
}
export function richNode(tag, cls, text) { const e = h(tag, { class: cls }); e.innerHTML = richHTML(text); return e; }
export function R(text) { const s = document.createElement('span'); s.innerHTML = richHTML(text); return s; }
