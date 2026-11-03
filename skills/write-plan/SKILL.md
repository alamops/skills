---
name: write-plan
description: (alamops) Writes a decomposition-ready implementation plan to `docs/plans/<slug>.md` — objective, grounded context with file:line anchors, approach and rejected alternatives, a work breakdown where each task owns files disjoint from its wave-siblings, test tasks by layer with an explicit e2e decision and run recipe, execution waves, blast radius, open assumptions, and a completeness ledger dispositioning every would-be follow-up. Builds on `investigate`/`grill` output when present, else grounds itself read-only and asks the load-bearing questions first. Presents the plan for approval and changes no code; `implement` and `execute-plan` can run it as-is. Use when the user asks to write or draft an implementation plan, plan how to build something before coding, break a change into parallelizable work, or turn a spec into an execution plan. Phase 3 of `implement`, runnable alone. Not for product PRDs (to-prd), human-facing engineering tickets (create-tasks), or building the thing (implement).
---

# Write plan — the contract every downstream agent works from

Your job is to turn a change that's understood into a plan that can be **executed by parallel agents without them colliding**, and to save it as a durable artifact under `docs/plans/`. The plan is not a summary of intentions; it's the contract each implementation and test agent works from, which is why it has to say exactly which files each task owns.

## Where this sits

This is Phase 3 of the `implement` delivery loop, packaged to run on its own. It reads an `investigate` brief and a `grill` decision record when they exist; its output is what `execute-plan` (coding waves) and `implement` (the whole loop) execute.

**Read-only on the repo.** The only files you write are the plan and, when the source spec lives outside the repo, a copy of it under `docs/specs/` (see §1). No code changes happen until someone approves the plan.

## 1. Gather the inputs

Look for, and read, whatever already exists for this feature:

- `docs/plans/<slug>-investigation.md` — findings, spike verdicts, completeness inventory, runnability.
- `docs/plans/<slug>-grill.md` — the owner's decisions, dispositions, and open assumptions.
- The source ask — a ticket, a PRD, a spec, or the conversation.

**If there's no investigation**, do a proportionate read-only grounding pass before writing: the files the change touches, sibling code paths to mirror, every caller of what's changing (including re-exports, barrels, and scripts or jobs outside the main source tree), how the app and its tests run. On Claude Code, a couple of parallel `Explore` agents cover this; on a small change, read inline. A plan without file:line anchors is guessing at the file ownership it's supposed to guarantee.

Whether or not an investigation exists, make sure the plan stands on these four things:

- **The spec, in the repo.** If the ask is built on a spec or PRD that lives outside the repo, save it, or the sections the build relies on, unamended, as a new file under `docs/specs/` next to the plan. Outside the repo means a file on someone's machine, a chat or artifact link, or a ticket. Then cite it by repo-relative path, and say in your hand-off that it should be committed before the code. If the owner doesn't want it committed, quote the load-bearing sections into §2. Never cite an absolute local path, or a line number in a file only you can open. A reviewer has to be able to check the code against the contract, and they can't if the contract only exists on your machine.
- **The repo's own rules.** Read CLAUDE.md / AGENTS.md / CONTRIBUTING, any lessons-learned file, incident write-ups, ADRs, checklists and runbooks, and a tech-debt register. Also look at how the closest sibling module is laid out, and note its size and layering limits. List the rules that bear on this change in §2, with their paths. A plan that repeats a mistake the repo already wrote down will be caught in review, and fixing it there costs a rewrite.
- **The runtime and trust shape.** Find out how many instances run, and what happens during a rolling deploy or on a crash between steps. Find out who can send input, and with what privilege: users by role, webhook senders, outside contributors, workers or agents running code the system didn't write. List which privileged actions they can reach. §7 needs this to name the invariants. If the code and the infra don't settle it, it's a question for the owner.
- **Live facts the plan rests on.** Check how an external system actually behaves with a read-only query, rather than assuming. Use `gh api …`, a cloud CLI's `describe` or `list`, or `git ls-remote`. Check that an environment, branch, workflow or secret path the plan names actually exists.

