// Conversation practice: a live chat with an AI partner (learner's own API key), or an offline
// role-play of the course conversations. Answers can be spoken, typed in characters, Jyutping or
// any loose spelling; they are judged on meaning and sound, not on writing.
import { h, R, jpNode, sJP, esc, backThen } from './util.js';
import { UNITS, UNIT, learnedWords, ITEMS } from './course.js';
import { lessonState, addXP, logAnswer, logTime, setting } from './store.js';
import { canto, speakerBtn, ICON, recorderWidget } from './exercises.js';
import { speak, speakSlow, stop as stopSpeech, sfx, hasVoice } from './tts.js';
import * as SP from './speak.js';
import { loadJyut, fixJp, soundMatch } from './jyut.js';
import { aiConfig, aiReady, chatTurn, canHearAudio, blobToWavB64, AIError } from './llm.js';

// ---------------------------------------------------------------- scenes
// unit: the scene unlocks once that unit is started (null = always open)
export const SCENES = [
  { id: 'free', unit: null, emoji: '💬', en: 'Just chat', zh: '傾偈', jp: 'king1 gai2',
    role: 'a friendly Hong Kong friend chatting casually', learner: 'themselves', goal: 'have a relaxed chat about the learner’s day, family, food or plans; follow their lead' },
  { id: 'meet', unit: 'u03', emoji: '👋', en: 'Meeting a neighbour', zh: '識新朋友', jp: 'sik1 san1 pang4 jau5',
    role: 'Mrs Chan (陳太), a warm neighbour meeting the learner in the lift of their building', learner: 'a new neighbour', goal: 'greet each other, exchange names, say how you are, and say goodbye politely' },
  { id: 'about', unit: 'u04', emoji: '🙋', en: 'Where are you from?', zh: '自我介紹', jp: 'zi6 ngo5 gaai3 siu6',
    role: 'a curious classmate at a Cantonese class', learner: 'a fellow student', goal: 'find out where the learner is from, where they live, what languages they speak and what they do' },
  { id: 'fruit', unit: 'u05', emoji: '🍊', en: 'At the fruit stall', zh: '買生果', jp: 'maai5 saang1 gwo2',
    role: 'the friendly boss (老闆) of a fruit stall at a wet market', learner: 'a customer', goal: 'the learner asks prices, chooses how many to buy, pays and gets change' },
  { id: 'auntie', unit: 'u07', emoji: '👵', en: 'Visiting auntie', zh: '探姨媽', jp: 'taam3 ji4 maa1',
    role: 'the learner’s chatty auntie (姨媽) welcoming them home', learner: 'her nephew or niece', goal: 'auntie asks if they have eaten, about their family members and how they are; the learner answers' },
  { id: 'time', unit: 'u06', emoji: '📞', en: 'Arranging a time', zh: '約時間', jp: 'joek3 si4 gaan3',
    role: 'a friend calling the learner on the phone', learner: 'the friend', goal: 'agree on a day and time to meet, and where' },
  { id: 'cafe', unit: 'u08', emoji: '🥪', en: 'Ordering at a cha chaan teng', zh: '茶餐廳落單', jp: 'caa4 caan1 teng1 lok6 daan1',
    role: 'a busy but friendly waiter at a Hong Kong cha chaan teng', learner: 'a customer', goal: 'take the learner’s food and drink order (hot or iced, less sugar, no ice…), then bring the bill' },
  { id: 'way', unit: 'u09', emoji: '🗺️', en: 'Asking the way', zh: '問路', jp: 'man6 lou6',
    role: 'a helpful passer-by on a Hong Kong street', learner: 'someone who is lost', goal: 'the learner asks how to get to the MTR station or a place; you give simple directions' },
  { id: 'clothes', unit: 'u10', emoji: '👕', en: 'Shopping for clothes', zh: '買衫', jp: 'maai5 saam1',
    role: 'a shop assistant in a clothes shop', learner: 'a shopper', goal: 'help the learner find a size and colour, try it on, and pay' },
  { id: 'day', unit: 'u11', emoji: '⏰', en: 'Your daily routine', zh: '我嘅一日', jp: 'ngo5 ge3 jat1 jat6',
    role: 'a friendly colleague at lunch', learner: 'a colleague', goal: 'ask about the learner’s daily routine: when they get up, how they get to work, what they do after work' },
  { id: 'plans', unit: 'u18', emoji: '📅', en: 'Weekend plans', zh: '約朋友', jp: 'joek3 pang4 jau5',
    role: 'a good friend', learner: 'the friend', goal: 'make a plan together for the weekend: what to do, when and where to meet' },
  { id: 'weather', unit: 'u13', emoji: '🌦️', en: 'Weather small talk', zh: '講天氣', jp: 'gong2 tin1 hei3',
    role: 'a neighbour chatting at the bus stop', learner: 'a neighbour', goal: 'small talk about today’s weather, the forecast and how you feel about it' },
  { id: 'hobby', unit: 'u15', emoji: '🎾', en: 'Hobbies', zh: '興趣', jp: 'hing3 ceoi3',
    role: 'a new friend', learner: 'the friend', goal: 'talk about what you both like doing in your free time and maybe do something together' },
  { id: 'doctor', unit: 'u16', emoji: '🩺', en: 'At the doctor', zh: '睇醫生', jp: 'tai2 ji1 sang1',
    role: 'a kind family doctor', learner: 'a patient', goal: 'ask what is wrong, for how long, and give simple advice' },
  { id: 'work', unit: 'u17', emoji: '💼', en: 'Work and study', zh: '返工', jp: 'faan1 gung1',
    role: 'someone the learner meets at a party', learner: 'a guest', goal: 'talk about what you both do for work or study and how busy you are' },
  { id: 'opinion', unit: 'u19', emoji: '🤔', en: 'What do you think?', zh: '你點睇', jp: 'nei5 dim2 tai2',
    role: 'a friend who likes friendly debates', learner: 'the friend', goal: 'compare Hong Kong with where the learner lives (food, weather, prices, people) and give opinions with reasons' },
  { id: 'story', unit: 'u20', emoji: '📖', en: 'Tell me what happened', zh: '講故事', jp: 'gong2 gu3 si6',
    role: 'a friend who wants to hear about the learner’s last trip or weekend', learner: 'the friend', goal: 'the learner tells what happened, step by step; you react and ask follow-up questions' },
];

