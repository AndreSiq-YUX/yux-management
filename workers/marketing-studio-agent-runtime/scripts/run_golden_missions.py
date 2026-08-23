from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from yux_agent_runtime.golden_missions import evaluate_golden_manifest  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description="Run the deterministic YUX golden-mission promotion gate.")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    manifest = json.loads((ROOT / "golden-missions" / "manifest.json").read_text(encoding="utf-8"))
    corpus = json.loads((ROOT / "golden-missions" / "fixtures" / "corpus.json").read_text(encoding="utf-8"))
    report = evaluate_golden_manifest(manifest, corpus)
    rendered = json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(f"{rendered}\n", encoding="utf-8")
    print(rendered)
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    sys.exit(main())
