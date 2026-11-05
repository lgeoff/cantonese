// Runs a list of exercise steps full-screen: progress, feedback, re-queueing mistakes, XP.
import { backThen, h, R, jpNode, pick, vibrate } from './util.js';
import { EX, canto, speakerBtn } from './exercises.js';
import { grade, addXP, logAnswer, logTime, lessonDone, setting, introduce, streakAlive, todayXP, S, card, toggleStar } from './store.js';
import { speak, stop, sfx } from './tts.js';
import { adaptSteps, audioMode, ITEMS } from './course.js';

const PRAISE = [['好嘢！', 'hou2 je5', 'Great!'], ['叻！', 'lek1', 'Clever!'], ['正！', 'zeng3', 'Excellent!'], ['冇錯！', 'mou5 co3', 'Correct!'], ['做得好！', 'zou6 dak1 hou2', 'Well done!']];
const OOPS = [['差少少！', 'caa1 siu2 siu2', 'Almost!'], ['唔緊要！', 'm4 gan2 jiu3', 'No worries!']];
const MAX_RETRIES = 4;
const MODES = [['normal', '🔊', 'Sound on'], ['nospeak', '🎧', 'Listening only, no speaking'], ['mute', '🔇', 'Silent: no audio exercises']];

export function runSession({ title, steps, lessonId = null, onExit, onNext = null, onDone = null, kind = 'lesson' }) {
  steps = adaptSteps(steps.filter((s) => EX[s.type]), audioMode());
  const queue = steps.slice();
  const total = () => queue.length;
  let pos = 0, answered = 0, correct = 0, xp = 0, combo = 0, bestCombo = 0, retries = 0;
  const t0 = Date.now();
  const leaveHooks = [];
  const learnedNow = [], missed = new Set();

  const root = h('div', { class: 'session', role: 'dialog', 'aria-modal': 'true', 'aria-label': title, tabindex: '-1' });
  const bar = h('div', { class: 'progress', role: 'progressbar', 'aria-label': 'Session progress' }, h('i'));
  const comboEl = h('div', { class: 'combo', 'aria-live': 'polite' });
  const close = h('button', { class: 'x', type: 'button', 'aria-label': 'Quit session', onclick: quit }, '✕');
  const modeBtn = h('button', { class: 'x mode', type: 'button' });
  const setModeBtn = () => { const m = MODES.find((x) => x[0] === audioMode()) || MODES[0]; modeBtn.textContent = m[1]; modeBtn.title = m[2]; modeBtn.setAttribute('aria-label', `Audio mode: ${m[2]}. Tap to change.`); };
  modeBtn.onclick = () => {
    const i = MODES.findIndex((x) => x[0] === audioMode());
    setting('mode', MODES[(i + 1) % MODES.length][0]);
    setModeBtn();
    // re-plan what's left; redraw the current step if it no longer fits the mode
    const rest = adaptSteps(queue.slice(pos), audioMode());
    queue.splice(pos, queue.length - pos, ...rest);
    if (!answeredThis) render();
  };
  setModeBtn();
  const body = h('main', { class: 'sbody' });
  const foot = h('footer', { class: 'sfoot' });
  const fbtn = h('button', { class: 'btn primary wide', type: 'button' }, 'Continue');
  foot.append(fbtn);
  root.append(h('header', { class: 'stop' }, close, bar, comboEl, modeBtn), body, foot);
  document.body.append(root);
  document.body.classList.add('in-session');

  // Back gesture / back button closes the session instead of changing the page underneath
  history.pushState({ session: 1 }, '');
  const onPop = () => { leaving = true; exit(true); };
  let leaving = false;
  window.addEventListener('popstate', onPop);

  let answeredThis = false;
  function setFooter(label, fn, enabled = true) {
    fbtn.textContent = label; fbtn.disabled = !enabled; fbtn.onclick = fn;
    fbtn.style.visibility = fn ? '' : 'hidden';
    foot.classList.remove('good', 'bad'); foot.querySelector('.fb')?.remove(); foot.querySelector('.btn2')?.remove();
  }

  // drills only update cards that are due, so extra practice never resets a card
  const canGrade = (key) => key && ITEMS.has(key) && (kind !== 'drill' || (card(key) && card(key).due <= Date.now()));
  let shownAt = Date.now();

  function render() {
    leaveHooks.splice(0).forEach((f) => f());
    stop();
    if (pos >= queue.length) return finish();
    const step = queue[pos];
    bar.firstChild.style.width = `${(pos / total()) * 100}%`;
    body.innerHTML = '';
    body.scrollTop = 0;
    setFooter('Check', null, false);
    answeredThis = false;
    const ctx = {
      footer: setFooter,
      next: () => { pos++; render(); },
      onLeave: (f) => leaveHooks.push(f),
      grade: (key, ok) => { if (canGrade(key) && !step.noGrade) grade(key, ok ? 2 : 0); if (!ok && key) missed.add(key); logAnswer(ok); if (ok) { addXP(1); xp += 1; } },
      answer: (ok, info = {}) => {
        if (answeredThis) return; answeredThis = true;
        if (!info.auto) { answered++; if (ok) correct++; logAnswer(ok); }
        if (canGrade(step.key) && !info.noGrade && !step.noGrade) {
          // easy = first-try, quick, on a mature card that was actually due
          const c = card(step.key), fast = Date.now() - shownAt < 4500;
          const g = !ok ? 0 : step.retry ? 1 : (c && c.reps >= 2 && c.due <= Date.now() && fast) ? 3 : 2;
          grade(step.key, g);
        }
        if (!ok && step.key) missed.add(step.key);
        let gain = ok ? (info.auto ? 1 : 2) + (info.bonus || 0) : 0;
        if (ok) { combo++; bestCombo = Math.max(bestCombo, combo); if (combo >= 5 && combo % 5 === 0) gain += 2; } else combo = 0;
        if (gain) { addXP(gain); xp += gain; }
        comboEl.textContent = combo >= 3 ? `🔥 ${combo}` : '';
        if (!ok && !['speak', 'dq', 'match'].includes(step.type) && !step.retry && retries < MAX_RETRIES) {
          retries++; queue.push({ ...step, retry: true });
          bar.classList.add('grow'); setTimeout(() => bar.classList.remove('grow'), 900);
        }
        if (info.silent) { pos++; render(); return; }
        sfx(ok ? 'ok' : 'bad'); if (!ok) vibrate(60);
        showFeedback(ok, step, info);
      },
    };
    let node;
    try { node = EX[step.type](step, ctx); } catch (e) { console.error(e); pos++; return render(); }
    if (step.type === 'teach' && step.key) learnedNow.push(step.key);
    if (kind !== 'drill' && kind !== 'test' && step.key && step.type !== 'teach' && ITEMS.has(step.key)) introduce(step.key);
    body.append(node);
    shownAt = Date.now();
    root.focus({ preventScroll: true });
  }

  function showFeedback(ok, step, info) {
    const [hk, jp, en] = ok ? pick(PRAISE) : pick(OOPS);
    const fb = h('div', { class: 'fb', role: 'status', 'aria-live': 'polite' });
    fb.append(h('div', { class: 'fb-head' }, h('b', { lang: 'zh-HK' }, (ok ? '✓ ' : '✕ ') + hk), ' ', jpNode(jp), h('span', {}, ` · ${en}`)));
    const it = info.item;
    if (!ok && it) {
      fb.append(h('div', { class: 'fb-answer' }, speakerBtn(it.hk, 'sm'), h('div', {}, canto(it, { size: 'sm', forceJp: true }), h('div', { class: 'en-sm' }, R(it.en)))));
      if (!info.quiet) speak(it.hk);
    } else if (it && info.sentence) {
      fb.append(h('div', { class: 'fb-answer' }, speakerBtn(it.hk, 'sm'), h('div', { class: 'en-sm' }, R(it.en))));
    }
    if (info.reveal && ok) fb.append(h('div', { class: 'en-sm' }, R(info.reveal)));
    if (info.extra) fb.append(h('div', { class: 'en-sm' }, info.extra));
    setFooter('Continue', () => { pos++; render(); });
    foot.classList.add(ok ? 'good' : 'bad');
    if (ok && setting('autoNext') && ['listenPick', 'seePick', 'enPick', 'tone', 'gap', 'pair', 'num'].includes(step.type)) {
      const me = pos; setTimeout(() => { if (pos === me && !exited) { pos++; render(); } }, 1100);
    }
    foot.prepend(fb);
    fbtn.focus({ preventScroll: true });
  }

  function chip(key) {
    const it = ITEMS.get(key); if (!it) return null;
    const starred = S().stars.includes(key);
    const st = h('button', { class: 'star', type: 'button', 'aria-label': starred ? 'Unstar' : 'Star' }, starred ? '★' : '☆');
    st.onclick = (e) => { e.stopPropagation(); st.textContent = toggleStar(key) ? '★' : '☆'; };
    return h('div', { class: 'rchip', onclick: () => speak(it.hk) }, h('span', { lang: 'zh-HK', class: 'rhk' }, it.hk), jpNode(it.jp || ''), h('small', {}, R(it.en)), st);
  }

  function finish() {
    stop();
    const secs = Math.round((Date.now() - t0) / 1000);
    logTime(secs);
    const acc = answered ? correct / answered : 1;
    if (lessonId) { lessonDone(lessonId, acc); addXP(5); xp += 5; }
    const extraMsg = onDone ? onDone(acc) : null;
    sfx('done');
    bar.firstChild.style.width = '100%';
    const streak = streakAlive();
    const goal = S().goal, today = todayXP();
    const dues = [...learnedNow, ...missed].map((k) => card(k)?.due).filter(Boolean);
    const nextDue = dues.length ? Math.min(...dues) : 0;
    body.innerHTML = '';
    const newChips = [...new Set(learnedNow)].map(chip).filter(Boolean);
    const missChips = [...missed].filter((k) => k[0] === 'w').map(chip).filter(Boolean);
    body.append(h('div', { class: 'finish' },
      h('div', { class: 'stamp', lang: 'zh-HK' }, acc >= 0.9 ? '正' : acc >= 0.7 ? '好' : '得'),
      h('div', { class: 'stamp-jp' }, jpNode(acc >= 0.9 ? 'zeng3' : acc >= 0.7 ? 'hou2' : 'dak1'), acc >= 0.9 ? ' · superb' : acc >= 0.7 ? ' · good' : ' · done'),
      h('h2', {}, acc >= 0.9 ? 'Excellent session!' : acc >= 0.7 ? 'Nice work!' : 'Done — mistakes will come back for review.'),
      h('div', { class: 'done-stats' },
        stat(`+${xp}`, 'XP'), stat(`${Math.round(acc * 100)}%`, 'accuracy'), stat(fmtTime(secs), 'time'), stat(`🔥 ${streak}`, streak === 1 ? 'day streak' : 'days streak')),
      h('div', { class: 'goal-line' }, h('div', { class: 'goalbar' }, h('i', { style: { width: `${Math.min(100, (today / goal) * 100)}%` } })),
        h('span', {}, today >= goal ? 'Daily goal reached 🎉' : `${today} / ${goal} XP today`)),
      newChips.length ? h('div', { class: 'recap' }, h('h3', {}, `New words (${newChips.length})`), h('div', { class: 'rchips' }, ...newChips)) : null,
      missChips.length ? h('div', { class: 'recap' }, h('h3', {}, 'To review'), h('div', { class: 'rchips' }, ...missChips)) : null,
      nextDue ? h('p', { class: 'hint' }, `These come back for review ${fmtWhen(nextDue)}.`) : null,
      extraMsg ? h('p', { class: 'note' }, extraMsg) : null,
      bestCombo >= 5 ? h('p', { class: 'hint' }, `Best combo: ${bestCombo} in a row`) : null));
    if (onNext) {
      setFooter('Next lesson', () => exit(false, onNext));
      foot.append(h('button', { class: 'btn wide btn2', type: 'button', onclick: () => exit() }, 'Done for now'));
    } else setFooter('Continue', () => exit());
  }
  function stat(v, l) { return h('div', { class: 'stat' }, h('b', {}, v), h('span', {}, l)); }

  function quit() {
    if (pos > 0 && pos < queue.length && !confirm('Quit this session? Answers so far are saved.')) return;
    if (pos > 0) logTime(Math.round((Date.now() - t0) / 1000));
    exit();
  }
  let exited = false;
  function exit(fromPop = false, then = null) {
    if (exited) return; exited = true;
    leaveHooks.splice(0).forEach((f) => f());
    stop(); root.remove(); document.body.classList.remove('in-session');
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('popstate', onPop);
    if (!fromPop && history.state && history.state.session) backThen(then); else if (then) then();
    onExit && onExit();
  }
  function onKey(e) {
    if (e.key === 'Enter' && !fbtn.disabled && fbtn.style.visibility !== 'hidden') { e.preventDefault(); fbtn.click(); }
    const n = +e.key;
    if (n >= 1 && n <= 6) { const b = body.querySelectorAll('.opt, .tbtn')[n - 1]; if (b && !b.disabled) b.click(); }
    if (e.key === 'Escape') quit();
  }
  window.addEventListener('keydown', onKey);
  if (!queue.length) {
    body.append(h('div', { class: 'empty' }, h('p', {}, 'Nothing to practise here yet. Finish a lesson on the path first.')));
    setFooter('Back', () => exit());
    return;
  }
  render();
}
const fmtTime = (s) => (s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`);
function fmtWhen(t) {
  const d = t - Date.now();
  if (d < 36e5) return `in about ${Math.max(1, Math.round(d / 6e4))} min`;
  if (d < 864e5) return `in about ${Math.round(d / 36e5)} h`;
  return `in ${Math.round(d / 864e5)} days`;
}
