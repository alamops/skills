# alamops/skills

Alamo's personal collection of [Agent Skills](https://agentskills.io). One repo, two delivery channels:

- **Claude Code plugin marketplace** — install the whole bundle as a plugin.
- **`npx skills`** ([vercel-labs/skills](https://github.com/vercel-labs/skills)) — install individual skills into any agent (Claude Code, Codex, Cursor, etc.).

A skill is just a folder under `skills/` with a `SKILL.md` file. Both channels auto-discover that layout — no per-skill registration needed.

## Install

### Claude Code (whole bundle as a plugin)

```sh
/plugin marketplace add alamops/skills
/plugin install alamops-skills@alamops-skills
```

Plugin skills are namespaced as `/alamops-skills:<skill-name>`.

### npx skills (per-skill, any agent)

List what's available:

```sh
npx skills add alamops/skills --list
```

Install everything:

```sh
npx skills add alamops/skills --all
```

Install a specific skill:

```sh
npx skills add alamops/skills --skill <skill-name>
```

## Repo layout

```
.
├── .claude-plugin/
│   ├── marketplace.json   # Claude Code marketplace catalog
│   └── plugin.json        # umbrella plugin manifest
├── skills/                # all skills live here, one folder each
│   └── <skill-name>/
│       └── SKILL.md
├── template/
│   └── SKILL.md           # starting point for new skills
├── LICENSE
└── README.md
```

## Add a new skill

```sh
cp -r template skills/my-new-skill
$EDITOR skills/my-new-skill/SKILL.md
```

Edit the YAML frontmatter — `name` should match the folder, and `description` should clearly state **what the skill does** and **when the agent should invoke it** (the description is what triggers auto-discovery).

```yaml
---
name: my-new-skill
description: Generates X when the user is doing Y. Use whenever the conversation mentions Z.
---
```

Optional subdirectories the spec recognizes inside a skill folder:

- `scripts/` — executable helpers the skill can run.
- `references/` — supporting docs the skill loads on demand.
- `assets/` — templates, fixtures, sample data.

Both Claude Code and `npx skills` will pick the new skill up automatically — no manifest edits required.

## Spec & references

- [Agent Skills open standard](https://agentskills.io/specification)
- [Anthropic Agent Skills overview](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview)
- [Claude Code plugin marketplaces](https://code.claude.com/docs/en/plugin-marketplaces)
- [`npx skills` CLI](https://www.npmjs.com/package/skills)

## License

MIT — see [LICENSE](./LICENSE).
