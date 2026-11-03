---
name: test-loop
description: (alamops) Runs a project's whole test suite — unit, integration and e2e — by itself, then drives it to green. Use it for any request to run the tests or the e2e suite, get a red suite or red CI green, or fix failing, broken or flaky tests (after a rebase or dependency bump), or to apply review must-fixes and re-run — even a plain "run the tests", and even when a database or other services must be brought up first. Owns the e2e lifecycle itself — starts services and the app, waits for real readiness, runs headless, tears down. Reports pass/fail by layer; on failures re-runs e2e once to separate flakes from defects, decides whether product or test is wrong, fixes each root-cause cluster with file-disjoint agents and re-runs everything, up to three rounds. Never reaches green by skipping, deleting or loosening tests. Phases 7–8 of `implement`, runnable alone; accepts `--no-e2e`. Not for writing new coverage (write-tests), exploratory bug hunting (break-fix), or production incidents.
---

# Test loop — run everything, then drive it to green

Two jobs, in order. **Run**: execute the whole suite — every layer, e2e included — and report exactly what passed and failed. **Fix**: when something failed, find out why, fix the cause, and run everything again until it's green or you hit a wall that needs a human.

The rule that makes this loop worth trusting: **green has to mean the software works.** A suite made green by skipping the failing test, deleting it, or loosening its assertion until it matches the wrong output is worse than a red one — it's a red suite that lies.

## Where this sits

This is Phases 7 and 8 of the `implement` delivery loop, packaged to run on its own. It typically follows `write-tests`, and it also accepts must-fix findings from a code review (e.g. the `code-review` skill) as items to fix before the final green run.

## 1. Run-only or to-green?

Read what was asked:

- **"Run the tests" / "what's failing?"** → run and report, then *offer* the fix loop. Nobody asked you to edit code yet.
- **"Get it green" / "fix the failing tests" / "CI is red, sort it out"** → run, then loop.

## 2. Find the recipe

Before running anything, find out how this project actually runs its tests, from the most to least authoritative source:

1. A plan's run recipe (`docs/plans/<slug>.md` §5) or an investigation brief's *Runnability* section.
2. **The CI config** (`.github/workflows/`, `.gitlab-ci.yml`, `circleci`, …) — the most reliable record of the real commands, the services they need, and the environment variables they set.
3. Package scripts, `Makefile`, `justfile`, `docker-compose` files, the README's contributing section.

If you still can't tell, ask the user once, and write the answer down (in the plan, if there is one) so nobody has to ask again.

**"The whole suite" is everything CI runs**, not just the test runner. That includes typecheck, lint, format check, a migration down-and-up, and builds. A branch that's green on tests and red in CI on lint is red. If the PR description says CI runs a gate and the workflow doesn't, report that too.

## 3. Run the suite

Run it in a background agent (on Claude Code, a `general-purpose` agent with `run_in_background`; you're notified when it finishes), or directly if the suite is quick. Unit and integration first; e2e after, since it's slower and its failures are easier to read once the lower layers are known-good.

**The e2e suite is run by you, not handed back.** "It needs a running app" is a setup step, not a reason to stop. Own the whole lifecycle:

1. **Prepare** — install what's missing (e.g. `npx playwright install`), start local services (database, queue, cache — usually via the project's compose file), run migrations and seed fixture data.
2. **Start** — launch the app and its dependencies as background processes, then **wait for readiness**: poll the health endpoint or port until it answers. Firing tests at a half-booted server produces failures that aren't real. If the default port is taken, use a free one; never kill a process you didn't start.
3. **Run** — execute the e2e command headless. On failure, keep what makes it diagnosable — traces, screenshots, videos, server logs — not just the exit code.
4. **Tear down** — stop everything you started, even when the run failed, so the next run begins clean.

**When a step genuinely can't be automated** — a real payment gateway, a physical device, human 2FA, credentials you don't hold — don't abandon the run. Automate everything up to that point, run the **maximal subset** that passes without the blocked step, and hand over a precise manual runbook for the remainder (commands, URLs, expected results), so the human's share is minutes of clicking rather than detective work. A partial e2e run with a clear handoff beats a skipped one every time.

Under `--no-e2e` (or "skip e2e"), run unit and integration layers only, and say so in the report.

**Report shape**, per layer: the command, pass/fail/skip counts, each failing test with the relevant slice of output (the assertion and the first meaningful stack frame, not 400 lines), and paths to artifacts.

**Check that green is real before calling anything a pass.** Suites often "pass" without running. A common way is test helpers that quietly `return` when `DATABASE_URL` or a service is missing, so every database test passes in 0 ms. Have each layer write a JUnit XML or Jest/Vitest JSON report (`vitest --reporter=junit --outputFile=…`, `jest-junit`, `pytest --junitxml=…`, `go-junit-report`) and run:

```sh
python3 scripts/quality_gates.py suite <reports…> --baseline <base-reports…> --require-env <VARS> --scan-tests <test-dir>
```

(`scripts/` sits next to this file; Python 3.9+, standard library only.) It mechanizes the checks below. Read its output, then confirm the parts it can't judge. Before reporting a layer green, check all of these:

- **Skip counts.** Every skip needs a reason. A layer that's mostly skipped didn't run.
- **Durations.** If a block of integration tests finished in about 0 ms, they didn't run.
- **Env and services.** Each env var and service the layer needs must have been present for the run. Read the helpers for early returns.
- **Test count against the base branch or the last CI run.** A drop means files stopped loading.

