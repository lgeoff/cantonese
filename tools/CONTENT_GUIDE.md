# Cantonese course — content guide (for unit authors)

Learner: adult, English/French speaker in Geneva, knows the words in `data/units/u01.json`.
Goal: Hong Kong Cantonese, spoken/colloquial register (not written Chinese / Mandarin-style).
The app teaches with spaced repetition, listening drills, sentence-building tiles and dialogues.
Audio comes from the device's Cantonese text-to-speech reading the characters, so characters must
be the normal ones a Hongkonger would type for that spoken word.

## File format
One JSON file per unit: `data/units/uNN.json`. Copy the structure of `u01.json` exactly.

```json
{
  "id": "u05", "level": 1, "title": "Numbers & Money", "emoji": "💰",
  "desc": "one line, what you'll be able to do",
  "words": [
    {"hk": "幾多錢", "jp": "gei2 do1 cin2", "en": "how much (money)", "fr": "combien (prix)",
     "note": "optional short tip (pronunciation, usage, look-alike)",
     "ex": {"en": "How much is this?", "parts": [["呢個","ni1 go3"],["幾多錢","gei2 do1 cin2"],["？"]]}}
  ],
  "sentences": [ {"en": "...", "parts": [["字","jp"], ["，"], ...]} ],
  "grammar": [ {"title": "...", "explain": "1-3 short sentences in plain English",
                "examples": [ {"en": "...", "parts": [...]} ]} ],
  "dialogue": {"title": "...", "lines": [ {"spk": "A", "en": "...", "parts": [...]} ],
               "questions": [ {"q": "English question", "options": ["correct first is fine", "...", "...", "..."], "answer": 0} ]}
}
```

### `parts` (sentences, examples, dialogue lines)
- An ordered list of word tokens `[characters, jyutping]`, plus punctuation tokens as one-element lists `["，"]`, `["。"]`, `["？"]`, `["！"]`.
- Tokens are WORDS, not single characters: `["鍾意","zung1 ji3"]`, `["而家","ji4 gaa1"]`. These become tiles the learner taps to rebuild the sentence, so 3–9 tokens per sentence is ideal. Keep sentence-final particles as their own token.
- Number of Jyutping syllables must equal number of characters in the token.
- Use only full-width Chinese punctuation listed above.

### Jyutping & character conventions (the verifier enforces the lexicon)
- Jyutping with tone numbers 1–6, lowercase, syllables separated by spaces (`nei5 hou2`).
- Use colloquial HK characters: 係 喺 唔 冇 嘅 咗 緊 過 嘢 佢 哋 嚟 睇 畀 咩 乜嘢 嗰 啲 鍾意.
- Sentence particle aa3 = **啊** (not 呀). "So/then/like this" gam2 = **噉**; "so (+adj)" gam3 = **咁**.
- Particles: 啦 laa1, 喇 laa3, 嘅 ge3, 㗎 gaa3 (use ga3 if lexicon complains), 喎 wo3, 囉 lo1, 吖 aa1, 嘛 maa3, 咋 zaa3, 噃 bo3, 未 mei6, 呢 ne1 (question particle) vs 呢 ni1 (this, in 呢個).
- Common colloquial tone changes are fine when the lexicon has them (e.g. 名 meng2, 魚 jyu2, 錢 cin2). Prefer the reading a Hongkonger actually says.
- Mark the yes/no "A-not-A" pattern as one token: `["係唔係","hai6 m4 hai6"]`, `["想唔想","soeng2 m4 soeng2"]`.
- Never use Mandarin-only words where Cantonese differs (是→係, 的→嘅, 在→喺, 不→唔, 他→佢, 看→睇, 吃→食, 什麼→咩/乜嘢, 沒有→冇).

