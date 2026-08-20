# Keyword strategy

How to find the terms, judge whether they're winnable, and spend a 160-character budget on them.

**Contents:** [What Apple ranks on](#what-apple-actually-ranks-on) · [Research](#the-research-loop) · [Scoring](#scoring-a-candidate) · [Budget allocation](#allocating-the-budget) · [Locales](#storefronts-and-locales) · [Measurement](#measuring-whether-it-worked)

## What Apple actually ranks on

Ranking for a query is roughly a product of two things:

1. **Relevance** — does the term appear in an indexed field (name, subtitle, keyword field, developer name, IAP names, live in-app events)?
2. **Strength** — downloads and velocity for that term, conversion rate from impression to install, ratings volume and average, retention, and engagement.

The first is the part you write. The second is the part you earn, and it's why a brand-new app cannot out-rank an incumbent on a head term just by putting the term in its name. It's also why conversion work is ASO work rather than a separate discipline: better screenshots raise conversion, conversion feeds strength, strength raises rank for terms you already match.

## The research loop

**Seed from five sources.** They fail in different directions, which is the point — any one of them alone produces a biased list.

1. **The product.** Objects and verbs a user would type: `habit`, `streak`, `check in`, `reminder`.
2. **User vocabulary.** Mine reviews — the app's own and competitors' — via the reviews-RSS recipe in `data-and-endpoints.md` §3. Users describe the problem in words the product team never uses, and those words are what they type into search. This is consistently the highest-yield source and the most often skipped.
3. **Competitor names and subtitles.** From the store-page shelf (`data-and-endpoints.md` §2), which gives each competitor's name and subtitle. Those are their *chosen* head terms; they already paid for the research.
4. **Category conventions.** What the top 20 in the category all say — and, more interestingly, what none of them say.
5. **Long-tail intent.** Modifiers: `for <audience>`, `<object> planner`, `offline`, `widget`, `free`, `for couples`, `for adhd`. Long tail is where a small app actually wins.

**Then validate against the store** with the Search-API recipe (`data-and-endpoints.md` §4), which for each term gives who surfaces, their rating counts, whether your app appears at all, and how many top-10 apps carry the whole term in their name.

## Scoring a candidate

Three axes, kept in a table in the deliverable so every choice is auditable.

**Relevance (1–5)** — would someone typing this install *this* app? This is the axis people fudge, and fudging it is expensive: irrelevant traffic converts badly, and bad conversion feeds back into rank across your whole keyword set. A term you match but don't satisfy makes everything else worse.

**Volume (1–5)** — how many people search it.

> No public endpoint exposes search volume, and result-set depth does not proxy for it — a nonsense phrase still returns ~180 fuzzy matches from the search API. If the user has Apple Ads, its **keyword popularity score (0–100)** is the real number and its Search Terms report lists the queries users actually typed: use both and say so — see `apple-ads.md`. Otherwise triangulate from competitor adoption, category conventions, and Google keyword tools, and **label it an estimate in the deliverable**. Presenting a guessed volume as data is the fastest way to lose the user's trust in the whole document.

**Difficulty (1–5)** — derived from the median rating count of the top 10 (`data-and-endpoints.md` §4). Three incumbents with 500k+ ratings own that term for the foreseeable future, regardless of what you write.

**Where to aim.** Relevance 4–5, difficulty at or below what your rating volume supports. Two long-tail terms you rank top-3 for beat one head term you rank #50 for, because ranking below roughly the top 5 sends approximately zero installs. Say this plainly when someone pushes for the vanity term — then include it if they still want it, because that's a business call, not an algorithm call. Head terms become reachable later, once volume and conversion have built strength.

## Allocating the budget

Apple's indexed text surface is about 160 characters. Spend it in this order, because each step draws from the same pool:

1. **Name (30)** — brand + the single highest-value head term
2. **Subtitle (30)** — second-tier terms, but it must also read as a value proposition to a human
3. **Keyword field (100)** — everything left, comma-separated with no spaces, nothing already used above

Because Apple combines tokens across all three, write **single tokens**, not phrases. `habit,tracker,routine` covers `habit tracker`, `routine tracker`, and `habit routine` at a fraction of the character cost of spelling those phrases out.

Word-order note: Apple's combination is not strictly order-free in practice for every query, and exact-phrase matches in the name do carry weight. When one phrase is genuinely the term to win, put it in the name in the order users type it, and let the keyword field cover the combinations.

## Storefronts and locales

A storefront may index more than one locale's metadata, which would effectively multiply the keyword budget for that market. The widely-repeated case: in the **US storefront, English (U.S.) and Spanish (Mexico) metadata are both said to be indexed** — so filling in the es-MX localization would add a second name, subtitle, and 100-character keyword field working for US search, even for users browsing in English.

**Treat this as a community technique, not a documented fact.** Apple does not publish it, it cannot be verified from any public endpoint, and the specific locale pairings have shifted over time — this is exactly the kind of ASO lore that gets repeated long after it stops being true. It is cheap to try and plausibly high-value, which is why it's worth doing; it is *not* something to present to a user as "the biggest win here" or to bank a forecast on.

So when you recommend it, say what it is: an unverified, low-cost experiment, with the test attached. Fill the second locale for one storefront, leave everything else unchanged, and watch whether terms unique to that locale start ranking. That measurement is the whole point — without it you are asking someone to act on a rumour, and you will never know whether it worked.

The same standard applies to every other multi-locale pairing: **verify before building a strategy on it.**

**Localization is not translation.** Keywords do not translate: people search different concepts, not different words for the same concept. A machine-translated keyword field is worse than an empty one because it looks finished. Every locale gets its own research pass, ideally with a native speaker reviewing the term list.

Prioritize locales by where the installs actually are (or would be) — a fully localized listing in a market with no distribution is effort spent for nothing.

## Measuring whether it worked

Metadata changed without a recorded baseline can't be attributed, which is how ASO ends up unfundable inside a company. Every run records:

- The exact "before" values for every field changed, with the date
- The date the change went live (an iOS keyword change ships with a build; promotional text does not)
- **Impressions, product page views, and conversion rate** from App Store Connect / Play Console — not just rank
- Rank for the target terms, sampled on a schedule rather than once

Then wait. Indexing takes days to settle, and reading a rank change in the first 48 hours mostly reads noise. Change one dimension at a time where you can — if the keyword field and all the screenshots change in the same release, the result is uninterpretable no matter how good it is.
