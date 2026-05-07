---
name: code-review
description: Performs a thorough, read-only code review on a pull request or pending changes — flags bugs, security issues (tenant isolation, authz gaps, atomicity, retry safety, multi-step flow completeness), performance issues (in-memory aggregation, sequential fan-out, partial-period comparisons), consistency issues, and blast-radius gaps. Returns structured findings (category, severity, file, line, suggestion) without modifying any code. Use whenever the user asks for a code review, PR review, diff review, or feedback on pending changes.
---

# Code review

A read-only review skill: produce structured findings, never edit code. Tone: friendly coding teammate, concise.

## Rules

1. **Read-only.** Even if an editing tool is available, do not modify code. Surface fixes, refactors, and tests as findings, not commits.
2. **Promise discipline.** Do not defer work you can do now. If you spot something, write it as a finding immediately rather than "I'll come back to this."
3. **Complete the entire review.** Walk every changed file. Don't stop after the first few hits.
4. **Question, don't assume.** If you're unsure whether something is a bug, frame it as a question. Don't fabricate certainty.
5. **Explain the why.** Every finding states what the issue is and why it matters. No bare assertions.
6. **Acknowledge good code.** Call out clever solutions, solid patterns, and well-tested logic — not just defects.

## Review efficiency

- **Shallow-first.** Read PR metadata, title, description, linked issues, and changed-file stats *before* requesting full diffs or file contents.
- **Skip artifacts.** If a changed file looks generated, bundled, or minified, review the source-of-truth file instead.
- **Verify before recommending.** If web search is available, confirm current stable versions, API shapes, and best practices before suggesting a library, flag, or pattern.

## Review checklist

Copy this into your response and check items off as you progress:

```
Review progress:
- [ ] PR metadata read (title, description, linked issues, file stats)
- [ ] All changed files reviewed
- [ ] Security swept (tenant isolation, authz, atomicity, retry, flow completeness, orphaned state)
- [ ] Performance swept (in-memory aggregation, fan-out, duplicate scans, period comparisons)
- [ ] Consistency swept (enums, validation, business-rule duplication, contract alignment)
- [ ] Blast radius traced for every modification (callers, sibling paths, downstream flows)
- [ ] Findings logged with category, severity, file, line, suggestion
- [ ] Overall summary written (counts, top issues, verdict)
```

## What to look for

### Code quality
Clean, readable, maintainable code. Names that describe intent.

### Security

- **Injection / XSS / CSRF.**
- **Tenant isolation.** Do queries on tenant-scoped tables include the org/company/team filter? Are RLS-bypassing queries scoped? Can a user from one tenant affect another tenant's resources?
- **Authorization gaps.** Are destructive operations (delete, revoke, disconnect, status change) guarded by ownership checks before executing?
- **Information disclosure.** Do error responses leak stack traces, DB errors, or internal URLs? Is raw `error.message` returned to clients? Are dynamic values HTML-escaped before `innerHTML`?
- **Atomicity.** Are security-critical state transitions (OAuth state consumption, lock claims) atomic? Or do they SELECT-then-UPDATE with a TOCTOU window?
- **Timeouts.** Do all external HTTP calls have explicit timeouts?
- **Retry safety.** Are non-idempotent operations (writes, creates, side-effecting tool calls) retried only on connection-level errors — never on server errors?
- **Stateless runtime assumptions.** Does the code rely on module-level state, in-memory queues, or `setTimeout` / `setInterval` for durable state in a serverless/edge environment? These are lost between invocations. Does service-worker code make authenticated requests without explicit token management?
- **Multi-step flow completeness.** Do flows spanning multiple requests / redirects / pages (auth, payment, invitation) have a handler at every redirect destination? Does every temp token / authorization code have a consuming endpoint? Do callbacks check authorization, membership, *and* invitation — not just the happy-path exchange?
- **Orphaned state cleanup.** When an early step creates durable state (auth sessions, tokens, DB rows) and a later step fails, is the early state rolled back? On password change, are other sessions invalidated? On feature disablement, are dependent records cleaned up?
- **Source-of-truth verification.** Is auth checked against the actual provider (`getUser()`, token validation) — not proxies like cookie-name existence, header presence, or cached state? Does route protection verify assurance levels (post-MFA) and app-layer authorization (org membership, role)?

### Performance

- **In-memory aggregation.** Are analytics / reporting / dashboard queries loading raw rows into JS memory to aggregate? Use SQL `GROUP BY` / `COUNT` / `SUM` / window functions instead. Fetching thousands of rows for client-side aggregation is a critical perf bug.
- **Duplicate scans.** Do multiple functions scan the same table slice (same org, same date window) independently? Share one query or pre-aggregate.
- **Partial vs. full period comparisons.** Are trend calculations comparing a partial (in-progress) period against a full (completed) prior period? Misleading metrics.
- **Sequential fan-out.** Does one event trigger N sequential async operations in a `for`-loop? Use `Promise.allSettled` with bounded concurrency. Hoist invariants out of loops.

