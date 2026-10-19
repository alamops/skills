# Pulling live data from Apple

Everything in this skill runs on three public Apple endpoints — no key, no auth, no SDK. This file is the recipe: the URLs, how to parse them, the rate-limit rule, and the two derived metrics (difficulty and intent). Run the snippets inline (they're plain-stdlib Python or `curl`), or do the same steps by hand — there is nothing to install.

**Contents:** [Ground rules](#ground-rules) · [Listing lookup](#1-listing-lookup) · [Subtitle & competitor shelf](#2-subtitle--competitor-shelf) · [Reviews](#3-reviews) · [Keyword scouting](#4-keyword-scouting-difficulty--intent) · [Name collision check](#5-name-collision-check) · [Google Play](#google-play)

## Ground rules

- **Always send a browser User-Agent.** `apps.apple.com` returns **0 bytes to `curl`'s default UA** and 301s without `-L`. Use: `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15`. The `itunes.apple.com` JSON APIs are more forgiving but send it anyway.
- **Rate limits are real and aggressive.** Apple returns **403 and 429 (and sometimes 503)** to mean "slow down" — 403 is *not* a permanent failure here. On any of those, back off and retry: sleep `2s × 2^attempt` (2, 4, 8, 16…), up to ~6 tries. Pace multi-term loops at ~1.5s between calls; budget **~10 seconds per keyword term**, so 40 terms is a ~6-minute job that will blow past a default 2-minute command timeout — run in batches of ~15 with a raised timeout.
- **A term that never succeeds is `unscored`, not dropped.** If a term still fails after the retries, record it as `unscored` and say so in the deliverable. Never silently drop it, and never invent a number for it.
- **Count characters in UTF-16 code units**, the way App Store Connect does (an emoji costs 2): `len(s.encode("utf-16-le")) // 2`. This matters the moment you report a field length — see `validation.md`.

## 1. Listing lookup

The iTunes Lookup API returns almost every field **except the subtitle and keyword field**.

```
https://itunes.apple.com/lookup?id=<APP_ID>&country=us&entity=software&limit=200
```

Accepts `id=<id>` (comma-separate several: target + competitors in one call) or `bundleId=<bundle>`. From `results[0]` read: `trackName` (name), `description`, `releaseNotes`, `version`, `currentVersionReleaseDate`, `releaseDate`, `averageUserRating`, `userRatingCount`, `primaryGenreName` + `genres`, `formattedPrice`, `screenshotUrls` (count them), `ipadScreenshotUrls`, `artworkUrl512` (icon), `languageCodesISO2A` (locales), `sellerUrl`, `trackViewUrl`, `bundleId`, `artistName`.

The lookup API does **not** expose the 2026 surfaces. The store page's embedded JSON (§2) shows part of them:

| Surface | Visible? | How |
| --- | --- | --- |
| Product page header | **Partly** | An object with `"$kind": "Uber"` carries `artwork.width`/`height`. **3840×1646 (21:9) is the new creative-asset header**; other shapes (e.g. 4320×1080) are older editorial artwork. No `Uber` on the page served to a desktop browser doesn't prove there's no header, since headers only show on iOS 27+ — treat absence as "not detected" |
| Which iPhone screenshot set is live | **Partly** | `MediaPlatform` objects carry a `mediaType` naming the display class the page serves — e.g. `iphone_6_5` (the 6.5" set, i.e. not refreshed for the larger sizes) or `iphone_d74`. It shows the set the web page picked, not every set uploaded |
| Search result asset, custom product pages and their keywords, iPhone Duo screenshots, App Store tags | **No** | Ask the user what App Store Connect shows |

Report anything in the last row as "not visible from public endpoints — confirm in App Store Connect", never as absent, and don't dock score for it.

```python
def header_and_media(data):   # data = the parsed serialized-server-data from §2
    out = {"uber": [], "media_types": set()}
    def walk(o):
        if isinstance(o, dict):
            if o.get("$kind") == "Uber" and isinstance(o.get("artwork"), dict):
                a = o["artwork"]; out["uber"].append((a.get("width"), a.get("height")))
            if o.get("$kind") == "MediaPlatform" and o.get("mediaType"): out["media_types"].add(o["mediaType"])
            for v in o.values(): walk(v)
        elif isinstance(o, list):
            for v in o: walk(v)
    walk(data); return out   # (3840, 1646) in out["uber"] → new 21:9 header detected
```

To resolve an `apps.apple.com` URL to an ID, pull the digits after `/id`: `…/app/whatsapp-messenger/id310633997` → `310633997`.

## 2. Subtitle & competitor shelf

The subtitle and the "You Might Also Like" shelf are **not** in the API — they live in the store page's embedded JSON.

1. Fetch `https://apps.apple.com/<cc>/app/id<APP_ID>` with the browser UA.
2. Extract the block `<script type="..." id="serialized-server-data">…</script>` and `json.loads` it (HTML-unescape first).
3. **Walk the whole tree** looking for objects where `"$kind" == "Lockup"` and `subtitle` is a string. Anchor on `$kind`/`adamId`, never on a fixed path — that way an Apple redesign degrades to an empty result instead of a wrong one.
   - The object whose `adamId` equals your target app **is the subtitle** (`node["subtitle"]`).
   - Every *other* Lockup carrying a subtitle sits inside a shelf. Shelves are objects with `"$kind": "Shelf"` and an `id` (verified Oct 2026: `similarItems` — "You Might Also Like", `similarItemsDownloading` — a duplicate of it, `moreByDeveloper` — "More by <developer>"). Tag each lockup with the `id` of the nearest enclosing Shelf. **Only `similarItems` is the competitor set.** `moreByDeveloper` lists the *same developer's* other apps — counting those as competitors poisons the keyword corpus with the target's own sibling apps. Label anything else "also on the page, possibly promoted".
   - Don't infer the shelf from the enclosing JSON key: every shelf stores its lockups under a key called `items`, so key-based tagging labels everything `items` and can't tell competitors from siblings.

Those competitor **names + subtitles are the cheapest competitor keyword corpus that exists** — they are the head terms rivals chose deliberately.

The same JSON carries the **promotional text**, which no API returns. The page's `"$kind": "ProductDescription"` paragraph is the promotional text followed by the description; the lookup API's `description` is the description alone. So:

```python
def promotional_text(data, api_description):
    texts = []
    def walk(o):
        if isinstance(o, dict):
            if o.get("$kind") == "ProductDescription" and isinstance(o.get("paragraph"), dict): texts.append(o["paragraph"].get("text", ""))
            for v in o.values(): walk(v)
        elif isinstance(o, list):
            for v in o: walk(v)
    walk(data)
    norm = lambda x: re.sub(r"\s+", " ", x or "").strip()
    page, api = norm(texts[0] if texts else ""), norm(api_description)
    return page[: len(page) - len(api)].strip() if page.endswith(api) and len(page) > len(api) else None   # None = not detected
```

Record it as the "before" value — a rewrite that ignores the live promotional text can't be measured against it.

If the `serialized-server-data` block is missing, the layout changed: report "subtitle unavailable" rather than guessing one. **The keyword field is private** — it is exposed by no endpoint, for your app or anyone's. Infer keyword strategy from what an app *ranks* for (§4), and say that's what you did.

```python
import json, re, html, urllib.request
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15"
def get(u):
    return urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": UA}), timeout=30).read().decode("utf-8","replace")
def subtitle_and_shelf(app_id, cc="us"):
    page = get(f"https://apps.apple.com/{cc}/app/id{app_id}")
    m = re.search(r'<script[^>]*id="serialized-server-data"[^>]*>(.*?)</script>', page, re.S)
    if not m: return None, []
    data, me, comps, seen = json.loads(html.unescape(m.group(1))), None, [], set()
    def walk(o, shelf=None):
        nonlocal me
        if isinstance(o, dict):
            if o.get("$kind") == "Shelf": shelf = o.get("id") or o.get("title") or shelf
            if o.get("$kind") == "Lockup" and isinstance(o.get("subtitle"), str):
                adam = str(o.get("adamId") or "")
                if adam == str(app_id): me = me or o["subtitle"]
                elif adam and adam not in seen:
                    seen.add(adam); comps.append({"id": adam, "name": o.get("title"), "subtitle": o["subtitle"], "shelf": shelf})
            for v in o.values(): walk(v, shelf)
        elif isinstance(o, list):
            for v in o: walk(v, shelf)
    walk(data)
    return me, comps
# competitors = [c for c in comps if c["shelf"] == "similarItems"]   # moreByDeveloper = same developer, not a competitor
```

`urllib` needs a Python with working SSL. Some environments (pyenv builds without OpenSSL) fail every `https` call with `unknown url type: https` — if that happens, fetch with `curl -sSL -A "$UA" <url>` into a file and parse the file with the same code, rather than concluding the endpoint is down.

## 3. Reviews

Most-recent reviews are the vocabulary real users type — reliably different from the product team's words, and the evidence for whether a feature exists.

```
https://itunes.apple.com/<cc>/rss/customerreviews/page=<1..N>/id=<APP_ID>/sortby=mostrecent/json
```

Parse `feed.entry`. **Gotcha:** when a feed holds exactly one review — the normal shape for a new or low-traffic app — Apple returns `entry` as a **bare object, not a list**. Wrap it: `if isinstance(entry, dict): entry = [entry]`. On page 1 the first element is the app itself, not a review — skip any element with no `im:rating`. Each real entry has `im:rating.label` (int), `title.label`, `content.label` (body), `im:version.label`.

## 4. Keyword scouting (difficulty + intent)

The Search API is how you judge whether a term is winnable.

```
https://itunes.apple.com/search?term=<TERM>&entity=software&country=<cc>&limit=50
```

For each candidate term, take the top 10 `results` and compute:

- **Difficulty (1–5)** — from the **median `userRatingCount` of the top 10**. Bands: median `< 1,000` → 1, `< 10,000` → 2, `< 50,000` → 3, `< 250,000` → 4, else 5. (Empty result set → 1.) This is the real signal: three incumbents with 500k+ ratings own that term this year regardless of your copy.
- **Intent** — how many of the top 10 carry the **whole term inside their app name** (all query tokens present in `trackName`). High = a recognised head term apps deliberately target. **Zero = Apple is fuzzy-matching and nobody targets it directly** — cheap to win, but confirm anyone actually searches it.
- **Your position** — the index at which the target app appears in `results` (its `trackId` matches), or absent.

Also keep, per term: median and max top-10 rating count, and the top-10 apps' names/developers/ratings (this doubles as competitor discovery).

> **There is no public search-volume number.** Result-set depth does **not** proxy for it — a nonsense phrase still returns ~180 fuzzy matches. Get real volume only from Apple Ads: the keyword planner's popularity score, the **Search Terms report**, or — in bulk — the Apple Ads Platform API's `search-term-popularity` insights endpoint (`searchPopularity1to100`, per country and genre; see `apple-ads.md`). All need the user's Apple Ads account. Otherwise label volume an estimate; presenting a guessed volume as data is the fastest way to lose trust in the whole deliverable.

```python
import statistics, urllib.parse, urllib.request, json
def search(term, cc="us", limit=50):
    u = "https://itunes.apple.com/search?" + urllib.parse.urlencode({"term": term, "entity": "software", "country": cc, "limit": limit})
    return json.loads(get(u)).get("results", [])   # reuse get()/UA and the backoff rule above
def scout(term, cc="us", target_id=None):
    r = search(term, cc); top = r[:10]; rc = [a.get("userRatingCount") or 0 for a in top]
    med = statistics.median(rc) if rc else 0
    diff = 1 if med < 1000 else 2 if med < 10000 else 3 if med < 50000 else 4 if med < 250000 else 5
    toks = term.lower().split()
    intent = sum(1 for a in top if all(t in (a.get("trackName","").lower()) for t in toks))
    pos = next((i for i,a in enumerate(r,1) if target_id and str(a.get("trackId"))==str(target_id)), None)
    return {"term": term, "difficulty": diff, "median_top10": int(med), "max_top10": max(rc) if rc else 0,
            "intent": intent, "your_position": pos}
```

## 5. Name collision check

Before proposing (or keeping) an app name, search it and inspect the results. A name collision outranks anything in the keyword field — it splits brand search and risks rejection under **4.1 (copycats)** or a **5.2** trademark complaint.

Search the candidate name, then over the results:

- **Exact collision** — normalise both sides (lowercase, strip everything but `[a-z0-9]`) and compare to the full candidate. Any live app whose normalised name equals the candidate is a collision to flag loudly (with its developer and rating count).
- **Brand crowding** — take each result's *head* (the part before the first `:`/`-`/`–`/`—`/`|`/`(`), normalise it, and count how many **start with** your brand token. `Streaks` crowds the brand `Streak`.
- **When auditing a live app, exclude its own ID** from the results before checking — otherwise the app you're auditing shows up as its own exact-name match and buries any real collision.

The Search endpoint does not enumerate every app in the store, so a clean result means *no obvious* collision, not proof of none — for a name you're committing to, also check trademark registers.

## Google Play

Play has **no public API**. Fetch `https://play.google.com/store/apps/details?id=<pkg>&hl=en&gl=US` with WebFetch and read title / short description / long description / rating off it. Individual listing pages **truncate under WebFetch**, so you'll usually get the title and short description but not a competitor's full long description — the search page (`/store/search?q=<term>&c=apps&gl=<cc>`) is more reliable for enumerating who competes. Treat missing Play competitor copy as a stated limitation, not something to fill from memory.
