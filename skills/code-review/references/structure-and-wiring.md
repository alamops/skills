# Structure, wiring, claims and config

The architecture-and-spec pass. Its first job: find out whether the running system actually does what the change says it does. Structure comes second.

## Contents
- Wiring: is it reachable from production?
- The outputs the objective names
- Claims audit
- Spec adherence and the source of truth
- Config integrity
- Structure and layering
- Docs and process artifacts
- Commit and PR shape

## Wiring: is it reachable from production?

Code that is exported, unit-tested and listed as done but never called by the running system is the costliest remainder there is. Every checkbox says it's finished, so nobody goes looking for it.

**How to check, mechanically.**

1. List what the change adds:
   - new exports: `git diff <base>...HEAD | grep -E '^\+.*export (async )?(function|const|class)'`, or the language's equivalent;
   - route and handler registrations;
   - job and queue names;
   - message and event types;
   - config keys;
   - metric names;
   - CLI commands.
2. For each one, find callers outside its own file, outside barrel/`index` re-exports, and outside tests:
   `grep -rn "\bname\b" src/ | grep -v -E '(\.test\.|\.spec\.|__tests__|/test/|index\.ts)'`
3. Follow the remaining callers up to an entry point: server boot, the route table, the job registry, a scheduled task, `main`. A caller that is itself unreachable doesn't count.

**Report it as one finding with a table** when several items fail:

| Claimed in (plan / PR / doc) | Function | Status |
| --- | --- | --- |
| "<what the docs say happens>" | `registerThing` (`src/x.ts`) | never called; `src/y.ts:42` does the job inline instead |

**Variants of the same problem:**
- **A protocol message sent by one side and dropped by the other.** Also: a type defined in the contract that is never sent, or an exported `drain()` that is a no-op called on shutdown.
- **A production stub.** A loader returns `''`, a source function always throws, a fetcher returns `[]`. It's wired, but it returns nothing.
- **A state-machine function** (`transition(entity, event)`) with no production caller, while the same transitions are done by raw writes elsewhere.
- **A guard that is computed and then thrown away.** An orphan list gets built and never acted on, or a budget gets parsed and never charged.
- **Test-only exports** left in production modules after a refactor.
- **Write-only state.** A column, event row or status field that the code writes and nothing reads. Examples: a `blocked_reason` column that no scheduler consults, or recovery events inserted that no dispatcher picks up. It looks like a mechanism and does nothing.
- **A handler with no deployable entry.** The function exists, but nothing builds its clients, reads its secrets or adapts it to the runtime that will host it (a serverless adapter, a CLI `main`, a worker bootstrap). The package may not even depend on the SDK it needs.
- **Silent degradation.** An optional dependency on a production path that quietly falls back when it's missing. For example, a function that enqueues a job when given a queue, and only sends a bare notification when it isn't. One caller forgets to pass the queue, and work is silently lost.
- **Fabricated records.** Code that inserts a placeholder row with made-up defaults (a state, a label) when a real record is missing. Downstream checks then treat that row as real and pass because of it.

**Fix** is always one of two things. Wire the item into the production path with an assembled-flow test that drives it from the entry point. Or delete it, along with its tests and every doc line that claims it.

## The outputs the objective names

Every feature exists to produce something: a record, a message, a commit, an API call, a file, a notification. Take the objective or success criteria from the plan, spec or PR body. For each primary output:

- Find the production code that **creates** it, with an insert, a send or an enqueue. A renderer for the output doesn't count, and neither does a type or a test fixture.
- Find the test that proves it's produced **through the assembled system**.

"The renderer for kind X exists and is tested" while nothing ever enqueues a kind-X row means the feature's main output is missing. That is a blocker when the PR claims the feature works.

## Claims audit

Collect claims from the PR body, the plan's completeness ledger, generated reports or HTML summaries, commit messages, test names, README and docs. Check each against the code at the reviewed head:

| Claim shape | How to check |
| --- | --- |
| "Survives X" / "handles X" | Is there a test that injects X? Does the code path that handles X exist? |
| "CI runs typecheck, lint, tests" | Read the workflow file: which steps actually run? |
| "N tests in M files" | Compare against the CI run or a local run. Do different docs disagree with each other? |
| "Every metric has an emitter" / "no module over 500 lines" | Grep, or `wc -l`. |
| "Fixes #N" / "finding 7 fixed" | Trace the fix end to end (see re-review in SKILL.md §4). |
| A ledger row marked done | Find the code and the test. |
| "One helper for X" | Count the copies. |
| A commit message that describes its content | Compare `git show --stat` against the message. A "small fix" that touches dozens of files and thousands of lines is a claim that doesn't hold. |

An unbacked claim about security, data integrity, or the main output is a must-fix. If the gap is large, it's a blocker. Stale counts and outdated doc lines are should-fix, grouped together.

## Spec adherence and the source of truth

