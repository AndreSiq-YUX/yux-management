from __future__ import annotations

import argparse
import sys
from pathlib import Path


RUNTIME_ROOT = Path(__file__).resolve().parents[1]
REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
SCHEMA_PATH = REPOSITORY_ROOT / "contracts" / "mission-supervisor" / "v1" / "mission-wire.schema.json"

sys.path.insert(0, str(RUNTIME_ROOT))

from yux_agent_runtime.mission_contracts import build_mission_wire_schema_json  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description="Export the canonical YUX Mission wire JSON Schema.")
    parser.add_argument("--check", action="store_true", help="Fail when the committed schema differs.")
    args = parser.parse_args()
    generated = build_mission_wire_schema_json()

    if args.check:
        if not SCHEMA_PATH.exists() or SCHEMA_PATH.read_text(encoding="utf-8") != generated:
            print(f"mission_wire_schema_drift:{SCHEMA_PATH}", file=sys.stderr)
            return 1
        return 0

    SCHEMA_PATH.parent.mkdir(parents=True, exist_ok=True)
    SCHEMA_PATH.write_text(generated, encoding="utf-8", newline="\n")
    print(SCHEMA_PATH)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
