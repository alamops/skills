# Google Play Console fields

Play is not a re-skin of the App Store. The indexing model is close to inverted, so copy written for one store is wrong for the other.

## The indexing model

| Field | Limit | Indexed |
| --- | --- | --- |
| App title | 30 | Yes — heaviest weight |
| Short description | 80 | Yes — and it's the visible above-the-fold copy |
| Full description | 4000 | **Yes** — the big difference from iOS |
| Developer name | — | Yes |
| Tags | up to 5 | Category/discovery signal, not free-text keywords |

There is **no keyword field**. The long description carries the keyword load instead.

Play also weighs behavioral signals more visibly than Apple does: install rate from the listing, retention after install, uninstall rate, ratings, crash and ANR rates from Android vitals. A listing that wins installs but loses users will lose ranking, so promising things the app doesn't deliver is self-defeating here in a way it isn't on iOS.

## Getting Play data

There is no public API, and individual `play.google.com/store/apps/details` pages truncate under WebFetch — expect to get the title and short description but not a competitor's full description. The search-results page (`/store/search?q=<term>&c=apps&gl=<cc>`) is more reliable for enumerating who competes. Treat missing Play competitor copy as a stated limitation of the deliverable rather than something to fill in from memory.

## Writing for Play

### Title — 30 characters

Same shape as iOS: brand plus head term. Play enforces its metadata policy fairly aggressively — no emoji or ALL-CAPS gimmicks, no performance claims (`#1`, `Best`), no misleading terms.

### Short description — 80 characters

Indexed *and* shown above the fold on the listing. It is the single highest-leverage field on Play: it has to contain the primary keyword and read as a complete, human sentence. Sixty-five to eighty characters, no truncation, no keyword salad.

### Full description — 4000 characters

Indexed, so keyword placement matters — but it's still read by humans deciding whether to install.

The working range for the primary keyword is **2–3 natural mentions**, up to about 5 for a genuinely long description. Beyond that it reads as stuffing to both the algorithm and the reader, and Play's spam policy explicitly targets repetitive or irrelevant keywords. The checker in `validation.md` counts this for you.

Structure that works:

1. **First paragraph:** the value proposition with the primary keyword in it naturally
2. **Feature blocks** with short headers, secondary keywords distributed across them
3. **Social proof / press**
4. **A closing paragraph** that can carry the primary keyword one final time

Play renders a limited subset of formatting; keep to short paragraphs, line breaks, and simple bullets rather than relying on rich markup.

### Tags

Up to five, chosen from Play's fixed list. They influence which browse and "similar apps" surfaces the app shows up on. Not free-text keywords, so don't treat them as an extra keyword field.

## Assets

- **Icon:** 512×512 32-bit PNG
- **Feature graphic:** 1024×500 — required, and it's used across Play surfaces including the top of the listing when a promo video exists
- **Phone screenshots:** 2 required, up to 8; 16:9 or 9:16, minimum 320px on the short side
- **Tablet screenshots:** required for the tablet quality tiers, which affect visibility on tablet surfaces
- **Promo video:** a YouTube URL, not an upload. It replaces the feature graphic position, so a weak video costs you a strong graphic.

## Compliance surfaces that gate visibility

These aren't ASO in the narrow sense, but a listing blocked on any of them ranks nowhere:

- **Closed testing requirement (personal/individual developer accounts).** Accounts registered as an individual must run a closed test with a minimum number of testers (commonly cited as 12) opted in continuously for 14 days before they can apply for production access. **This is a schedule blocker, not a paperwork step** — it can make an announced Android launch date impossible on its own. Whenever a launch window is under about six weeks and the account is an individual one, raise this before writing a single field: the copy is worthless if the app cannot be published. Requirements here have changed more than once, so confirm the current rule in Play Console rather than quoting this line as gospel.
- **Data safety form** — must match what the app actually does
- **Content rating questionnaire**
- **Target API level** — falling behind removes the app from Play search for new users
- **Android vitals** (crash rate, ANR rate) — bad vitals suppress discovery surfaces

## Experiments

**Store listing experiments** in Play Console A/B test icon, screenshots, feature graphic, video, short description, and full description against live traffic, with statistical significance reported. Play's experiment tooling is more capable than Apple's, so when a team ships both stores, it's often right to run the creative test on Play first and port the winner to iOS.

**Custom store listings** target specific audiences, countries, install states, or ad campaigns with different copy and creative — the rough analogue of Apple's custom product pages.

## The porting mistake

Do not paste the iOS description into Play. On iOS it's an unindexed conversion asset, on Play it's an indexed ranking asset — the optimal copy differs in keyword placement, density, and structure. The validator warns when the two are identical, because when it happens it's almost always a copy-paste rather than a decision.
