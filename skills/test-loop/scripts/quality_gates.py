#!/usr/bin/env python3
"""Mechanical quality gates for a change: wiring, diff hygiene, and test-run sanity.

Shared by the alamops code-review, implement, execute-plan, test-loop and write-tests
skills. Every copy under skills/*/scripts/ must stay byte-identical; edit the one in
skills/code-review/scripts/ and run tools/sync_shared_scripts.py.

Subcommands
  wiring   New exports, routes and config keys in BASE...HEAD that nothing in production
           reaches (only their own file, re-export barrels, or tests use them).
  hygiene  Patterns in the added lines that reviews keep finding: deferral markers, local
           paths cited as specs, focused/skipped tests, silent test guards, fail-open secret
           checks, non-constant-time signature compares, floating promises, overlapping
           async intervals, unordered LIMIT 1, swallowed errors, env reads outside config,
           literals duplicating config defaults, and commit-message/diff-size mismatches.
  suite    Reads JUnit XML and/or Jest/Vitest JSON reports and flags a green run that
           didn't really run: failures, skips, suites whose tests all took ~0 ms, a test
           count that dropped against a baseline report, and missing required env vars.

Output is plain text grouped by check, with path:line anchors. These are LEADS, not
verdicts: every hit needs a human or model to confirm it against the code. Heuristics are
tuned for TypeScript/JavaScript, Python and Go.

Exit status: 0 = nothing flagged, 1 = something flagged, 2 = usage or git error.
Python 3.9+, standard library only.
"""

import argparse
import fnmatch
import json
import os
import re
import subprocess
import sys
import xml.etree.ElementTree as ET
from collections import defaultdict

CODE_EXT = {".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py", ".go"}
TEST_PATH = re.compile(
    r"(^|/)(test|tests|__tests__|spec|specs|e2e|fixtures?|__mocks__)(/|$)"
    r"|\.(test|spec)\.[a-z]+$|_test\.(py|go)$|(^|/)test_[^/]*\.py$|(^|/)conftest\.py$"
)
BARREL = re.compile(r"(^|/)(index\.(ts|tsx|js|mjs|cjs)|__init__\.py)$")
ENTRY_NAME = re.compile(
    r"(^|/)(main|index|server|app|cli|composition|bootstrap|worker|handler|lambda|wsgi|asgi|manage|__main__)\.[a-z]+$"
    r"|(^|/)cmd/[^/]+/main\.go$"
)
CONFIG_PATH = re.compile(r"(^|/)(config|configuration|settings|env)(\.[a-z]+|/)", re.I)


def is_test(path):
    return bool(TEST_PATH.search(path))


def ext(path):
    return os.path.splitext(path)[1].lower()


# ---------------------------------------------------------------- git helpers

def git(repo, *args, check=True):
    proc = subprocess.run(["git", "-C", repo] + list(args), capture_output=True, text=True)
    if check and proc.returncode != 0:
        sys.stderr.write("git %s failed: %s\n" % (" ".join(args), proc.stderr.strip()))
        sys.exit(2)
    return proc.stdout


def resolve_base(repo, base):
    if base:
        return git(repo, "merge-base", base, "HEAD").strip() or base
    for cand in ("origin/main", "origin/master", "main", "master"):
        out = subprocess.run(["git", "-C", repo, "merge-base", cand, "HEAD"], capture_output=True, text=True)
        if out.returncode == 0 and out.stdout.strip():
            return out.stdout.strip()
    sys.stderr.write("could not find a base; pass --base\n")
    sys.exit(2)


def added_lines(repo, base, head):
    """Yield (path, lineno, text) for every added line in base...head (plus worktree if head is None)."""
    args = ["diff", "--unified=0", "--no-color", "--no-ext-diff"]
    args += [base + "..." + head] if head else [base]
    out = git(repo, *args)
    path, lineno = None, 0
    for raw in out.splitlines():
        if raw.startswith("+++ "):
            p = raw[4:]
            path = None if p == "/dev/null" else (p[2:] if p.startswith("b/") else p)
        elif raw.startswith("@@"):
            m = re.search(r"\+(\d+)(?:,(\d+))?", raw)
            lineno = int(m.group(1)) if m else 0
        elif raw.startswith("+") and not raw.startswith("+++") and path:
            yield path, lineno, raw[1:]
            lineno += 1
    if head is None:  # worktree mode: new files stay untracked until committed
        for path in untracked(repo):
            try:
                with open(os.path.join(repo, path), errors="replace") as fh:
                    for i, line in enumerate(fh, 1):
                        yield path, i, line.rstrip("\n")
            except OSError:
                pass


