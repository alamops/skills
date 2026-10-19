# App Store Connect fields

Every field that affects discovery or conversion, what it costs, and how to write it.

**Contents:** [Indexing model](#the-indexing-model) · [Text fields](#text-fields) · [Categories](#categories) · [App Store tags](#app-store-tags) · [In-app purchases & events](#in-app-purchases-and-in-app-events) · [Custom product pages](#custom-product-pages-as-indexed-surface) · [Assets](#visual-assets) · [Creative assets](#creative-assets-product-page-header-and-search-result) · [Localization](#localization) · [Verify before deadlines](#verify-before-a-deadline)

## The indexing model

This is the single most important thing to internalize, because it inverts what people expect from web SEO. Apple's own statement of it (`developer.apple.com/app-store/search/`): ranking is "text relevance (matches for your app's title, subtitle, keywords, and primary category), as well as user behavior (downloads, ratings and reviews, and more)."

**Indexed for App Store search:**

| Field | Limit | Notes |
| --- | --- | --- |
| App name | 30 | Heaviest ranking weight of any field |
| Subtitle | 30 | Second heaviest; also visible copy, so it must convert |
| Keyword field | 100 | Invisible to users; pure ranking surface |
| Developer name | — | Indexed; worth considering if your company name carries a term |
| In-app purchase display names | 30 each | A genuinely underused surface |
| In-app event metadata | see below | Indexed while the event is live |
| Primary + secondary category | — | Apple: "Your primary category and optional secondary category are indexed." Never spend keyword characters on category names |

**Not indexed for App Store search:** description, promotional text (Apple: it "doesn't affect your app's search ranking"), What's New, and screenshots. These are conversion assets. A "keyword-rich description" does nothing for iOS rank — it only costs you the reader. (The description *is* used by web search engines for the `apps.apple.com` page, per App Store Connect Help — a reason to write it well, not to stuff it.)

**Screenshot caption text is contested, not settled.** Since mid-2025 one ASO vendor (Appfigures) has claimed Apple reads caption text out of screenshots for ranking; a controlled test by another (ConsultMyApp, 64 phrases) found no strong evidence. Apple documents no such input. Treat captions as conversion copy that may carry a weak signal — never as a place to put keywords instead of the keyword field, and never tell a user it's indexed.

**Phrase combination.** Apple builds search phrases by combining tokens across the name, subtitle, and keyword field. If the name has `Streak`, the subtitle has `habit`, and the keyword field has `tracker`, the app is eligible for `habit tracker`, `streak tracker`, and `streak habit`. Two consequences follow, and both are load-bearing:

1. A word only needs to appear **once** anywhere in that set. Repeating it is a pure waste of characters.
2. You do not need to write multi-word phrases into the keyword field. Single tokens combine. `habit,tracker` covers `habit tracker` and costs less than writing the phrase out.

## Text fields

### App name — 30 characters

Brand plus the highest-value head term. `Brand: Head Term` or `Brand — Head Term`. App Store Connect requires at least two characters.

Renaming an existing app is a real decision, not a copy tweak: it resets brand recognition, breaks word-of-mouth search, and temporarily disturbs existing rankings. Recommend it only with an explicit argument for why the ranking gain outweighs that, and say so out loud rather than slipping a new name into a field list.

Avoid stuffing the name with terms that don't read as a product name (`Habit Tracker - Daily Goals Routine Planner Streak Journal`). Apple rejects the worst of it under guideline 2.3.7, and even when it passes it reads as a low-quality app to the human deciding whether to tap. Since November 2025, 4.1(c) also bars another developer's icon, brand, or product name in your name or icon without approval — `X for Instagram`-style names are now an explicit rejection.

**Universal purchase:** name, subtitle, age rating and genre are shared across every platform the app ships on (iPhone, iPad, Mac, Vision). The description can differ per platform. So a name or subtitle written for iPhone search also has to make sense on the Mac App Store.

### Subtitle — 30 characters

The hardest field, because it has to do two jobs: carry second-tier keywords and give a human a reason to tap. Thirty characters is roughly four to five words.

Good subtitles name the object and the outcome: `Daily routines & goal streaks`, `Science-backed habit tracker`, `Text, audio and video calls`. Weak subtitles are adjectives with no object: `The best app for your life`. 2.3.7: subtitles "should not include inappropriate content, reference other apps, or make unverifiable product claims."

