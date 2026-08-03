#!/usr/bin/env python3
"""Measure which skill actually wins a query, with all real skills installed.

Why this exists
---------------
skill-creator's `run_eval` installs the description under test as a command with a
uniquified name (`myskill-skill-a1b2c3d4`) and counts a trigger only when Claude
invokes *that* name. For any skill Claude could plausibly handle unaided, the junk
name suppresses triggering all by itself -- it calls Bash and gets to work instead
of consulting the skill -- so every correct trigger is scored as a miss. Removing
your real skill does not help: with nothing but the uniquified command installed,
nothing fires at all.

This script measures the thing that actually matters instead: with your real skills
installed under their real names, *which skill wins the query?* That makes
near-miss negatives meaningful -- "did `spike-new` beat `implement` on a time-boxed
spike request?" is a question with a real answer, where "did the temp command fire?"
is not.

How it works
------------
Temporarily points ~/.claude/skills/<name> at the candidate skill directory, runs
each query through `claude -p`, and records the first tool call. Skill selection
happens on turn 1, so each run is killed the moment that first call lands -- keeping
runs to ~10s and a few cents rather than executing the whole task.

The original ~/.claude/skills/<name> is stashed and restored via try/finally plus
SIGINT/SIGTERM handlers and an atexit hook, so it comes back even if the run is
interrupted. Nothing is ever deleted -- only moved aside and moved back.

Usage
-----
    # Does the working-tree version of a skill win the queries it should?
    python3 evals/trigger_race.py --skill skills/implement --eval-set evals/implement/trigger_eval.json

    # A/B the working tree against the installed copy (or any other version)
    python3 evals/trigger_race.py --skill skills/implement \
        --baseline ~/.agents/skills/implement \
        --eval-set evals/implement/trigger_eval.json --runs 8

Run it from a repo where the queries make sense. Triggering is context-sensitive:
queries about a billing service score near zero inside a docs-only repo no matter
how good the description is, because Claude orients with `ls` instead of reaching
for a skill. Use --cwd to point at a realistic codebase.

Eval set format: [{"query": "...", "should_trigger": true}, ...]
"""

import argparse
import atexit
import json
import os
import re
import shutil
import signal
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

SKILLS_DIR = Path.home() / ".claude" / "skills"


def resolve_claude():
    """Find the claude CLI. It is often absent from a non-login shell's PATH."""
    found = shutil.which("claude")
    if found:
        return found
    for candidate in (Path.home() / ".local/bin/claude", Path("/usr/local/bin/claude")):
        if candidate.exists():
            return str(candidate)
    sys.exit("error: could not find the `claude` CLI on PATH or in ~/.local/bin")


def skill_name_of(skill_dir):
    """Read the `name:` field from a skill's SKILL.md frontmatter."""
    md = Path(skill_dir) / "SKILL.md"
    if not md.exists():
        sys.exit("error: no SKILL.md in {}".format(skill_dir))
    parts = md.read_text().split("---", 2)
    if len(parts) < 3:
        sys.exit("error: {} has no YAML frontmatter".format(md))
    match = re.search(r"^name:\s*(\S+)", parts[1], re.M)
    if not match:
        sys.exit("error: {} frontmatter has no `name:` field".format(md))
    return match.group(1)


class TemporarilyInstalled(object):
    """Point ~/.claude/skills/<name> at `source` for the duration, then put it back.

    Restoration is the whole point of this class, so it is wired three ways: a
    finally block for the normal path, signal handlers for Ctrl-C and kill, and an
    atexit hook as a backstop. Restoring twice is harmless; not restoring is not.
    """

    def __init__(self, name, source):
        self.name = name
        self.source = Path(source).resolve()
        self.link = SKILLS_DIR / name
        self.stash = Path.home() / ".claude" / ".{}-trigger-race-stash".format(name)
        self.restored = True

    def __enter__(self):
        if self.stash.exists() or self.stash.is_symlink():
            sys.exit(
                "error: stash {} already exists -- a previous run may have been "
                "interrupted. Move it back to {} by hand before retrying.".format(
                    self.stash, self.link
                )
            )
        SKILLS_DIR.mkdir(parents=True, exist_ok=True)
        if self.link.exists() or self.link.is_symlink():
            os.rename(str(self.link), str(self.stash))
        self.link.symlink_to(self.source)
        self.restored = False

        atexit.register(self.restore)
        for sig in (signal.SIGINT, signal.SIGTERM):
            previous = signal.getsignal(sig)

            def handler(signum, frame, _previous=previous):
                self.restore()
                if callable(_previous):
                    _previous(signum, frame)
                else:
                    sys.exit(130)

            signal.signal(sig, handler)
        return self

    def __exit__(self, *exc):
        self.restore()
        return False

    def restore(self):
        if self.restored:
            return
        self.restored = True
        if self.link.is_symlink() or self.link.exists():
            self.link.unlink()
        if self.stash.exists() or self.stash.is_symlink():
            os.rename(str(self.stash), str(self.link))