### Verification (mandatory)
Run `python3 tools/verify.py data/units/uNN.json` and fix until 0 ERROR and 0 MISMATCH.
WARN lines must each be looked at: a rare reading is usually a sign of a wrong tone; fix or justify.
The lexicon is rime-cantonese (in `ref/rime-cantonese`), grep it to check a word:
`grep -P "^詞\t" ref/rime-cantonese/jyut6ping3.words.dict.yaml ref/rime-cantonese/jyut6ping3.chars.dict.yaml`
Beyond the lexicon, YOU are responsible for meaning and naturalness: every sentence must be something a
native HK speaker would naturally say. No calques of English. If unsure about a word, choose another one.

### Size per unit
- words: 16–22 (advanced units up to 26). Most useful first. Do not re-teach words that earlier units
  teach (see unit list), but freely reuse them in sentences — reuse is good spaced practice.
- sentences: 10–14, mostly using this unit's words + earlier words. Varied: statements, questions, negatives.
- grammar: 1–3 cards, each with 2–3 examples.
- dialogue: 6–10 lines (level 4: a 10–16 line "story" told by one narrator with spk "N" is fine),
  3–4 comprehension questions, 4 options each, plausible distractors.
- `fr` gloss for every word (short). `en` short and learner-friendly.
- Every word should ideally have an `ex` example (at least two thirds of them).

## Unit plan (whole course)
Level 1 — First steps (A1)
- u01 Your Starter Pack (done): why/how/what/where/who/which, family members (哥哥 家姐 細佬 細妹 家庭), 屋企, 而家, 星期, 可以, 想, 想要, 鍾意, 瞓覺, 做, 用, 畀, 行, 跑步, 買嘢, 同, 同埋, 甜, 鹹, 難, 落緊雨, 車, 單車, 牛肉, 魚, 羊肉, 豬肉, 紙巾, 電視, 電腦, 電爐, 電器
- u02 Sounds & Tones (special, handled by app code — not a JSON unit author task)
- u03 Hello & Thanks: 你好, 早晨, 早唞, 拜拜, 唔該, 多謝, 對唔住, 唔緊要, 冇問題, 係, 唔係, 好, 你好嗎/你好唔好啊, 幾好, 我叫…, 請問, 再見, 得…
- u04 About Me: 我 你 佢 我哋 你哋 佢哋, 叫, 係…人, 香港, 瑞士, 新西蘭, 法國, 英國, 中國, 日內瓦, 住, 識, 講, 廣東話, 英文, 法文, 少少, 名, 歲 (one or two), 結婚
- u05 Numbers & Money: 零–十, 十一…九十九, 百, 千, 萬, 個 (classifier), 幾多, 幾多錢, 蚊, 毫, 平, 貴, 兩 (two of), 第一
- u06 Days & Time: 今日 聽日 尋日 後日, 星期一…日, 禮拜, 而家幾點, 點(鐘), 半, 個字, 分鐘, 朝早, 晏晝, 夜晚, 今晚, 早, 遲, 時間, 月, 年, 號
- u07 Family & People: 爸爸 媽媽 老公 老婆 仔 女 爺爺 嫲嫲 公公 婆婆 朋友 男朋友 女朋友 人 男仔 女仔 屋企人 小朋友 大佬 (colloquial big brother), 有, 冇, 幾個
- u08 Food & Yum Cha: 食, 飲, 飯, 麵, 茶, 飲茶, 咖啡, 水, 好食, 餐廳, 埋單, 點心, 蝦餃, 燒賣, 叉燒包, 雞, 菜, 肚餓, 要, 一齊, 筷子, 匙羹, 辣