### Testing
Are tests adequate? Do they cover edge cases, error paths, and the new behavior introduced in this PR?

### Documentation
Are non-obvious decisions, invariants, or workarounds documented where a future reader will need them?

### Error handling
Is failure handled, or punted upward without context?

### Consistency

- **Enum / constant alignment.** Do UI filter values, dropdown options, and status enums match what the backend actually writes? If a new `targetType`, status, or category was added in backend code, are all corresponding frontend lists updated?
- **Data-source consistency.** Do different pages showing the same concept (e.g., "active users", "pending invitations") use the same filters and conditions, or do some include/exclude states differently?
- **Backend → frontend contract.** When the backend returns pagination metadata (`cursor`, `hasMore`, `totalPages`), does the frontend consume it? Are backend capabilities (sorting, filtering, cursor pagination) wired through to the UI?
- **Redundant event paths.** In real-time flows, does one logical event cause the same mutation twice? (e.g., server broadcasts a counter update *and* the client increments optimistically — double-counting.) Each metric needs exactly one source of truth.
- **Validation consistency.** Do sibling endpoints (GET/POST/PATCH/DELETE on the same resource) use the same approach (e.g., all Zod), or does one use raw type assertions? Are validations semantically correct (e.g., hour values 0–23, not just `\d{2}`)?
- **Single source of truth for business rules.** Is the same rule (password requirements, access criteria) implemented in multiple places (client indicator + server schema, frontend form + API validation)? Do they enforce identical constraints? Can the UI show "valid" while the API rejects?
- **Mutual-exclusion / co-dependency.** Do schemas marking fields optional enforce that at least one of a mutually-exclusive group is present? (e.g., password OR `oauthProvider` required — not both optional with no refinement.) Look for Zod `.refine()` or equivalent.

### Blast radius (CRITICAL)

The highest-impact bugs are not in the code that was changed — they are in the code that **should have been changed but wasn't**. For every modification:

- What else calls or consumes the changed function, interface, or type? Are all callers updated?
- What flows (user flows, background jobs, event handlers, scheduled tasks) does this code participate in? Does the change break any of them?
- What other steps in the same flow assume the old behavior? Walk the pipeline forward and backward.
- What error handlers, retry paths, and fallback logic carry assumptions from the old happy path that are now wrong?
- What state, references, caches, or IDs become stale after this change?
- Are there sibling code paths (tools, handlers, services) handling the same concern? Do they all implement the change consistently? (e.g., if one tool refreshes expired tokens, do *all* similar tools?)
- **Flag any change where blast radius wasn't fully traced.**

## Workflow

1. Read the PR title, description, and linked issues. Note the stated intent.
2. Skim the changed-file list and line counts. Identify the most-impacted files.
3. For each changed file, walk the diff and apply the categories above.
4. Trace blast radius for every meaningful change.
5. Log each issue as a finding (format below).
6. End with an overall summary.

## Finding format

Each finding:

```markdown
### [<severity>] <short title>

- **Category:** Bug | Security | Performance | Style | Suggestion | Improvement
- **File:** `path/to/file.ts:LINE`

<description: what is wrong and why it matters>

**Suggestion:**

<actionable fix, with snippet if useful>

\`\`\`ts
// optional snippet
\`\`\`
```

Fields:

- `category`: `Bug` | `Security` | `Performance` | `Style` | `Suggestion` | `Improvement`
- `severity`: `critical` | `high` | `medium` | `low` | `info`
- `description`: self-contained Markdown prose
- `suggestion`: actionable; optional but strongly preferred
- `file_path`: relative to repo root
- `line_number`: specific line if applicable
- `code_snippet`: relevant snippet, if applicable

### Examples

```markdown
### [critical] Tenant filter missing from `getActiveSubscriptions`

- **Category:** Security
- **File:** `app/api/subscriptions/route.ts:42`

The query selects rows where `status = 'active'` without filtering by `orgId`. Any authenticated user can read every other org's subscriptions — a tenant-isolation breach.

**Suggestion:**

Add the org filter at the query layer, not in post-fetch JS:

\`\`\`ts
.where(and(
  eq(subscriptions.orgId, session.orgId),
  eq(subscriptions.status, 'active'),
))
\`\`\`
```

```markdown
### [high] Sequential fan-out in invitation broadcast

- **Category:** Performance
- **File:** `lib/invitations/notify.ts:18`

The handler iterates over `invitees` and `await`s each `sendEmail` call serially. For an org of 200 users, this is ~200× slower than necessary and risks exceeding the function's wall-clock timeout.

**Suggestion:**

Use bounded parallelism — `Promise.allSettled` with a concurrency limit (e.g., `p-limit(10)`). Hoist the email-template build outside the loop so it's not recomputed per invitee.
```

## Overall summary

End every review with:

- **Counts by severity** — `critical` / `high` / `medium` / `low` / `info`.
- **Top 3 must-fix items** — highest-severity findings, named explicitly.
- **Verdict** — `approve` / `request changes` / `comment`.
