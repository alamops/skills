# AGENTS_CONFIG.yml — schema, hosts, runner types, and presets

`AGENTS_CONFIG.yml` lives at the **target repo's root** (not this skill's repo) and routes each `/implement` phase to a model. It's the one file the user owns to control cost/quality per phase. Read this when creating, validating, or migrating a config.

Two ideas carry the whole schema:

1. **A logical model is a role, not a model ID.** You name a role once (`reviewer`, `builder`, `scout`) and phases refer to the role. What that role *resolves to* depends on which harness `/implement` is running in.
2. **A runner type says which agent, not how to reach it.** `type: codex` means "the Codex CLI" — the orchestrator already knows the command shape. You supply the model, not a command template.

Together these let the same config mean "review with Opus when I'm in Claude Code, review with GPT-5.6 Sol when I'm in Codex" without duplicating seven phases per harness.

**Current schema version: `3`.** See *Schema versions & `--update`* at the bottom for what each version added and how to bring an older config forward. The per-CLI command recipes live in `references/harnesses.md` — read that when spawning an external runner or adding a harness.

Note on scope: `tests_creation` and `tests_running` cover **all** test layers — unit, integration, and e2e when the plan includes it. There is no separate e2e phase key; the `tests_running` agent owns the full e2e lifecycle (start the app, seed, run headless, tear down). For e2e-heavy repos, put a mid-tier model on `tests_running` rather than the cheapest one — orchestrating servers and diagnosing readiness is real work, not just running a command.

## Top-level shape

```yaml
version: 3

host: auto                          # auto | claude_code | codex | cursor | gemini | kimi | grok | <name>

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
| `codex` | The Codex CLI | `codex exec` |
| `cursor` | The Cursor Agent CLI | `cursor-agent -p` |
| `gemini` | The Gemini CLI | `gemini -p` |
| `kimi` | The Kimi Code CLI | `kimi -p` |
| `grok` | The Grok Build CLI | `grok -p` |
| `shell` | Any CLI with no built-in recipe | Your `command:` template |

All six external types take the same two keys — `model:` and nothing else required. **The exact invocation for each lives in `references/harnesses.md`**, along with a capability matrix covering read-only support, working-directory flags, and prompt delivery, which differ enough between these CLIs to change which phases each can safely own. Read that page before spawning one.

One difference is important enough to repeat here: **`grok` has no headless read-only mode** (its plan mode is TUI-only), so a Grok runner on `investigate` or `code_review` is constrained only by its brief, not by a flag. Every other type has an enforced read-only mode. Warn the user when routing Grok to a read-only phase.

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

### `codex`, `cursor`, `gemini`, `kimi`, `grok`

Each takes just a `model:`. The orchestrator builds the command, derives the permission level from the phase, and captures the result.

```yaml
models:
  reviewer:
    codex:  { type: codex,  model: gpt-5.6-sol }
    cursor: { type: cursor, model: claude-opus-5-thinking-high }
    gemini: { type: gemini, model: gemini-2.5-pro }
    kimi:   { type: kimi,   model: kimi-code/kimi-for-coding }
    grok:   { type: grok,   model: grok-4.5 }