Do not repeat words from the app name — the two fields share a keyword pool and duplicating a word wastes one of two 30-character budgets.

### Keyword field — 100

Comma-separated, **no spaces after commas** (a space costs a character and buys nothing). Rules, all checked by the `validation.md` checker:

- No word already in the app name or subtitle
- No category names — the primary and secondary category are indexed automatically
- No `app`, `free`, `best`, `top`, `download`, or other filler nobody searches alone
- Singular forms; don't spend characters on both `habit` and `habits`
- No stop words (`the`, `and`, `for`) — they aren't indexed
- No competitor brands or trademarks — App Store Connect Help: "Names of other apps or companies aren't allowed." Apple strips them and it invites a trademark complaint (guideline 5.2)
- Current Help text says each keyword should be "greater than two characters" — a two-letter term (`ai`, `tv`, `uk`) may be rejected or ignored. Prefer a longer form, and if one matters, confirm App Store Connect accepts it
- Use the whole budget. Unused budget is free ranking surface left on the table.

**Characters or bytes?** Apple's search page says "100 characters"; App Store Connect Help says "100 bytes." For Latin-script locales the two agree. For locales whose characters take several bytes in UTF-8 — the new Indic-script locales (Hindi, Bangla, Tamil, …), Arabic, Hebrew, Thai, CJK — they don't, and a field that counts 60 characters can be 180 bytes. Which one App Store Connect enforces is not documented consistently, so for those locales report both counts (the checker does), and have the user paste the field into App Store Connect before treating it as final.

### Promotional text — 170 characters

Not indexed, and **updatable without shipping a build** — that's the whole point of the field. It renders above the description. Use it for the current campaign, a launch, a seasonal hook, an award, or social proof, and change it when the story changes. Wasting it on evergreen boilerplate wastes the only piece of the listing you can move quickly. Each custom product page carries its own promotional text, which makes it the cheapest per-audience message there is.

### Description — 4000 characters

Not indexed for App Store search. Pure conversion (plus web-search snippets).

The first ~170 characters render before the "more" link, and most visitors never expand it. So the structure that works is:

1. **Above the fold (~170 chars):** the value proposition, standing entirely alone. Not a greeting, not the company history.
2. **Benefit blocks:** short scannable groups with a header. Concrete nouns and verbs; the specific detail is what makes an app sound real.
3. **Social proof:** awards, press, user counts — anything true and checkable.
4. **Close:** what to do next, plus subscription terms if the app sells one.

Never promise features the binary doesn't have. Metadata that overstates the app is a 2.3 rejection, and a held release erases the ASO win entirely.

In the US storefront the en-US description is also one of the inputs to **App Store tags** (below), so a description that names the app's real objects and use cases does a little discovery work after all — another reason to write specifics, not adjectives.

### What's New — 4000 characters

Returning users actually read this. "Bug fixes and performance improvements" throws away a free field — and 2.3.12 requires that "more significant changes must be listed in the notes." Name the fix in user language: *"Fixed a bug where a habit paused mid-week lost its longest run."* Update cadence and honest release notes also feed the Trust dimension of the audit scorecard.

### URLs

Support URL (required), Marketing URL (optional), Privacy Policy URL (required). Check they resolve — a dead support URL is both a rejection risk and a trust signal to anyone who clicks it.

## Categories

Primary and secondary — both indexed. The primary category determines which chart you compete on and the competitive set for search. Games get subcategories.

Pick the category where the app can realistically chart, not the one that sounds most impressive. Ranking #12 in a narrow category beats ranking #400 in a broad one, because category charts are themselves a discovery surface.

## App Store tags

Apple attaches **tags** to apps — "based on the App Store metadata you provide in App Store Connect, artificial intelligence, and human curation" (App Store Connect Help, *Manage app tags*). They appear "in search results and as clickable entities on Search Landing Page and Product Page," which makes each tag a browse surface with its own landing page.

What a developer controls:

- Tags are generated from **en-US metadata** and are **currently shown only in the United States** storefront.
- You can't add or write tags. You can only **deselect** wrong ones: App Store Connect → App Information → App Store Tags → Edit. Apple warns that "deselecting all tags may affect your discoverability."
- So the lever is indirect: the name, subtitle and description have to say plainly what the app does, for whom, and the objects it handles. Vague copy produces vague (or wrong) tags.