def untracked(repo):
    return [f for f in git(repo, "ls-files", "--others", "--exclude-standard").splitlines() if f]


def in_scope(path, paths):
    """True when no --paths filter was given, or path matches one (file, directory prefix, or glob)."""
    if not paths:
        return True
    for p in paths:
        p = p.rstrip("/")
        if path == p or path.startswith(p + "/") or fnmatch.fnmatch(path, p):
            return True
    return False


def files_at(repo, ref):
    return set(git(repo, "ls-tree", "-r", "--name-only", ref).splitlines())


def changed_files(repo, base, head):
    args = ["diff", "--name-only", base + "..." + head] if head else ["diff", "--name-only", base]
    files = [f for f in git(repo, *args).splitlines() if f]
    return files + (untracked(repo) if head is None else [])


# ---------------------------------------------------------------- wiring

EXPORT_PATTERNS = {
    "js": [
        re.compile(r"^\s*export\s+(?:default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)"),
        re.compile(r"^\s*export\s+(?:default\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)"),
        re.compile(r"^\s*export\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)"),
    ],
    "py": [re.compile(r"^(?:async\s+)?def\s+([A-Za-z]\w*)\s*\("), re.compile(r"^class\s+([A-Za-z]\w*)")],
    "go": [re.compile(r"^func\s+(?:\([^)]*\)\s*)?([A-Z]\w*)\s*\("), re.compile(r"^type\s+([A-Z]\w*)\s")],
}
JS_EXPORT_LIST = re.compile(r"^\s*export\s*\{([^}]*)\}\s*(?:;|$)")
REEXPORT = re.compile(r"^\s*export\s+(?:\*|\{[^}]*\})\s+from\s")
# a symbol mentioned only inside type positions is still "used", so we don't special-case types


def lang_of(path):
    e = ext(path)
    if e in (".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"):
        return "js"
    if e == ".py":
        return "py"
    if e == ".go":
        return "go"
    return None


def new_exports(repo, base, head, paths=None):
    found = []  # (symbol, path, line)
    for path, ln, text in added_lines(repo, base, head):
        lang = lang_of(path)
        if not lang or is_test(path) or not in_scope(path, paths):
            continue
        for pat in EXPORT_PATTERNS[lang]:
            m = pat.match(text)
            if m and not m.group(1).startswith("_"):
                found.append((m.group(1), path, ln))
                break
        else:
            if lang == "js":
                m = JS_EXPORT_LIST.match(text)
                if m and not REEXPORT.match(text):
                    for part in m.group(1).split(","):
                        name = part.strip().split(" as ")[-1].strip()
                        if name and name != "default" and re.match(r"^[A-Za-z_$][\w$]*$", name):
                            found.append((name, path, ln))
    return found


_BARREL_CACHE = {}


def reexports(repo, head, path, sym):
    """True if the barrel file only re-exports sym (export {...} from / from .x import ...)."""
    key = (head, path)
    if key not in _BARREL_CACHE:
        if head:
            text = git(repo, "show", "%s:%s" % (head, path), check=False)
        else:
            try:
                with open(os.path.join(repo, path), errors="replace") as fh:
                    text = fh.read()
            except OSError:
                text = ""
        names = set()
        for m in re.finditer(r"export\s*(?:type\s*)?\{([^}]*)\}\s*from\s", text, re.S):
            for part in m.group(1).split(","):
                part = part.strip()
                if part:
                    names.update(x.strip() for x in part.replace(" as ", " ").split())
        for m in re.finditer(r"^\s*from\s+\.[\w.]*\s+import\s+\(?([^)\n]*(?:\n[^)]*)?)\)?", text, re.M):
            names.update(x.strip() for x in re.split(r"[,\s]+", m.group(1).replace(" as ", " ")) if x.strip())
        _BARREL_CACHE[key] = names
    return sym in _BARREL_CACHE[key]


