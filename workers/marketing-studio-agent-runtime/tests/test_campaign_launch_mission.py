from __future__ import annotations

import json
from copy import deepcopy
from decimal import Decimal
from hashlib import sha256

import pytest

from yux_agent_runtime.campaign_launch import CampaignLaunchClarificationRequired, CampaignLaunchError, CampaignLaunchSpecialistWorkflow
from yux_agent_runtime.mission_supervisor import MissionSupervisor
from yux_agent_runtime.model_profiles import ModelProfile


def request() -> dict:
    return {
        "organization_id": "org-1", "client_id": "client-1",
        "mission": {"id": "mission-1", "objective": "Lançar campanha", "parameters": {}, "autonomyEnvelope": {"maxTotalCostBrl": "1000"}},
        "company_context": {"icp": "Compradores de imóveis em São Paulo", "offer": "Consultoria imobiliária"},
        "brand_rules": {"tone": "consultivo", "forbiddenTerms": ["lucro garantido"]},
        "baseline": {"campaigns": []}, "readiness": {"providerPlatforms": ["meta"], "providerConnections": [{"id": "00000000-0000-4000-8000-000000000001", "platform": "meta"}]},
        "limits": {"maxMediaBudgetBrl": "1000"},
        "strategy_context": {"items": [{"id": "source-1", "content": "Atendimento consultivo sem promessa de retorno."}]},
        "allowed_source_ids": ["source-1"],
        "previous_revision": {"artifacts": {"funnelVersionId": "funnel-v1"}},
    }


def responses() -> list[dict]:
    return [
        {"brief": {"name": "Imóveis SP", "objective": "lead_generation", "offer": "Consultoria imobiliária", "platform": "meta", "providerConnectionId": "00000000-0000-4000-8000-000000000001", "dailyBudgetBrl": "50", "totalBudgetBrl": "500", "startsAt": "2026-09-01T00:00:00.000Z", "endsAt": None, "sourceIds": ["source-1"], "funnelArtifactRefs": ["funnel-v1"]}, "audience": {"targeting": {"region": "São Paulo", "intent": "comprar imóvel"}, "exclusions": ["clientes atuais"], "rationale": "ICP publicado", "sourceIds": ["source-1"]}, "sourceIds": ["source-1"], "risks": []},
        {"creativeSet": {"creatives": [{"format": "image", "headline": "Encontre seu próximo imóvel", "body": "Converse com um especialista.", "sourceIds": ["source-1"]}], "sourceIds": ["source-1"]}, "sourceIds": ["source-1"], "risks": []},
        {"verdict": {"approved": True, "forbiddenTerms": ["lucro garantido"], "findings": [], "sourceIds": ["source-1"]}},
        {"acquisition": {"landingPage": {"name": "Imóveis SP", "slug": "imoveis-sp", "title": "Encontre seu imóvel", "primaryCtaType": "form", "primaryCtaValue": "Quero conversar", "content": {"hero": "Consultoria imobiliária"}}, "leadForm": {"name": "Interesse", "submitLabel": "Enviar", "successMessage": "Recebemos seus dados", "consentCode": "campaign_lead", "consentVersion": "1", "privacyPolicyVersion": "1", "fields": [{"fieldName": "name", "crmFieldKey": "name", "required": True}, {"fieldName": "email", "crmFieldKey": "email", "required": True}]}, "trackingPlan": {"utm_source": "meta", "utm_medium": "paid_social", "utm_campaign": "imoveis_sp", "conversion_event": "lead", "landing_page_url": "https://preview.example.com/imoveis-sp"}, "sourceIds": ["source-1"]}, "measurement": {"primaryMetrics": ["leads", "qualified_leads", "attributed_revenue"], "leadingMetrics": ["impressions", "clicks", "ctr", "landing_conversion"], "attributionPolicyKey": "campaign_last_touch_30d", "attributionPolicyVersion": 1, "sourceIds": ["source-1"]}, "sourceIds": ["source-1"], "risks": []},
    ]


class FakeClient:
    def __init__(self, values: list[dict]) -> None:
        self.values = values
        self.calls: list[dict] = []

    def chat_completion(self, **kwargs):
        self.calls.append(kwargs)
        return {"content": json.dumps(self.values.pop(0)), "model": "test", "input_tokens": 1, "output_tokens": 1, "total_tokens": 2}


