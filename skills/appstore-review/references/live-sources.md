# Pulling the live sources

The review is only as current as the text you hand the lanes. This file is how to get Apple's **exact** wording, not a paraphrase of it.

**Contents:** [Why raw text](#why-raw-text-not-a-summary) · [The fetch script](#the-fetch-script) · [Supporting pages](#supporting-pages-to-pull-when-the-project-needs-them) · [Reading the news](#reading-the-news-for-dated-requirements) · [Fallback](#fallback-when-the-script-cant-run) · [Abort rule](#the-abort-rule)

## Why raw text, not a summary

A summarizing fetch tool (anything that "answers a prompt against the page" with a small model) returns an interpretation, and interpretations drift in exactly the places that matter: a carve-out that only applies to the United States storefront, a rule that moved from 2.3.1 to 2.5.19, an "or" that became an "and". A finding that cites a rule has to cite the words Apple published. So pull the HTML with `curl` and convert it to text locally — it's one command, takes about a second, and gives every lane the same verbatim slice.

## The fetch script

`scripts/fetch_sources.py` is standard-library Python that shells out to `curl`, so it doesn't depend on Python's SSL setup:

```bash
python3 <skill-dir>/scripts/fetch_sources.py "$TMPDIR/appstore-review"           # fetch + slice
python3 <skill-dir>/scripts/fetch_sources.py "$TMPDIR/appstore-review" --rule 5.1.2 --rule 2.5.19   # exact rule text
```

Write the output **outside the repo** (the skill is read-only on the project). It produces:

| File | Use |
| --- | --- |
| `guidelines.txt` | Full guidelines. The script prints the page's `Last Updated:` date — put it in the report header |
| `section-1.txt` … `section-5.txt` | One per top-level section. Give each lane agent the path to its own section file, not all of it |
| `section-before.txt` / `section-intro.txt` | The "Before You Submit" checklist (it changes too — Oct 2026 added "Provide required documentation for apps and features that require regulatory approval") |
| `news.md` | Every Apple Developer News item from the last 12 months: date, title, URL, full text (`--months N` to widen) |
| `upcoming-requirements.txt` | `developer.apple.com/news/upcoming-requirements/` — the requirements already in force, with their start dates |
| `submitting.txt` | `developer.apple.com/app-store/submitting/` — the **announced** upload minimums (e.g. "Starting April 2027… built with the iOS & iPadOS 27 SDK or later, and target iOS 15 or later"). The upcoming-requirements page only lists what's already in force, and the news posts don't always restate the deployment-target floor — this page is where it lives |

`--rule <number>` prints one rule with its sub-items (`3.1.1(a)`, `2.3.1`, `5.1.1`), and prints `NOT FOUND` when the number doesn't exist in today's text. Use it to confirm every rule number before it goes into the report — a number that came from memory and isn't in the live text is the clearest sign a finding is stale.

## Supporting pages to pull when the project needs them

Fetch these with `curl -sSL -A "<browser UA>"` (or the summarizing fetch tool when you only need orientation, not quotes), only when the Project Profile makes them relevant:

| Trigger in the project | Page |
| --- | --- |
| Any tracking / attribution / ads SDK | `https://developer.apple.com/documentation/apptrackingtransparency` and the EU alternative-prompt post in `news.md` |
| Any third-party SDK, or required-reason API use | `https://developer.apple.com/documentation/bundleresources/describing-use-of-required-reason-api` and `https://developer.apple.com/support/third-party-SDK-requirements/` (the list of SDKs that need their own manifest and signature) |
| Building with (or moving to) the iOS 27 SDK; any iPhone app | `https://developer.apple.com/iphone-duo/prepare/`, TN3187 (scene life cycle), TN3192 (`UIRequiresFullScreen`), TN3208 (launch screen) — see `build-and-device.md` |
| Screenshots / store assets in the repo (`fastlane/screenshots`, `fastlane/metadata`) | `https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications` and `https://developer.apple.com/help/app-review/guideline-reference/2-3-3-screenshots` |
| Health / medical features | The Mar 26 2026 regulated-medical-device post in `news.md` |
| Kids / teen audience, social features | The age-rating and age-assurance posts in `news.md` (Texas, Utah, Louisiana, Brazil, Australia, Singapore) |

App Review also publishes per-guideline explainer pages under `https://developer.apple.com/help/app-review/guideline-reference/` (for example the 2.3.3 page that says App Review "will approve only those submissions where more than half of screenshots show the app in use"). They're worth pulling for a rule a finding hinges on.

## Reading the news for dated requirements

Not every requirement lives in the guidelines. In 2026 the guidelines never mentioned iPhone Duo, yet the news said Duo screenshots become mandatory in April 2027, and the iOS 27 release notes said apps built with the iOS 27 SDK "must adopt the scene-based life cycle or they fail to launch." A guidelines-only review misses all of that.

Read `news.md` (≈70 KB for a year — read it, don't skim titles) together with `submitting.txt` and pull out every item that says **must / required / starting / beginning / by <date>** and applies to iOS apps. For each, note:

- what is required, and whether it's enforced at **upload** (App Store Connect refuses the build), at **review** (rejection), or at **distribution** (removal / blocked in a region)
- the effective date — already in force, or upcoming
- whether it's checkable in the repo, or only in App Store Connect

Ignore what doesn't apply to an iOS app review (macOS-only items, design-award posts, price-tier updates). Already-in-force items become findings; future ones go in the report's *Upcoming requirements* section; App Store Connect-only items go in *Check in App Store Connect*. `recent-changes.md` lists what this produced as of October 2026 — use it to know what to look for, and the live news to confirm it still holds.

## Fallback when the script can't run

If Python is unavailable, do the same by hand: `curl -sSL -A "<browser UA>" https://developer.apple.com/app-store/review/guidelines/ -o guidelines.html`, strip tags, and grep the rule numbers you need. If only a summarizing fetch tool is available, use it, but say in the report that rule text was taken from a tool summary and quote nothing as verbatim.

## The abort rule

If you cannot reach `developer.apple.com` at all (offline, blocked, rate-limited), **stop**: "I couldn't fetch the live App Store guidelines. I won't review from cached knowledge — please retry when the network is reachable, or paste the relevant sections." The script exits non-zero in exactly that case. If the guidelines came through but the news or upcoming-requirements page didn't, continue — and say in *Notes & limitations* that dated requirements weren't checked against live news.
