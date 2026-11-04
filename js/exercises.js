// Exercise renderers. Each takes (step, ctx) and returns a DOM node.
import { h, jpNode, jpHTML, shuffle, sample, toneOf, toneGlyph, TONES, sJP, sHK, wordTokens, esc, vibrate } from './util.js';
import { distractors, distractorTokens, ITEMS, UNIT, learnedWords } from './course.js';
import { speak, speakSlow, sfx } from './tts.js';
import { setting, introduce } from './store.js';
import * as SP from './speak.js';

const showJp = () => setting('showJp') !== 'tap';

// Characters + jyutping block; jyutping can be "tap to reveal".
export function canto(item, { size = 'md', jp = item.jp || (item.parts && sJP(item.parts)), hk = item.hk, play = false, forceJp = false } = {}) {
  const box = h('div', { class: `canto canto-${size}` });
  const hkEl = h('div', { class: 'hk', lang: 'zh-HK' }, hk);
  const jpEl = jpNode(jp);
  box.append(hkEl);
  if (showJp() || forceJp) box.append(jpEl);
  else {
    const btn = h('button', { class: 'reveal', type: 'button', onclick: () => btn.replaceWith(jpEl) }, 'Show Jyutping');
    box.append(btn);
  }
  if (play) box.prepend(speakerBtn(hk, 'sm'));
  return box;
}

export function speakerBtn(text, size = 'lg', { slow = false } = {}) {
  const b = h('button', { class: `spk spk-${size}`, type: 'button', 'aria-label': slow ? 'Play slowly' : 'Play audio', onclick: (e) => { e.stopPropagation(); (slow ? speakSlow : speak)(text); b.classList.add('ping'); setTimeout(() => b.classList.remove('ping'), 500); } });
  b.innerHTML = slow ? ICON.turtle : ICON.speaker;
  return b;
}
export const ICON = {
  speaker: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  turtle: '<svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="11" cy="13" rx="7" ry="5" fill="currentColor"/><circle cx="19.5" cy="11.5" r="2.3" fill="currentColor"/><path d="M6 17l-1 3M15 17l1 3M4 13H2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  mic: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  rec: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7" fill="currentColor"/></svg>',
  stop: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/></svg>',
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5l12 7-12 7z" fill="currentColor"/></svg>',
};

function listenBar(text, auto = true) {
  const bar = h('div', { class: 'listen' }, speakerBtn(text, 'xl'), speakerBtn(text, 'md', { slow: true }));
  if (auto && setting('autoplay')) setTimeout(() => speak(text), 250);
  return bar;
}

function enLine(item) {
  return h('div', { class: 'en' }, item.en, setting('showFr') && item.fr ? h('span', { class: 'fr' }, ' · ' + item.fr) : null);
}

// ---------------------------------------------------------------- teach
function teach(step, ctx) {
  const w = step.item;
  introduce(w.key);
  const ex = w.ex;
  const node = h('div', { class: 'ex teach' },
    h('div', { class: 'kicker' }, 'New word'),
    h('div', { class: 'teach-card' },
      h('div', { class: 'teach-top' }, speakerBtn(w.hk, 'lg'), speakerBtn(w.hk, 'md', { slow: true })),
      canto(w, { size: 'xl', forceJp: true }),
      h('div', { class: 'tone-strip', html: w.jp.split(' ').map((s) => `<span class="t${toneOf(s)}">${toneGlyph(toneOf(s), 18)}<b>${TONES[toneOf(s)]?.name || ''}</b></span>`).join('') }),
      enLine(w),
      w.mine ? h('div', { class: 'mine' }, 'Your spelling: ', h('b', {}, w.mine)) : null,
      w.note ? h('p', { class: 'note' }, w.note) : null,
    ),
    ex ? h('div', { class: 'example' }, speakerBtn(ex.hk, 'sm'), h('div', {}, canto(ex, { size: 'sm' }), h('div', { class: 'en-sm' }, ex.en))) : null,
  );
  setTimeout(() => speak(w.hk), 250);
  ctx.footer('Got it', () => ctx.next());
  return node;
}