def workflow(values: list[dict] | None = None):
    client = FakeClient(deepcopy(values or responses()))
    profile = ModelProfile(key="campaign_launch", version=1, provider="openrouter", model="test", temperature=0, max_tokens=4000, timeout_seconds=45, max_cost_brl=Decimal("2"), prompt_bundle_hash=sha256(b"campaign-launch-v1").hexdigest())
    return CampaignLaunchSpecialistWorkflow(client, profile), client


def test_generates_grounded_campaign_artifacts_without_provider_tools() -> None:
    subject, client = workflow()
    result = subject.generate(request())
    assert result["brief"]["platform"] == "meta"
    assert result["brief"]["funnelArtifactRefs"] == ["funnel-v1"]
    assert result["acquisition"]["trackingPlan"]["conversion_event"] == "lead"
    assert result["sourceIds"] == ["source-1"]
    assert len(client.calls) == 4
    assert all("tools" not in call for call in client.calls)
    assert all("NO TOOLS" in call["messages"][0]["content"] for call in client.calls)


@pytest.mark.parametrize("missing", ["offer", "icp"])
def test_requires_offer_and_icp_before_specialist_calls(missing: str) -> None:
    value = request(); value["company_context"].pop(missing)
    subject, client = workflow()
    with pytest.raises(CampaignLaunchClarificationRequired):
        subject.generate(value)
    assert client.calls == []


def test_rejects_unsupported_provider_and_budget_over_envelope() -> None:
    values = responses(); values[0]["brief"]["platform"] = "google"
    with pytest.raises(CampaignLaunchError, match="provider_unavailable"):
        workflow(values)[0].generate(request())
    values = responses(); values[0]["brief"]["totalBudgetBrl"] = "1500"
    with pytest.raises(CampaignLaunchError, match="budget_exceeds_envelope"):
        workflow(values)[0].generate(request())


def test_rejects_provider_connection_not_present_in_readiness_snapshot() -> None:
    values = responses(); values[0]["brief"]["providerConnectionId"] = "00000000-0000-4000-8000-000000000099"
    with pytest.raises(CampaignLaunchError, match="provider_connection_not_allowed"):
        workflow(values)[0].generate(request())


def test_rejects_missing_tracking_unknown_evidence_and_prohibited_claim() -> None:
    values = responses(); values[3]["acquisition"]["trackingPlan"].pop("utm_campaign")
    with pytest.raises(CampaignLaunchError, match="measurement_analyst_contract_invalid"):
        workflow(values)[0].generate(request())
    values = responses(); values[1]["creativeSet"]["creatives"][0]["sourceIds"] = ["other-tenant"]
    with pytest.raises(CampaignLaunchError, match="source_not_allowed"):
        workflow(values)[0].generate(request())
    values = responses(); values[1]["creativeSet"]["creatives"][0]["body"] = "Lucro garantido para você."
    with pytest.raises(CampaignLaunchError, match="forbidden_claim"):
        workflow(values)[0].generate(request())


def test_supervisor_injects_campaign_artifacts_and_exact_bindings() -> None:
    artifacts = workflow()[0].generate(request())
    plan = {"resolvedParameters": {}, "steps": [
        {"stepKey": "page", "capabilityKey": "landing_page.create_draft", "input": {}},
        {"stepKey": "form", "capabilityKey": "lead_form.configure_draft", "input": {}},
        {"stepKey": "campaign", "capabilityKey": "campaign.create_draft", "input": {}},
        {"stepKey": "provider", "capabilityKey": "campaign.provider.create_paused", "input": {}},
        {"stepKey": "activate", "capabilityKey": "campaign.provider.activate", "input": {}},
    ]}
    enriched = MissionSupervisor._inject_campaign_launch_artifacts(plan, artifacts)
    assert enriched["resolvedParameters"]["campaignLaunchArtifacts"]["sourceIds"] == ["source-1"]
    assert enriched["steps"][1]["input"]["landingPageId"] == "binding:pack.draft_landing_page.entityId"
    assert enriched["steps"][2]["input"]["landingPageId"] == "binding:pack.draft_landing_page.entityId"
    assert "endsAt" not in enriched["steps"][2]["input"]
    assert enriched["steps"][3]["input"]["expectedContentHash"] == "binding:pack.draft_campaign.contentHash"
    assert enriched["steps"][4]["input"]["versionId"] == "binding:pack.draft_campaign.versionId"
