import pytest
from yux_agent_runtime.mission_router import MissionRouter, MissionRoutingError

def route(text, keys=("revenue_recovery","funnel_nurture","campaign_launch","radar_prospecting")):
    return MissionRouter().route({"mission":{"objective":text},"pack_catalog":[{"key":key} for key in keys]})

def test_radar_is_not_paid_media():
    assert route("Crie uma campanha no Radar Comercial para pesquisar 100 empresas").selected_pack_keys == ["radar_prospecting"]
    assert route("Crie uma campanha no Google Ads").selected_pack_keys == ["campaign_launch"]

def test_campaign_requires_disambiguation():
    result=route("Crie uma campanha")
    assert not result.selected_pack_keys
    assert result.clarification_questions

def test_documentation_does_not_enable_an_unavailable_pack():
    with pytest.raises(MissionRoutingError, match="pack_unavailable"):
        route("Pesquisar empresas no Radar Comercial",("campaign_launch","revenue_recovery"))
