#!/usr/bin/env python3
"""Verify Cantonese course data against the rime-cantonese Jyutping lexicon.

Usage: python3 verify.py data/units/u03.json [more files...]
Reports: ERROR (reading not attested / schema problem), MISMATCH (word in lexicon with other
reading), WARN (rare reading <=3%, or unknown multi-char word checked char-by-char only).
"""
import json, re, sys, os

HERE = os.path.dirname(os.path.abspath(__file__))
LEX = os.path.join(HERE, '..', 'ref', 'rime-cantonese')
SYL = re.compile(r'^[a-z]+[1-6]$')
PUNCT = set('，。？！、：；「」『』（）…—,.?!:;"\' ')
HAN = re.compile(r'[㐀-鿿豈-﫿\U00020000-\U0002ffff]')


def load():
    chars, words = {}, {}
    def rows(fn):
        started = False
        for line in open(os.path.join(LEX, fn), encoding='utf-8'):
            line = line.rstrip('\n')
            if line == '...':
                started = True; continue
            if not started or not line or line.startswith('#'):
                continue
            yield line.split('\t')
    for r in rows('jyut6ping3.chars.dict.yaml'):
        if len(r) < 2: continue
        pct = 100.0
        if len(r) >= 3 and r[2].endswith('%'):
            try: pct = float(r[2][:-1])
            except ValueError: pass
        chars.setdefault(r[0], {})[r[1]] = pct
    for fn in ('jyut6ping3.words.dict.yaml', 'jyut6ping3.phrase.dict.yaml'):
        for r in rows(fn):
            if len(r) >= 2:
                words.setdefault(r[0], set()).add(r[1])
    return chars, words

CHARS, WORDS = load()
# Common colloquial changed tones (變調) the lexicon lists only inside other words.
COLLOQ = {('士', 'si2'), ('黃', 'wong2'), ('檸', 'ning2'), ('豉', 'si2')}
issues = {'ERROR': 0, 'MISMATCH': 0, 'NOJP': 0, 'WARN': 0}

def report(kind, where, msg):
    issues[kind] += 1
    print(f'{kind:8} {where}: {msg}')

def check_pair(hk, jp, where):
    clean = ''.join(c for c in hk if c not in PUNCT)
    sylls = jp.replace(',', ' ').replace('?', ' ').split()
    for s in sylls:
        if not SYL.match(s):
            report('ERROR', where, f'bad syllable "{s}" in "{jp}"')
            return
    if not clean:
        return
    if not all(HAN.match(c) for c in clean):
        report('WARN', where, f'non-Han text "{hk}" ({jp}) not lexicon-checked')
        return
    if len(clean) != len(sylls):
        report('ERROR', where, f'{len(clean)} chars vs {len(sylls)} syllables: {hk} / {jp}')
        return
    if clean in WORDS and len(clean) > 1:
        if ' '.join(sylls) in WORDS[clean]:
            return
        report('MISMATCH', where, f'{clean} = {jp}; lexicon has {sorted(WORDS[clean])}')
        return
    for c, s in zip(clean, sylls):
        rd = CHARS.get(c)
        if rd is None:
            report('ERROR', where, f'char {c} not in lexicon')
        elif (c, s) in COLLOQ:
            pass
        elif s not in rd:
            report('ERROR', where, f'{c} read "{s}" not attested; lexicon has {sorted(rd)} (in {hk})')
        elif rd[s] <= 3:
            report('WARN', where, f'{c} "{s}" is a rare reading ({rd[s]}%) in {hk}')

HANRUN = re.compile(r'[\u3400-\u9fff\uf900-\ufaff]+')
JPAFTER = re.compile(r'^[\s(（:=·]*((?:[a-z]+[1-6](?:[\s,]+|$|(?=[^a-z])))+)')

def check_text(text, where):
    """Every run of Chinese characters in free text must be followed by its Jyutping."""
    if not text or not isinstance(text, str):
        return
    for m in HANRUN.finditer(text):
        run = m.group(0)
        after = JPAFTER.match(text[m.end():])
        sylls = after.group(1).replace(',', ' ').split() if after else []
        if run in WORDS and any(' '.join(sylls[:len(r.split())]) == r for r in WORDS[run]):
            continue
        if len(sylls) < len(run):
            report('NOJP', where, f'"{run}" has no Jyutping in: {text[:90]}')
        else:
            check_pair(run, ' '.join(sylls[:len(run)]), where + '[text]')

