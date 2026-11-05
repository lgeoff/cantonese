// Conversation partner: calls an AI model straight from the browser with the learner's own key.
// The key lives only in this browser (separate from the progress backup) and is sent only to the
// provider's own API.
const KEY = 'gongdak.ai';

export const PROVIDERS = {
  gemini: {
    name: 'Google Gemini (free tier)',
    models: [['gemini-3.8-flash', 'Gemini 3.8 Flash · best'], ['gemini-3.5-flash-lite', 'Gemini 3.5 Flash-Lite · fastest']],
    keyHelp: 'aistudio.google.com/apikey',
    audio: true,
  },
  claude: {
    name: 'Anthropic Claude (paid)',
    models: [['claude-sonnet-5-5', 'Claude Sonnet 5.5 · best'], ['claude-haiku-5-5', 'Claude Haiku 5.5 · fastest']],
    keyHelp: 'console.anthropic.com',
    audio: false,
  },
};

export function aiConfig() {
  try { return { provider: 'gemini', key: '', model: '', listen: true, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; }
  catch (e) { return { provider: 'gemini', key: '', model: '', listen: true }; }
}
export function setAiConfig(patch) {
  const c = { ...aiConfig(), ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) { /* ignore */ }
  return c;
}
export const aiReady = () => !!aiConfig().key;
export const modelOf = (c = aiConfig()) => c.model || PROVIDERS[c.provider].models[0][0];
export const canHearAudio = (c = aiConfig()) => PROVIDERS[c.provider].audio && c.listen !== false;

export class AIError extends Error {
  constructor(kind, msg) { super(msg); this.kind = kind; }
}

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    heard: { type: 'STRING' },
    meant: { type: 'STRING' },
    verdict: { type: 'STRING', enum: ['great', 'ok', 'unclear', 'none'] },
    better: { type: 'OBJECT', properties: { hk: { type: 'STRING' }, jp: { type: 'STRING' }, en: { type: 'STRING' } } },
    tip: { type: 'STRING' },
    reply: { type: 'OBJECT', properties: { hk: { type: 'STRING' }, jp: { type: 'STRING' }, en: { type: 'STRING' } }, required: ['hk', 'jp', 'en'] },
    new_words: { type: 'ARRAY', items: { type: 'OBJECT', properties: { hk: { type: 'STRING' }, jp: { type: 'STRING' }, en: { type: 'STRING' } } } },
    hints: { type: 'ARRAY', items: { type: 'OBJECT', properties: { hk: { type: 'STRING' }, jp: { type: 'STRING' }, en: { type: 'STRING' } } } },
    end: { type: 'BOOLEAN' },
  },
  required: ['heard', 'meant', 'verdict', 'tip', 'reply', 'new_words', 'hints', 'end'],
  propertyOrdering: ['heard', 'meant', 'verdict', 'better', 'tip', 'reply', 'new_words', 'hints', 'end'],
};

// history: [{ role: 'user'|'model', text }]; audio: { mime, b64 } for the latest user turn (optional)
export async function chatTurn({ system, history, audio = null, signal }) {
  const c = aiConfig();
  if (!c.key) throw new AIError('nokey', 'Add an API key in Settings first.');
  const raw = c.provider === 'claude' ? await callClaude(c, system, history, signal) : await callGemini(c, system, history, audio, signal);
  return parseJSON(raw);
}

