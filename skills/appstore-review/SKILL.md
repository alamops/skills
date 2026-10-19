---
name: appstore-review
description: (alamops) Use whenever the user wants their iOS app checked against Apple's App Store Review Guidelines and submission requirements, or asks if Apple will reject something. Triggers — "will Apple reject this?", pre-submission audit, App Store readiness, pre-flight before TestFlight or App Store Connect upload, ITMS upload errors, rule compliance (3.1.1, 4.8, 5.1.1, 2.5.19…), iPhone Duo / foldable readiness, Xcode/SDK minimums and deadlines, or whether a change is allowed (subs moved off IAP to Stripe or a web link, tracking SDKs, sending user data to an AI API, remote feature flags, social login, permissions, privacy manifest, ATT, account deletion, age rating). Native Swift, React Native, Expo, Flutter, Capacitor, Unity. Fetches the live guidelines and Apple Developer News as exact text, then returns findings keyed by guideline number with severity, file:line evidence and fixes, plus upcoming deadlines. Read-only. Not for general code review, implementing features, or store-listing ASO (use appstore-seo).
---

# App Store guideline review

A read-only audit skill: review a project against Apple's live App Store Review Guidelines and the submission requirements Apple publishes around them, and report whether it would survive upload and App Review. Tone: pragmatic reviewer who has shipped apps and knows which rules actually get apps bounced.

## Why this skill exists

Apple's rules drift, and they drift in two places. The guidelines themselves change several times a year — in twelve months they gained 2.5.19 (hidden features), 2.3.14 (creative assets), third-party-AI consent in 5.1.2(i), chatbots in 4.7, AI content creation in 1.2, and a United States carve-out for purchase links. And a second set of requirements never appears in the guidelines at all: SDK and deployment-target minimums enforced at upload, the age-rating questionnaire, regional age-assurance laws, and new hardware. When iPhone Duo shipped in October 2026 the guidelines didn't mention it once — the requirements (Duo screenshots mandatory from April 2027, iOS 27 SDK builds that "fail to launch" without the scene life cycle) lived in Apple Developer News and release notes.

Reviewing against a snapshot in the model's head is how teams ship rejections. **Pull both sources live, as exact text, at the start of every run.** If the guidelines fetch fails, say so plainly and stop — do not guess from training data.

## The 6-step workflow

### 1. Pull the live sources

Run the bundled fetcher — it downloads the raw pages with `curl`, converts them to text locally, and slices the guidelines per section so every lane gets Apple's exact wording (a summarizing fetch tool paraphrases, and paraphrase is where carve-outs and renumberings get lost):

```bash
python3 <skill-dir>/scripts/fetch_sources.py "$TMPDIR/appstore-review"
```

It writes `guidelines.txt`, `section-1.txt`…`section-5.txt`, `news.md` (every Apple Developer News item from the last 12 months, full text), `upcoming-requirements.txt` (minimums in force) and `submitting.txt` (announced minimums, e.g. the April 2027 SDK and deployment-target floor) outside the repo, and prints the guidelines' `Last Updated:` date. `--rule 5.1.2` prints one rule's exact text — use it to confirm every rule number before it reaches the report. Details, supporting pages to pull per project shape, and the by-hand fallback: `references/live-sources.md`.

Then **read `news.md` and `submitting.txt` for dated requirements** — anything that says must / required / starting / by <date> and applies to iOS apps. Classify each as in force (→ potential finding), upcoming (→ *Upcoming requirements*), or App Store Connect-only (→ *Check in App Store Connect*). `references/recent-changes.md` is a map of what this produced as of October 2026; use it to know what to look for and the live text to confirm it.

If the guidelines can't be fetched (the script exits non-zero), **abort** with: "I couldn't fetch the live App Store guidelines. I won't review from cached knowledge — please retry when the network is reachable, or paste the relevant sections." If only the news fetch fails, continue and say so in *Notes & limitations*.

If the user passes a guideline number directly ("check rule 5.1.1"), still fetch once so the wording you cite is current.

### 2. Detect the project shape

Before you can map rules to code, figure out what kind of app this is. Run these probes in parallel:

- If the project is a git repo: `git ls-files | head -200`. Otherwise (consultancy hand-off, tarball, snapshot): `find . -maxdepth 3 -type f | head -200` plus a top-level `ls -la`. Either way, the goal is the top-level shape.
- Platform markers: **native** (`*.xcodeproj`, `*.xcworkspace`, `Info.plist`, `*.entitlements`, `Package.swift`), **React Native** (`package.json` with `react-native`, `ios/`), **Expo** (`app.json`/`app.config.*` with `expo`, `eas.json`), **Flutter** (`pubspec.yaml`, `ios/Runner/`), **Capacitor/Ionic** (`capacitor.config.*`, `ios/App/`), **Unity** (`ProjectSettings/`).
- App-level metadata: bundle ID, display name, capabilities, entitlements, usage descriptions (`NS*UsageDescription`), IAP product IDs if visible, the storefronts it ships to (README, `fastlane`, availability notes — the US carve-outs make this matter).
- **Toolchain and runtime shape:** the Xcode/SDK the release build uses (CI config, `.xcode-version`, EAS `image`), deployment target, app life cycle (SwiftUI `App` / `SceneDelegate` / `AppDelegate`-owned window), device family, orientation and full-screen settings.
- Store-listing artifacts in the repo: `fastlane/metadata/`, `fastlane/screenshots/`, `store.config.json`, marketing folders.

Where each of these lives per framework, and which SDKs signal tracking, payments, login, AI and feature flags: `references/repo-probes.md`.

Write a short **Project Profile** block (platform, framework versions, toolchain, life cycle, auth providers, payment surface and storefronts, tracking SDKs, AI providers, remote-config/flag systems, UGC surfaces, kids-category signals). The lane agents use it to know what *not* to flag — don't hunt for IAP issues if there are no purchases.

### 3. Orchestrate parallel lane agents

Spawn one Agent per review lane, in a single message so they run concurrently. Each gets:

- **The path to its own section file** from step 1 (not the whole guidelines — that dilutes focus), plus any supporting page it needs
- The Project Profile
- A clear instruction: **read-only, structured findings only, cite file:line, no positive findings, quote the rule**

| Lane | Source | What to look for |
| --- | --- | --- |
| Safety | `section-1.txt` | UGC and **AI content creation** (1.2: filtering, report, block, contact info; NCII; random/anonymous chat), creator-content age gating (1.2.1(a)), kids (1.3), medical claims (1.4), developer info |
| Performance | `section-2.txt` | Crashes and placeholder content (2.1), demo account / review notes (2.1(a), 2.3.1(a)), accurate metadata (2.3.x incl. 2.3.3 screenshots and 2.3.14 creative assets when store assets are in the repo), hardware (2.4), public APIs and no code download (2.5.1/2.5.2), ads (2.5.18), **hidden, dormant or undocumented features — remote-flag gates, "off during review" switches, obfuscation (2.5.19)** |
| Business | `section-3.txt` | Payments: IAP for digital goods (3.1.1); **in-app non-IAP checkout vs. link-outs, and which storefronts** (3.1.1(a) / 3.1.3 United States carve-out); subscriptions (3.1.2: disclosure, restore, manage), loot-box odds, other business-model rules (3.2) |
| Design | `section-4.txt` | Copycats incl. other developers' brands in name/icon (4.1(c)), minimum functionality and saturated categories (4.2, 4.3(b)), extensions, push abuse (4.5.x), **mini apps, plug-ins and third-party chatbots (4.7)**, login services — **an equivalent privacy-preserving login option when Google / Facebook / X / etc. is used (4.8)** |
| Legal | `section-5.txt` | Privacy (5.1.1: policy, consent, minimization, **account deletion (v)**, regulated fields (ix)); **data shared with third parties incl. third-party AI requires disclosure and explicit permission (5.1.2(i))**; tracking (5.1.2); kids (5.1.4); location (5.1.5); IP (5.2); gaming (5.3); VPN/MDM |
| Build, upload & device | upcoming-requirements + `news.md` + `references/build-and-device.md` | Toolchain vs. SDK minimum, deployment target, launch screen, **scene life cycle for iOS 27 SDK builds**, `UIRequiresFullScreen`/orientation/geometry-read-once code on **iPhone Duo**, Duo screenshot plan, iOS 27 deprecations |
| App Privacy & required-reason APIs | 5.1 + required-reason docs | `PrivacyInfo.xcprivacy` present, each required-reason API (UserDefaults, file timestamp, system boot time, disk space, active keyboard) declared with a valid reason, listed third-party SDKs carrying their own manifest/signature, tracking domains |
| App Tracking Transparency | 5.1.2 + ATT docs + EU prompt post | Tracking SDK wired up → `NSUserTrackingUsageDescription` set, prompt called *before* tracking, no tracking on denial, no IDFA/fingerprinting fallback, purpose string fit for the EU full-page sheet, `.notDetermined` after "Additional Information" re-requested |

