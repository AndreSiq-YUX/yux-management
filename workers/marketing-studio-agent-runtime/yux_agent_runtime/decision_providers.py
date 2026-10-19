"""Versioned Decisions alpha adapter. Caller owns authorization and receipts.

Source contract: https://openrouter.ai/docs/api/api-reference/alphadecisions/submit-a-decisions-request
No retry or fallback: received-invalid and uncertain effects belong to the caller's ledger.
"""
from __future__ import annotations
from decimal import Decimal, InvalidOperation
import json
import math
from typing import Protocol
from urllib.error import HTTPError
from urllib.request import Request, build_opener, HTTPRedirectHandler
from .providers import ProviderAuthorizationError, ProviderRequestError
from .radar_decision_context import canonical_json, _text_only

ENDPOINT = 'https://openrouter.ai/api/alpha/decisions'
ADAPTER_VERSION = 'openrouter-decisions-alpha-v1'


class DecisionProvider(Protocol):
    def decide(self, *, model: str, state: dict, questions: dict) -> dict: ...


class DecisionContractError(ProviderRequestError):
    def __init__(self, response):
        super().__init__('decision_contract_changed')
        self.response = response  # protected receipt material, not a client error string


class DecisionEffectUncertain(ProviderRequestError):
    pass


class _NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def _transport(url, headers, payload, method, *, timeout_seconds=45):
    request = Request(url, data=canonical_json(payload), method=method, headers=headers)
    with build_opener(_NoRedirect()).open(request, timeout=timeout_seconds) as response:
        return json.loads(response.read(256001).decode('utf-8'))


def _number(value):
    return type(value) in (int, float) and math.isfinite(value)


class OpenRouterDecisionsAlphaV1Provider:
    def __init__(self, *, api_key=None, transport=None, allow_paid=False, approved_models=(), authorize=None, received=None,timeout_seconds=45):
        self.api_key, self.transport = api_key, transport
        self.allow_paid, self.approved_models, self.authorize = allow_paid, frozenset(approved_models), authorize
        self.received = received
        self.timeout_seconds = timeout_seconds

    def decide(self, *, model: str, state: dict, questions: dict) -> dict:
        if not isinstance(model, str) or not 1 <= len(model) <= 200 or model.startswith('~'):
            raise ValueError('decision_exact_model_required')
        _text_only(state)
        if not questions or any(not isinstance(question, dict) or question.get('type') != 'choice' or not isinstance(question.get('criteria'), dict) or len(question['criteria']) < 2 for question in questions.values()):
            raise ValueError('decision_questions_invalid')
        payload = dict(model=model, state=state, questions=questions)
        if len(canonical_json(payload)) > 24000 or len(canonical_json(state)) > 16000:
            raise ValueError('decision_request_too_large')
        if self.transport is None:
            if not self.allow_paid or model not in self.approved_models or not self.api_key:
                raise ProviderAuthorizationError('decision_paid_authorization_required')
            if not self.authorize:
                raise ProviderAuthorizationError('decision_budget_authorization_required')
            self.authorize(model=model, payload=payload)
        try:
            args=(ENDPOINT, {'Content-Type': 'application/json', **({'Authorization': f'Bearer {self.api_key}'} if self.api_key else {})}, payload, 'POST')
            raw = self.transport(*args) if self.transport else _transport(*args,timeout_seconds=self.timeout_seconds)
        except HTTPError as error:
            raise ProviderRequestError(f'provider_http_{error.code}') from None
        except (TimeoutError, OSError) as error:
            raise DecisionEffectUncertain('decision_effect_uncertain') from None
        except (json.JSONDecodeError, UnicodeDecodeError):
            if self.received:
                self.received(dict(received=True, invalidEncoding=True))
            raise DecisionContractError(dict(received=True, invalidEncoding=True)) from None
        if self.received:
            self.received(raw)  # durable before any alpha/domain validation
        return normalize_decisions_response(raw, model=model, questions=questions)


def normalize_decisions_response(raw, *, model, questions):
        if not isinstance(raw, dict):
            raise DecisionContractError(raw)
        snapshot, answers, usage = raw.get('model'), raw.get('answers'), raw.get('usage')
        if not isinstance(snapshot, str) or not 1<=len(snapshot)<=200 or not (snapshot == model or snapshot.startswith(model + '-')) or any(not isinstance(raw.get(key),str) or not 1<=len(raw[key])<=200 for key in ('id','provider')) or not isinstance(answers, dict) or set(answers) != set(questions) or not isinstance(usage, dict):
            raise DecisionContractError(raw)
        normalized = {}
        for key, question in questions.items():
            answer = answers[key]
            if not isinstance(answer, dict) or answer.get('type') != 'choice':
                raise DecisionContractError(raw)
            probabilities, selected, confidence = answer.get('probabilities'), answer.get('choice'), answer.get('confidence')
            if not isinstance(probabilities, dict) or set(probabilities) != set(question['criteria']) or selected not in probabilities or any(not _number(value) or not 0 <= value <= 1 for value in probabilities.values()) or abs(sum(probabilities.values()) - 1) > .01:
                raise DecisionContractError(raw)
            if probabilities[selected] < max(probabilities.values()) or confidence is not None and (not _number(confidence) or not 0 <= confidence <= 1):
                raise DecisionContractError(raw)
            normalized[key] = dict(choice=selected, probabilities=probabilities, confidence=confidence)
        try:
            cost = Decimal(str(usage['cost'])) if usage.get('cost') is not None else None
            if cost is not None and (not cost.is_finite() or cost < 0):
                raise InvalidOperation
        except (InvalidOperation, ValueError):
            raise DecisionContractError(raw) from None
        for key in ('input_tokens', 'output_tokens'):
            if usage.get(key) is not None and (type(usage[key]) is not int or usage[key] < 0):
                raise DecisionContractError(raw)
        return dict(answers=normalized, requestedModel=model, modelSnapshot=snapshot, provider=raw['provider'], requestId=raw['id'],
                    usage=dict(costUsd=str(cost) if cost is not None else None, inputTokens=usage.get('input_tokens'), outputTokens=usage.get('output_tokens')),
                    adapterVersion=ADAPTER_VERSION, response=raw)
