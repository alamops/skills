# Validating fields before you show them

Character limits are the one place a confident-sounding wrong answer is worst: a field 3 characters over is **silently rejected in App Store Connect**, and the user finds out at submission. Hand-counting fails — in testing, models that "knew" the limits still miscounted repeatedly. So don't eyeball it. Run the checker below (it's plain-stdlib Python you paste and run — nothing to install), or apply the rules by hand with the UTF-16 count. **Never present a field set that hasn't been checked clean.**

**Contents:** [Limits](#the-limits) · [The counting rule](#the-counting-rule) · [Keyword-field rules](#keyword-field-rules) · [Description rules](#description-rules) · [The checker](#the-checker) · [What to fix vs. flag](#what-to-fix-vs-flag)

## The limits

Counted in **UTF-16 code units**. Stable year over year, but Apple/Google do change them — confirm in the console before a submission deadline.

| iOS field | Limit | | Google Play field | Limit |
| --- | --- | --- | --- | --- |
| name | 30 | | title | 30 |
| subtitle | 30 | | short_description | 80 |
| keywords | 100 | | full_description | 4000 |
| promotional_text | 170 | | | |
| description | 4000 | | **IAP** name / description | 30 / 45 |
| whats_new | 4000 | | **in-app event** name / short / long | 30 / 50 / 120 |

Required iOS: name, subtitle, keywords, description. Required Play: title, short_description, full_description. Play tags: at most 5.

## The counting rule

```python
def clen(s):  # exactly how App Store Connect counts — emoji cost 2, accents cost what they cost
    return len(str(s).encode("utf-16-le")) // 2 if s else 0
```

Any field where `clen(field) > limit` is a **hard fail** — fix it before showing anything.

## Keyword-field rules

The 100-character keyword field is where most budget is won or lost. Hard fails and warnings:

- **No space after commas.** `a,b,c` not `a, b, c` — every space is a wasted character. Also no leading/trailing space, no trailing comma, no empty entry (double comma).
- **No duplicate term**, and **no term that duplicates or is an inflection of a word already in the name or subtitle.** Apple combines tokens across name + subtitle + keywords, so `daily` in the keyword field when the subtitle says `Daily` buys nothing — and `scan` when the name says `Scanner` is the same waste (see [stemming](#stemming) below).
- **No category names** (`productivity`, `utilities`, `health`, `fitness`, `finance`, `games`, `travel`, `weather`, `education`, `music`, `photo`, `video`, `business`, `social`, `shopping`, `reference`, `navigation`, `medical`, `developer`, `tools`, …). Apple auto-indexes the category — spending keyword characters on it is double-paying.
- **No dead filler:** `app, apps, free, best, top, new, download, the, and, for, with, your, you, get, now, ios, iphone, ipad, mobile, great, awesome`, and stop words. Nobody searches these alone.
- **Soft modifiers are a judgment call, not filler:** `simple, easy, minimal, minimalist, premium, pro, offline, private, secure, fast, smart, daily, quick`. People *do* search "simple habit tracker" — keep one only if the Search-API scout (`data-and-endpoints.md` §4) measured the phrase as winnable. Don't drop it reflexively.
- **No competitor brands / trademarks** — Apple strips them and it invites a 5.2 complaint. (In Apple **Ads**, the opposite is true — see `apple-ads.md`.)
- **Use the whole 100.** Unused budget is free ranking surface left on the table (flag if under ~90).

### Stemming

Apple matches plurals and common inflections, so `Scanner`/`scan` and `routines`/`routine` are the same token. When checking keyword-vs-name/subtitle overlap, compare **stems**, not exact strings. A conservative stemmer: lowercase; `ies`→`y`; strip `es` only after `ch/sh/x/z/ss/o` (so `routines`→`routine`, not `routin`); else strip a trailing `s` (not `ss`); then strip one of `ing`/`ers`/`ed`/`er`/`or`; then collapse a doubled final `b d f g l m n p r t` (`scanner`→`scann`→`scan`). It's deliberately loose — `care`/`career` can collide — so surface stem matches as "confirm this" warnings, not hard fails.

## Description rules

- **iOS description is NOT indexed** — keyword-stuffing it does nothing for rank and costs conversion. If any 4+ letter word repeats more than ~8 times, that's stuffing; warn.
- **Play full description IS indexed** — the primary keyword should appear **2–3 times** (up to ~5 for a long one). Zero mentions is a miss; more than ~8 is stuffing.
- The first ~170 characters render before "more" — the opening line must stand alone as the value proposition, not a greeting.
- **What's New**: reject boilerplate ("bug fixes and performance improvements", "minor fixes", "stability improvements", "we update the app regularly"). Returning users read it.
- **iOS description and Play full description must differ** — one is an unindexed conversion asset, the other an indexed ranking asset. Identical copy is almost always a copy-paste, not a decision.

## The checker

Paste this, point it at your fields, and iterate until it prints `CLEAN`. It encodes every rule above.

```python
import re, statistics
def clen(s): return len(str(s).encode("utf-16-le"))//2 if s else 0
CATS={"books","business","developer","tools","education","entertainment","finance","food","drink","games","graphics","design","health","fitness","lifestyle","magazines","newspapers","medical","music","navigation","news","photo","video","productivity","reference","shopping","social","networking","sports","travel","utilities","weather"}
FILLER={"app","apps","free","best","top","new","download","the","and","for","with","your","you","get","now","ios","iphone","ipad","mobile","great","awesome"}
SOFT={"simple","easy","minimal","minimalist","premium","pro","offline","private","secure","fast","smart","daily","quick"}
LIM={"name":30,"subtitle":30,"keywords":100,"promotional_text":170,"description":4000,"whats_new":4000}
def stem(w):
    w=w.lower()
    if len(w)<=3: return w
    if w.endswith("ies") and len(w)>4: w=w[:-3]+"y"
    elif len(w)>4 and w.endswith(("ches","shes","xes","zes","sses","oes")): w=w[:-2]
    elif w.endswith("s") and not w.endswith("ss") and len(w)>3: w=w[:-1]
    for suf,fl in (("ing",5),("ers",5),("ed",4),("er",4),("or",4)):
        if w.endswith(suf) and len(w)>fl: w=w[:-len(suf)]; break
    return re.sub(r"([bdfglmnprt])\1$", r"\1", w)
def check(f, avoid=(), primary=None):
    err=[]; warn=[]
    for k,lim in LIM.items():
        if f.get(k) is not None and clen(f[k])>lim: err.append(f"{k}: {clen(f[k])}/{lim} OVER by {clen(f[k])-lim}")
    kw=f.get("keywords","")
    if kw:
        if ", " in kw or " ," in kw: err.append("keywords: space after comma")
        terms=[t.strip() for t in kw.split(",") if t.strip()]
        low=[t.lower() for t in terms]
        if len(low)!=len(set(low)): err.append("keywords: duplicate term")
        cover={stem(w) for w in re.findall(r"[a-z0-9]+", (f.get('name','')+' '+f.get('subtitle','')).lower())}
        dup=[t for t in low if stem(t) in cover]
        if dup: warn.append(f"keywords: {dup} duplicate/inflect name or subtitle")
        cat=[t for t in low if t in CATS];  fil=[t for t in low if t in FILLER]
        if cat: warn.append(f"keywords: category names {cat}")
        if fil: warn.append(f"keywords: filler {fil}")
        soft=[t for t in low if t in SOFT]
        if soft: warn.append(f"keywords: soft modifiers {soft} — keep only if scouted winnable")
        hit=[t for t in low for b in avoid if b.lower() in t]
        if hit: err.append(f"keywords: competitor/trademark {hit}")
        if clen(kw)<90: warn.append(f"keywords: only {clen(kw)}/100 used")
    d=f.get("description","")
    if d:
        c={}
        for w in re.findall(r"[a-z]{4,}", d.lower()): c[w]=c.get(w,0)+1
        heavy=[w for w,n in c.items() if n>8]
        if heavy: warn.append(f"description: heavy repetition {heavy}")
    print("CLEAN" if not err else "FAILED")
    for e in err: print("  ERROR", e)
    for w in warn: print("  warn ", w)
    return not err
# check({"name":"Streak: Habit Tracker","subtitle":"Daily routines & goal streaks",
#        "keywords":"reminder,checklist,journal,motivation,discipline,consistency,ritual,calendar,challenge,mood,planner"})
```

For Play, run the same `clen` limits on title (30) / short_description (80) / full_description (4000), and count the primary keyword in the long description (want 2–5).

## What to fix vs. flag

- **ERROR (over limit, comma syntax, competitor brand, missing required field):** fix before showing anything.
- **warn (duplication, category names, filler, unused budget, stuffing):** almost always worth fixing, but they're strategy calls — a soft-modifier you scouted as winnable is a legitimate keep. Resolve each; don't ship with unexplained warnings.