A layer that passed without its dependencies counts as **not run**, and the report says so. When you find the silent-return pattern, it's a defect to report, and to fix if fixing is in scope: skip loudly instead (`it.skipIf`, `ctx.skip()`), and add a global setup that fails under CI when a required service is unreachable.

## 4. Triage — decide what each failure means

Before anyone changes code, diagnose:

- **Cluster by root cause.** Thirty failures from one broken fixture is one problem, not thirty. Fix the cause and the cluster goes with it.
- **Re-run failing e2e tests once.** E2e is the flakiest layer. A consistent failure means the product code, or the test's assumptions, is wrong. A pass on retry means the *test* is at fault — it's racing something — and it needs a real repair, not a retry.
- **Product or test?** Read the test's intent and the acceptance criteria (the plan, the ticket, the PR). If the test encodes the intended behavior and the product doesn't do it, the product is wrong. If the change deliberately altered behavior and the test still asserts the old one, the test is outdated — updating it is legitimate, and the report says why. If you can't tell which behavior is intended, and the answer changes what users see, ask rather than guess.
- **Caused by this change, or already red?** When the loop is about a specific change, check whether a failure also happens at the base commit (a quick run in a worktree at the base SHA settles it). Pre-existing failures still get reported — but say they predate the change, and ask before widening the fix scope to them unless the user asked for the whole suite green.
- **Review findings.** If you were handed must-fix findings from a code review, treat each as a fix item alongside the test failures. Before fixing one, confirm it reproduces at the commit the reviewer read. A finding you can't reproduce goes back to the reviewer as a question; it isn't "fixed" blind. Track each one by its ID **and** title from start to report. An ID on its own means nothing to someone reading the report later.

## 5. Fix round

**Size the round to the fixes.** A few one-line fixes in separate files are faster to make yourself than to brief an agent for, and every agent carries a full context. Spawn fix agents when clusters are substantial and independent enough that parallel wall-clock actually matters.

When you do fan out, spawn fix agents in one message, one per failure cluster or finding, with **file-disjoint ownership** — two agents editing the same file corrupt each other's work; sequence or merge clusters that share files. On Claude Code, use `general-purpose` agents and leave the model unset unless the user asked for one. If your harness has no sub-agent tool, fix the clusters yourself, one at a time.

Each fix brief carries the diagnosis and its evidence, the owned files, and the instruction to **fix the cause**, not the symptom. For a flaky test, that means readiness waits, deterministic seeds, isolated state — not sleeps, retries baked into the test, or a longer timeout on its own.

Fix code is new code, and fix rounds are where new holes open. So each fix brief also carries the absolute path of `references/build-rules.md` (next to this file) with the sections for what the fix touches: *Always*, plus trust, data, external, concurrency, state or tests as relevant. It also requires the self-check at the end of that file, run with `--paths <owned files>`, and evidence in the agent's report.

These are off the table, in every round, for every agent:

- Skipping or focusing tests (`.skip`, `xit`, `@pytest.mark.skip`, `.only`), or excluding them from the run.
- Deleting a failing test, or weakening its assertion to match the wrong output.
- Updating snapshots or golden files without checking that the new output is right.
- Catching and swallowing the error that made the test fail.

If one of these is genuinely correct (the test covers a feature that was intentionally removed), it's a decision the report states and justifies — not something that happens quietly in a fix round.

**Fixing a review finding** carries four extra obligations. Each one guards against a way review fixes have gone wrong before:

- **A regression test that is red for the bug.** Write the test first, and run it against the code the review read. It must fail *on its assertion*, describing the bug. A test that fails at the old commit only because it imports a module or calls a route the fix adds proves nothing. Write it against behavior that exists on both sides of the fix, and record the red output.
- **Every path into the guarded action, including the new ones.** If the finding was "this path skips the check", list every path into that action after the fix. The paths the fix itself adds count too: a retry, a follow-up job, a short-cut for already-validated input. That's where the same hole most often reopens. If the fix validates something an untrusted party produced, store the validated copy where that party can't write.
- **The class, not the instance.** Grep for the pattern behind the finding (an unscoped lookup, a raw state write, an optional config fallback, a missing cleanup) and fix every site. That includes code this round is adding.
- **Partial is partial.** If the fix closes the cited path but not a sibling, report it as partial, and say what remains.

## 6. Re-run and loop

After each fix round, re-run the **whole** suite, not just the tests that failed — fixes break neighbors. Loop: triage → fix → re-run.

**Cap it at three rounds**, then stop and check in with the user, reporting the remaining failures with evidence and what you tried. A loop that keeps going past the point of progress burns time and tends to drift toward exactly the shortcuts listed above.

## 7. Report

Write it from the final run, at the final commit. Don't reuse numbers from an earlier round. If a PR description or a doc quotes test counts or lists fixes, update it to match before you hand back.

- **Final result per layer** — the command used, pass/fail/skip counts, and the static gates CI runs. If e2e was skipped (by flag, or because some step couldn't be automated), say so and why. If a layer ran without its dependencies, report it as not run.
- **Rounds** — how many, and what each fixed.
- **Fixes** — for each: product or test, the cause, the files changed. Call out every test that was updated because the change made it outdated, with the reason.
- **Review findings** — for each, by ID and title: *fixed*, *partial* (what remains), or *not fixed* (why). Give the commit and the regression test, plus the red output from before the fix.
- **Flakes repaired** — and what made them flaky.
- **Still failing** — with evidence, and whether they predate the change.
- **Manual runbook** — for any e2e step that couldn't be automated.
