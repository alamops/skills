# AGENTS_CONFIG.yml — schema, hosts, runner types, and presets

`AGENTS_CONFIG.yml` lives at the **target repo's root** (not this skill's repo) and routes each `/implement` phase to a model. It's the one file the user owns to control cost/quality per phase. Read this when creating, validating, or migrating a config.

Two ideas carry the whole schema:

1. **A logical model is a role, not a model ID.** You name a role once (`reviewer`, `builder`, `scout`) and phases refer to the role. What that role *resolves to* depends on which harness `/implement` is running in.
2. **A runner type says which agent, not how to reach it.** `type: codex` means "the Codex CLI" — the orchestrator already knows the command shape. You supply the model, not a command template.

Together these let the same config mean "review with Opus when I'm in Claude Code, review with GPT-5.6 Sol when I'm in Codex" without duplicating seven phases per harness.

Note on scope: `tests_creation` and `tests_running` cover **all** test layers — unit, integration, and e2e when the plan includes it. There is no separate e2e phase key; the `tests_running` agent owns the full e2e lifecycle (start the app, seed, run headless, tear down). For e2e-heavy repos, put a mid-tier model on `tests_running` rather than the cheapest one — orchestrating servers and diagnosing readiness is real work, not just running a command.

## Top-level shape

```yaml
version: 2

host: auto                          # auto | claude_code | codex | <name>

defaults:
  strategy: distribute              # distribute | race — when a phase names >1 model
  allow_orchestrator_override: true # may the orchestrator race a risky task in a distribute phase?
  fallback: builder                 # a name from models: — used when a binding won't resolve

models:                             # role -> per-host binding
  <role-name>:
    <host>: <runner>
    any:    <runner>                # matches any host you didn't name explicitly

phases:
  investigate:    { use: <role> }
  planning:       { use: <role> }
  implementation: { use: <role> }
  code_review:    { use: <role> }
  tests_creation: { use: <role> }
  tests_running:  { use: <role> }
  tests_fixes:    { use: <role> }
```