```

Permission level is derived from the phase — the harness's read-only flag on `investigate`/`code_review`, its auto-approve flag on the writing phases — so a read-only phase can't quietly gain write access. **`references/harnesses.md` has the literal command for each, the per-CLI flag names, and the capability matrix.**

Optional per-binding keys, supported on all five:

- `sandbox` / `mode` — override the derived permission level for this binding.
- `args` — extra flags appended verbatim, e.g. `["--ephemeral"]`. Use this for CLI options the schema doesn't model rather than dropping to `type: shell`.

**Spikes are the exception inside `investigate`.** A spike runs throwaway code, so a read-only mode would block the very thing it exists to do. Give it write access scoped to its own scratchpad directory. On a harness with a working-directory flag (`codex -C`, `cursor-agent --workspace`) point that flag at the spike directory — the "scratchpad only, never the repo" rule then becomes **structural** rather than briefed, because the working root simply isn't the repo. On `gemini`, `kimi`, and `grok` there's no such flag, so set the process working directory to the spike dir instead, and keep the boundary loud in the brief.

### `shell`

The escape hatch for a harness with no built-in recipe (Aider, `llm`, an in-house wrapper) — or for a built-in whose recipe has gone stale. `model` is a free-text label used only for reporting; `command` is the template that actually runs.

Prefer a first-class type whenever one exists: a `shell` binding pins a command shape that stops working the moment the CLI changes its flags, which is precisely how `--full-auto` survived in configs long after Codex removed it.

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
- **External CLI runner whose binary isn't installed** → that binding's `unavailable_fallback`, else `defaults.fallback`. Announce it. (Check `cursor-agent`, not `cursor`, for `type: cursor`.)
- **Unknown Claude alias** (not `opus|sonnet|haiku|fable`) → `defaults.fallback`, warn.
- **`type: self` outside `planning`** → coerce to `defaults.fallback`, warn. Only planning and interaction can be done inline.
- **`shell` runner with no `command:`** → invalid; drop it and warn.
- **Role named in `use:` that isn't in `models:`** → `defaults.fallback`, warn.
- **Phase key absent** → use the **balanced** preset's value for that phase.
- **`strategy: race` with one resolved runner** → behaves like a normal single run; nothing to race.

A model being unavailable for *any other reason* — bad slug, expired auth, exhausted quota — is **not** an automatic fallback. The CLI will fail loudly; surface that error to the user rather than quietly retrying elsewhere, because the fix is theirs to make.

## Schema versions & `--update`

The current schema version is **3**. Older configs keep working — nothing has ever been removed — so an upgrade is always an improvement, never a repair.

| Version | Added | Still valid? |
| --- | --- | --- |
| 1 | Flat `phases: { <phase>: { runners: [...] } }`. Types `self`, `claude`, `shell`. No host axis. | Yes — read each inline runner as an anonymous role bound to `any` |
| 2 | `models:` roles with per-host bindings, `host:` detection, `use:`, `cross_host:`, first-class `codex` | Yes |
| 3 | First-class `cursor`, `gemini`, `kimi`, `grok`; `args:`/`sandbox:` on any external binding; `references/harnesses.md` capability matrix | Current |

### What `/implement --update` does

`--update` compares the config's `version:` against the current schema version, then brings it forward **without changing a single model the user chose**. That constraint is the whole point: an update that silently re-routes a phase is indistinguishable from a bug, and the user would have no reason to trust the command again.

1. **Read and report.** Load the config, state its version and the current one. If they match, don't invent work — say it's current, mention anything genuinely stale (see step 3), and stop.
2. **Explain what's new since their version**, in terms of what it would change *for them* — not a changelog. A v2 user hears "Cursor, Gemini, Kimi, and Grok are now first-class, so the `shell` block you wrote for Gemini can become three lines"; they don't need to hear about `codex` being added, which they already have.
3. **Scan for drift**, and report findings whether or not the version changed:
   - `shell` bindings whose command matches a CLI that now has a first-class type → offer to convert.
   - Commands using flags that no longer exist (`--full-auto` is the known one).
   - A bare `{TASK_FILE}`/file path passed where the CLI expects prompt *text*.
   - Roles bound only to named hosts with no `any:` binding → they silently degrade on any other harness.
   - A `grok` binding on `investigate` or `code_review` → no enforced read-only mode.
   - `defaults.fallback` naming a model alias instead of a role (a v1 habit).
4. **Ask only what you genuinely can't decide.** Group the questions into one pass. The decisions that are legitimately the user's:
   - Which harnesses they actually drive `/implement` from now.
   - Which model each role should use on any harness they're adding — never guess a model tier for them.
   - Whether to convert each `shell` binding to its first-class equivalent (default yes, but it's their call if they tuned the command deliberately).
   - Anything where a fix has a real trade-off, e.g. moving Grok off a read-only phase.

   Don't ask about anything mechanical. Bumping `version:`, preserving existing bindings, and adding an `any:` binding that reproduces current behavior need no confirmation.

   **One conversion looks mechanical but isn't: a `shell` binding sitting on `any:`.** Moving it to its named host (`gemini:`, say) *narrows* it — it was the runner for every harness you hadn't named, and afterwards it serves only that one, with `any:` falling to whatever else the role has. That silently re-routes every unnamed host, which is exactly what `--update` promises not to do. Either keep it on `any:` with the new type, or ask. If the user wanted it as a second opinion rather than as the sole runner, the mechanism is `cross_host: true` with `strategy: race`, not an `any:` binding — say so, because a config written before that existed often encodes the wish rather than the behavior.
5. **Write, then show the resolved table** for each harness the config now covers, so the user can see that their existing routing is unchanged and only the new rows are new. Keep a backup (`AGENTS_CONFIG.yml.bak`) when the rewrite is substantial — a config is hand-tuned and cheap to preserve.

### Migrating v1 → v3 by hand

Lift each distinct runner into a named role under `models:`, bind it to `any:`, and replace each phase's `runners:` list with `use:`. Add per-harness bindings only where the user wants different routing there. Then set `version: 3`.

Two v1-era defects worth naming while you're in the file, because both fail silently rather than loudly: `--full-auto` no longer exists on `codex-cli`, and a bare `{TASK_FILE}` argument sends Codex the *filename* as its prompt instead of the brief.
