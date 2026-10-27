import unittest

from yux_agent_runtime.contracts import AgentContractError, parse_json_object


class ContractParsingTest(unittest.TestCase):
    def test_does_not_promote_a_nested_object_from_an_incomplete_root(self):
        content = '{"reply":"Análise inicial", "understood":{"primaryObjective":"Captar clientes","initialAudience":"Cozinhas industriais","possibleExpansion":"Hotéis","desiredYuxScope":"CRM","operationalBoundary":"Sem execução"}, "brief":'
        with self.assertRaisesRegex(AgentContractError, 'agent_output_invalid_json'):
            parse_json_object(content)

    def test_does_not_promote_a_nested_object_from_a_malformed_root(self):
        with self.assertRaisesRegex(AgentContractError, 'agent_output_invalid_json'):
            parse_json_object('{"reply": invalid, "understood":{"objective":"Teste"}}')

    def test_does_not_extract_an_object_from_an_array_with_trailing_text(self):
        with self.assertRaisesRegex(AgentContractError, 'agent_output_object_required'):
            parse_json_object('[{"analysis":"Não é raiz de objeto"}] extra')

    def test_does_not_extract_a_nested_object_from_prefixed_complete_or_incomplete_arrays(self):
        for content in ('JSON: [{"reply":"nested answer"}] trailing', 'JSON: [{"reply":"nested answer"},'):
            with self.subTest(content=content), self.assertRaisesRegex(AgentContractError, 'agent_output_object_required'):
                parse_json_object(content)

    def test_parses_first_complete_object_when_provider_appends_text(self):
        result = parse_json_object('{"analysis":"ok","recommended_actions":["agir"]}\nExplicação adicional')

        self.assertEqual(result["analysis"], "ok")

    def test_parses_first_complete_object_when_provider_repeats_a_draft(self):
        result = parse_json_object('{"analysis":"primeiro"}\n{"analysis":"segundo"}')

        self.assertEqual(result, {"analysis": "primeiro"})

    def test_rejects_content_without_a_complete_json_object(self):
        with self.assertRaisesRegex(AgentContractError, "agent_output_invalid_json"):
            parse_json_object('resposta sem objeto JSON')

    def test_still_rejects_a_json_array(self):
        with self.assertRaisesRegex(AgentContractError, "agent_output_object_required"):
            parse_json_object('[{"analysis":"não é objeto raiz"}]')


if __name__ == "__main__":
    unittest.main()
