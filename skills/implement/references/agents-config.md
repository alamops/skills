# AGENTS_CONFIG.yml — schema, placeholders, and presets

`AGENTS_CONFIG.yml` lives at the repo root and routes each `/implement` phase to one or more **runners**. It's the one file the user owns to control cost/quality per phase. Read this when creating, validating, or migrating a config.

Note on scope: `tests_creation` and `tests_running` cover **all** test layers — unit, integration, and e2e when the plan includes it. There is no separate e2e phase key; the `tests_running` agent owns the full e2e lifecycle (start the app, seed, run headless, tear down). For e2e-heavy repos, consider `sonnet` rather than `haiku` on `tests_running` — orchestrating servers and diagnosing readiness is real work, not just running a command.

## Top-level shape

```yaml
version: 1

defaults:
  strategy: distribute            # distribute | race — used when a phase lists >1 runner and sets none
  allow_orchestrator_override: true   # may the orchestrator race a risky task even if the phase is 'distribute'?
  fallback_model: sonnet          # claude alias used when a runner can't be resolved

phases:
  investigate:    { ... }
  planning:       { ... }
  implementation: { ... }
  code_review:    { ... }
  tests_creation: { ... }
  tests_running:  { ... }
  tests_fixes:    { ... }
```

Every phase key is one of the eight above (Phase 0 has no runner — it's the orchestrator itself). A phase entry is:

```yaml
<phase>:
  strategy: distribute            # optional; inherits defaults.strategy
  runners:
    - { type: <self|claude|shell>, ... }
    - { ... }                     # 1+ runners; >1 activates the strategy
```

## Runner types

### `self`
The orchestrator does the phase inline in the current session — no sub-agent, no model override.
Only meaningful for `planning`. If used elsewhere it's coerced to a `claude`/`fallback_model` runner.

```yaml
planning:
  runners:
    - { type: self }
```

### `claude`
A native Claude Code sub-agent spawned via the Agent tool. `model` must be one of the Agent tool's aliases — `opus | sonnet | haiku | fable` — which the harness resolves to the current model IDs.

```yaml
implementation:
  runners:
    - { type: claude, model: sonnet }
    - { type: claude, model: haiku }   # two claude runners → distribute across them
```

Optional per-runner keys: `subagent_type` (override the default agent type — e.g. `Explore` for read-only phases), `effort` (`low|medium|high|xhigh|max`).

### `shell`
An external CLI harness (Codex, Gemini CLI, Aider, `llm`, etc.) invoked via Bash. `model` is a free-text label for reporting; `command` is a template the orchestrator fills in and runs.

```yaml
implementation:
  strategy: distribute
  runners:
    - { type: claude, model: haiku }
    - type: shell
      model: gpt-5.4-mini
      command: "codex exec --model gpt-5.4-mini --cd {CWD} --full-auto {TASK_FILE}"
      unavailable_fallback: sonnet   # optional; claude alias used if the CLI is missing
```

**Placeholders** substituted into `command` before running:
| Placeholder | Replaced with |
| --- | --- |
| `{PROMPT}` | The task brief, shell-quoted, as a single argument. |
| `{TASK_FILE}` | Path to a file the orchestrator writes containing the full task brief. Prefer this for long briefs. |
| `{CWD}` | The absolute path of the repo working directory. |

The orchestrator checks `command -v <first-token-of-command>` before the first shell call in a phase. If the binary is missing, it falls back to `unavailable_fallback` (or `defaults.fallback_model`) and tells the user.

## Presets

Written by first-time setup. Users pick one, then optionally tweak.

### balanced (default)
```yaml
version: 1
defaults: { strategy: distribute, allow_orchestrator_override: true, fallback_model: sonnet }
phases:
  investigate:    { runners: [ { type: claude, model: sonnet, subagent_type: Explore } ] }
  planning:       { runners: [ { type: self } ] }
  implementation: { runners: [ { type: claude, model: sonnet } ] }
  code_review:    { runners: [ { type: claude, model: opus } ] }
  tests_creation: { runners: [ { type: claude, model: sonnet } ] }
  tests_running:  { runners: [ { type: claude, model: haiku } ] }
  tests_fixes:    { runners: [ { type: claude, model: sonnet } ] }
```

### fast
Cheaper/faster; trades some depth for speed. Shows only the `phases:` block — keep the same `version` and `defaults` as `balanced` above; replace just the `phases:` section.
```yaml
phases:
  investigate:    { runners: [ { type: claude, model: haiku, subagent_type: Explore } ] }
  planning:       { runners: [ { type: self } ] }
  implementation: { runners: [ { type: claude, model: haiku } ] }
  code_review:    { runners: [ { type: claude, model: sonnet } ] }
  tests_creation: { runners: [ { type: claude, model: haiku } ] }
  tests_running:  { runners: [ { type: claude, model: haiku } ] }
  tests_fixes:    { runners: [ { type: claude, model: haiku } ] }
```

### quality
Strongest models on the phases where correctness compounds. Shows only the `phases:` block — keep the same `version` and `defaults` as `balanced` above; replace just the `phases:` section.
```yaml
phases:
  investigate:    { runners: [ { type: claude, model: sonnet, subagent_type: Explore } ] }
  planning:       { runners: [ { type: self } ] }              # orchestrator on the session model
  implementation: { runners: [ { type: claude, model: opus } ] }
  code_review:    { runners: [ { type: claude, model: opus } ] }
  tests_creation: { runners: [ { type: claude, model: sonnet } ] }
  tests_running:  { runners: [ { type: claude, model: haiku } ] }
  tests_fixes:    { runners: [ { type: claude, model: opus } ] }
```

## Multi-harness example (Claude + external)

Distribute implementation tasks across Haiku and an external GPT harness; race the code review across Opus and Gemini for a second opinion.

```yaml
implementation:
  strategy: distribute
  runners:
    - { type: claude, model: haiku }
    - type: shell
      model: gpt-5.4-mini
      command: "codex exec --model gpt-5.4-mini --cd {CWD} --full-auto {TASK_FILE}"
      unavailable_fallback: sonnet
code_review:
  strategy: race
  runners:
    - { type: claude, model: opus }
    - type: shell
      model: gemini-2.5-pro
      command: "gemini -m gemini-2.5-pro -p {PROMPT}"
      unavailable_fallback: opus
```

## Validation rules the orchestrator applies

- Unknown claude alias → coerce to `defaults.fallback_model`, warn.
- `type: self` outside `planning` → coerce to `fallback_model` claude runner, warn.
- `shell` runner missing its `command` → invalid; drop it and warn (fall back to a claude runner).
- Phase key absent → use the `balanced` preset's value for that phase.
- `strategy: race` with a single runner → behaves like a normal single run (nothing to race).
