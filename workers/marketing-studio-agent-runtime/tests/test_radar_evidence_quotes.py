import pytest
from yux_agent_runtime.radar_evidence_quotes import resolve_evidence_quote

def test_original_contiguous_span_with_layout_whitespace_and_canonical_accents():
    source='Inicio. Refeições\u00a0coletivas\npara empresas e cafe\u0301. Fim.'
    assert resolve_evidence_quote(source,'Refeições coletivas para empresas e café.')=='Refeições\u00a0coletivas\npara empresas e cafe\u0301.'

@pytest.mark.parametrize('quote',['Refeições para empresas','Refeições coletivas para companhias','Refeições coletivas... empresas','Itapecerica da Serra'])
def test_never_accepts_omissions_paraphrases_or_unobserved_location(quote):
    assert resolve_evidence_quote('Refeições coletivas para empresas. São Paulo/SP',quote) is None