Each lane returns findings in a fixed shape (below). Use structured output if available; otherwise a fenced JSON block.

#### Prompt template for each lane agent

```
You are auditing an iOS-shipping project against ONE lane of Apple's
current App Store requirements. You are read-only — do not edit any
file. Return findings only, no praise, no commentary.

PROJECT PROFILE:
<insert profile block>

LIVE SOURCE TEXT (fetched today — the only rule text you may rely on):
<path(s) to the section file / supporting pages>
To get the exact text of one rule: python3 <skill-dir>/scripts/fetch_sources.py <dir> --rule <n>

YOUR JOB:
For each rule in this lane, decide whether the project plausibly
violates it. A violation requires either (a) concrete evidence in the
code/config/metadata, or (b) a structural gap (e.g., the app collects
data but has no privacy policy URL anywhere in the repo). Do not flag
rules that don't apply. If a rule you expected is not in the live text,
it was renumbered or removed — don't cite it from memory.

For each finding, output:
{
  "rule": "<guideline number as in the live text, e.g. 5.1.1(v); or 'Upload requirement' / 'Submission requirement' for news-only rules>",
  "title": "<one-line summary>",
  "severity": "blocker" | "risk" | "nit" | "upcoming",
  "evidence": "<file:line(s) or 'absent: <thing>'>",
  "quote": "<= 30 words of the live rule text this finding rests on>",
  "source": "<guidelines URL, or the news/doc URL for non-guideline requirements>",
  "effective": "<date, only for upcoming or recently-effective requirements>",
  "why_it_fails": "<one sentence — what Apple would object to>",
  "fix": "<concrete remediation, 1–3 sentences>"
}

Severity:
- blocker:  App Review actively rejects this, or upload is refused today
- risk:     grey area / depends on how Apple reads it / common bounce
- nit:      unlikely to reject but cleanup before submission
- upcoming: not enforced yet; announced with a date

A finding that rests only on something being ABSENT from the repo
("no code uses the background location mode", "no Rewards screen")
is a risk, not a blocker, whenever the repo looks partial (trimmed
snapshot, generated native project, missing routes). Say what would
make it a blocker ("if 3.2 really has no hike recording…").

If you find nothing, return an empty array. Do not invent findings.
```

#### Allocation tips

- Run **Build, upload & device** on every run — it is cheap, it's where upload blockers live, and it answers the iPhone Duo question.
- Spawn the **App Privacy** and **ATT** lanes only if step 2 found tracking SDKs, analytics, or required-reason API use. Otherwise skip them and say so ("no tracking surface detected — ATT lane skipped").
- For very small projects, fold Safety+Design into one agent; for large monorepos with native and JS code, give each its own Performance lane.
- If the project calls any AI provider or generates content (LLM client, image-gen SDK, on-device generative model), add a mini-lane that checks the three live anchors together: 5.1.2(i) (disclosure + explicit permission before sharing personal data with third-party AI), 1.2 (AI content creation apps need filtering, reporting, blocking), and 4.7 (third-party chatbots/plug-ins).

### 4. Cross-check the obvious deal-breakers

Independent of the lanes, sweep these yourself — they're cheap and Apple rejects on them constantly:

