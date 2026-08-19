# Evals

Trigger eval sets for the skills in this repo, plus the harness that runs them.

A trigger eval set is a list of realistic queries paired with whether the skill
*should* fire. The valuable ones are the near-misses — queries that share
vocabulary with the skill but belong to a different one. Those are what catch a
description that has quietly grown too greedy.

```json
[
  {"query": "start a time-boxed spike to figure out whether ...", "should_trigger": false},
  {"query": "add SSO via okta to the admin portal ...", "should_trigger": true}
]
```

## Running one

```sh
python3 evals/trigger_race.py \
  --skill skills/implement \
  --eval-set evals/implement/trigger_eval.json \
  --cwd ~/code/some-real-app \
  --runs 3
```

A/B a change against the version you already have installed:

```sh
python3 evals/trigger_race.py \
  --skill skills/implement --baseline ~/.agents/skills/implement \
  --eval-set evals/implement/trigger_eval.json --runs 8
```

The script temporarily points `~/.claude/skills/<name>` at the version under test
and restores it afterwards — via `try/finally`, signal handlers, and an `atexit`
hook, so it comes back even if you Ctrl-C. Nothing is deleted, only moved aside.
Each run is killed at the first tool call, since that is where skill selection is
decided, which keeps a run to ~10s and a few cents instead of executing the task.

## Two things worth knowing before you trust a number

**Don't use skill-creator's `run_eval` on a skill you have installed.** It
installs the candidate description under a uniquified name (`implement-skill-a1b2c3d4`)
and counts a trigger only when Claude invokes *that* name. For any skill Claude
could plausibly handle unaided, the junk name suppresses triggering by itself — it
calls `Bash` and starts working instead of consulting the skill, so every correct
trigger scores as a miss. Uninstalling your real skill does not rescue it; with
only the uniquified command present, nothing fires at all. Measured directly:

| Setup | First tool call |
| --- | --- |
| Real `implement` installed | `Skill{"skill": "implement"}` |
| Real skill removed, only `implement-skill-<uuid>` present | `Bash{"ls -la ..."}` |

`trigger_race.py` sidesteps this by installing the candidate under its **real**
name and asking which skill wins — a question with a real answer, and the one that
makes near-miss negatives meaningful.

**A query that starts with `/implement` cannot pass, and that is not the
description's fault.** The slash form expands the skill directly instead of going
through the `Skill` tool, so the first tool call the harness sees is the skill
*already running* — for `implement` that is its Phase 0 probe, `ls AGENTS_CONFIG.yml`.
Scored by "did a `Skill` call land first?", every explicit-invocation positive reads
as a miss while the skill is demonstrably in control of the turn. Plain-language
positives have the opposite problem: Claude orients with `ls`/`grep` for several
calls before consulting a skill, and the run is killed long before that. So read the
two arms against each other rather than reading the absolute pass rate — a candidate
and a baseline that score identically across every query have identical triggering,
which is the question this harness can actually answer. The negatives are the half
that stands on its own.

**Triggering is context-sensitive, so run it somewhere the queries make sense.**
A query about a billing service scores near zero inside this docs-only repo no
matter how good the description is, because Claude orients with `ls` and `git log`
rather than reaching for a delivery skill. When a positive scores low, check that
before blaming the description — and compare against a baseline arm, which
controls for it. Negatives are far more robust to the mismatch, so this repo is a
fine place to test *those*.
