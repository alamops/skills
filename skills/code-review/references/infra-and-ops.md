# Infrastructure, deploy, and runbooks

The operations pass. Use it whenever the diff touches IaC (Terraform, CloudFormation, Pulumi, CDK), CI/CD workflows, deploy scripts, container images, alarms and dashboards, or a bring-up runbook. Infra defects tend to be silent: the apply succeeds, the alarm stays green, and nothing works.

## Contents
- Read the repo's operational memory first
- Verify external facts live
- Ordering and silent rollbacks
- Permissions and how the consumer reads them
- Rendering, encoding, and placeholders
- Positive controls for every signal
- Blast radius of shared roots and modules
- Secrets, queues, and buckets
- Contracts across components and repos
- Runbooks
- Layout, versions, and docs

## Read the repo's operational memory first

Infra repos usually write their scars down. Before judging, read:

- `docs/lessons-learned*`
- incident write-ups
- bootstrap checklists for similar services
- the tech-debt register
- ADRs
- CLAUDE.md or CONTEXT.md

Most of the strongest infra findings take the form "this repeats the lesson at `<file>:<line>`." Find the closest sibling subtree or service and compare its layout, its bootstrap runbook, and how it applied each lesson. A deviation from the sibling pattern needs a reason.

## Verify external facts live

When you have read-only access, check what the code assumes instead of trusting it:

- **Identity token formats.** For example, the exact subject claim a CI provider sends for this repo. Some repos opt into an immutable or ID-based subject form, and a trust policy written for the plain form refuses every assume-role call.
- **Referenced resources exist.** Check that each named environment, branch, secret path, image tag, workflow, or job is really there (`gh api repos/{o}/{r}/environments`, `git ls-remote`, the cloud CLI's `describe` or `list`).
- **Account limits.** Concurrency, quotas, connection limits.
- **What a managed service actually exposes** at the pinned provider version.

Never run anything that writes, and never run `apply` or `deploy`. Say in the header what you checked live and what you could only read.

## Ordering and silent rollbacks

- **A service applied before its artifact exists.** For example, a container service pointed at an image tag CI has never pushed. Each apply becomes a deployment that fails on pull.
- **Managed services that roll back on failure.** Some managed deploy modes roll back the whole configuration when a deployment fails, while the IaC tool reports success and keeps the new values in state. The next deploy then lands on the rolled-back configuration, without the environment variables that were "applied". The bring-up order has to be:
  1. Create with zero tasks.
  2. Push the first artifact.
  3. Apply the full configuration.
  4. Check the deployment status after every apply that touches the service.
- **The runbook's order vs. dependencies.** Find every step that consumes something an earlier step was supposed to create, and check that the earlier step actually creates it.

## Permissions and how the consumer reads them

- **Missing list permissions change error codes.** Without `ListBucket`, a missing key comes back as 403 instead of 404. Code that treats only 404 / `NotFound` / `NoSuchKey` as "missing" then throws on every first-time key. Trace how the consuming code interprets each response before calling a permission set complete.
- **CI and deploy roles.** Can the role do every step the workflow runs, including checking that a rollout succeeded? Is it scoped to this service's resources only?
- **Who else can act.** A queue with no policy lets anyone in the account with broad messaging permissions send forged events, steal real ones, or purge the queue. Restrict send to the intended producers. Check whether broad developer roles can read the service's secrets and buckets.
- **Deploy environment protection.** A CI role scoped to a deployment environment is only as strong as that environment's rules. Check that the environment exists (`gh api repos/{o}/{r}/environments`), only accepts the main branch, and requires reviewers. Otherwise any branch can declare it and deploy.
- **Trust-policy conditions.** Check for source-account and source-ARN conditions where the estate uses them.

## Rendering, encoding, and placeholders

- **Escaping can hide placeholders.** JSON-encoding functions may escape characters that a downstream templating system needs literally. For example, some IaC `jsonencode` implementations escape `<` and `>` as unicode, so a scheduler never finds its `<aws.scheduler.scheduled-time>` placeholder. The consumer then gets the literal string, fails validation, and drops the event quietly. Build the string with a template or heredoc, then verify the rendered value after apply.
- **Placeholder secrets.** Values like `CHANGE_ME` created by IaC must not pass as real secrets in the consuming code (see trust-boundaries.md). Generate them in IaC where you can.

## Positive controls for every signal

- **Prove the metric exists.** An alarm whose metric never arrives sits at OK forever when missing data is treated as "not breaching." For every alarm and dashboard metric, check that the metric is actually emitted: `list-metrics` on the namespace returns it, and a `filter-log-events` with the filter pattern returns matches. Embedded-metric formats need specific ingestion paths. A plain log driver may not deliver them.
- **Match the dimensions.** Dashboard queries must use the dimensions the code emits (`mode`, `verdict`). A query without them shows an empty line.
- **Test the notification path.** A test alert published to the topic reaches the channel. Write it down as a command, not a sentence.

## Blast radius of shared roots and modules

- **New data lookups in a shared root.** A lookup of another service in the highest-blast-radius root (the shared environment root) makes every plan depend on that service existing. A missing resource fails the plan instead of returning empty.
- **Service-specific files in shared modules.** A file for one service inside a module that every account applies adds that change to every account's plan. Use the module's existing list or variable pattern.
- **Manual steps where the repo has a managed path.** Hand-added DNS or certificate-validation records in a zone the repo has delegated to IaC, or a public name on the apex when a delegated subdomain exists for exactly this. Follow the repo's checklist. Hand edits are what the next outage deletes.
- **Targeted applies.** Where the repo requires targeted applies in production (because a full plan carries backlog drift, sometimes destructive), every prod step names its `-target` and the expected plan.
- **Frozen interfaces.** Outputs added inside a block the repo documents as frozen.

## Secrets, queues, and buckets

- **Secrets in committed variable files.** Check whether the tech-debt register already lists this exact mistake. Use the gitignored local file or a parameter-store data source.
- **Backups.** They belong in a location the service can't overwrite, or with versioning and long enough noncurrent retention to recover from a bad write. One-day retention on the only database dump is a one-day window.
- **Bucket hygiene.** Block public access, enforce ownership, version, use SSE, and add a TLS-only policy where the estate has one. Lifecycle rules must match the tags and prefixes the code actually writes (code that routes a prefix to bucket A makes bucket B's rules for that prefix dead).
- **Queues.** DLQ redrive policy, encryption, visibility timeout at least the worst-case processing time.

## Contracts across components and repos

- **Names and values must match on both sides.** Check env var names, secret names, handler names, route prefixes, tag keys and values, and bucket and prefix routing against the consuming code at its pinned head.
- **Limits must agree.** A dead-letter threshold lower than the app's own retry cap means the app's branch never runs. Message bodies that expire before the dead-letter queue does mean late replays fail. A retry budget shorter than a realistic upstream outage dead-letters everything received in that window.
- **Drift in both directions.** Check for resources the IaC creates that nothing reads, such as a secret parameter set by hand that no code consumes. Then check the reverse: resources the code writes or reads that the IaC never creates.
- **Copied values.** Hostnames, ARNs or IDs copied into variable files by hand when another stack already exposes them as outputs. Read them from that stack's remote state instead.
- **IDs that must exist in each environment.** For example, an organization ID used by two environments must exist in each environment's database and identity provider. Otherwise every operation in one of them fails.
- **Cross-repo order.** List every dependency: the other repo's PR (open? merged?), its branch (pushed?), the deploy job it needs (does it exist?). Ask for one merge-and-apply order, written into every involved PR's body.

## Runbooks

- **Every step names something that exists.** "Run the deploy workflow" when the repo has only a `test` job is a step with nothing to run. Name the PR that adds it, or give the manual commands.
- **Every by-hand step has a verification command and an expected result.** That covers DNS (`dig`), certificates (`describe-certificate`), environments (`gh api …`), webhook pings, the count of parameters still set to a placeholder (without printing their values), and deployment status.
- **Prod steps state the target and the expected plan** ("EXPECT: 1 to add, 0 to change, 0 to destroy").
- **The whole bring-up is covered.** App registrations and their permissions, webhook scopes, pool sizes and domains that default to zero, worker enrollment, and the redeploy after a secret is set.
- **Use the platform's documented shapes.** For example, a run-task image override that some platforms silently ignore (register a new revision instead), or networking flags required when there's no NAT.

## Layout, versions, and docs

- **Follow the sibling layout.** Variables and outputs belong in their usual files, with version constraints and the environment validation the siblings have. A spec from another repo doesn't override this repo's layout.
- **No end-of-life runtimes.** The repo's newer functions show the current one.
- **Bound provider and tool versions** the way the siblings do.
- **Vendor shared code where siblings vendor it.** Zipping a shared module's source in place means an edit there silently changes this service.
- **Update the docs index.** A new subtree or state key should appear in the repo's index docs (CLAUDE.md tree, README, CONTEXT state-key table, architecture docs). A decision with real trade-offs (staging secrets stored in the dev account, a new public domain) gets a dated decision record if the repo keeps ADRs.
- **One concern per commit.** Unrelated formatting fixes go in their own chore commit.
