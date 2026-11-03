#!/usr/bin/env python3
"""Keep shared skill scripts identical across the skills that bundle them.

Each skill installs on its own (`npx skills add ... --skill X`), so a script or
reference several skills use has to ship inside each of them. The canonical copy is
the key in SHARED below; edit it there, then run this to copy it out.

  python3 tools/sync_shared_scripts.py          # copy canonical -> every consumer
  python3 tools/sync_shared_scripts.py --check  # exit 1 if any copy differs (for CI / pre-commit)
"""
import filecmp
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SHARED = {
    "skills/code-review/scripts/quality_gates.py": [
        "skills/implement/scripts/quality_gates.py",
        "skills/execute-plan/scripts/quality_gates.py",
        "skills/write-tests/scripts/quality_gates.py",
        "skills/test-loop/scripts/quality_gates.py",
        "skills/break-fix/scripts/quality_gates.py",
    ],
    # The owner-facing decision form (Phase 2 of implement, all of grill).
    "skills/grill/scripts/decision_form.mjs": ["skills/implement/scripts/decision_form.mjs"],
    "skills/grill/assets/decision-form/index.html": ["skills/implement/assets/decision-form/index.html"],
    "skills/grill/assets/decision-form/example.questions.json": ["skills/implement/assets/decision-form/example.questions.json"],
    "skills/grill/assets/decision-form/types.d.ts": ["skills/implement/assets/decision-form/types.d.ts"],
    "skills/grill/references/decision-form.md": ["skills/implement/references/decision-form.md"],
    "skills/implement/references/build-rules.md": [
        "skills/execute-plan/references/build-rules.md",
        "skills/test-loop/references/build-rules.md",
        "skills/break-fix/references/build-rules.md",
    ],
}


def main():
    check = "--check" in sys.argv[1:]
    drift = []
    for src, copies in SHARED.items():
        s = ROOT / src
        for dst in copies:
            d = ROOT / dst
            same = d.exists() and filecmp.cmp(s, d, shallow=False)
            if check:
                if not same:
                    drift.append(dst)
            elif not same:
                d.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(s, d)
                print("synced", dst)
    if check:
        for d in drift:
            print("out of sync:", d)
        return 1 if drift else 0
    return 0


if __name__ == "__main__":
    sys.exit(main())