const started = (uid) => { const u = UNIT.get(uid); return !!u && u.lessons.some((l) => lessonState(l.id)); };
export const sceneOpen = (s) => !s.unit || started(s.unit);
function currentLevel() {
  let lv = 1;
  for (const u of UNITS) if (u.lessons.some((l) => lessonState(l.id))) lv = Math.max(lv, u.level || 1);
  return lv;
}
function knownWords() {
  let ws = learnedWords();
  if (ws.length < 25) {
    // a brand-new learner still gets the starter words to build on
    const extra = (UNIT.get('u01')?.words || []).filter((w) => w.kind === 'w');
    ws = [...ws, ...extra];
  }
  return [...new Set(ws.map((w) => w.hk))];
}

const LEVEL_DESC = {
  1: 'Level 1, beginner. Use very short, very common sentences (under about 10 characters). One idea per sentence.',
  2: 'Level 2, elementary. Short everyday sentences (under about 16 characters).',
  3: 'Level 3, intermediate. Natural everyday sentences, still fairly short.',
  4: 'Level 4, upper-intermediate. Natural speech, idioms allowed if glossed in new_words.',
};

function systemPrompt(scene, level, vocab, maxTurns) {
  return `You are a Cantonese conversation partner inside a learning app for an adult learner (they speak English and French).
SCENE: you are ${scene.role}. The learner is ${scene.learner}. Goal: ${scene.goal}.
LEARNER LEVEL: ${LEVEL_DESC[level] || LEVEL_DESC[2]}
WORDS THE LEARNER KNOWS (build your replies from these as much as possible): ${vocab.join(' ')}

YOUR REPLY (field "reply"):
- Spoken colloquial Hong Kong Cantonese in Traditional characters, the way people really talk: 係 唔 嘅 咗 啲 佢 冇 嘢 喺 哋 噉 咁 㗎 嚟 睇 畀 乜嘢 點解 邊度 而家 未. Never written Chinese or Mandarin forms (是 不 的 了 他 沒有 在 這 那 們 什麼 怎麼 現在).
- One short sentence, two at most. Ask only one simple question at a time so the learner knows what to answer.
- Use known words. At most ONE word the learner doesn't know per reply; put it in new_words. Write numbers in Chinese characters.
- reply.jp: Jyutping (LSHK) for every character, with tone numbers, syllables separated by single spaces, no punctuation. reply.en: natural English.
- React to what the learner actually said, stay in the scene, be warm. Never use English in reply.hk.
- If the learner was unclear, ask again more simply in Cantonese, or offer a choice (A定係B？).

EVALUATING THE LEARNER'S LAST TURN (heard, meant, verdict, better, tip):
- Their Chinese writing is weak. The turn may be: Chinese characters with wrong homophones, Jyutping with or without tone numbers, loose romanisation ("ngo seung yiu nai cha", "lo gan yu", "m goi", "hai a"), phone dictation with errors, an audio recording, English words for things they can't say yet, or a mix. Be tolerant: interpret by SOUND and context, and assume the most sensible meaning in this scene.
- heard: what they said, written as proper Cantonese characters (for audio: your transcription of what you actually heard).
- meant: a short English sentence of what they meant.
- verdict: "great" = clear and natural (a missing particle is still great); "ok" = understood but with real mistakes (wrong word, word order, Mandarin-style words, English words mixed in, or in audio a wrong tone or sound that changes the word); "unclear" = you cannot tell what they mean, or it was all English; "none" = the opening turn.
- better: the most natural way to say what THEY meant, close to their own words and level, never a different or longer answer (with hk, jp in the same Jyutping format, en). Use null when verdict is "great" and nothing needs changing.
- tip: at most 15 English words: the single most useful correction, for example a word choice, word order, a missing word, or for audio a tone or sound ("買 is maai5, rising, not maai6"). Empty string if nothing to add. Encouraging, never scolding. Never comment on missing tone numbers, spelling or the writing system. Write any Chinese in the tip as 漢字 (jyutping).

HINTS: two different short answers the learner could give to your reply, using known words (hk, jp, en).
END: set end to true when the goal is reached, or after about ${maxTurns} learner turns; the reply is then a natural closing line.
OPENING: when the learner turn is "(start)", open the scene with a greeting and a first simple question; verdict "none", heard, meant and tip are empty strings, better is null.`;
}

