"""Representations of the three Radar v1 contracts, checked by shared fixtures."""
from __future__ import annotations
from typing import Any, Literal
from uuid import UUID
from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, HttpUrl, TypeAdapter, field_validator, model_validator


class _Contract(BaseModel):
    model_config = ConfigDict(extra='forbid')
    schemaVersion: Literal[1]

    @field_validator('schemaVersion', mode='before')
    @classmethod
    def version_is_integer(cls, value):
        if type(value) is not int or value != 1:
            raise ValueError('radar_contract_version_invalid')
        return value


class ResearchEvidenceV1(_Contract):
    id: str = Field(min_length=1, max_length=80)
    sourceUrl: HttpUrl
    text: str = Field(min_length=1, max_length=48000)
    observedAt: AwareDatetime
    kind: Literal['institutional_candidate', 'directory', 'social', 'third_party', 'registry']
    scope: Literal['establishment', 'group', 'unresolved']


class _Usage(BaseModel):
    model_config = ConfigDict(extra='forbid')
    inputTokens: int | None = Field(ge=0, strict=True)
    outputTokens: int | None = Field(ge=0, strict=True)
    costUsd: float | None = Field(ge=0, allow_inf_nan=False, strict=True)


class EffectReceiptV1(_Contract):
    organizationId: UUID
    effectKey: str = Field(min_length=1, max_length=400)
    attempt: int = Field(ge=1, strict=True)
    analysisReceiptId: UUID
    ownerToken: UUID
    leaseUntil: AwareDatetime
    inputHash: str = Field(pattern=r'^[a-f0-9]{64}$')
    transportOutcome: Literal['not_started', 'rejected', 'received', 'uncertain']
    validationOutcome: Literal['pending', 'valid', 'invalid']
    billingOutcome: Literal['known', 'estimated', 'uncertain']
    responseBody: dict[str, Any] | None
    usage: _Usage | None
    failureCode: str | None = Field(pattern=r'^[a-z][a-z0-9_]{0,159}$')
    provider: str | None = Field(default=None, min_length=1, max_length=200)
    modelSnapshot: str | None = Field(default=None, min_length=1, max_length=200)
    externalRequestId: str | None = Field(default=None, min_length=1, max_length=200)

    @model_validator(mode='after')
    def received_has_body(self):
        if self.transportOutcome == 'received' and self.responseBody is None or self.validationOutcome == 'valid' and self.transportOutcome != 'received':
            raise ValueError('radar_effect_receipt_invalid')
        return self


_Field = Literal['website', 'email', 'phone', 'whatsapp', 'social', 'supplierChannel', 'companyProfile', 'companySize', 'activity', 'identity', 'fit']


class _UnresolvedField(BaseModel):
    model_config = ConfigDict(extra='forbid')
    field: _Field
    reason: Literal['not_found', 'reading_restricted', 'identity_unresolved', 'verification_pending', 'outside_profile']


class CommercialResearchStatusV1(_Contract):
    status: Literal['researching', 'complete', 'incomplete', 'waiting', 'unchanged']
    updatedFields: list[_Field]
    unresolvedFields: list[_UnresolvedField]
    lastAttemptAt: AwareDatetime | None
    nextAction: Literal['continue', 'review_source', 'review_result', 'wait', 'none']

    @model_validator(mode='after')
    def unique_fields(self):
        if len(self.updatedFields) != len(set(self.updatedFields)):
            raise ValueError('radar_commercial_fields_duplicate')
        return self


radar_contract = TypeAdapter(ResearchEvidenceV1 | EffectReceiptV1 | CommercialResearchStatusV1)
