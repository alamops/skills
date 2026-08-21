# Apple Ads and ASO

Apple Ads (formerly Apple Search Ads, still widely called ASA) and organic ASO are not two projects. They are one keyword system with a paid lane and an organic lane, and each lane produces the data the other one needs.

**Contents:** [The flywheel](#the-flywheel) · [Metadata gates ad cost](#metadata-gates-your-ad-cost) · [Campaign structure](#campaign-structure) · [Match types](#match-types-and-negatives) · [Custom product pages](#custom-product-pages) · [Reading the numbers](#reading-the-numbers) · [Feeding results back](#feeding-results-back-into-aso)

## The flywheel

Three connections, each of which is a reason to do the two together rather than in sequence:

**Ads → ASO (data).** The Search Terms report is the only source of *actual queries real users typed* on the App Store. Every other keyword input — competitor subtitles, review mining, category convention — is inference. The keyword popularity score (0–100) in the keyword planner is likewise the only genuine volume figure available anywhere; no public endpoint exposes it. A week of even a small discovery campaign produces better keyword research than any amount of unpaid guessing.

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

Up to 35 custom product pages, each with its own URL, and a CPP can be assigned per ad group. Matching the page to the query is one of the largest conversion levers available in the paid lane: a user who searched `receipt scanner for taxes` landing on a page whose first screenshot says exactly that converts materially better than one landing on the generic page.

A reasonable default mapping:

- **Brand** campaign → the default product page (they already know you)
- **Generic** ad groups → one CPP per major intent cluster, with screenshot 1 naming that intent
- **Competitor** campaign → a CPP leading with the differentiator against that competitor

CPPs are targeting, not testing. Product Page Optimization is the testing tool. Running both is normal and they do not conflict.

## Reading the numbers

- **TTR** (tap-through rate) — how compelling the icon, name and subtitle are *in the search result*. A low TTR on a relevant keyword is a creative problem, not a bidding problem.
- **CR** (conversion rate, tap → install) — the product page's job. Low CR with healthy TTR points at screenshots or at a mismatch between the query and the page, which is exactly what a CPP fixes.
- **CPT / CPA** — bid on a CPA target, not a CPT target. A more expensive tap that converts is cheaper than a cheap one that does not.
- Do not judge a keyword on fewer than roughly 100 taps. Calling a keyword dead at 15 taps is reading noise, the same failure as calling a PPO test at day two.

Attribution runs through AdServices / AdAttributionKit rather than the IDFA, and works without an ATT prompt for Apple Ads attribution itself — worth knowing because teams often assume ATT denial blinds them here.

## Feeding results back into ASO

Schedule this; it is the step that closes the loop and the one that gets forgotten.

After ~4 weeks of spend:

1. Pull the **Search Terms report**. These are real queries. Anything with volume and decent conversion that is *not* in your name, subtitle, or keyword field is a concrete, evidence-backed ASO change — the highest-quality keyword input that exists.
2. Pull the **popularity scores** for your current organic keyword set. Terms scoring low are candidates to cut and spend the characters elsewhere.
3. Note which terms convert badly. A term that takes taps but does not install is usually a relevance problem — consider dropping it organically too, because organic traffic on it will convert badly for the same reason and drag the strength signal down.
4. Where paid CR is strong but organic rank is weak, that term is worth pushing organically: you have direct evidence the page converts for it.

Record what changed and when, in the same baseline table the organic work uses. Paid and organic changes landing in the same week are indistinguishable afterwards.
