import json
from yux_agent_runtime.knowledge_intelligence import KnowledgeIntelligenceService

def test_represented_website_scope_reaches_provider_without_granting_sales_authority():
    class Provider:
        def chat_completion(self, **kwargs):
            self.messages = kwargs['messages']
            return {'content': json.dumps({'suggestions': [], 'warnings': []})}
    provider = Provider()
    service = KnowledgeIntelligenceService(provider)
    service.extract_company_profile([{'url':'https://example.test','title':'Catálogo','content':'Massas congeladas'}], target={'kind':'represented_business','representedBusinessId':'brand'})
    prompt = provider.messages[0]['content']
    assert 'nao ao representante' in prompt
    assert 'nao confirma linhas autorizadas' in prompt