// ---------------------------------------------------------------- shared chat shell
function shell(title, sub, { onClose }) {
  const root = h('div', { class: 'convo', role: 'dialog', 'aria-modal': 'true', 'aria-label': title });
  const x = h('button', { class: 'x', type: 'button', 'aria-label': 'Close conversation' }, '✕');
  const enT = h('label', { class: 'switch sm' }, h('input', { type: 'checkbox', checked: setting('convoEn') ?? false, onchange: (e) => { setting('convoEn', e.target.checked); log.classList.toggle('en-on', e.target.checked); } }), h('span', {}, 'EN'));
  const head = h('header', { class: 'convo-head' }, x, h('div', { class: 'ct' }, h('b', {}, title), sub ? h('small', {}, sub) : null), enT);
  const log = h('main', { class: `convo-log ${setting('convoEn') ? 'en-on' : ''}`, 'aria-live': 'polite' });
  const foot = h('footer', { class: 'convo-foot' });
  root.append(head, log, foot);
  document.body.append(root);
  document.body.classList.add('in-session');
  history.pushState({ convo: 1 }, '');
  let closed = false;
  const onPop = () => close(true);
  window.addEventListener('popstate', onPop);
  function close(fromPop = false, then = null) {
    if (closed) return; closed = true;
    window.removeEventListener('popstate', onPop);
    stopSpeech(); SP.stopRecognition();
    root.remove(); document.body.classList.remove('in-session');
    if (!fromPop && history.state && history.state.convo) backThen(then); else if (then) then();
    onClose && onClose();
  }
  x.onclick = () => close();
  const scroll = () => { const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches; log.lastElementChild && log.lastElementChild.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'end' }); };
  return { root, log, foot, close, scroll, isClosed: () => closed };
}

function partnerBubble(item, emoji = '🙂') {
  const b = h('div', { class: 'cb them' },
    h('div', { class: 'who' }, emoji, speakerBtn(item.hk, 'sm'), speakerBtn(item.hk, 'sm', { slow: true })),
    canto(item, { size: 'sm', forceJp: true }),
    item.en ? h('button', { class: 'en-line', type: 'button', onclick: (e) => e.currentTarget.classList.add('shown') }, h('span', {}, R(item.en))) : null);
  return b;
}

