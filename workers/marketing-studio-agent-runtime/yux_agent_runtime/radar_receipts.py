"""Idempotent Radar analyses. Never replay a provider attempt with uncertain outcome."""
from __future__ import annotations
from hashlib import sha256
import json
import math
import re
from uuid import uuid4
from contextvars import ContextVar
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from fastapi import HTTPException

_active_recorder = ContextVar('radar_effect_recorder', default=None)
_provider_recorder = ContextVar('radar_provider_recorder', default=None)
_actions = {'radar_presence_resolution', 'radar_business_qualification','radar_discovery_extraction','radar_initial_triage','radar_next_action','radar_quality_gate','radar_fit_gate','radar_deep_research'}


def radar_effect_recorder(action):
    recorder = _active_recorder.get()
    return recorder if recorder and recorder.action == action else None


@contextmanager
def capture_radar_provider_attempt(recorder):
    token = _provider_recorder.set(recorder)
    try:
        yield
    finally:
        _provider_recorder.reset(token)


def capture_radar_raw_response(response):
    recorder = _provider_recorder.get()
    if not recorder:
        return
    raw = response if isinstance(response, dict) else {}
    choices = raw.get('choices')
    choice = choices[0] if isinstance(choices, list) and choices and isinstance(choices[0], dict) else {}
    message = choice.get('message') if isinstance(choice.get('message'), dict) else {}
    usage = raw.get('usage') if isinstance(raw.get('usage'), dict) else {}
    recorder.received(dict(content=message.get('content') or '', finish_reason=choice.get('finish_reason'),
        model=raw.get('model'), raw_response_id=raw.get('id'), input_tokens=usage.get('prompt_tokens'),
        output_tokens=usage.get('completion_tokens'), cost_usd=usage.get('cost'), upstream_response=response))


def _safe_failure(cause):
    code = str(cause)
    return code if re.fullmatch(r'(?:radar_|provider_|decision_|invalid_openrouter_)[a-z0-9_]{1,130}|output_truncated', code) else 'radar_analysis_response_invalid'


def _protected_body(value):
    if isinstance(value, list):
        return [_protected_body(item) for item in value]
    if isinstance(value, dict):
        return {key: _protected_body(item) for key, item in value.items() if not re.fullmatch(r'authorization|api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret|credential', key, re.I)}
    return value


class RadarEffectRecorder:
    def __init__(self, store, *, receipt, action, key, owner_token, input_hash):
        self.store, self.receipt, self.action, self.key = store, receipt, action, key
        self.owner_token, self.input_hash, self.current = owner_token, input_hash, None
        self.provider, self.model = None, None

    def begin(self, provider=None, model=None):
        self.provider, self.model = provider, model
        self.current = self.store.begin_radar_effect(**self.key, analysis_receipt_id=self.receipt['id'], owner_token=self.owner_token,
            input_hash=self.input_hash, provider=provider, model_snapshot=model,
            lease_until=(datetime.now(timezone.utc) + timedelta(minutes=6)).isoformat())

    def received(self, response):
        if self.current is None:
            self.begin(self.provider, self.model)
        if self.current.get('transport_outcome') == 'received':
            return  # preserve the first response, including its upstream envelope
        allowed = ('content', 'finish_reason', 'input_tokens', 'output_tokens', 'cost_usd', 'raw_response_id', 'model', 'provider', 'upstream_response','decision_context')
        protected = _protected_body({key: response[key] for key in allowed if key in response})
        protected['provider'] = response.get('provider') or self.provider
        protected['model'] = response.get('model') or self.model
        usage = radar_usage(response)
        self.current = self.store.update_radar_effect(self.current['id'], owner_token=self.owner_token,
            transport_outcome='received', response_body=protected, usage=usage,
            billing_outcome='known' if usage['costUsd'] is not None else 'uncertain',
            model_snapshot=response.get('model') if isinstance(response.get('model'), str) else self.model,
            external_request_id=response.get('raw_response_id') if isinstance(response.get('raw_response_id'), str) else None)

    def failed(self, cause, *, provider_started=True):
        if self.current is None:
            self.begin(self.provider, self.model)
        if self.current.get('failure_code'):
            return self.current['transport_outcome']
        received = self.current.get('transport_outcome') == 'received'
        confirmed_rejection = re.fullmatch(r'provider_http_(?:400|401|402|403|404|413|429)', str(cause)) is not None
        if received:
            outcome = 'received'
        elif confirmed_rejection:
            outcome = 'rejected'
        elif not provider_started:
            outcome = 'not_started'
        else:
            outcome = 'uncertain'
        self.current = self.store.update_radar_effect(self.current['id'], owner_token=self.owner_token,
            transport_outcome=outcome, validation_outcome='invalid' if received else 'pending', failure_code=_safe_failure(cause),
            **({'billing_outcome': 'known', 'usage': dict(inputTokens=0, outputTokens=0, costUsd=0)} if outcome == 'not_started' else {}))
        return outcome

    def valid(self):
        if self.current and self.current.get('transport_outcome') == 'received':
            self.current = self.store.update_radar_effect(self.current['id'], owner_token=self.owner_token, validation_outcome='valid', failure_code=None)


