# App Store Connect fields

Every field that affects discovery or conversion, what it costs, and how to write it.

**Contents:** [Indexing model](#the-indexing-model) · [Text fields](#text-fields) · [Categories](#categories) · [In-app purchases & events](#in-app-purchases-and-in-app-events) · [Assets](#visual-assets) · [Localization](#localization) · [Verify before deadlines](#verify-before-a-deadline)

## The indexing model

This is the single most important thing to internalize, because it inverts what people expect from web SEO.

**Indexed for App Store search:**

| Field | Limit | Notes |
| --- | --- | --- |
| App name | 30 | Heaviest ranking weight of any field |
| Subtitle | 30 | Second heaviest; also visible copy, so it must convert |
| Keyword field | 100 | Invisible to users; pure ranking surface |
| Developer name | — | Indexed; worth considering if your company name carries a term |
| In-app purchase display names | 30 each | A genuinely underused surface |
| In-app event metadata | see below | Indexed while the event is live |
| Category | — | Auto-indexed, so never spend keyword characters on category names |

**Not indexed:** description, promotional text, What's New, screenshots, and screenshot caption text. These are conversion assets only. A "keyword-rich description" does nothing for iOS rank — it only costs you the reader.

**Phrase combination.** Apple builds search phrases by combining tokens across the name, subtitle, and keyword field. If the name has `Streak`, the subtitle has `habit`, and the keyword field has `tracker`, the app is eligible for `habit tracker`, `streak tracker`, and `streak habit`. Two consequences follow, and both are load-bearing:

1. A word only needs to appear **once** anywhere in that set. Repeating it is a pure waste of characters.
2. You do not need to write multi-word phrases into the keyword field. Single tokens combine. `habit,tracker` covers `habit tracker` and costs less than writing the phrase out.

## Text fields

### App name — 30 characters

Brand plus the highest-value head term. `Brand: Head Term` or `Brand — Head Term`.

Renaming an existing app is a real decision, not a copy tweak: it resets brand recognition, breaks word-of-mouth search, and temporarily disturbs existing rankings. Recommend it only with an explicit argument for why the ranking gain outweighs that, and say so out loud rather than slipping a new name into a field list.

Avoid stuffing the name with terms that don't read as a product name (`Habit Tracker - Daily Goals Routine Planner Streak Journal`). Apple rejects the worst of it under guideline 2.3.7, and even when it passes it reads as a low-quality app to the human deciding whether to tap.

### Subtitle — 30 characters

The hardest field, because it has to do two jobs: carry second-tier keywords and give a human a reason to tap. Thirty characters is roughly four to five words.

Good subtitles name the object and the outcome: `Daily routines & goal streaks`, `Science-backed habit tracker`, `Text, audio and video calls`. Weak subtitles are adjectives with no object: `The best app for your life`.

Do not repeat words from the app name — the two fields share a keyword pool and duplicating a word wastes one of two 30-character budgets.

### Keyword field — 100 characters

Comma-separated, **no spaces after commas** (a space costs a character and buys nothing). Rules, all checked by the `validation.md` checker:

- No word already in the app name or subtitle
- No category names — the category is indexed automatically
- No `app`, `free`, `best`, `top`, `download`, or other filler nobody searches alone
- Singular forms; don't spend characters on both `habit` and `habits`
- No stop words (`the`, `and`, `for`) — they aren't indexed
- No competitor brands or trademarks — Apple strips them and it invites a trademark complaint (guideline 5.2)
- Use the whole 100 characters. Unused budget is free ranking surface left on the table.

### Promotional text — 170 characters

Not indexed, and **updatable without shipping a build** — that's the whole point of the field. It renders above the description. Use it for the current campaign, a launch, a seasonal hook, an award, or social proof, and change it when the story changes. Wasting it on evergreen boilerplate wastes the only piece of the listing you can move quickly.

### Description — 4000 characters

Not indexed on iOS. Pure conversion.

The first ~170 characters render before the "more" link, and most visitors never expand it. So the structure that works is:

1. **Above the fold (~170 chars):** the value proposition, standing entirely alone. Not a greeting, not the company history.
2. **Benefit blocks:** short scannable groups with a header. Concrete nouns and verbs; the specific detail is what makes an app sound real.
3. **Social proof:** awards, press, user counts — anything true and checkable.
4. **Close:** what to do next, plus subscription terms if the app sells one.

Never promise features the binary doesn't have. Metadata that overstates the app is a 2.3 rejection, and a held release erases the ASO win entirely.

### What's New — 4000 characters

Returning users actually read this. "Bug fixes and performance improvements" throws away a free field. Name the fix in user language: *"Fixed a bug where a habit paused mid-week lost its longest run."* Update cadence and honest release notes also feed the Trust dimension of the audit scorecard.

### URLs

Support URL (required), Marketing URL (optional), Privacy Policy URL (required). Check they resolve — a dead support URL is both a rejection risk and a trust signal to anyone who clicks it.

## Categories

Primary and secondary. The primary category determines which chart you compete on and the competitive set for search. Games get subcategories.

Pick the category where the app can realistically chart, not the one that sounds most impressive. Ranking #12 in a narrow category beats ranking #400 in a broad one, because category charts are themselves a discovery surface.

## In-app purchases and in-app events

**In-app purchase display names (30) and descriptions (45)** are indexed. An IAP named `Premium` wastes a surface; `Unlimited Habits & Widgets` earns one. Legitimate and underused.

**In-app events** (name 30, short description 50, long description 120) are indexed while live and surface on the product page and in search and editorial. For apps with genuine time-bound moments — challenges, seasons, competitions, launches — they're additional indexed surface that costs nothing but the setup.

## Visual assets

- **App icon:** 1024×1024, no alpha, no rounded corners (Apple applies the mask). It has to read at roughly 60pt on a real device — most icon failures are detail that vanishes at thumbnail size.
- **iPhone screenshots:** up to 10 per localization. Apple's current required size is the 6.9" display; upload that set and Apple scales down for the smaller sizes. Supply the 6.5" set separately when the design needs different framing.
- **iPad screenshots:** required if the app supports iPad; the 13" display size is the current requirement.
- **App previews:** up to 3, 15–30 seconds each. They autoplay muted, so the first three seconds must work with no sound.

Screenshot dimensions and the required display sizes are the values Apple changes most often. Confirm against App Store Connect before a submission deadline.

## Localization

Each localization gets its own name, subtitle, keyword field, description, and screenshots. That means a new locale is a whole new keyword surface, not a translation job — see `keyword-strategy.md` for the storefront-locale mechanics, including the case where one storefront indexes more than one locale.

## Fetching gotchas

- `apps.apple.com` returns **0 bytes to `curl`'s default user-agent** and 301s without `-L`. always send a browser UA and follow redirects (see `data-and-endpoints.md`); otherwise you'll conclude a live page is empty.
- **Promotional text is not exposed on the public product page.** You cannot tell from outside whether it's set. Report it as "not detected — verify in App Store Connect" rather than asserting it's empty.
- The **keyword field is never public**, for your app or anyone's. Infer from ranking behaviour and say that's what you did.

## Verify before a deadline

Character limits and asset specs here have been stable year over year, and the `validation.md` checker encodes them. But Apple does change them — required screenshot sizes and indexed surfaces have both moved more than once. When a submission rides on a specific number, confirm it in App Store Connect or on Apple's current spec page, and tell the user which values you verified live versus took from this reference.