def references(repo, symbol, worktree=False):
    extra = ["--untracked"] if worktree else []
    out = git(repo, "grep", "-n", "-w", "--no-color", "-I", *extra, "-e", symbol, "--", ".", check=False)
    refs = []
    for line in out.splitlines():
        parts = line.split(":", 2)
        if len(parts) == 3 and ext(parts[0]) in CODE_EXT:
            refs.append((parts[0], int(parts[1]), parts[2]))
    return refs


def cmd_wiring(a):
    repo = a.repo
    base = resolve_base(repo, a.base)
    head = None if a.worktree else a.head
    base_files = files_at(repo, base)
    exports = new_exports(repo, base, head, a.paths)
    if a.max_symbols and len(exports) > a.max_symbols:
        sys.stderr.write("note: %d new exports; checking the first %d (raise --max-symbols)\n"
                         % (len(exports), a.max_symbols))
        exports = exports[: a.max_symbols]

    by_symbol = {}
    internal = set()
    for sym, path, ln in exports:
        prod, tests, barrels = set(), set(), set()
        for rpath, rln, rtext in references(repo, sym, head is None):
            if rpath == path:
                if rln != ln:
                    internal.add((sym, path, ln))
                continue
            if is_test(rpath):
                tests.add(rpath)
            elif BARREL.search(rpath) and reexports(repo, head, rpath, sym):
                barrels.add(rpath)
            else:
                prod.add(rpath)
        by_symbol[(sym, path, ln)] = (prod, tests, barrels)

    # File-level liveness fixed point: a file is live if it existed at BASE (assumed reachable),
    # looks like an entry point, or is referenced from a live file through a symbol it exports.
    live = set(f for f in base_files)
    changed = changed_files(repo, base, head)
    for f in changed:
        if ENTRY_NAME.search(f) and not is_test(f):
            live.add(f)
    wired = set()
    progress = True
    while progress:
        progress = False
        for key, (prod, _t, _b) in by_symbol.items():
            if key in wired:
                continue
            if any(p in live for p in prod) or (key in internal and key[1] in live):
                wired.add(key)
                if key[1] not in live:
                    live.add(key[1])
                progress = True

    flagged = [(k, v) for k, v in by_symbol.items() if k not in wired]
    cfg = [c for c in config_keys_unread(repo, base, head) if in_scope(c[0], a.paths)]

    print("wiring: %d new exports in %s...%s, %d not reached from production"
          % (len(by_symbol), base[:10], (head or "WORKTREE")[:10], len(flagged)))
    print("(liveness assumes every file that existed at the base is reachable; entry points matched by name)")
    for (sym, path, ln), (prod, tests, barrels) in sorted(flagged, key=lambda x: (x[0][1], x[0][2])):
        if not prod and not tests and key_internal(sym, path, ln, internal):
            why = "used only inside its own file, and nothing in production reaches that file"
        elif not prod and not tests:
            why = "no references anywhere"
        elif not prod:
            why = "used only by tests (%s)" % ", ".join(sorted(tests)[:3])
        else:
            why = "used only by files that are themselves unreached: %s" % ", ".join(sorted(prod)[:3])
        if barrels:
            why += "; re-exported by %s" % ", ".join(sorted(barrels)[:2])
        print("  UNWIRED %s:%d  %s — %s" % (path, ln, sym, why))
    if cfg:
        print("config keys added and never read outside the config module (heuristic):")
        for path, ln, key in cfg:
            print("  UNREAD  %s:%d  %s" % (path, ln, key))
    return 1 if (flagged or cfg) else 0


def key_internal(sym, path, ln, internal):
    return (sym, path, ln) in internal


CFG_FIELD = re.compile(r"^\s*([a-z_][A-Za-z0-9_]*)\s*[:=]\s*(?!.*=>).*?(\b(env|environ|getenv)\b.*|\.\s*[A-Z][A-Z0-9_]{2,}\b.*|['\"][A-Z][A-Z0-9_]{2,}['\"].*)$")


