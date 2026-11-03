# Built-in review rubric (Phase 5 fallback)

Paste everything below the line into the review brief when no `code-review` skill is available, or when the reviewer is an external CLI that can't load one. It is self-contained on purpose. After it, add this run's contract: the success criteria with their production paths, the invariants with their enforcement points, the standards Phase 1 found, and the base SHA.

---

You are reviewing the diff `git diff <base>...HEAD` (plus any uncommitted changes). **Read-only: never edit code.** Report problems only — no "looks good" items.

Tests for this change are written in a later step, so **don't flag missing test coverage**. Do flag a test in the diff that can't fail for the bug it names.

For every finding, give:

- a severity: `blocker` / `must-fix` / `should-fix` / `nit`;
- `file:line`;
- the mechanism;
- a **concrete scenario**: who does what, in which state, and what goes wrong;
- a concrete fix.

If you can't build a scenario, list it as a question instead. At the top of your report, state which rubric you used.

Walk every changed file and check each of the following.

**0. Feature logic.** Walk each user flow the change touches from start to finish:
- **Transitions.** Can every state transition actually happen, and can any happen twice?
- **Reach.** Does a cancel, close or supersede reach only what it should?
- **Caches.** Do they expire with the thing they cache?
- **Command sequences.** Does a command still work after another ran on the same version?
- **Gates.** Does every gate that closes reopen?
- **Inputs.** Are options and arguments honored, or accepted and ignored?

**1. Wiring and claims**
- **Production callers.** Every new export, route, job type, message type, config key and metric needs a caller outside its own file, outside barrel re-exports, and outside tests, and that caller must be reachable from a real entry point. Show the grep. Code that only its own tests call is a must-fix.
- **Outputs.** Each success criterion's output (the record, message or call the feature exists to produce) must be created by production code, not only rendered or typed.
- **Production stubs.** Watch for functions that return `''`, `[]` or `null`, that always throw, or no-ops that run on a real path.
- **Config.** Watch for keys that are parsed but never read, and literals at use sites that duplicate a config default. Env read outside the config module is drift. So is an optional config parameter on a production signature that falls back to defaults.
- **Claims.** Check each claim against the code: the plan's ledger, commit messages, docs, test names.

**2. Security and trust boundaries**
- **Scoping.** Tenant scope on every tenant-owned read and write. Lookups scoped to the exact subject: watch for `limit 1` with no full key and no ordering.
- **Batch privilege.** Privilege granted for one item must not be applied to a set.
- **Approvals.** An approval must bind to the exact version the approver saw, be re-checked at execution, and be invalidated by later changes. Edits and deletes of a command must not re-fire it.
- **Untrusted parties** (clients, workers, agents, webhook senders, outside contributors) must not:
  - declare the facts used to validate them;
  - move state to a terminal or privileged value;
  - write where checked data is stored;
  - be identified by a marker in content they control.
- **Paths and sizes.** Path and key confinement by allowlist, with the same rules at load as at check. A size cap must apply before reading untrusted objects.
- **Pre-auth limits.** Payload, handshake deadline and connection cap. Constant-time compares. Replay protection.
- **Fail closed in production.** Missing security config must be refused at boot. Placeholder secrets must be treated as unset. Dev bypasses must not key on loopback or env alone.
- **Authorization.** A new privileged action must be on the role allowlist. A kill switch must be a ceiling the runtime can't override. Sandbox modes must touch nothing live, for any verb.
- **The classics.** Injection, XSS, CSRF, authorization before destructive operations, atomic security transitions (no read-then-write), timeouts on external calls, multi-step flow completeness, orphaned state on failure, and auth checked against the provider rather than a proxy for it. Also check row-level security policies that query their own table.
- **Secrets.** No secrets in argv, URLs, logs or stored payloads. No whole `process.env` passed to child processes.

**3. Reliability under the real deployment shape**
- **Two instances.**
  - Every handler of a broadcast event must check ownership before acting, and non-owners must never release or expire.
  - In-memory and module-level state is per process.
  - Leader probes need to be single-flight.
  - Rows left by a crashed instance need a sweep.