// ---------------------------------------------------------------- multiple choice helpers
function choiceList(options, render, onPick) {
  const wrap = h('div', { class: 'opts' });
  options.forEach((o, i) => {
    const b = h('button', { class: 'opt', type: 'button', onclick: () => onPick(o, b, wrap) });
    b.append(h('span', { class: 'key' }, String(i + 1)), render(o));
    wrap.append(b);
  });
  return wrap;
}
function lockOpts(wrap, isRight) {
  [...wrap.children].forEach((b) => { b.disabled = true; });
  wrap.querySelectorAll('.opt').forEach((b, i) => { if (isRight(i)) b.classList.add('ok'); });
}

function listenPick(step, ctx) {
  const w = step.item;
  const opts = shuffle([w, ...distractors(w, 3)]);
  const node = h('div', { class: 'ex' }, h('div', { class: 'kicker' }, 'What does this mean?'), listenBar(w.hk));
  node.append(choiceList(opts, (o) => h('span', {}, o.en), (o, b, wrap) => {
    const ok = o === w;
    b.classList.add(ok ? 'ok' : 'bad');
    lockOpts(wrap, (i) => opts[i] === w);
    ctx.answer(ok, { item: w });
  }));
  return node;
}

function seePick(step, ctx) {
  const w = step.item;
  const opts = shuffle([w, ...distractors(w, 3)]);
  const node = h('div', { class: 'ex' }, h('div', { class: 'kicker' }, 'Pick the meaning'), canto(w, { size: 'xl', play: true }));
  node.append(choiceList(opts, (o) => h('span', {}, o.en), (o, b, wrap) => {
    const ok = o === w;
    b.classList.add(ok ? 'ok' : 'bad');
    lockOpts(wrap, (i) => opts[i] === w);
    speak(w.hk);
    ctx.answer(ok, { item: w, quiet: true });
  }));
  return node;
}

function enPick(step, ctx) {
  const w = step.item;
  const opts = shuffle([w, ...distractors(w, 3)]);
  let chosen = null;
  const node = h('div', { class: 'ex' }, h('div', { class: 'kicker' }, 'How do you say…'), h('div', { class: 'prompt-en' }, w.en));
  const list = choiceList(opts, (o) => canto(o, { size: 'sm', forceJp: true }), (o, b, wrap) => {
    wrap.querySelectorAll('.opt').forEach((x) => x.classList.remove('sel'));
    b.classList.add('sel'); chosen = o; speak(o.hk);
    ctx.footer('Check', check, true);
  });
  list.classList.add('opts-canto');
  node.append(list, h('p', { class: 'hint' }, 'Tap an answer to hear it, then check.'));
  function check() {
    const ok = chosen === w;
    list.querySelector('.sel')?.classList.add(ok ? 'ok' : 'bad');
    lockOpts(list, (i) => opts[i] === w);
    ctx.answer(ok, { item: w, quiet: ok });
  }
  ctx.footer('Check', check, false);
  return node;
}

// ---------------------------------------------------------------- tone
function tone(step, ctx) {
  const w = step.item;
  const syl = w.jp.split(' ');
  const hk = [...w.hk];
  const ti = step.ti ?? Math.floor(Math.random() * syl.length);
  const target = toneOf(syl[ti]);
  const shown = h('div', { class: 'canto canto-xl' },
    h('div', { class: 'hk', lang: 'zh-HK' }, ...hk.map((c, i) => h('span', { class: i === ti ? 'focus' : 'dim' }, c))));
  const jpRow = h('div', { class: 'jp' });
  jpRow.innerHTML = syl.map((s, i) => i === ti ? `<span class="sy blank">${s.replace(/[1-6]$/, '')}<sup>?</sup></span>` : jpHTML(s)).join(' ');
  shown.append(jpRow);
  const node = h('div', { class: 'ex' }, h('div', { class: 'kicker' }, syl.length > 1 ? 'Which tone is the highlighted syllable?' : 'Which tone do you hear?'), listenBar(w.hk), shown);
  const grid = h('div', { class: 'tone-btns' });
  for (let t = 1; t <= 6; t++) {
    const b = h('button', { class: `tbtn t${t}`, type: 'button', html: `${toneGlyph(t, 30)}<b>${t}</b><small>${TONES[t].name}</small>` });
    b.onclick = () => {
      const ok = t === target;
      b.classList.add(ok ? 'ok' : 'bad');
      grid.querySelectorAll('.tbtn').forEach((x, i) => { x.disabled = true; if (i + 1 === target) x.classList.add('ok'); });
      jpRow.innerHTML = jpHTML(w.jp);
      ctx.answer(ok, { item: w, quiet: true, extra: ok ? null : `Tone ${target}: ${TONES[target].name}` });
    };
    grid.append(b);
  }
  node.append(grid);
  return node;
}