def config_keys_unread(repo, base, head):
    out = []
    for path, ln, text in added_lines(repo, base, head):
        if is_test(path) or not CONFIG_PATH.search(path) or not lang_of(path):
            continue
        m = CFG_FIELD.match(text)
        if not m:
            continue
        key = m.group(1)
        if key in ("env", "environ", "return", "const", "let", "var"):
            continue
        used = False
        for rpath, _rln, rtext in references(repo, key):
            if rpath == path or is_test(rpath):
                continue
            if re.search(r"[.\[]\s*['\"]?" + re.escape(key) + r"\b", rtext) or re.search(r"\{[^}]*\b" + re.escape(key) + r"\b[^}]*\}\s*=", rtext):
                used = True
                break
        if not used:
            out.append((path, ln, key))
    return out


# ---------------------------------------------------------------- hygiene

def H(name, pattern, where="any", flags=0, why=""):
    return {"name": name, "re": re.compile(pattern, flags), "where": where, "why": why}


HYGIENE = [
    H("deferral-marker", r"\b(TODO|FIXME|XXX|HACK)\b", "any",
      why="unfinished work left in the diff; finish it or disposition it in the plan's ledger"),
    H("placeholder", r"not\s+implemented|NotImplementedError|unimplemented!\(|todo!\(|throw\s+new\s+Error\(\s*['\"]stub", "code",
      re.I, "a stub standing in for real behavior"),
    H("local-path", r"(/Users/[A-Za-z0-9._-]+/|/home/[A-Za-z0-9._-]+/|[A-Z]:\\\\Users\\\\)", "any",
      why="a path on someone's machine; nobody else can open it — commit the document and cite a repo path"),
    H("chat-link", r"(claude\.ai/(chat|share|artifact|public)|chatgpt\.com/(share|c/)|chat\.openai\.com)", "any",
      re.I, "a chat or artifact link cited as a source; commit the content to the repo"),
    H("focused-or-skipped-test", r"(\.(only|skip)\s*\(|\bx(it|describe|test)\s*\(|\bf(it|describe)\s*\(|@pytest\.mark\.skip|\bt\.Skip\()", "test",
      why="a focused or skipped test changes what the suite runs"),
    H("silent-test-guard", r"if\s*\(?\s*(!|not\s+)\s*((process\.env|os\.environ|os\.getenv)[^)\n]*|\w*(url|dsn|conn\w*|database\w*|db\w*|redis\w*|endpoint)\b)\s*\)?\s*:?\s*\{?\s*return\b", "test",
      re.I, 
"returns early when a service/env is missing, so the test passes without running; skip loudly and fail under CI"),
    H("sleep-in-test", r"(\bsleep\s*\(|time\.sleep\s*\(|setTimeout\s*\([^,]*,\s*\d{3,}|waitForTimeout\s*\(\s*\d{3,})", "test",
      why="sleep-then-assert flakes and can pass without proving anything; wait for a condition"),
    H("fail-open-secret", r"if\s*\(?\s*(!|not\s+)\s*[\w.]*(secret|key|token|password)\w*\s*\)?\s*:?\s*\{?\s*return\s+(true|True)\b", "code",
      re.I, "a missing secret disables the check instead of refusing"),
    H("non-constant-time-compare", r"\b[\w.\]\['\"-]*(sig|signature|hmac|digest|secret|token)[\w\]'\"]*\s*(===|!==|==|!=)\s*[\w.]+|[\w.\]\['\"-]+\s*(===|!==|==|!=)\s*[\w.]*(sig|signature|hmac|digest|secret)\w*\b",
      "code", re.I, "compare secrets with timingSafeEqual / hmac.compare_digest"),
    H("floating-promise", r"^\s*void\s+(\(\s*async\b|[A-Za-z_$][\w$.]*\s*\()", "code",
      why="a promise nobody awaits or catches; an error ends the loop and, in Node, the process"),
    H("async-interval", r"setInterval\s*\(\s*(async\b|\(\)\s*=>\s*\{?\s*$|\(\)\s*=>\s*\{?\s*void\b)", "code",
      why="overlapping runs when one is slow, and an unhandled rejection if it throws; guard in-flight and catch"),
    H("unordered-limit-1", r"\blimit\s+1\b", "code", re.I,
      "LIMIT 1 without ORDER BY (and a full key) returns an arbitrary row"),
    H("swallowed-error", r"(catch\s*(\([^)]*\))?\s*\{\s*\}|except[^:\n]*:\s*pass\b)", "code",
      why="an error is swallowed; the failure becomes invisible"),
    H("env-outside-config", r"(process\.env\b|os\.environ\b|os\.getenv\s*\(|Deno\.env\.get)", "code-nonconfig",
      why="configuration read outside the config module: unvalidated and invisible to config tests"),
]