const noThinkCfg = new Set();
async function callGemini(c, system, history, audio, signal) {
  const contents = history.map((m, i) => {
    const parts = [{ text: m.text }];
    if (audio && i === history.length - 1) parts.unshift({ inline_data: { mime_type: audio.mime, data: audio.b64 } });
    return { role: m.role === 'model' ? 'model' : 'user', parts };
  });
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents,
    generationConfig: { temperature: 0.8, responseMimeType: 'application/json', responseSchema: SCHEMA, maxOutputTokens: 4096 },
  };
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelOf(c))}:generateContent`;
  // keep the model's thinking short so replies come quickly; older models reject the option
  if (!noThinkCfg.has(modelOf(c))) body.generationConfig.thinkingConfig = { thinkingLevel: 'low' };
  let r;
  try { r = await post(url, { 'Content-Type': 'application/json', 'x-goog-api-key': c.key }, body, signal); }
  catch (e) {
    if (e.kind !== 'other' || !/think/i.test(e.message) || !body.generationConfig.thinkingConfig) throw e;
    noThinkCfg.add(modelOf(c)); delete body.generationConfig.thinkingConfig;
    r = await post(url, { 'Content-Type': 'application/json', 'x-goog-api-key': c.key }, body, signal);
  }
  const j = await r.json();
  const cand = j.candidates && j.candidates[0];
  const text = cand && cand.content && cand.content.parts && cand.content.parts.map((p) => p.text || '').join('');
  if (!text) throw new AIError('empty', cand && cand.finishReason === 'SAFETY' ? 'The model declined to answer that one. Try saying it another way.' : 'The model sent an empty answer. Try again.');
  return text;
}

async function callClaude(c, system, history, signal) {
  // Claude has no audio input here; merge consecutive turns so roles alternate
  const messages = [];
  for (const m of history) {
    const role = m.role === 'model' ? 'assistant' : 'user';
    if (messages.length && messages[messages.length - 1].role === role) messages[messages.length - 1].content += '\n' + m.text;
    else messages.push({ role, content: m.text });
  }
  if (messages[0] && messages[0].role !== 'user') messages.unshift({ role: 'user', content: '(start)' });
  const body = { model: modelOf(c), max_tokens: 1500, temperature: 0.8, system: system + '\n\nAnswer with one JSON object only (no prose, no code fences), with exactly these keys: heard, meant, verdict, better {hk,jp,en} or null, tip, reply {hk,jp,en}, new_words [{hk,jp,en}], hints [{hk,jp,en}], end.', messages };
  const r = await post('https://api.anthropic.com/v1/messages', {
    'content-type': 'application/json', 'x-api-key': c.key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true',
  }, body, signal);
  const j = await r.json();
  return (j.content || []).map((b) => b.text || '').join('');
}

async function post(url, headers, body, signal) {
  let r;
  try { r = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal }); }
  catch (e) {
    if (e.name === 'AbortError') throw new AIError('abort', 'Cancelled.');
    throw new AIError('network', 'No connection to the AI service. Check your internet connection.');
  }
  if (r.ok) return r;
  let msg = '';
  try { const j = await r.json(); msg = (j.error && (j.error.message || j.error.type)) || ''; } catch (e) { /* ignore */ }
  if (r.status === 400 && /api key|API_KEY/i.test(msg)) throw new AIError('badkey', 'The API key was not accepted. Check it in Settings.');
  if (r.status === 401 || r.status === 403) throw new AIError('badkey', 'The API key was not accepted. Check it in Settings.');
  if (r.status === 429) throw new AIError('limit', 'Usage limit reached for now. Wait a minute, or switch to the faster model in Settings (it has a higher free limit).');
  if (r.status === 404) throw new AIError('model', `This model isn’t available for your key. Pick another model in Settings. (${msg})`);
  if (r.status >= 500 || r.status === 529) throw new AIError('busy', 'The AI service is busy. Try again in a moment.');
  throw new AIError('other', `The AI service returned an error (${r.status}). ${msg}`);
}

function parseJSON(text) {
  const t = text.replace(/^```(?:json)?\s*|\s*```$/g, '');
  try { return JSON.parse(t); } catch (e) { /* try the outermost object */ }
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch (e) { /* fall through */ } }
  throw new AIError('format', 'The model’s answer could not be read. Try again.');
}

export async function testKey() {
  const res = await chatTurn({ system: 'You are a test. Reply in the requested JSON with reply.hk "你好", reply.jp "nei5 hou2", reply.en "Hello", verdict "none", other strings empty, arrays empty, end false.', history: [{ role: 'user', text: '(start)' }] });
  if (!res.reply) throw new AIError('format', 'Unexpected answer.');
  return res;
}

// Recorded audio → 16 kHz mono WAV (base64), a format every model accepts.
export async function blobToWavB64(blob) {
  const C = window.AudioContext || window.webkitAudioContext;
  const ac = new C();
  const buf = await ac.decodeAudioData(await blob.arrayBuffer());
  ac.close().catch(() => {});
  const rate = 16000, ratio = buf.sampleRate / rate, n = Math.floor(buf.length / ratio);
  const src = buf.getChannelData(0), pcm = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.floor(i * ratio), b = Math.min(src.length, Math.floor((i + 1) * ratio));
    let s = 0; for (let k = a; k < b; k++) s += src[k];
    const v = Math.max(-1, Math.min(1, s / Math.max(1, b - a)));
    pcm[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
  }
  const out = new DataView(new ArrayBuffer(44 + pcm.length * 2));
  const w = (o, s) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); out.setUint32(4, 36 + pcm.length * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 1, true); out.setUint32(24, rate, true);
  out.setUint32(28, rate * 2, true); out.setUint16(32, 2, true); out.setUint16(34, 16, true); w(36, 'data'); out.setUint32(40, pcm.length * 2, true);
  for (let i = 0; i < pcm.length; i++) out.setInt16(44 + i * 2, pcm[i], true);
  const bytes = new Uint8Array(out.buffer);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return { mime: 'audio/wav', b64: btoa(bin), secs: n / rate };
}
