# Creative and conversion

Ranking gets impressions. Conversion turns them into installs — and because both stores feed conversion rate back into ranking, creative work is ranking work.

## The above-the-fold reality

On an iOS search result and on the product page, most visitors see only: the icon, the app name, the subtitle, the rating, and the first one to three screenshots. A large majority never scroll and never tap "more". Whatever the listing needs to communicate has to survive in that frame.

Practical consequence: the first three screenshots carry the entire value proposition. Treat screenshots 4–10 as depth for the minority who scroll, not as where the argument gets made.

## Icon

It has to read at roughly 60pt on a physical device. Almost every icon failure is detail that disappears at thumbnail size — thin strokes, small type, gradients that flatten to mud, a wordmark nobody can read.

Test it the only way that means anything: put it on a home screen next to the competitors' icons and look at it from arm's length. Distinctive silhouette and one strong color beat clever illustration.

## Screenshots

**Order by decreasing importance**, not by app flow. The first screenshot answers "what is this and why would I care", the second and third add the differentiators. Nobody needs your onboarding screen.

**Captions**: roughly 4–8 words, large type, legible at thumbnail size. Lead with the benefit, not the feature name — `Never lose a streak again` over `Streak recovery engine`. This is the copy people actually read; it deserves as much attention as the description that fewer of them will see.

**Framing**: device frames are conventional but optional. What matters is that real content shows — screenshots of empty states or lorem-ipsum data read as an unfinished app.

**Localize them.** A screenshot with English captions in a non-English storefront is a visible signal that the listing wasn't made for that market, and it converts accordingly.

## App preview video

Up to three on iOS, 15–30 seconds each. It **autoplays muted**, so the first three seconds must land with no sound and no context. Open on the core value moment; don't open on a logo animation.

Show real interaction rather than a montage. The job of the preview is to make the app feel real and usable, not to impress with motion design.

On Play, the promo video is a YouTube URL and it takes the feature graphic's position — so a weak video actively costs you a strong graphic.

## Ratings and reviews

Rating volume and average feed both ranking and conversion, and they compound: they're one of the few ASO inputs that get harder to fix the longer you leave them.

- Prompt with `SKStoreReviewController` (iOS) or the Play In-App Review API at a **moment of success** — a completed task, a goal hit, a streak extended — never on launch and never mid-task.
- Both platforms cap how often the prompt shows. Spending a prompt on a frustrated user is worse than not prompting.
- **Respond to reviews**, especially negative ones. Responses are visible, they lift ratings when users update them, and both stores treat responsiveness as a quality signal.
- Recency matters. A 4.8 built entirely on ratings from three years ago carries less weight than a fresh 4.5.

## Testing

**Apple — Product Page Optimization (PPO):** up to three treatments against the baseline, testing icon, screenshots, and app preview. Traffic is split and Apple reports the conversion difference with a confidence indicator. It tests creative only, not text fields.

**Apple — Custom Product Pages (CPP):** up to 35 alternate pages, each with its own URL, for paid and social campaigns. A page whose screenshots match the ad creative converts materially better than sending that traffic to the generic page. CPPs are targeting, not testing — the two are complementary. `apple-ads.md` covers which ad group should point at which page.

**Play — Store listing experiments:** A/B tests icon, screenshots, feature graphic, video, short description, **and** the descriptions, with significance reported. More capable than Apple's tooling, which is why teams shipping both stores often run creative tests on Play first and port the winner.

**How to run one so the result means something:**

- One variable per test. An experiment that changes the icon and all the screenshots tells you nothing about either.
- Let it reach significance. Calling a test at day two on a 3% difference is reading noise, and it's the most common way teams talk themselves into a worse listing.
- Test the highest-leverage asset first: usually the first screenshot, then the icon, then the subtitle.
- Record the result somewhere durable — `docs/appstore/experiments.md` — with the dates and the baseline. Institutional memory of what already lost is worth more than any single test.

## Where creative meets keywords

A term you rank for but convert badly on damages you twice: the lost install, and the conversion signal that weakens your ranking for everything else. So when the audit finds high impressions and low conversion, the fix is upstream in relevance — either the creative is failing the promise the keywords made, or the keywords are attracting people the app was never for.
