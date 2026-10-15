"""Idempotent Radar analyses. Never replay a provider attempt with uncertain outcome."""
from __future__ import annotations
from hashlib import sha256
import json
import math
from uuid import uuid4
from fastapi import HTTPException


def radar_usage(response):
    def tokens(key):
        value = response.get(key)
        return value if isinstance(value, int) and not isinstance(value, bool) and value >= 0 else None
    cost = response.get('cost_usd')
    cost = cost if isinstance(cost, (int, float)) and not isinstance(cost, bool) and math.isfinite(cost) and cost >= 0 else None
    return dict(inputTokens=tokens('input_tokens'), outputTokens=tokens('output_tokens'), costUsd=cost)


def execute_radar_receipt(store, *, action, request, compute, debit):
    input_hash = sha256(json.dumps(request.model_dump(), sort_keys=True, ensure_ascii=False, separators=(',', ':')).encode()).hexdigest()
    key = dict(organization_id=request.organization_id, action=action, request_id=request.request_id)
    owner_token = str(uuid4())
    receipt, claimed = store.claim_radar_receipt(**key, input_hash=input_hash, owner_token=owner_token)
    if receipt['input_hash'] != input_hash:
        raise HTTPException(status_code=409, detail='radar_analysis_request_conflict')
    if not claimed:
        if receipt['status'] == 'completed':
            return receipt['result']
        raise HTTPException(status_code=409, detail='radar_analysis_previous_request_uncertain')
    provider_started = False

    def before_call():
        nonlocal provider_started
        provider_started = True
        try:
            debit()
        except HTTPException as cause:
            if cause.status_code == 402 and cause.detail in ('radar_ai_wallet_missing', 'radar_ai_credits_insufficient'):
                provider_started = False
            raise

    try:
        result = compute(before_call)
    except Exception:
        store.finish_radar_receipt(**key, owner_token=owner_token,
                                  status='uncertain' if provider_started else 'rejected_before_provider', result=None, usage=None)
        raise
    # Saving failure after a response leaves a reservation: never replay blindly.
    store.finish_radar_receipt(**key, owner_token=owner_token, status='completed', result=result, usage=result.get('usage'))
    return result
