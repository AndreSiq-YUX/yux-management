export type RadarProfileClaim={value:string;evidenceId:string;excerpt:string;sourceUrl:string;observedAt:string;scope:'establishment'|'group'|'unresolved'}
export type RadarExternalReference={url:string;reason:string}
export type RadarCaptureLimits={pageSize:number;maxPagesPerScope:number;maxQueriesPerBatch:number}
export type RadarOperationalLimits={maxNewCompaniesPerLot:number;maxPagesPerScope:number;maxDiscoveryQueriesPerLot:number;maxDiscoveryPageSize:number;maxVerificationBatch:number;maxSearchQueriesPerCompany:number;maxPublicPagesPerCompany:number;maxCampaignDailyQueries:number;maxSourceDailyQueries:number;maxResearchFreshnessDays:number;maxContinuationIdleMinutes:number;maxDecisionCallsPerCompany?:number;maxDeepSearchesPerCompany?:number;maxFallbackAttemptsPerEffect?:number;stalledAfterMinutes?:number}
export type RadarStalledResearchReport={stalledAfterMinutes:number;items:Array<{id:string;kind:'capture'|'request';organizationId:string;organizationName:string;campaignId:string;campaignName:string;stage:string;reason:'running_with_heartbeat'|'waiting_capacity'|'waiting_authorization'|'queue_unavailable'|'lease_expired'|'effect_uncertain'|'no_progress';lastProgressAt:string;nextAction:string}>}
export type RadarCostPolicy={usdToBrl:string|null;rateAsOf:string|null;rateSource:'manual';marginPercent:string}
export type RadarOperationalPolicy={version:number;limits:RadarOperationalLimits;costPolicy?:RadarCostPolicy;updatedAt:string|null;updatedBy:string|null}
export type RadarContinuationAuthorization={scopeKey:string;expectedStateId:string}
export type RadarCapturePreflight={stateId:string;allowed:boolean;requiresLimitsApproval:boolean;remaining:number;limits:RadarCaptureLimits;policy?:RadarOperationalPolicy;campaignLimits?:RadarCaptureLimits;continuations?:Array<{scopeKey:string;scopeLabel:string;stateId:string;generation:number;reason:string;requiresRestartConfirmation:boolean;replayEstimate:number}>;attemptedQueries:number;successfulPagesByScope:Record<string,number>;optimisticAdditionalCapacity:number;minimumAdditionalQueries:number;blockers:Array<{code:string;message:string}>;warnings?:Array<{code:string;message:string}>;researchCapacity?:{remainingQueries:number;plannedMaximumQueries:number;estimatedMaximumCostBrl:number};checks:Array<{key:string;status:'ok'|'blocked'|'not_applicable'|'not_checked';code?:string}>;expiredContinuation?:{receiptId:string;scopeLabel:string}}
export type RadarCaptureOperation={id:string;campaignId:string;configurationRevision:number;status:'queued'|'discovering'|'researching'|'completed'|'partial'|'blocked';discoveryStopped:boolean;discoveryReason?:string;queries:number;blockers:string[];canContinue?:boolean;
 counts:{requested:number;admitted:number;researching:number;completed:number;insufficient:number;blocked:number};items:Array<{id:string;candidateId:string;runId?:string;status:string;blocker?:string}>}
export type RadarResearchQuality={identity:'associated'|'pending';contactability:'useful'|'missing'|'pending';fit:'high'|'possible'|'low'|'unknown';potential:{score:number|null;coverage:number|null};readyForReview:boolean;missing:string[]}
export type RadarResearchFeedback={id:string;kind:'identity_confirmed'|'identity_wrong'|'contact_valid'|'contact_invalid'|'segment_confirmed'|'segment_wrong';contact?:{kind:string;value:string}|null;note?:string;configuration_revision:number;created_by:string;created_at:string}
export type RadarResearchMetrics={companies:number;identified:number;withUsefulContact:number;readyForReview:number;searchQueries:number;searchEstimatedBrl:number;searchCostPerCompanyBrl:number|null;searchCostPerIdentityBrl:number|null;searchCostPerUsefulContactBrl:number|null;searchCostPerReadyForReviewBrl:number|null;aiAnalyses:number;aiCostKnown:number;aiCostUnknown:number;aiReportedUsd:number|null;period:{from:string;to:string;timeZone:string};currencyNote:string;sources:Array<{sourceType:string;units:number;estimatedCostBrl:number}>}
export type RadarCompanyProfile={summary?:RadarProfileClaim;services:RadarProfileClaim[];customerSegments:RadarProfileClaim[];operatingRegions:RadarProfileClaim[];
  scaleSignals:Array<RadarProfileClaim&{metric:string;amount:number;referenceDate?:string;currency?:string}>}