function pair(step, ctx) {
  const items = step.item.map((hk) => ITEMS.get('w:' + hk) || { hk, jp: '', en: '' }).filter((x) => x.jp);
  if (items.length < 2) { setTimeout(() => ctx.next(), 0); return h('div'); }
  const target = items[Math.floor(Math.random() * 2)];
  const node = h('div', { class: 'ex' }, h('div', { class: 'kicker' }, 'Which one did you hear?'), listenBar(target.hk));
  const list = choiceList(items, (o) => h('div', { class: 'pair-opt' }, canto(o, { size: 'md', forceJp: true }), h('div', { class: 'en-sm' }, o.en)), (o, b, wrap) => {
    const ok = o === target;
    b.classList.add(ok ? 'ok' : 'bad');
    lockOpts(wrap, (i) => items[i] === target);
    ctx.answer(ok, { item: target, quiet: true });
  });
  list.classList.add('opts-2');
  node.append(list, h('p', { class: 'hint' }, 'After answering, tap the speakers to compare both.'));
  list.querySelectorAll('.opt').forEach((b, i) => b.append(speakerBtn(items[i].hk, 'sm')));
  return node;
}

// ---------------------------------------------------------------- tiles & dictation
function tiles(step, ctx, { dictation = false } = {}) {
  const s = step.item;
  const target = wordTokens(s.parts);
  const extra = distractorTokens(s, target.length > 6 ? 1 : 2);
  const bank = shuffle([...target, ...extra].map((t, i) => ({ hk: t[0], jp: t[1], id: i })));
  const answer = [];
  const node = h('div', { class: 'ex' });
  node.append(h('div', { class: 'kicker' }, dictation ? 'Listen and build what you hear' : 'Build this sentence'));
  if (dictation) node.append(listenBar(s.hk));
  else node.append(h('div', { class: 'prompt-en' }, s.en));
  const line = h('div', { class: 'answer-line' });
  const bankEl = h('div', { class: 'bank' });
  const tileEl = (t) => {
    const b = h('button', { class: 'tile', type: 'button' }, h('span', { class: 'thk', lang: 'zh-HK' }, t.hk));
    if (showJp()) { const j = jpNode(t.jp); j.classList.add('tjp'); b.append(j); }
    return b;
  };
  const els = new Map();
  for (const t of bank) {
    const b = tileEl(t);
    els.set(t.id, b);
    b.onclick = () => {
      if (node.classList.contains('locked')) return;
      const at = answer.indexOf(t);
      if (at >= 0) { answer.splice(at, 1); bankEl.append(b); b.classList.remove('placed'); }
      else { answer.push(t); line.append(b); b.classList.add('placed'); speak(t.hk); }
      ctx.footer('Check', check, answer.length > 0);
    };
    bankEl.append(b);
  }
  node.append(line, bankEl);
  function check() {
    node.classList.add('locked');
    const got = answer.map((t) => t.hk).join('');
    const want = target.map((t) => t[0]).join('');
    const ok = got === want;
    line.classList.add(ok ? 'ok' : 'bad');
    if (ok) speak(s.hk);
    ctx.answer(ok, { item: s, sentence: true, quiet: ok, reveal: dictation ? s.en : null });
  }
  ctx.footer('Check', check, false);
  return node;
}