**If load-bearing questions are still open** and nobody grilled the owner, ask them in one structured pass before writing — the few whose answer would change the plan's shape, not a full interrogation. (For a large or ambiguous change, suggest `grill` instead.) If the owner says "just write it", proceed and log each assumption in §8. Never plan silently over an unasked question: a plan built on an assumption nobody sees is how the wrong thing gets built efficiently. A skipped **one-way-door** question is different: trust boundaries, auth, destructive data changes, public contracts, money. Don't answer it on the owner's behalf. Plan the narrowest safe option, mark it **unratified** at the top of §8, and say in the hand-off that it belongs in the PR body for a reviewer to ratify.

## 2. Build the completeness ledger first

Before breaking down any work, list every candidate follow-up — every caller still on the old path, every place a shape propagates, the existing rows a migration must backfill, the reachable states with no handling, the docs that will describe the old behavior, the code the change orphans, and the wiring that connects each new unit to a production entry point (registration, config reads, the loop that calls it). Then disposition each:

- **In this run** — with the task ID that will own it.
- **Out of scope** — with why it's a different ticket.
- **Owner-deferred** — only if the owner actually decided it (at the grill or when approving this plan), with who and where. Not available under `--no-follow-ups` or `--auto`.

A row that just says "deferred" with no owner behind it isn't a disposition — it's a task you forgot to write.

Do this *before* the breakdown and let it feed the breakdown: a remainder you notice while writing tasks tends to get written down as a note; a remainder you enumerate first gets a task. The ledger is also the honest scope estimate — it's where the owner sees how much finishing the job properly adds, before a line of code is written.

The line between *in* and *out*: would a reviewer call the shipped change **unfinished** without it, or call it **a different ticket**? Adjacent features, drive-by refactors, and dependency upgrades stay out.

## 3. Partition the work — the heart of the plan

Split the change into tasks such that, **within a wave, no two tasks own the same file**, and order the waves so every task's dependencies land in an earlier wave. This is what makes parallel execution safe: agents that edit the same file concurrently corrupt each other's work, and no amount of good briefing fixes that after the fact.

For each task:

- **ID** and a one-line goal.
- **Owned files** — the exact paths it creates or edits. Nothing else.
- **Depends on** — the task(s) or wave that must land first.
- **Acceptance** — scenarios an agent can check without asking you: given, when, then. Cover the happy path, the failure states, and the **sequences**: a command after another command on the same version, cancelling one of two related items, a cache past its expiry, a gate after a re-run. Name how each is proven (a test, a command). "Works correctly" can't be checked, so it isn't acceptance. Agents verify their own work against this line, and a vague line produces confident, wrong "done"s.
- **Risk** — what the task touches: `trust` (untrusted input, authz, approvals, secrets, paths), `data` (transactions, queries, schema reads), `external` (outbound calls, retries), `concurrency` (background loops, timers, multiple instances), `state` (lifecycles, transitions, cleanup), `migration`, `infra`, `tests`, or `none`. The tags pick the build rules each coding agent gets, and decide which waves are reviewed before the next one builds on them.
- **Wired by** — the production entry point that reaches this task's code (server boot, route table, job registry, scheduler, `main`), or the ID of the task that wires it in. If you can't fill this in, nothing in production will ever call the code. You've planned a module that will be written, tested, reported done, and never run, which is the most expensive remainder a plan can produce.

Watch the hot spots that make a partition quietly invalid — files that many tasks "just need one line in": route or DI registries, barrel `index` files, schema definitions, migration sequence numbers, lockfiles and package manifests, generated clients, i18n catalogs, shared fixtures and snapshots. Either give that file to exactly one task (often a small wiring task in a later wave) or sequence the tasks that touch it.

**Make the wiring a named task.** Most features need a small composition step: register the route, the job, the handler or the plugin, read the new config keys, start the loop. Give that step to one task in a late wave. When the wiring is spread across "everyone adds their own line", it collides. When nobody owns it, it doesn't happen.

**Trace every success criterion to the code that produces it.** For each item in §1, name the production path that creates the output, and the task that builds each hop. If the objective is "produce X", some task has to own the line that creates X. A renderer for X, a type for X, or a test fixture for X doesn't count. A criterion with no producing task is the feature missing from its own plan.

**Plan inside the structure the repo already has.**