- **Where is the contract?** A plan or spec cited as `/Users/<name>/…/spec.html:412`, as a chat or artifact link, or as "the latest draft" with no file can't be reviewed by anyone else. Ask for the relevant sections to be committed under `docs/` (e.g. `docs/specs/<name>.md`) and every citation turned into a repo-relative path.
- **Amendments.** If the spec in the repo already has amendments applied and the original isn't in history, the amendments can't be read as a diff. Ask for the unamended version as its own commit, then the amendments in a separate one. Separate behavior-changing amendments from wording fixes. Note who approved each. An amendment the author approved for themselves needs another approver.
- **Decisions marked as assumptions.** If the decision record shows the owner skipped scoping questions, every decision built on them is an assumption. Name the load-bearing ones as questions for a human.
- **Spec-to-code checks.** For state machines, check every transition named in the spec against the table in the code. Do the same for every trigger and every gate. Report transitions or triggers that are missing, extra, or reachable in an illegal order.

## Config integrity

- **Parsed but never read.** For every key the config module parses, grep for a read site. A key with no reader either does nothing or is shadowed by a hardcoded literal.
- **Literals that duplicate config.** Grep the default values: `'30s'`, `500`, a label like `'skip-ci'`, a bot login, a repo name. Every literal copy is a place a config change won't reach. The concrete bug pattern: someone changes the setting, one site honors it and another still checks the literal, and a workflow stalls forever.
- **Env read outside the config module.** Each such read is unvalidated and undocumented, and the config tests don't cover it.
- **Optional config in production signatures.** `fn(x, config = defaults())` or `config ?? defaults()` on a production path means a caller that forgets to pass config silently runs on defaults, which ignore the environment. Make config required in production signatures, and keep defaults in test builders.
- **Limits that must agree.** Retry caps (the queue's max receives vs the app's own cap), retention windows (a body expires before the dead-letter message that points to it), timeouts (a visibility timeout shorter than worst-case processing). When they disagree, one side's branch never runs.
- **Deprecated aliases and compatibility shims** in code that has never deployed. There's nothing to be compatible with yet.
- **Boots silently degraded.** Missing required config should stop the process, in development too, with a message that names the variable. A process that "boots" without its database and serves only a health endpoint wastes the next person's afternoon.

## Structure and layering

- **The composition root stays wiring.** If `composition`, `main`, `app` or `server` holds raw SQL, domain decisions, loops, module-level mutable state or hundreds of lines of interpreter logic, it has become a second domain layer. Suggest the extraction by module name, so the root goes back to building the route table and registering plugins.
- **One writer per state.** If the code has a transition table or state machine, count the places that write the state column directly: `grep -rn "set state" src/`. Every bypass is a transition the table never validated. A new lifecycle added in the same change should get the same treatment as the existing ones.
- **Size budgets.** Use the repo's own limits for file and function length. Check `CONTRIBUTING`, lint config, and the plan itself. Moving a 400-line function into its own file doesn't break it up.
- **Import cycles.** Run `madge --circular` or the language's equivalent. Also look for upward imports, where a low-level module imports a higher-level one.
- **Duplicated helpers.** The same small type-guard defined in several files. Types redeclared by hand instead of imported from the shared contract package.
- **Library internals.** Writes into a library's private tables, use of its unexported statements, or patches to its source. Each needs a recorded exit plan: the upgrade path, or the code you'd own instead.
- **Two diverging copies of one mechanism.** Two helpers that cancel jobs, one also handling `retry`, the other not. Pick one.
- **Unused dependencies** in the manifest, and dependencies used but not declared (resolved only through a hoisted workspace).
- **Dead flags and placeholder jobs.** A deploy job that only echoes, behind a flag nothing sets. These read as features and are none. If the repo has a rule against dark flags, cite it.
- **Unreachable branches** and redundant conditions in decision functions.

## Docs and process artifacts

- **Docs the change made untrue.** README trees, architecture docs, system maps, examples, config references.
- **Generated reports** (HTML summaries, implementation reports) checked against the head. Look at commit counts, features listed as "left for later" that are now wired, and descriptions of what a builder does.
- **Process docs must be self-contained.** A fix plan that says "findings 1–N" with no titles, or an investigation that cites lines in a file on someone's laptop, can't be checked. Ask for ID plus title, and repo-relative paths.
- **Plan status** that lags the code ("next: wave 3" after wave 3 landed).
- **New subtrees, services or state keys** missing from the repo's index docs (CLAUDE.md, README, CONTEXT, architecture), and missing a dated decision record when the repo keeps ADRs for that kind of change.

## Commit and PR shape

- **Commit messages that don't describe their content.** "Squash of the waves" that isn't one. A commit that bundles five concerns.
- **A PR too large to review line by line**, especially when late commits rewrote earlier ones. Propose a stack in dependency order. Each PR should be wired, green, and delete what it doesn't wire. Name which findings must land first because they change the most files.