function gap(step, ctx) {
  const s = step.item;
  const toks = s.parts.map((p, i) => ({ p, i })).filter((x) => x.p.length === 2);
  const cand = toks.filter((x) => x.p[0].length <= 3 && !/^[啊啦喇嘅呢咩㗎喎囉吖嘛咋噃]$/.test(x.p[0]));
  const blank = (cand.length ? cand : toks)[Math.floor(Math.random() * (cand.length || toks.length))];
  const right = blank.p;
  const wrong = distractorTokens(s, 6).filter((t) => t[0] !== right[0]).slice(0, 3);
  while (wrong.length < 3) {
    const w = sample(learnedWords().length > 6 ? learnedWords() : UNIT.get(s.unit).words, 1)[0];
    if (w && w.hk !== right[0] && !wrong.some((x) => x[0] === w.hk)) wrong.push([w.hk, w.jp]);
  }
  const opts = shuffle([right, ...wrong]);
  const sent = h('div', { class: 'gap-sent', lang: 'zh-HK' });
  const slot = h('span', { class: 'slot' }, '＿＿');
  s.parts.forEach((p, i) => {
    if (i === blank.i) sent.append(slot);
    else if (p.length === 1) sent.append(h('span', { class: 'punct' }, p[0]));
    else { const t = h('span', { class: 'gw' }, h('span', { class: 'thk' }, p[0])); if (showJp()) { const j = jpNode(p[1]); j.classList.add('tjp'); t.append(j); } sent.append(t); }
  });
  const node = h('div', { class: 'ex' }, h('div', { class: 'kicker' }, 'Fill the gap'), h('div', { class: 'prompt-en sm' }, s.en), sent);
  const list = choiceList(opts, (o) => canto({ hk: o[0], jp: o[1] }, { size: 'sm' }), (o, b, wrap) => {
    const ok = o === right;
    b.classList.add(ok ? 'ok' : 'bad');
    lockOpts(wrap, (i) => opts[i] === right);
    slot.textContent = right[0]; slot.classList.add(ok ? 'ok' : 'bad');
    speak(s.hk);
    ctx.answer(ok, { item: s, sentence: true, quiet: true });
  });
  list.classList.add('opts-canto', 'opts-grid');
  node.append(list);
  return node;
}

// ---------------------------------------------------------------- match pairs
function match(step, ctx) {
  const items = step.items.filter(Boolean);
  const left = shuffle(items), right = shuffle(items);
  let sel = null, matched = 0, mistakes = new Set();
  const t0 = Date.now();
  const timer = h('div', { class: 'timer' }, '0.0s');
  const iv = setInterval(() => { timer.textContent = ((Date.now() - t0) / 1000).toFixed(1) + 's'; }, 100);
  const grid = h('div', { class: 'match-grid' });
  const colL = h('div', { class: 'col' }), colR = h('div', { class: 'col' });
  const mk = (it, side) => {
    const b = h('button', { class: 'm-card ' + side, type: 'button' });
    if (side === 'l') b.append(canto(it, { size: 'sm' })); else b.append(h('span', {}, it.en));
    b.onclick = () => {
      if (b.classList.contains('done')) return;
      if (side === 'l') speak(it.hk);
      if (!sel || sel.side === side) {
        grid.querySelectorAll('.m-card.sel').forEach((x) => x.classList.remove('sel'));
        sel = { it, side, b }; b.classList.add('sel'); return;
      }
      if (sel.it === it) {
        [sel.b, b].forEach((x) => { x.classList.remove('sel'); x.classList.add('done'); });
        sfx('tap');
        ctx.grade(it.key, !mistakes.has(it.key));
        matched++; sel = null;
        if (matched === items.length) {
          clearInterval(iv);
          const secs = (Date.now() - t0) / 1000;
          ctx.answer(true, { quiet: true, extra: `Matched in ${secs.toFixed(1)}s${mistakes.size ? ` · ${mistakes.size} slip${mistakes.size > 1 ? 's' : ''}` : ' · flawless'}`, bonus: secs < 20 && !mistakes.size ? 3 : 0, noGrade: true });
        }
      } else {
        const wrongIt = sel.it;
        [sel.b, b].forEach((x) => { x.classList.add('shake'); setTimeout(() => x.classList.remove('shake', 'sel'), 400); });
        mistakes.add(wrongIt.key); mistakes.add(it.key);
        sfx('bad'); vibrate(40);
        sel = null;
      }
    };
    return b;
  };
  left.forEach((it) => colL.append(mk(it, 'l')));
  right.forEach((it) => colR.append(mk(it, 'r')));
  grid.append(colL, colR);
  ctx.onLeave(() => clearInterval(iv));
  return h('div', { class: 'ex' }, h('div', { class: 'kicker row' }, h('span', {}, 'Tap the matching pairs'), timer), grid);
}

