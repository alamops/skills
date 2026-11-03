---
name: code-review
description: (alamops) Performs a thorough, read-only code review of any change source — a pull request, a git diff, uncommitted edits, recent commits, or code just produced in the conversation — and re-reviews a fix round, scoring each earlier finding fixed / partial / not fixed. Flags bugs; security and trust-boundary gaps (tenant isolation, authz, approvals bound to the wrong version, untrusted input driving privileged state, atomicity, retry safety, RLS self-recursion); reliability under the real deployment (two instances, crashes mid-step, network calls inside transactions, unbounded retries); code that is written and tested but never wired into production; PR-body and doc claims the code doesn't back; tests that cannot fail; performance, config and schema drift; and blast-radius gaps — checked against the repo's own rules and specs. Returns findings with severity, file:line, a failure scenario and a fix; never edits code. Use for any code review, PR review, re-review, diff review, or critique of recent changes.
---

# Code review

A read-only review skill: produce findings the author can act on without reopening the code, and never edit code. Tone: a direct, friendly senior teammate — plain words, concrete scenarios, firm where you have evidence, a question where you don't.

## Where the expensive defects hide

The defects that cost the most in a finished change are rarely typos in the changed lines. They are:

- **Code that is written but not wired.** Exported, unit-tested, listed as done in the PR body — and called by nothing in production. Sometimes it's the feature's main output that never gets produced.
- **A guard on one path and not its sibling.** The main path checks authorization; the batch action, the retry, the fallback job, or the path a fix just added does not.
- **Behavior that holds with one process.** Two instances, a rolling deploy, a crash between two steps, or a dependency outage breaks it.
- **A test whose name promises more than it checks.** It passes with the bug still in, because it asserts something that was always true, or it silently returns when its database is missing.
- **A mistake the repo already wrote down.** A lessons-learned entry, a checklist, an ADR or a tech-debt item that the change repeats.
- **Claims that drifted from the code.** The PR body, a generated report, the plan's ledger or a commit message describes work that isn't there.

The diff alone shows none of these. Each one needs you to look past the changed lines, at callers, entry points, the deployment shape and the repo's own docs. Spend most of the review's effort there.

## Rules

1. **Read-only.** Even if an editing tool is available, do not modify code. Fixes, refactors and tests are findings, not commits.
2. **Every finding is concrete.** State the mechanism, a **scenario** (who does what, in which state, and what goes wrong), and the fix. If you can't build a plausible scenario, write it as a question instead.
3. **Verify before you report.** Re-check every blocker and must-fix yourself at the reviewed head by reading the code, running a grep, or tracing the call. A sub-agent's finding sounds equally confident whether it's right or wrong, and a wrong blocker costs the author a day.
4. **Complete the entire review.** Walk every changed file. Don't stop after the first few hits.
5. **Promise discipline.** Don't defer work you can do now. If you spot something, write it down as a finding immediately. Don't say "I'll come back to this."
6. **Explain the why.** Every finding states what is wrong and why it matters. No bare assertions.
7. **No positive findings.** Findings are for problems. Don't emit "looks good" or "nice touch" items. A clean area gets a one-line mention in the summary. One exception: on a large review, a short **Keep** list is allowed (see *Report*). Each Keep item names a specific pattern, with file:line, that the fix round must not break. It qualifies because the fixer can act on it. Ask: "Is there an action the author should take?"
8. **Say what you didn't do.** Note it if CI wasn't re-run, the spec wasn't found, migrations weren't applied, or the plan/apply step wasn't run. Put this in the header so the reader knows what the verdict rests on.

## 1. Pick and pin the review target

| Trigger | How to gather the diff |
| --- | --- |
| User names a PR (URL or number) | `gh pr view <n> --json title,body,headRefOid,baseRefName,commits,files` and `gh pr diff <n>`; read the review comments too (`gh api repos/{owner}/{repo}/pulls/<n>/comments`, `gh pr view <n> --comments`) since an earlier review changes the job (see §4). |
| "Review this branch" / "my changes" / "what I'm about to push" | `git status`, `git diff <base>...HEAD`, `git log <base>..HEAD --stat`. Default `<base>` to `origin/main` (or `origin/master`); fall back to `main`. |
| Uncommitted / pending / staged work | `git status`, `git diff` and `git diff --cached`. |
| "Recent commits" / "the last commit" | `git log -n <N> --stat`, `git show <sha>` for each. |
| Code we just wrote or discussed in this conversation | The files edited this session — re-read them from disk; don't trust your memory of the patch. |
| "Re-review" / "check the fixes" / a prior review is pasted or exists on the PR | Re-review mode — §4. |
| Ambiguous ("review my code") | Ask once: "The open PR, your uncommitted changes, the diff against `main`, recent commits, or the code we just wrote?" Then proceed. |