def config_defaults(repo, head):
    """Literal defaults declared in config modules at HEAD (numbers >= 10, strings >= 3 chars)."""
    vals = set()
    ref = head or "HEAD"
    for f in git(repo, "ls-tree", "-r", "--name-only", ref).splitlines():
        if is_test(f) or not CONFIG_PATH.search(f) or not lang_of(f):
            continue
        text = git(repo, "show", "%s:%s" % (ref, f), check=False)
        for m in re.finditer(r"(\?\?|\|\||default\s*=|\.default\(|getenv\([^,]+,|get\([^,]+,)\s*(['\"]?)([\w .:/\[\]-]+)\2", text):
            v = m.group(3).strip()
            if (v.isdigit() and int(v) >= 10) or (not v.isdigit() and len(v) >= 3 and v.lower() not in ("true", "false", "none", "null", "undefined")):
                vals.add(v)
    return vals


def cmd_hygiene(a):
    repo = a.repo
    base = resolve_base(repo, a.base)
    head = None if a.worktree else a.head
    hits = defaultdict(list)
    lines = [l for l in added_lines(repo, base, head) if in_scope(l[0], a.paths)]
    by_file = defaultdict(list)
    for path, ln, text in lines:
        by_file[path].append((ln, text))
    defaults = config_defaults(repo, head) if not a.no_config_literals else set()

    for path, ln, text in lines:
        test = is_test(path)
        code = lang_of(path) is not None
        for chk in HYGIENE:
            w = chk["where"]
            if w == "test" and not test:
                continue
            if w in ("code", "code-nonconfig") and (not code or test):
                continue
            if w == "code-nonconfig" and CONFIG_PATH.search(path):
                continue
            if chk["re"].search(text):
                if chk["name"] == "unordered-limit-1":
                    window = " ".join(t for l, t in by_file[path] if ln - 4 <= l <= ln)
                    if re.search(r"order\s+by", window, re.I) or re.search(r"select\s+(1|exists|count)\b", window, re.I):
                        continue
                if chk["name"] == "non-constant-time-compare" and re.search(r"timingSafeEqual|compare_digest|ConstantTimeCompare", text):
                    continue
                hits[chk["name"]].append((path, ln, text.strip()))
        if defaults and code and not test and not CONFIG_PATH.search(path):
            for v in defaults:
                if literal_matches(v, text):
                    hits["literal-duplicates-config-default"].append((path, ln, "%s  [config default %r]" % (text.strip(), v)))
                    break

    whys = {c["name"]: c["why"] for c in HYGIENE}
    whys["literal-duplicates-config-default"] = "a value the config module owns is hard-coded here; config changes won't reach it"
    total = sum(len(v) for v in hits.values())
    print("hygiene: %d lead(s) in added lines of %s...%s" % (total, base[:10], (head or "WORKTREE")[:10]))
    for name in sorted(hits):
        print("[%s] %s" % (name, whys.get(name, "")))
        for path, ln, text in hits[name][: a.max_per_check]:
            print("  %s:%d  %s" % (path, ln, text[:160]))
        if len(hits[name]) > a.max_per_check:
            print("  … %d more" % (len(hits[name]) - a.max_per_check))

    shape = [] if a.paths else commit_shape(repo, base, head)
    if shape:
        print("[commit-shape] commits whose size doesn't fit a narrow subject — check the message describes the content")
        for line in shape:
            print("  " + line)
    return 1 if (total or shape) else 0


TIME_UNIT = r"(ms|s|sec|secs|seconds?|mins?|minutes?|hours?)"
NUMERIC_CONTEXT = r"(timeout|ttl|interval|seconds|secs?|ms|attempts|retries|max\w*|limit|expiry|expires|heartbeat\w*|budget\w*|delay|backoff)"


