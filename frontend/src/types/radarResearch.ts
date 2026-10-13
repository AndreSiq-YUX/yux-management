export type RadarProfileClaim={value:string;evidenceId:string;excerpt:string;sourceUrl:string;observedAt:string;scope:'establishment'|'group'|'unresolved'}
export type RadarCompanyProfile={summary?:RadarProfileClaim;services:RadarProfileClaim[];customerSegments:RadarProfileClaim[];operatingRegions:RadarProfileClaim[];
  scaleSignals:Array<RadarProfileClaim&{metric:string;amount:number;referenceDate?:string;currency?:string}>}
export type RadarResearchAvailability = { allowed:boolean; reasons:Array<{code:string;message:string;sourceType?:string;resolution:string}>;
  presenceResolutionEnabled?:boolean;
  presence?:{routeConfigured:boolean;model?:string;provider?:string;maxInputTokens:number;maxOutputTokens:number;budgetReferenceBrl?:number;fallbackCount:number};
  operations?:{reanalyze:{allowed:boolean;reasons:Array<{code:string;message:string;resolution:string}>}};
  estimates:Array<{sourceType:string;costPerQuery:number;maximumQueries:number}>;maximumCostPerCandidate:number;maxQueriesPerCandidate:number;semanticQualificationEnabled:boolean;
  semantic?:{routeConfigured:boolean;model?:string;provider?:string;maxInputTokens:number;maxOutputTokens:number;budgetReferenceBrl?:number;fallbackCount:number} }
export type RadarResearchContact = {kind:'phone'|'email'|'whatsapp'|'social'|'business_person';value:string;sourceUrl:string;observedAt:string;association:'confirmed'|'review';note?:string;
  purpose?:'general'|'suppliers'|'sales'|'finance'|'recruitment'|'unknown';purposeEvidence?:string;scope?:string;preferred?:boolean}
export type RadarResearchResult = {configurationRevision:number;availability:RadarResearchAvailability;
  run:null|{id:string;status:string;stage:string;error_code?:string;updated_at:string;configuration_revision:number;output:{
    discovery?:{association:string;websiteUrl?:string;suggestions:Array<{url:string;title:string}>;limitations:string[]};
    contacts?:RadarResearchContact[];registryPhone?:string;registryEmail?:string;siteAssociation?:string;
    profile?:RadarCompanyProfile;
    presenceResolution?:{websiteUrl?:string;scope:'establishment'|'group'|'unresolved';reason:string;claims:Array<{evidenceId:string;excerpt:string;sourceUrl:string;observedAt:string}>;model?:string};
    documents?:Array<{url:string;sourceUrl:string;observedAt:string;status:'not_read'}>;
    sizeAssessment?:{score:number|null;evidenceCoverage:number;direction:'larger'|'smaller';contributions:Array<{metric:string;amount:number;points:number;weight:number;sourceUrl:string;referenceDate?:string}>;limitations:string[]};
    pages?:Array<{url:string;text:string;observedAt:string;limitation?:string}>;
    activity?:{status:string;signals:Array<{kind:string;sourceUrl:string;excerpt:string;observedAt:string;publishedDate?:string}>;limitation:string};
    qualification?:{targetStatus:string;productFit:string;reasons:string[];evidenceIds:string[];evidenceSources?:Array<{id:string;sourceUrl:string}>;provider?:string;model?:string};limitations?:string[];
  }};history:Array<{id:string;status:string;updated_at:string}>}
