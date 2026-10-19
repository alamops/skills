# Creative and conversion

Ranking gets impressions. Conversion turns them into installs — and because both stores feed conversion rate back into ranking, creative work is ranking work.

**Contents:** [Above the fold](#the-above-the-fold-reality) · [Icon](#icon) · [Screenshots](#screenshots) · [iPhone Duo](#iphone-duo) · [Creative assets](#creative-assets-header-and-search-result) · [Preview video](#app-preview-video) · [Ratings](#ratings-and-reviews) · [Testing](#testing) · [Creative meets keywords](#where-creative-meets-keywords)

## The above-the-fold reality

On an iOS search result and on the product page, most visitors see only: the icon, the app name, the subtitle, the rating, and either the first one to three screenshots **or — for people on iOS 27 and later — a search result creative asset** that replaces them. A large majority never scroll and never tap "more". Whatever the listing needs to communicate has to survive in that frame.

Practical consequence: the search-result frame carries the entire value proposition. In 2026 that frame has two versions you have to design for at once — screenshots 1–3 for older iOS, and the search creative asset (if you set one) for iOS 27+. Treat screenshots 4–10 as depth for the minority who scroll, not as where the argument gets made.

## Icon

It has to read at roughly 60pt on a physical device. Almost every icon failure is detail that disappears at thumbnail size — thin strokes, small type, gradients that flatten to mud, a wordmark nobody can read.

Test it the only way that means anything: put it on a home screen next to the competitors' icons and look at it from arm's length. Distinctive silhouette and one strong color beat clever illustration. Don't borrow another developer's brand or product in the icon — 4.1(c) now rejects it outright.

## Screenshots

**Order by decreasing importance**, not by app flow. The first screenshot answers "what is this and why would I care", the second and third add the differentiators. Nobody needs your onboarding screen.

**Captions**: roughly 4–8 words, large type, legible at thumbnail size. Lead with the benefit, not the feature name — `Never lose a streak again` over `Streak recovery engine`. This is the copy people actually read; it deserves as much attention as the description that fewer of them will see. Whether Apple also reads caption text for ranking is disputed (see `apple-fields.md`) — write captions for the human, and don't move keywords out of the keyword field on the strength of that rumour.

**Keep most frames real.** App Review's 2.3.3 guidance now has a threshold: it "will approve only those submissions where more than half of screenshots show the app in use", **per device type**. A set built from caption-only "billboard" panels with one or two real screens gets rejected. Panels can be designed — device frames, captions, overlays — as long as the majority show the actual interface.

**Framing**: device frames are conventional but optional. What matters is that real content shows — screenshots of empty states or lorem-ipsum data read as an unfinished app.

**Localize them.** A screenshot with English captions in a non-English storefront is a visible signal that the listing wasn't made for that market, and it converts accordingly.

## iPhone Duo

Apple's foldable (Oct 2026) gets its own screenshot set: outer display 1398×2034, inner display 2007×2853 (portrait; landscape swapped). Three reasons to brief it now rather than in April 2027:

1. **The badge.** Submitting Duo screenshots puts a badge on the product page saying the app is optimized for iPhone Duo. On a device whose owners immediately notice letterboxed apps, that badge is a conversion signal on every Duo product-page view.
2. **The deadline.** Duo screenshots become mandatory in April 2027 (Apple's pages disagree on whether that's every submission or only apps built with the iOS 27.1 SDK — plan for every submission).
3. **They can't be faked.** The inner display is close to square; a stretched or letterboxed iPhone shot looks wrong, and 2.3.3 says "Don't submit screenshots that misrepresent the app's actual interface." The set has to be captured from a build that actually lays out for Duo — so the creative plan depends on the engineering plan. If the app isn't Duo-optimized yet, say so and make the screenshot set a dependency of that work, not a design task to fake around it. (Whether the build is ready is an `appstore-review` question.)

Brief the inner-display set as its own composition: the near-square canvas fits two-pane layouts (list + detail, map + panel, editor + preview) that sell the device's point, rather than a single tall phone screen.

## Creative assets (header and search result)

New in October 2026, shown to people on iOS 27 / iPadOS 27 or later. Specs and rules are in `apple-fields.md`; this is how to brief them.

- **Search result asset (3:2 image, or video ≤30 s that always plays muted).** The highest-leverage frame on the store, because it replaces screenshots 1–3 in search for iOS 27+ users. One idea, readable at search-result size, working with no sound. Apple's own pitch: "Instead of showing the default app screenshots, you can use an impactful image or video."
- **Product page header (21:9 image or video).** The first thing on the product page. It's the brand moment that screenshots were never allowed to be — the real-world outcome, the community, the content — as long as it "pertains to your app's content and functionality or overarching brand."
- **What you can't put in either** (2.3.14 + Apple's asset best practices): specific or discounted pricing, unverifiable claims ("#1", "best"), website URLs, ©, Apple awards (Editor's Choice, App of the Day), other platforms. They must suit a 4+ audience. Keep text inside the safe area.
- **They don't need a release.** An approved asset can replace the live one without a new app version, and the App Store Connect **preview tool** shows how header, search asset and screenshots will look (dark mode, devices, orientations, languages) before submission. Use the **Asset Library** to get campaign assets approved ahead of the date they go live.
- **Tie them to keyword intent.** Each custom product page can carry its own header and search asset, and a CPP can own a cluster of organic keywords — so the search result a user sees for `receipt scanner` can be different from the one for `mileage log`. Apple (WWDC26): "Using Custom Product Pages, you can also show a tailored asset for different search keywords."
- **Measure them.** PPO treatments now have a "Header and Search Results" tab. The first test to run once assets ship: search asset vs. no asset (the screenshot fallback), because there's no public benchmark yet for whether a designed card beats real screenshots in a given category.

## App preview video

Optional. Up to three per size and language on iOS, 15–30 seconds each, played before the screenshots. It **autoplays muted**, so the first three seconds must land with no sound and no context. Open on the core value moment; don't open on a logo animation. Previews may only use "video screen captures of the app itself" (2.3.4) — the header/search *creative asset* video is where non-app footage is allowed.

Show real interaction rather than a montage. The job of the preview is to make the app feel real and usable, not to impress with motion design.

On Play, the promo video is a YouTube URL and it takes the feature graphic's position — so a weak video actively costs you a strong graphic.

## Ratings and reviews

Rating volume and average feed both ranking and conversion, and they compound: they're one of the few ASO inputs that get harder to fix the longer you leave them.

- Prompt with `SKStoreReviewController` / `RequestReviewAction` (iOS) or the Play In-App Review API at a **moment of success** — a completed task, a goal hit, a streak extended — never on launch and never mid-task.
- Both platforms cap how often the prompt shows. Spending a prompt on a frustrated user is worse than not prompting.
- **Respond to reviews**, especially negative ones. Responses are visible, they lift ratings when users update them, and both stores treat responsiveness as a quality signal.
- **Review text is now product-page copy.** Apple shows LLM-generated review summaries on product pages in the US and eight other English-language storefronts (AU, CA, IN, IE, NZ, SG, ZA, UK); Google Play shows its own AI review summaries. A recurring complaint becomes a sentence every visitor reads above the reviews. The fix is in the product, and the evidence for which complaint to fix first is in the reviews you already mined for keywords.
- Recency matters. A 4.8 built entirely on ratings from three years ago carries less weight than a fresh 4.5.

## Testing

**Apple — Product Page Optimization (PPO):** up to three treatments against the baseline, one test at a time, up to 90 days, testing icon, screenshots, app preview — and now the header and search result creative assets. Traffic is split and Apple reports the conversion difference with a confidence indicator. It tests creative only, not text fields, and it doesn't run on custom product pages.

**Apple — Custom Product Pages (CPP):** **up to 70** alternate pages (raised from 35 in October 2025), each with its own URL, screenshots, previews, promotional text, creative assets — and **keywords**, which makes a CPP an organic search result as well as a paid and social landing page. A page whose first screen matches the query or the ad converts materially better than the generic page. Apple's published average: +2.5 percentage points over a 1.6% default-page conversion rate — Apple's marketing figure, use it as direction. App Store Connect has no keyword-level conversion data, so Apple suggests separate CPPs for ads and organic to measure them apart. `apple-ads.md` covers which ad group points at which page; `apple-fields.md` covers keyword assignment.

**Play — Store listing experiments:** up to 2 variants; default-graphics experiments test icon, feature graphic and screenshots, localized experiments add the short and full descriptions. Play reports on unique clicks / click-through rate since mid-2026 (it replaced "Conversion Rate"). It can test copy, which Apple's PPO can't, so teams shipping both stores often run copy tests on Play first and port the lesson. Details: `play-fields.md`.

**How to run one so the result means something:**

- One variable per test. An experiment that changes the icon and all the screenshots tells you nothing about either.
- Let it reach significance. Calling a test at day two on a 3% difference is reading noise, and it's the most common way teams talk themselves into a worse listing.
- Test the highest-leverage asset first: on iOS 27+ that's usually the search result asset (vs. the screenshot fallback), then the first screenshot, then the icon.
- Record the result somewhere durable — `docs/appstore/experiments.md` — with the dates and the baseline. Institutional memory of what already lost is worth more than any single test.

## Where creative meets keywords

A term you rank for but convert badly on damages you twice: the lost install, and the conversion signal that weakens your ranking for everything else. So when the audit finds high impressions and low conversion, the fix is upstream in relevance — either the creative is failing the promise the keywords made, or the keywords are attracting people the app was never for. Custom product pages with keyword assignment are the tool that lets one listing make several different promises, each to the search that asked for it.
