#!/usr/bin/env python3
"""Fetch Apple's live App Review sources as exact text, sliced for review lanes.

    python3 fetch_sources.py <outdir> [--months 12]
    python3 fetch_sources.py <outdir> --rule 5.1.2 --rule 2.5.19   # print exact rule text
    python3 fetch_sources.py --help

Writes into <outdir>:
  guidelines.txt                 the full App Store Review Guidelines as plain text
  section-<1..5|intro|before|after>.txt   one file per top-level section (lane slices)
  news.md                        Apple Developer News items from the last N months (date, title, URL, text)
  upcoming-requirements.txt      developer.apple.com/news/upcoming-requirements/ as text (requirements in force)
  submitting.txt                 developer.apple.com/app-store/submitting/ as text (announced upload minimums)

Fetches with curl (no Python SSL dependency) and parses with the standard library only.
Exits non-zero if the guidelines can't be fetched — the skill must not review from memory.
"""
import datetime
import os
import re
import subprocess
import sys
from html.parser import HTMLParser

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 "
      "(KHTML, like Gecko) Version/17.0 Safari/605.1.15")
GUIDELINES = "https://developer.apple.com/app-store/review/guidelines/"
NEWS = "https://developer.apple.com/news/"
UPCOMING = "https://developer.apple.com/news/upcoming-requirements/"
SUBMITTING = "https://developer.apple.com/app-store/submitting/"


class _Text(HTMLParser):
    BLOCK = {"p", "li", "h1", "h2", "h3", "h4", "h5", "br", "div", "tr"}
    SKIP = {"script", "style", "nav", "footer", "header"}

    def __init__(self):
        super().__init__()
        self.out, self.skip = [], 0

    def handle_starttag(self, tag, attrs):
        if tag in self.SKIP:
            self.skip += 1
        if tag in self.BLOCK:
            self.out.append("\n")
        if tag in ("h2", "h3"):
            self.out.append("## ")
        if tag == "li":
            self.out.append("- ")

    def handle_endtag(self, tag):
        if tag in self.SKIP:
            self.skip = max(0, self.skip - 1)

    def handle_data(self, data):
        if not self.skip:
            self.out.append(data)


def to_text(raw_html):
    p = _Text()
    p.feed(raw_html)
    t = re.sub(r"[ \t]+", " ", "".join(p.out))
    t = "\n".join(l for l in t.split("\n") if l.strip() not in ("-", "##", "## -"))
    return re.sub(r"\n\s*\n+", "\n\n", t).strip()


def fetch(url):
    r = subprocess.run(["curl", "-sSL", "--max-time", "60", "-A", UA, url],
                       capture_output=True)
    if r.returncode != 0 or len(r.stdout) < 2000:
        raise RuntimeError(f"fetch failed for {url}: curl exit {r.returncode}, "
                           f"{len(r.stdout)} bytes, {r.stderr.decode(errors='replace')[:200]}")
    return r.stdout.decode("utf-8", "replace")


def sections(text):
    parts = re.split(r"\n## (?=(?:\d\. |Before You Submit|After You Submit))", text)
    out = {}
    for p in parts:
        m = re.match(r"(\d)\. ", p)
        if m:
            key = m.group(1)
        elif p.startswith("Before You Submit"):
            key = "before"
        elif p.startswith("After You Submit"):
            key = "after"
        else:
            key = "intro"
        out[key] = out[key] + "\n" + p if key in out else p
    return out


def rule(text, num):
    """Exact text of one rule (e.g. '5.1.2', '2.3.1', '3.1.1(a)', '5.1.1(v)') including its children.

    Most sub-clauses are written as "- (v) ..." lines under their parent rule, while a few
    (3.1.1(a), 3.1.2(a)) are written inline as "- 3.1.1(a) ...". Try the inline form first,
    then fall back to the parent rule's "- (x)" child.
    """
    sec = re.match(r"^(\d)(?:\.0)?$", num)
    if sec:  # "4.0" is how rejection letters cite a whole section ("Guideline 4.0 - Design")
        body = sections(text).get(sec.group(1))
        return body.split("\n- ", 1)[0].strip() + "\n(section intro — cite the specific rule when one applies)" if body else None
    lines = text.split("\n")
    sib = re.compile(r"^- (\d+\.\d+(?:\.\d+)?(?:\([a-z]+\))?)(?=[\s:]|$)")

    def block(start, prefix):
        for j in range(start + 1, len(lines)):
            m = sib.match(lines[j])
            child = m and (m.group(1) == prefix or m.group(1).startswith(prefix + ".")
                           or m.group(1).startswith(prefix + "("))
            if (m and not child) or lines[j].startswith("## "):
                return start, j
        return start, len(lines)

    head = re.compile(r"^- " + re.escape(num) + r"(?=[\s:]|$)")
    start = next((i for i, l in enumerate(lines) if head.match(l)), None)
    if start is not None:
        s, e = block(start, num)
        return "\n".join(lines[s:e]).strip()

    m = re.match(r"^(\d+\.\d+(?:\.\d+)?)\(([a-z]+)\)$", num)
    if not m:
        return None
    parent, sub = m.group(1), m.group(2)
    phead = re.compile(r"^- " + re.escape(parent) + r"(?=[\s:]|$)")
    pstart = next((i for i, l in enumerate(lines) if phead.match(l)), None)
    if pstart is None:
        return None
    ps, pe = block(pstart, parent)
    cstart = next((i for i in range(ps + 1, pe) if lines[i].startswith(f"- ({sub})")), None)
    if cstart is None:
        return None
    cend = next((i for i in range(cstart + 1, pe) if re.match(r"^- \([a-z]+\)", lines[i])), pe)
    return (lines[ps].strip() + "\n…\n" + "\n".join(lines[cstart:cend]).strip())


