# Build rules: write it right the first time

The review side checks for these defects after the fact. This file is the same knowledge pointed the other way: rules for the agent writing the code, so most of these defects never get written.

**How to use it.** The coordinator gives each task the **Always** section, plus the sections for what the task touches. The plan's task table tags each task with what it touches (*Risk* column). Read the sections you're given before you write code, then check your diff against them before you report. A rule that doesn't fit the codebase gets reported back. Don't quietly break it.

When a rule conflicts with the repo's own written conventions (CLAUDE.md, lessons-learned, ADRs), the repo wins. Say so in your report.

## Contents
- Always
- Untrusted input and authorization (`trust`)
- Approvals, versions and replay (`trust`)
- Database and transactions (`data`)
- External calls, retries and idempotency (`external`)
- Background work, timers and multiple instances (`concurrency`)
- State and lifecycles (`state`)
- Caches, time and ordering (`data`, `concurrency`)
- Files, paths and sizes (`trust`)
- Secrets, logs and errors (`trust`)
- Migrations and schema (`migration`)
- Infra, CI and runbooks (`infra`)
- Tests you write (`tests`)
- The self-check before you report

## Always

- **Wire what you write.** Every export you add has a production caller reachable from an entry point, or the plan names the task that wires it. If neither is true, say so in your report. "Exported and tested" is not done.
- **Config lives in the config module.** Read the value from there. Add new keys there and read every key you add. Never re-type a value config owns: no `'30s'` or `500` at the use site. Never read env outside the config module. Production signatures take config as a required parameter, not `config ?? defaults()`.
- **Use the mechanism that exists.** That means the transition table for state, the named gate for guarded actions, and the shared helpers and contract types. Don't build a second one alongside the first. If the existing one doesn't fit, report that.
- **No placeholders in production.** No `TODO`/`FIXME`, no `''`/`[]`/`null` returned to satisfy a type, no always-throwing stub, no exported no-op on a real path.
- **Every reachable state has handling.** Cover errors, empty, permission-denied, and boundaries (0, 1, max, max+1). A `catch` that swallows the error is not handling.
- **Keep the structure.** Domain logic doesn't go in the composition root. Respect the repo's file and function size limits. Moving a big function into its own file doesn't break it up. Don't create import cycles.
- **Stay on the plan.** Work outside your task's scope, even something that obviously needs doing, is reported back, not built. Unplanned "passes" are how a reviewable change turns into an unreviewable one.

## Untrusted input and authorization (`trust`)

Untrusted parties are anything the system didn't write or doesn't control: clients, webhook senders, outside contributors, workers or agents running untrusted code, other tenants.

- **Scope every lookup to the exact subject.** Filter on the full key of the thing being acted on. Never use `where parent = $1 limit 1` to answer "who owns this child". When exactly one row is expected, fail on zero or several.
- **Check each item in a batch on its own.** Privilege granted for one item must not be stamped onto a set. A batch action evaluates each item's own permission or trust.
- **Compute the facts you validate.** Never validate with numbers or flags the untrusted party declared, such as "photos uploaded: 3", "nothing removed", or its own checksum. Derive them from data the server holds.
- **Untrusted input can't end or elevate state.** An untrusted report maps to a retryable or pending state. Only the component that owns the entity moves it to a terminal or privileged state.
- **Identity comes from the actor, not the content.** A marker in a title, body or trailer that anyone can type is not proof the system did something. Check the event's authenticated actor.
- **Recognize your own outputs as inputs** in every credential mode, so the system doesn't react to itself.
- **Build trusted objects from allowlisted fields.** Never spread an incoming object and override a few keys.
- **New privileged action → add it to the role allowlist** in the same change. Tenant scope comes from the authenticated session at the boundary.
- **Fail closed.** A missing secret, origin check or identity provider refuses the request in production, and refuses to boot. Treat placeholder values (`CHANGE_ME`, `changeme`, empty, too short) as unset. Dev bypasses need an explicit switch that production refuses. Don't key them on loopback or `NODE_ENV` alone.
- **A guard that reads a request value denies when the value is missing.** `if (action && ADMIN.includes(action) && !isAdmin)` lets through a request whose route matched with no `action`, such as `/items/42/` with an empty last segment. Attach the check to the route itself, or deny anything that isn't a known value. Then send the empty, trailing-slash and unknown-value requests at it and check each is refused.
- **The kill switch is a ceiling.** The environment value caps whatever the runtime stores. Going live is its own audited, privileged action. Sandbox and dry-run modes touch nothing live, for every verb (create, update, delete).

## Approvals, versions and replay (`trust`)