- **Transactions.**
  - No network or external calls inside a database transaction.
  - Locks must not be held across network latency.
  - Use one short transaction per external effect.
  - Don't catch errors inside an aborted transaction.
  - No rollback after commit.
  - Set session timeouts.
- **Connection pools.** Never hold a pooled connection while waiting on another from the same pool.
- **Loops.**
  - No floating promises or unsupervised background loops.
  - `setInterval(async …)` needs an in-flight guard.
  - Guard `JSON.parse` in event listeners.
  - No CPU-heavy synchronous work on a latency-sensitive event loop.
- **Retries.** Each needs a cap, backoff with jitter, and a terminal state that alerts. Re-creating an external object after a timeout must look it up first. Infrastructure hiccups must not spend a job's attempts, but an uncounted failure still needs its own bound that ends in the failed state and alerts. Poison messages must not be deleted with only a log line. Every non-terminal state needs a timeout or sweeper. Limits must agree across components.
- **Cleanup parity.** Every path that ends a resource (complete, cancel, supersede, expire, crash, revoke) does the same cleanup.
- **Clocks and caches.** Pick one clock (database or app). Orderings need a unique tiebreaker. Caches need a TTL and must not cache errors.

**4. Data and schema**
- **Columns.** Every column the code names must exist in the migrations, and every new column must have a reader.
- **Migrations.** Backfill existing rows when the change implies it. Don't edit migrations that have already been applied. Keep `down()` real. Add indexes for hot predicates and foreign keys where the code assumes consistency.
- **Sequences.** `max+1` sequences need a lock or a unique constraint.

**5. Performance**
- In-memory aggregation that belongs in the data layer.
- Sequential fan-out that should run in parallel with a bound.
- Duplicate scans of the same data.
- Partial-period comparisons against full periods.

**6. Consistency and structure**
- **Drift.** Enums and constants must line up across UI, API and validators. Validation must be consistent across sibling endpoints. A business rule should live in one place. The backend-to-frontend contract must be consumed. One event should trigger exactly one mutation.
- **The composition root stays wiring.** No domain logic, raw SQL or module-level state there.
- **One writer per state.** When a transition table exists, all state writes go through it.
- **Size and layering.** Respect the repo's file and function size limits. No import cycles. No duplicated helpers. Types are imported from the contract package, not redeclared. No reliance on a library's private internals without a recorded exit plan.
- **Repo standards.** Flag any of the repo's written lessons, checklists or conventions (listed below) that the change repeats or violates, and cite the file and line.

**7. Blast radius and completeness**
- **Changed interfaces.** Every caller of a changed function, type or interface must be updated.
- **Sibling paths.** Paths that handle the same concern must all apply the change.
- **Old assumptions.** Error handlers and retries can carry assumptions from the old happy path. Check for state, caches and IDs that go stale.
- **Shape changes.** A change of shape must propagate through types, validation, serializers, contracts, fixtures and generated code.
- **States.** Every state the new code can reach (error, empty, permission-denied, boundary) needs handling.
- **Leftovers.** Look for orphaned dead code, docs and comments the change made untrue, and new `TODO`/`FIXME`/`XXX`/`HACK` markers or placeholder throws.

**8. Infra, CI and runbooks** (only if they're in the diff)
- **Ordering.** Is anything applied before its artifact exists? Does a managed service roll back config silently?
- **Permission semantics.** A missing list permission turns 404 into 403. Check how the consumer reads each response.
- **Positive controls.** Every alarm and metric needs proof it's emitted.
- **Prod applies.** Use targeted applies wherever the repo requires them.
- **Runbooks.** Every step references something that exists and has a verification command.
- **CI.** Pin actions to SHAs and set an explicit `permissions:` block.
- **Cross-repo order.** Spell out the merge and apply order.

End with: counts by severity, the verdict (approve / request changes / comment), and a numbered list of questions only the author can answer.