- **Size and layering limits.** Respect the repo's file and function size limits and its layering rules.
- **State writes.** If the repo routes state writes through a transition table or state machine, a new entity's states go through one too, rather than through raw updates.
- **Config.** Config lives in the config module, and every key gets read. A value the config owns is never hard-coded at its use site.
- **The composition root stays wiring.** Plan where the domain logic goes, so it doesn't land in the composition root by default.

**Name each invariant and its single enforcement point.** For the rules every path must obey, record the one function or module that enforces each in §7. Examples: who may trigger a privileged action, what an approval binds to, one writer per state, idempotency of external writes. A task that adds a new path to a guarded action has acceptance "goes through `<gate>`". The batch version, the retry, the follow-up job and the fallback are where a rule enforced in several places stops being enforced.

**Keep every barrier green.** Each wave ends in a checkpoint commit that later work resumes from, so at every barrier the tree should build and the suite should pass — a plan whose checkpoints are knowingly red makes "resume from the last green wave" meaningless. Tasks in the same wave can code against an interface the plan pins down (a signature, a type, a column name), so a breaking change and the callers and tests it breaks usually belong in the *same* wave as separate tasks, not in consecutive ones. Where a red barrier is genuinely unavoidable, say so in §6 and name exactly which tests are expected to fail and which task turns them green.

Keep the fleet proportionate: group trivially small edits into one task rather than one task per file, and don't force parallelism onto work that shares context and ordering — two sequential waves beat one colliding wave. Coding parallelizes worse than research.

**Plan the delivery, not just the waves.** If the change will be too big to review as one diff, plan it as a stack of PRs in dependency order and record the slices in §6. Roughly, that's more than 1,500 changed lines, or several subsystems. Each slice must be wired, green, and reviewable on its own, and must delete anything it doesn't wire. A reviewer can work through a stack. One PR of tens of thousands of lines gets skimmed, or returned unreviewed. When the change depends on work in another repo, list each dependency and its state (merged, open, not pushed) in §7, with the merge and apply order.

**Validate before you finish.** Cross-check the owned-files lists of every wave; if any path appears twice in one wave, the wave is invalid — re-partition it. Then check every task has a *wired by*, and every §1 criterion has a producing task.

## 4. Plan the tests

List test tasks by layer (unit / integration / e2e), which implementation task each covers, and their owned test files — partitioned the same way, by module under test.

Beyond each task's own acceptance, plan these:

- **An assembled-flow test per §1 criterion.** It drives the production entry point and asserts the output was produced. Unit tests on a module pass whether or not the module is wired, so they can't stand in for this.
- **Every variant through its handler.** Each member of a new union, kind or message type passes through the code that renders or handles it at least once.
- **The negative paths at each trust boundary.** Cover a bad signature, a replay, an oversize input, the wrong owner, a revoked or expired identity, and an approval for a stale version.
- **The runtime shape §7 names.** That means a real second process, a real kill, and an injected dependency failure. A gentler stand-in, such as two instances in one process or a graceful close, misses the bugs these tests exist for.
- **A note in each test task: tests must be able to fail.** Each must be shown red against a broken copy of the behavior. A missing database or env must skip loudly, and fail the run in CI, rather than return early and pass.

**Decide e2e applicability explicitly.** It applies when the change has a user-visible flow or crosses a process boundary (UI → API → DB, service → service, CLI → filesystem) and the app can run locally. It doesn't apply to a pure library or helper change fully exercised by unit tests — and then the plan says so. "Not applicable" is a recorded decision, never a silent omission. When it applies, record the **run recipe**: the e2e command, how the app and its services start, seed data, credentials and environment prerequisites. If the repo has no e2e harness, don't quietly plan heavyweight infrastructure — propose the minimal ecosystem-standard harness scoped to this feature's flows as a decision for the owner.

Under `--no-e2e`, record e2e as *skipped by flag* and plan unit/integration only.

## 5. Write the plan

Save to `docs/plans/<slug>.md` — reuse the slug from an existing investigation or grill record; create the folder if missing; suffix `-YYYY-MM-DD` if an unrelated plan already has that name. Use this template (it matches the one `implement` writes, so either skill can execute it):

