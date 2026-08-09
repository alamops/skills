# Harness recipes — the CLIs `/implement` knows how to drive

Each runner `type` below is **first-class**: the config supplies a model, and the orchestrator owns the command. Users should never hand-write a `command:` template for anything on this page — that's what `type: shell` is for, and reaching for it here means a recipe is missing or stale.

Read this when spawning an external runner, when adding a harness to a config, or when a command fails on argument parsing.

**Provenance of these recipes**, because it determines how much to trust them:

| Recipe | Source | Confidence |
| --- | --- | --- |
| `codex` | `codex exec --help`, `codex-cli 0.147.0` | Verified against the binary |
| `claude` | `claude --help`, `claude 2.1.226` | Verified against the binary |
| `cursor` | `cursor-agent --help` + `--list-models`, `2026.08.04` | Verified against the binary |
| `gemini` | Official Gemini CLI docs | From documentation — binary not available to check |
| `kimi` | Official Kimi Code CLI reference | From documentation — binary not available to check |
| `grok` | Official xAI Grok Build docs | From documentation — binary not available to check |

For the bottom three, run the binary's `--help` the first time you use it in a repo and reconcile any difference before relying on the recipe. Documentation lags implementations, and a flag that has moved is exactly the failure this page is meant to prevent.

## Capability matrix

This table is the load-bearing part of the page. The differences between these CLIs are not cosmetic — they change which phases a harness can safely own.

| `type` | Binary | Headless | Model | Working dir | Enforced read-only | Auto-approve writes | Prompt delivery |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `codex` | `codex` | `exec` | `-m` | `-C/--cd` | `--sandbox read-only` | `--sandbox workspace-write --approve-for-me` | stdin via trailing `-` |
| `claude` | `claude` | `-p` | `--model` | `--add-dir` | `--permission-mode plan` | `--permission-mode acceptEdits` | stdin |
| `cursor` | `cursor-agent` | `-p/--print` | `--model` | `--workspace` | `--mode plan` | `-f/--force` | positional arg |
| `gemini` | `gemini` | `-p/--prompt` | `-m/--model` | **none** — set cwd | `--approval-mode plan` | `--approval-mode yolo` | positional arg (stdin appends) |
| `kimi` | `kimi` | `-p/--prompt` | `-m/--model` | **none** — set cwd | `--plan` | `--yolo` or `--auto` | positional arg (no stdin) |
| `grok` | `grok` | `-p` | `-m` | **none** — set cwd | **none** | `--always-approve` | positional arg |

Three consequences worth internalizing before you route a phase:

1. **`grok` has no headless read-only mode.** Its plan mode is a TUI affordance (`/plan`, Shift+Tab), not a flag. So on `investigate` or `code_review` a Grok runner's read-only-ness is a *briefed* constraint the model can drift from, not a structural one. That's a materially weaker guarantee than every other harness here — say so when a user routes Grok to a read-only phase, and prefer another harness there if they have one.
2. **Only `codex` and `cursor` take a working-directory flag.** For `gemini`, `kimi`, and `grok` the orchestrator must set the process working directory itself (run the command with `cwd` = repo root). Don't invent a `--cd` for them; it doesn't exist and will fail argument parsing.
3. **Prompt delivery is not uniform.** `codex` and `claude` read stdin, so long briefs are safe. `cursor`, `gemini`, `kimi`, and `grok` take the brief as a positional argument, so it's subject to the OS argv limit. Briefs are normally a few KB and fit comfortably, but if one grows large, write it to a file and pass a short pointer brief that tells the agent to read that path — never pass the bare path expecting the CLI to open it.

## Sandbox / permission derivation by phase

Every recipe derives its permission level from the phase, so a read-only phase can't quietly get write access:

| Phase | Intent | Applied as |
| --- | --- | --- |
| `investigate`, `code_review` | read-only | the harness's read-only flag from the matrix |
| `implementation`, `tests_creation`, `tests_fixes` | write in the workspace | the harness's auto-approve flag |
| `tests_running` | write + run processes | auto-approve; raise further only if the e2e run truly needs it, and tell the user |

Spikes are the exception inside `investigate`: they run throwaway code, so they need write access scoped to their own scratchpad directory rather than the repo. Where the harness has a working-directory flag, point it at the spike directory — that makes the "scratchpad only" boundary structural instead of briefed.

## Recipes

`{CWD}` is the repo root, `{BRIEF}` the task brief, `{BRIEF_FILE}` a file containing it, `{OUT}` a file to capture the final message.

### `codex` — Codex CLI

```
codex exec -m <model> -C {CWD} --sandbox <read-only|workspace-write> [--approve-for-me] -o {OUT} - < {BRIEF_FILE}
```

