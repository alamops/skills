# Attack playbook

Concrete attacks organized by surface. Read the section for whatever you're about
to attack, pick the entries that match what the code assumes, and go.

This is a menu, not a checklist — running all of it against every field wastes
the hunt. The highest-yield attacks are the ones you chose *because you saw the
assumption in the code*. Use the generic sweeps below to cover surfaces you
haven't read.

For every attack, the question is the same: **did anything break that the user
can't see?** Console, network, server log, and the stored data are where the
answer usually is.

## Contents

- [1. Text inputs & forms](#1-text-inputs--forms)
- [2. Numbers, dates & selects](#2-numbers-dates--selects)
- [3. Navigation & flow state](#3-navigation--flow-state)
- [4. Auth, session & authorization](#4-auth-session--authorization)
- [5. Concurrency & timing](#5-concurrency--timing)
- [6. Lists, search, filters & pagination](#6-lists-search-filters--pagination)
- [7. File uploads](#7-file-uploads)
- [8. Network failure & latency](#8-network-failure--latency)
- [9. Time, timezone & locale](#9-time-timezone--locale)
- [10. Rendering, layout & input devices](#10-rendering-layout--input-devices)
- [11. Direct API attacks](#11-direct-api-attacks)
- [12. Money, quantities & totals](#12-money-quantities--totals)
- [13. Reading the signals](#13-reading-the-signals)

---

## 1. Text inputs & forms

**The payload set.** Paste these into any free-text field. Each targets a
different layer, so a field that survives one may die on the next:

| Payload | What it probes |
| --- | --- |
| `` (empty) and `   ` (spaces only) | Required-field checks that test truthiness but not trimming — `"   "` passes `if (name)` and stores a blank record |
| 12,000 chars of Lorem | Missing max-length; DB column overflow (`value too long for type character varying(255)`); layout blowout |
| `O'Brien "The Boss" <O'Brien>` | Quote/escape handling through the whole stack |
| `<script>alert(1)</script>` and `<img src=x onerror=alert(1)>` | Output escaping. **You're testing that it renders as inert text** — if it executes, that's a critical finding to report, not to develop further |
| `'; DROP TABLE users;--` and `1 OR 1=1` | Parameterization. A 500 with a SQL error is the finding |
| `{{7*7}}`, `${7*7}`, `<%= 7*7 %>` | Template injection — `49` on screen is the tell |
| `=1+1` and `+1234567890` | CSV/spreadsheet formula injection in any exported view |
| `../../etc/passwd` | Path handling anywhere the value becomes a filename |
| `🙂🙂🙂` alone, and `👨‍👩‍👧‍👦` | Emoji-only "names"; multi-codepoint graphemes breaking length counts and DB collation (`utf8` vs `utf8mb4`) |
| `مرحبا شكرا لك` (RTL), `日本語テスト`, `Ω≈ç√∫` | Direction, CJK width, non-Latin sorting |
| `é` vs `é` | Combining marks — equal-looking values that don't compare equal, breaking dedupe and uniqueness |
| `a​b` (zero-width space) | Invisible characters passing "non-empty" and breaking search |
| `test\nline2\r\nline3` | Newlines in single-line fields; header injection if it reaches an email/HTTP header |
| `admin@example.com ` (trailing space) | Email normalization — creates a duplicate account that can't log in |
| `NaN`, `null`, `undefined`, `true`, `[object Object]` | Literal strings the code may coerce or special-case |
| 40-char single word, no spaces | Word-wrap and overflow in tables and cards |

**Form-level attacks:**

- **Submit empty.** Then submit with exactly one field filled. Then fill everything and clear one field before submitting.
- **Submit twice fast.** Double-click, or Enter twice. Check the network tab for two requests and the data for two records. This is the single highest-yield attack in the whole playbook.
- **Submit while a field is still validating** (async uniqueness checks, address lookups).
- **Bypass the client.** Disable the field in devtools (`removeAttribute('disabled')`, `removeAttribute('maxlength')`, change `type=number` to `text`) and submit. Client-only validation is extremely common; the server should still reject.
- **Change a hidden field** — `userId`, `price`, `role`, `orderId` — before submitting.
- **Autofill / paste everything at once** rather than typing. Frameworks that listen only to `keydown` miss paste and autofill entirely, so state silently diverges from the DOM.
- **Leave and come back.** Fill half the form, navigate away, come back. Is stale state restored? Is it restored *incorrectly* (values from a different record)?
- **Edit then cancel.** Does the cancelled edit leak into the next open? Into another record?
- **Trigger the error, then fix it.** Submit invalid, get the error, correct the field, submit again — error messages that never clear, or state that stays disabled, are common here.

## 2. Numbers, dates & selects

**Numeric fields:** `0`, `-1`, `-0`, `0.1 + 0.2` territory (`0.30000000000000004`), `999999999999999999999`, `1e309` (→ `Infinity`), `NaN`, `0x10`, `1,000` (comma), `1 000` (space), `1.000,50` (EU format), `١٢٣` (Arabic-Indic digits), a leading `+`, and 20 decimal places. Watch for values that round to `0` and then divide, or that silently truncate.

**Date fields:** `1900-01-01`, `2999-12-31`, `0000-00-00`, `2024-02-30`, `2023-02-29` (non-leap), `31/12/2024` vs `12/31/2024`, a date range where end precedes start, start == end, and a range spanning a DST transition. Also: birthdates in the future, expiry dates in the past, and a "last 30 days" filter run at 00:00 local.

**Selects, radios, checkboxes:** submit with none selected; inject an option value that isn't in the list (devtools) and submit; select an option, then change a dependent field that should have invalidated it. Check whether the *displayed* label and the *submitted* value agree after a dynamic reload.

## 3. Navigation & flow state

- **Deep-link into the middle.** Copy the URL of step 3 in a wizard, open it in a clean session. Expect a redirect to step 1 — not a crash on missing state.
- **Back button as undo.** Complete an action, hit Back, hit Forward. Then Back mid-submit, mid-upload, mid-payment. Then resubmit the form the browser restored.
- **Refresh everywhere.** After submit (does it re-POST?), during a redirect, on a modal (does the modal survive? should it?), on a paginated list at page 7.
- **Bookmark a transient state.** Modal open, filter applied, item selected — reopen it later. Does the app rebuild that state or show a broken shell?
- **Navigate away mid-request.** Start a slow save, immediately click to another route. Look for `setState on unmounted component`, and check whether the save actually landed.
- **Browser Back after logout.** Cached authenticated pages should not render user data, and any action on them must fail cleanly rather than 500.
- **Nonexistent and malformed routes.** `/orders/999999999`, `/orders/abc`, `/orders/null`, `/orders/../admin`, a valid-shaped ID belonging to nobody, trailing slashes, double slashes, and a URL-encoded `%00`.
- **Nested modals and drawers.** Open one from another, close with Escape, with the backdrop, with the browser Back button. Focus traps, scroll locks that never release, and z-index stacking all break here.

## 4. Auth, session & authorization

Use **two accounts you own** (A and B) and, if roles exist, one account per role.

- **Cross-account read.** Log in as A, note a resource ID, log in as B, request A's resource by ID directly (URL and API). Expect 403/404, not the record. This is the highest-severity bug class in the playbook — check every resource type, not just one.
- **Cross-account write.** Same, but PATCH/DELETE. Ownership checks are frequently present on read and missing on write.
- **Cross-tenant.** If the app has orgs/teams/workspaces, repeat both with accounts in different tenants, and check list endpoints for leakage as well as by-ID fetches.
- **Privilege escalation.** As a low-role user, request an admin route directly. Then try the admin *API* endpoint — route guards in the UI often have no server-side counterpart.
- **Role change mid-session.** Downgrade B's role while B is logged in and clicking. Do their existing tabs still get admin data until they re-login?
- **Session expiry.** Let the session expire (or delete the cookie) with the app open, then click something. Expect a clean redirect to login, not a wall of 401 errors, an infinite redirect loop, or a silent no-op.
- **Logout completeness.** Log out, hit Back, use the API with the old token. Old sessions should be dead. Then: change the password in one tab and check whether the other tab's session survives.
- **Concurrent sessions.** Same account in two browsers; log out of one.
- **Login edge cases.** Correct email with wrong case; email with a trailing space; already-logged-in user opening `/login`; password reset link used twice; reset link used after the password was changed by other means; sign-up with an email that already exists (does the message reveal that the account exists?).
- **OAuth/SSO detours.** Start the flow, hit Back at the provider, cancel at the consent screen, complete it in a different tab than the one that started it. Any redirect destination without a handler is a hard failure.

## 5. Concurrency & timing

Races produce the intermittent bugs that are the hardest to find and the most
worth finding.

- **Double-submit** (again — it belongs in both sections): two clicks, two Enters, two API calls fired together. Does it create two records, double-charge, or double-decrement?
- **Two tabs, one record.** Open the same edit form in both, change different fields, save both. Last-write-wins that silently discards the other tab's field is a data-loss bug. Then: delete the record in tab 1, save it in tab 2.
- **Rapid toggles.** Click a like/follow/enable switch five times fast. Does the final server state match the final UI state? Optimistic updates that don't reconcile show up here.
- **Interleaved dependent actions.** Add to cart while the cart is refreshing; apply a filter while the previous filter's results are in flight; type fast in a search box (does response N-1 land after N and overwrite it?).
- **Out-of-order responses.** Throttle the network and fire two requests where the first is slower. Whichever renders last wins — if there's no request-sequence guard, the UI shows stale data.
- **Delete while in use.** Delete a record from a list while its detail modal is open; delete a parent while creating a child.
- **Simultaneous claim.** Two accounts claiming the last item in stock, the same username, the same appointment slot. Uniqueness enforced only by a pre-check `SELECT` fails here; only a DB constraint or a transaction holds.

## 6. Lists, search, filters & pagination

- **Empty state.** Zero results from a filter, zero records for a new account, a search with no matches. Expect a message, not a blank page or a crash on `data[0]`.
- **Exactly one, and exactly page-size.** Off-by-one in pagination shows up at exactly the boundary (20 items with page size 20 — is there a phantom page 2?).
- **Large N.** 10k rows: does it paginate, or load everything and freeze the tab?
- **Page params.** `?page=0`, `?page=-1`, `?page=99999`, `?page=abc`, `?page=1.5`, `?limit=100000`. A huge `limit` that the server honors is both a perf bug and, often, a data-leak vector.
- **Filter combinations.** Mutually exclusive filters; a filter plus a search that can't co-occur; applying a filter on page 7 (does it stay on page 7 of a 2-page result?); clearing filters (is the count restored?).
- **Sort edge cases.** Sort by a column that's null for some rows; sort by name with mixed case and accents; sort, then paginate — is the order stable across pages, or do records appear twice/never with a non-deterministic tiebreak?
- **Stale list after mutation.** Create, edit, or delete an item and check the list without refreshing. Then check counts, badges, and totals — they're frequently cached separately from the rows.
- **Search injection-adjacent input.** `%`, `_`, `*`, `\`, and an unbalanced `(` in a search box that builds a LIKE or regex.

## 7. File uploads

- Wrong extension, and the right extension with the wrong content (a `.txt` renamed `.jpg` — server-side type detection or just trusting the name?).
- A 0-byte file; a file at exactly the limit; one over it (client-side vs server-side rejection).
- A filename with spaces, unicode, emoji, `../`, 255 characters, or no extension at all.
- Two files with the same name in a row — overwrite, collision, or silent loss?
- Cancel mid-upload; navigate away mid-upload; upload with the network killed halfway.
- Upload, then delete the record — is the blob orphaned?
- A corrupt image, a 20,000×20,000-pixel image, a zip bomb (don't extract it — check that the app refuses).

## 8. Network failure & latency

Use devtools throttling and offline mode, or the e2e framework's request
interception (Playwright `page.route`, Cypress `cy.intercept`) to force outcomes:

- **Offline mid-action.** Go offline, submit. Expect an error the user can act on and a retry path, not a permanent spinner or a silent drop.
- **500 from one endpoint.** Intercept and force a 500 on each significant call in turn. Does the UI surface it? Does it leave state half-updated?
- **Timeout / hang.** Never resolve a request. Is there a timeout at all, or does the button stay disabled forever?
- **Slow 3G.** Run a whole flow. Double-submits, missing loading states, and layout jumps that make the user click the wrong thing all appear here and nowhere else.
- **Malformed response.** Return `{}`, `null`, an empty array where an object is expected, or a 200 with an HTML error page. Clients that trust the shape crash on the first property access.
- **Auth expiring mid-flow.** Force a 401 on the second call of a two-call flow.

## 9. Time, timezone & locale

- Set the OS/browser timezone to `Pacific/Kiritimati` (UTC+14) and `Pacific/Midway` (UTC-11), then check any "today", "due date", or day-grouped view. Off-by-one-day bugs are near-universal.
- Act at 23:59 local and check which day the record lands on.
- A recurring event across a DST transition; a duration spanning the "lost" or "repeated" hour.
- Locale set to `de-DE` (comma decimals), `ar-EG` (RTL + digits), `ja-JP`. Number parsing, date formats, and currency all shift.
- A "last 7 days" report run on the 1st of a month, and on Jan 1st.
- Relative timestamps ("2 minutes ago") on a record created in the future by clock skew.

## 10. Rendering, layout & input devices

- **Narrow viewport** (360px) and very wide. Tables, modals, and fixed toolbars break first. Check that a submit button isn't pushed off-screen behind a keyboard.
- **Zoom to 200%** and browser font size increased — a genuine accessibility path, and a fast way to find layout that assumes pixel sizes.
- **Keyboard only.** Tab through a flow: can you reach and activate everything? Does focus escape an open modal? Does Escape close it? Is focus lost to `<body>` after a dialog closes?
- **Long content** in every user-supplied string: names, titles, tags, error messages.
- **Dark mode / forced colors**, if supported — text that becomes invisible is a real bug.
- **Rapid resize** while a chart or virtualized list is rendering.

## 11. Direct API attacks

Same rules as the UI: your own accounts, your own environment. The point is that
the client is not the only caller, and every guard the UI provides must exist on
the server too.

Capture a request from devtools (copy as cURL) and vary it:

- **Remove a required field.** Then send it as `null`, `""`, `0`, `[]`, `{}`, and the wrong type (string where a number is expected, array where an object is).
- **Add unexpected fields** — `isAdmin: true`, `role: "owner"`, `price: 0`, `userId: <other account>`. Mass-assignment bugs are found in seconds this way.
- **Change the ID** to another account's resource (see §4).
- **Wrong method** — GET on a POST route, DELETE on a collection.
- **Malformed body** — truncated JSON, wrong `Content-Type`, a deeply nested object.
- **Repeat a non-idempotent call** with the same payload. Then repeat it 5× in parallel.
- **Remove the auth header** entirely, and use an expired or another user's token.
- **Very large payloads** — a 10k-element array where the UI only ever sends 10.

## 12. Money, quantities & totals

Wherever amounts are computed, check that the client and server agree and that
the server is the authority:

- Quantity `0`, `-1`, `1.5` on an integer item, `999999`.
- A price or total submitted from the client — change it and see if the server honors it.
- A discount code applied twice; two codes together; an expired code; a code applied then removed then re-applied.
- Rounding: three items at `0.10` with 8.25% tax; a currency with no minor units (JPY); a total that should be exactly `0`.
- A refund larger than the payment; a partial refund twice.
- Remove the last item from a cart mid-checkout; check out with an empty cart.
- Change quantity while the total is being recalculated.

## 13. Reading the signals

An attack "worked" if any of these appear — even when the screen looks correct:

| Signal | Where | Usually means |
| --- | --- | --- |
| `Unhandled promise rejection` | Console | An await with no catch; the user gets no feedback at all |
| `Cannot read properties of undefined` | Console | Missing null/empty guard — the exact line names the cause |
| `Warning: Each child ... unique "key"` | Console | Index-as-key; will corrupt on reorder/delete |
| `Can't perform a React state update on an unmounted component` | Console | Missing cleanup; a race on navigation |
| 500 / 502 | Network | Always a bug; the server log has the trace |
| 4xx the UI never showed | Network | Swallowed error — user believes it worked |
| Two identical requests | Network | Missing submit guard or double-bound handler |
| `undefined` or `null` in a request path | Network | State read before it loaded |
| Stack trace, `SequelizeError`, `IntegrityError` | Server log | Unvalidated input reached the DB |
| Request never completes | Network | No timeout; permanent spinner |
| Record exists but is half-populated | Database | Non-atomic multi-step write |
| Two records where one was intended | Database | The double-submit bug, confirmed |
| Row count changed after a "failed" action | Database | Failure path doesn't roll back |

When you get a signal, capture it verbatim — the message, the stack frame in
your own code, the request/response pair, the server excerpt. That text is what
makes Phase 4's root cause fast, and half of it is gone the moment you navigate.
