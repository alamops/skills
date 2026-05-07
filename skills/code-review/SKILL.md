---
name: code-review
description: Performs a thorough, read-only code review on any source of changes — a pull request, a git diff, uncommitted edits in the working tree, recent commits on the current branch, or code that was just produced or discussed in the conversation. Flags bugs, security issues (tenant isolation, authz gaps, atomicity, retry safety, multi-step flow completeness), performance issues (in-memory aggregation, sequential fan-out, partial-period comparisons), consistency issues, and blast-radius gaps. Returns structured findings (category, severity, file, line, suggestion) without modifying any code. Use whenever the user asks for a code review, PR review, diff review, feedback on pending or recent changes, or a critique of code just written in this session.
---

# Code review

A read-only review skill: produce structured findings, never edit code. Tone: friendly coding teammate, concise.

## Pick the review target

Before reviewing, identify *what* you are reviewing. The skill applies the same rigor regardless of source — only the discovery step changes:

| Trigger | How to gather the diff |
| --- | --- |
| User names a PR (URL or number) | Fetch PR metadata + diff (e.g., `gh pr view <n>`, `gh pr diff <n>`). |
| User asks to review "this branch" / "my changes" / "what I'm about to push" | `git status`, `git diff <base>...HEAD`, `git log <base>..HEAD --stat`. Default `<base>` to `origin/main` (or `origin/master`); fall back to `main`. |
| User asks to review uncommitted / pending / staged work | `git status`, `git diff` (unstaged) and `git diff --cached` (staged). |
| User asks to review "recent commits" / "the last commit" | `git log -n <N> --stat`, `git show <sha>` for each. |
| User asks to review code we just wrote / discussed in this conversation | Use the in-conversation edits and tool results. Re-read the modified files from disk if it has been a while or if context may have been compacted. |
| Ambiguous ("review my code") | Ask once: "Review the open PR, the uncommitted changes in your working tree, the diff against `main`, recent commits, or the code we just wrote together?" Then proceed. |

## Rules

1. **Read-only.** Even if an editing tool is available, do not modify code. Surface fixes, refactors, and tests as findings, not commits.
2. **Promise discipline.** Do not defer work you can do now. If you spot something, write it as a finding immediately rather than "I'll come back to this."
3. **Complete the entire review.** Walk every changed file. Don't stop after the first few hits.
4. **Question, don't assume.** If you're unsure whether something is a bug, frame it as a question. Don't fabricate certainty.
5. **Explain the why.** Every finding states what the issue is and why it matters. No bare assertions.
6. **Acknowledge good code.** Call out clever solutions, solid patterns, and well-tested logic — not just defects.

## Review efficiency

- **Shallow-first.** Start with the cheapest signal: PR title/description/linked issues, commit messages, `git status`, or the user's stated intent in the conversation. Look at full diffs and file contents *after* you know what changed and why.
- **Use the right scope.** Don't review files that weren't touched. For working-tree reviews, the scope is `git diff` + `git diff --cached`; for branch reviews, `git diff <base>...HEAD`; for in-conversation reviews, the files actually edited this session.
- **Skip artifacts.** If a changed file looks generated, bundled, or minified, review the source-of-truth file instead.
- **Verify before recommending.** If web search is available, confirm current stable versions, API shapes, and best practices before suggesting a library, flag, or pattern.

## Review checklist

Copy this into your response and check items off as you progress:

```
Review progress:
- [ ] Review target identified (PR / branch diff / working tree / recent commits / in-conversation edits)
- [ ] Intent gathered (PR description, commit messages, conversation context, or stated goal)
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
Are tests adequate? Do they cover edge cases, error paths, and the new behavior introduced in this change?

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

1. **Identify the target** using the table above. If unclear, ask once.
2. **Gather intent.** PR description + linked issues, commit messages, the user's stated goal, or the conversation thread that produced the code. Note what the change is *trying* to do — half of code review is checking whether the change actually accomplishes its goal.
3. **Skim the changed-file list and line counts.** Identify the most-impacted files.
4. **For each changed file, walk the diff** and apply the categories above. When reviewing in-conversation edits, re-read the file from disk — don't trust your memory of the patch.
5. **Trace blast radius** for every meaningful change.
6. **Log each issue** as a finding (format below).
7. **End with an overall summary.**

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