// Input bar: mic (record for the AI, or phone dictation) + typing. Calls onSend({ text, audio, alts }).
function inputBar(foot, { onSend, useAudio, placeholder }) {
  foot.innerHTML = '';
  const ta = h('textarea', { rows: 1, class: 'say-text', placeholder, 'aria-label': 'Your answer', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' });
  const send = h('button', { class: 'send', type: 'button', 'aria-label': 'Send', disabled: true }, '➤');
  const canMic = useAudio ? SP.micSupported() : SP.recogSupported();
  const mic = h('button', { class: 'mic', type: 'button', 'aria-label': 'Speak your answer', disabled: !canMic, html: ICON.mic });
  const status = h('div', { class: 'say-status', role: 'status' });
  const row = h('div', { class: 'say-row' }, mic, ta, send);
  const extras = h('div', { class: 'say-extras' });
  foot.append(extras, status, row);
  ta.oninput = () => { send.disabled = !ta.value.trim(); ta.style.height = 'auto'; ta.style.height = Math.min(120, ta.scrollHeight) + 'px'; };
  ta.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (ta.value.trim()) go({ text: ta.value.trim() }); } };
  send.onclick = () => ta.value.trim() && go({ text: ta.value.trim() });
  let busy = false, rec = null;
  function go(x) { if (busy) return; ta.value = ''; ta.oninput(); onSend(x); }
  mic.onclick = async () => {
    if (busy) return;
    stopSpeech();
    if (useAudio) {
      if (rec) { rec.stop(); return; }
      try {
        rec = await SP.startRecording({ maxMs: 15000 });
        mic.classList.add('live'); status.textContent = 'Listening… tap the mic again when you’re done.';
        const r = await rec.done; rec = null;
        mic.classList.remove('live'); status.textContent = '';
        if (!r.blob || r.track.length < 10) { status.textContent = 'Nothing recorded. Try again.'; return; }
        const voiced = r.track.filter((p) => p.rms > 0.02).length;
        if (voiced < 6) { status.textContent = 'That was very quiet. Try again closer to the mic.'; return; }
        status.textContent = 'Preparing audio…';
        const audio = await blobToWavB64(r.blob);
        status.textContent = '';
        go({ audio, url: r.url });
      } catch (e) { rec = null; mic.classList.remove('live'); status.textContent = 'Microphone not available. Allow microphone access, or type your answer.'; }
    } else {
      mic.classList.add('live'); status.textContent = 'Listening…';
      try {
        const alts = await SP.recognize();
        mic.classList.remove('live'); status.textContent = '';
        if (!alts.length) { status.textContent = 'Nothing recognised. Try again, or type.'; return; }
        go({ text: alts[0], alts });
      } catch (e) { mic.classList.remove('live'); status.textContent = 'Speech recognition failed. Type your answer instead.'; }
    }
  };
  return {
    setBusy(b) { busy = b; mic.disabled = b || !canMic; send.disabled = b || !ta.value.trim(); ta.disabled = b; },
    extras, status, fill(t) { ta.value = t; ta.oninput(); ta.focus(); },
  };
}

function verdictChip(v) {
  const m = { great: ['✓', 'Natural'], ok: ['≈', 'Understood'], unclear: ['?', 'Not clear'] }[v];
  return m ? h('span', { class: `vchip v-${v}` }, h('b', {}, m[0]), m[1]) : null;
}

// "Say it" check for a model sentence: dictation when available, otherwise record & compare.
function sayIt(item) {
  const box = h('div', { class: 'sayit' });
  if (SP.recogSupported()) {
    const out = h('span', { class: 'hint' });
    const b = h('button', { class: 'chip', type: 'button', html: ICON.mic + ' Say it' });
    b.onclick = async () => {
      b.classList.add('live'); out.textContent = 'Listening…';
      try {
        const alts = await SP.recognize();
        const best = alts.map((a) => soundMatch(item.jp, a)).sort((x, y) => y.score - x.score)[0] || { score: 0 };
        out.textContent = !alts.length ? 'Nothing heard.' : best.score >= 0.8 ? '✓ Clear!' : best.score >= 0.55 ? '≈ Nearly — listen and try once more.' : `Heard “${alts[0]}”. Try again.`;
        sfx(best.score >= 0.8 ? 'ok' : 'bad');
      } catch (e) { out.textContent = 'Speech recognition failed.'; }
      b.classList.remove('live');
    };
    box.append(b, out);
  } else if (SP.micSupported()) box.append(recorderWidget(item.hk));
  return box;
}

