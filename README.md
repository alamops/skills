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
| **Claude Code marketplace** | `/plugin marketplace add alamops/skills` | Claude Code |
| **`npx skills` CLI** | `npx skills add alamops/skills` | Claude Code, Codex, Cursor, Gemini CLI, Continue, Cline, Aider, and [50+ more](https://github.com/vercel-labs/skills#supported-agents) |
| **Manual** | Copy any `skills/<name>/` folder into your agent's skills directory | Any agent that follows the SKILL.md spec |

## Install

### Claude Code (whole bundle as a plugin)

```sh
/plugin marketplace add alamops/skills
/plugin install alamops-skills@alamops-skills
```

Skills are then invokable as `/alamops-skills:<skill-name>` (or auto-triggered from the description).

### Any agent (per-skill, via `npx skills`)

List everything available in the repo:

```sh
npx skills add alamops/skills --list
```

Install all skills:

```sh
npx skills add alamops/skills --all
```

Install a specific skill:

```sh
npx skills add alamops/skills --skill <skill-name>
```

The CLI auto-detects which agents you have installed and writes to the right config directory (`.claude/skills/`, `.agents/skills/`, etc.). See [vercel-labs/skills](https://github.com/vercel-labs/skills) for full options.

## Skills

| Skill | Description | Tags |
| --- | --- | --- |
| [`code-review`](./skills/code-review) | Read-only review of any change source — PR, branch diff, working tree, recent commits, or code from the conversation | `review`, `quality`, `security`, `performance` |
| [`appstore-review`](./skills/appstore-review) | Read-only pre-submission audit against the **live** Apple App Store Review Guidelines — fetches the current rules from developer.apple.com, fans out parallel sub-agents per guideline section, returns rejection-risk findings keyed by rule number, or a clean verdict | `review`, `ios`, `app-store`, `compliance`, `mobile` |
| [`to-prd`](./skills/to-prd) | Drafts a Product Requirements Document from a description, conversation, provided files, media, or a whole repo (forward or reverse-engineered from existing code) — asks clarifying questions first, saves to `docs/` | `product`, `prd`, `planning`, `requirements` |
| [`create-tasks`](./skills/create-tasks) | Senior Technical PM that turns a PRD, brief, or conversation into a small set of deep, end-to-end dev/QA tasks — performs mandatory deep repo analysis, asks clarifying questions, then writes one Markdown task per file plus a master `INDEX.md` under `docs/tasks/<feature-slug>/` | `tasks`, `engineering`, `tickets`, `planning`, `qa` |
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
3. **`code-review`** — review each PR as engineers ship the tasks; feed any structural findings back into the next task set.

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
