# Trust boundaries and security

The security pass. Start by drawing the boundaries: who can send input to this system, and with what privilege? Typical parties are:

- anonymous internet clients;
- signed-in users in each role;
- webhook senders;
- authors of external contributions (forks, outside collaborators);
- worker or agent processes that run untrusted code;
- other services;
- operators.

For every privileged action, such as running code, spending money, writing to an external system, reading another tenant's data or changing a mode, ask: **which of these parties can cause it, and what stops the ones who shouldn't?**

## Contents
- Identity and scoping
- Approvals, versions and time
- Untrusted components
- Paths, keys and sizes
- The pre-auth surface
- Fail closed in production
- Authorization surface and switches
- Secrets handling
- Supply chain

## Identity and scoping

- **A lookup scoped to the exact subject.** `where parent = $1 limit 1` with no key for the specific child, and no `order by`, returns an arbitrary row. Typical bug: reading "the author" of *any* item linked to a ticket instead of the item under run. Anyone who can create a link can then borrow another author's trust. Fix: filter on the full key of the subject. Fail if there are zero or several matches when exactly one is expected.
- **Batch privilege.** An action authorized for one item gets applied to a set. A maintainer's command on a ticket starts a run for *every* linked item and stamps each one with the maintainer's trust. Fix: evaluate each item's own trust, and skip or require per-item approval for untrusted ones.
- **The actor, not the content.** A magic string in a title, body, trailer or commit message ("Automated-By: bot") must not be treated as proof that the system did something, because anyone can type it. Require that the event's actor matches the system's own identity.
- **Self-loops.** The system's own outputs (comments, commits, events) come back as inputs and trigger work, such as a replan or a re-run. Check that the system recognizes itself in *every* credential mode. A personal token may present a different actor type than an app token.
- **Spreading untrusted objects.** `{...incoming.user, login: mapped ?? undefined}` keeps the incoming `login` when there's no mapping. Build trusted objects from allowlisted fields only.
- **Tenant scope** on every read and write of tenant-owned data, resolved from the authenticated session at the boundary, not deep in callers.

## Approvals, versions and time

- **An approval binds to what the approver saw.** "Approve" must bind to the exact version: a commit SHA, a revision, an etag. The version stored when the approval event happens to be processed is not good enough, because a push between the approver's page load and processing gets approved without anyone seeing it. Accept the version in the command (`/run <sha-prefix>`), require it for untrusted authors, and refuse when it doesn't match the current version. Re-check at execution time. A later push needs a new approval.
- **Edits and deletes re-fire commands.** Editing or deleting a comment that contains a command delivers the event again. Act only on creation, or deduplicate by the original event id.
- **Time-of-observation.** A sweep that stamps `seen_at = now()` *before* it lists the items it then records can mark a later change as seen earlier. That can put it inside an approval window. Stamp after the read. On replay, use the replay time, not the original receipt time.
- **Replays.** A signed request (method, path, body hash, timestamp) with no nonce can be replayed for the whole timestamp window, for example to steal queued work or mint upload URLs. Add a nonce to the signed string and remember the nonces seen within the window.
- **Long-lived privilege.** A session cookie that freezes the admin flag for a full day with no revocation, or an in-memory trust cache with an hour-long TTL, means a removed admin keeps admin rights. Re-check membership on privileged actions, or keep sessions short and revocable.

## Untrusted components

This covers workers, agents, clients and anything running code the system didn't write.

- **Self-declared facts.** Validation must use facts the server computed from data it observed itself. A safety check that reads the client's own `changedFiles` list, a `noDeletions` flag it sets itself, or checksums it computed lets the client pass by reporting nothing changed. Compute the facts from the diff the server holds.
- **Untrusted input driving terminal or privileged state.** A worker reporting `status: aborted` that moves the job to a terminal state lets the worker end the job, with no retry. Map worker-reported outcomes to retryable states. Keep terminal transitions in the component that owns the run.
- **Check, then store where the checked party can write.** The server validates an artifact, then writes the validated copy under the worker's own upload prefix. The worker can mint a PUT to that key and overwrite it before the server reloads it. Store checked data under a server-only prefix, pin its hash in the job record, and verify the hash on load.
- **The same rules at load as at check.** If the upload check limits paths to `tests/**`, the step that later writes those files must apply the same rule. Don't rely on a weaker path helper that only refuses `..`.
- **Denylist regexes for dangerous constructs.** A check for `.only` or `.skip` that misses `xit(`, `fit(`, `xdescribe(`, `.only.each(`, `.skipIf(`. Prefer parsing, or an allowlist of what's permitted.
- **Binary and type detection** that trusts a flag set by the sender.

## Paths, keys and sizes