In an audit you can't see an app's tags from the public endpoints reliably — ask the user what App Store Connect shows, and recommend reviewing them after every metadata change, deselecting any that would send the wrong audience (wrong-intent traffic converts badly and drags rank).

## In-app purchases and in-app events

**In-app purchase display names (30) and descriptions (45)** are indexed. An IAP named `Premium` wastes a surface; `Unlimited Habits & Widgets` earns one. Legitimate and underused.

**In-app events** (name 30, short description 50, long description 120) are indexed while live and surface on the product page and in search and editorial. Up to 10 can be published and 15 approved at once, and an event can be submitted on its own while a version is in review. Event cards in search show to people who already downloaded the app; everyone else sees screenshots, previews or a search creative asset. For apps with genuine time-bound moments — challenges, seasons, competitions, launches — they're additional indexed surface that costs nothing but the setup. 2.3.13: event metadata must be accurate and about the event, not the app in general.

## Custom product pages as indexed surface

Since October 2025 an app can have **up to 70 custom product pages (CPPs)**, and a CPP can now show up in **organic search**, not just behind an ad or a link:

- Each CPP can vary its screenshots, previews, promotional text, creative assets (header and search result), and **keywords**.
- Keywords assigned to a CPP must come from the **latest approved app version's keyword field** — you're routing existing terms to a page, not adding new indexed terms. Apple: "each keyword combination is unique to a single product page," and a CPP is searchable "only after it's approved and set to visible."

So the 100-character keyword field is now also a **routing table**: terms with distinct intents (e.g. `receipt` vs `mileage` vs `invoice` for an expense app) can each land on a page whose first screenshots answer that exact search. Plan the keyword field so it splits cleanly into intent clusters, then map clusters to CPPs. App Store Connect gives no keyword-level analytics; Apple's suggestion is to run separate CPPs for ads and for organic so the two can be measured apart. Apple's own figure for CPPs: a 2.5 percentage-point average conversion lift over a 1.6% default-page baseline — Apple's marketing number, useful as a direction rather than a forecast.

## Visual assets

- **App icon:** 1024×1024, no alpha, no rounded corners (Apple applies the mask). It has to read at roughly 60pt on a real device — most icon failures are detail that vanishes at thumbnail size.
- **iPhone screenshots:** 1–10 per display size per localization, JPEG or PNG, no alpha. The Help page's required-size wording changed in 2026 — it now names "iPhone with Dynamic Island (medium display)" (1179×2556 or 1206×2622) as the required size, while still describing 6.5" (1284×2778 / 1242×2688) as required when the large sizes aren't provided, and lists large Dynamic Island sizes up to 1320×2868. The page contradicts itself, so confirm in App Store Connect which set it demands before a deadline.
- **iPhone Duo screenshots** (new display size, Oct 2026): outer display **1398×2034** (portrait) / 2034×1398; inner display **2007×2853** / 2853×2007. Submitting them puts a badge on the product page telling people the app "is optimized for iPhone Duo" — a conversion signal on a $2,000 device whose buyers notice unoptimized apps. **They become mandatory in April 2027**, but Apple's two pages disagree on scope: the news post says "any apps or games submitted," the spec page says apps "using the iOS 27.1 SDK or later." Plan for the broader reading. The inner display is close to 1.4:1, so stretched or letterboxed iPhone shots look wrong — it needs its own layout, and the screenshots have to show what the build actually renders on Duo (2.3.3: "Don't submit screenshots that misrepresent the app's actual interface").
- **iPad screenshots:** required if the app supports iPad; the 13" display (2064×2752 or 2048×2732) is the current requirement.
- **2.3.3 now has a number:** App Review's guideline reference says it "will approve only those submissions where more than half of screenshots show the app in use" — per device type. A set of five caption-only "billboard" frames with two real screens fails. Design-heavy frames are fine as long as the majority show the app.
- **Search results show up to three screenshots** depending on orientation — unless a search creative asset or a live event card replaces them for that viewer.
- **App previews:** optional; up to 3 per size and language, 15–30 seconds, 500 MB. They play before the screenshots and autoplay muted, so the first three seconds must work with no sound.

Screenshot dimensions and the required display sizes are the values Apple changes most often. Confirm against App Store Connect before a submission deadline.

## Creative assets (product page header and search result)

