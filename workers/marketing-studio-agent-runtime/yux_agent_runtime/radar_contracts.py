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


class _DecisionEvidence(BaseModel):
    model_config=ConfigDict(extra='forbid')
    id: str=Field(min_length=1,max_length=80)
    sourceUrl: HttpUrl
    text: str=Field(min_length=1,max_length=20000)
    role: Literal['identity','activity','domain','contact']='activity'
    primary: bool=False
    contradictory: bool=False
    scope: Literal['establishment','group','unresolved']='unresolved'


class _DecisionOption(BaseModel):
    model_config=ConfigDict(extra='forbid')
    id: str=Field(pattern=r'^[a-z][a-z0-9_]{0,79}$')
    description: str=Field(min_length=1,max_length=1000)


class DecisionContextV1(_Contract):
    organizationId: UUID
    campaignId: UUID
    candidateId: UUID
    configurationRevision: int=Field(gt=0,strict=True)
    task: Literal['radar_initial_triage','radar_next_action','radar_quality_gate']
    identity: dict[str,str]
    criteria: dict[str,str|list[str]]
    evidence: list[_DecisionEvidence]=Field(max_length=30)
    options: list[_DecisionOption]=Field(max_length=8)
    humanReviewed: bool=False

    @model_validator(mode='after')
    def known_fields(self):
        if set(self.identity)-{'name','legalName','cnpj','city','state','address'} or 'name' not in self.identity or set(self.criteria)-{'segment','offer','products','includeTerms','includeAllTerms','excludeTerms','requiredContacts','minimumUsefulContacts','contactPurpose','desiredCnaes','cnaeRule'}:
            raise ValueError('radar_decision_context_invalid')
        return self


class _DecisionAttempt(BaseModel):
    model_config=ConfigDict(extra='forbid')
    requestedModel: str=Field(max_length=200)
    resolvedModel: str | None=Field(max_length=200)
    status: Literal['valid','received','rejected']
    latencyMs: int=Field(ge=0,strict=True)
    failureCode: str | None=Field(default=None,pattern=r'^(decision_|provider_)[a-z0-9_]+$')
    usage: dict[str,int|float|str|None]


class DecisionResultV1(_Contract):
    task: Literal['radar_initial_triage','radar_next_action','radar_quality_gate']
    status: Literal['decided','unavailable','context_incomplete']
    choice: str | None
    reasonCode: Literal['fit_supported','outside_activity','identity_unresolved','more_evidence_needed','action_selected','quality_review']
    evidenceIds: list[str]=Field(max_length=6)
    attempts: list[_DecisionAttempt]=Field(max_length=10)
    usage: _Usage
    probabilities: dict[str,float] | None=None
    confidence: float | None=Field(default=None,ge=0,le=1,allow_inf_nan=False)
    requestedModel: str | None=Field(default=None,max_length=200)
    resolvedModel: str | None=Field(default=None,max_length=200)
    provider: Literal['openrouter'] | None=None
    upstreamProvider: str | None=Field(default=None,max_length=200)
    externalRequestId: str | None=Field(default=None,max_length=200)
    adapterVersion: Literal['openrouter-decisions-alpha-v1'] | None=None
    contextVersion: Literal['radar-decision-context-v1'] | None=None
    questionVersion: Literal['radar-decisions-questions-v1'] | None=None
    criteriaRubricVersion: Literal['radar-decisions-rubric-v1'] | None=None
    contextBytes: int | None=Field(default=None,ge=1,le=24000,strict=True)
    omittedEvidenceIds: list[str] | None=None

    @model_validator(mode='after')
    def decided_has_contract(self):
        import math
        if self.status=='decided' and (not self.choice or not self.probabilities or self.choice not in self.probabilities or any(not math.isfinite(p) or p<0 or p>1 for p in self.probabilities.values()) or abs(sum(self.probabilities.values())-1)>.01 or not all((self.requestedModel,self.resolvedModel,self.adapterVersion,self.contextVersion,self.questionVersion,self.criteriaRubricVersion))):
            raise ValueError('radar_decision_contract_invalid')
        return self


radar_contract = TypeAdapter(ResearchEvidenceV1 | EffectReceiptV1 | CommercialResearchStatusV1 | BusinessMentionV1 | DecisionContextV1 | DecisionResultV1)
