import json
import unittest

from yux_agent_runtime.harness import Harness
from yux_agent_runtime.providers import OpenRouterClient
from yux_agent_runtime.radar import build_radar_workflow_spec
from yux_agent_runtime.runtime_store import InMemoryAgentRuntimeStore
from yux_agent_runtime.workflow import StrategyWorkflowEngine


GLOBAL_PROMPT = {
    "id": "prompt-1",
    "system_prompt": "Voce e um agente comercial da YUX. Responda somente JSON valido.",
    "prompt_version": 1,
    "default_context_policy": {},
    "default_quality_gates": {},
}


def agent(profile_key):
    return {
        "id": f"profile-{profile_key}",
        "agent_type": profile_key,
        "name": profile_key,
        "base_prompt": "Siga o objetivo e devolva o contrato JSON solicitado.",
        "allowed_tools": [],
        "prompt_version": 1,
        "prompt_config": {},
        "context_policy": {},
        "quality_gates": {},
    }


def radar_result():
    return {
        "summary": "Empresa com fit para diagnostico comercial.",
        "source": {"type": "jina_reader", "url": "https://empresa.example"},
        "evidence": ["card-1"],
        "pain_hypotheses": ["Follow-up comercial pouco estruturado."],
        "recommended_offer": "Diagnostico YUX 48h",
        "score": {
            "total_score": 81,
            "fit_score": 84,
            "timing_score": 70,
            "pain_score": 82,
            "contactability_score": 80,
            "budget_score": 65,
            "personalization_score": 86,
            "explanation": "Fit e evidencia publica suficientes para revisao humana.",
        },
        "message": {
            "channel": "email",
            "subject": "Uma observacao sobre o comercial da Empresa",
            "body": "Encontrei um ponto publico que pode melhorar seu follow-up. Posso compartilhar?",
            "personalization_notes": "Revisao humana obrigatoria.",
            "evidence_used": ["card-1"],
        },
        "risk_flags": [],
        "policyDecision": {
            "status": "requires_human_approval",
            "canSendAutomatically": False,
            "canConvertToLead": True,
            "blockedReasons": [],
            "requiredReviewFields": ["message", "evidence", "risk_flags"],
        },
    }


class LiveWorkflowTest(unittest.TestCase):
    def make_engine(self, outputs):
        calls = []

        def transport(_url, _headers, payload, _method):
            calls.append(payload)
            content = outputs.pop(0)
            return {
                "id": f"chat-{len(calls)}",
                "model": payload["model"],
                "choices": [{"finish_reason": "stop", "message": {"content": content}}],
                "usage": {"prompt_tokens": 20, "completion_tokens": 30, "total_tokens": 50},
            }

        profiles = {
            key: agent(key)
            for key in ("ai_sdr_comercial_1", "growth_strategist")
        }
        harness = Harness(
            global_prompts={key: GLOBAL_PROMPT for key in profiles},
            routes=[{
                "agent_type": key,
                "routing_tier": "default",
                "provider": "openrouter",
                "model_name": "openai/gpt-4.1-mini",
                "max_output_tokens": 1800,
                "temperature": 0.2,
                "status": "active",
            } for key in profiles],
            tool_policies=[],
            budget_policies=[],
            llm_client=OpenRouterClient(api_key="or-key", transport=transport),
        )
        return StrategyWorkflowEngine(InMemoryAgentRuntimeStore(), harness=harness, agent_profiles=profiles), calls

    def test_radar_workflow_uses_openrouter_for_agent_and_synthesis(self):
        engine, calls = self.make_engine([
            json.dumps({"analysis": "fit empresa prioridade", "recommended_actions": ["Revisar abordagem"]}),
            json.dumps(radar_result()),
        ])

        result = engine.execute(
            message="Analise Empresa em Londrina",
            profile_key="ai_sdr_comercial_1",
            source="radar",
            organization_id="org-1",
            mode="commercial_radar_local_niche",
            workflow_spec=build_radar_workflow_spec(max_subagents=1),
            retrieval_context={
                "cards": [{"id": "card-1", "concept": "Follow-up disciplinado"}],
                "chunks": [],
                "company_name": "Empresa",
                "source_type": "jina_reader",
                "source_url": "https://empresa.example",
            },
        )

        self.assertEqual(len(calls), 2)
        self.assertEqual(result["synthesis"]["score"]["total_score"], 81)
        self.assertEqual(result["subagents"][0]["provider"], "openrouter")
        self.assertFalse(result["synthesis"]["policyDecision"]["canSendAutomatically"])

    def test_whatsapp_turn_uses_openrouter_and_returns_policy_ready_contract(self):
        conversation = {
            "reply": {"body": "Claro. Qual e hoje o principal gargalo comercial?", "language": "pt-BR"},
            "classification": {
                "intent": "qualification", "stage": "lead", "sentiment": "positive",
                "urgency": "low", "confidence": 0.91,
            },
            "qualification": {
                "fitScoreDelta": 5, "intentScoreDelta": 10,
                "objections": [], "nextBestAction": "Fazer pergunta SPIN",
            },
        }
        engine, calls = self.make_engine([json.dumps(conversation)])

        result = engine.execute(
            message="Tenho interesse, como funciona?",
            profile_key="ai_sdr_comercial_1",
            source="whatsapp",
            organization_id="org-1",
            conversation_id="conversation-1",
            mode="conversation_turn",
            retrieval_context={"cards": [], "chunks": [], "conversation_history": []},
            autonomy_policies=[{
                "profile_key": "ai_sdr_comercial_1", "channel": "whatsapp",
                "action_key": "send_external_message", "autonomy_mode": "suggestion", "status": "active",
            }],
        )

        self.assertEqual(len(calls), 1)
        self.assertEqual(result["synthesis"]["reply"]["language"], "pt-BR")
        self.assertEqual(result["policy"]["autonomy_mode"], "suggestion")


if __name__ == "__main__":
    unittest.main()
