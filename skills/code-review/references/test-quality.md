# Test quality

One question for every test in the diff: **if the bug this test names came back, would the test fail?** A green suite is evidence only to the extent its tests can go red. A test that can't fail is worse than none, because it gets cited as proof.

For headline tests (the ones a PR claim or a fix rests on), check it directly. Reintroduce the bug in a scratch copy and run the test. Where you can't run it, trace the assertion by hand against the bug.

## Contents
- Tests that cannot fail
- Tests that pass without running
- Tests that check the wrong mechanism
- Coverage gaps worth flagging
- Flaky by construction
- Isolation and hygiene
- Regression tests from a fix round

## Tests that cannot fail

| Pattern | Example | Fix |
| --- | --- | --- |
| Asserts something already guaranteed elsewhere | "No duplicate `(order_id, line_no)` rows" when a unique index already forbids them | Assert the behavior the index doesn't cover |
| Membership instead of legality | Every state is in the set of known states, so CLOSED → OPEN passes | Assert each transition is legal per the transition table, and that the expected terminal state is reached |
| Setup already produces the asserted value | "Ping updates `last_seen_at`", but login already set it | Clear or backdate the field first, or assert it changed past a captured value |
| Loop over a possibly-empty set | `for (const run of runs) expect(…)` passes when no run was created | Assert the count (or `> 0`) before the loop. Use `expect.assertions(n)` |
| Constructed so the failure can't happen | "Sends once after injected failures", when the fake fails every call exactly once, so each item is sent twice by construction and a third send never happens | Make the adapter count calls, and assert exactly one *successful* external effect per row under the failure |
| Asserts the wrong subject | Checks that the earlier committed row still exists, instead of checking the failing delivery left *no* row | Assert on the record the bug would have produced |
| Too-loose matcher | `/^relay-/` matches both instances' ids | Assert the specific id |
| Asserts on source text | Greps a source file for a string | Test behavior through the public surface |
| Tests a fake | A fake DB that substring-matches SQL text and returns canned rows, with assertions on the SQL string. "Releases the reservation when setup fails" passes even if the UPDATE targets the wrong row | Run against the real database when CI has one, and assert on rows |
| No-op collaborators | The property test passes `schedule: () => {}`, so nothing it claims to explore ever runs | Use the real scheduler, or a recording one, and assert what it did |

## Tests that pass without running

- **Silent guards.** A helper like `useDatabase(fn) { if (!process.env.DATABASE_URL) return; … }`. Misspell the variable and every database test passes in 0 ms. Count how many tests go through such guards. Fix: skip loudly (`it.skipIf`, `ctx.skip()`), and add a global setup that **throws under CI** when a required service is unreachable.
- **Reading the results.** Check the skip count in the CI output. A layer whose tests all finish in about 0 ms didn't run. A test count that dropped against the base branch means something stopped loading.
- **Test the guard itself.** A test should show that `CI=true` with no database throws, and that a local run reports the database tests as skipped rather than passed.

## Tests that check the wrong mechanism

The test's title names a failure mode. The test must create that failure mode, not something gentler:

- **"Two processes" in one process.** Two app instances in one Node process share module-level timers, abort controllers and health state. That hides exactly the bugs a two-process test exists for. Use two OS processes.
- **Graceful close instead of a crash.** "Takeover" after `close()` tests a clean handoff. Kill with SIGKILL, then assert on the lock holder's changed pid, or the equivalent.
- **"Survives restart" without a restart.** Inserting a row by hand, closing, and reading the row back never reboots anything.
- **A probe instead of the real path.** A two-instance test that sends only a probe message never reaches the delivery path where the multi-instance bug lives.
- **Hand-passed props.** A UI test passes a CSRF token by hand, so it can't prove the app threads the session token through. Render from the app root, or the nearest real provider.

## Coverage gaps worth flagging

Flag these as findings when the code under review needs them. Don't flag absent tests when the caller said tests come later.

- **Every variant passes through.** Every member of a new union, enum or `kind` passes through the code that renders or handles it in at least one test. A union where most variants never pass through the renderer is how a malformed request ships.
- **The assembled flow.** The feature's main output is produced through the composition root, from the real entry point, not by calling the module function directly. Unit tests on unwired functions are why unwired functions look done.
- **Negative paths at trust boundaries.** Cover each of these:
  - a bad signature through the real handler;
  - a missing header;
  - a timestamp outside the window, in both directions;
  - malformed JSON (which often throws a 500 and makes the sender retry);
  - replay;
  - an oversize body;
  - the wrong owner;
  - a revoked identity;
  - an expired, reused or raced token.
- **Adapters beyond 200.** Cover 4xx, 5xx, timeouts and malformed bodies, with outside network disabled (`nock.disableNetConnect()` or the framework's equivalent) so a missing mock fails instead of calling the internet.
- **Failure-path regressions.** "Polls survive a blip" claims need a test that injects the blip.
- **Read scope.** A world-loading or query-scope function that decides which rows a trigger reads gets a table-driven test per event type, pinning the rows read.

## Flaky by construction

- **Sleep, then assert that nothing happened.** Under load, the sleep passes without proving anything. Wait for a positive signal instead: a row, a notification, a log line, an emitted event. Then assert the absence.
- **Wall-clock bounds** (`expect(elapsed).toBeLessThan(550)`). They flake under CI load. Assert ordering or counts instead.
- **Real multi-second sleeps.** Use fake timers, or wait on the condition.
- **Shared fixed records.** Generate unique values per run.

## Isolation and hygiene

- **Global mutations.** `update devices set enabled = false` or `update tasks set status = 'void' where status = 'open'` touches every row in whatever database the test points at, including a developer's. Scope each mutation to rows the test inserted.
- **No cleanup.** Tests that commit and never clean up make local reruns order-dependent. The suite should pass when run twice in a row.
- **Truncation under parallel tests.** One file truncating tables while parallel files run against the same database.
- **Leaked resources.** Queues, temp directories or listeners left behind between runs. Removing the test framework's own `uncaughtException` listener is one example.
- **A test-only parser for a lint rule.** A hand-written lexer in a test file, doing what an existing lint rule (`import/no-cycle`, `no-restricted-syntax`) would do with no maintenance.

## Regression tests from a fix round

- **Red for the bug.** A regression test must have been observed failing at the pre-fix commit *on its assertion*. Failing because it imports a module, calls a route or uses a helper that only exists after the fix proves nothing about the bug. When the fix changed the API, the test should drive behavior that exists before and after (the public endpoint, the observable row). Otherwise the author should show the red run with a minimal shim.
- **A named fix asserts the named failure.** If a finding was "cancelling a pending booking leaks the reserved seat," the test cancels a pending booking, then asserts the seat is free *and* that cleanup was enqueued.
