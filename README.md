# 識講 Sik Gong — learn Hong Kong Cantonese

A static, offline-capable web app for learning Cantonese in short sessions on your phone.
Progress is stored in your browser (localStorage); use **Progress → Export backup** now and then.

**Open it:** https://lgeoff.github.io/cantonese/ — then "Add to Home Screen" so it runs like an app
and the browser keeps your progress.

## How it teaches
- **Spaced repetition** — every word and sentence you meet is scheduled to come back just before you'd forget it.
- **Listening first** — everything is spoken; many exercises are audio-only.
- **Whole sentences** — tile-building, dictation and gap-fills recycle words in context.
- **Tones from day one** — Jyutping is coloured by tone everywhere, plus tone ear-training and a tone chart.
- **Micro-sessions** — a lesson is 3–5 minutes; the ⚡ 3-minute session mixes due reviews with new material.
- **Speaking** — shadowing with record-and-compare, a speech-recognition check, and a pitch "tone mirror".

## Course
24 units on four "MTR lines": First steps (A1) → Everyday life (A2) → Real conversations (B1) → Advanced (B2).
Each unit has vocabulary, sentences, grammar patterns and a dialogue or story with comprehension questions.

All Jyutping is checked against the [rime-cantonese](https://github.com/rime/rime-cantonese) lexicon
(CanCLID, CC BY 4.0) with `tools/verify.py`.

## Conversation practice

Speak → Conversation opens a chat with an AI partner who plays a role (neighbour, waiter, auntie…) using the words you have learnt. You answer by voice or by typing in characters, Jyutping or any loose spelling; the partner says what it understood, suggests a more natural version and keeps the conversation going.

- Needs your own API key, kept only in this browser (never in backups): a free Google Gemini key from aistudio.google.com/apikey, or a paid Anthropic key. Requests go straight from the browser to the provider.
- With Gemini, your voice can be sent as audio so the partner can comment on tones.
- Jyutping from the AI is checked against the course and the rime-cantonese readings (`data/jyutping.json`, CC BY 4.0) and corrected where needed.
- Offline alternative: role-play a course conversation; your line is checked by sound, so homophones, missing tones and informal spellings are forgiven.

## Audio
The app uses your device's Cantonese text-to-speech voice:
- **iPhone/iPad:** Settings → Accessibility → Spoken Content → Voices → Chinese → *Chinese (Hong Kong)*, download a voice.
- **Android:** Settings → Text-to-speech → Google → install *Cantonese (Hong Kong)*.

## Editing content
Units live in `data/units/uNN.json` (format described in `tools/CONTENT_GUIDE.md`).
After editing:

```sh
git clone --depth 1 https://github.com/rime/rime-cantonese.git ref/rime-cantonese   # once
python3 tools/verify.py data/units/*.json   # Jyutping check
python3 tools/build.py                      # rebuilds data/course.json + cache version
```
