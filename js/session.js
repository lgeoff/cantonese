// Runs a list of exercise steps full-screen: progress, feedback, re-queueing mistakes, XP.
import { h, pick, vibrate } from './util.js';
import { EX, canto, speakerBtn } from './exercises.js';
import { grade, addXP, logAnswer, logTime, lessonDone, setting, introduce, streakAlive, todayXP, S } from './store.js';
import { speak, stop, sfx } from './tts.js';

const PRAISE = [['好嘢！', 'hou2 je5', 'Great!'], ['叻！', 'lek1', 'Clever!'], ['正！', 'zeng3', 'Excellent!'], ['冇錯！', 'mou5 co3', 'Correct!'], ['做得好！', 'zou6 dak1 hou2', 'Well done!']];
const OOPS = [['差少少！', 'caa1 siu2 siu2', 'Almost!'], ['唔緊要！', 'm4 gan2 jiu3', 'No worries!']];

export function runSession({ title, steps, lessonId = null, onExit, kind = 'lesson' }) {
  if (setting('speakOffUntil') > Date.now()) steps = steps.filter((s) => s.type !== 'speak');
  steps = steps.filter((s) => EX[s.type]);
  const queue = steps.slice();
  const total = () => queue.length;
  let pos = 0, answered = 0, correct = 0, xp = 0, combo = 0, bestCombo = 0;
  const t0 = Date.now();
  const leaveHooks = [];

  const root = h('div', { class: 'session', role: 'dialog', 'aria-label': title });
  const bar = h('div', { class: 'progress' }, h('i'));
  const comboEl = h('div', { class: 'combo' });
  const close = h('button', { class: 'x', type: 'button', 'aria-label': 'Quit session', onclick: quit }, '✕');
  const body = h('main', { class: 'sbody' });
  const foot = h('footer', { class: 'sfoot' });
  const fbtn = h('button', { class: 'btn primary wide', type: 'button' }, 'Continue');
  foot.append(fbtn);
  root.append(h('header', { class: 'stop' }, close, bar, comboEl), body, foot);
  document.body.append(root);
  document.body.classList.add('in-session');

  function setFooter(label, fn, enabled = true) {
    fbtn.textContent = label; fbtn.disabled = !enabled; fbtn.onclick = fn;
    fbtn.style.visibility = fn ? '' : 'hidden';
    foot.classList.remove('good', 'bad'); foot.querySelector('.fb')?.remove();
  }

  function render() {
    leaveHooks.splice(0).forEach((f) => f());
    stop();
    if (pos >= queue.length) return finish();
    const step = queue[pos];
    bar.firstChild.style.width = `${(pos / total()) * 100}%`;
    body.innerHTML = '';
    body.scrollTop = 0;
    setFooter('Check', null, false);
    let answeredThis = false;
    const ctx = {
      footer: setFooter,
      next: () => { pos++; render(); },
      onLeave: (f) => leaveHooks.push(f),
      grade: (key, ok) => { if (key) grade(key, ok ? 2 : 0); logAnswer(ok); if (ok) { addXP(1); xp += 1; } },
      answer: (ok, info = {}) => {
        if (answeredThis) return; answeredThis = true;
        if (!info.auto) { answered++; if (ok) correct++; logAnswer(ok); }
        if (step.key && !info.noGrade) grade(step.key, ok ? (step.retry ? 1 : 2) : 0);
        let gain = ok ? (info.auto ? 1 : 2) + (info.bonus || 0) : 0;
        if (ok) { combo++; bestCombo = Math.max(bestCombo, combo); if (combo >= 5 && combo % 5 === 0) gain += 2; } else combo = 0;
        if (gain) { addXP(gain); xp += gain; }
        comboEl.textContent = combo >= 3 ? `🔥 ${combo}` : '';
        if (!ok && step.type !== 'speak' && step.type !== 'dq' && !step.retry && step.type !== 'match') queue.push({ ...step, retry: true });
        if (info.silent) { pos++; render(); return; }
        sfx(ok ? 'ok' : 'bad'); if (!ok) vibrate(60);
        showFeedback(ok, step, info);
      },
    };
    let node;
    try { node = EX[step.type](step, ctx); } catch (e) { console.error(e); pos++; return render(); }
    if (step.key && step.type !== 'teach') introduce(step.key);
    body.append(node);
  }

  function showFeedback(ok, step, info) {
    const [hk, jp, en] = ok ? pick(PRAISE) : pick(OOPS);
    const fb = h('div', { class: 'fb' });
    fb.append(h('div', { class: 'fb-head' }, h('b', { lang: 'zh-HK' }, hk), h('span', {}, ` ${jp} · ${en}`)));
    const it = info.item;
    if (!ok && it) {
      fb.append(h('div', { class: 'fb-answer' }, speakerBtn(it.hk, 'sm'), h('div', {}, canto(it, { size: 'sm', forceJp: true }), h('div', { class: 'en-sm' }, it.en))));
      if (!info.quiet) speak(it.hk);
    } else if (it && info.sentence) {
      fb.append(h('div', { class: 'fb-answer' }, speakerBtn(it.hk, 'sm'), h('div', { class: 'en-sm' }, it.en)));
    }
    if (info.reveal && ok) fb.append(h('div', { class: 'en-sm' }, info.reveal));
    if (info.extra) fb.append(h('div', { class: 'en-sm' }, info.extra));
    setFooter('Continue', () => { pos++; render(); });
    foot.classList.add(ok ? 'good' : 'bad');
    foot.prepend(fb);
    fbtn.focus({ preventScroll: true });
  }

  function finish() {
    stop();
    const secs = Math.round((Date.now() - t0) / 1000);
    logTime(secs);
    const acc = answered ? correct / answered : 1;
    if (lessonId) { lessonDone(lessonId, acc); addXP(5); xp += 5; }
    sfx('done');
    bar.firstChild.style.width = '100%';
    const streak = streakAlive();
    const goal = S().goal, today = todayXP();
    body.innerHTML = '';
    body.append(h('div', { class: 'done' },
      h('div', { class: 'stamp', lang: 'zh-HK' }, acc >= 0.9 ? '正' : acc >= 0.7 ? '好' : '得'),
      h('h2', {}, acc >= 0.9 ? 'Excellent session!' : acc >= 0.7 ? 'Nice work!' : 'Done — mistakes will come back for review.'),
      h('div', { class: 'done-stats' },
        stat(`+${xp}`, 'XP'), stat(`${Math.round(acc * 100)}%`, 'accuracy'), stat(fmtTime(secs), 'time'), stat(`🔥 ${streak}`, streak === 1 ? 'day streak' : 'days streak')),
      h('div', { class: 'goal-line' }, h('div', { class: 'goalbar' }, h('i', { style: { width: `${Math.min(100, (today / goal) * 100)}%` } })),
        h('span', {}, today >= goal ? 'Daily goal reached 🎉' : `${today} / ${goal} XP today`)),
      bestCombo >= 5 ? h('p', { class: 'hint' }, `Best combo: ${bestCombo} in a row`) : null));
    setFooter('Continue', exit);
  }
  function stat(v, l) { return h('div', { class: 'stat' }, h('b', {}, v), h('span', {}, l)); }

  function quit() {
    if (pos > 0 && pos < queue.length && !confirm('Quit this session? Answers so far are saved.')) return;
    if (pos > 0) logTime(Math.round((Date.now() - t0) / 1000));
    exit();
  }
  function exit() {
    leaveHooks.splice(0).forEach((f) => f());
    stop(); root.remove(); document.body.classList.remove('in-session');
    window.removeEventListener('keydown', onKey);
    onExit && onExit();
  }
  function onKey(e) {
    if (e.key === 'Enter' && !fbtn.disabled) { e.preventDefault(); fbtn.click(); }
    const n = +e.key;
    if (n >= 1 && n <= 6) { const b = body.querySelectorAll('.opt, .tbtn')[n - 1]; if (b && !b.disabled) b.click(); }
    if (e.key === 'Escape') quit();
  }
  window.addEventListener('keydown', onKey);
  if (!queue.length) {
    body.append(h('div', { class: 'empty' }, h('p', {}, 'Nothing to practise here yet. Finish a lesson on the path first.')));
    setFooter('Back', exit);
    return;
  }
  render();
}
const fmtTime = (s) => (s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`);
