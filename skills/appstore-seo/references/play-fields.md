# Google Play Console fields

Play is not a re-skin of the App Store. The indexing model is close to inverted, so copy written for one store is wrong for the other.

**Contents:** [Indexing model](#the-indexing-model) · [Getting data](#getting-play-data) · [Writing for Play](#writing-for-play) · [Metadata policy](#metadata-policy) · [Assets](#assets) · [Discovery surfaces](#discovery-surfaces-202526) · [Compliance that gates visibility](#compliance-surfaces-that-gate-visibility) · [Experiments & custom listings](#experiments-and-custom-store-listings) · [Porting](#the-porting-mistake)

## The indexing model

| Field | Limit | Indexed |
| --- | --- | --- |
| App title | 30 | Yes — heaviest weight |
| Short description | 80 | Yes — and it's the visible above-the-fold copy |
| Full description | 4000 | **Yes** — the big difference from iOS |
| Developer name | — | Yes |
| Tags | up to 5 | Category/discovery signal, not free-text keywords |

There is **no keyword field**. The long description carries the keyword load instead. "Character limits apply to both full-width and half-width characters" (Play Console Help). Release notes ("What's new") get 500 characters per language and may not be used "for promotional purposes or to solicit user actions." Graphic alt text: 140 characters, recommended.

Play also weighs behavioral signals more visibly than Apple does: install rate from the listing, retention after install, uninstall rate, ratings, crash and ANR rates from Android vitals. A listing that wins installs but loses users will lose ranking, so promising things the app doesn't deliver is self-defeating here in a way it isn't on iOS.

**The text is now read by models as well as people.** Play's AI features — Ask Play answers, AI review summaries, task-based and natural-language search, app discovery inside the Gemini app — draw on the listing. ASO vendors (AppTweak, third-party) report that Ask Play favours information near the top of the description and also pulls from the app's own website. Practical consequence: say plainly and early what the app does, for whom, and its concrete features; vague marketing copy gives those systems nothing to quote.

## Getting Play data

There is no public API, and individual `play.google.com/store/apps/details` pages truncate under WebFetch — expect to get the title and short description but not a competitor's full description. The search-results page (`/store/search?q=<term>&c=apps&gl=<cc>`) is more reliable for enumerating who competes. Treat missing Play competitor copy as a stated limitation of the deliverable rather than something to fill in from memory.

## Writing for Play

### Title — 30 characters

Same shape as iOS: brand plus head term. See the metadata policy below — Play enforces it on the title, icon and developer name more strictly than anywhere else.

### Short description — 80 characters

Indexed *and* shown above the fold on the listing. It is the single highest-leverage field on Play: it has to contain the primary keyword and read as a complete, human sentence. Sixty-five to eighty characters, no truncation, no keyword salad. Since September 2026 Play also shows "a short description that highlights a key feature in similar apps" — so it now has to sell the app inside a competitor's listing too.

### Full description — 4000 characters

Indexed, so keyword placement matters — but it's still read by humans deciding whether to install, and by the AI surfaces above.

The working range for the primary keyword is **2–3 natural mentions**, up to about 5 for a genuinely long description. Beyond that it reads as stuffing to both the algorithm and the reader, and Play's spam policy explicitly targets repetitive or irrelevant keywords. The checker in `validation.md` counts this for you.

Structure that works:

1. **First paragraph:** the value proposition with the primary keyword in it naturally — this is also what Ask Play is most likely to lift
2. **Feature blocks** with short headers, secondary keywords distributed across them
3. **Social proof / press** — attributed only (see below)
4. **A closing paragraph** that can carry the primary keyword one final time

Play renders a limited subset of formatting; keep to short paragraphs, line breaks, and simple bullets rather than relying on rich markup.

### Tags

Up to five, chosen from Play's fixed list. They influence which browse and "similar apps" surfaces the app shows up on. Not free-text keywords, so don't treat them as an extra keyword field.

## Metadata policy

Unchanged through 2026, and enforced (Play Console Help, *Metadata*):

- Title, icon and developer name: no "text or image … that indicate store performance or ranking, price or promotional information, or that suggests relations to existing Google Play programs." Google's own banned examples: "App of the year", "#1", "Best of Play 20XX", "Popular", "Editor's choice", "New", "10% off", "$50 cash back", "free for limited time only".
- "Avoid ALL CAPS unless it is part of your brand name." "Don't use emojis, emoticons, or repeated special characters in these metadata elements."
- Descriptions: no "unattributed or anonymous user testimonials", no comparison data against other apps or brands, no word blocks or keyword lists.
- Graphics: don't use "words like 'Best,' '#1,' 'Top,' 'New,' 'Free,' 'Discount,' 'Sale,' or 'Million Downloads.'"

## Assets

- **Icon:** 512×512 32-bit PNG (with alpha), up to 1024 KB
- **Feature graphic:** 1024×500, JPEG or 24-bit PNG (no alpha) — required to publish; keep key elements clear of the cut-off zones
- **Phone screenshots:** at least 2 across device types to publish, up to 8 per device type; JPEG or 24-bit PNG, 320–3840 px per side, long side no more than 2× the short side. To be **eligible for promotion** (featuring, recommendations), apps need at least four screenshots at 1080 px minimum (1080×1920 / 1920×1080); games need three 16:9 or 9:16 at 1920×1080+. Keep taglines to ≤20% of the image.
- **Tablet (7" and 10") and Chromebook screenshots:** at least 4 per slot, 1080–7680 px, 16:9 or 9:16. Optional — but see large screens below.
- **Wear OS** 1:1 ≥384px (UI only), **Android TV** ≥1 screenshot + 1280×720 banner, **Automotive** 2 portrait 800×1280 + 2 landscape 1024×768 (unless a parked category), **Android XR** 4–8 at 8:5.
- **Preview video:** a single public or unlisted YouTube URL, ads off, no age restriction. "Only the first 30 seconds autoplays"; Google recommends showing the real app within the first 10 seconds. It takes the feature graphic's position, so a weak video costs you a strong graphic.
- **AI-generated images get a visible label** (rolling out since mid-2026: an "AI mark", an EU label, and an India label). An AI-generated feature graphic or screenshot may carry it on the listing — a trust cost worth weighing against the production saving.

**Large screens and foldables (2026).** Play now shows a badge for apps "designed for large screens" (Android Developers Blog: apps meeting adaptive quality standards earn an "Optimized for large screens" badge) and a chip on Home and Search highlighting quality large-screen apps. Users are "automatically directed to app detail pages with ratings, reviews, and screenshots specific to their device (phone, tablet, or watch)." So a tablet or foldable visitor now sees your *tablet* screenshots and *tablet* ratings — no tablet set means a weak page on exactly the devices where the badge is being handed out. Whether tablet screenshots or the badge affect *ranking* (not just badging) is not documented beyond Google's 2022 statement that large-screen featuring prioritises apps meeting the quality guidelines; third-party claims of tablet-search demotion are unverified. Android 16 (API 36) also ignores orientation and resizability locks on screens ≥600dp for non-game apps, so a phone-only layout will be shown stretched to tablet and foldable users — a product problem that the tablet screenshots will expose.

## Discovery surfaces (2025–26)

What's new on the store side, and what each one means for the listing:

| Surface | What it does | Listing implication |
| --- | --- | --- |
| **AI review summaries** (Aug 2025 →) and review citations inside Ask Play (Oct 2026) | Summarises review themes on the details page | Recurring complaints become copy every visitor reads; fix and respond, as on iOS |
| **Ask Play** (conversational Q&A, search-bar button, "Ask Play highlights" on results) | Answers user questions from listing, reviews and web | Clear, factual description and FAQ-style specifics near the top |
| **Task-based / natural-language / photo search** (Sep 2025 → Aug 2026) | AI groups apps by task | Name the tasks the app does in plain words |
| **Gemini app discovery** (2026) | Apps recommended inside Gemini on Android and web | Installs can start outside Play; the same plain-language clarity applies |
| **Hero carousel, YouTube playlist carousel, portrait videos, Play Shorts** | Richer media on the listing / feed | Hero carousel reported to show only to existing installers (third-party); YouTube integration is limited to apps meeting Premium growth tools criteria |
| **Engage SDK content on listings** (Jun 2026) | Existing users see your content on the listing | Re-engagement surface, not acquisition |
| **Device-specific listing pages** (Jul 2026) | Phone, tablet and watch visitors see device-specific screenshots and ratings | Every supported form factor needs its own set |

Promotional content (LiveOps) is open to all games but to apps only if they meet the **Premium growth tools** thresholds (roughly 1.6M daily MAU and 1.6M active installs, or sustained Google Ads spend of ~$40–50k/month) — don't plan an app's ASO around it unless the app qualifies.

## Compliance surfaces that gate visibility

These aren't ASO in the narrow sense, but a listing blocked or suppressed on any of them ranks nowhere:

- **Closed testing requirement (personal/individual developer accounts).** Accounts registered as an individual must run a closed test with a minimum number of testers (commonly cited as 12) opted in continuously for 14 days before they can apply for production access. **This is a schedule blocker, not a paperwork step** — it can make an announced Android launch date impossible on its own. Whenever a launch window is under about six weeks and the account is an individual one, raise this before writing a single field: the copy is worthless if the app cannot be published. Requirements here have changed more than once, so confirm the current rule in Play Console rather than quoting this line as gospel.
- **Developer verification.** Since September 30, 2026, installs on certified Android 7+ devices in Brazil, Indonesia, Singapore and Thailand require the app's developer to be verified, expanding globally in 2027. Google auto-registered most Play apps but tells developers to check Play Console Home for any unregistered app "to avoid global removal from Google Play." Worth one line in any pre-launch plan.
- **Target API level.** Since August 31, 2026, new apps and updates must target **Android 16 (API 36)** (Wear OS / Automotive API 35; TV / XR API 34), with extensions available to November 1, 2026. Existing apps must target at least **API 35** "to remain available to new users" on newer Android versions — falling behind removes the app from search for exactly the users you're optimising for.
- **Android vitals.** "If your app or game exceeds a bad behavior threshold, Play may reduce the visibility of your title. Play may also show users a warning on your store listing." Current thresholds: user-perceived crash rate 1.09% overall (8% per phone model), ANR rate 0.47% (8% per model), excessive battery use 1%, **excessive partial wake locks 5%** of sessions (since March 1, 2026 can exclude the app from recommendations and add a battery warning). Memory and DEX-optimization thresholds may start affecting visibility from February 2027. A vitals problem can erase any copy gain — check it before promising a ranking lift.
- **Data safety form** — must match what the app actually does
- **Content rating questionnaire**

## Experiments and custom store listings

**Store listing experiments** (Play Console Help, current): one **default graphics** experiment (formerly "global") *or* up to five **localized** experiments at once, **up to 2 variants** each (older guides say 3). Default graphics experiments test the icon, feature graphic and screenshots; localized experiments add the short and full descriptions. App name and video aren't listed as testable. Experiments stop automatically after 6 months, and can now run on custom store listings as well as the default one. Play's text testing is more capable than Apple's (PPO tests creative only), so when a team ships both stores, it's often right to test copy on Play first and port the lesson to iOS.

**The conversion metric changed.** From mid-2026 Play Console's primary store-listing metrics are based on **unique clicks**, and "Conversion Rate" was replaced by **Click-through Rate (CTR)**. Benchmarks and baselines recorded before July 2026 aren't directly comparable with what the console shows now — note the metric next to every recorded number in `experiments.md`.

**Custom store listings:** up to **50**, each with its own name, icon, descriptions and graphics (category, contact details and privacy policy stay shared; listings aren't auto-translated). Targeting options include country/region (one listing per country), pre-registration, **search keywords** (keyword bundles include spelling variants and translations), Google Ads ad groups, a unique URL (`&listing=`), churned and lapsed users, buyer segments, and custom audiences. Play Console can draft keyword-targeted listings with Gemini — treat those drafts like any machine-written copy: a starting point that still needs the keyword research and the metadata policy check. Keyword-targeted custom listings are the closest analogue to Apple's keyword-assigned custom product pages.

## The porting mistake

Do not paste the iOS description into Play. On iOS it's an unindexed conversion asset, on Play it's an indexed ranking asset — the optimal copy differs in keyword placement, density, and structure. The validator warns when the two are identical, because when it happens it's almost always a copy-paste rather than a decision.
