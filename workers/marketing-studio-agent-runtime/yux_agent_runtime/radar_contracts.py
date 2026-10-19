"""Incremental Radar v1 contracts, checked by shared fixtures."""
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


class _MentionLocation(BaseModel):
    model_config = ConfigDict(extra='forbid')
    city: str | None = Field(default=None,min_length=1,max_length=200)
    state: str | None = Field(default=None,min_length=1,max_length=80)
    address: str | None = Field(default=None,min_length=1,max_length=500)

    @field_validator('city','state','address',mode='before')
    @classmethod
    def explicit_null_is_not_a_claim(cls,value):
        if value is None:
            raise ValueError('radar_mention_null_field')
        return value


class _MentionContact(BaseModel):
    model_config = ConfigDict(extra='forbid')
    kind: Literal['email','phone','whatsapp','social']
    value: str = Field(min_length=1,max_length=300)


class _MentionSpan(BaseModel):
    model_config = ConfigDict(extra='forbid')
    field: Literal['name','city','state','address','claimedTaxId','claimedWebsite','contact']
    evidenceId: str = Field(min_length=1,max_length=80)
    excerpt: str = Field(min_length=2,max_length=1200)


class BusinessMentionV1(_Contract):
    name: str = Field(min_length=2,max_length=240)
    location: _MentionLocation | None = None
    claimedTaxId: str | None = Field(default=None,min_length=1,max_length=24)
    claimedWebsite: HttpUrl | None = None
    contacts: list[_MentionContact] = Field(max_length=12)
    sourceUrl: HttpUrl
    observedAt: AwareDatetime | None = None
    evidenceSpans: list[_MentionSpan] = Field(min_length=1,max_length=24)
    subjectScope: Literal['company','group','establishment']
    needsVerification: Literal[True]

    @field_validator('location','claimedTaxId','claimedWebsite','observedAt',mode='before')
    @classmethod
    def optional_means_omitted_not_null(cls,value):
        if value is None:
            raise ValueError('radar_mention_null_field')
        return value

    @field_validator('needsVerification',mode='before')
    @classmethod
    def verification_is_strict_boolean(cls,value):
        if value is not True:
            raise ValueError('radar_mention_verification_required')
        return value


radar_contract = TypeAdapter(ResearchEvidenceV1 | EffectReceiptV1 | CommercialResearchStatusV1 | BusinessMentionV1)
