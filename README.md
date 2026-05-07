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
| [`code-review`](./skills/code-review) | Read-only PR / diff review with structured findings — bugs, security (tenant isolation, authz, atomicity, retry safety, multi-step flow completeness), performance (in-memory aggregation, sequential fan-out), consistency, and blast-radius gaps | `review`, `quality`, `security`, `performance` |

## Create your own skill

Skills here are designed to be forked. To add one (whether for upstream contribution or your own fork):

```sh
git clone https://github.com/alamops/skills && cd skills
cp -r template skills/my-new-skill
$EDITOR skills/my-new-skill/SKILL.md
```

Edit the YAML frontmatter — `name` should match the folder name, and `description` should clearly state **what the skill does** and **when the agent should invoke it**. The description is the only field the agent sees before deciding to load the skill, so it's the most important line in the file.

```yaml
---
name: my-new-skill
description: Generates X when the user is doing Y. Use whenever the conversation mentions Z.
---

# My new skill

Instructions the agent follows when this skill is active...
```

Optional subdirectories the spec recognizes inside a skill folder:

| Folder | Purpose |
| --- | --- |
| `scripts/` | Executable helpers the skill can run |
| `references/` | Supporting docs the skill loads on demand |
| `assets/` | Templates, fixtures, sample data |

Both Claude Code and `npx skills` discover new skills automatically — no manifest edits required.

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

## Contributing

Pull requests are welcome. Please:

1. Keep each skill **single-purpose** — one job, done well.
2. Write descriptions in **second person, action-first** (`"Generates X..."`, not `"This skill generates..."`).
3. Test your skill in at least one agent before opening a PR.
4. Validate the marketplace before pushing: `claude plugin validate .`

Bug reports, feedback, and skill suggestions are also welcome via [issues](https://github.com/alamops/skills/issues).

## References

- [Agent Skills open standard](https://agentskills.io/specification) — the cross-agent spec for `SKILL.md`
- [Anthropic Agent Skills overview](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview)
- [Claude Code plugin marketplaces](https://code.claude.com/docs/en/plugin-marketplaces)
- [`npx skills` CLI](https://github.com/vercel-labs/skills) — the open agent skills tool
- [anthropics/skills](https://github.com/anthropics/skills) — Anthropic's reference skill collection

## License

[MIT](./LICENSE) — use, fork, modify, redistribute. Attribution appreciated but not required.

---

<div align="center">

Made with care by [Alamo Saravali](https://github.com/alamops).

</div>