The seven phase keys above are the complete set (Phase 0 has no runner — it's the orchestrator itself).

## Host — which harness `/implement` is running *in*

This is the axis v1 had no way to express, and getting it wrong is the difference between a config that works and one that silently can't spawn anything. `host` is **not** which model you're calling; it's which agent harness the orchestrator itself lives in.

`host: auto` (the default) resolves in this order — stop at the first that answers:

1. **An explicit `host:` value** in the config, if it isn't `auto`. Pinning always wins; that's what it's for.
2. **A `--host <name>` argument** on the invocation.
3. **Capability self-check — the primary signal.** Does the orchestrator have a native sub-agent spawn tool (Claude Code's `Agent` tool) in its own tool list? If yes → `claude_code`. This is structural: it can't be wrong the way an env var can, and the orchestrator can read it off its own context without running anything.
4. **Environment probes**, as corroboration: `CLAUDECODE=1` → `claude_code`; `CODEX_HOME` / a `codex` process ancestor → `codex`. Treat these as hints only — `CLAUDECODE` is reliably set inside Claude Code, but `CODEX_HOME` is frequently *unset* under Codex, so a missing var proves nothing.
5. **Ask the user once**, and offer to write the answer into `host:` so it never has to be asked again.

Announce the detected host in the resolved-config table at the start of a run. When detection fell through to step 4 or 5, say which signal you used — a user whose config quietly resolved to the wrong host will otherwise only find out when a phase misbehaves.

## Runner types

A runner is what actually executes a phase. The type names the agent; the orchestrator owns the transport.

| `type` | What it is | How the orchestrator reaches it |
| --- | --- | --- |
| `self` | The orchestrator, inline in this session | No sub-agent at all |
| `claude` | A Claude model | Native `Agent` tool when host is `claude_code`; otherwise shells out to `claude -p` |
| `codex` | The Codex CLI | `codex exec` (recipe below) |
| `shell` | Any other CLI harness | Your `command:` template |

### `self`

The orchestrator does the phase inline — no sub-agent, no model override. Only meaningful for `planning`, where the thinking should stay with the agent that has the full conversation. Used elsewhere it's coerced to `defaults.fallback` with a warning.

```yaml
models:
  orchestrator:
    any: { type: self }
```

### `claude`

`model` is one of the Agent tool's aliases — `opus | sonnet | haiku | fable` — which the harness resolves to current model IDs. Optional keys: `subagent_type` (e.g. `Explore` for read-only phases, `general-purpose` for anything that writes), `effort` (`low|medium|high|xhigh|max`).

```yaml
models:
  reviewer:
    claude_code: { type: claude, model: opus }
```

**On a non-Claude host** this doesn't fail — the orchestrator shells out instead:

```
claude -p --model <alias> --add-dir {CWD} --permission-mode <mode> --output-format text
```

with the brief on stdin. Permission mode follows the phase: `plan` for read-only phases (`investigate`, `code_review`), `acceptEdits` for writing phases. This is why you can put `type: claude` in a `codex:` binding and have it work — the model choice is portable even though the transport isn't.

### `codex`

`model` is a Codex model slug — e.g. `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna`, `gpt-5.6-pro`, `gpt-5.4-mini`. No `command:` needed.

```yaml
models:
  reviewer:
    codex: { type: codex, model: gpt-5.6-sol }
```

The orchestrator builds:

```
codex exec -m <model> -C {CWD} --sandbox <mode> [--approve-for-me] -o <OUTPUT_FILE> - < <TASK_FILE>
```

The trailing `-` is what makes Codex read the brief from **stdin**. This detail matters: `codex exec` treats a bare positional argument as the prompt *text*, so passing a file path alone would send Codex the literal string `/path/to/brief.md` and nothing else. Redirecting the file into `-` is the only shape that reliably delivers a long brief.

`-o <OUTPUT_FILE>` writes the agent's final message to a file the orchestrator then reads, which is far more robust than scraping it out of mixed stdout.

Sandbox mode is derived from the phase, and can be overridden per binding with `sandbox:`:

| Phase | Derived sandbox |
| --- | --- |
| `investigate`, `code_review` | `--sandbox read-only` |
| `implementation`, `tests_creation`, `tests_fixes` | `--sandbox workspace-write --approve-for-me` |
| `tests_running` | `--sandbox workspace-write --approve-for-me` — raise to `danger-full-access` only if the e2e run genuinely needs to write outside the workspace or bind privileged ports, and tell the user you did |

**Spikes are the exception inside `investigate`.** A spike runs throwaway code, so `read-only` would block the very thing it exists to do. Point the spike agent at its own scratchpad directory and let it write only there: `-C <scratchpad>/spikes/<question-slug> --sandbox workspace-write`. This is strictly better than the Claude-runner equivalent — for a native agent the "scratchpad only, never the repo" rule is a *briefed* constraint the model can drift from, whereas `-C` plus `workspace-write` makes it **structural**: the sandbox root simply isn't the repo, so a spike cannot touch tracked files even if it tries.

Optional per-binding keys: `sandbox` (override the derived mode), `args` (extra flags appended verbatim, e.g. `["--ephemeral"]`).

> **Verified against `codex-cli 0.147.0`.** `--full-auto` does **not** exist in this version — older examples using it will fail argument parsing. Confirm with `codex exec --help` if a command errors; if the flags have moved on, fall back to `type: shell` with a template that matches the installed CLI and tell the user the built-in recipe is stale.

### `shell`

The escape hatch for a harness the orchestrator has no built-in recipe for (Gemini CLI, Aider, `llm`, Cursor). `model` is a free-text label used only for reporting; `command` is the template that actually runs.

```yaml
models:
  reviewer:
    any:
      type: shell
      model: gemini-2.5-pro
      command: "gemini -m gemini-2.5-pro -p {PROMPT}"
      unavailable_fallback: reviewer_local   # optional; a role name from models:
```

**Placeholders** substituted before running:

| Placeholder | Replaced with |
| --- | --- |
| `{PROMPT}` | The task brief, shell-quoted, as a single argument. |
| `{TASK_FILE}` | Path to a file the orchestrator wrote containing the full brief. |
| `{CWD}` | Absolute path of the repo working directory. |
| `{OUTPUT_FILE}` | Path where the orchestrator wants the agent's final message written. |

Optional `stdin:` key — a value (usually `{TASK_FILE}`) whose file contents get piped into the command. Reach for this whenever the brief is long: **naming a file in a CLI's argv does not make the CLI read it**, and most harnesses will treat the path as the prompt itself. If a CLI has no stdin mode, use `{PROMPT}` and accept the argv length limit.

Before the first `shell` or `codex` call in a phase, verify the binary exists (`command -v <first-token>`). If it's missing, fall back per *Resolution & fallback* and tell the user.

## Phases

```yaml
phases:
  code_review:
    use: reviewer                 # a role name, or a list of them
    strategy: race                # optional; inherits defaults.strategy
    cross_host: false             # optional; see below
```

`use:` takes one role or several. Naming more than one activates the phase `strategy`:

- **`distribute`** (default) — split the phase into independent tasks and spread them across the runners. Each task runs once. Maximizes throughput.
- **`race`** — run the *same* task on every runner and judge the outputs yourself. Higher cost, higher quality; reserve it for genuinely hard or high-stakes work.

```yaml
phases:
  implementation:
    use: [ builder, builder_fast ]   # two roles -> distribute tasks across both
    strategy: distribute
```

### `cross_host` — using two harnesses at once

By default a role resolves to **one** binding: the current host's. That's the either/or behavior you usually want — on Claude Code the reviewer is Opus, on Codex it's Sol, and you pay for one.

Setting `cross_host: true` on a phase resolves the role against **every** host binding whose CLI is actually reachable, and runs them all. Use it when a second opinion is worth the cost:

```yaml
phases:
  code_review:
    use: reviewer
    strategy: race
    cross_host: true      # -> Opus (native) AND gpt-5.6-sol (Codex CLI), findings merged
```

Two cautions:

- **Reserve it for read-only phases.** On `code_review` or `investigate`, two agents reading the same tree is free of side effects and the merged output is strictly better. On a *writing* phase, `cross_host: true` puts two harnesses in the same working tree at once — see *Working-tree isolation* below.
- **Race on analytical phases means union, not pick-one.** Two reviewers produce competing *judgments*. Take the union of distinct findings and judge each on its own merits: a finding only one reviewer raised can still be real, and a severity only one assigned is a prompt to re-check rather than to average.

### Working-tree isolation

The config cannot express this constraint, so the orchestrator has to enforce it: **any two runners that write, running concurrently, need separate checkouts.** File-level disjointness isn't enough. An external CLI touches shared surfaces the file partition never mentions — formatters, lockfiles, generated code, the git index — so a `codex`/`shell` runner sharing a wave with a native `claude` agent can corrupt work that on paper never overlapped.

When a writing phase resolves to more than one runner (whether via `use: [a, b]` or `cross_host: true`), either give each its own worktree or serialize them. Never run a write-capable external CLI concurrently with an in-tree agent.

## Presets

Written by first-time setup. Users pick one, then tweak. Each assumes a `codex` binding only if the user asked for one — don't invent CLIs they never mentioned.

### balanced (default)

```yaml
version: 2
host: auto
defaults: { strategy: distribute, allow_orchestrator_override: true, fallback: builder }

models:
  orchestrator: { any: { type: self } }
  scout:        { claude_code: { type: claude, model: sonnet, subagent_type: Explore } }
  builder:      { claude_code: { type: claude, model: sonnet } }
  reviewer:     { claude_code: { type: claude, model: opus } }
  test_runner:  { claude_code: { type: claude, model: haiku } }

phases:
  investigate:    { use: scout }
  planning:       { use: orchestrator }
  implementation: { use: builder }
  code_review:    { use: reviewer }
  tests_creation: { use: builder }
  tests_running:  { use: test_runner }
  tests_fixes:    { use: builder }
```

### fast

Cheaper and quicker; trades depth for speed. Same `version`/`host`/`defaults`/`phases` as **balanced** — replace only the `models:` block.

```yaml
models:
  orchestrator: { any: { type: self } }
  scout:        { claude_code: { type: claude, model: haiku, subagent_type: Explore } }
  builder:      { claude_code: { type: claude, model: haiku } }
  reviewer:     { claude_code: { type: claude, model: sonnet } }
  test_runner:  { claude_code: { type: claude, model: haiku } }
```

### quality

Strongest models where correctness compounds. Same `version`/`host`/`defaults`/`phases` as **balanced** — replace only the `models:` block, and point `tests_fixes` at `reviewer`-grade capability by giving `builder` the stronger model.

```yaml
models:
  orchestrator: { any: { type: self } }
  scout:        { claude_code: { type: claude, model: sonnet, subagent_type: Explore } }
  builder:      { claude_code: { type: claude, model: opus } }
  reviewer:     { claude_code: { type: claude, model: opus } }
  test_author:  { claude_code: { type: claude, model: sonnet } }
  test_runner:  { claude_code: { type: claude, model: haiku } }
# phases: tests_creation -> test_author; everything else as in balanced
```

## Multi-harness example

The case this schema exists for: **the same phase uses a different model depending on which harness is driving.** In Claude Code the reviewer is Opus; in Codex it's GPT-5.6 Sol. Neither host duplicates the other's phase list.

```yaml
version: 2
host: auto

defaults:
  strategy: distribute
  allow_orchestrator_override: true
  fallback: builder

models:
  orchestrator:
    any: { type: self }

  scout:
    claude_code: { type: claude, model: sonnet, subagent_type: Explore }
    codex:       { type: codex,  model: gpt-5.6-terra }

  builder:
    claude_code: { type: claude, model: sonnet }
    codex:       { type: codex,  model: gpt-5.6-terra }

  reviewer:
    claude_code: { type: claude, model: opus }
    codex:       { type: codex,  model: gpt-5.6-sol }

  test_runner:
    claude_code: { type: claude, model: haiku }
    codex:       { type: codex,  model: gpt-5.4-mini }

phases:
  investigate:    { use: scout }
  planning:       { use: orchestrator }
  implementation: { use: builder }
  code_review:    { use: reviewer }
  tests_creation: { use: builder }
  tests_running:  { use: test_runner }
  tests_fixes:    { use: builder }
```

Resolved on a **Claude Code** host: `code_review` → Opus via the Agent tool.
Resolved on a **Codex** host: `code_review` → `codex exec -m gpt-5.6-sol …`.

To get both on one run, add `cross_host: true` to `code_review` — it's read-only, so it's the one phase where doubling up is safe and clearly worth it.

## Resolution & fallback

Resolve each phase to concrete runners in this order, and **announce every substitution** — a silent downgrade is the failure mode users hate most, because the run looks fine and the output is quietly worse.

1. Look up the phase's `use:` role(s) in `models:`.
2. For each role, pick the binding for the detected host; if there's none, use its `any:` binding.
3. If neither exists, use `defaults.fallback` (itself a role name, resolved the same way). If `defaults.fallback` is also unresolvable, use a `type: claude` runner on `sonnet`.

**Prefer `any:` over `claude_code:` for Claude bindings**, and reserve named hosts for genuine overrides. A `type: claude` binding is portable — native Agent tool on Claude Code, `claude -p` anywhere else — so putting it on `any:` means a harness the user never anticipated (Cursor, Gemini CLI, a CI runner) still gets the model they picked. A config whose roles are bound *only* to `claude_code:` and `codex:` looks complete but quietly degrades every phase to the step-3 default the moment it runs anywhere else. When you write a config, check what it resolves to on a host that isn't in it.

Then apply these rules:

- **`type: claude` on a non-`claude_code` host** → shell out to `claude -p` (not a fallback; the intended model still runs).
- **`codex`/`shell` runner whose binary isn't installed** → that binding's `unavailable_fallback`, else `defaults.fallback`. Announce it.
- **Unknown Claude alias** (not `opus|sonnet|haiku|fable`) → `defaults.fallback`, warn.
- **`type: self` outside `planning`** → coerce to `defaults.fallback`, warn. Only planning and interaction can be done inline.
- **`shell` runner with no `command:`** → invalid; drop it and warn.
- **Role named in `use:` that isn't in `models:`** → `defaults.fallback`, warn.
- **Phase key absent** → use the **balanced** preset's value for that phase.
- **`strategy: race` with one resolved runner** → behaves like a normal single run; nothing to race.

A model being unavailable for *any other reason* — bad slug, expired auth, exhausted quota — is **not** an automatic fallback. The CLI will fail loudly; surface that error to the user rather than quietly retrying elsewhere, because the fix is theirs to make.

## Migrating a v1 config

v1 configs (`version: 1`, with `phases: { <phase>: { runners: [...] } }` and no `models:` block) still load. Read them as: every inline runner is an anonymous role bound to `any`, so they resolve identically on every host — which is exactly the old behavior.

Offer to migrate on first run, and mention the two things v1 examples got wrong so the user knows why it's worth doing:

- `--full-auto` in a Codex command template is invalid on current `codex-cli`.
- A bare `{TASK_FILE}` argument sends Codex the *filename* as its prompt, not the brief.

To migrate: lift each distinct runner into a named role under `models:`, give it a `claude_code:` binding, and replace each phase's `runners:` list with `use:`. Add `codex:` bindings for the roles the user wants routed differently on that harness. Then bump `version: 2`.