// ---------------------------------------------------------------- dialogue
function dialogue(step, ctx) {
  const d = step.item;
  const chat = h('div', { class: 'chat' });
  let i = 0, playingAll = false;
  const node = h('div', { class: 'ex dialog' }, h('div', { class: 'kicker' }, 'Listen to the conversation'), h('h2', { class: 'dlg-title' }, d.title), chat);
  const showEn = h('label', { class: 'switch' }, h('input', { type: 'checkbox', onchange: (e) => chat.classList.toggle('en-on', e.target.checked) }), h('span', {}, 'Show English'));
  node.append(showEn);
  const speakers = [...new Set(d.lines.map((l) => l.spk))];
  function addLine() {
    const l = d.lines[i++];
    const side = speakers.indexOf(l.spk) % 2 ? 'r' : 'l';
    const b = h('div', { class: `bubble ${side} spk-${l.spk}` },
      h('div', { class: 'who' }, l.spk === 'N' ? 'Narrator' : l.spk),
      canto(l, { size: 'sm' }), h('div', { class: 'en-sm line-en' }, l.en));
    b.onclick = () => speak(l.hk);
    chat.append(b);
    b.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    speak(l.hk, { onend: () => { if (playingAll && i < d.lines.length) setTimeout(addLine, 450); else upd(); } });
    upd();
  }
  function upd() {
    if (i < d.lines.length) ctx.footer(playingAll ? 'Playing…' : 'Next line', () => { playingAll = false; addLine(); }, !playingAll);
    else ctx.footer(d.questions?.length ? 'Answer questions' : 'Continue', () => ctx.next(), true);
  }
  const playAll = h('button', { class: 'chip', type: 'button', onclick: () => { playingAll = true; playAll.remove(); addLine(); } }, '▶ Play whole conversation');
  node.insertBefore(playAll, chat);
  setTimeout(addLine, 300);
  return node;
}

function dq(step, ctx) {
  const q = step.item, d = step.dialogue;
  const order = shuffle(q.options.map((o, i) => i));
  const node = h('div', { class: 'ex' }, h('div', { class: 'kicker' }, 'Comprehension'), h('div', { class: 'prompt-en' }, q.q));
  const replay = h('button', { class: 'chip', type: 'button', onclick: () => {
    let k = 0; const nextLine = () => { if (k < d.lines.length) speak(d.lines[k++].hk, { onend: () => setTimeout(nextLine, 350) }); }; nextLine();
  } }, '🔊 Replay conversation');
  const transcript = h('details', { class: 'transcript' }, h('summary', {}, 'Read the transcript'), ...d.lines.map((l) => h('p', {}, h('b', {}, (l.spk === 'N' ? '' : l.spk + ': ')), h('span', { lang: 'zh-HK' }, l.hk))));
  node.append(h('div', { class: 'row' }, replay), transcript);
  node.append(choiceList(order.map((i) => q.options[i]), (o) => h('span', {}, o), (o, b, wrap) => {
    const ok = o === q.options[q.answer];
    b.classList.add(ok ? 'ok' : 'bad');
    lockOpts(wrap, (i) => q.options[order[i]] === q.options[q.answer]);
    ctx.answer(ok, { quiet: true, noGrade: true });
  }));
  return node;
}

