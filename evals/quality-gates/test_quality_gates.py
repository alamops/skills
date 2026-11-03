#!/usr/bin/env python3
"""Regression test for skills/*/scripts/quality_gates.py.

Rebuilds the planted-defect fixture repo from fixture/*.patch in a temp dir, runs the
three subcommands, and checks that each planted lead is reported and that the known
false positives stay quiet. Run it after editing any pattern in quality_gates.py:

  python3 evals/quality-gates/test_quality_gates.py

Python 3.9+, standard library only; needs git.
"""
import os
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
SCRIPT = os.path.join(ROOT, "skills", "code-review", "scripts", "quality_gates.py")

WIRING_MUST = [
    "UNWIRED src/notifications/digest.ts:6  buildDailyDigest — used only by tests",  # tested, never called
    "UNWIRED src/drivers/socket.ts:8  registerSocket",                              # nothing registers sockets
    "UNREAD  src/config.ts:18  driverTimeoutSeconds",                               # parsed, never read
    "UNREAD  src/config.ts:19  maxSendAttempts",
]
WIRING_MUST_NOT = [
    "assignDriver",     # used inside its own (live) file by reassign()
    "onDriverMessage",  # used inside its own file by the wired subscriber
    "handleDriverReport",
]
HYGIENE_MUST = [
    ("[async-interval]", "src/main.ts:18"),
    ("[floating-promise]", "src/main.ts:17"),
    ("[fail-open-secret]", "src/webhooks/verify.ts:5"),
    ("[non-constant-time-compare]", "src/webhooks/verify.ts:7"),
    ("[local-path]", "docs/plans/delivery-proof.md:3"),
    ("[silent-test-guard]", "test/helpers/db.ts:5"),
    ("[unordered-limit-1]", "src/drivers/authorize.ts:8"),
    ("[env-outside-config]", "src/webhooks/connect.ts:4"),
    ("[literal-duplicates-config-default]", "src/drivers/assign.ts:6"),
]
HYGIENE_MUST_NOT = [
    "[swallowed-error]",        # dispatch.ts's catch has a body on the next line
    "[focused-or-skipped-test]",
]


def run(args, cwd=None, env=None):
    return subprocess.run(args, cwd=cwd, env=env, capture_output=True, text=True)


def section(output, header):
    """Lines under one [check] header in hygiene output."""
    lines, on = [], False
    for line in output.splitlines():
        if line.startswith("["):
            on = line.startswith(header)
            continue
        if on:
            lines.append(line)
    return "\n".join(lines)


def main():
    failures = []
    with tempfile.TemporaryDirectory() as tmp:
        repo = os.path.join(tmp, "fixture")
        os.mkdir(repo)
        git_env = dict(os.environ, GIT_AUTHOR_NAME="fixture", GIT_AUTHOR_EMAIL="f@example.com",
                       GIT_COMMITTER_NAME="fixture", GIT_COMMITTER_EMAIL="f@example.com")
        run(["git", "init", "-q", "-b", "main"], cwd=repo)
        patches = sorted(os.path.join(HERE, "fixture", p) for p in os.listdir(os.path.join(HERE, "fixture")))
        r = run(["git", "am", "-q"] + patches[:1], cwd=repo, env=git_env)
        if r.returncode:
            print("git am (base) failed:", r.stderr)
            return 2
        run(["git", "checkout", "-q", "-b", "feature"], cwd=repo)
        r = run(["git", "am", "-q"] + patches[1:], cwd=repo, env=git_env)
        if r.returncode:
            print("git am (feature) failed:", r.stderr)
            return 2

        w = run([sys.executable, SCRIPT, "wiring", "--repo", repo, "--base", "main"])
        for s in WIRING_MUST:
            if s not in w.stdout:
                failures.append("wiring missed: " + s)
        for s in WIRING_MUST_NOT:
            if ("  %s —" % s) in w.stdout:
                failures.append("wiring false positive: " + s)
        if w.returncode != 1:
            failures.append("wiring exit %d, expected 1" % w.returncode)

        h = run([sys.executable, SCRIPT, "hygiene", "--repo", repo, "--base", "main"])
        for header, anchor in HYGIENE_MUST:
            if anchor not in section(h.stdout, header):
                failures.append("hygiene missed %s at %s" % (header, anchor))
        for header in HYGIENE_MUST_NOT:
            if header in h.stdout:
                failures.append("hygiene false positive: " + header)

        # Mid-wave self-check: an agent's new files are untracked, and --paths limits the
        # report to the files it owns.
        run(["git", "checkout", "-q", "main"], cwd=repo)
        run(["git", "checkout", "-q", "feature", "--", "src/drivers", "src/webhooks"], cwd=repo)
        run(["git", "reset", "-q"], cwd=repo)
        own = run([sys.executable, SCRIPT, "hygiene", "--repo", repo, "--base", "main",
                   "--worktree", "--paths", "src/drivers"])
        if "src/drivers/authorize.ts:8" not in section(own.stdout, "[unordered-limit-1]"):
            failures.append("worktree --paths missed the untracked owned file's lead")
        if "src/webhooks/" in own.stdout:
            failures.append("worktree --paths reported a file outside the owned paths")
        ownw = run([sys.executable, SCRIPT, "wiring", "--repo", repo, "--base", "main",
                    "--worktree", "--paths", "src/drivers"])
        if "src/drivers/socket.ts:8  registerSocket" not in ownw.stdout or "src/webhooks/" in ownw.stdout:
            failures.append("worktree --paths wiring wrong:\n" + ownw.stdout)

    reports = os.path.join(HERE, "reports")
    env = dict(os.environ)
    env.pop("QG_TEST_REQUIRED_VAR", None)
    s = run([sys.executable, SCRIPT, "suite", os.path.join(reports, "red-run.xml"),
             "--baseline", os.path.join(reports, "baseline.json"),
             "--require-env", "QG_TEST_REQUIRED_VAR"], env=env)
    for header in ("[failed]", "[skipped]", "[near-zero-time suites]", "[count-drop]", "[missing-env]"):
        if header not in s.stdout:
            failures.append("suite missed " + header)
    if "test/leader.test.ts (2 tests)" not in s.stdout:
        failures.append("suite missed the 0 ms leader suite")
    if "test/math.test.ts" in section(s.stdout, "[near-zero-time"):
        failures.append("suite flagged a single fast unit test (below --min-suite)")
    if s.returncode != 1:
        failures.append("suite (red) exit %d, expected 1" % s.returncode)
    ok = run([sys.executable, SCRIPT, "suite", os.path.join(reports, "clean-run.json")])
    if ok.returncode != 0:
        failures.append("suite (clean) exit %d, expected 0:\n%s" % (ok.returncode, ok.stdout))

    if failures:
        print("FAIL")
        for f in failures:
            print("  - " + f)
        return 1
    print("ok: %d wiring, %d hygiene, 3 worktree/--paths, 7 suite expectations hold"
          % (len(WIRING_MUST) + len(WIRING_MUST_NOT), len(HYGIENE_MUST) + len(HYGIENE_MUST_NOT)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
