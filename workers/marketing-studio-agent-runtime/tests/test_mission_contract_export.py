from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

from yux_agent_runtime.mission_contracts import build_mission_wire_schema_json


RUNTIME_ROOT = Path(__file__).resolve().parents[1]
REPOSITORY_ROOT = RUNTIME_ROOT.parents[1]
SCHEMA_PATH = REPOSITORY_ROOT / "contracts" / "mission-supervisor" / "v1" / "mission-wire.schema.json"


def test_export_is_deterministic_and_strict() -> None:
    first = build_mission_wire_schema_json()
    second = build_mission_wire_schema_json()

    assert first == second
    assert first.endswith("\n")

    schema = json.loads(first)
    assert schema["$id"] == "https://yux.app/contracts/mission-supervisor/v1/mission-wire.schema.json"
    assert schema["$schema"] == "https://json-schema.org/draft/2020-12/schema"

    definitions = schema["$defs"]
    assert definitions["MissionPlanResponseWire"]["discriminator"]["propertyName"] == "kind"
    assert definitions["PlanProposalResponseWire"]["additionalProperties"] is False
    assert definitions["ClarificationResponseWire"]["additionalProperties"] is False
    assert definitions["PlanStepWire"]["additionalProperties"] is False


def test_committed_schema_matches_exporter() -> None:
    result = subprocess.run(
        [sys.executable, "scripts/export_mission_contracts.py", "--check"],
        cwd=RUNTIME_ROOT,
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stdout + result.stderr
    assert SCHEMA_PATH.read_text(encoding="utf-8") == build_mission_wire_schema_json()