**Pin it.** Record the head SHA and the base SHA (`git merge-base`) you reviewed, and say so in the header. A review that doesn't name its commit can't be checked again after the next push, and a re-review needs the earlier review's SHA to diff from.

**Read from a pinned checkout when the branch might move.** If the PR is still being pushed to, or you're fanning out passes (§3), make a detached worktree of the head SHA: `git worktree add --detach <scratch>/review-<sha> <sha>`. Read from there, and remove it when you're done. Never `git checkout` over the user's working tree.

## 2. Gather intent, the contract, and the repo's own rules

Shallow first: title, description, linked issues, commit messages, the user's stated goal. Then:

- **Find the contract.** This is the plan (`docs/plans/<slug>.md`), spec or PRD the change was built against. Half of a review is checking whether the change does what it set out to do. **If the change cites a spec that isn't in the repo**, that is a finding: nobody can check the change against it. This includes an absolute local path like `/Users/...`, a chat or artifact link, a line number in a file nobody else has, or a ticket that quotes no text. Ask for the relevant sections to be committed under `docs/`. If the spec arrived with amendments already applied and the original isn't in history, the amendments can't be reviewed as a diff. Say so, and say who approved them. An amendment the author approved for themselves isn't approved.
- **Read the repo's own rules before judging.** Read CLAUDE.md / AGENTS.md / CONTRIBUTING, and anything like `docs/lessons-learned*`, incident write-ups, ADRs, checklists and runbooks, or a tech-debt register. Also look at how sibling modules or subtrees are laid out. A finding that cites "the repo already says this at `docs/lessons-learned.md:25`" is the strongest kind there is. A change that repeats a documented lesson or a registered tech-debt item is at least a must-fix. A convention from another repo or an outside spec doesn't override this repo's layout.
- **List the claims.** Collect every claim the change makes about itself. Sources include PR-body bullets, "fixes #N", plan ledger rows marked done, a generated report or HTML summary, commit messages ("small fix"), test names ("survives a database blip"), and docs that describe the feature. §5's claims audit checks each one.

## 3. Run the mechanical gates, then size the review

**Gates first.** Before reading the diff, run the bundled checks against the pinned range. They take seconds even on a 30,000-line diff:

```sh
python3 scripts/quality_gates.py wiring  --repo <repo> --base <base-sha> --head <head-sha>
python3 scripts/quality_gates.py hygiene --repo <repo> --base <base-sha> --head <head-sha>
```

`scripts/` sits next to this file. `wiring` lists two kinds of problem:

- new exports that nothing in production reaches (only their own file, re-export barrels, or tests use them);
- config keys that are parsed and never read.

`hygiene` lists recurring patterns in the added lines:

- spec citations: laptop paths and chat links;
- tests that can't be trusted: focused or skipped tests, silent early-return guards, sleeps;
- secret handling: fail-open checks and non-constant-time compares;
- control flow: floating promises, unguarded async intervals, unordered `LIMIT 1`, swallowed errors;
- configuration: env reads outside config, and literals that duplicate config defaults;
- commit messages that don't match their diff size.

Every hit is a **lead, not a finding**. Confirm it against the code, then report it in your own words with a scenario, or drop it. Hand the output to every pass below. If Python isn't available, run the same searches by hand.

**Small change.** One pass, yourself, through every dimension in §5.

**Large change.** Roughly more than 1,500 changed lines, several subsystems, a trust-sensitive surface, or infrastructure. Run parallel agents, spawned in one message, each reading the same pinned worktree. On Claude Code, use `general-purpose` agents briefed to be strictly read-only. A search-only agent type is built to locate code, not to audit it, so it misses what this needs. There are two kinds of pass, and you need both:

**Dimension passes** cut across the whole diff, one concern each:

