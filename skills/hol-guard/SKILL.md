---
name: hol-guard
description: Installs and operates HOL Guard as a local pre-execution safety boundary for supported coding-agent harnesses. Use when the user wants agent runtime protection, approval review, receipts/evidence, or fail-closed handling before an AI coding agent runs tools.
---

# HOL Guard

Use HOL Guard when a supported local coding-agent harness should be protected before tool execution. HOL Guard is a runtime boundary around the agent harness; it does not replace the target application's authentication, authorization, validation, backups, tests, or review requirements.

## Install and verify

Prefer an isolated CLI installation:

```bash
pipx install hol-guard
hol-guard status
hol-guard detect --json
```

Use the exact harness identifier returned by `hol-guard detect --json`. Do not maintain a separate guessed adapter list.

Initialize Guard and install the detected harness integration:

```bash
hol-guard bootstrap
hol-guard install <detected-harness>
hol-guard run <detected-harness> --dry-run
hol-guard doctor <detected-harness> --json
```

Do not claim the harness is protected unless Guard-owned status or doctor output proves that the integration is installed and healthy.

## Run protected work

Start the protected agent session with:

```bash
hol-guard run <detected-harness>
```

Perform mutation-bearing work only from that protected session. If Guard denies, requires review, errors, times out, returns malformed output, or is unavailable, stop the protected action. Do not retry the same operation from an unprotected agent session.

Keep the target system's own controls authoritative. A Guard allow decision never overrides an application denial, missing permission, required confirmation, test failure, or project review gate.

## Review approvals and evidence

When Guard pauses work for review, inspect the request before deciding:

```bash
hol-guard approvals
hol-guard approvals open
hol-guard receipts
```

For terminal-only resolution after the user has reviewed the risk and requested scope:

```bash
hol-guard approvals approve <request-id>
hol-guard approvals deny <request-id>
```

Use evidence commands when the user needs an audit trail or handoff proof:

```bash
hol-guard receipts
hol-guard inventory
hol-guard events
hol-guard explain <artifact-id>
```

Never approve a request without understanding the risk reason and scope.

## Inspection is not enforcement

`hol-guard command test` is useful for side-effect-free command inspection, but it is not a substitute for the installed harness integration and must not be presented as the final enforcement decision.

For protected execution, use `hol-guard install`, `hol-guard run`, and `hol-guard doctor` on the detected harness.

## Safety rules

- Never read `.env` files just to configure Guard.
- Never bypass a Guard approval or deny result.
- Prefer Guard-owned setup commands over manual edits to user-level harness configuration.
- Preserve existing repository and user changes.
- Do not claim HOL Guard runs inside a third-party server or product when it only protects the local agent harness.
- Do not claim protection, approval, or release readiness without command output proving it.

HOL Guard source: https://github.com/hashgraph-online/hol-guard