def radar_usage(response):
    def tokens(key):
        value = response.get(key)
        return value if isinstance(value, int) and not isinstance(value, bool) and value >= 0 else None
    cost = response.get('cost_usd')
    cost = cost if isinstance(cost, (int, float)) and not isinstance(cost, bool) and math.isfinite(cost) and cost >= 0 else None
    return dict(inputTokens=tokens('input_tokens'), outputTokens=tokens('output_tokens'), costUsd=cost)


def execute_radar_receipt(store, *, action, request, compute, debit, validate_effect=True):
    input_hash = sha256(json.dumps(request.model_dump(), sort_keys=True, ensure_ascii=False, separators=(',', ':')).encode()).hexdigest()
    key = dict(organization_id=request.organization_id, action=action, request_id=request.request_id)
    owner_token = str(uuid4())
    receipt, claimed = store.claim_radar_receipt(**key, input_hash=input_hash, owner_token=owner_token, input_request=request.model_dump())
    if receipt['input_hash'] != input_hash:
        raise HTTPException(status_code=409, detail='radar_analysis_request_conflict')
    if not claimed:
        if receipt['status'] == 'completed':
            return receipt['result']
        raise HTTPException(status_code=409, detail='radar_analysis_previous_request_uncertain')
    provider_started = False
    recorder = RadarEffectRecorder(store, receipt=receipt, action=action, key=key, owner_token=owner_token, input_hash=input_hash)

    def before_call():
        nonlocal provider_started
        provider_started = True
        try:
            debit()
        except HTTPException as cause:
            if cause.status_code == 402 and cause.detail in ('radar_ai_wallet_missing', 'radar_ai_credits_insufficient'):
                provider_started = False
            raise

    token = _active_recorder.set(recorder if action in _actions else None)
    try:
        try:
            result = compute(before_call)
            if validate_effect:
                recorder.valid()
        except Exception as cause:
            outcome = recorder.failed(cause, provider_started=provider_started)
            store.finish_radar_receipt(**key, owner_token=owner_token,
                                      status='rejected_before_provider' if not provider_started or outcome=='not_started' else 'uncertain', result=None, usage=None)
            raise
    finally:
        _active_recorder.reset(token)
    # Saving failure after a response leaves a reservation: never replay blindly.
    store.finish_radar_receipt(**key, owner_token=owner_token, status='completed', result=result, usage=result.get('usage'))
    return result


def revalidate_radar_receipt(store, *, organization_id, action, request_id, input_hash, validate, tenant_context=None):
    """Pure revalidation of a received reply. No model, route, debit or transport."""
    if action not in _actions or not re.fullmatch(r'[a-f0-9]{64}', input_hash):
        raise HTTPException(status_code=422, detail='radar_analysis_request_invalid')
    key = dict(organization_id=organization_id, action=action, request_id=request_id)
    owner = str(uuid4())
    receipt, effect = store.claim_radar_revalidation(**key, input_hash=input_hash, owner_token=owner, tenant_context=tenant_context)
    if not receipt or receipt['input_hash'] != input_hash:
        raise HTTPException(status_code=409, detail='radar_analysis_request_conflict')
    if receipt['status'] == 'completed':
        return receipt['result']
    if not effect:
        raise HTTPException(status_code=409, detail='radar_analysis_previous_request_uncertain')
    try:
        result = validate(effect['response_body'], receipt['input_request'])
        store.update_radar_effect(effect['id'], owner_token=owner, validation_outcome='valid', failure_code=None)
    except Exception as cause:
        store.update_radar_effect(effect['id'], owner_token=owner, validation_outcome='invalid', failure_code=_safe_failure(cause))
        store.finish_radar_receipt(**key, owner_token=owner, status='uncertain', result=None, usage=effect.get('usage'))
        raise
    store.finish_radar_receipt(**key, owner_token=owner, status='completed', result=result, usage=effect.get('usage'))
    return result
