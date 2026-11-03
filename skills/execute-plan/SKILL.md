---
name: execute-plan
description: (alamops) Executes only the coding work of an approved implementation plan, with parallel sub-agents that never collide. Cuts a branch and records the base SHA, checks no two tasks in a wave own the same file, gives each task's agent a self-contained brief with a no-TODO completeness clause, holds wave barriers, isolates unavoidable shared files in worktrees, routes reported remainder into the next wave, and commits a checkpoint per wave. Use when the user hands over a plan (`docs/plans/<slug>.md`, a `write-plan` output, or a task breakdown with file ownership) and limits the job to writing code — just the code and I'll review and test it myself, only run the coding waves, fan these tasks out with no tests — or asks for this skill by name. A plain "execute this plan" with no such limit belongs to `implement`, which carries the plan through review and tests to green. Phase 4 of `implement`, runnable alone. Not for writing the plan (write-plan) or a single pinpointed edit.
---

# Execute plan — collision-free parallel coding from a plan

Your job is to turn an approved plan's work breakdown into code, fanning tasks out to parallel agents wave by wave, so that the result is the plan — complete, on a branch, in resumable commits — and nobody's work got overwritten along the way.

You're the coordinator. Agents write the code; you own the decisions that keep the fleet safe: whether a wave is valid, what each brief says, when to move to the next wave, what to do with the remainder agents report, and how to recover when a task fails.

## Where this sits