- **Account creation but no in-app account deletion** (5.1.1(v)) — blocker.
- **Third-party or social login with no equivalent privacy-preserving option** (4.8). Sign in with Apple satisfies it; the rule asks for an option that limits data to name and email, allows a private email, and doesn't track for ads without consent. Check the five exemptions in the live text before flagging.
- **Personal data or user content sent to an AI provider** without a clear disclosure and explicit opt-in before the first call (5.1.2(i)).
- **Digital goods paid inside the app outside IAP** — a Stripe/PayPal/Braintree payment sheet for a subscription or unlock is 3.1.1 in every storefront. A **link or button to buy on the web** is allowed in the **United States storefront** without an entitlement, but needs the applicable entitlement (and its disclosure sheet) everywhere else — so it's a finding whenever the app ships beyond the US and shows the link unconditionally.
- **Hidden or server-gated features** not described in review notes — "keep off while in review" flags, dormant screens, obfuscated feature names (2.5.19). Removal and account termination are on the table, so this is a blocker when the intent is visible.
- **Tracking SDK + no ATT prompt**, or **ATT prompt + no `NSUserTrackingUsageDescription`**.
- **Missing or useless usage descriptions** for any sensitive API actually used (camera, mic, photos, location, contacts, calendars, motion, Bluetooth, local network, HealthKit, HomeKit, Face ID) — `"camera"` is not a purpose string (5.1.1(ii) links Apple's guidance on writing them).
- **No `PrivacyInfo.xcprivacy`** while using required-reason APIs or listed SDKs (upload refused: ITMS-91053 / ITMS-91061).
- **Toolchain below the SDK minimum** (Xcode 26 / iOS 26 SDK since Apr 28, 2026) or deployment target below iOS 13 — upload refused. Read the pinned Xcode, not the one on your machine.
- **iOS 27 SDK build without the scene life cycle** — the app fails to launch (blocker if already on Xcode 27; *upcoming* with the April 2027 date otherwise).
- **Auto-renewing subscription** without visible price, period, trial conversion, manage/cancel link, and restore.
- **Hardcoded "TestFlight only" / beta gates** still active in the production path.
- **Crash-prone code on a primary screen** (force-unwraps, unhandled rejections) — the most common 2.1 rejection.
- **Placeholder copy, lorem ipsum, TODOs, "Coming soon" cards** on screens the reviewer will see.

For each, generate a finding in the same shape as the lanes. Don't duplicate — if a lane caught it, keep theirs.

### 5. Consolidate the report

Merge all findings. Deduplicate by `(rule, evidence)`. Re-run `--rule` on any number you're unsure of. Sort by severity (blocker → risk → nit), then by guideline number; `upcoming` items go in their own section, sorted by date.

Calibrate before you write the verdict. The 🛑 verdict should rest on blockers backed by evidence that is *in* the repo (code, config, a pinned toolchain); a blocker inferred only from something missing in a visibly partial repo gets downgraded to a risk with its condition stated. And keep the report proportionate: each finding is the four-line block below, nits can be one line, and an item appears in exactly one section — don't restate findings in *Upcoming* or *Check in App Store Connect*.

Each finding inside `### Blockers` / `### Risks` / `### Nits` renders as:

```
**[<rule>] <title>** — <severity>
- *Evidence:* `<file:line>` or `absent: <thing>`
- *Rule says:* "<quote>"
- *Why it fails:* <one sentence>
- *Fix:* <concrete remediation>
```

**Always use this exact report scaffold** (and nothing else — do not emit the rendering rubric above as a section in the report):

```
# App Store readiness report

**Sources fetched:** <guidelines URL> (Last Updated: <date from the page>) · Apple Developer News through <latest item date> · on <today's date>
**Project profile:** <one paragraph — platform, frameworks, toolchain, life cycle, payment surface and storefronts, tracking, auth, AI>
**Lanes run:** <list of lanes, with any skipped lanes and why>

## Verdict

<One of:>
- ✅ **Likely to pass.** No blockers found. <Optional: N nits worth cleaning up before submission.>
- ⚠️ **Risk of rejection.** N risks, M nits. No outright blockers, but at least one finding maps to a rule Apple frequently enforces.
- 🛑 **Will likely be rejected.** N blockers. Submitting in current state is a waste of a review cycle.

<If the user asked a direct question ("will Apple reject us over X?"), answer it here in one or two plain sentences.>

## Findings

### Blockers
<one finding block per blocker>

### Risks
<one finding block per risk>

### Nits
<one finding block per nit>

## Upcoming requirements
<date — requirement — what it breaks in this project — fix. Omit the section if none apply.>

## Check in App Store Connect
<only the items the repo can't show and the profile makes relevant — age rating answers, App Privacy answers, review notes / demo account, screenshots per device, medical-device status, etc.>

## Notes & limitations
<Anything the user should know — couldn't inspect X, lane Y was skipped because Z, a generated-at-build-time artifact was inferred from config, news fetch failed, etc.>
```

If there are zero findings, the report is the header + verdict + any upcoming items + a one-line note ("Sweeps clean against today's guidelines. Re-run after any change to tracking, IAP, sign-in, AI, or account flows."). Do **not** invent findings to fill space.

### 6. Do not modify code

This skill is strictly read-only. Even if you spot a one-line fix and feel the urge — surface it in the `fix:` field. The user runs the fixes themselves (or hands the report to a separate edit-capable session). This matches the house style of the other `(alamops)` review skills. Scratch output (the fetched sources) goes in a temp directory, never in the repo.

## Triggering & disambiguation

- "App Store review", "App Review", "App Store guidelines", "will Apple reject this?", "pre-submission audit", "App Store readiness", "is my app ready for iPhone Duo / the foldable?", a guideline number ("is this 4.8-compliant?"), or an upload error (ITMS-90725, ITMS-91053, ITMS-90068) → this skill.
- A **general** code review (bugs, perf, security) → `code-review`.
- A request to **set up** Sign in with Apple, IAP, ATT, scene life cycle, etc. → this skill audits, it doesn't implement. Surface the gap as a finding.
- Writing or optimizing the **store listing** (name, keywords, screenshots for conversion) → `appstore-seo`. Metadata *compliance* (2.3.x) stays here when the metadata is in the repo.

## Working notes

- Cite by **number + short title** (e.g., "5.1.1(v) — Account sign-in and account deletion") and with the live quote, so the user can find the rule even after a renumbering. The `rule` field must match the live text — `--rule` it.
- **Requirements that aren't in the guidelines get their source, not a guideline number.** iPhone Duo screenshots, SDK minimums, the scene life cycle, age-rating questions: cite the news post or doc URL and use `Upload requirement` / `Submission requirement` as the rule. Filing them under an invented or loosely-related guideline number (2.4.1 is iPad; it isn't a foldable rule) misleads the user about what App Review enforces.
- **Answer the question that was asked.** "Will Apple reject us because of the iPhone Duo?" has a direct answer (no Duo-specific review rule exists today; here's what changes in April 2027 and what breaks on the device now). Don't make the user dig it out of a findings list.
- When you skip a lane, **say so**. A silent skip reads as "passed".
- Don't flag every `NSCameraUsageDescription` as "make sure the string is meaningful" — flag only strings that are missing, empty, generic to the point of uselessness, or boilerplate that doesn't describe the feature.
- Don't flag the absence of store-listing copy or screenshots if the repo doesn't contain that artifact category — list the check under *Check in App Store Connect* instead.
- Storefront matters now. When a finding depends on where the app ships (US link-outs, EU ATT sheet, Japan/Brazil payments, regional age laws), state the storefront assumption you used.

## Reference files

- `scripts/fetch_sources.py` — live guidelines, news and upcoming requirements as exact text, sliced per lane; `--rule` for one rule
- `references/live-sources.md` — how to fetch, supporting pages per project shape, reading the news, fallback, abort rule
- `references/build-and-device.md` — the Build, upload & device lane: upload blockers, announced deadlines, iPhone Duo behaviour and what to grep
- `references/recent-changes.md` — Nov 2025–Oct 2026 guideline and requirement changes with what each means in a repo, corrections to old review habits, and the App Store Connect checklist
- `references/repo-probes.md` — where Info.plist keys, entitlements, privacy manifests, toolchain and life cycle live per framework; SDK signals for the Project Profile

## Example invocations

- "Run an App Store review on this repo before I submit." → full audit, all lanes.
- "Check this against 3.1.1 and 5.1.1." → fetch, run only Business + Legal, narrow output.
- "Is my Expo app ready for App Review?" → detect Expo, audit `app.json` (incl. config-plugin keys), the EAS build image and submit profile, and any committed native shim.
- "I added Google sign-in — am I OK?" → 4.8 (equivalent privacy-preserving login) plus 5.1.1(v) (account deletion) — they almost always travel together.
- "iPhone Duo ships Friday — will Apple reject our update because of it?" → Build, upload & device lane plus the news: a direct no/yes, the current upload blockers, what the device does to this app's layout, and the April 2027 deadlines.
- "We're adding an AI coach that sends journal entries to OpenAI." → AI mini-lane: 5.1.2(i) consent flow, 1.2 if output is shareable, App Privacy labels.
