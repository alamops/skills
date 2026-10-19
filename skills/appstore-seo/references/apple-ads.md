# Apple Ads and ASO

Apple Ads (formerly Apple Search Ads, still widely called ASA) and organic ASO are not two projects. They are one keyword system with a paid lane and an organic lane, and each lane produces the data the other one needs.

**Contents:** [The flywheel](#the-flywheel) · [Metadata gates ad cost](#metadata-gates-your-ad-cost) · [Campaign structure](#campaign-structure) · [Bid strategy](#bid-strategy-manage-bids-vs-maximize-conversions) · [Match types](#match-types-and-negatives) · [Custom product pages](#custom-product-pages) · [Ad placements](#search-results-placements-changed-in-2026) · [Reading the numbers](#reading-the-numbers) · [Getting the data](#getting-the-data-out) · [Feeding results back](#feeding-results-back-into-aso)

## The flywheel

Three connections, each of which is a reason to do the two together rather than in sequence:

**Ads → ASO (data).** The Search Terms report is the only source of *actual queries real users typed* on the App Store. Every other keyword input — competitor subtitles, review mining, category convention — is inference. The keyword popularity score (1–100) in the keyword planner is likewise the only genuine volume figure available anywhere; no public endpoint exposes it. A week of even a small discovery campaign produces better keyword research than any amount of unpaid guessing.

**ASO → Ads (cost).** Apple decides whether your ad is *relevant* for a keyword partly from your product page metadata. Bid on a term that appears nowhere in your name, subtitle, or keyword field and you are fighting the relevance model: lower ad eligibility, worse placement, higher cost per tap. The 100-character keyword field is therefore not only an organic asset — it is what makes the paid lane affordable.

**Paid → organic rank.** Installs and conversion attributed to a search term feed the strength signal that drives organic ranking for that term. Paid pressure on a keyword you are already relevant for can pull the organic listing up with it. This is why the paid keyword set and the organic keyword set should be deliberately aligned, not independently chosen.

The practical consequence: **the keyword research done for ASO should be produced in a form that drops straight into campaign structure**, and the campaign's search-term output should be scheduled back into the next ASO revision.

## Metadata gates your ad cost

The one asymmetry worth memorising, because it inverts an ASO rule:

| | Organic keyword field | Apple Ads |
| --- | --- | --- |
| Competitor brand names | **Never.** Apple strips them; trademark exposure (5.2) | **Allowed and standard.** Bidding on competitor terms is a normal campaign type |
| Category names | Wasted — auto-indexed | Fine to bid on |
| Generic filler (`app`, `free`) | Wasted characters | Usually poor CPA, but a measurable decision rather than a rule |

So "you cannot put `habitica` in your keyword field" and "you can run a Competitor campaign on `habitica`" are both true, and confusing the two is a common and expensive mistake in either direction — either leaving competitor traffic entirely uncontested, or getting metadata stripped and risking a trademark complaint.

## Campaign structure

Four campaigns, separated because they have genuinely different economics and deserve different budgets and CPA targets. Mixing them into one campaign makes the numbers uninterpretable.

| Campaign | Keywords | Why it is separate |
| --- | --- | --- |
| **Brand** | Your app name, brand misspellings, brand + category (`ledgerly`, `ledgerly app`) | Cheapest taps and by far the highest conversion rate. Its real job is defensive — competitors can and do bid on your name. Never let brand terms sit in the same campaign as generic ones or the blended CPA will look great and mean nothing |
| **Generic / Category** | Head and long-tail category terms (`receipt scanner`, `expense tracker for freelancers`) | The volume driver and the expensive one. This is where the ASO keyword table transfers directly |
| **Competitor** | Rival brand names | Higher CPA, lower conversion, but it reaches users with proven category intent. Budget it deliberately and judge it on its own CPA target |
| **Discovery** | Search Match on, broad match, *no* exact keywords | Its purpose is not installs — it is to **find search terms you did not think of**. Harvest winners into the Generic campaign as exact, then negative them here so discovery keeps discovering |

Keep one match type per ad group. An ad group mixing exact and broad makes it impossible to tell which one produced the result.

## Building the plan from the scored table

You already have the scored keyword table from the ASO work (`data-and-endpoints.md` §4). Bucket it by hand — there's no tool to run, just this rule:

- **Brand** — the brand token and brand+category (`ledgerly`, `ledgerly app`), Exact match. Cheapest, highest-converting, defensive.
- **Competitor** — real rival brand names, Exact. Allowed here even though they're forbidden in the organic keyword field. Derive candidates from the app names that recur across your scouted result sets — but **drop any that are just the category spelled out** (an app literally named "Habit Tracker" is a generic keyword, not a brand to bid on).
- **Generic** — everything else, split by the difficulty you already scored: **Contested** (difficulty ≥ 4 — paid is the only near-term way in, so cap CPA hard), **Long Tail** (3+ word terms — usually the best CPA and the easiest organic win too), **Core** (the rest — primary volume; these must also be covered organically to keep the tap price down).
- **Discovery** — Search Match on and broad match, **no exact keywords**. Its job is finding queries you didn't think of.

Then the **negatives**, which is the step teams skip and the reason campaigns look unprofitable:
- In **Generic**: add all your brand terms as negatives, so cheap brand traffic stops flattering the numbers.
- In **Discovery**: add every exact keyword (all of Brand/Generic/Competitor) as negatives, so it keeps surfacing *new* terms instead of re-buying what you already run.
- Everywhere: negative any term for a feature the app lacks.

## Bid strategy: Manage Bids vs. Maximize Conversions

Since February 2026 every advertiser can choose **Maximize Conversions** for search-results campaigns: you set a target CPA and Apple's auto-bidder bids for you, using Search Match inside an automated ad group where you "can't add or manage keyword bids." The alternative is **Manage Bids** — the classic per-keyword control.

That choice interacts with the structure above:

- **Brand, Competitor and Generic exact** stay on **Manage Bids**. Their value is that each keyword's cost and conversion is visible and controllable; an automated ad group can't hold that discipline, and putting brand traffic in it lets cheap brand installs subsidize everything else inside one blended CPA — the exact problem the four-way split exists to prevent.
- **Maximize Conversions** behaves like a Discovery campaign with an auto-bidder attached. Use it as the automated scale-and-discover lane, give it its own budget and CPA target, and keep the negatives in place (brand terms and every exact keyword you already run) so it isn't re-buying traffic you already own.
- Apple caps monthly spend at roughly daily budget × 30.4 and recommends about two weeks of learning before changing a Maximize Conversions campaign. Judging it on its first week is the same mistake as calling a keyword at 15 taps.

Bid and budget *management* inside these campaigns remains out of scope for this skill (see the scope note in `SKILL.md`); choosing which strategy each campaign uses is structure, and in scope.

## Match types and negatives

- **Exact** — the query (and close variants/plurals) only. Use for every keyword you have deliberately chosen.
- **Broad** — related queries, plurals, misspellings, partial phrases. Use in Discovery, not in Generic.
- **Search Match** — Apple matches your app to queries automatically using your metadata. Discovery only. Note that this is the mechanism where weak metadata directly costs money: Search Match reads your product page.

**Negative keywords are the part people skip, and skipping them is what makes campaigns look unprofitable:**

- Add brand terms as negatives in Generic and Discovery, so cheap brand traffic stops flattering their numbers.
- Add every exact keyword as a negative in Discovery, so it keeps surfacing genuinely new terms.
- Add terms for features you do not have. A `mileage tracker` tap on a receipt scanner is a paid install that will churn — and the churn feeds back into the organic strength signal.

That last one is the same discipline as the organic rule about never keywording a feature the app lacks; here it costs money immediately rather than slowly.

## Custom product pages

Up to **70** custom product pages (raised from 35 in October 2025), each with its own URL; a CPP can be assigned per ad group, and search-results ad variations can be built from CPPs. Matching the page to the query is one of the largest conversion levers available in the paid lane: a user who searched `receipt scanner for taxes` landing on a page whose first screenshot says exactly that converts materially better than one landing on the generic page.

A reasonable default mapping:

- **Brand** campaign → the default product page (they already know you)
- **Generic** ad groups → one CPP per major intent cluster, with screenshot 1 (and, for iOS 27+ viewers, the search result asset) naming that intent
- **Competitor** campaign → a CPP leading with the differentiator against that competitor

CPPs now also rank **organically**: a CPP can be assigned keywords from the app's approved keyword field, and "each keyword combination is unique to a single product page." That creates a choice the paid plan has to make deliberately. App Store Connect has no keyword-level analytics, so Apple's own advice is to keep **separate CPPs for ads and for organic** — otherwise paid and organic installs land on the same page and neither can be measured. The intent clusters can be the same; the pages shouldn't be.

CPPs are targeting, not testing. Product Page Optimization is the testing tool. Running both is normal and they do not conflict.

Creative assets (the 3:2 search-results image or video from the App Store product page) are coming to Apple Ads search-results and Today-tab ads "at a later date"; Apple Ads reviews them separately, with the same no-pricing, no-ranking-claims rules. When they arrive, the per-intent CPP is where the per-intent ad creative lives.

## Search-results placements changed in 2026

Search results ads are no longer a single top slot. Apple Ads Help: your ad "can appear either at the top of their search results or further down the page… you can't select or bid for a particular ad position." Industry trackers date the rollout from March 2026 (UK first, then Japan, then global) and describe it as allowing two advertisers per query (AppTweak, third-party).

What changes for the plan:

- **Brand defense matters more.** A second slot means a competitor can now sit between your top ad and your organic result for your own name. The Brand campaign stops being optional for any app with real brand search.
- **Impression share is split.** Reporting now distinguishes *Impression Share (First Ad Position)* from *Impression Share (All Ad Positions)* (the API reports `FIRST_SLOT` / `ALL_SLOTS`). Read first-position share for Brand; all-positions share is the fairer number for Generic.
- **Organic position 1 is lower on the screen than it was.** A term you rank #1 for organically sends fewer taps than it did in 2025 — one more reason the paid and organic keyword sets should be planned together.

## Reading the numbers

- **TTR** (tap-through rate) — how compelling the icon, name and subtitle are *in the search result*. A low TTR on a relevant keyword is a creative problem, not a bidding problem.
- **CR** (conversion rate, tap → install) — the product page's job. Low CR with healthy TTR points at screenshots or at a mismatch between the query and the page, which is exactly what a CPP fixes.
- **CPT / CPA** — bid on a CPA target, not a CPT target. A more expensive tap that converts is cheaper than a cheap one that does not.
- Do not judge a keyword on fewer than roughly 100 taps. Calling a keyword dead at 15 taps is reading noise, the same failure as calling a PPO test at day two.

Attribution runs through AdServices / AdAttributionKit rather than the IDFA, and works without an ATT prompt for Apple Ads attribution itself — worth knowing because teams often assume ATT denial blinds them here.

## Getting the data out

The two numbers this whole skill leans on — keyword popularity and real search terms — now have a programmatic source:

- **Apple Ads Platform API 1.0** (August 2026) supersedes the Campaign Management API, which **is sunset on January 26, 2027**. Any script or tool still calling the old API (bid scripts, reporting pipelines, third-party connectors) needs migrating before then — worth flagging whenever a user mentions existing automation.
- Its **Insights** endpoint `POST /v1/insights/apps/search-term-popularity/query` returns, per country and genre, weekly or monthly: `searchPopularity1to100`, `searchPopularity1to5`, `searchPopularityInGenre`, and `rankInGenre`. That is the keyword planner's popularity score, available in bulk — the real Volume column for the keyword table, instead of an estimate.
- An impression-share query reports exact values from 1–90% and a 91–100% bucket, and suppresses terms under 10 impressions.

All of it needs an Apple Ads account and API credentials, which the user has to supply — never ask for them to be pasted into chat; have the user run the call and hand back the output. If they don't have access, the volume column stays labelled as an estimate.

## Feeding results back into ASO

Schedule this; it is the step that closes the loop and the one that gets forgotten.

After ~4 weeks of spend:

1. Pull the **Search Terms report**. These are real queries. Anything with volume and decent conversion that is *not* in your name, subtitle, or keyword field is a concrete, evidence-backed ASO change — the highest-quality keyword input that exists.
2. Pull the **popularity scores** for your current organic keyword set. Terms scoring low are candidates to cut and spend the characters elsewhere.
3. Note which terms convert badly. A term that takes taps but does not install is usually a relevance problem — consider dropping it organically too, because organic traffic on it will convert badly for the same reason and drag the strength signal down.
4. Where paid CR is strong but organic rank is weak, that term is worth pushing organically: you have direct evidence the page converts for it.
5. Where a term converts well **on a specific CPP**, assign that term to the organic twin of that CPP (from the approved keyword field), so organic searchers land on the page you've already proven converts.

Record what changed and when, in the same baseline table the organic work uses. Paid and organic changes landing in the same week are indistinguishable afterwards.
