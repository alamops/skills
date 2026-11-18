# Data, concurrency and reliability

The pass for what happens when reality shows up. That means two instances instead of one, a rolling deploy, a crash between two steps, a dependency that's slow or down for fifteen minutes, or a burst of reconnects. Code that's correct in a single-process test can fail at every one of these.

Before reading the code, establish the **deployment shape** from the infra, the compose or task definitions, the plan, or the PR body:

- How many instances run in steady state, and during a deploy?
- Is there a leader?
- Which processes hold long-lived connections?
- What restarts what?

If it isn't written down anywhere, that's a question for the author, and several findings below depend on the answer.

## Contents
- Async interleaving in one process
- Multiple instances and rolling deploys
- Transactions and locks
- Connection pools
- Loops, timers and supervision
- Retries, idempotency and dead ends
- Resource lifecycle and cleanup parity
- Time, ordering and caching
- Schema and migrations
- Health checks and capacity

## Async interleaving in one process

One process with one event loop still has races. Every `await`, callback, timer or promise continuation is a point where other code runs and changes state. Those races don't need a second instance, and single-process tests rarely catch them, because the fake resolves at once and nothing else runs in between. Read each changed async function with this in mind:

- **Check, await, act.** The code reads state (the task's status, a held flag, "is this session still current", the member list), then awaits something slow (a probe, a capture, a network call), then acts on what it read. By then the task may be deleted, the retry already cleared, the session replaced, the stack edited. Re-read the live state after the await, and re-run the guard before each side effect, not only before the last one. A side effect is anything that's hard to take back: a key sent to a terminal, a write, a timer armed, a message sent.
- **An `await` added to a function that used to be synchronous.** Its old check-then-act was atomic because nothing could run between the check and the act. The new `await` splits it, and the callers' assumptions still say "atomic". Treat every newly inserted `await` in an existing function as a review target: list what was read above it and used below it.
- **Out-of-order completion.** Two calls for the same key are in flight (two probes, two fetches, a load and a save), and the older one finishes last and overwrites the newer result in a cache, a store or component state. Fix with a per-key generation counter or request id checked at write-back, or by aborting the older call. Keep in-order writes working.
- **Serialization at the wrong scope.** A queue, mutex or single-flight that lives on one caller (a class instance, a React hook's `useRef`, a closure) serializes only that caller. Two mounts of the same component, two instances of a client, or two routes that share a resource each get their own queue, so their writes interleave and an older write can land last. The queue must be keyed by the resource: a module-level map keyed by the preference, row or session.
- **A load that lands after a newer edit.** A component starts a load on mount, the user changes the value, then the load resolves and overwrites the user's choice with the stored one. Track whether the value changed after the load began, not only whether it changed at all.
- **Rollback to the wrong value.** An optimistic update that fails must restore the last value the server confirmed, not the inverse of the attempted value or the value from before this one attempt. After two quick toggles where only the second fails, "undo the attempt" leaves the UI showing a value that was never stored. Track a confirmed value and advance it only when a write succeeds.
- **Held for the wrong lifetime.** A token, lease, slot or lock is released when one phase ends (the boot wait finishes) while the thing that needs it (the poller) keeps running. Release it where its user exits, and on every exit path: early returns, throws, cancellation. A `try/finally` around the user's whole lifetime is the usual fix. A flag that "most exits set" is not a release on every exit.

## Multiple instances and rolling deploys

- **Ownership on broadcast.** When an event goes to every instance (pub/sub, `NOTIFY`, a fan-out queue), every handler must check that this instance owns the resource before acting. The resource is the socket, the lease, the lock. The classic bug: the instance without the worker's socket finds it missing, decides the delivery failed, and expires the lease, while the owning instance tries to deliver it. Only the owner (or a reaper) may release.
- **In-memory registries treated as global.** Socket maps, timers, caches and "current leader" flags live in one process. Anything that consults them must know they describe *this* instance only.
- **Module-level mutable state.** Timers, abort controllers and health flags at module scope. They're shared by everything in the process, including two "instances" booted in one test process, which hides bugs.
- **Leader election.**
  - Run the probe single-flight: no new probe while one is in flight.
  - Close a superseded client, or its session keeps holding the lock.
  - Set keepalive and query timeouts on the dedicated connection, so a half-open socket can't stall it.
  - Hold the leader lock on a dedicated connection, not a pooled one.
- **Rolling deploys.** For a window, old and new code run side by side. Check whether the message formats, columns and job names are compatible in both directions.
- **Reconnect storms.** A deploy tells every client to reconnect after the same fixed delay, and they all arrive at once. Add jitter. Check what each reconnect costs the server: locks, account setup, database round trips.
- **Rows left behind by a dead instance.** Session, ownership or presence rows from a SIGKILLed instance, or one that blew past the stop timeout. Something must sweep them, or every job routed to the dead owner waits out a timeout and loses an attempt.

## Transactions and locks

- **No network calls inside a database transaction.** That includes HTTP, object storage, identity-provider and third-party APIs. They hold row locks across network latency, which blocks every other writer. A rollback after a successful remote write also orphans remote state. Fetch and upload before the transaction opens, and record the result in a short one after.
- **Batch transactions over external writes.** "Deliver 50 rows in one transaction" means any late error rolls back every `delivered` mark, so the next tick re-sends them. Use one short transaction per external effect: claim, commit, call, record.
- **Continuing past a failed step in an ordered sequence.** If row 1 (create) fails and row 2 (another create, meant to be an edit) proceeds, the create-then-edit pairing breaks. Stop the sequence at the first failure.
- **Errors caught inside an aborted transaction.** In Postgres, once a statement fails, the transaction is aborted. Catching `23505` and carrying on means every later statement fails. Use `ON CONFLICT DO NOTHING RETURNING id`, or a savepoint.
- **Enqueue inside the transaction.** A follow-up job or message sent *after* the state change commits is lost if the process dies in between. Enqueue it in the same transaction, using a transactional outbox or a queue that can join the caller's transaction. Also check the return value of every send: a queue that returns `null` when a singleton or dedupe key rejects the message has silently dropped work.
- **Rollback after commit.** `try { commit(); await queue.delete(); } catch { rollback(); }` calls rollback on a committed runner, which throws. Delete in its own try after the commit. Also, `begin()` placed outside the try leaks the connection on failure.
- **Timeouts at the session level.** Set `statement_timeout`, `lock_timeout` and `idle_in_transaction_session_timeout` on every pool.
- **Lock order.** The same tables must be locked in the same order on every path, for example, child before parent, everywhere. Lock multiple rows in one sorted statement.
- **Sequence numbers.** `select max(seq)+1` with no lock and no unique `(parent, seq)` constraint produces duplicates under concurrency.
- **Library internals.** Writing to a job library's private tables breaks on its next schema change. Two diverging helpers doing it is worse.

## Connection pools

- **Self-deadlock.** Code takes a session-level lock on connection A from a small pool, then runs callback queries through the pool, which need connection B. Four concurrent callers hold all four connections, and each waits for a fifth. Run the inner queries on the lock-holding connection, or use a transaction-scoped lock in one short transaction.
- **Pool size versus database limits.** Instances × pools × size, doubled during a deploy, must fit under the database's connection limit.
- **Missing `connectionTimeoutMillis`**, which lets a starved pool hang callers forever instead of failing fast.

## Loops, timers and supervision

- **Floating promises.** `void pollQueue()` with no `.catch` and no `unhandledRejection` handler. Modern Node exits on an unhandled rejection, so one database blip ends the loop and the process. Supervise long-running loops: catch, log, back off, restart.
- **Overlapping intervals.** `setInterval(async () => …)` fires again while the last run is still going. Under a slow dependency, runs pile up. Add an in-flight guard, or schedule the next run after the current one finishes.
- **Listeners that can throw.** An unguarded `JSON.parse` on a notification payload inside an event listener can crash the process.
- **Blocking work.** CPU-heavy synchronous work (parsing a large codebase, compressing, crypto) on the event loop of a process that also answers heartbeats and runs the leader probe. Move it to a worker thread, or measure it and record the number.
- **Re-entrancy.** A scheduler that starts a full pass on every notification, with no single-flight, on a small pool.

## Retries, idempotency and dead ends

- **Every retry loop needs a cap, backoff with jitter, and a terminal state** (failed or dead) that alerts. "Retries every 5 s forever" hammers the dependency and never reaches a state a human sees.
- **Idempotent re-creation.** After a timeout, the remote side may already have created the object. Before retrying a create, look it up by a marker, an external id or a deterministic key, or you'll post a second comment or create a second check run while the first stays in progress.
- **Dedupe keys from optional input.** A dedupe or idempotency key built from a header that might be missing collapses every message without that header into one key, so the first one wins and the rest are dropped as duplicates. Reject the message, or derive the key from content.
- **Reclaim after timeout.** A "sending" row reclaimed after N seconds is sent twice if the first attempt was slow, not dead. The same lookup-first rule applies.
- **Attempt accounting.** An infrastructure hiccup shouldn't spend a job's attempts, such as an offer that couldn't be delivered because the worker was reconnecting. With a small max-attempts, one reconnect can fail a job. Withdraw it to pending instead. The reverse is a defect too: a failure that gives its attempt back, such as a rate limit or a token-endpoint error, needs its own bound (a maximum age or a separate cap) that ends in the failed state and alerts. Otherwise, with bad credentials, the job retries forever and never alerts.
- **Poison messages.** A message that fails N times and gets deleted with only a log line is data loss. During a long dependency outage, every message in the window is discarded. Use a dead-letter queue or a stored poison row that can be replayed, and know the replay procedure.
- **Stuck states.** Every non-terminal state needs a timeout or a sweeper, plus a re-alert. A failed row that leaves its parent in a sending state with one alert, never retried, is a parent that never finishes.
- **Limits that disagree across components.** A queue that dead-letters after 3 receives while the app's own poison branch triggers at 10 means the app's branch never runs. Message bodies kept for less time than the dead-letter queue keeps their pointers means late replays fail.
- **Worker-initiated terminal states vs server-owned state.** See trust-boundaries.md.

## Resource lifecycle and cleanup parity

- **Cleanup parity.** For every resource (account, lease, lock, temp data, external object), list every path that ends its use: complete, fail, cancel, supersede, expire, crash, revoke. Each path must do the same cleanup: release the holder column, enqueue data cleanup, tell the process holding it. The bug is usually one sibling path. For example, `cancel` cleans up properly, `supersede` was written later and only flips the state, and one account per deploy leaks from the pool forever.
- **Pools that ignore expiry.** An allocator that picks rows `where holder is null` and ignores `expires_at` never reclaims a leaked hold.
- **Computed-then-discarded.** A nightly job computes the orphan list and doesn't act on it.
- **Partial-failure ordering.** If step 2 (seed remote data) succeeds and step 3 (commit the local row) fails, who deletes the remote data?

## Time, ordering and caching

- **Mixed clocks.** Comparing a database-written timestamp with the application's clock. Pick one clock.
- **Ordering without a tiebreaker.** `order by priority, created_at` with no unique tiebreaker, when rows inserted in one statement share `now()`.
- **Caches that never expire.** A cache with no TTL and no size bound, where a key already present is never re-fetched. One transient 502 gets cached as "behind" for the life of the process. Don't cache errors, and give the cache a TTL.
- **A cached "no" on an explicit retry.** A user-initiated action (Start, Retry, Refresh, Reconnect) refuses because a cached answer says the precondition fails: logged out, quota exhausted, offline. The user who just fixed the cause and pressed the button again is refused until the TTL lapses. Background planning may use the cache. A refusal on an explicit user action should refresh first.
- **Stamping time before the read.** See trust-boundaries.md.
- **DST and timezones** in schedules and windows.
- **Unbounded growth.** Caches, temp directories, local mirrors and logs that grow with every job and are never pruned fill the disk on a long-running instance.

## Schema and migrations

- **Follow-up migrations on unreleased schema.** A series of follow-up migrations patching an initial schema that no environment has run yet. Fold them into one before the first deploy. After that, never edit an applied migration.
- **Empty `down()`.** A revert then leaves the tables behind, and the next `up` fails. CI should run down then up, and on a populated database, not only an empty one.
- **Schema checks by migration name only.** These miss an edited migration. Compare a checksum.
- **Missing indexes.** Look for predicates hit on every request or event, columns scanned by nightly deletes, and JSON-field lookups.
- **Missing foreign keys** between parent and child rows the code assumes are consistent.
- **Invariants enforced only in code.** Examples: "one active reservation per slot", or "one open session per device". When two writers can race, the rule needs a unique or partial unique index behind it, so the database refuses the second row.
- **Backfills.** A new non-null column or a new invariant over existing rows needs one.

## Health checks and capacity

- **Know what consumes each health endpoint.** A "deep" check that returns 503 on every non-leader instance gets every follower cycled if the orchestrator uses it.
- **Unmeasured sizing.** CPU and memory sized without measuring the heavy jobs (a dump held in memory, a large parse, git checkouts) on the instance size chosen. Ask for a measurement after the first real run.