- **Path confinement by allowlist.** Normalize first, then require the path to sit under the permitted root. Refusing absolute paths and `..` segments still allows `package.json`, `.github/workflows/x.yml` or `.git/hooks`. Watch case sensitivity on case-insensitive filesystems (`Tests/.private` vs `tests/.private`).
- **`startsWith` alone.** `key.startsWith(prefix)` accepts `prefix/../other`. Normalize and refuse `..`, the same way at every site.
- **Object keys and ids from untrusted input.** A client-supplied `attachmentKey` fetched without a prefix check can point at another user's object. Require every key to sit under the caller's own scope, at every read, not only at presign.
- **Size before read.** Reading an untrusted object into memory before checking its size means one multi-GB upload runs the process out of memory on every retry. Cap the declared length at presign time, check `Content-Length` or `HEAD` before `GET`, and stream when large.
- **Signed URLs** that cover the key and timestamp but not the length or hash let the holder upload any body. Sign the length and hash too. Don't store presigned URLs in durable payloads.

## The pre-auth surface

For any endpoint reachable before authentication (WebSocket upgrade, webhook receiver, enrollment):

- Set a maximum payload size. Library defaults are often 100 MiB.
- Set a deadline for the signed hello or handshake, then close.
- Cap connections per instance. Don't count authenticated sessions against the pre-auth cap, or anonymous clients can lock real ones out.
- Do the cheap rejection (shape, timestamp window, signature) before database lookups.
- Use a constant-time compare (`timingSafeEqual`) for every secret or signature comparison.
- Keep tokens out of query strings, since they land in proxy and edge logs.

## Fail closed in production

- **Optional security config.** An empty origin-verification secret or webhook secret that *disables* the check is a hole. Refuse to boot in production when it's missing.
- **Placeholders accepted as secrets.** Infra often creates `CHANGE_ME` placeholders. Code that refuses only an empty string accepts the placeholder as a real secret, and then anyone can sign with it. Treat known placeholders and short values as unset.
- **Dev bypasses.** "Trust loopback peers" breaks the moment a sidecar proxy makes every request loopback. "Trust when `NODE_ENV=development`" is one mis-set variable from making everyone admin. Require an explicit, production-refused switch.
- **Fallbacks that trust configuration alone.** "No identity-provider keys set, so trust the configured org ID" means a wrong ID seeds or deletes data in a real customer's org. Fail closed in production.
- **Production checks at boot**: session secret, origin secret, seal and encryption keys, region, database URL, identity keys. Each one either valid or the process refuses to start.
- **Guards that skip when a request value is missing.** A global hook such as `if (action && ADMIN.includes(action) && !isAdmin) deny` passes any request whose route matched without that value. Routers can match a parameterized segment on an empty or trailing-slash path, and the handler then runs unguarded. Send the empty, trailing-slash and unknown-value variants at every guarded route, and read what the handler does when the value is absent.

## Authorization surface and switches

- **New privileged action, old allowlist.** When a route gains an action (`resend`, `purge`, `rotate`, `set_mode`), check that the role allowlist that gates the others includes it.
- **The kill switch is a ceiling.** If the latest runtime setting (a DB row the console writes) overrides the environment value, redeploying with `MODE=dry-run` changes nothing after someone once clicked "live". The env value must cap the runtime value: dry-run in env forces dry-run. Make going live its own audited, privileged action.
- **Sandbox modes that still touch live systems.** An update or delete call that maps the target for "create" but not for "update" edits live data from sandbox. Check every verb.
- **Revocation completeness.** Revoking a worker or user must also rotate the credentials it held (passwords, tokens, keys), not just block new sessions.
- **Status and event feeds trusted without a sender check.** Any "deployed" status from any actor gets recorded as a deploy, which lets an unreviewed commit steer what runs next. Restrict to configured senders, and match the repo to the service.
- **Org and repo identity.** A helper that compares only the name part of a qualified identifier treats `org-a/x` and `org-b/x` as equal.

## Secrets handling

- **Exposure points.** Look for secrets in argv (visible in `ps`), in URLs, in stored job payloads, in committed variable files, and in log lines. Check log redaction depth and keys: nested `access_token`, `client_secret`, `set-cookie`, `signature`, sealed blobs.
- **Child processes.** `spawn(cmd, args, { env: process.env })` hands every secret to the child. Pass an explicit allowlist.
- **Key derivation.** A plain hash of a passphrase, with no length check, is not a KDF.
- **Error responses.** Default error handlers that return internal messages to clients.
- **Read access to the secret path.** Who outside the service can read it? Broad developer roles in a shared account often can.

## Supply chain

- Pin CI actions to commit SHAs, not tags. Give workflows an explicit, minimal `permissions:` block.
- Pin versions exactly where a patch is applied. Watch install scripts in new dependencies.
- Check images: multi-stage builds, no sources, tests or tooling in the runtime image, a non-root user, pinned by digest.
