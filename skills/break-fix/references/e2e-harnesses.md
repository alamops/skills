# E2e harnesses — detect, drive, and write the regression test

Two jobs this file supports: **driving** the app during the hunt (Phase 1–2) and
**writing the regression test** in the project's own idiom (Phase 5).

Keep them separate in your head. You may explore with a browser-automation tool
and still write the test in Playwright, because the test has to run in CI without
you. Exploration is disposable; the test is the deliverable.

## Contents

- [Detecting what's already there](#detecting-whats-already-there)
- [Playwright](#playwright)
- [Cypress](#cypress)
- [Detox / mobile](#detox--mobile)
- [Puppeteer](#puppeteer)
- [API-level e2e (supertest & friends)](#api-level-e2e-supertest--friends)
- [When there is no harness](#when-there-is-no-harness)
- [Driving the app for exploration](#driving-the-app-for-exploration)
- [Determinism rules that apply everywhere](#determinism-rules-that-apply-everywhere)

## Detecting what's already there

Look for these before anything else — the answer decides where Phase 5's test goes:

| Cue | Framework |
| --- | --- |
| `playwright.config.{ts,js}`, `@playwright/test` dep, `e2e/` or `tests/` with `*.spec.ts` | Playwright |
| `cypress.config.{ts,js}`, `cypress/` dir, `cypress/e2e/*.cy.ts` | Cypress |
| `.detoxrc.js`, `detox` dep, `e2e/*.e2e.js` | Detox (React Native) |
| `puppeteer` dep with a `jest-puppeteer` preset or a custom runner | Puppeteer |
| `supertest`/`httpx`/`requests` against a booted server in `tests/integration` | API-level e2e |
| `maestro/` with `*.yaml` flows | Maestro (mobile) |
| `wdio.conf.js` | WebdriverIO |

Then read, in this order, because these are what make a new test fit in:

1. **The run command** — `package.json` scripts (`test:e2e`, `e2e`), `Makefile`, CI workflow. The CI workflow is the most reliable source: it shows the *complete* recipe including services and env vars.
2. **One existing test, end to end.** Its selector convention (`data-testid`? roles? text?), how it authenticates, how it seeds data, what it asserts on.
3. **Fixtures / setup files** — `global-setup`, `beforeEach` hooks, custom commands, factories, `storageState` files. Reuse these instead of writing your own login flow.
4. **How the app is started for tests** — `webServer` in the Playwright config, a compose file, a CI service block.

## Playwright

**Run:** `npx playwright test`, single file `npx playwright test e2e/foo.spec.ts`,
one test `-g "name"`, headed `--headed`, debug `--debug`, one worker `--workers=1`.
Install browsers first if missing: `npx playwright install --with-deps`.

**Artifacts:** `--trace on` (then `npx playwright show-trace`), `--reporter=list`
for readable CI output. On a failure you're investigating, the trace is the
fastest path to the cause — it carries DOM snapshots, console, and network.

**Regression test shape:**

```ts
test('checkout does not create duplicate orders on double-submit', async ({ page, request }) => {
  const before = await countOrders(request);           // seeded, known state
  await page.goto('/checkout');
  await Promise.all([                                   // two real clicks, no sleep
    page.getByRole('button', { name: 'Place order' }).click(),
    page.getByRole('button', { name: 'Place order' }).click(),
  ]);
  await expect(page.getByText('Order confirmed')).toBeVisible();
  expect(await countOrders(request)).toBe(before + 1);  // asserts the bug, not the feature
});
```

**Attack tooling worth knowing:**

- `page.route('**/api/orders', r => r.fulfill({ status: 500 }))` — force server errors.
- `page.route(url, async r => { await new Promise(res => setTimeout(res, 5000)); r.continue(); })` — force slowness.
- `context.setOffline(true)` — the commuter persona.
- `page.on('console', ...)` and `page.on('pageerror', ...)` — **assert the absence of console errors**; this catches invisible bugs and is worth adding to any regression test whose bug manifested there.
- `browser.newContext()` twice — two independent sessions for cross-account and two-tab attacks.
- `context.addCookies` / `storageState` — start a test already authenticated as a specific account.

## Cypress

**Run:** `npx cypress run` (headless), `--spec cypress/e2e/foo.cy.ts`, `npx cypress open` for interactive exploration — which doubles as an excellent hunting tool since it shows every command and its DOM snapshot.

**Regression test shape:**

```ts
it('rejects a 12KB display name instead of 500ing', () => {
  cy.login('user-a');                          // project's own custom command
  cy.visit('/settings/profile');
  cy.get('[data-testid=display-name]').invoke('val', 'x'.repeat(12000)).trigger('input');
  cy.get('[data-testid=save]').click();
  cy.contains('Name must be 100 characters or fewer').should('be.visible');
  cy.request({ url: '/api/me', failOnStatusCode: false }).its('status').should('eq', 200);
});
```

**Attack tooling:** `cy.intercept` (stub statuses, delay with `delay`, `forceNetworkError`), `cy.clock()` for time control, `cy.viewport(360, 640)`.

**Constraint to plan around:** Cypress runs in one browser tab, one origin per test. Two-tab and cross-origin attacks need `cy.origin`, a second `cy.request`-driven session, or a different tool. If a bug is fundamentally multi-tab, drive the *test* through two request-level sessions and keep the UI half single-tab.

## Detox / mobile

**Run:** `detox build -c ios.sim.debug` then `detox test -c ios.sim.debug`. Builds are slow — build once, iterate on `detox test`.

Selectors are `by.id(...)` (matching `testID` props). If the element you need has no `testID`, add one as part of the fix — that's legitimate, not scope creep.

Mobile-specific attacks worth adding to the hunt: backgrounding mid-request (`device.sendToHome()` then `device.launchApp({newInstance: false})`), rotation, permission denial (`device.launchApp({permissions: {notifications: 'NO'}})`), and deep links into a screen that assumes a navigation stack (`device.openURL`).

## Puppeteer

Usually wired into Jest. Run through the project's test command rather than
directly. API is close enough to Playwright's to translate: `page.setRequestInterception(true)`
for stubbing, `page.setOfflineMode(true)`, `page.on('pageerror')`.

If the project is on bare Puppeteer and you have latitude, note in the report that
Playwright's tracing would make this class of bug much cheaper to diagnose — but
don't migrate the harness as part of a bug fix.

## API-level e2e (supertest & friends)

When the bug is server-side and the project's "e2e" layer is HTTP-against-a-real-server,
that's the right home for the test — it's faster and less flaky than a browser test
and it still exercises the real stack.

```ts
it('rejects a negative quantity instead of crediting the account', async () => {
  const res = await request(app)
    .post('/api/cart/items')
    .set('Authorization', tokenFor(userA))
    .send({ productId, quantity: -5 });
  expect(res.status).toBe(400);
  const cart = await request(app).get('/api/cart').set('Authorization', tokenFor(userA));
  expect(cart.body.total).toBe(0);              // the actual damage, not just the status
});
```

Cross-account checks (§4 of the playbook) are especially well suited to this
layer — two tokens, one resource ID, assert 403/404.

## When there is no harness

Don't stand up a heavyweight framework as a side effect of a bug fix. Do this instead:

1. **Say so in the Phase 3 check-in**, with the recommendation and roughly what it costs. Adding an e2e harness is a project decision.
2. **If the user agrees**, add the minimal ecosystem-standard setup scoped to the bugs you found: Playwright for a web app (`npm init playwright@latest`, one config with `webServer` so the suite boots the app itself), supertest for an API, Detox for React Native. One config, one spec directory, one `test:e2e` script, wired into CI if CI exists.
3. **If they decline or it's out of scope**, still write the regression test at the cheapest layer that can actually catch the bug — an integration test against the handler, or a unit test on the guard you added — and say plainly in the report that e2e coverage of the flow is still missing. A lower-layer test is a real guard; no test is not.

Never leave a fixed bug with no test at all. The test is the point.

## Driving the app for exploration

For the hunt itself (not the test), pick by what the attack needs:

- **The project's own harness in headed/interactive mode** — Playwright `--headed --debug`, `cypress open`. Best default: the selectors and login you learn transfer directly into Phase 5.
- **A browser-automation tool** (e.g. a Chrome MCP) — best for the messy, human attacks: real double-clicks, browser Back/Forward, two tabs, devtools console and network inspection, editing hidden fields live. Watch for dialogs (`alert`/`confirm`) that block automation, and prefer reading console output over triggering them.
- **cURL / an HTTP client** — for everything in playbook §11. Fastest way to test cross-account access and mass assignment; copy a request from devtools as cURL and mutate it.
- **A throwaway script** — for concurrency attacks that need genuinely simultaneous requests (`Promise.all` over 5 identical POSTs). Keep it in the scratchpad, not the repo.

Always tail the server log alongside whichever you use.

## Determinism rules that apply everywhere

A flaky regression test is worse than no test: it gets marked skip within a
month and the bug returns unguarded. These rules are what keep it trustworthy:

- **Wait on conditions, never on time.** `expect(...).toBeVisible()`, `waitForResponse`, `cy.intercept` + `cy.wait('@alias')`. A `sleep(2000)` passes on your machine and fails in CI. The one exception is a timer used to *schedule an interleaving* rather than to wait for something — in a race test, offsetting the second request by 15ms **is** the attack. That's legitimate, because if the machine is slow enough that the operations no longer overlap the test simply stops detecting the bug; it can under-detect, never flake red. Say which of the two you're doing in a comment, since they look identical.
- **Own your data.** Create what the test needs (via API or factory, which is faster and less flaky than through the UI) and clean it up. Don't depend on a record another test might delete.
- **Unique values per run.** Suffix emails and names with a run-unique token so a re-run doesn't collide with the last run's leftovers.
- **Independent tests.** No ordering dependencies, no shared mutable fixtures. If the suite runs in parallel, two tests touching the same account will race — give them separate ones.
- **Assert the damage, not just the surface.** The double-submit test asserts the *order count*, not just that a success message appeared. Assert what the bug actually broke.
- **Prove it's red for the right reason.** Run the new test against the unfixed code and read the failure. A test that fails on a bad selector looks identical in CI to one that caught the bug — and guards nothing once the selector is fixed.
