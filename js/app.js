import { loadCourse } from './course.js';
import { renderPath, renderPractice, renderWords, renderSpeak, renderMe, setRefresh, applyTheme } from './screens.js';
import { h, TONES, toneGlyph } from './util.js';
import { speak } from './tts.js';

const ROUTES = { path: renderPath, practice: renderPractice, words: renderWords, speak: renderSpeak, me: renderMe };

function route() {
  const r = (location.hash.replace(/^#\/?/, '') || 'path').split('/')[0];
  const fn = ROUTES[r] || renderPath;
  document.querySelectorAll('.tabbar a').forEach((a) => a.setAttribute('aria-current', a.dataset.r === r ? 'page' : 'false'));
  fn();
  document.getElementById('view').focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

const TONE_EX = { 1: '詩', 2: '史', 3: '試', 4: '時', 5: '市', 6: '事' };
let pop = null;
document.addEventListener('click', (e) => {
  const sy = e.target.closest('.sy');
  if (pop) { pop.remove(); pop = null; }
  if (!sy || sy.closest('button')) return;
  const t = +((sy.className.match(/t([1-6])/) || [])[1]);
  if (!t) return;
  const r = sy.getBoundingClientRect();
  pop = h('div', { class: 'tone-pop', role: 'status' });
  pop.innerHTML = `<span class="t${t}">${toneGlyph(t, 26)}</span><b>Tone ${t}</b> · ${TONES[t].name}<small>like ${TONES[t].ex}</small>`;
  document.body.append(pop);
  const w = pop.offsetWidth;
  pop.style.left = `${Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2))}px`;
  pop.style.top = `${r.bottom + window.scrollY + 6}px`;
  speak(TONE_EX[t]);
  setTimeout(() => { if (pop) { pop.remove(); pop = null; } }, 2600);
});

async function init() {
  applyTheme();
  try {
    await loadCourse();
  } catch (e) {
    document.getElementById('view').append(h('div', { class: 'empty' }, 'Could not load the course data. Check your connection and reload.'));
    console.error(e);
    return;
  }
  setRefresh(() => route());
  window.addEventListener('hashchange', route);
  route();
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}
init();