1. **Architecture & spec adherence.** Wiring, claims, layering, config, structure, docs. Reference: `references/structure-and-wiring.md`.
2. **Security & trust boundaries.** Reference: `references/trust-boundaries.md`.
3. **Data, concurrency & reliability.** Covers transactions, locks, retries, failure modes and multi-instance behavior. Reference: `references/reliability.md`.
4. **Test quality.** Can each test fail for the bug it names? Reference: `references/test-quality.md`.
5. **Operations** (when infra, IaC, CI/CD or runbooks are in the diff). Reference: `references/infra-and-ops.md`.

**Correctness passes** go one subsystem or user flow at a time. Use one per major area, and group small areas together. Each walks its flows end to end and asks whether the logic does what the feature intends. That covers:

- state transitions that can't happen or happen twice;
- cancel or close actions that reach too far (closing one item cancels a sibling's work);
- caches that serve stale or expired values;
- a command that's ignored after another one ran on the same version;
- a gate that never reopens;
- options or arguments that are accepted and then ignored.

Cross-cutting checklists miss this whole class of bug, because no single concern owns "is this flow right?". A review built only from dimension passes finds the classic defects and misses the feature's own logic errors.

Each brief carries:

- the base and head SHAs;
- the intent and the claims list;
- the repo standards you found, with paths;
- the gate output;
- the reference for a dimension pass (by absolute path, which the agent reads itself), or the subsystem's directories and the flows to walk for a correctness pass;
- the output format: findings with file:line, mechanism, scenario and fix, plus a list of what it couldn't verify;
- the boundary: read-only, and its own dimension or subsystem only.

When they return, you merge:

- Take the **union** of distinct findings. One pass alone raising something doesn't make it wrong.
- Dedupe across passes.
- **Re-verify every blocker and must-fix by hand** at the head, and drop or downgrade what doesn't hold up.

Without a sub-agent tool, run the passes yourself in sequence. The references still apply.

## 4. Re-review: a fix round against an earlier review

When an earlier review exists, the re-review has two jobs, in this order. The earlier review can be PR comments, a pasted review, a `docs/reviews/` file, or a fix plan with a finding map.

**1. Score every earlier finding at the new head**: *fixed*, *partial*, *not fixed*, or *regressed*.

- Trace each fix end to end. "The cited line changed" doesn't count. Rebuild the original scenario and check that it no longer works.
- A fix that closes the cited path but leaves a sibling path open is **partial**.
- A regression test that fails at the old commit only because its imports or routes didn't exist yet was never red *for the bug*. That finding is unproven, so ask how the test was shown red.
- Put the counts in a scorecard table by area (fixed / partial / not fixed / regressed). Name the not-fixed and partial items with their original IDs **and** titles.

**2. Review what the fix round introduced.** Fix rounds go wrong in predictable ways. Check each:

- **A new path around the guard.** The fix established an invariant on the main path, and a new short-cut, retry, follow-up job or fallback reaches the same action without passing through it.
- **Checked data stored where the checked party can write.** The fix validates an artifact, then stores it or reloads it from a location the untrusted party controls.
- **The anti-pattern returns on a new entity.** The review removed it for one entity, and the fix round reintroduces it for a new one, such as raw state writes for a new lifecycle when the old ones moved behind a transition table.
- **Code moved, not fixed.** A god file was split into files that hold the same oversized functions. Optional config parameters with a silent fallback to defaults reopen the hardcoded-config bug class the review closed.
- **Docs and status describing an earlier head.** The PR body, reports, plan status, counts or commit map describe an earlier head, or disagree with each other.

The scorecard goes first in the report, followed by the new findings.

## 5. What to look for

Walk every changed file through these dimensions. The bold lead-ins are the minimum; each reference file holds the full checklist with scenarios and fixes.

### Feature logic

Before the checklists, walk each user flow the change touches from start to finish, and ask whether the code does what the feature intends:

- **Transitions.** Can every state transition actually happen? Can any happen twice?
- **Reach of cancel and close.** Does a cancel, close or supersede reach only what it should, or does closing one item cancel its siblings' work?
- **Caches.** Do they expire when the thing they cache expires, such as a token's own expiry?
- **Command sequences.** Does a command still work after another command ran on the same version, for example skip then run?
- **Gates.** Does every gate that closes have a path that reopens it?
- **Inputs.** Are options and arguments honored, or accepted and ignored?

These are the feature's own bugs. No cross-cutting checklist owns them, and they are what the author most needs to hear.

### Wired, not just written

For every new export, handler, route, job type, message type, config key, metric and command, check:

- **A production caller.** Is it reachable from a real entry point (server boot, route table, job registry, CLI main)? Its own file, a barrel re-export, and tests don't count. Show the grep. When more than two items fail this check, report them as one finding with a table (*claimed / function / status*).
- **The outputs the objective names.** Trace each primary output to the production code that creates it. That's the record, message, commit or API call the feature exists to produce. "The function exists and has a test" is not "the system does it."
- **Production stubs.** Look for functions that return `''`, `[]` or `null`, that always throw, or exported no-ops that get called on a real path.
- **Config integrity.** Look for a key that's parsed but never read, and literals at use sites that duplicate a config default (grep the default value). Env read outside the config module is drift. So are production signatures where config is optional and quietly falls back to defaults. Flag limits that disagree across components, such as a retry cap of 3 in one place and 10 in another.
- **Contract surface.** Look for message types one side sends and the other drops, and protocol types redeclared by hand instead of imported from the contract package.

Full checklist: `references/structure-and-wiring.md`.

### Claims audit

Check each claim from §2 against the code at head.

- "Survives a database blip": does a test inject one?
- "CI runs lint": does the workflow run it?
- "<N> tests pass": what did the run actually report?
- "Every metric has an emitter": grep it.
- A commit message describing a small fix on a diff that touches dozens of files.

An unbacked claim about security, data, or the main output is a must-fix, or a blocker when the gap is large. A stale count or doc is a should-fix.

### Security & trust boundaries

- **Injection / XSS / CSRF.**
- **Tenant isolation.** Do operations on tenant-scoped resources apply the org, company or team filter? Can a user in one tenant read or affect another tenant's resources?
- **Lookups scoped to the exact subject.** For example, `select … where parent_id = $1 limit 1`, with no key for the specific child and no `order by`, returns *some* row, like the author of *a* linked item rather than *this* one.
- **Privilege granted for one item, applied to a batch.** Watch for an approval, a maintainer's command or an allowlist hit that gets stamped onto every item in a set.
- **Approvals bound to what the approver saw.** That means the exact version (SHA, revision, etag), re-checked at execution, and invalidated by a later change. An edited or deleted approving event shouldn't re-fire the command.
- **Untrusted parties.** Clients, workers, agents, webhook senders and PR authors must not do any of these:
  - declare the facts used to validate them;
  - move state to a terminal or privileged value;
  - write where checked data is stored;
  - have a marker in content they control treated as identity (check the actor, not the string).
- **Authorization gaps.** Destructive operations need ownership checks. When a new privileged action is added, check that it's on the role allowlist.
- **Pre-auth surface and fail-closed config.** Check payload, connection and handshake limits before authentication. Security settings must not be optional in production. Placeholder secrets (`CHANGE_ME`) must not be accepted. Compares must be constant-time. A kill switch must act as a ceiling and not be overridable from the runtime.
- **Information disclosure.** Error bodies shouldn't leak stack traces or internal URLs. Secrets shouldn't appear in argv, URLs, logs or stored payloads.
- **Atomicity.** Security-critical transitions (OAuth state consumption, lock claims) need to be atomic, not read-then-write.
- **Timeouts and retry safety.** External calls need explicit timeouts. Non-idempotent operations retry only on connection-level errors.
- **Multi-step flow completeness and orphaned state.** Every redirect destination needs a handler, and every temporary token needs a consumer. Early durable state must roll back when a later step fails.
- **Source-of-truth verification.** Check auth against the provider, not proxies like cookie presence. Route protection should verify assurance level and membership.
- **RLS / policy self-recursion.** A `USING` / `WITH CHECK` that queries the table it protects, directly or through a view, throws `42P17` at query time. Fix it with a `SECURITY DEFINER` helper. When a new query touches table T, scan T's *existing* policies too.

Full checklist: `references/trust-boundaries.md`.

### Reliability & the real deployment shape

Ask what happens with two instances, during a rolling deploy, on a crash between two steps, and during a dependency outage:

- **Ownership on broadcasts.** A broadcast (pub/sub, NOTIFY, an event) is handled by every instance. Does each one check that it owns the socket, lease or lock before acting?
- **Module-level state treated as global truth.**
- **Transactions.** Look for network or external calls inside a database transaction, and locks held across network latency. Another case is catching an error inside a transaction the database already aborted. Commit-then-rollback is the same problem.
- **Supervision.** Background loops need supervision: no floating `void loop()`, overlapping `setInterval(async …)` runs need a single-flight guard, and an unguarded `JSON.parse` in an event listener can take the process down.
- **Retries.** Every retry needs a cap, backoff with jitter, a dead state that alerts, and idempotent re-creation of external objects.
- **Pools.** Watch for a connection held from a small pool while the code waits on another from the same pool.
- **Cleanup parity.** Every path that ends a resource (complete, cancel, supersede, expire, crash) must clean up the same way.
- **Serverless state.** Module state, in-memory queues or timers used for durable state are lost between invocations.

Full checklist: `references/reliability.md`.

### Performance

- **In-memory aggregation.** Loading raw rows to compute totals, counts or groupings belongs in the data layer.
- **Duplicate scans.** Several functions fetching the same slice independently.
- **Partial vs. full period comparisons.** An in-progress period compared against a completed one.
- **Sequential fan-out.** N awaited calls in a loop. Use bounded concurrency and hoist invariants.
- **CPU-heavy synchronous work** on a latency-sensitive event loop.

### Consistency

- **Enum / constant alignment** across UI filters, dropdowns, backend writes and validators.
- **Data-source consistency.** Two pages showing the same concept should use the same filters.
- **Backend → frontend contract.** Pagination, sorting and filter metadata should actually be consumed.
- **Redundant event paths.** One logical event shouldn't mutate twice, as when a server broadcast and an optimistic client update both run.
- **Validation consistency** across sibling endpoints, and semantic correctness (hours 0–23).
- **Single source of truth for business rules.** Client and server must enforce identical constraints.
- **Mutual exclusion / co-dependency.** At least one of a group of optional fields must be required.
- **Column-reference drift (schema ↔ code).** Grep the migrations for every column the code names. A missing one is a runtime `42703`. A new column that nothing reads is stranded.

### Structure

- **The composition root stays wiring.** It shouldn't hold domain logic, raw SQL or module-level state.
- **One writer per state.** When a transition table or state machine exists, every state write goes through it. Count the writers.
- **The repo's size and layering limits.** Check file and function length budgets, import cycles, and duplicated helpers.
- **No dependence on a library's private internals** without a recorded exit plan.
- **No dark flags or placeholder jobs** dressed up as features.

Full checklist: `references/structure-and-wiring.md`.

### Tests

Ask one question about every test in the diff: **if the bug this test names came back, would this test fail?** For headline tests, the ones a claim rests on, check it. Reintroduce the bug in a scratch copy, or reason through the exact assertion.

Watch for these:

- assertions that a constraint already guarantees;
- membership checks where legality matters;
- setup that already sets the asserted field;
- loops over possibly-empty sets;
- fakes that match SQL strings;
- "two-process" tests running in one process;
- graceful close standing in for a crash;
- helpers that silently `return` when the database is missing;
- sleep-then-assert-nothing;
- global mutation of shared rows.

Also check that every variant of a new union or kind passes through at least one test.

When the change is reviewed *before* its tests exist by design (e.g. `implement`'s Phase 5), don't flag absent coverage. The caller will say so.

Full checklist: `references/test-quality.md`.

### Infra, deploy and runbooks

When the diff touches IaC, CI/CD, deploy scripts or runbooks, check these:

- **Ordering.** Is a resource applied before the artifact it runs exists?
- **Silent rollbacks.** Does a managed service roll back config while IaC reports success?
- **Permission semantics.** A missing list permission turns 404 into 403, so trace how the consumer reads each response.
- **Positive controls.** Every alarm and metric needs proof that its signal exists. Otherwise an alarm set to "not breaching" sits green forever.
- **Blast radius of shared roots and modules.**
- **Targeted applies** where the repo requires them.
- **Every runbook step names something that exists**, with a verification command.
- **Cross-repo merge order.**

Verify external facts live, with read-only queries, when you can. Examples: `gh api …`, a cloud CLI `describe`, checking that a branch is pushed or an environment exists.

Full checklist: `references/infra-and-ops.md`.

### Documentation and error handling

Docs, comments, README trees and examples that the change made untrue need updating. Process docs (fix plans, investigation notes) should be self-contained. "Findings 1–N" with no titles can't be checked. Failures should be handled, not punted upward without context.

### Blast radius (critical)

The highest-impact bugs are often in the code that **should have changed but didn't**. For every modification:

- What else calls or consumes the changed function, interface or type? Are all callers updated?
- What flows does it take part in: user flows, jobs, event handlers, schedules? Walk the pipeline forward and backward.
- Which error handlers, retry paths and fallbacks carry assumptions from the old happy path?
- What state, references, caches or IDs go stale?
- Which sibling paths handle the same concern, and do all of them apply the change? If one path refreshes tokens, cleans up a lease or checks trust, do all of them?
- **Flag any change whose blast radius wasn't fully traced.**

## 6. Severity

Severity follows **consequence**, not how dramatic the code looks.

| Severity | Meaning |
| --- | --- |
| **blocker** | Must not merge. Includes an exploitable security or trust hole, data loss or corruption, a change that can't deploy or run as written, or one that doesn't do the main thing it claims. It also includes a defect that **fires in the normal production configuration**: the deployed instance count, every rolling deploy, or every run of the main flow. |
| **must-fix** | A real defect on a reachable path, to fix before merge. Includes a bug, a reliability failure that needs an unusual but realistic event (a crash mid-step, a dependency outage), a missing guard, a repeated documented lesson, an unbacked claim about security or data, or a headline test that can't fail. |
| **should-fix** | Real but bounded. Includes hardening with no current exploit path, a standards deviation, structural drift that will cost later, a missing negative test, or stale docs. |
| **nit** | Polish. One line each, grouped. |

**Calibrate before you publish.**

- **Frequency decides the tier.** Ask how often each must-fix fires in the configuration the change will actually run in. "Every deploy" or "every request" moves it up to blocker. "Only if two unlikely things coincide" moves it down to should-fix.
- **Re-check a long must-fix list.** If the list runs past about 15, reconsider each item. A long list hides the few that matter, and authors stop trusting the tiers.
- **When the tier depends on a fact you don't have**, such as the instance count or whether a flag ships on, rate it for the likely answer, say so, and ask the question.

Put questions only the author can answer in their own numbered **Questions** list, separate from findings. Prioritize the questions that would change a finding.

## 7. Finding format

Give each finding an ID by severity: `B1`, `M1`, `S1`, `N1`. IDs let a fix round and a re-review refer to findings exactly. Anywhere outside the review, cite the ID **and** the title together, never a bare number. If the codebase or its spec already uses IDs of the same shape (trigger `M1`, acceptance `S2`), prefix yours with `R-`, as in `R-M1`, so nobody confuses a finding with a spec item.

**One defect per ID.** Each finding names one mechanism with one fix. The exception is a single table finding that lists unwired items or unbacked claims of the same kind. Three defects bundled under one ID become one fix-round task that gets one-third done and marked fixed.

**Every finding earns its place.** Before writing one, ask whether the author would do anything differently for knowing it. If not, drop it. On a large review, merge duplicates aggressively. Group the should-fix list, and keep only the ten or so nits most worth an author's minute. A report with 100 findings gets skimmed, and the blockers drown.

```markdown
**M3. <What is wrong, as one plain sentence.>**
`path/to/file.ts:120-144` (plus other anchors)

<Mechanism: what the code does and why that's wrong. Cite the repo standard it
breaks, if one exists.>

Scenario: <who does what, in which state → what goes wrong, concretely>.

Fix: <the concrete change, and the test that would prove it>.
```

When a should-fix list runs long, group it by area (Security / Reliability / Tests / Structure & docs) and keep each item to one or two sentences plus anchors. Nits are one line each.

### Examples

```markdown
**B1. The export permission check reads the owner of any document in the folder, not the one being exported.**
`src/exports/authorize.ts:31-36`, `src/folders/attach.ts:88`

`select owner_id from documents where folder_id = $1 limit 1` has no filter on the
document being exported and no ordering, and any member can attach a document to a
shared folder. The export then runs with whichever owner the database returns first.

Scenario: a guest attaches their own document to a folder an admin owns; the admin
exports the folder; the guest's document is exported under the admin's permissions,
including fields the guest's role must never see.

Fix: filter the lookup by the document under export, and make folder-wide actions
check each document's own permissions instead of inheriting the caller's. Add a test
where one folder holds documents from two owners with different roles.
```

```markdown
**M2. A whole batch of outbound webhook calls happens inside one database transaction.**
`src/notify/dispatch.ts:40-112`

Each row's HTTP call runs while the batch transaction holds row locks. Any later
error rolls back every `sent` mark, so the next tick re-sends them. Locks are held
across network latency, which blocks every other writer to those rows.

Scenario: the fourth row hits a lock timeout after the first three webhooks were
delivered; rollback; the next tick delivers those three again.

Fix: one short transaction per row (claim → commit → call → record), stop at the
first failure within a sequence, and add a max-attempts dead state.
```

## 8. Workflow

1. **Identify and pin the target** (§1). If it's unclear, ask once.
2. **Gather intent, the contract, the repo's rules, and the claims** (§2).
3. **Run the gates and size the review** (§3): one pass, or parallel dimension and correctness passes.
4. **Re-review first**, if an earlier review exists (§4).
5. **Walk every changed file** through §5, and trace blast radius for every meaningful change.
6. **Merge and verify.** Dedupe, re-verify every blocker and must-fix by hand, and drop what doesn't hold.
7. **Write the report** (§9).

Track progress with this checklist in your working notes, never in the report. The author doesn't need your process, only its results:

```
Review progress:
- [ ] Target identified and pinned (head SHA, base SHA)
- [ ] Intent, contract (spec/plan location), repo rules, and claims gathered
- [ ] Gates run (wiring, hygiene); every lead confirmed or dropped
- [ ] Earlier review scored (re-reviews only)
- [ ] All changed files reviewed (dimension passes: …; correctness passes: …)
- [ ] Wiring checked (new exports → production callers; objective outputs → production path)
- [ ] Claims audited against the code at head
- [ ] Security & trust boundaries swept
- [ ] Reliability swept (instances, transactions, retries, loops, cleanup parity)
- [ ] Tests checked for whether they can fail
- [ ] Infra/runbook checks (if in the diff)
- [ ] Blast radius traced
- [ ] Every blocker / must-fix re-verified by hand
- [ ] Report written
```

## 9. Report

```markdown
## Review: <PR / branch / change, in plain words>

Reviewed at head `<sha>` against `<base>` at `<sha>`. <How: one pass, or N
read-only passes (names)>. <What was re-verified by hand>. <What was not run:
CI, migrations, plan/apply, the e2e suite>.

**Does:**
- <2–4 bullets: what the change actually does, from the code, in plain words>

**Needs attention:**
- <the 2–5 problems that matter most, one or two plain sentences each>

**Verdict: <Approve | Request changes | Comment>.** <One or two sentences: why, and
what has to happen first. Name what is solid underneath, if it is.>

| Severity | Count |
| --- | --- |
| BLOCKER | n |
| MUST-FIX | n |
| SHOULD-FIX | n |
| NIT | n |

### Claims vs the code         (when the change makes claims about itself: claim | where it's made | what the code does — the fastest read for the author)
### Re-review scorecard        (re-reviews only: table by area, then the not-fixed and partial items by ID + title)
### BLOCKER
### MUST-FIX
### SHOULD-FIX                 (grouped by area when long)
### NIT
### KEEP                       (large reviews only: specific patterns, with file:line, the fix round must not break)
### QUESTIONS                  (numbered; the ones that would change a finding first)
### Cross-repo order           (only when the change depends on unmerged or unpushed work elsewhere)
### Shape of the change        (only when the change is too large to review well)
```

- **Shape of the change.** If the diff is too big to review line by line (tens of thousands of lines, late commits rewriting earlier ones, commits whose messages don't match their content), say so. Name which findings should land first because they touch the most files. Propose a split into a stack where each PR is wired, green, and deletes what it doesn't wire.
- **Cross-repo order.** When the change depends on work in other repos, list each dependency and whether it's merged, open, or not pushed at all. Ask for the same merge order to go in every PR body.
- **Zero findings.** Skip the counts table. Lead with a 2–4 sentence summary of what the change does and what was done well, then the verdict. Don't pad the review with empty sections or invented nits.
- **Write for the author, not about your process.** The header may say in one sentence how the review was done ("four read-only passes, blockers re-verified by hand"). Nothing else about the machinery belongs in the report. That means no names of this skill or its reference files, no pass names in finding text, no "per the checklist", and no "downgraded during verification" notes. Each finding stands on the code and the repo's own standards, which are what the author can check.