def check_sentence(s, where):
    parts = s.get('parts')
    if not parts or not isinstance(parts, list):
        report('ERROR', where, 'missing parts'); return
    for i, p in enumerate(parts):
        if not isinstance(p, list) or len(p) not in (1, 2):
            report('ERROR', where, f'bad part {p}'); continue
        if len(p) == 1:
            if any(c not in PUNCT for c in p[0]):
                report('ERROR', where, f'1-elem part must be punctuation: {p}')
            continue
        check_pair(p[0], p[1], f'{where}.p{i}')
    if not s.get('en'):
        report('ERROR', where, 'missing en')

def verify(path):
    d = json.load(open(path, encoding='utf-8'))
    u = d.get('id', os.path.basename(path))
    for k in ('id', 'title', 'level', 'words', 'sentences'):
        if k not in d: report('ERROR', u, f'missing key {k}')
    seen = set()
    for i, w in enumerate(d.get('words', [])):
        where = f'{u}.w{i}({w.get("hk")})'
        for k in ('hk', 'jp', 'en'):
            if not w.get(k): report('ERROR', where, f'missing {k}')
        if w.get('hk') in seen: report('ERROR', where, 'duplicate word in unit')
        seen.add(w.get('hk'))
        check_pair(w.get('hk', ''), w.get('jp', ''), where)
        if w.get('ex'): check_sentence(w['ex'], where + '.ex')
        for k in ('note', 'en'):
            check_text(w.get(k), where + '.' + k)
    for k in ('title', 'desc'):
        check_text(d.get(k), f'{u}.{k}')
    for i, s in enumerate(d.get('sentences', [])):
        check_sentence(s, f'{u}.s{i}')
        check_text(s.get('en'), f'{u}.s{i}.en')
    tl = d.get('toneLesson')
    if tl:
        check_text(tl.get('title'), f'{u}.toneLesson.title')
        for i, t in enumerate(tl.get('items', [])):
            for k in ('hk', 'jp', 'en'):
                if not t.get(k): report('ERROR', f'{u}.tone{i}', f'missing {k}')
            check_pair(t.get('hk', ''), t.get('jp', ''), f'{u}.tone{i}')
            check_text(t.get('note'), f'{u}.tone{i}.note')
        c = tl.get('card')
        if c:
            check_text(c.get('title'), f'{u}.toneLesson.card'); check_text(c.get('explain'), f'{u}.toneLesson.card')
            for j, ex in enumerate(c.get('examples', [])): check_sentence(ex, f'{u}.toneLesson.card.ex{j}')
    dl = d.get('dialogue')
    if dl:
        for i, g in enumerate(dl.get('gloss', [])):
            if len(g) != 3: report('ERROR', f'{u}.gloss{i}', 'gloss entries are [hk, jp, en]')
            else: check_pair(g[0], g[1], f'{u}.gloss{i}')
        check_text(dl.get('title'), f'{u}.dialogue.title')
        for i, line in enumerate(dl.get('lines', [])):
            check_sentence(line, f'{u}.d{i}')
            check_text(line.get('en'), f'{u}.d{i}.en')
        for i, q in enumerate(dl.get('questions', [])):
            check_text(q.get('q'), f'{u}.q{i}')
            for o in q.get('options', []): check_text(o, f'{u}.q{i}.opt')
            if not (0 <= q.get('answer', -1) < len(q.get('options', []))):
                report('ERROR', f'{u}.q{i}', 'answer index out of range')
    for i, g in enumerate(d.get('grammar', [])):
        check_text(g.get('title'), f'{u}.g{i}.title')
        check_text(g.get('explain'), f'{u}.g{i}.explain')
        for j, ex in enumerate(g.get('examples', [])):
            check_text(ex.get('en'), f'{u}.g{i}.ex{j}.en')
            check_sentence(ex, f'{u}.g{i}.ex{j}')
    return d

if __name__ == '__main__':
    n_words = n_sent = 0
    for p in sys.argv[1:]:
        d = verify(p)
        n_words += len(d.get('words', []))
        n_sent += len(d.get('sentences', [])) + len((d.get('dialogue') or {}).get('lines', []))
    print(f'\n{len(sys.argv)-1} file(s), {n_words} words, {n_sent} sentences/lines -> '
          + ', '.join(f'{k}: {v}' for k, v in issues.items()))
    sys.exit(1 if issues['ERROR'] or issues['MISMATCH'] or issues['NOJP'] else 0)