The trailing `-` makes Codex read the brief from stdin. A bare positional path would send Codex the *filename* as its prompt — a silent failure that reads as the model ignoring instructions. `-o` captures the final message far more reliably than scraping stdout.

Models: `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna`, `gpt-5.6-pro`, `gpt-5.4-mini`.
Verified against `codex-cli 0.147.0`.

### `claude` — Claude Code CLI

```
claude -p --model <alias> --add-dir {CWD} --permission-mode <plan|acceptEdits> --output-format text
```

Brief on stdin. Only used when the **host** is not Claude Code; when it is, spawn a native sub-agent via the Agent tool instead — same model, better integration.

Models: `opus`, `sonnet`, `haiku`, `fable`.
Verified against `claude 2.1.226`.

### `cursor` — Cursor Agent CLI

```
cursor-agent -p --model <model> --workspace {CWD} [--mode plan | --force] --output-format text {BRIEF}
```

Note the binary is `cursor-agent`, not `cursor`. `--mode plan` is read-only; `-f/--force` (alias `--yolo`) auto-approves writes. Brief is a positional argument.

**`cursor-agent` has built-in worktree isolation** — `-w/--worktree [name]` runs the agent in an isolated git worktree under `~/.cursor/worktrees/`, with `--worktree-base <branch>` to pick the base. When a writing wave puts Cursor alongside another runner, prefer this over hand-rolling a worktree: it's one flag and the CLI manages setup and teardown. You still merge the result yourself.

Models (from `cursor-agent --list-models`): `auto`, `composer-2.5`, `gpt-5.6-sol-high`, `gpt-5.3-codex`, `claude-opus-5-thinking-high`, `claude-sonnet-5-thinking-high`, `cursor-grok-4.5-high`, `kimi-k3-high`, and `-fast` / effort-tier variants of most. Run `--list-models` to see the live set; it changes often.
Verified against `cursor-agent 2026.08.04`.

### `gemini` — Gemini CLI

```
gemini -m <model> --approval-mode <plan|yolo> --output-format text -p {BRIEF}
```

Run it with the process working directory set to the repo root — there is no working-directory flag. `--include-directories a,b` adds extra roots if a task genuinely spans them.

`--approval-mode` accepts `default`, `auto_edit`, `plan`, `yolo`. Use `plan` for read-only phases and `yolo` for writing ones (`default` and `auto_edit` both block on interactive approval, which hangs a headless run). Plan mode is governed by the `general.plan.enabled` setting; if a run behaves as though it can still write, verify that setting rather than assuming the flag took.

Sandboxing is available but configured out-of-band via the `GEMINI_SANDBOX` environment variable (`docker`, `podman`, macOS seatbelt profiles), not a per-invocation flag. Mention it if a user wants containment stronger than approval modes.

Models: `gemini-2.5-pro`, `gemini-2.5-flash`. Confirm the current set rather than trusting this list — Google renames these more often than the others.

### `kimi` — Kimi Code CLI

```
kimi -m <model> [--plan | --yolo] --output-format text -p {BRIEF}
```

Working directory must be set by the caller. `--plan` is read-only; `--yolo` auto-approves tool calls and `--auto` is the softer automatic-permission mode.

**`kimi` does not read the prompt from stdin** — `--prompt` requires the brief as an argument. Piping a file into it does nothing useful.

Models: `kimi-code/kimi-for-coding` is the documented default form. `--agent` / `--agent-file` select which agent drives the session if the user has custom agents.

### `grok` — Grok Build CLI

```
grok -m <model> [--always-approve] --output-format streaming-json -p {BRIEF}
```

Working directory must be set by the caller. `--always-approve` skips interactive approvals — required for any headless writing phase.

**There is no headless read-only flag.** See the matrix note above; if you route Grok to `investigate` or `code_review`, the read-only constraint lives only in the brief, so state it emphatically there and tell the user the guarantee is weaker than it would be on another harness.

`--output-format` is documented with `streaming-json`; parse accordingly, or omit the flag for the default human-readable stream.

Models: `grok-build-0.1` (default), `grok-4.5`.

## When a recipe goes stale

These CLIs move fast, and a flag that vanishes is the failure mode this page exists to prevent — `--full-auto` was removed from Codex and silently broke every config that used it.

If a command fails on **argument parsing** (rather than auth, quota, or a model error), the recipe has drifted. Check the binary's `--help`, adapt the invocation, and **tell the user the built-in recipe is stale** so they can report it. Do not silently reroute to a different model — that hides the one fact they need. If the corrected shape is stable, a `type: shell` binding with an explicit `command:` is the documented escape hatch until the recipe is updated.
