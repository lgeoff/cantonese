import { loadCourse } from './course.js';
import { renderPath, renderPractice, renderWords, renderSpeak, renderMe, setRefresh } from './screens.js';
import { h } from './util.js';

const ROUTES = { path: renderPath, practice: renderPractice, words: renderWords, speak: renderSpeak, me: renderMe };

function route() {
  const r = (location.hash.replace(/^#\/?/, '') || 'path').split('/')[0];
  const fn = ROUTES[r] || renderPath;
  document.querySelectorAll('.tabbar a').forEach((a) => a.setAttribute('aria-current', a.dataset.r === r ? 'page' : 'false'));
  fn();
  document.getElementById('view').focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

async function init() {
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