New in October 2026 (announced WWDC26; guideline **2.3.14**). They "highlight the value of your app in new ways compared to app-in-use screenshots," and they show **only to people on iOS 27 / iPadOS 27 or later** — everyone else keeps seeing screenshots.

| Placement | Image | Video |
| --- | --- | --- |
| Product page header | 21:9, 3840×1646 (JPEG/PNG) — or a 16:9 "universal" asset, 5244×2950 PNG | 21:9 3840×1646, 5–30 s |
| Search results | 3:2, 1920×1280 – 3840×2560 — or the 16:9 universal asset | 3:2, 5–30 s |

- **Search-result video is always muted** ("can't currently be unmuted"); header video is muted by default but can be unmuted. Both loop. Design for silence first.
- Only a universal asset can be reused as both header and search result ("Use header asset in search results").
- No search asset → the search result falls back to event cards, previews or screenshots as before.
- An approved asset can replace the live one **without submitting a new app version**, which makes it as quick to change as promotional text — and it's tested with PPO's "Header and Search Results" tab.
- They also appear in custom product pages, in-app event media, the Apple Games app, and (later, per Apple Ads) in ads.

**Rules (2.3.14 + Apple's asset best practices):** must "pertain to your app's content and functionality or overarching brand," be appropriate for all audiences (4+), and not include "unverifiable product claims, or specific or discounted pricing information," website URLs, copyright symbols, Apple awards (Editor's Choice, App of the Day), or other platforms. Content can show the app's value outside the app ("in use" in the real world), unlike 2.3.3 screenshots. Keep text inside Apple's safe area.

What this changes for ASO: for iOS 27 users, the **search result card can be one designed image or video instead of screenshots 1–3**. That's the highest-leverage conversion surface on the store, and it can now be swapped and tested without a release. See `creatives-cvr.md` for how to brief it.

## Localization

Each localization gets its own name, subtitle, keyword field, description, and screenshots. That means a new locale is a whole new keyword surface, not a translation job — see `keyword-strategy.md` for the storefront-locale mechanics.

Since March 2026 App Store Connect supports **50 localizations**, including eleven new ones aimed largely at India: Bangla, Gujarati, Kannada, Malayalam, Marathi, Odia, Punjabi, Slovenian, Tamil, Telugu and Urdu. Apple publishes which localizations each storefront supports (App Store Connect Help → *App Store localizations*): India now carries English (U.K.) plus eleven Indian languages; the US carries English (U.S.) plus nine others (Arabic, Chinese Simplified and Traditional, French, Korean, Portuguese (Brazil), Russian, Spanish (Mexico), Vietnamese). That table says which locales a storefront *displays*; whether it *indexes* all of them for ranking is still undocumented.

## Fetching gotchas

- `apps.apple.com` returns **0 bytes to `curl`'s default user-agent** and 301s without `-L`. always send a browser UA and follow redirects (see `data-and-endpoints.md`); otherwise you'll conclude a live page is empty.
- **Promotional text is exposed — but merged into the description.** The lookup API's `description` never includes it, while the store page's `ProductDescription` paragraph shows promotional text **prepended** to the description. Subtract one from the other to recover it (recipe in `data-and-endpoints.md` §2; verified Oct 2026). If the two are identical, report "no promotional text detected" — it may be unset, or set only in another locale — rather than asserting it's empty.
- The **keyword field is never public**, for your app or anyone's. Infer from ranking behaviour and say that's what you did.
- **Most 2026 surfaces aren't visible from the public endpoints.** The lookup API returns only `screenshotUrls` / `ipadScreenshotUrls`. The store page's JSON partly shows the product page header (an `Uber` artwork at 3840×1646) and which iPhone screenshot set is served (`mediaType`, e.g. `iphone_6_5`) — see `data-and-endpoints.md` §1. Search result assets, tags, CPPs and Duo screenshots don't show at all: ask the user what App Store Connect shows rather than reporting them absent.

## Verify before a deadline

Character limits here have been stable for years, and the `validation.md` checker encodes them. Asset specs and required display sizes are not — 2026 alone added iPhone Duo sizes, the Dynamic Island-based required size, and two new creative-asset placements. When a submission rides on a specific number, confirm it in App Store Connect or on Apple's current spec page (`developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications` and `.../creative-assets-specifications`), and tell the user which values you verified live versus took from this reference.
