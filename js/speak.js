// Speaking tools: record & play back, speech recognition check, pitch tracking for tones.

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
export const recogSupported = () => !!SR;
export const micSupported = () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);

const isApple = /iPhone|iPad|Macintosh/.test(navigator.userAgent) && !/Chrome|CriOS|Android/.test(navigator.userAgent);
const LANGS = isApple ? ['zh-HK', 'yue-Hant-HK'] : ['yue-Hant-HK', 'zh-HK'];
let workingLang = null;

// Listen once and return the transcript alternatives.
export function recognize({ onstart } = {}) {
  return new Promise((resolve, reject) => {
    if (!SR) return reject(new Error('unsupported'));
    const langs = workingLang ? [workingLang] : LANGS.slice();
    const attempt = () => {
      const lang = langs.shift();
      const r = new SR();
      r.lang = lang; r.interimResults = false; r.maxAlternatives = 5; r.continuous = false;
      let got = false;
      r.onstart = () => onstart && onstart();
      r.onresult = (e) => {
        got = true; workingLang = lang;
        const alts = [];
        for (let i = 0; i < e.results[0].length; i++) alts.push(e.results[0][i].transcript);
        resolve(alts);
      };
      r.onerror = (e) => {
        if ((e.error === 'language-not-supported' || e.error === 'bad-grammar') && langs.length) return attempt();
        if (!got) reject(new Error(e.error || 'error'));
      };
      r.onend = () => { if (!got) resolve([]); };
      try { r.start(); } catch (err) { reject(err); }
      recognize.current = r;
    };
    attempt();
  });
}
export function stopRecognition() { try { recognize.current && recognize.current.stop(); } catch (e) { /* ignore */ } }