// ---------------------------------------------------------------- AI conversation
export async function startConvo(scene, { onExit } = {}) {
  const level = currentLevel();
  const vocab = knownWords();
  const maxTurns = level <= 1 ? 6 : 8;
  const system = systemPrompt(scene, level, vocab, maxTurns);
  const useAudio = canHearAudio() && SP.micSupported();
  const t0 = Date.now();
  const S = shell(scene.en, `${scene.zh} ${scene.jp}`, { onClose: () => { ctl && ctl.abort(); logTime(Math.round((Date.now() - t0) / 1000)); onExit && onExit(); } });
  const hist = [];
  const turns = [];
  let ctl = null, ended = false, lastHints = [];
  const bar = inputBar(S.foot, {
    useAudio,
    placeholder: 'Type in Chinese, Jyutping or any spelling…',
    onSend: (x) => learnerTurn(x),
  });
  const hintBtn = h('button', { class: 'chip', type: 'button', onclick: () => showHints() }, '💡 Ideas');
  const doneBtn = h('button', { class: 'chip', type: 'button', onclick: () => finish() }, 'Finish');
  bar.extras.append(hintBtn, doneBtn);
  const hintBox = h('div', { class: 'hints' });
  S.foot.insertBefore(hintBox, bar.extras);
  function showHints() {
    hintBox.innerHTML = '';
    if (!lastHints.length) return;
    hintBox.append(...lastHints.map((x) => h('button', { class: 'hint-opt', type: 'button', onclick: () => { speak(x.hk); bar.fill(x.hk); hintBox.innerHTML = ''; } },
      h('span', { lang: 'zh-HK', class: 'hk' }, x.hk), jpNode(x.jp), h('small', {}, x.en))));
  }
  S.log.append(h('div', { class: 'convo-intro' },
    h('p', {}, R(`You’re ${scene.learner}; your partner is ${scene.role.replace(/\(.*?\)/g, '')}.`)),
    h('p', { class: 'hint' }, useAudio ? 'Tap the mic and speak, or type however you can: characters, Jyutping, loose spelling, or an English word when you’re stuck.' : 'Speak with the mic or type however you can: characters, Jyutping, loose spelling, or an English word when you’re stuck.')));

  await loadJyut().catch(() => {});
  await ask({ role: 'user', text: '(start)' }, null);

  function pending() {
    const p = h('div', { class: 'cb them typing', 'aria-label': 'Partner is typing' }, h('i'), h('i'), h('i'));
    S.log.append(p); S.scroll();
    return p;
  }
  function clean(item) {
    if (!item || !item.hk) return null;
    return { hk: item.hk.trim(), jp: fixJp(item.hk, item.jp || ''), en: (item.en || '').trim() };
  }
  async function ask(userMsg, mine, audio = null) {
    hist.push(userMsg);
    bar.setBusy(true); hintBox.innerHTML = '';
    const p = pending();
    ctl = new AbortController();
    let res;
    try {
      res = await chatTurn({ system, history: hist, audio, signal: ctl.signal });
    } catch (e) {
      p.remove();
      if (S.isClosed()) return;
      hist.pop();
      const err = h('div', { class: 'convo-err', role: 'alert' }, h('p', {}, e instanceof AIError ? e.message : 'Something went wrong. Try again.'));
      if (!(e instanceof AIError) || !['nokey', 'badkey'].includes(e.kind)) err.append(h('button', { class: 'btn sm', type: 'button', onclick: () => { err.remove(); ask(userMsg, mine, audio); } }, 'Try again'));
      else err.append(h('button', { class: 'btn sm', type: 'button', onclick: () => S.close(false, () => openAiSetup()) }, 'Open AI settings'));
      S.log.append(err); S.scroll();
      bar.setBusy(false);
      return;
    }
    p.remove();
    if (S.isClosed()) return;
    // keep the transcript, not the audio, in the running history
    if (audio && res.heard) hist[hist.length - 1] = { role: 'user', text: `LEARNER (spoke): "${res.heard}"` };
    const reply = clean(res.reply);
    hist.push({ role: 'model', text: JSON.stringify({ heard: res.heard || '', verdict: res.verdict, reply: res.reply, end: !!res.end }) });
    if (mine) feedback(mine, res);
    if (reply) {
      const b = partnerBubble(reply, scene.emoji);
      const nw = (res.new_words || []).map(clean).filter(Boolean);
      if (nw.length) b.append(h('div', { class: 'new-words' }, h('small', {}, 'New:'), ...nw.map((w) => h('button', { class: 'gl', type: 'button', onclick: () => speak(w.hk) }, h('span', { lang: 'zh-HK' }, w.hk), jpNode(w.jp), h('small', {}, w.en)))));
      S.log.append(b); S.scroll();
      turns.newWords = [...(turns.newWords || []), ...nw];
      if (setting('mode') !== 'mute') speak(reply.hk);
    }
    lastHints = (res.hints || []).map(clean).filter(Boolean).slice(0, 3);
    bar.setBusy(false);
    if (res.end) { ended = true; setTimeout(finish, 1200); }
  }
  async function learnerTurn(x) {
    if (ended) return;
    const mine = h('div', { class: 'cb me' });
    if (x.audio) {
      const a = new Audio(x.url);
      mine.append(h('button', { class: 'chip', type: 'button', onclick: () => { a.currentTime = 0; a.play(); } }, `▶ Your voice · ${Math.max(1, Math.round(x.audio.secs))} s`));
    } else mine.append(h('div', { class: 'typed', lang: 'zh-HK' }, x.text));
    S.log.append(mine); S.scroll();
    const n = turns.length + 1;
    let text;
    if (x.audio) text = `LEARNER TURN ${n} (spoke; the recording is attached).`;
    else if (x.alts) text = `LEARNER TURN ${n} (phone dictation, may contain homophone errors): "${x.alts.slice(0, 3).join('" / "')}"`;
    else text = `LEARNER TURN ${n} (typed): "${x.text}"`;
    await ask({ role: 'user', text }, mine, x.audio ? { mime: x.audio.mime, b64: x.audio.b64 } : null);
  }
  function feedback(mine, res) {
    const v = res.verdict === 'none' ? 'ok' : res.verdict;
    const heard = clean({ hk: res.heard, jp: '' });
    const better = clean(res.better);
    const fb = h('div', { class: `fb v-${v}` }, verdictChip(v));
    if (heard && heard.hk) fb.append(h('div', { class: 'heard' }, h('small', {}, 'You said'), canto(heard, { size: 'sm', forceJp: true })));
    if (res.meant) fb.append(h('div', { class: 'meant' }, R(`“${res.meant}”`)));
    if (better && (!heard || better.hk !== heard.hk)) {
      fb.append(h('div', { class: 'better' }, h('small', {}, v === 'great' ? 'Also natural' : 'Try saying'),
        h('div', { class: 'row' }, speakerBtn(better.hk, 'sm'), canto(better, { size: 'sm', forceJp: true })), sayIt(better)));
    }
    if (res.tip) fb.append(h('p', { class: 'tip' }, R(res.tip)));
    mine.append(fb);
    turns.push({ verdict: v, heard, better, meant: res.meant, tip: res.tip });
    const ok = v !== 'unclear';
    logAnswer(ok); addXP(v === 'great' ? 3 : v === 'ok' ? 2 : 1);
    sfx(ok ? 'ok' : 'bad');
  }
  function finish() {
    if (S.isClosed()) return;
    bar.setBusy(true);
    S.foot.innerHTML = '';
    const n = turns.length;
    const great = turns.filter((t) => t.verdict === 'great').length, ok = turns.filter((t) => t.verdict === 'ok').length;
    if (n >= 3) addXP(5);
    const fixes = turns.filter((t) => t.better && t.verdict !== 'great');
    const card = h('section', { class: 'convo-sum' },
      h('h2', {}, n ? 'Conversation done' : 'See you next time'),
      n ? h('p', {}, `${n} answer${n > 1 ? 's' : ''}: ${great} natural, ${ok} understood${n - great - ok ? `, ${n - great - ok} not clear` : ''}.`) : null);
    if (fixes.length) card.append(h('h3', {}, 'Phrases to practise'), ...fixes.map((t) => h('div', { class: 'sum-row' }, speakerBtn(t.better.hk, 'sm'), h('div', {}, canto(t.better, { size: 'sm', forceJp: true }), h('small', {}, R(t.better.en || t.meant || ''))))));
    if (turns.newWords && turns.newWords.length) card.append(h('h3', {}, 'New words you heard'), h('div', { class: 'new-words' }, ...turns.newWords.map((w) => h('button', { class: 'gl', type: 'button', onclick: () => speak(w.hk) }, h('span', { lang: 'zh-HK' }, w.hk), jpNode(w.jp), h('small', {}, w.en)))));
    S.log.append(card); S.scroll();
    S.foot.append(h('div', { class: 'row' }, h('button', { class: 'btn primary wide', type: 'button', onclick: () => S.close() }, 'Done'),
      h('button', { class: 'btn wide', type: 'button', onclick: () => S.close(false, () => startConvo(scene, { onExit })) }, 'Talk again')));
  }
}

