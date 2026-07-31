from __future__ import annotations

import argparse
import time

from .queue import AgentEventQueue
from .runtime_store import InMemoryAgentRuntimeStore
from .workflow import StrategyWorkflowEngine


def process_once(store: InMemoryAgentRuntimeStore, worker_id: str = "local-worker") -> dict[str, object]:
    queue = AgentEventQueue(store)
    engine = StrategyWorkflowEngine(store)
    job = queue.claim_next_job(worker_id)
    if not job:
        return {"processed": False, "reason": "empty_queue"}
    payload = job.get("payload") or {}
    try:
        result = engine.execute(
            message=str(payload.get("message") or ""),
            profile_key=str(payload.get("profile_key") or "ai_sdr_comercial_1"),
            source="whatsapp",
            organization_id=job.get("organization_id"),
            client_id=job.get("client_id"),
            conversation_id=job.get("conversation_id"),
            assistant_id=payload.get("assistant_id"),
            mode="conversation_turn",
            autonomy_policies=payload.get("autonomy_policies") or [],
        )
        queue.complete_job(job["id"], result)
        return {"processed": True, "job_id": job["id"], "run_id": result["run"]["id"]}
    except Exception as error:
        queue.fail_job(job["id"], str(error))
        raise


def main() -> None:
    parser = argparse.ArgumentParser(description="YUX Agent Harness local worker")
    parser.add_argument("--loop", action="store_true", help="Keep polling the local in-memory queue")
    parser.add_argument("--sleep", type=float, default=2.0)
    args = parser.parse_args()
    store = InMemoryAgentRuntimeStore()
    while True:
        print(process_once(store))
        if not args.loop:
            break
        time.sleep(args.sleep)


if __name__ == "__main__":
    main()