Level 2 — Everyday life (A2)
- u09 Getting Around: 去, 嚟, 喺, 返, 巴士, 地鐵/港鐵, 的士, 飛機, 機場, 車站, 左, 右, 轉, 直行, 近, 遠, 幾耐, 坐, 落車, 上車, 路, 到, 行路
- u10 Shopping: 有冇, 呢個, 嗰個, 呢啲, 嗰啲, 試, 大, 細, 衫, 褲, 鞋, 顏色, 紅色 etc (2–3 colours), 平啲, 減價, 俾錢/畀錢, 現金, 碌卡, 八達通, 超市, 街市, 夠
- u11 My Day: 起身, 沖涼, 刷牙, 返工, 放工, 返學, 食早餐, 食晏, 食晚飯, 煮飯, 洗衫, 執屋, 每日, 通常, 先…再…, 之後, 然後, 鐘頭
- u12 Home & Gadgets: 屋, 房, 廳, 廚房, 廁所, 窗, 門, 開, 閂, 燈, 冷氣, 雪櫃, 洗衣機, 手機, 充電, 壞咗, 整, 鎖匙, 張 (classifier), 部 (classifier), 架 (classifier)
- u13 Weather & Feelings: 天氣, 熱, 凍, 涼, 落雪, 出太陽, 打風, 遮, 開心, 唔開心, 攰, 頸渴, 驚, 嬲, 悶, 緊張, 舒服, 唔舒服, 覺得
- u14 Grammar Power-ups: aspect & particles — 咗 (done), 緊 (‑ing), 過 (ever), 未 (not yet / yet?), 喇 (change), 啦 (suggestion), 啊, 嘅 (possessive), 啲 (some / plural / a bit), 都 (also), 又 (again), 再, 先, 就, 仲 (still / even more), 好似, 定係 (or, in questions), 或者

Level 3 — Real conversations (B1)
- u15 Free Time & Sports: 得閒, 興趣, 睇戲, 行山, 游水, 打波, 踢波, 唱K, 旅行, 影相, 聽歌, 打機, 睇書, 煮嘢食, 週末/週末, 經常, 有時, 間中, 從來唔
- u16 Health & Body: 頭, 肚, 手, 腳, 眼, 喉嚨, 痛, 頭痛, 肚痛, 發燒, 咳, 感冒, 醫生, 睇醫生, 藥, 食藥, 醫院, 休息, 好返, 小心
- u17 Work & Study: 公司, 老闆, 同事, 開會, 工作, 搵工, 辭職, 放假, 加班, 電郵, 讀書, 學, 學生, 老師, 考試, 功課, 明白, 唔明, 問題, 忙
- u18 Making Plans: 約, 一齊, 不如…啦, 好主意, 得唔得, 幾點等, 喺邊度等, 遲到, 準時, 取消, 改期, 有空/得閒, 一陣, 遲啲, 等, 記得, 唔記得, 打電話, send 訊息 → 傳訊息/WhatsApp (avoid Latin)
- u19 Opinions & Comparing: 覺得, 認為, 比, 最, 好過, 差唔多, 一樣, 唔同, 因為…所以, 雖然…但係, 不過, 其實, 應該, 可能, 一定, 同意, 鍾意多啲, 啱, 錯

Level 4 — Advanced (B2)
- u20 Telling Stories: 以前, 之前, 之後, 跟住, 然後, 最後, 終於, 原來, 突然, 啱啱, 一路, 當時, 嗰陣, 記得, 發生, 經歷, 故事, 結果. Dialogue = 12–16 line story with narrator "N".
- u21 Advanced Patterns: 畀 (passive: 畀人…), 將, 連…都, 一…就, 越嚟越, 越…越, 除咗…之外, 如果…就, 只要…就, 就算…都, 寧願, 唔使, 一定要, 到底, 究竟, 不過, 反而
- u22 HK Slang & Colloquial: 搞掂, 掂, 正, 醒目, 求其, 頂唔順, 好嘢, 冇嘢, 唔緊要, 收工, 抵, 好抵, 撞板, 走雞, 一陣見, 講笑, 認真, 激氣, 好彩, 黐線 (mild), 嘩 — no vulgarity.
- u23 Festivals & Sayings: 新年快樂, 恭喜發財, 身體健康, 萬事如意, 利是, 中秋節, 月餅, 端午節, 生日快樂, 一路順風, 人山人海, 馬馬虎虎, 慢慢嚟, 加油, 早抖, 食咗飯未啊, 好耐冇見
- u24 News & Society: 新聞, 政府, 經濟, 環境, 交通, 塞車, 天氣報告, 樓價, 租金, 人工, 退休, 社會, 問題, 解決, 影響, 增加, 減少, 報告, 調查 — dialogue: two people discussing a news item (neutral, non-political: housing cost, traffic, weather, environment).
