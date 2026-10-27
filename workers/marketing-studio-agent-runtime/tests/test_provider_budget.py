import unittest
from unittest.mock import MagicMock, patch
from urllib.error import HTTPError

from yux_agent_runtime import providers
from yux_agent_runtime.llm_routing import RoutedLlmClient


class ProviderBudgetTest(unittest.TestCase):
    def test_ordinary_transport_keeps_45_seconds(self):
        with patch.object(providers, 'urlopen') as opener:
            opener.return_value.__enter__.return_value.read.return_value = b'{}'
            providers._default_transport('https://example.test', {}, {}, 'POST')
        self.assertEqual(opener.call_args.kwargs['timeout'], 45)

    def test_mission_budget_reaches_transport_and_resets_after_failure(self):
        with patch.object(providers, 'monotonic', return_value=100), patch.object(providers, 'urlopen') as opener:
            opener.return_value.__enter__.return_value.read.return_value = b'{}'
            with self.assertRaisesRegex(ValueError, 'synthetic failure'):
                with providers.provider_request_budget(120):
                    providers._default_transport('https://example.test', {}, {}, 'POST')
                    self.assertEqual(opener.call_args.kwargs['timeout'], 120)
                    raise ValueError('synthetic failure')
            self.assertEqual(providers.provider_request_timeout(), 45)

    def test_elapsed_time_and_nested_budget_never_extend_parent(self):
        now = [100]
        with patch.object(providers, 'monotonic', side_effect=lambda: now[0]):
            with providers.provider_request_budget(120):
                now[0] = 130
                self.assertEqual(providers.provider_request_timeout(), 90)
                with providers.provider_request_budget(200):
                    self.assertEqual(providers.provider_request_timeout(), 90)
                with providers.provider_request_budget(10):
                    self.assertEqual(providers.provider_request_timeout(), 10)
                self.assertEqual(providers.provider_request_timeout(), 90)
            self.assertEqual(providers.provider_request_timeout(), 45)

    def test_expired_budget_never_opens_another_request(self):
        now = [100]
        with patch.object(providers, 'monotonic', side_effect=lambda: now[0]), patch.object(providers, 'urlopen') as opener:
            with providers.provider_request_budget(120):
                now[0] = 221
                with self.assertRaises(providers.ProviderDeadlineExceededError):
                    providers._default_transport('https://example.test', {}, {}, 'POST')
        opener.assert_not_called()

    def test_expired_provider_budget_is_terminal_for_routed_fallbacks(self):
        calls = []

        class Client:
            def chat_completion(self, **kwargs):
                calls.append(kwargs['model'])
                raise providers.ProviderDeadlineExceededError('provider_request_deadline_exceeded')

        routes = [{'agent_type': 'action_engine_strategist', 'provider': 'openrouter',
                   'model_name': 'primary:free', 'status': 'active',
                   'fallback_routes': [{'provider': 'openrouter', 'modelName': 'fallback:free'}]}]
        client = RoutedLlmClient('action_engine_strategist', lambda: routes, lambda _: {'openrouter': Client()})
        with self.assertRaises(providers.ProviderDeadlineExceededError):
            client.chat_completion(model='ignored:free', messages=[])
        self.assertEqual(calls, ['primary:free'])

    def test_configured_fallback_uses_only_remaining_shared_time(self):
        now = [100]
        requests = []
        response = MagicMock()
        response.__enter__.return_value.read.return_value = b'{"choices":[{"message":{"content":"ok"}}]}'

        def open_request(request, *, timeout):
            requests.append(timeout)
            if len(requests) == 1:
                now[0] += 80
                raise HTTPError(request.full_url, 503, 'synthetic availability error', {}, None)
            return response

        routes = [{'agent_type': 'action_engine_strategist', 'provider': 'openrouter',
                   'model_name': 'primary:free', 'status': 'active',
                   'fallback_routes': [{'provider': 'openrouter', 'modelName': 'fallback:free'}]}]
        client = RoutedLlmClient('action_engine_strategist', lambda: routes,
                                 lambda _: {'openrouter': providers.OpenRouterClient(api_key='synthetic')})
        with patch.object(providers, 'monotonic', side_effect=lambda: now[0]), patch.object(providers, 'urlopen', side_effect=open_request):
            with providers.provider_request_budget(120):
                self.assertEqual(client.chat_completion(model='ignored:free', messages=[])['content'], 'ok')
        self.assertEqual(requests, [120, 40])

    def test_network_timeout_after_deadline_does_not_attempt_fallback(self):
        now = [100]

        def open_request(*args, **kwargs):
            now[0] = 221
            raise TimeoutError('synthetic timeout')

        routes = [{'agent_type': 'action_engine_strategist', 'provider': 'openrouter',
                   'model_name': 'primary:free', 'status': 'active',
                   'fallback_routes': [{'provider': 'openrouter', 'modelName': 'fallback:free'}]}]
        client = RoutedLlmClient('action_engine_strategist', lambda: routes,
                                 lambda _: {'openrouter': providers.OpenRouterClient(api_key='synthetic')})
        with patch.object(providers, 'monotonic', side_effect=lambda: now[0]), patch.object(providers, 'urlopen', side_effect=open_request) as opener:
            with providers.provider_request_budget(120):
                with self.assertRaises(providers.ProviderDeadlineExceededError):
                    client.chat_completion(model='ignored:free', messages=[])
        self.assertEqual(opener.call_count, 1)

    def test_independent_context_does_not_inherit_another_request_budget(self):
        from contextvars import Context

        with patch.object(providers, 'monotonic', return_value=100):
            with providers.provider_request_budget(120):
                self.assertEqual(Context().run(providers.provider_request_timeout), 45)
                self.assertEqual(providers.provider_request_timeout(), 120)