def news_items(raw_html, months):
    cutoff = datetime.date.today() - datetime.timedelta(days=31 * months)
    items = []
    for m in re.finditer(r'<article id="article-([a-z0-9]+)"(.*?)</article>', raw_html, re.S):
        nid, body = m.group(1), m.group(2)
        title = re.search(r"<h2>(.*?)</h2>", body, re.S)
        date = re.search(r'article-date">\s*([A-Z][a-z]+ \d{1,2}, \d{4})', body)
        if not (title and date):
            continue
        try:
            d = datetime.datetime.strptime(date.group(1), "%B %d, %Y").date()
        except ValueError:
            continue
        if d < cutoff:
            continue
        text = re.search(r'<span class="article-text">(.*)', body, re.S)
        txt = to_text(text.group(1)) if text else ""
        items.append((d, to_text(title.group(1)), f"https://developer.apple.com/news/?id={nid}", txt))
    return items


def main(argv):
    if len(argv) < 2 or argv[1] in ("-h", "--help"):
        print(__doc__)
        return 0 if len(argv) >= 2 else 2
    outdir = argv[1]
    if outdir.startswith("-"):
        print(f"first argument must be the output directory, got {outdir!r}\n{__doc__}", file=sys.stderr)
        return 2
    rules = [argv[i + 1] for i, a in enumerate(argv) if a == "--rule" and i + 1 < len(argv)]
    months = int(argv[argv.index("--months") + 1]) if "--months" in argv else 12
    os.makedirs(outdir, exist_ok=True)
    gpath = os.path.join(outdir, "guidelines.txt")

    if rules:
        if not os.path.exists(gpath):
            print(f"no {gpath} yet — run without --rule first", file=sys.stderr)
            return 1
        text = open(gpath, encoding="utf-8").read()
        for r in rules:
            print(f"===== {r}\n{rule(text, r) or 'NOT FOUND in live text — renumbered or removed?'}\n")
        return 0

    try:
        text = to_text(fetch(GUIDELINES))
    except RuntimeError as e:
        print(f"ABORT: couldn't fetch the live App Store Review Guidelines ({e}).", file=sys.stderr)
        return 1
    open(gpath, "w", encoding="utf-8").write(text)
    for k, v in sections(text).items():
        open(os.path.join(outdir, f"section-{k}.txt"), "w", encoding="utf-8").write(v)
    lu = re.search(r"Last Updated:\s*([A-Z][a-z]+ \d{1,2}, \d{4})", text)
    print(f"guidelines: {GUIDELINES}  Last Updated: {lu.group(1) if lu else 'NOT FOUND'}")
    for k, v in sections(text).items():
        print(f"  section-{k}.txt  {len(v)} chars")

    for name, url in (("news", NEWS), ("upcoming", UPCOMING), ("submitting", SUBMITTING)):
        try:
            raw = fetch(url)
        except RuntimeError as e:
            print(f"WARNING: {name} not fetched ({e}) — say so in the report", file=sys.stderr)
            continue
        if name == "news":
            items = news_items(raw, months)
            with open(os.path.join(outdir, "news.md"), "w", encoding="utf-8") as f:
                for d, t, u, txt in items:
                    f.write(f"## {d.isoformat()} — {t}\n{u}\n\n{txt}\n\n")
            print(f"news: {len(items)} items in the last {months} months -> news.md")
            for d, t, u, _ in items:
                print(f"  {d.isoformat()}  {t}  {u}")
        elif name == "upcoming":
            body = to_text(raw)
            i = body.find("## ", body.find("Upcoming Requirements") + 1)
            open(os.path.join(outdir, "upcoming-requirements.txt"), "w", encoding="utf-8").write(body[i:] if i > 0 else body)
            print(f"upcoming requirements (in force): {url} -> upcoming-requirements.txt")
        else:
            body = to_text(raw)
            open(os.path.join(outdir, "submitting.txt"), "w", encoding="utf-8").write(body)
            print(f"submitting (announced minimums): {url} -> submitting.txt")
            for m in re.finditer(r"[^\n]*(?:must be built with|must target|target iOS \d+|Starting [A-Z][a-z]+ \d{4})[^\n]*", body):
                print(f"  {m.group(0).strip()[:220]}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