This is Phase 4 of the `implement` delivery loop, packaged to run on its own. It executes a plan from `write-plan` (or `implement`'s Phase 3, or any breakdown with equivalent structure). It stops when the code is written: code review, tests, and the test/fix loop are separate steps (`code-review`, `write-tests`, `test-loop`) — or use `implement` to run all of it.

## 1. Load and check the plan

Find the plan — usually `docs/plans/<slug>.md`. Before anyone writes code, confirm it's executable:

- **Tasks own files.** Every task lists the exact files it creates or edits, and waves say what runs in parallel. If the breakdown lacks file ownership (it's a ticket list or a PRD), derive the partition yourself from the code, show the user the tasks-and-waves table, and get a quick yes before spawning — you just changed the plan, and they should see it.
- **Open questions.** If §8 holds an unresolved question a task depends on, raise it now. A premise that's wrong costs a sentence to fix today and a rewrite after the wave lands.
- **Wiring.** Every task should say what production entry point reaches its code, or which task wires it in. Every success criterion should have a task that produces its output. If the plan has gaps here, say so and add a wiring task before spawning. Show the user, since you changed the plan. Without it, the waves produce modules that are tested, reported done, and never called.
- **The contract is in the repo.** If the plan cites a spec by a path on someone's machine or a chat link, ask for it in the repo before building on it. If `docs/specs/` holds a copy that isn't committed yet, commit it first, unamended, as its own docs commit.
- **Acceptance an agent can check.** Each task's acceptance should be concrete enough to verify: scenarios with given, when and then. They include the failure states and the sequences, such as a command after another command, cancelling one of two items, or a cache past its expiry. Each names how it gets proven (a test, a command). "Works correctly" can't be checked. Sharpen vague acceptance from the plan's intent before spawning, and show the user what you changed.
- **Risk tags.** Each task should say what it touches: `trust`, `data`, `external`, `concurrency`, `state`, `migration`, `infra`, `tests`, or `none`. The tags pick the build-rules sections its brief carries and decide which tasks get a review before the next wave builds on them. Tag untagged tasks yourself from what they own.
- **Approval.** A plan the user handed you with "execute this" is approved. A plan marked self-approved under `--auto` is approved for an unattended run.
- **Your changes to the plan stay marked as yours.** You may fill an ordinary gap yourself: an unassigned shared helper, wave siblings that depend on each other, a route the plan didn't name. Record each change in the plan with a one-line reason, under a heading saying the owner hasn't approved it. Change the approval line too, for example "approved by owner; 6 later changes unratified". A one-way door is not yours to decide while the owner is away. That covers:
  - a new endpoint reachable without login;
  - a check made looser;
  - a destructive or non-additive data change;
  - a public contract;
  - money;
  - weakening a behavior the plan requires, such as a retry cap.

  Ask the owner. If no one can answer, build the narrowest safe default, mark it unratified, and list it first in the report.

If the input is really a feature request with no plan behind it, say so and point to `write-plan` (or `implement`) instead of improvising a breakdown on the fly — the plan is where file ownership gets thought through, and skipping it is what makes parallel agents collide.

## 2. Baseline before anything writes

- **Branch.** Never let a fan-out write to the default branch. If you're on `main`/`master` or no target branch was named, create one from the plan slug (`implement/<slug>`) and announce it.
- **Record the base.** Capture `git rev-parse HEAD` as the base SHA and note whether the tree was already dirty (`git status --porcelain`). Fill the plan's `Branch` and `Base SHA` rows — a metadata-only edit, not a scope change. Review and the final diff are measured against exactly this ref, so pre-existing edits aren't mistaken for this build's.

## 3. Run each wave

For every wave in the plan, in order:

1. **Validate it.** Cross-check the owned-files lists of the tasks you're about to launch together. If any path appears in two of them, the wave isn't valid — re-partition or split it before spawning. It's a thirty-second check and the cheapest place a collision will ever be caught.
2. **Brief each task** (see below).
3. **Spawn one agent per task in a single message**, so they run concurrently — when the tasks are substantial enough for parallel wall-clock to matter. A wave of a few small, single-file tasks is often faster done by one agent carrying them all, or by you directly; each agent costs a full context, so match the fleet to the work rather than to the task count. On Claude Code, use `general-purpose` agents; leave the model unset so they inherit the session's model unless the user asked for another. If your harness has no sub-agent tool, execute the tasks yourself one at a time in wave order — the partition still keeps each change clean.
4. **Hold the barrier.** Wait for every agent in the wave before starting the next; later waves depend on earlier ones. If an agent says it's waiting on its own background command, message it to finish that in the foreground and report. Some harnesses treat an agent that has ended its turn as done, and if you end your turn when no agent is running, your own run can be cut short.
5. **Verify every task, and send back what isn't right.** A summary describes what the agent meant to do; the diff is what it did. You're the last line before the wave is committed and other work builds on it, so don't skim this step. See *Verifying a task* below.
6. **Review the risky tasks before anything builds on them.** Spawn one read-only reviewer for this wave when it holds a task tagged `trust`, `data`, `external`, `concurrency`, `state` or `migration`, or when the wave added more than about 500 lines. On Claude Code, use a `general-purpose` agent briefed read-only, with the `code-review` skill if it's installed. Otherwise give it the matching sections of `references/build-rules.md` as the checklist. Scope it to this wave's diff (`git diff` since the last checkpoint, plus untracked files), and give it the tasks' acceptance and the plan's §7 invariants. Send must-fix findings back to the owning task's agent, then re-verify. A mistake caught here costs one task. Caught after three more waves have copied the pattern, it costs a rewrite. If the user said they'll review the code themselves, skip this step, and say in the report which waves went unreviewed.
7. **Checkpoint.** Run a quick sanity pass if it's cheap: build, typecheck, lint on changed files, and `python3 scripts/quality_gates.py hygiene --worktree` and `wiring --worktree`. Check that each export this wave added either has a production caller already, or is named in a later task's *wired by*. Then commit the wave as `wave N: <summary>`, writing the summary from `git diff --stat` rather than from the plan. A commit message has to describe what the commit actually contains, and unrelated concerns go in separate commits. Update the plan's `Status` row. These commits are resume points: if a later wave fails, you pick up from the last green one instead of starting over.

### The brief

An agent can't pause to ask what you meant, so its one instruction must carry everything. Vague briefs are the biggest single cause of overlapping work and rework. Every brief nails:

- **Objective** — the task's goal, in a sentence.
- **Owned files** — exactly the plan's list, with a firm "touch nothing else — other files belong to other agents".
- **Context** — the relevant findings and file:line anchors from the plan, and the sibling code to mirror.
- **Acceptance** — the plan's criteria for this task.
- **Conventions** — match the surrounding code: naming, error handling, logging, idiom.
- **Completeness clause** — finish the task's whole scope, with no `TODO`/`FIXME`/stub/`NotImplementedError` standing in for in-scope work. If you find remainder *outside* your owned files — a caller on the old path, a validator that needs the new enum value — don't reach across the boundary (that collides) and don't leave a marker (that's a silent deferral): report it back.
- **Wiring clause** — say where this task's code gets called from in production: the entry point named in the plan, or the task that wires it. If you own the wiring, do it. If you don't, list what you exported and still needs a caller. No production function returns a placeholder (`''`, `[]`, an always-throwing stub) to make a compile pass.
- **Invariants and runtime shape** — paste the plan's §7 text, not a summary. That covers the rules every path must obey and where each is enforced, how many instances run, and what a crash between steps must leave behind. An agent can't respect an invariant it was never shown.
- **Build rules** — the absolute path of `references/build-rules.md`, with the sections to read: *Always*, plus one per risk tag on the task. These are the review's checklists turned into rules for writing, so most of what a reviewer would flag never gets written.
- **Use what exists** — this clause exists because parallel agents can't see each other's work, so they drift toward building their own mechanisms.
  - Read values from the config module. Don't hard-code a value config already owns. Add new settings there, and read every key you add.
  - Write state through the existing transition table or state machine, never with a raw update.
  - Send guarded actions through the gate the plan names in §7.
  - Import shared types and helpers rather than redeclaring them.
  - Respect the plan's invariants. For example, no network call inside a database transaction, and every retry loop has a cap.
  - If the existing mechanism doesn't fit, report that back rather than quietly working around it.
- **Shared-tooling limits** — run formatters and linters on your owned files only, not the whole repo; don't install or upgrade dependencies unless you own the manifest and lockfile; don't regenerate shared code. File-disjoint tasks still collide through tools that rewrite files nobody assigned. Run long commands, such as test or mutation runs, in the foreground, and report only after they finish.
- **Self-check before reporting** — the closing section of build-rules.md, in six steps:
  1. Re-read the diff of your owned files.
  2. Walk every flow the task touches, end to end, including failure states and command sequences.
  3. Run `quality_gates.py hygiene` and `wiring` with `--worktree --paths <owned files>`, and fix the real hits.
  4. Run the narrowest typecheck, lint and existing tests that cover the files.
  5. Give evidence for each acceptance item.
  6. Name what you couldn't verify.
- **Output** — the same shape for every sibling, so you can merge them:
  - files changed;
  - evidence per acceptance item, as file:line, a test or a command result;
  - the self-check results;
  - deviations from the plan, and why;
  - remainder found outside the owned files;
  - exports still waiting for a caller;
  - what couldn't be verified.

Example: *"**Objective:** add a `TransactionHistory` class. **Owned files:** create `wallet/history.py` — do not edit `account.py`, the tests, or config. **Wiring:** T7 registers it in `wallet/service.py` and calls `append()` from `Account.post()`; don't do that here, but list every public method T7 will need to call. **Context:** mirror the style of `wallet/account.py:1-40`; read limits from `wallet/config.py`, don't hard-code them; no new deps. **Acceptance:** (1) `append()` of a debit then a credit, then `.since(t0)`, returns both in order; (2) `.since(ts)` with ts after the last entry returns `[]`; (3) two `append()`s with the same idempotency key store one entry. **Invariants (plan §7):** entries are append-only; at least two instances run, so uniqueness is enforced by the database, not in memory. **Build rules:** read `/abs/path/references/build-rules.md` — *Always*, *Database and transactions*, *State and lifecycles*. **Completeness:** no stubs or TODOs; report anything outside `history.py` that needs changing. **Self-check:** run the six steps at the end of build-rules.md, with `--paths wallet/history.py`. **Output:** files changed, evidence per acceptance item, self-check results, deviations, remainder, exports awaiting a caller, anything you couldn't verify."*

### Verifying a task

For each task in the wave:

1. **Read its diff, not its summary.** That's `git diff -- <owned files>`, plus any new untracked files. Check every file it touched is one it owns.
2. **Check each acceptance scenario against the code.** Find where each given/when/then is handled, and check the evidence the agent gave. "Done" with no evidence, or evidence that doesn't match the code, counts as not done.
3. **Check the brief's clauses.**
   - Is the new code wired, or named in a later task's *wired by*?
   - Does it read config instead of hard-coding it?
   - Does it go through the existing state machine and the plan's gates?
   - Does it keep the §7 invariants?
   - Does it follow the build-rules sections for its risk tags?
4. **Run the gates yourself**: `python3 scripts/quality_gates.py hygiene --worktree --paths <owned files>` and `wiring` with the same flags. An agent's own report of a clean self-check is a claim, not evidence.
5. **Send back what isn't right.** Send a fix request to the same agent, continued with its context if your harness can (on Claude Code, `SendMessage` to the agent). Otherwise re-brief a fresh agent with the same owned files. The request lists each problem:
   - **What's wrong**, with file:line.
   - **What it should do instead**, the acceptance scenario or rule it misses.
   - **What evidence to return.**

   Never fix it silently yourself while the agent reports success, because the next task's agent will repeat the mistake.
6. **Re-verify the fix the same way.** Allow two fix rounds per task. After that, do it yourself if it's small, or stop and surface it as a plan problem if it isn't. A task that fails twice is usually a wrong premise or a vague acceptance, not a careless agent.

The wave is committed only when every task passes, and the wave review's must-fix findings (step 6) are fixed and re-verified. Record the outcome per task: passed first time, passed after N fix rounds, or escalated. The record shows whether the briefs, or the plan, need to get sharper.

## 4. When files can't be partitioned

If two tasks genuinely must edit one central file (a registry, a routes table), prefer, in order:

1. **Sequence them** into different waves.
2. **Carve out a wiring task** — one small task in a later wave owns the shared file and makes all the one-line registrations.
3. **Isolate them** — run the colliding agents in separate worktrees (on Claude Code, `isolation: "worktree"`), then **you** merge each worktree branch into the working branch one at a time and resolve conflicts yourself. Merging is the step most likely to strand or clobber work, so it's the last resort, not the default.

## 5. Handle the remainder

Agents following the completeness clause will report remainder they weren't allowed to touch — that's the clause working, not a failure. For each item:

- **It's part of finishing the feature** → schedule it as a task in the next wave (or a final sweep wave), with its own owned files.
- **It's genuinely a different ticket** → add it to the plan's completeness ledger (§9) as *out of scope*, with the reason.

What it never becomes is a `TODO` in the code or a "later" line in your report. Before you finish, grep the diff against the base for added `TODO|FIXME|XXX|HACK` and placeholder throws — it catches the obvious half in seconds.

**Then run the wiring audit**, the other half:

1. Run `python3 scripts/quality_gates.py wiring --base <base-sha>` and `hygiene --base <base-sha>` (`scripts/` sits next to this file; Python 3.9+, standard library only.). `wiring` lists new exports that nothing in production reaches, and config keys parsed but never read. `hygiene` lists deferral markers, placeholder throws, focused or skipped tests, env reads outside config, hard-coded copies of config defaults, and the other patterns that keep turning up in reviews.
2. Confirm each hit. For what the script can't see (routes, handlers, job and message types, metrics), find a caller outside its own file, barrel re-exports and tests, and follow it up to a real entry point.
3. For each of the plan's success criteria, find the production line that produces the output.
4. List config keys that are parsed and never read, and production functions that return placeholders.

Anything this turns up goes into a final sweep wave, or to the owner as a plan change. Code that's tested but unreachable isn't "available for later". It's the most expensive remainder there is, because every report says it's done. Unit tests pass on it, and a reviewer sees a well-tested module.

## 6. When a wave fails

- **Never discard completed work** because something downstream failed. Fix forward from the last green checkpoint.
- **An agent's task failed on its own terms** (compile error, missed acceptance) → re-brief that task with the failure output, same owned files.
- **The plan's premise was wrong** (the API doesn't exist, the "two callers" are twelve) → stop and surface it. That's a plan change the owner should see, not something an agent improvises around mid-wave.
- **No off-plan waves.** Work the plan doesn't contain is a plan change, however obviously needed. That includes a "hardening pass", a "trust pass", a cleanup or a refactor the agents keep asking for. Write it into the plan first, with tasks, owned files, acceptance and risk tags, and get the owner's yes. Under `--auto`, record it in §8. Then run it as a wave like any other. An unplanned 10,000-line commit late in a build is how a reviewable change becomes one nobody can review, and how earlier waves get silently rewritten.

## 7. Report

Write the report from evidence at the final commit: `git log <base>..HEAD`, the wiring audit and the sanity checks. Earlier agents' summaries describe what they meant to do, so don't build the report from them. If you also update a PR body, the plan's ledger or `Status`, or any summary doc, derive each claim from the same evidence.

- **Branch and base SHA**, and the wave commits.
- **Plan changes you made**, unratified one-way decisions first, each with its reason.
- **What each task changed**, which agent did it, and any deviations from the plan.
- **Verification**: per task, the acceptance evidence and the verification outcome (passed first time / after N fix rounds / escalated, with what was sent back). Per wave, whether it was reviewed, what the review found, and what was fixed before the next wave.
- **Wiring**: each success criterion and the production path that now produces it, plus the audit's result for new exports. Anything still unwired is listed as a defect. It is never listed as "available".
- **Remainder**: what got swept into later waves, and what went to the ledger as out of scope (and why).
- **Sanity checks** run and their results.
- **Not done by this skill**: review and tests. Suggest the next steps — `code-review` on the diff since the base SHA, `write-tests` for the plan's §5 test tasks, then `test-loop` to run the suite to green — or `implement` next time to run the whole loop.