// ---------------------------------------------------------------- grammar & tone chart
function grammar(step, ctx) {
  const g = step.item;
  const node = h('div', { class: 'ex grammar' }, h('div', { class: 'kicker' }, 'Pattern'), h('h2', {}, g.title), h('p', { class: 'explain' }, g.explain),
    ...(g.examples || []).map((e) => h('div', { class: 'example' }, speakerBtn(e.hk, 'sm'), h('div', {}, canto(e, { size: 'sm', forceJp: true }), h('div', { class: 'en-sm' }, e.en)))));
  ctx.footer('Continue', () => ctx.next());
  return node;
}

export function toneChartSVG({ active = 0, user = null, w = 320, hgt = 200 } = {}) {
  const pad = 26, x0 = pad, x1 = w - 10;
  const y = (c) => 10 + (5 - c) * (hgt - 30) / 4;
  let s = `<svg class="tone-chart" viewBox="0 0 ${w} ${hgt}" role="img" aria-label="Cantonese tone contours">`;
  for (let c = 1; c <= 5; c++) s += `<line x1="${x0}" x2="${x1}" y1="${y(c)}" y2="${y(c)}" class="grid"/><text x="6" y="${y(c) + 4}" class="lab">${c}</text>`;
  for (let t = 1; t <= 6; t++) {
    const [a, b] = TONES[t].chao;
    const ex = t === 2 || t === 5 ? x1 - 66 : x1 - 30;
    const dy = t === 6 ? 4 : 0;
    s += `<path class="contour t${t} ${active && active !== t ? 'faded' : ''} ${active === t ? 'on' : ''}" d="M${x0 + 8} ${y(a) + dy} C ${x0 + 100} ${y(a) + dy}, ${ex - 90} ${y(b) + dy}, ${ex} ${y(b) + dy}"/>`;
    s += `<text class="tn t${t} ${active && active !== t ? 'faded' : ''}" x="${ex + 8}" y="${y(b) + dy + (t === 2 || t === 5 ? -6 : 5)}">${t}</text>`;
  }
  if (user && user.length > 1) {
    const t0 = user[0].t, t1 = user[user.length - 1].t || 1;
    const px = (t) => x0 + 8 + (x1 - 50 - x0) * (t - t0) / Math.max(1, t1 - t0);
    s += `<path class="user" d="${user.map((p, i) => `${i ? 'L' : 'M'}${px(p.t).toFixed(1)} ${y(Math.max(0.6, Math.min(5.4, p.c))).toFixed(1)}`).join(' ')}"/>`;
  }
  return s + '</svg>';
}

function toneChart(step, ctx) {
  const holder = h('div', { class: 'chart-holder', html: toneChartSVG() });
  const set = [['詩', 'si1'], ['史', 'si2'], ['試', 'si3'], ['時', 'si4'], ['市', 'si5'], ['事', 'si6']];
  const btns = h('div', { class: 'tone-btns' }, ...set.map(([c, j], i) => {
    const b = h('button', { class: `tbtn t${i + 1}`, type: 'button', html: `<b lang="zh-HK">${c}</b><small>${jpHTML(j)}</small>` });
    b.onclick = () => { holder.innerHTML = toneChartSVG({ active: i + 1 }); speak(c); };
    return b;
  }));
  ctx.footer('Continue', () => ctx.next());
  return h('div', { class: 'ex' }, h('div', { class: 'kicker' }, 'Meet the six tones'),
    h('p', { class: 'explain' }, 'Same syllable "si", six different words. Tap each one and watch its line: pitch goes up the chart, time goes right.'), holder, btns);
}