```markdown
# Plan — <Feature Name>
| Field | Value |
| --- | --- |
| Date | <YYYY-MM-DD> |
| Source | <task / repo path of the spec or PRD / investigation + grill records / conversation> |
| Flags | <e.g. --no-e2e --no-follow-ups, or "none"> |
| Gates | <"grilled + approved by owner", "approved by owner (no grill)", "owner skipped the grill: N unratified decisions (§8)", or "self-resolved under --auto"> |
| Status | <planned / wave N of M landed / review / tests green — kept current during execution> |
| Branch | TBD — set when execution starts |
| Base SHA | TBD — set when execution starts |

## 1. Objective & success criteria   (each criterion names the production path that
   produces it — entry point → … → new code — and the test that drives that path)
## 2. Context & constraints   (grounded findings with file:line anchors; the spec by
   repo-relative path; repo standards that apply — lessons, checklists, ADRs, sibling
   layout — each with its path; spike verdicts with what was measured and under which
   versions; live facts checked, with the command)
## 3. Approach & key decisions   (alternatives considered and why this one; mark which
   decisions rest on evidence vs. reasoning)
## 4. Work breakdown — implementation tasks
   | ID | Goal | Owned files | Depends on | Acceptance (scenarios) | Risk | Wired by |
   Review-response plans add the finding map:
   | Finding (ID + title) | Task | Regression test | Status |
## 5. Work breakdown — test tasks
   | ID | Layer | Covers | Owned files | Acceptance |
   E2e: applies to <flows> / not applicable because <reason> / skipped via --no-e2e.
   Run recipe: <command, app + services startup, seed data, credentials>
## 6. Execution waves   (which tasks run in parallel; the barrier between waves;
   delivery slices — the stack of PRs — when the change is too big for one review)
## 7. Invariants, runtime shape & risks
   Invariants: <rule> — enforced at <one place> — every path routes through it.
   Runtime shape: instances, rolling deploys, crash between steps, dependency outage,
   kill switch and which setting wins.
   Blast radius: callers, sibling paths, migrations, rollback, feature flags.
   Cross-repo dependencies: <repo / PR / branch, state> and the merge/apply order.
## 8. Open questions / assumptions   (unratified one-way decisions first; then what the
   owner left open and what you're proceeding on; under --auto, the self-answered Q&A —
   question / answer / source / confidence — plus any one-way decision scoped out for a
   human. Not a bin for remainder: that's §9)
## 9. Completeness ledger
   | Item | Disposition | Task ID / reason / who deferred |
```

### Plans that answer a review

When the input is a review of existing work, the plan's core is the **finding map** in §4. Every finding gets a row with its ID **and** title, the task that fixes it, and the regression test that proves it. Before you map a finding, check it against the code at the head the review read. One you can't reproduce goes in §8 as a question for the reviewer, not into a task.

Plan three things that fix rounds otherwise get wrong:

- **Red for the bug.** Each regression test is observed failing at the pre-fix commit *on its assertion*. A test that fails there only because it imports a module or route the fix creates proves nothing.
- **Every path into the guarded action.** If a finding was "path A skips the gate", the task's acceptance lists every path into that action after the fix, including any the fix itself adds.
- **The class, not the instance.** If the finding names a pattern, such as raw state writes, a missing ownership check, or optional config, the task greps for every instance. That includes new code this round adds.

The plan's last task refreshes every claim at the final head: the PR description, any generated report, test counts, and this plan's `Status`.

## 6. Present it and get approval

Give the owner a short read of the plan rather than the whole file: the objective, the approach and the key decision behind it, the waves at a glance (how many tasks, how parallel), how big the ledger made the job, the top risks, and every open assumption — unratified one-way decisions first. Then ask for approval or changes. This is the last cheap moment to change direction — once code is written against a plan, changing the plan costs a rewrite.

If the ledger turned up remainder an order of magnitude larger than the original ask (the migration touches 200 call sites across three services), say so plainly and let the owner choose scope — don't let the size hide inside §9.

**Under `--auto`**, don't wait: write the plan, mark it self-approved in `Gates`, and put the §8 decisions the owner should check first at the top of your summary.

Once it's approved, suggest the next step: `execute-plan` to run the coding waves, or `implement` to take the plan through code, review and tests to green. If you saved a spec under `docs/specs/`, say it should be committed first and unamended, as its own docs commit, so any later change to it shows up as a diff a human can approve.
