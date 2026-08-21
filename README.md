<div align="center">

# alamops/skills

**A personal, open-source collection of [Agent Skills](https://agentskills.io) — installable as a Claude Code plugin or via `npx skills` into any compatible agent.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Agent Skills](https://img.shields.io/badge/Agent_Skills-Open_Standard-7c3aed)](https://agentskills.io/specification)
[![Claude Code Plugin](https://img.shields.io/badge/Claude_Code-Plugin-d97706)](https://code.claude.com/docs/en/plugin-marketplaces)
[![npx skills](https://img.shields.io/badge/npx_skills-compatible-000000)](https://www.npmjs.com/package/skills)

</div>

---

## What's a skill?

A skill is a folder containing a `SKILL.md` file with instructions an agent loads on demand. Think of it as a reusable, portable prompt: *when this scenario comes up, do these things.* Skills follow the [Agent Skills open standard](https://agentskills.io/specification), so a single skill works across Claude Code, Codex, Cursor, Gemini CLI, and dozens of other agents.

This repo is a curated, personal collection. Each skill is small, focused, and written for general reuse — fork what's useful, ignore the rest.

## Compatibility

| Channel | How to install | Works with |
| --- | --- | --- |
| **Claude Code marketplace** | `/plugin marketplace add alamops/skills` | Claude Code — **recommended for Claude Code** |
| **`npx skills` CLI** | `npx skills add alamops/skills` | Codex, Cursor, Gemini CLI, Continue, Cline, Aider, and [50+ more](https://github.com/vercel-labs/skills#supported-agents) — plus Claude Code, with the caveat below |
| **Manual** | Copy any `skills/<name>/` folder into your agent's skills directory | Any agent that follows the SKILL.md spec |

> **Claude Code users: install via the plugin marketplace, not the `npx skills` CLI.** The CLI keeps one canonical copy of each skill in `~/.agents/skills/` and *symlinks* it into each agent's own folder (`~/.claude/skills/` for Claude Code). Claude Code only reads `~/.claude/skills/`, and there are open CLI bugs where the skill lands in `~/.agents/skills/` but the `~/.claude/skills/` symlink is never created — so it "installs" yet Claude Code can't see it ([#744](https://github.com/vercel-labs/skills/issues/744), [#693](https://github.com/vercel-labs/skills/issues/693), [#851](https://github.com/vercel-labs/skills/issues/851)). The plugin writes straight into Claude Code and doesn't depend on symlinks.

## Install

### Claude Code (whole bundle as a plugin)

```sh
/plugin marketplace add alamops/skills
/plugin install alamops-skills@alamops-skills
```

Skills are then invokable as `/alamops-skills:<skill-name>` (or auto-triggered from the description).

### Any agent (via `npx skills`)

Works with Codex, Cursor, Gemini CLI, and the [50+ other supported agents](https://github.com/vercel-labs/skills#supported-agents) — and with Claude Code, though the [plugin above](#claude-code-whole-bundle-as-a-plugin) is more reliable there (see the [Compatibility](#compatibility) caveat).

First, list everything available in the repo:

```sh
npx skills add alamops/skills --list
```

Then target a specific agent with `--agent`, and pass `--skill '*'` for every skill (or `--skill <name>` for one). Instructions for the two most common agents:

#### Codex

```sh
# Every skill
npx skills add alamops/skills --skill '*' --agent codex

# A single skill
npx skills add alamops/skills --skill <skill-name> --agent codex
```

Codex reads skills from `~/.codex/skills/` (global) or `.agents/skills/` (project).

#### Claude Code

> Prefer the [plugin marketplace](#claude-code-whole-bundle-as-a-plugin) — it's the reliable route on Claude Code. Use the CLI only if you specifically want per-skill installs.

```sh
# Every skill
npx skills add alamops/skills --skill '*' --agent claude-code

# A single skill
npx skills add alamops/skills --skill <skill-name> --agent claude-code
```

Claude Code reads skills **only** from `~/.claude/skills/` (global) or `.claude/skills/` (project). **Verify the install actually linked** — run `npx skills list -g` (or check that those folders contain the skills). A [known symlink bug](https://github.com/vercel-labs/skills/issues/744) can leave skills stranded in `~/.agents/skills/` where Claude Code never sees them; if that happens, use the plugin instead.

> **Avoid `--all` on Claude Code.** It installs to **all** detected agents non-interactively and relies on the same symlink step that the bug above breaks. Target `--agent claude-code` explicitly, or use the plugin.

The CLI keeps one canonical copy of each skill under `~/.agents/skills/` (or `.agents/skills/` for a project-scoped install) and symlinks it into each targeted agent's directory. See [vercel-labs/skills](https://github.com/vercel-labs/skills) for full options.

## Skills

| Skill | Description | Tags |
| --- | --- | --- |
| [`code-review`](./skills/code-review) | Read-only review of any change source — PR, branch diff, working tree, recent commits, or code from the conversation | `review`, `quality`, `security`, `performance` |
| [`appstore-review`](./skills/appstore-review) | Read-only pre-submission audit against the **live** Apple App Store Review Guidelines — fetches the current rules from developer.apple.com, fans out parallel sub-agents per guideline section, returns rejection-risk findings keyed by rule number, or a clean verdict | `review`, `ios`, `app-store`, `compliance`, `mobile` |
| [`appstore-seo`](./skills/appstore-seo) | App Store & Google Play ASO **plus Apple Ads planning** — pulls the live listing and competitor shelf from Apple's public endpoints, mines keywords against real search data, allocates the indexed character budget, emits character-checked fields (UTF-16, the way App Store Connect counts), then turns the same research into a Brand/Generic/Competitor/Discovery campaign plan with negatives | `aso`, `app-store`, `google-play`, `apple-ads`, `seo`, `marketing`, `mobile` |
| [`to-prd`](./skills/to-prd) | Drafts a Product Requirements Document from a description, conversation, provided files, media, or a whole repo (forward or reverse-engineered from existing code) — asks clarifying questions first, saves to `docs/` | `product`, `prd`, `planning`, `requirements` |
| [`create-tasks`](./skills/create-tasks) | Senior Technical PM that turns a PRD, brief, or conversation into a small set of deep, end-to-end dev/QA tasks — performs mandatory deep repo analysis, asks clarifying questions, then writes one Markdown task per file plus a master `INDEX.md` under `docs/tasks/<feature-slug>/` | `tasks`, `engineering`, `tickets`, `planning`, `qa` |
| [`implement`](./skills/implement) | End-to-end feature-delivery orchestrator — the session model plans, then fans out background sub-agents through investigate → grill → plan → implement → review → tests → run → fix, with per-phase model/harness routing in `AGENTS_CONFIG.yml` (multi-harness per step supported) | `orchestration`, `agents`, `implementation`, `planning`, `tests` |
| [`break-fix`](./skills/break-fix) | Adversarial e2e bug hunt on a *running* app — attacks it as a hostile, confused and impatient user, watches console/network/server logs rather than the viewport, then root-causes each bug, writes a **failing** e2e regression test, fixes it, and proves the suite goes green | `qa`, `e2e`, `testing`, `bug-hunt`, `regression` |
| [`business-review`](./skills/business-review) | Analyzes a product/business from its public-facing materials, generates and ranks buyer personas, recommends an ICP, pressure-tests positioning and pricing, saves strategy artifacts to `docs/` | `gtm`, `personas`, `icp`, `positioning`, `strategy` |
| [`rpg-persona`](./skills/rpg-persona) | Hard buyer-persona roleplay with a coaching block after every reply — pressure-tests pitches, messaging, and pricing, saves the transcript and lessons to `docs/ROLEPLAY_NOTES.md`. **Run [`business-review`](./skills/business-review) first** so the roleplay uses real, ranked personas. | `gtm`, `sales`, `roleplay`, `coaching`, `objection-handling` |

### [`code-review`](./skills/code-review)

A thorough, read-only review of whatever change source you point it at — a pull request, a `git diff` against a base branch, uncommitted edits in your working tree, recent commits, or code that was just produced in the conversation. Produces structured findings, never edits code. Coverage:

- **Bugs** — logic errors, edge cases, error-handling gaps.
- **Security** — tenant isolation, authorization gaps, atomicity / TOCTOU, retry safety, explicit timeouts, multi-step flow completeness, orphaned-state cleanup, source-of-truth verification.
- **Performance** — in-memory aggregation, sequential fan-out, duplicate scans, partial-vs-full period comparisons.
- **Consistency** — enum / constant alignment, validation parity, business-rule duplication, backend → frontend contract.
- **Blast radius** — callers, sibling code paths, downstream flows, stale state, retry assumptions.

Every finding is tagged with `category`, `severity`, `file_path`, `line_number`, `description`, and `suggestion`. Each review ends with counts-by-severity, top-3 must-fix items, and an explicit verdict (`approve` / `request changes` / `comment`).

Install just this skill into any compatible agent:

```sh
npx skills add alamops/skills --skill code-review
```

Trigger it by asking any agent (or Claude Code with the plugin installed) for a "code review", "PR review", "diff review", "feedback on pending or recent changes", or "review the code we just wrote" — the skill auto-loads from the description.

### [`appstore-review`](./skills/appstore-review)

A pre-submission audit that checks an iOS-shipping project against the **current** Apple App Store Review Guidelines — and pulls those guidelines live from `developer.apple.com` on every run, so it never reviews against a stale snapshot in the model's head. Apple's rules drift several times a year (ATT, required-reason APIs, privacy manifests, alternative-payment language, account-deletion mandates, generative-AI controls); reviewing from memory is how teams burn a review cycle. If the live fetch fails, the skill aborts rather than guess.

How it works:

- **Detects the project shape** — native iOS (Swift/SwiftUI/UIKit/Xcode), React Native, Expo, Flutter, Capacitor/Ionic, or Unity — then builds a Project Profile (payment surface, tracking SDKs, auth providers, UGC, kids-category signals) so it only flags rules that actually apply.
- **Fans out parallel sub-agents** across the five guideline sections (Safety 1.x, Performance 2.x, Business 3.x, Design 4.x, Legal 5.x) plus two cross-cutting lanes — App Privacy / required-reason APIs and App Tracking Transparency — each scoped to just its slice of the live text. Tracking lanes are skipped (and the skip is reported) when no tracking surface exists.
- **Cross-checks the common deal-breakers** Apple rejects on weekly: account creation with no in-app deletion (5.1.1(v)), missing Sign in with Apple parity (4.8), ATT prompt vs. `NSUserTrackingUsageDescription` mismatch, digital goods sold outside IAP (3.1.1), missing usage descriptions or `PrivacyInfo.xcprivacy`, and leftover TestFlight/beta gates in the production path.

Output is a verdict (✅ likely pass / ⚠️ risk / 🛑 will be rejected) followed by findings grouped by severity, each keyed to a guideline number with `Evidence` (`file:line` or `absent: <thing>`), `Why it fails`, and a concrete `Fix`. It never modifies code.

Install just this skill into any compatible agent:

```sh
npx skills add alamops/skills --skill appstore-review
```

Trigger phrases: "run an App Store review", "App Store readiness check", "pre-submission audit", "will Apple reject this?", "is this 4.8-compliant?", "I added Google sign-in — am I OK?", or asking whether a specific change (moving subs off IAP, adding an analytics SDK, a new permission) is allowed. For a general bug/perf/security review, use [`code-review`](./skills/code-review) instead; for *implementing* a feature (Sign in with Apple, IAP, ATT), this skill audits, it doesn't build.

### [`appstore-seo`](./skills/appstore-seo)

App Store Optimization for both stores, run as an engineering task rather than a copywriting one. Most ASO advice is folklore, and it fails on iOS for a structural reason: **Apple does not index the description at all.** Rank comes from a handful of indexed fields with tiny budgets (name 30 / subtitle 30 / keywords 100), and Apple builds search phrases by *combining tokens across them* — so every repeated word is a wasted character. Google Play is the opposite: its long description *is* indexed, so the same copy can't serve both stores.

It also treats **Apple Ads as part of the same job**, because it is: Apple judges ad relevance for a keyword partly from your product page metadata, so the 100-character keyword field is what keeps your cost per tap down — and in the other direction, the Search Terms report is the only record of queries real users actually typed, while the keyword popularity score (0–100) is the only genuine volume figure that exists anywhere. The same research therefore produces both the listing and the campaign plan.

Three modes: **audit** an existing listing, **generate** a full field set pre-launch, or **audit → rewrite** (the common one — never rewrites blind when a live listing exists).

How it works:

- **Pulls ground truth**, never audits from memory. Documented recipes hit Apple's public endpoints — the iTunes lookup API, the store-page JSON (for the subtitle, which the API doesn't expose, and the genuine "You Might Also Like" shelf *with competitor subtitles* — the cheapest competitive keyword corpus there is), and the reviews RSS for the vocabulary real users type. Explicit that the keyword field is private and that Play has no public API.
- **Mines keywords against live search.** For each candidate term, the Search API gives a difficulty score from the top-10 rating counts, an intent signal, and whether your app ranks at all — so keyword choices are argued from store data. It deliberately refuses to invent a search-volume number: result depth doesn't proxy for volume, and a guessed metric presented as data poisons the whole deliverable.
- **Checks every field before you see it.** A paste-and-run checker counts in UTF-16 code units the way App Store Connect does (an emoji costs 2), hard-fails on over-limit fields, keyword-field syntax, competitor trademarks and Play's 5-tag cap, and flags the expensive strategy mistakes — words duplicated across name/subtitle/keywords, category names and filler burning keyword budget, unused characters, iOS keyword stuffing, Play keyword density outside 2–5 mentions, boilerplate release notes. It's **stem-aware**, catching `scan` in the keyword field while the name says `Scanner` — a wasted repeat exact-string comparison never sees.
- **Checks the name against what's already live** — exact collisions with shipping apps and how many already lead with your brand token. A name collision outranks anything in the keyword field — it splits brand search and risks rejection under 4.1 (copycats) or a 5.2 trademark complaint.
- **Covers conversion, not just ranking** — icon legibility, the first three screenshots (most visitors never scroll), muted-safe previews, ratings strategy, and a Product Page Optimization / Play experiment plan with a recorded baseline.
- **Builds the Apple Ads plan from the same keyword table.** The scored terms bucket into the four campaigns that have genuinely different economics — Brand (defensive, cheapest, highest-converting), Generic, Competitor, and Discovery (whose job is finding queries you didn't think of) — plus the negative keyword lists, the step teams skip and the reason campaigns look unprofitable when they aren't. It encodes the asymmetry people get backwards: **competitor brand names are standard in Apple Ads and forbidden in the organic keyword field** — same word, opposite rule.

Output is both: copy-paste-ready blocks with live character counts in chat, and durable artifacts under `docs/appstore/` — `audit.md` (a 5-dimension, 100-point scorecard), `keyword-research.md` (the scored table *plus* the terms rejected and why), `metadata.<locale>.md` per locale, `creative-brief.md`, `apple-ads.md` (campaign map, negatives, custom-product-page mapping, and the 4-week loop that mines the Search Terms report back into the listing), and `experiments.md`.

The skill has **no runtime dependency** — no bundled scripts, no libraries. Every mechanical step (pulling the listing, scouting keyword difficulty, checking name collisions, counting UTF-16 characters, bucketing the ad plan) is documented in reference files as paste-and-run standard-library Python that talks to Apple's public endpoints, so it runs anywhere and degrades to by-hand steps where code can't run.

Install just this skill into any compatible agent:

```sh
npx skills add alamops/skills --skill appstore-seo
```

Trigger phrases: "improve my app store ranking", "nobody finds my app in search", "review my App Store listing" with an ID or link, "write our store listing before we launch", keyword research for an app, competitor listing teardowns, localizing a listing, planning a store A/B test, or planning Apple Ads keywords and campaign structure. Ongoing bid and budget management of a live ads account is deliberately out of scope — the skill sets the structure that bidding operates inside. For whether Apple will *reject* the app, use [`appstore-review`](./skills/appstore-review) — that one audits compliance, this one audits discovery and conversion.

### [`to-prd`](./skills/to-prd)

A senior-CPO collaborator that turns any combination of inputs — a feature/product description, the conversation thread, a small set of provided files, attached media, linked docs, or an entire repository — into a complete Product Requirements Document. Works in two modes: **forward** (PRD for something you're about to build, repo as enrichment) and **reverse** (PRD for something already built, repo as the primary source). It clarifies before drafting — surfacing missing personas, undefined success criteria, unclear flows, ambiguous scope, and unstated constraints — then writes a structured Markdown PRD covering:

- **Executive summary, problem, goals & non-goals.**
- **Personas, scenarios, and user journeys.**
- **Functional requirements** — numbered, testable, with flows and business rules.
- **Non-functional requirements** — performance, security, privacy, scalability, reliability, usability, observability.
- **Timeline & milestones** — phased delivery with exit criteria.
- **Success metrics** — primary KPIs with baselines and targets, plus feedback mechanisms.
- **Risks & mitigation** — product, delivery, technical, operational, with owners.
- **Blast-radius & cross-feature impact** — affected features, integrations, downstream systems, data assumptions.
- **Stakeholders** — RACI roles.
- **Assumptions and open questions** — captures anything the user declined to clarify, plus any inferred behavior in reverse mode.
- **Appendices and glossary.**

The PRD is saved to `docs/<unique-name>.md`. In forward mode the skill stays shallow on the repo (enrichment only); in reverse mode it walks user-visible entry points and behavior at the product layer. It never modifies code.

Install just this skill into any compatible agent:

```sh
npx skills add alamops/skills --skill to-prd
```

Trigger it by asking any agent (or Claude Code with the plugin installed) to "write a PRD", "draft a product requirements doc", "create a feature spec", "scaffold a PRD for X", or "reverse-engineer a PRD from this repo / these files" — the skill auto-loads from the description.

### [`create-tasks`](./skills/create-tasks)

A senior Technical Product Manager that turns a PRD, feature brief, ticket, conversation thread, or set of provided docs/media into a small set of deep, end-to-end, implementation-ready development and QA tasks. Performs **mandatory deep repository-context analysis** — entry points, data layer, reusable utilities, API/UI patterns, sibling code paths, tests, observability, and (when applicable) App Store / Google Play constraints — before drafting anything. Surfaces unknowns as one structured pass of clarifying questions, plans the task list with the user, then writes each task as its own Markdown file. Each task is genuinely end-to-end (no backend-only / frontend-only splits) and self-sufficient across all required layers:

- **Problem / Motivation** and **Business Rules** — numbered, testable.
- **Technical Goals** and **Dependencies** (upstream / downstream / cross-team).
- **Files to Modify** (with exact paths from the repo) and **Related Existing Code** (utilities, services, components to reuse).
- **Architecture Notes** with Mermaid diagrams when complexity warrants.
- **Data Model** — schemas, fields, constraints, indexes, migrations.
- **API Specs** — endpoints, methods, request/response schemas, error codes, auth, idempotency.
- **Non-Functional Requirements** — performance, security, scalability, tenant isolation, reliability, atomicity, observability, validation, event-driven correctness, mobile platform compliance.
- **Implementation Guide** — numbered steps grounded in the cited files and utilities.
- **Error Handling** — client-facing vs log-level, ownership failures, truncation, enum consistency, mutual-exclusion.
- **Blast-Radius & Impact Analysis** — callers, sibling paths, retries, recovery, stale state, downstream systems.
- **Testing Strategy** — unit / integration / e2e coverage, fixtures, negative paths.
- **Acceptance Criteria** and **QA Testing Steps** — measurable, with explicit manual scenarios.
- **Design Specifications** — screens, states, components, accessibility, localization, with associated images.
- **Open Questions** — anything still unresolved at write time.

Each task title carries a layer prefix (`[Full-Stack]`, `[Backend+DB+Tests]`, `[Frontend+Backend+Tests]`, `[DevOps]`, `[Mobile+Backend+Tests]`, etc.) so reviewers can tell the scope at a glance. **No time, effort, story-point, or staffing estimates** — tasks describe *what* and *how*, not *how long* or *who*.

Outputs save under `docs/tasks/<feature-slug>/`:

- `INDEX.md` — execution-order list with prefixes, layers, dependencies, and shared assumptions/open questions.
- `001-<slug>.md`, `002-<slug>.md`, … — one task per file, indexed by execution order.

The skill is read-only on source code.

Install just this skill into any compatible agent:

```sh
npx skills add alamops/skills --skill create-tasks
```

Trigger phrases: "create dev tasks", "break this PRD into tasks", "scaffold engineering tickets", "generate QA tasks", "turn this spec into implementation tickets", "create tasks for sprint X."

#### Recommended product → engineering workflow

1. **`to-prd`** — produce the PRD (`docs/<feature>-prd.md`), surfacing personas, requirements, success metrics, and risks.
2. **`create-tasks`** — turn that PRD plus a deep repo scan into the task set under `docs/tasks/<feature-slug>/`.
3. **`implement`** — orchestrate the actual build: investigate, grill, plan, then fan out background agents to code, review, and test each task.
4. **`code-review`** — review each PR as engineers ship the tasks; feed any structural findings back into the next task set.
5. **`break-fix`** — once the feature is running, hunt it adversarially for the bugs a diff review can't see (state, timing, session, real-user misuse), and leave a regression test behind for each one.

### [`implement`](./skills/implement)

An end-to-end feature-delivery orchestrator. Invoked as `/implement <task>`, the **current session model stays in the driver's seat** — it does the thinking (synthesis, interrogation, planning, decomposition, merge decisions) and delegates the parallelizable labor to background sub-agents whose models are chosen per phase in `AGENTS_CONFIG.yml`. It runs eight phases:

1. **Investigate** — the orchestrator decides how many read-only agents to spawn and fans them out in parallel across the codebase, git history, and (when web tools are available) current best practices.
2. **Grill & confirm** — a hard, respectful interrogation of the owner to resolve every load-bearing unknown before planning. First hard gate; runs on every delivery, self-answered on the record under `--auto`.
3. **Plan** — a complete, decomposition-ready plan saved to `docs/plans/<feature-slug>.md`, whose work breakdown partitions the feature into file-disjoint tasks and execution waves. Presented for explicit approval — second hard gate.
4. **Implement** — one background agent per task, launched in waves, each with a self-contained brief and an exclusive set of files so parallel agents never collide (worktree isolation when clean partitioning isn't possible).
5. **Code review** — reviews the diff using the [`code-review`](./skills/code-review) skill as the rubric when it's installed, else a built-in review rubric bundled in the skill (so `/implement` stays fully standalone); the orchestrator triages must-fixes.
6. **Tests creation** — the same collision-free fan-out, partitioned by module under test.
7. **Tests running** — a single background agent runs the suite and reports pass/fail.
8. **Tests fixes** *(conditional)* — fix agents for failures and must-fix findings, then re-run to green.

**Per-phase model/harness routing** lives in `AGENTS_CONFIG.yml` at the repo root. Each phase resolves to one or more *runners*: the orchestrator itself (`self`), a Claude sub-agent (`opus`/`sonnet`/`haiku`/`fable`), or an external CLI harness (Codex, Gemini, Aider, …) via a shell command template. Listing **multiple harnesses per step** — e.g. `haiku` + `gpt-5.4-mini` on implementation — either *distributes* independent tasks across them or *races* the same task and keeps the best, per the phase `strategy`. Missing external CLIs fall back to a Claude sub-agent automatically.

Delivery runs accept **modifier flags**, combinable with each other and the task text: `/implement --auto <task>` runs unattended for remote/CI execution, `/implement --no-e2e <task>` skips the end-to-end test layer (unit/integration coverage still runs), `/implement --no-spikes <task>` skips Phase 1's validation spikes (unsettled load-bearing assumptions are surfaced as open questions instead of experimentally verified), and `/implement --no-follow-ups <task>` bans deferred remainder work.

**`--no-follow-ups` is a completeness contract, not a scope expansion.** The usual way a delivery ends up *almost* right is a remainder: three of seven call sites still on the old path, the empty state left as a `TODO`, the enum grown in the model but not the validator, a migration that adds the column and never backfills the rows. Under the flag every such remainder is either done in this run or explicitly ruled a different ticket — the plan carries a **completeness ledger** listing each candidate follow-up with the task ID that owns it or the reason it's out of scope, and "deferred" isn't an available answer. Implementation briefs ban `TODO`/stub placeholders inside a task's scope, and the code review gains a completeness dimension whose findings are must-fix rather than nice-to-have. What it doesn't do: invent adjacent features, refactor code the change merely passed through, override `--no-e2e`/`--no-spikes`, or license an `--auto` run to sweep in a one-way decision — those stay escalated. When the sweep turns out to dwarf the original ask, the ledger goes to the owner at the approval gate rather than being absorbed silently.

**The two human gates are enforced, and `--auto` is the only way off them.** Autonomy is declared, never inferred — a detailed ticket, a confident read of the task, or being spawned by another agent are not signals that the owner left, so the grill happens whenever there's any channel to reach one. `--auto` doesn't delete Phase 2; it changes who answers: the orchestrator writes the full question set first, then answers each from the strongest source available (spike evidence → repo convention → ecosystem default → judgment), takes the reversible option wherever it's down to judgment, and records the exchange as a question / answer / source / confidence table in the plan so the absent owner can audit every call. Genuinely one-way decisions — destructive migrations, public API contracts, auth boundaries, anything touching money or secrets — are scoped out of the run and escalated rather than guessed.

On the first `/implement` run with no config, the skill runs a short guided setup (pick a `balanced` / `fast` / `quality` preset, optionally plug in an external harness) and writes `AGENTS_CONFIG.yml`. Re-run setup anytime with `/implement --config`. See [`assets/AGENTS_CONFIG.example.yml`](./skills/implement/assets/AGENTS_CONFIG.example.yml) and [`references/agents-config.md`](./skills/implement/references/agents-config.md) for the full schema.

Install just this skill into any compatible agent:

```sh
npx skills add alamops/skills --skill implement
```

Trigger phrases: "/implement", "build this feature end-to-end", "orchestrate the implementation", "plan and implement X", "run a multi-agent build", "/implement --config", "/implement --auto X", "/implement --no-e2e --no-spikes X", "/implement --no-follow-ups X", "finish this completely, I don't want a follow-up PR".

### [`break-fix`](./skills/break-fix)

An adversarial bug hunt against the **running** app, followed by a real fix. Most testing walks the happy path the developers already walked a hundred times while building the feature — it's green by construction. This skill does the opposite: it deliberately violates the contract the UI implies, then closes the loop on whatever falls out.

1. **Scope & safety** — confirms a local/dev/staging target, two test accounts (cross-account checks need them), and what's off-limits (anything wired to real money, real messages, or shared data).
2. **Recon** — boots the app, finds the existing e2e harness (Playwright / Cypress / Detox / supertest — *before* finding bugs, so their tests have somewhere to go), maps the surface, then reads the code for assumptions worth attacking: unguarded `parseInt` on query params, lookups that never filter by owner, client-only validation, index-as-key.
3. **Hunt** — runs each surface past **eight bad users**: the impatient one (double-submits, Back mid-spinner), the confused one (deep-links into step 3 of a wizard), the clipboard (12KB paste, emoji-only name, a leading `=`), the polyglot (RTL, combining marks, zero-width chars), the multitasker (two tabs, one record), the commuter (offline mid-request, 3G, a request that never resolves), the nosy one (tampered IDs, direct API calls against their *own* second account), and the extremist (`0`, `-1`, 10k rows, year 2999).
4. **Triage** — reproduces from a clean state, separates *bug* from *nit* / *intended* / *environment*, dedupes five symptoms of one missing guard into one root cause, assigns severity by consequence, and checks in before anything architectural.
5. **Root cause** — traces one level deeper than the symptom (two orders from a double-click isn't a button bug, it's a missing idempotency guard) and greps for every other site with the same defect.
6. **Regression test, red first** — writes the e2e test *before* the fix and **observes it failing for the right reason**. A test written after a fix has never demonstrated it can detect the bug; it may be asserting something that was always true.
7. **Fix, green** — smallest change that removes the cause, then re-run the test, the manual repro, the full suite, and the sibling surfaces (guards frequently narrow a hole rather than close it).
8. **Report** — `docs/bug-hunts/<date>-<slug>.md` with repro, evidence, root cause, fix, and test per bug — plus what was attacked and came back **clean**, which is what tells a reader how much of the app the hunt actually covered.

Bundled references: [`attack-playbook.md`](./skills/break-fix/references/attack-playbook.md) (ready-to-use payloads and step sequences across 13 surfaces — forms, auth/authorization, concurrency, pagination, uploads, network failure, time/locale, direct API, money — plus a signal table mapping console/network/server/database symptoms to their usual cause) and [`e2e-harnesses.md`](./skills/break-fix/references/e2e-harnesses.md) (per-framework detection, run recipes, attack tooling like `page.route` and `cy.intercept`, what to do when there's no harness, and the determinism rules that keep a regression test from being skipped in a month).

Rules of engagement are explicit: authorized local/dev/staging targets only, never production, no irreversible external side effects, no load or infrastructure attacks — "authorization probing" means checking whether *your own* second account can reach the first one's data.

Install just this skill:

```sh
npx skills add alamops/skills --skill break-fix
```

Trigger phrases: "break my app", "try to break it", "bug hunt", "bug bash", "QA sweep", "exploratory/adversarial testing", "click around and see what explodes", "find bugs by actually using it", "write an e2e test so this can't come back."

### [`business-review`](./skills/business-review)

A founder-grade GTM analyst that reads a product's public-facing materials (landing page, pricing, onboarding, docs, app/UI, demos), separates marketing language from real buyer value, and produces a strategy package someone could act on this week. It generates 5–8 concrete buyer personas (concrete enough to DM, not "SMB owner"), ranks them across abundance / pain / urgency / willingness-to-pay / retention / strategic leverage, and explicitly distinguishes "most abundant" from "best ICP." Then it pressure-tests the recommendation against alternatives, pricing logic, and friction — and proposes section-by-section changes to messaging, landing page, onboarding, demo strategy, and product experience. Prefers truth over flattery.

Deliverables (saved under `docs/` with canonical filenames):

- `CLIENT_PERSONAS.md` — full persona dossiers using a fixed template.
- `ICP_ANALYSIS.md` — ranking matrix, canonical roles, pressure-test results, primary/secondary/weak-fit recommendation.
- `POSITIONING_RECOMMENDATIONS.md` — wrong-vs-right battlefield, headline candidates, section-by-section landing-page changes.
- `PRODUCT_EXPERIENCE_RECOMMENDATIONS.md` — onboarding, time-to-value, friction, demo, proof, ranked impact × effort.
- `OUTREACH_DRAFTS.md` (optional) — LinkedIn, cold email, social DM for the primary ICP.

Install just this skill:

```sh
npx skills add alamops/skills --skill business-review
```

Trigger phrases: "analyze my business", "generate buyer personas", "find my ICP", "pressure-test my positioning", "review my landing page positioning", "build a GTM strategy doc."

### [`rpg-persona`](./skills/rpg-persona)

> **Recommended: run [`business-review`](./skills/business-review) first.** `rpg-persona` is most useful when it's roleplaying a *real, ranked* persona from your strategy work — not a generic skeptic. If `docs/CLIENT_PERSONAS.md` and `docs/ICP_ANALYSIS.md` exist (which `business-review` produces), this skill auto-picks the strongest skeptical persona and grounds objections in the actual product. Without those docs, the skill will ask you to define the persona before starting, which is slower and less rigorous.

A two-voice sales-pressure-test skill: a **skeptical buyer** who refuses to make the conversation easy, plus a **coach** that explains, after every in-character reply, what landed, what missed, which objection was triggered, the buying signals you missed, and what to do next. The buyer demands numbers, rejects vague language ("AI-powered", "10x faster"), pushes on differentiation, pricing logic, switching cost, decision path, and proof — and only closes when you've earned at least three of: differentiation, pricing logic, friction, trust, urgency, decision path.

When the session ends ("end roleplay" / "stop"), the full transcript, coaching summary, strategic lessons, and recommended changes save to `docs/ROLEPLAY_NOTES.md`.

Install just this skill:

```sh
npx skills add alamops/skills --skill rpg-persona
```

Trigger phrases: "roleplay a buyer", "simulate a sales call", "practice my pitch", "pressure-test my message", "play a skeptical CTO", "objection drill."

#### Recommended GTM workflow

1. **`business-review`** — analyze the product, generate and rank personas, produce `docs/CLIENT_PERSONAS.md` + `docs/ICP_ANALYSIS.md` + positioning docs.
2. **`rpg-persona`** — roleplay against the strongest skeptical persona from step 1 to pressure-test the pitch in conversation; review the saved `docs/ROLEPLAY_NOTES.md`.
3. **Iterate** — feed the lessons from step 2 back into the positioning and product-experience docs, then re-run the roleplay against the next persona.

Skipping step 1 is possible (`rpg-persona` will ask you to define the persona inline) but reduces the value of the drill — the buyer's objections won't be grounded in your real product or your real ICP.

## Project structure

```
.
├── .claude-plugin/
│   ├── marketplace.json   # Claude Code marketplace catalog
│   └── plugin.json        # umbrella plugin manifest
├── skills/                # all skills, one folder each
│   └── <skill-name>/
│       └── SKILL.md
├── evals/                 # eval sets for description-trigger tuning (optional, per skill)
│   └── <skill-name>/
│       └── trigger_eval.json
├── LICENSE
└── README.md
```

A single umbrella plugin (`alamops-skills`) bundles every folder under `skills/`. Adding a new skill is one operation — drop a new folder in `skills/`, and both delivery channels pick it up.

## License

[MIT](./LICENSE) — use, fork, modify, redistribute. Attribution appreciated but not required.

---

<div align="center">

Made with care by [Alamo Saravali](https://github.com/alamops).

</div>