// ---------------------------------------------------------------- offline role-play of course dialogues
export function startRoleplay(u, { onExit } = {}) {
  const d = u.dialogue;
  const lines = d.lines.map((l) => ({ ...l, jp: (l.jp || sJP(l.parts)).replace(/[^a-z1-6\s]/gi, ' ').replace(/\s+/g, ' ').trim() }));
  const spk = [...new Set(lines.map((l) => l.spk))].filter((s) => s !== 'N');
  const S = shell(`Role-play: ${d.title}`, u.title, { onClose: () => onExit && onExit() });
  S.log.append(h('div', { class: 'convo-intro' }, h('p', {}, 'Which part do you want to play?'),
    h('div', { class: 'row wrap' }, ...spk.map((s) => h('button', { class: 'btn sm', type: 'button', onclick: (e) => { e.currentTarget.closest('.convo-intro').remove(); begin(s); } }, `Speaker ${s} (${lines.filter((l) => l.spk === s).length} lines)`)))));
  let me = null, i = 0, score = 0, mine = 0;
  const useRecog = SP.recogSupported();
  let bar = null;
  function begin(s) {
    me = s;
    bar = inputBar(S.foot, { useAudio: false, placeholder: 'Say it, or type in characters, Jyutping or any spelling…', onSend: check });
    loadJyut().then(next, next);
  }
  function next() {
    if (S.isClosed()) return;
    bar.setBusy(true);
    if (i >= lines.length) return done();
    const l = lines[i];
    if (l.spk !== me) {
      S.log.append(partnerBubble(l, '🙂')); S.scroll();
      i++;
      if (setting('mode') !== 'mute' && hasVoice()) speak(l.hk, { onend: () => setTimeout(next, 350) }); else setTimeout(next, 900);
      return;
    }
    // learner's line: show the meaning, hide the answer behind hints
    const hint = h('div', { class: 'cb cue' }, h('small', {}, 'Your line — say this in Cantonese:'), h('b', {}, R(l.en)));
    let level = 0;
    const hb = h('button', { class: 'chip', type: 'button' }, '💡 Hint');
    const reveal = h('div', { class: 'reveal-box' });
    hb.onclick = () => {
      level++;
      reveal.innerHTML = '';
      if (level === 1) reveal.append(jpNode(l.jp.split(' ').map((s, k) => (k === 0 ? s : s.replace(/[a-z]+/, (m) => m[0] + '·'.repeat(m.length - 1)))).join(' ')));
      if (level >= 2) { reveal.append(jpNode(l.jp)); hb.textContent = '🔊 Hear it'; }
      if (level >= 3) speak(l.hk);
    };
    hint.append(h('div', { class: 'row wrap' }, hb), reveal);
    S.log.append(hint); S.scroll();
    bar.setBusy(false);
    bar.status.textContent = useRecog ? 'Tap the mic and say your line, or type it.' : 'Type your line however you can.';
  }
  function check(x) {
    const l = lines[i];
    const attempts = x.alts || [x.text];
    const best = attempts.map((a) => ({ a, ...soundMatch(l.jp, a) })).sort((p, q) => q.score - p.score)[0];
    const v = best.score >= 0.8 ? 'great' : best.score >= 0.55 ? 'ok' : 'unclear';
    const b = h('div', { class: 'cb me' }, h('div', { class: 'typed', lang: 'zh-HK' }, best.a));
    const fb = h('div', { class: `fb v-${v}` }, verdictChip(v));
    const marked = h('div', { class: 'jp marked' });
    marked.innerHTML = l.jp.split(' ').map((s, k) => `<span class="${best.hit[k] ? 'hit' : 'miss'}">${esc(s)}</span>`).join(' ');
    fb.append(h('div', { class: 'better' }, h('small', {}, v === 'great' ? 'The line' : 'The line was'), h('div', { class: 'row' }, speakerBtn(l.hk, 'sm'), h('div', { class: 'canto canto-sm' }, h('div', { class: 'hk', lang: 'zh-HK' }, l.hk), marked))));
    if (best.toneMiss.length && v !== 'unclear') fb.append(h('p', { class: 'tip' }, 'Check the tones on the highlighted syllables — listen once more.'));
    b.append(fb);
    S.log.append(b); S.scroll();
    logAnswer(v !== 'unclear'); addXP(v === 'great' ? 2 : 1);
    sfx(v === 'unclear' ? 'bad' : 'ok');
    mine++; score += best.score;
    if (v === 'unclear') {
      bar.status.textContent = '';
      b.append(h('div', { class: 'row wrap' },
        h('button', { class: 'chip', type: 'button', onclick: (e) => { e.currentTarget.parentNode.remove(); bar.status.textContent = 'Try again.'; } }, '↻ Try again'),
        h('button', { class: 'chip', type: 'button', onclick: (e) => { e.currentTarget.parentNode.remove(); i++; next(); } }, 'Continue →')));
      return;
    }
    i++;
    setTimeout(() => (setting('mode') !== 'mute' && hasVoice() ? speak(l.hk, { onend: () => setTimeout(next, 300) }) : next()), 400);
  }
  function done() {
    S.foot.innerHTML = '';
    if (mine >= 2) addXP(3);
    S.log.append(h('section', { class: 'convo-sum' }, h('h2', {}, 'Role-play done'),
      h('p', {}, `You said ${mine} line${mine === 1 ? '' : 's'}${mine ? `, average match ${Math.round((100 * score) / mine)} %` : ''}.`),
      h('p', { class: 'hint' }, 'Play the other part next time to learn both sides.')));
    S.scroll();
    S.foot.append(h('button', { class: 'btn primary wide', type: 'button', onclick: () => S.close() }, 'Done'));
  }
}