def literal_matches(v, text):
    """A config default re-typed at a use site. Strings must be distinctive (contain -:[]/_.@);
    numbers only count next to a time unit or a timing/limit name, to keep noise down."""
    if v.isdigit():
        n = re.escape(v)
        return bool(
            re.search(r"(?<![\w.])" + n + r"\s*" + TIME_UNIT + r"\b", text, re.I)
            or re.search(NUMERIC_CONTEXT + r"\w*['\"]?\s*[:=]\s*" + n + r"(?![\w.])", text, re.I)
        )
    if len(v) < 4 or not re.search(r"[-:\[\]/_.@]", v) or v.startswith(("http", "/", ".")):
        return False
    return bool(re.search(r"['\"`]" + re.escape(v) + r"['\"`]", text))


NARROW_SUBJECT = re.compile(r"\b(fix|typo|small|minor|tiny|tweak|nit|bump|cleanup|chore)\b", re.I)


def commit_shape(repo, base, head):
    if not head:
        return []
    out = []
    log = git(repo, "log", "--format=%H%x09%s", "--no-merges", base + ".." + head)
    for row in log.splitlines():
        sha, _, subject = row.partition("\t")
        stat = git(repo, "show", "--shortstat", "--format=", sha)
        m_files = re.search(r"(\d+) files? changed", stat)
        m_ins = re.search(r"(\d+) insertions?", stat)
        files = int(m_files.group(1)) if m_files else 0
        ins = int(m_ins.group(1)) if m_ins else 0
        if (NARROW_SUBJECT.search(subject) and (ins > 800 or files > 25)) or ins > 5000:
            out.append("%s  +%d lines, %d files  %s" % (sha[:8], ins, files, subject[:90]))
    return out


# ---------------------------------------------------------------- suite

def parse_junit(path):
    cases = []
    try:
        root = ET.parse(path).getroot()
    except ET.ParseError as e:
        sys.stderr.write("cannot parse %s: %s\n" % (path, e))
        return cases
    for tc in root.iter("testcase"):
        status = "passed"
        if tc.find("failure") is not None or tc.find("error") is not None:
            status = "failed"
        elif tc.find("skipped") is not None:
            status = "skipped"
        try:
            t = float(tc.get("time") or 0)
        except ValueError:
            t = 0.0
        suite = tc.get("file") or tc.get("classname") or "?"
        cases.append({"suite": suite, "name": tc.get("name") or "?", "status": status, "time": t})
    return cases


def parse_json_report(path):
    with open(path) as fh:
        data = json.load(fh)
    cases = []
    for suite in data.get("testResults", []):  # jest / vitest json reporter
        fname = suite.get("name") or suite.get("testFilePath") or "?"
        for t in suite.get("assertionResults", []):
            st = t.get("status", "")
            status = "passed" if st == "passed" else "failed" if st == "failed" else "skipped"
            dur = t.get("duration")
            cases.append({"suite": fname, "name": t.get("fullName") or t.get("title") or "?",
                          "status": status, "time": (dur or 0) / 1000.0})
    return cases


def load_reports(paths):
    cases = []
    for p in paths:
        if p.endswith(".json"):
            cases += parse_json_report(p)
        else:
            cases += parse_junit(p)
    return cases