def first_tool_call(claude_bin, query, cwd, model, timeout):
    """Run one query; return ('skill', <name>) or ('no_skill', <tool>) or ('timeout', None).

    Stops reading -- and kills the process group -- at the first tool call, since
    that is where skill selection is decided.
    """
    env = {k: v for k, v in os.environ.items() if k != "CLAUDECODE"}
    proc = subprocess.Popen(
        [claude_bin, "-p", query, "--output-format", "stream-json",
         "--verbose", "--include-partial-messages", "--model", model],
        stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
        cwd=str(cwd), env=env, start_new_session=True,
    )
    result = ("timeout", None)
    try:
        for raw in proc.stdout:
            try:
                event = json.loads(raw)
            except ValueError:
                continue
            if event.get("type") != "assistant":
                continue
            for block in event.get("message", {}).get("content", []):
                if block.get("type") != "tool_use":
                    continue
                if block.get("name") == "Skill":
                    result = ("skill", (block.get("input") or {}).get("skill"))
                else:
                    result = ("no_skill", block.get("name"))
                raise StopIteration
    except StopIteration:
        pass
    finally:
        try:
            os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
        except OSError:
            pass
        proc.stdout.close()
        proc.wait()
    return result


def run_arm(label, skill_dir, name, evals, args, claude_bin):
    print("\n=== {}: {} ===".format(label, skill_dir))
    with TemporarilyInstalled(name, skill_dir):
        jobs = [(e, i) for e in evals for i in range(args.runs)]
        with ThreadPoolExecutor(max_workers=args.workers) as pool:
            futures = [
                (e, pool.submit(first_tool_call, claude_bin, e["query"],
                                args.cwd, args.model, args.timeout))
                for e, _ in jobs
            ]
            tallies = {}
            for eval_item, future in futures:
                tallies.setdefault(eval_item["query"], []).append(future.result())

    summary, passed = [], 0
    for eval_item in evals:
        outcomes = tallies[eval_item["query"]]
        counts = {}
        for kind, value in outcomes:
            key = value if kind == "skill" else "(no skill -> {})".format(value)
            counts[key] = counts.get(key, 0) + 1
        wins = counts.get(name, 0)
        ok = wins == len(outcomes) if eval_item["should_trigger"] else wins == 0
        passed += 1 if ok else 0
        want = name if eval_item["should_trigger"] else "NOT " + name
        print("[{}] want={:20s} {}/{} {}".format(
            "PASS" if ok else "FAIL", want, wins, len(outcomes), counts))
        print("       {}".format(eval_item["query"][:96]))
        summary.append({"query": eval_item["query"],
                        "should_trigger": eval_item["should_trigger"],
                        "wins": wins, "runs": len(outcomes), "counts": counts,
                        "pass": ok})
    print("--- {}: {}/{} passed".format(label, passed, len(evals)))
    return summary


def main():
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--skill", required=True, help="Path to the candidate skill directory")
    parser.add_argument("--eval-set", required=True, help="Path to the trigger eval JSON")
    parser.add_argument("--baseline", default=None,
                        help="Optional second skill directory to A/B against")
    parser.add_argument("--cwd", default=".",
                        help="Directory to run the queries in (default: cwd). "
                             "Use a repo where the queries make sense.")
    parser.add_argument("--runs", type=int, default=3, help="Runs per query (default 3)")
    parser.add_argument("--workers", type=int, default=6, help="Concurrent runs (default 6)")
    parser.add_argument("--model", default="claude-opus-5", help="Model for claude -p")
    parser.add_argument("--timeout", type=int, default=120, help="Per-run timeout seconds")
    parser.add_argument("--json", default=None, help="Write results to this path")
    args = parser.parse_args()

    args.cwd = Path(args.cwd).resolve()
    claude_bin = resolve_claude()
    evals = json.load(open(args.eval_set))
    name = skill_name_of(args.skill)

    if args.baseline and skill_name_of(args.baseline) != name:
        sys.exit("error: baseline skill name differs from candidate; they must be "
                 "two versions of the same skill")

    print("skill: {}  |  queries: {}  |  runs each: {}  |  cwd: {}".format(
        name, len(evals), args.runs, args.cwd))

    results = {"skill": name, "cwd": str(args.cwd), "runs": args.runs,
               "candidate": run_arm("CANDIDATE", args.skill, name, evals, args, claude_bin)}
    if args.baseline:
        results["baseline"] = run_arm("BASELINE", args.baseline, name, evals, args, claude_bin)

    if args.json:
        Path(args.json).write_text(json.dumps(results, indent=2))
        print("\nwrote {}".format(args.json))


if __name__ == "__main__":
    main()