// ---------------------------------------------------------------- speak (shadowing)
function speakEx(step, ctx) {
  const it = step.item;
  const text = it.hk;
  const result = h('div', { class: 'speak-result' });
  const node = h('div', { class: 'ex speak' }, h('div', { class: 'kicker' }, 'Say it out loud'),
    h('div', { class: 'speak-card' }, canto(it, { size: it.hk.length > 6 ? 'md' : 'lg', forceJp: true, jp: it.jp || sJP(it.parts) }), h('div', { class: 'en-sm' }, it.en)),
    listenBar(text, true), result);
  const actions = h('div', { class: 'speak-actions' });
  node.append(actions);
  if (SP.recogSupported()) {
    const mic = h('button', { class: 'big-mic', type: 'button', html: ICON.mic + '<span>Tap and speak</span>' });
    mic.onclick = async () => {
      mic.classList.add('live'); mic.querySelector('span').textContent = 'Listening…';
      result.innerHTML = '';
      try {
        const alts = await SP.recognize();
        const r = SP.compare(text, alts);
        showRecog(result, text, r);
        if (r.score >= 0.6) { sfx('ok'); ctx.footer('Continue', () => ctx.answer(true, { quiet: true, silent: true, noGrade: true, auto: true }), true); }
      } catch (e) {
        result.append(h('p', { class: 'hint' }, e.message === 'not-allowed' ? 'Microphone access was blocked. Allow it in your browser settings, or use Record below.' : 'Speech check is unavailable right now. Use Record below instead.'));
      }
      mic.classList.remove('live'); mic.querySelector('span').textContent = 'Try again';
    };
    actions.append(mic);
  }
  if (SP.micSupported()) actions.append(recorderWidget(text));
  actions.append(h('button', { class: 'link', type: 'button', onclick: () => { setting('speakOffUntil', Date.now() + 3600e3); ctx.next(); } }, "Can't speak now (skip for 1 hour)"));
  ctx.footer('Done', () => ctx.answer(true, { quiet: true, silent: true, noGrade: true, auto: true }), true);
  return node;
}
function showRecog(el, text, r) {
  const chars = [...SP.norm(text)];
  el.innerHTML = '';
  el.append(h('div', { class: 'heard-chars', lang: 'zh-HK' }, ...chars.map((c, i) => h('span', { class: r.hit[i] ? 'hit' : 'miss' }, c))),
    h('div', { class: 'heard' }, 'Heard: ', h('span', { lang: 'zh-HK' }, r.heard || '—'), ` · ${Math.round(r.score * 100)}%`),
    h('p', { class: 'hint' }, r.score >= 0.85 ? 'Excellent — understood perfectly.' : r.score >= 0.6 ? 'Good! The red characters were unclear; listen and try once more.' : 'Not quite. Play the slow version, copy the tones, and try again.'));
}

export function recorderWidget(text, { onTrack } = {}) {
  const box = h('div', { class: 'recorder' });
  const btn = h('button', { class: 'rec-btn', type: 'button', html: ICON.rec + '<span>Record & compare</span>' });
  const playback = h('div', { class: 'playback' });
  let rec = null;
  btn.onclick = async () => {
    if (rec) { const r = await rec.stop(); rec = null; btn.classList.remove('live'); btn.innerHTML = ICON.rec + '<span>Record again</span>'; render(r); return; }
    try {
      rec = await SP.startRecording({ maxMs: 8000 });
      btn.classList.add('live'); btn.innerHTML = ICON.stop + '<span>Stop</span>';
      rec.done.then((r) => { if (rec) { rec = null; btn.classList.remove('live'); btn.innerHTML = ICON.rec + '<span>Record again</span>'; render(r); } });
    } catch (e) {
      playback.innerHTML = ''; playback.append(h('p', { class: 'hint' }, 'Microphone not available. Allow microphone access for this site to record yourself.'));
    }
  };
  function render(r) {
    playback.innerHTML = '';
    onTrack && onTrack(r.track);
    if (!r.url) return;
    const audio = new Audio(r.url);
    playback.append(
      h('button', { class: 'chip', type: 'button', onclick: () => speak(text) }, '🔊 Native'),
      h('button', { class: 'chip', type: 'button', onclick: () => { audio.currentTime = 0; audio.play(); } }, '▶ You'),
      h('button', { class: 'chip', type: 'button', onclick: () => speak(text, { onend: () => setTimeout(() => { audio.currentTime = 0; audio.play(); }, 300) }) }, '⇄ Back to back'));
  }
  box.append(btn, playback);
  return box;
}

export const EX = { teach, listenPick, seePick, enPick, tone, pair, tiles, dictation: (s, c) => tiles(s, c, { dictation: true }), gap, match, dialogue, dq, grammar, toneChart, speak: speakEx };
export { esc };
