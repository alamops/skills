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
| [`to-prd`](./skills/to-prd) | Drafts a Product Requirements Document from a description, conversation, provided files, media, or a whole repo (forward or reverse-engineered from existing code) — asks clarifying questions first, saves to `docs/` | `product`, `prd`, `planning`, `requirements` |

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

## Project structure

```
.
├── .claude-plugin/
│   ├── marketplace.json   # Claude Code marketplace catalog
│   └── plugin.json        # umbrella plugin manifest
├── skills/                # all skills, one folder each
│   └── <skill-name>/
│       └── SKILL.md
├── template/
│   └── SKILL.md           # starting point for new skills
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