def cmd_suite(a):
    cases = load_reports(a.reports)
    if not cases:
        print("suite: no test cases found in %s — the run produced no results" % ", ".join(a.reports))
        return 1
    problems = 0
    total = len(cases)
    failed = [c for c in cases if c["status"] == "failed"]
    skipped = [c for c in cases if c["status"] == "skipped"]
    print("suite: %d tests — %d passed, %d failed, %d skipped"
          % (total, total - len(failed) - len(skipped), len(failed), len(skipped)))
    if failed:
        problems += 1
        print("[failed]")
        for c in failed[:30]:
            print("  %s :: %s" % (c["suite"], c["name"]))
    if skipped:
        problems += 1
        print("[skipped] every skip needs a stated reason")
        for c in skipped[:30]:
            print("  %s :: %s" % (c["suite"], c["name"]))
    by_suite = defaultdict(list)
    for c in cases:
        by_suite[c["suite"]].append(c)
    fast = []
    for s, cs in sorted(by_suite.items()):
        ran = [c for c in cs if c["status"] == "passed"]
        if len(ran) >= a.min_suite and all(c["time"] <= a.zero_ms / 1000.0 for c in ran):
            fast.append((s, len(ran)))
    if fast:
        problems += 1
        print("[near-zero-time suites] every passing test took <= %g ms — check they actually ran "
              "(pure unit tests can be this fast; DB/HTTP/integration tests can't)" % a.zero_ms)
        for s, n in fast:
            print("  %s (%d tests)" % (s, n))
    if a.baseline:
        base_cases = load_reports(a.baseline)
        if base_cases and total < len(base_cases):
            problems += 1
            base_suites = set(c["suite"] for c in base_cases)
            gone = sorted(base_suites - set(by_suite))
            print("[count-drop] %d tests now vs %d in the baseline — files may have stopped loading"
                  % (total, len(base_cases)))
            for s in gone[:30]:
                print("  missing suite: %s" % s)
    missing_env = [v for v in (a.require_env or []) if not os.environ.get(v)]
    if missing_env:
        problems += 1
        print("[missing-env] required for this run but unset: %s — layers that need them did not really run"
              % ", ".join(missing_env))
    if a.scan_tests:
        guards = scan_silent_guards(a.scan_tests)
        if guards:
            problems += 1
            print("[silent-test-guard] helpers that return early when a service/env is missing:")
            for g in guards[:30]:
                print("  " + g)
    if not problems:
        print("ok: no failures, skips, near-zero suites, count drop, or missing env")
    return 1 if problems else 0


SILENT_GUARD = HYGIENE[5]["re"]


def scan_silent_guards(root):
    out = []
    for dirpath, dirs, files in os.walk(root):
        dirs[:] = [d for d in dirs if d not in ("node_modules", ".git", "dist", "build", ".venv", "venv")]
        for f in files:
            if ext(f) not in CODE_EXT:
                continue
            p = os.path.join(dirpath, f)
            try:
                with open(p, errors="replace") as fh:
                    for i, line in enumerate(fh, 1):
                        if SILENT_GUARD.search(line):
                            out.append("%s:%d  %s" % (p, i, line.strip()[:140]))
            except OSError:
                pass
    return out


# ---------------------------------------------------------------- cli

def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    sub = p.add_subparsers(dest="cmd", required=True)

    def diff_args(sp):
        sp.add_argument("--repo", default=".", help="repository path (default: .)")
        sp.add_argument("--base", help="base ref; default: merge-base with origin/main, origin/master, main or master")
        sp.add_argument("--head", default="HEAD", help="head ref (default: HEAD)")
        sp.add_argument("--worktree", action="store_true", help="diff the working tree against the base instead of HEAD")
        sp.add_argument("--paths", nargs="*", help="only report on these files, directories or globs (e.g. a task's owned files)")

    w = sub.add_parser("wiring", help="new exports and config keys nothing in production reaches")
    diff_args(w)
    w.add_argument("--max-symbols", type=int, default=400)
    w.set_defaults(func=cmd_wiring)

    h = sub.add_parser("hygiene", help="pattern leads in the added lines")
    diff_args(h)
    h.add_argument("--max-per-check", type=int, default=25)
    h.add_argument("--no-config-literals", action="store_true", help="skip the config-default literal check")
    h.set_defaults(func=cmd_hygiene)

    s = sub.add_parser("suite", help="did the green run really run?")
    s.add_argument("reports", nargs="+", help="JUnit XML or Jest/Vitest JSON report files")
    s.add_argument("--baseline", nargs="*", help="report(s) from the base branch or last CI run")
    s.add_argument("--require-env", nargs="*", help="env vars the run needs (e.g. DATABASE_URL)")
    s.add_argument("--scan-tests", help="directory to scan for silent early-return guards in test helpers")
    s.add_argument("--zero-ms", type=float, default=1.0, help="per-test time treated as 'didn't run' (ms)")
    s.add_argument("--min-suite", type=int, default=2, help="minimum passing tests for a suite to be flagged")
    s.set_defaults(func=cmd_suite)

    a = p.parse_args(argv)
    return a.func(a)


if __name__ == "__main__":
    sys.exit(main())
