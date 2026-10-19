# Recent changes worth checking (Nov 2025 – Oct 2026)

What changed, and what each change means for a repo audit. **This is a map of where to look, not the rule text.** The live fetch decides the wording, the numbering and whether a rule still exists: run `fetch_sources.py --rule <n>` for every number below before citing it. If a rule here isn't in today's text, it was renumbered or withdrawn — say so instead of citing it.

Snapshot compiled 2026-10-19 from the live guidelines ("Last Updated: October 16, 2026"), Wayback diffs of earlier versions, and Apple Developer News.

**Contents:** [Guideline changes](#guideline-changes) · [Requirements outside the guidelines](#requirements-outside-the-guidelines) · [Corrections to old habits](#corrections-to-old-review-habits) · [App Store Connect-only checklist](#check-in-app-store-connect)

## Guideline changes

| Date | Rule | Change | What to check in the repo |
| --- | --- | --- | --- |
| 2026-10-16 | **2.5.19** (new) | "Don't include any hidden, dormant, or undocumented features… Attempting to hide undocumented features in your app binary, such as through code obfuscation… is grounds for removal… and termination of your developer account." Moved from 2.3.1 and hardened; Apple frames it against bait-and-switch apps | Remote-config / feature-flag gates on features absent from the review notes, especially money-adjacent ones (rewards walls, gambling, crypto, external payments); comments like "keep off during review", flags defaulting `false` until approval; code paths reachable only by server switch; obfuscated or string-encoded feature names. A flag isn't a violation by itself — an undisclosed feature behind it is |
| 2026-10-16 | **2.3.14** (new) | Creative assets (product page header, search result asset) must pertain to the app or brand, be 4+, no "unverifiable product claims, or specific or discounted pricing information" | Only if store assets live in the repo; otherwise App Store Connect checklist |
| 2026-10-16 | **2.3.3** (guidance) | App Review's 2.3.3 page: approves "only those submissions where more than half of screenshots show the app in use" **per device type**; "Don't submit screenshots that misrepresent the app's actual interface" | `fastlane/screenshots`, `fastlane/metadata`, marketing folders |
| 2026-10-16 | **1.2** | Covers apps that let users "create, generate, upload, share, or otherwise contribute content… This includes social media, user-generated content platforms, and **AI content creation apps**." Names nonconsensual intimate imagery (incl. AI-generated). Failing to safeguard or remediate after notice may violate the Code of Conduct | Any feature that generates images/video/text from prompts or lets users publish: filtering, a report mechanism, user blocking, published contact info. Image-gen + photos of real people is the high-risk combination |
| 2026-10-16 | **3.1.1(a)** | Link-out entitlements now point to "a permitted destination"; Music Streaming entitlement folded into the StoreKit entitlement bullet; "Approved destinations may vary by region" | Paywall link-outs vs. storefronts shipped — see *Corrections* |
| 2026-10-16 | **5** (intro) | Trafficking / child-exploitation apps removed "and blocked from alternative distribution" | — |
| 2026-10-16 | Before You Submit | "Provide required documentation for apps and features that require regulatory approval" | Health, finance, gambling, medical-device features → note review-notes documentation in the App Store Connect checklist |
| 2026-06-08 | **4.3(b)** | Saturated categories (dating, flashlight, sound effects, wallpaper, simple timers, fortune telling): "Don't submit apps that are indistinguishable from what's already widely available"; existing ones may be removed if not updated or improved | The app's category and how it differs — a design-lane judgment, usually a risk |
| 2026-06-08 | **1.2** | Developer must remove violating content; Apple may require a compliance plan | Moderation tooling exists server-side, not just a report button |
| 2026-06-08 | **4.5.3** | Live Activities added to "don't use Apple Services to spam" | ActivityKit used for marketing |
| 2026-02-06 | **1.2** | "random or anonymous chat" apps don't belong on the App Store | Anonymous matching / chat-roulette features |
| 2025-11-13 | **5.1.2(i)** | "You must clearly disclose where personal data will be shared with third parties, **including with third-party AI**, and obtain explicit permission before doing so." | Calls to OpenAI / Anthropic / Gemini / Mistral / Replicate / any LLM or image API (direct `fetch`/`URLSession` or SDK) that send user content or identity; is there a disclosure + explicit opt-in *before* the first call? Sending name/email in the prompt is the worst case |
| 2025-11-13 | **4.7** | Now "Mini apps, mini games, streaming games, **chatbots**, plug-ins, and game emulators"; HTML5 **and JavaScript** mini apps; 4.7.2 "or technologies"; 4.7.5 age-restriction mechanism | Embedded web runtimes, plug-in marketplaces, third-party chatbots: index with universal links (4.7.4), per-instance consent for data (4.7.3), filtering/reporting (4.7.1) |
| 2025-11-13 | **4.1(c)** | "You cannot use another developer's icon, brand, or product name in your app's icon or name, without approval" | Display name / `CFBundleDisplayName` / store name containing another product (`… for Instagram`) |
| 2025-11-13 | **1.2.1(a)** | Creator apps must flag over-age content and age-gate it "based on verified or declared age" | Creator-content platforms: Declared Age Range API or equivalent |
| 2025-11-13 | **5.1.1(ix)** | Regulated fields now include "crypto exchanges" — must be submitted by a legal entity | Crypto trading features |
| 2025-11-13 | 3.2.2(ix) | "Loan apps" may not exceed 36% APR or require repayment in 60 days or less | Lending products |

## Requirements outside the guidelines

Details for build and device items are in `build-and-device.md`.

| Since / when | Requirement | Enforced at | Check |
| --- | --- | --- | --- |
| Apr 28, 2026 | Xcode 26 / iOS 26 SDK | Upload | CI toolchain, EAS image |
| Sep 9, 2026 | Deployment target iOS 13+ | Upload (ITMS-90068) | Deployment target everywhere |
| Apr 2027 | iOS 27 SDK + iOS 15 target; iPhone Duo screenshots | Upload / submission | Toolchain; deployment target; screenshot plan |
| iOS 27 SDK builds | UIScene life cycle or the app fails to launch; launch screen (ITMS-90870) | Launch / upload | Info.plist, delegates |
| Sep 2026 | Age-rating questionnaire **social-media** questions answered for every submission; social capability ("redistribute, amplify, or interact with user-generated content through a social feed") → minimum 13+ and a "Social Media" descriptor; if social features are disabled for under-13s, the **Declared Age Range API** is required at minimum | Submission | Feeds, follows, shares, comments → App Store Connect checklist; `DeclaredAgeRange` import if under-13 gating is claimed |
| Jan 31, 2026 | Updated age-rating questions answered | Submission of updates | App Store Connect checklist |
| 2025–2026 | State/national age-assurance laws: Texas (new accounts from Jun 4 2026), Utah (May 6 2026), Louisiana (Jul 1 2026), Brazil/Australia/Singapore 18+ download blocks, Australia under-16 social media | Legal exposure + platform behaviour | `DeclaredAgeRange`, `PermissionKit` (`SignificantAppUpdateTopic`), StoreKit `ageRatingCode`, consent-revocation server notifications — flag absence only when the app targets or plausibly serves minors in those regions |
| iOS 27.2 (Sep 2026 post) | EU alternative ATT prompt: optional EU-wide, the **only** version in Germany, France, Italy, Poland and Romania. New `requestTrackingAuthorization(preferExpandedInterface:additionalInformationAction:completionHandler:)`; optional `NSUserTrackingMarkdownUsageDescription`. "The requirements for when you must seek permission to track users will remain the same." | Platform behaviour | `NSUserTrackingUsageDescription` still required; purpose string must read well in a full-page sheet; `.notDetermined` returned after "Additional Information" must trigger a re-request |
| Later 2026 | New Sign in with Apple relay addresses on `private.icloud.com` (old `privaterelay.appleid.com` still valid) | Functional (sign-up breaks) | Email validators, allowlists, regexes hard-coding `privaterelay.appleid.com` |
| Jan 1, 2026 | Korea-based developers: SIWA server-to-server notification endpoint | Configuration | Backend route handling SIWA notifications |
| Mar 26, 2026 | Regulated medical device status declared for Health & Fitness / Medical apps in EEA, UK, US — required now for new apps; existing apps by early 2027 or updates are blocked | Submission | HealthKit, diagnosis/monitoring features → App Store Connect checklist |
| May 8, 2026 | Brazil fixed-odds betting needs an SPA license in review notes | Distribution in Brazil | Betting features |
| Sep 16, 2026 | iOS 27 subscriptions: "Make sure your apps use StoreKit 2"; multiseat purchasing default-on (opted out without StoreKit 2 or with Family Sharing); Bundles & Suites need StoreKit 2 | Feature eligibility, not rejection | `SKPaymentQueue`/`SKProductsRequest` (original API) vs `Product`/`Transaction`; RevenueCat mode; server logic assuming one subscriber per transaction |
| Oct 1, 2026 | EU business terms (5% Core Technology Commission); Japan (iOS 26.2) and Brazil (iOS 26.5) alternative payments with IAP shown side by side and a disclosure sheet | Entitlement terms | `com.apple.developer.storekit.*` entitlements, `SKExternalPurchase*` Info.plist keys, `ExternalPurchaseCustomLink.showNotice` gating |
| iOS 27 | `ImageCreator` stops working | Runtime | `ImageCreator` symbol |
| unchanged | Privacy manifests, required-reason APIs, listed-SDK manifests + signatures (ITMS-91053 / 91061) | Upload | App Privacy lane |

## Corrections to old review habits

These are the places a reviewer working from 2024 knowledge now gets it wrong.

- **4.8 is not "add Sign in with Apple".** It requires that an app using a third-party or social login for the primary account "also offer as an equivalent option another login service" that limits data to name and email, lets users keep their email private, and doesn't collect interactions for advertising without consent. Sign in with Apple satisfies it; so could another service with those properties. Five exemptions apply (own account system only, alternative-marketplace login, education/enterprise accounts, government ID, clients for a specific third-party service). Write the finding as "no equivalent privacy-preserving login option (e.g. Sign in with Apple)".
- **External purchase links are allowed in the United States storefront.** 3.1.1(a), 3.1.3 and 3.1.3(a) all carve out the US: entitlements "are not required for developers to include buttons, external links, or other calls to action in their United States storefront apps." Two things are still violations:
  1. **Taking payment for digital goods inside the app** with anything other than IAP — a Stripe/Braintree/PayPal payment sheet for a subscription or unlock is 3.1.1 everywhere, US included. The carve-out covers links and calls to action, not in-app checkout.
  2. **The same link shown in every other storefront.** Outside the US it needs the applicable entitlement (EU, Japan, Brazil, Korea, reader apps, music streaming…), with that entitlement's disclosure sheet. An app shipping worldwide with an unconditional "Subscribe on our website" button is compliant in one storefront of 175.
  Physical goods and services consumed outside the app (3.1.3(e)) and one-to-one real-time services (3.1.3(d)) still may use other payment methods. US link-out *commissions* are in litigation — don't state a fee.
- **"AI" findings have exact anchors now.** Data to an AI provider → 5.1.2(i). Generation features → 1.2 (filter, report, block, contact). Third-party chatbots or plug-ins inside the app → 4.7. Apple's own Foundation Models framework is governed by license terms (DPLA §3.3.11) rather than a guideline. Don't cite a "generative AI guideline" number that isn't in the live text.
- **Hidden-features findings cite 2.5.19**, not 2.3.1 — the sentence moved.
- **Saturated-category spam** cites 4.3(b) and names the category list in the live text.

## Check in App Store Connect

Things the repo can't show. Put the applicable ones in the report's *Check in App Store Connect* section instead of skipping them silently — only the ones the Project Profile makes relevant:

- Age-rating questionnaire answered, including the **social media** questions (required since Sep 2026) and loot-box / gambling answers
- App Privacy ("nutrition label") answers match what the code collects — list the SDKs and data types you found so the user can compare
- Privacy policy URL set (5.1.1(i)) and reachable
- Review notes: demo account or demo mode (2.1(a)); every new feature described "with specificity" (2.3.1(a)); any feature behind a remote flag disclosed (2.5.19); regulatory documentation (Before You Submit); IAPs that can't be found in the app explained (2.1(b))
- Screenshots per device type: more than half show the app in use; iPhone Duo set planned for April 2027; no misrepresented layouts (2.3.3)
- Creative assets (if used): no pricing, no unverifiable claims, 4+ (2.3.14)
- Regulated medical device status (Health & Fitness / Medical apps in EEA, UK, US)
- Brazil betting license; Korean GRAC rating override; DSA trader status for EU distribution
- Agreements accepted (an unaccepted Program License Agreement update blocks submissions)