- **An approval binds to the exact version the approver saw.** That means a SHA, revision or etag, carried in the approval itself. Re-check it at execution. A later change needs a new approval.
- **Commands fire on creation only.** An edited or deleted command must not run again. Deduplicate by the original event id.
- **Stamp "seen at" after the read**, not before it. On replay, use the replay time.
- **Signed requests carry a nonce** remembered for the timestamp window, so they can't be replayed. Compare signatures with `timingSafeEqual` or `hmac.compare_digest`.
- **Pre-auth endpoints set limits before doing work**: max payload, handshake deadline and connection cap. Reject cheaply before any database lookup. Authenticated sessions don't count against the pre-auth cap.

## Database and transactions (`data`)

- **No network calls inside a transaction.** No HTTP, object storage or third-party API. Fetch and upload before it opens, and record results in a short one after.
- **Commit one external effect at a time.** Claim → commit → call → record. Don't wrap a batch of external writes in a single transaction.
- **Enqueue follow-up work in the same transaction** as the state change it follows, using a transactional outbox or a queue that joins the caller's transaction. Check the send's return value, because a rejected or deduplicated send returns nothing.
- **Don't catch errors inside an aborted transaction.** Use `ON CONFLICT DO NOTHING RETURNING`, or a savepoint.
- **Keep the try shape clean.** `begin()` goes inside the try. Never roll back after a successful commit, so put post-commit work in its own try.
- **Lock in one order on every path**, for example child before parent. Lock several rows in one sorted statement.
- **Back invariants with constraints.** Use a unique or partial unique index for "one active X per Y". `max(seq)+1` needs a lock or a unique constraint.
- **Never hold a pooled connection while waiting for another from the same pool.** Run inner queries on the connection that holds the lock, or use transaction-scoped locks.
- **Every pool gets timeouts**: `statement_timeout`, `lock_timeout`, `idle_in_transaction_session_timeout`, and a connection timeout.
- **Push aggregation to the database.** Don't load rows to count or sum them in memory.
- **Every column you name exists in a migration.** Every column you add has a reader.

## External calls, retries and idempotency (`external`)

- **Every external call has an explicit timeout.**
- **Retry only what's safe**: connection-level failures for non-idempotent writes, never server errors.
- **Every retry loop needs four things.**
  - A cap.
  - Backoff with jitter.
  - A terminal failed or dead state that alerts.
  - Attempts spent only on real failures, not on infrastructure hiccups such as a reconnect during delivery. A failure you don't count still needs a bound of its own, such as a maximum age or a separate cap, that ends in the failed state and alerts. With bad credentials or a dead dependency, an uncounted retry otherwise loops forever. If the plan's cap says every failure counts, an exemption is a plan change for the owner to approve.
- **Re-creating after a timeout looks up first.** Find the object by a marker, an external id or a deterministic key, because the first attempt may have succeeded.
- **Stop an ordered sequence at its first failure.** A later step that depends on an earlier one (create, then edit) must not run after the earlier one failed.
- **Poison messages go somewhere replayable**, such as a dead-letter queue or a stored row. Never delete one with only a log line.
- **Derive dedupe keys from content or required fields.** A key built from an optional header collapses every message without the header into one.
- **Make limits agree across components.** The app's retry cap should match the queue's redrive count, and body retention should be at least the dead-letter retention.

## Background work, timers and multiple instances (`concurrency`)

Assume at least two instances, and a rolling deploy where old and new code run side by side.

- **Act on a broadcast only if this instance owns the resource** (socket, lease, lock). Non-owners do nothing. Only the owner or a reaper may release or expire.
- **In-memory registries describe this process only.** Never treat a socket map or local cache as global truth.
- **Supervise every long-running loop.** No floating `void loop()`. Catch, log, back off and restart. Register an `unhandledRejection` handler, or the platform's equivalent.
- **Single-flight every interval.** No `setInterval(async …)` without an in-flight guard. Schedule the next run when the current one finishes.
- **Leader election**: hold the lock on a dedicated connection with keepalive and query timeouts. Run probes single-flight, and close superseded clients.
- **Jitter every reconnect and retry.** A fixed delay after a deploy is a thundering herd.
- **Rows owned by a dead instance get swept**, whether sessions or claims. A crash must not strand them.
- **Keep CPU-heavy synchronous work off a latency-sensitive event loop.** Use a worker thread, or measure it and write the number down.
- **Guard listeners.** `JSON.parse` and friends inside an event listener need a try, or one bad payload kills the process.
- **Health checks report this instance's health**, not "am I the leader". Know what consumes each endpoint.

## State and lifecycles (`state`)