export type RadarResearchAvailability = { allowed:boolean; reasons:Array<{code:string;message:string;sourceType?:string;resolution:string}>;
  presenceResolutionEnabled?:boolean;
  presence?:{routeConfigured:boolean;model?:string;provider?:string;maxInputTokens:number;maxOutputTokens:number;budgetReferenceBrl?:number;fallbackCount:number};
  operations?:{reanalyze:{allowed:boolean;reasons:Array<{code:string;message:string;resolution:string}>};refresh?:{allowed:boolean;reasons:Array<{code:string;message:string;resolution:string}>}};
  estimates:Array<{sourceType:string;costPerQuery:number;maximumQueries:number}>;maximumCostPerCandidate:number;maxQueriesPerCandidate:number;semanticQualificationEnabled:boolean;
  semantic?:{routeConfigured:boolean;model?:string;provider?:string;maxInputTokens:number;maxOutputTokens:number;budgetReferenceBrl?:number;fallbackCount:number} }
export type RadarResearchContact = {kind:'phone'|'email'|'whatsapp'|'social'|'business_person'|'contact_form';value:string;sourceUrl:string;observedAt:string;association:'confirmed'|'review';note?:string;linkedFromUrl?:string;
  purpose?:'general'|'suppliers'|'sales'|'finance'|'recruitment'|'privacy'|'unknown';purposeEvidence?:string;scope?:string;preferred?:boolean;
  sources?:Array<{sourceUrl:string;observedAt:string;purpose?:string}>}
export type RadarTlsExceptionEvidence={grantId:string;hostname:string;fingerprint256:string;observedAt:string}
export type RadarTlsExceptionGrant={id:string;hostname:string;fingerprint256:string;approvedBy:string;approvedAt:string;expiresAt:string;revokedAt?:string}
export type RadarResearchResult = {commercialStatus?:import('./generated/radarResearch').CommercialResearchStatusV1;methodVersion?:number;configurationRevision:number;availability:RadarResearchAvailability;
  researchRefreshIncomplete?:boolean;previousResearch?:{belongsToCurrentIdentity?:boolean;websiteUrl?:string;siteCheckedAt?:string;publicContacts?:RadarResearchContact[]};
  tlsCanAuthorize?:boolean;tlsDiagnostics?:Array<{diagnosticId:string;hostname:string;fingerprint256:string;validTo:string}>;tlsExceptions?:RadarTlsExceptionGrant[];
  run:null|{id:string;status:string;stage:string;error_code?:string;updated_at:string;configuration_revision:number;output:{
    methodVersion?:number;associationVersion?:number;
    quality?:RadarResearchQuality;
    discovery?:{association:string;websiteUrl?:string;suggestions:Array<{url:string;title:string}>;limitations:string[]};
    contacts?:RadarResearchContact[];registryPhone?:string;registryEmail?:string;siteAssociation?:string;
    profile?:RadarCompanyProfile;
    presenceResolution?:{websiteUrl?:string;scope:'establishment'|'group'|'unresolved';reason:string;claims:Array<{evidenceId:string;excerpt:string;sourceUrl:string;observedAt:string}>;model?:string};
    documents?:Array<{url:string;sourceUrl:string;observedAt:string;status:'not_read'}>;
    sizeAssessment?:{score:number|null;evidenceCoverage:number;direction:'larger'|'smaller';contributions:Array<{metric:string;amount:number;points:number;weight:number;sourceUrl:string;referenceDate?:string}>;limitations:string[]};
    pages?:Array<{url:string;text:string;observedAt:string;limitation?:string;diagnostic?:{stage:string;kind:string;code:string};tlsException?:RadarTlsExceptionEvidence}>;
    activity?:{status:string;signals:Array<{kind:string;sourceUrl:string;excerpt:string;observedAt:string;publishedDate?:string}>;presenceSignals?:Array<{kind:string;sourceUrl:string;excerpt:string;observedAt:string;association:'confirmed'|'review';scope?:string}>;limitation:string};
    qualification?:{targetStatus:string;productFit:string;reasons:string[];evidenceIds:string[];evidenceSources?:Array<{id:string;sourceUrl:string}>;provider?:string;model?:string};limitations?:string[];
  }};history:Array<{id:string;status:string;updated_at:string}>}
export type RadarResearchRequestState='accepted'|'running'|'waiting'|'unchanged'|'completed'
export type RadarAdministrativeResearch={configurationRevision:number;criteriaRevision:number;requests:Array<{requestId:string;state:RadarResearchRequestState;criteriaRevision:number;configurationRevision:number;budgetRevision:number;createdAt:string;items:number;waiting:number}>;analyses:Array<{receiptId:string;candidateId:string;companyName:string;action:string;status:string;configurationRevision:number;createdAt:string;transport:string|null;validation:string|null;billing:string;failureCode:string|null;provider:string|null;model:string|null;reportedUsd:string|null;estimatedBrl:string|null;canRevalidate:boolean;canAuthorizeRetry:boolean}>}
export type RadarResearchRequestInput={organizationId:string;candidateIds:string[];requestId:string;criteriaRevision:number;intent:'resume'|'refresh'|'reanalyze';analysisAuthorizationId?:string;allowSemanticRefresh?:boolean}
export type RadarResearchRequestResult={requestId:string;state:RadarResearchRequestState;items:Array<{candidateId:string;state:RadarResearchRequestState;message:string;feedback?:import('./generated/radarResearch').CommercialResearchStatusV1}>}