// Normalise common alternative spellings so the comparison is fair.
const VARIANTS = [['宜家', '而家'], ['鐘意', '鍾意'], ['中意', '鍾意'], ['俾', '畀'], ['呀', '啊'], ['咁', '噉'], ['系', '係'], ['我地', '我哋'], ['你地', '你哋'], ['佢地', '佢哋'], ['野', '嘢'], ['D', '啲'], ['d', '啲'], ['無', '冇'], ['裡', '裏'], ['着', '著'], ['喇', '啦'], ['嘞', '啦'], ['吖', '啊'], ['㗎', '嘎']];
const DIGITS = '零一二三四五六七八九';
export function norm(s) {
  s = (s || '').replace(/[0-9]/g, (d) => DIGITS[+d]);
  for (const [a, b] of VARIANTS) s = s.split(a).join(b);
  return s.replace(/[\s，。？！、,.?!:;：；"'「」]/g, '');
}

// Character-level alignment (LCS). Returns score 0..1 and which target chars were heard.
export function compare(target, heardAlts) {
  const T = [...norm(target)];
  let best = { score: 0, hit: T.map(() => false), heard: heardAlts[0] || '' };
  for (const alt of heardAlts) {
    const H = [...norm(alt)];
    const m = T.length, n = H.length;
    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++)
      dp[i][j] = T[i - 1] === H[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    const hit = T.map(() => false);
    for (let i = m, j = n; i > 0 && j > 0;) {
      if (T[i - 1] === H[j - 1]) { hit[i - 1] = true; i--; j--; } else if (dp[i - 1][j] >= dp[i][j - 1]) i--; else j--;
    }
    const lcs = dp[m][n];
    const score = m ? (2 * lcs) / (m + Math.max(n, 1)) : 0;
    if (score > best.score) best = { score, hit, heard: alt };
  }
  return best;
}

// ---------- recorder with live pitch tracking ----------
let stream = null;
async function getStream() {
  if (stream && stream.active) return stream;
  stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  return stream;
}
export function releaseMic() { if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; } }

export async function startRecording({ onPitch, maxMs = 6000 } = {}) {
  const st = await getStream();
  const chunks = [];
  let rec = null;
  if (window.MediaRecorder) {
    const type = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', ''].find((t) => !t || MediaRecorder.isTypeSupported(t));
    rec = new MediaRecorder(st, type ? { mimeType: type } : undefined);
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.start();
  }
  const C = window.AudioContext || window.webkitAudioContext;
  const ac = new C();
  const src = ac.createMediaStreamSource(st);
  const an = ac.createAnalyser(); an.fftSize = 2048;
  src.connect(an);
  const buf = new Float32Array(an.fftSize);
  const track = [];
  const t0 = performance.now();
  let raf = 0, stopped = false, level = 0;
  const tick = () => {
    if (stopped) return;
    an.getFloatTimeDomainData(buf);
    const { f0, rms } = detectPitch(buf, ac.sampleRate);
    level = rms;
    const t = performance.now() - t0;
    track.push({ t, f0, rms });
    onPitch && onPitch(track, rms);
    if (t > maxMs) { stop(); return; }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  let resolveStop;
  const done = new Promise((r) => (resolveStop = r));
  function stop() {
    if (stopped) return done; stopped = true;
    cancelAnimationFrame(raf);
    const finish = () => {
      ac.close().catch(() => {});
      const blob = chunks.length ? new Blob(chunks, { type: chunks[0].type || 'audio/webm' }) : null;
      resolveStop({ url: blob ? URL.createObjectURL(blob) : null, track });
    };
    if (rec && rec.state !== 'inactive') { rec.onstop = finish; rec.stop(); } else finish();
    return done;
  }
  return { stop, done, level: () => level };
}

// Autocorrelation pitch detector (good enough for a single voice on a phone mic).
export function detectPitch(buf, sr) {
  let rms = 0;
  for (let i = 0; i < buf.length; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / buf.length);
  if (rms < 0.012) return { f0: 0, rms };
  const minLag = Math.floor(sr / 420), maxLag = Math.floor(sr / 70);
  const n = buf.length - maxLag;
  let best = 0, bestLag = 0;
  const corr = new Float32Array(maxLag + 1);
  for (let lag = minLag; lag <= maxLag; lag++) {
    let s = 0, e1 = 0, e2 = 0;
    for (let i = 0; i < n; i++) { s += buf[i] * buf[i + lag]; e1 += buf[i] * buf[i]; e2 += buf[i + lag] * buf[i + lag]; }
    const c = s / Math.sqrt(e1 * e2 + 1e-9);
    corr[lag] = c;
    if (c > best) { best = c; bestLag = lag; }
  }
  if (best < 0.75) return { f0: 0, rms };
  // prefer the smallest lag whose correlation is close to the best (avoid octave errors)
  for (let lag = minLag; lag < bestLag; lag++) {
    if (corr[lag] > best * 0.93 && corr[lag] >= corr[lag - 1] && corr[lag] >= corr[lag + 1]) { bestLag = lag; break; }
  }
  const a = corr[bestLag - 1] || 0, b = corr[bestLag], c = corr[bestLag + 1] || 0;
  const shift = (a - c) / (2 * (a - 2 * b + c) || 1);
  return { f0: sr / (bestLag + (isFinite(shift) ? shift : 0)), rms };
}

// Reduce a pitch track to the voiced section, smoothed, as semitones.
export function contour(track) {
  const voiced = track.filter((p) => p.f0 > 0);
  if (voiced.length < 4) return [];
  const st = voiced.map((p) => ({ t: p.t, s: 12 * Math.log2(p.f0 / 100) }));
  // median filter to kill octave jumps
  const med = st.map((p, i) => {
    const w = st.slice(Math.max(0, i - 2), i + 3).map((q) => q.s).sort((x, y) => x - y);
    return { t: p.t, s: w[Math.floor(w.length / 2)] };
  });
  return med;
}

// Map semitones to the 1–5 Chao scale using a calibrated range (or the contour itself).
export function toChao(pts, low, high) {
  if (!pts.length) return [];
  const lo = low ? 12 * Math.log2(low / 100) : null, hi = high ? 12 * Math.log2(high / 100) : null;
  if (lo !== null && hi !== null && hi - lo > 2) return pts.map((p) => ({ t: p.t, c: 1 + 4 * (p.s - lo) / (hi - lo) }));
  const mean = pts.reduce((a, p) => a + p.s, 0) / pts.length;
  return pts.map((p) => ({ t: p.t, c: 3 + (p.s - mean) / 2.2 }));
}
export const median = (a) => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)] || 0; };
