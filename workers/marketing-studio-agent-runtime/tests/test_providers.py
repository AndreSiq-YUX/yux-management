import unittest

from yux_agent_runtime.providers import JinaClient, OpenRouterClient, ProviderRequestError


class ProviderClientTest(unittest.TestCase):
    def test_openrouter_chat_completion_uses_native_endpoint_and_usage(self):
        calls = []

        def transport(url, headers, payload, method):
            calls.append((url, headers, payload, method))
            return {
                "id": "chat-1",
                "model": "openai/gpt-4.1-mini",
                "choices": [{"finish_reason": "stop", "message": {"content": "Texto gerado"}}],
                "usage": {"prompt_tokens": 20, "completion_tokens": 12, "total_tokens": 32, "cost": 0.0042},
            }

        client = OpenRouterClient(api_key="or-key", transport=transport)
        response = client.chat_completion(
            model="openai/gpt-4.1-mini",
            fallback_models=["anthropic/claude-sonnet-4"],
            messages=[{"role": "user", "content": "Gerar post"}],
            session_id="run-1",
            response_format={"type": "json_object"},
        )

        self.assertEqual(calls[0][0], "https://openrouter.ai/api/v1/chat/completions")
        self.assertEqual(calls[0][1]["Authorization"], "Bearer or-key")
        self.assertEqual(calls[0][2]["models"], ["openai/gpt-4.1-mini", "anthropic/claude-sonnet-4"])
        self.assertEqual(calls[0][2]["session_id"], "run-1")
        self.assertEqual(calls[0][2]["response_format"], {"type": "json_object"})
        self.assertEqual(calls[0][2]["provider"], {"data_collection": "deny"})
        self.assertEqual(response["content"], "Texto gerado")
        self.assertEqual(response["input_tokens"], 20)
        self.assertEqual(response["output_tokens"], 12)
        self.assertEqual(response["cost_usd"], 0.0042)

    def test_openrouter_requires_api_key(self):
        with self.assertRaises(ProviderRequestError):
            OpenRouterClient(api_key=None).chat_completion(model="x", messages=[])

    def test_openrouter_embeddings_use_qwen_and_query_input_type(self):
        calls = []

        def transport(url, headers, payload, method):
            calls.append((url, headers, payload, method))
            return {"model": "qwen/qwen3-embedding-8b", "data": [{"index": 0, "embedding": [1.0, 0.0]}], "usage": {"total_tokens": 3}}

        result = OpenRouterClient(api_key="or-key", transport=transport).embed_texts(
            ["consulta semantica"], input_type="search_query", dimensions=2
        )
        self.assertEqual(calls[0][0], "https://openrouter.ai/api/v1/embeddings")
        self.assertEqual(calls[0][2], {
            "model": "qwen/qwen3-embedding-8b",
            "input": ["consulta semantica"],
            "input_type": "search_query",
            "dimensions": 2,
            "encoding_format": "float",
            "provider": {"data_collection": "deny"},
        })
        self.assertEqual(result["vectors"], [[1.0, 0.0]])

    def test_jina_reader_search_and_grounding_use_bearer_key(self):
        calls = []

        def transport(url, headers, payload, method):
            calls.append((url, headers, payload, method))
            if url == "https://g.jina.ai":
                return {
                    "data": {
                        "factuality": 0.91,
                        "result": True,
                        "reason": "Fontes suportam a afirmacao.",
                        "references": [{"url": "https://example.com", "isSupportive": True}],
                        "usage": {"tokens": 1234},
                    }
                }
            return "markdown limpo"

        client = JinaClient(api_key="jina-key", transport=transport)

        self.assertEqual(client.read_url("https://example.com/post")["content"], "markdown limpo")
        self.assertEqual(client.search("crm para pmes")["provider"], "jina_search")
        grounding = client.ground_statement("CRM reduz retrabalho.")

        self.assertEqual(calls[0][0], "https://r.jina.ai/https://example.com/post")
        self.assertEqual(calls[1][0], "https://s.jina.ai/crm%20para%20pmes")
        self.assertEqual(calls[2][0], "https://g.jina.ai")
        self.assertEqual(calls[2][1]["Authorization"], "Bearer jina-key")
        self.assertEqual(grounding["factuality"], 0.91)
        self.assertEqual(grounding["tokens"], 1234)


if __name__ == "__main__":
    unittest.main()
