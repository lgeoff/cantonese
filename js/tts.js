// Cantonese text-to-speech through the device's own voices (Web Speech API).
import { setting } from './store.js';

let voices = [];
let ready = false;
const listeners = [];

function isCanto(v) {
  const l = (v.lang || '').toLowerCase().replace('_', '-');
  const n = (v.name || '').toLowerCase();
  return l === 'zh-hk' || l.startsWith('yue') || l === 'zh-yue' || n.includes('cantonese') || n.includes('粵') || n.includes('廣東') || n.includes('sin-ji') || n.includes('sinji');
}

function refresh() {
  if (!('speechSynthesis' in window)) return;
  voices = speechSynthesis.getVoices().filter(isCanto);
  ready = true;
  listeners.splice(0).forEach((f) => f());
}
if ('speechSynthesis' in window) {
  refresh();
  speechSynthesis.addEventListener?.('voiceschanged', refresh);
  // Some browsers only fill the list after a delay
  setTimeout(refresh, 400); setTimeout(refresh, 1500);
}

export const supported = () => 'speechSynthesis' in window;
export const cantoVoices = () => voices;
export function hasVoice() { return voices.length > 0; }
export function whenReady(f) { ready ? f() : listeners.push(f); }

function chooseVoice() {
  const want = setting('voice');
  return voices.find((v) => v.voiceURI === want) ||
    voices.find((v) => /premium|enhanced|natural|neural|online/i.test(v.name)) ||
    voices[0] || null;
}

let current = null;
export function speak(text, { rate, onend } = {}) {
  if (!supported() || !text) { onend && onend(); return; }
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.replace(/[，、]/g, '，'));
    const v = chooseVoice();
    if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'zh-HK';
    u.rate = rate ?? setting('rate') ?? 0.85;
    u.pitch = 1;
    current = u;
    u.onend = () => { if (current === u) current = null; onend && onend(); };
    u.onerror = () => { onend && onend(); };
    speechSynthesis.speak(u);
    // iOS sometimes pauses the queue; nudge it
    if (speechSynthesis.paused) speechSynthesis.resume();
  } catch (e) { console.warn(e); onend && onend(); }
}
export const speakSlow = (text, o = {}) => speak(text, { ...o, rate: 0.55 });
export function stop() { try { speechSynthesis.cancel(); } catch (e) { /* ignore */ } }

// ---------- small sound effects (Web Audio, no files) ----------
let ac = null;
function ctx() { if (!ac) { const C = window.AudioContext || window.webkitAudioContext; if (C) ac = new C(); } return ac; }
export function sfx(kind) {
  if (!setting('sfx')) return;
  const c = ctx(); if (!c) return;
  const notes = { ok: [660, 880], bad: [220, 180], done: [523, 659, 784, 1046], tap: [500] }[kind] || [440];
  const t0 = c.currentTime;
  notes.forEach((f, i) => {
    const o = c.createOscillator(), g = c.createGain();
    o.type = kind === 'bad' ? 'triangle' : 'sine';
    o.frequency.value = f;
    const s = t0 + i * (kind === 'done' ? 0.09 : 0.07);
    g.gain.setValueAtTime(0.0001, s);
    g.gain.exponentialRampToValueAtTime(kind === 'tap' ? 0.05 : 0.12, s + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, s + 0.18);
    o.connect(g).connect(c.destination);
    o.start(s); o.stop(s + 0.2);
  });
}

// iOS only lets speech start from a user gesture the first time: unlock on first tap.
function unlock() {
  try {
    if ('speechSynthesis' in window) { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); }
    const c = ctx(); if (c && c.state === 'suspended') c.resume();
  } catch (e) { /* ignore */ }
  window.removeEventListener('pointerdown', unlock, true);
}
window.addEventListener('pointerdown', unlock, true);