// ---------------------------------------------------------------- entry points used by screens
let openAiSetup = () => {};
export function setAiSetupOpener(f) { openAiSetup = f; }

export function convoSection({ refresh, showAll = false, onToggleAll }) {
  const sec = h('section', { class: 'lab convo-lab' },
    h('h2', {}, 'Conversation'),
    h('p', {}, 'Talk with an AI partner using the words you know. Speak or type however you can; it understands loose spelling and corrects you gently.'));
  if (!aiReady()) {
    sec.append(h('div', { class: 'ai-cta' },
      h('p', {}, h('b', {}, 'Set up your AI partner'), h('br'), h('small', {}, 'Free with a Google Gemini key. It takes about two minutes.')),
      h('button', { class: 'btn primary sm', type: 'button', onclick: () => openAiSetup() }, 'Set up')));
  }
  const list = h('div', { class: 'scene-list' });
  const scenes = SCENES.filter((s) => showAll || sceneOpen(s));
  for (const s of scenes) {
    const open = sceneOpen(s);
    const u = s.unit && UNIT.get(s.unit);
    list.append(h('button', { class: `scene ${open ? '' : 'locked'}`, type: 'button', disabled: !aiReady(), onclick: () => startConvo(s, { onExit: refresh }) },
      h('span', { class: 'se' }, s.emoji),
      h('span', {}, h('b', {}, s.en), h('small', {}, h('span', { lang: 'zh-HK' }, s.zh), ' ', jpNode(s.jp)), !open && u ? h('small', { class: 'later' }, `Best after “${u.title}”`) : null)));
  }
  sec.append(list);
  const lockedN = SCENES.filter((s) => !sceneOpen(s)).length;
  if (lockedN) sec.append(h('button', { class: 'link', type: 'button', onclick: onToggleAll }, showAll ? 'Show only the scenes for what I’ve learnt' : `Show ${lockedN} more scenes`));
  // offline role-play
  const dUnits = UNITS.filter((u) => u.dialogue && u.lessons.some((l) => lessonState(l.id)));
  const rp = h('details', { class: 'gloss rp' }, h('summary', {}, 'Offline: role-play a course conversation'),
    h('p', { class: 'hint' }, 'No AI needed. You play one side of a conversation from the course; your answer is checked by sound.'));
  if (!dUnits.length) rp.append(h('p', { class: 'hint' }, 'Start a unit to unlock its conversation.'));
  for (const u of dUnits) rp.append(h('button', { class: 'dlg-item', type: 'button', onclick: () => startRoleplay(u, { onExit: refresh }) }, h('span', {}, u.emoji), h('span', {}, h('b', {}, R(u.dialogue.title)), h('small', {}, u.title))));
  sec.append(rp);
  return sec;
}