- **One writer per state column**: the transition table. New entities get one too.
- **Every path that ends a resource does the same cleanup**: complete, fail, cancel, supersede, expire, crash, revoke. That means releasing holders, deleting temp data, enqueueing remote cleanup, and telling the process that holds it. Write the cleanup once and call it from every path.
- **Every non-terminal state has an exit**: a timeout, a sweeper, or an alert that repeats. Nothing waits forever.
- **Every gate that closes has a path that reopens it** after a re-run, a retry or a new version.
- **Scope cancel, close and supersede to the item they name.** Closing one item never cancels a sibling's work.
- **Every command works after every other command on the same version.** For example, skip then run, or run then re-run. Write the sequence down and handle it.
- **Options and arguments are honored or rejected**, never accepted and ignored.
- **Allocators respect expiry columns**, so leaked holds come back.

## Caches, time and ordering (`data`, `concurrency`)

- **Every cache has a TTL and a size bound.** Never cache an error or a transient failure as an answer.
- **A cached credential expires with the credential**, not on a fixed timer longer than its life.
- **Pick one clock.** Compare database timestamps with the database clock.
- **Every `order by` on a non-unique column gets a unique tiebreaker.**
- **Prune what grows**: caches, temp directories, mirrors, logs.

## Files, paths and sizes (`trust`)

- **Confine paths by allowlist.** Normalize, then require the result to sit under the permitted root. Apply the same rule wherever the path is used again, not just where it's first checked.
- **Keys and ids from untrusted input sit under the caller's own scope**, checked at every read, not only when a URL is signed.
- **Store checked data where the checked party can't write**, then pin its hash and verify on load.
- **Cap sizes before reading.** Cap declared lengths, check the size before a GET, and stream large bodies.

## Secrets, logs and errors (`trust`)

- **Keep secrets out of argv, URLs, stored payloads, committed files and logs.** Child processes get an explicit env allowlist, not `process.env`.
- **Redact nested keys in logs**: tokens, secrets, cookies, signatures.
- **Error responses carry no stack traces, internal messages or internal URLs.**
- **Revoking an identity rotates the credentials it held.**

## Migrations and schema (`migration`)

- **Fold migrations that haven't shipped yet into one.** Never edit a migration that has been applied anywhere. Write a real `down()`.
- **Add indexes** for predicates on hot paths and nightly jobs, and foreign keys where the code assumes consistency.
- **Backfill existing rows** whenever the change implies new data for them.

## Infra, CI and runbooks (`infra`)

- **Read the repo's lessons-learned and the closest sibling's layout first**, and follow both.
- **Apply nothing before its artifact exists.** For managed services that roll back silently on failure, check the deployment status after every apply.
- **Grant the permissions the consumer's behavior needs.** A missing list permission turns 404 into 403.
- **Every alarm gets a positive control**: a proof that its metric or filter actually matches.
- **Every runbook step references something that exists**, and has a verification command with its expected output.
- **Pin CI actions to SHAs.** Give workflows an explicit `permissions:` block.

## Tests you write (`tests`)

- **A test must be able to fail** for the bug it names. Prove it by breaking the behavior in a scratch copy.
- **Don't write vacuous tests.**
  - Don't assert what a constraint already guarantees.
  - Check a transition's legality, not its membership in a list of states.
  - Assert the count before a loop, so an empty loop can't pass.
  - Assert on the record the bug would produce.
- **Skip loudly, never return silently**, when a service or env var is missing. CI fails in that case.
- **Reproduce the real mechanism**: two OS processes, a real kill, an injected dependency failure.
- **Wait for conditions, never sleep.** Touch only rows the test created. The suite passes run twice in a row.

## The self-check before you report

Run this after the code is written and before you report back. Report each step's result.

1. **Re-read your diff** (`git diff -- <owned files>`) as a reviewer would, top to bottom. Most "how did I miss that" defects are visible on a second read.
2. **Walk every flow your task touches**, from start to finish. Check the happy path, each failure state, each command after each other command, cancel and close scope, cache expiry, and gates reopening. Write one line per flow saying what happens.
3. **Run the gates on your files**:
   `python3 <skill>/scripts/quality_gates.py hygiene --worktree --paths <owned files>` and `wiring --worktree --paths <owned files>`.
   Fix every hit that's real. For each hit you leave, say why it isn't a defect.
4. **Run the narrowest checks that cover your files**: typecheck, lint, and the existing tests for the module. Include the command and its result. If something can't run here (no database, no credentials), say so.
5. **Check acceptance item by item.** For each criterion, give the evidence: a file:line, a test name, or a command output. "Implemented" is not evidence.
6. **Name what you couldn't verify, and what you're unsure about.** A risk you name gets looked at, and a hidden one gets shipped.
