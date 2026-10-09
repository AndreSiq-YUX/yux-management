export type RadarResearchAvailability = { allowed:boolean; reasons:Array<{code:string;message:string;sourceType?:string;resolution:string}>;
  estimates:Array<{sourceType:string;costPerQuery:number;maximumQueries:number}>;maximumCostPerCandidate:number;maxQueriesPerCandidate:number;semanticQualificationEnabled:boolean }
export type RadarResearchContact = {kind:'phone'|'email'|'whatsapp'|'social'|'business_person';value:string;sourceUrl:string;observedAt:string;association:'confirmed'|'review';note?:string}
export type RadarResearchResult = {configurationRevision:number;availability:RadarResearchAvailability;
  run:null|{id:string;status:string;stage:string;error_code?:string;updated_at:string;configuration_revision:number;output:{
    discovery?:{association:string;websiteUrl?:string;suggestions:Array<{url:string;title:string}>;limitations:string[]};
    contacts?:RadarResearchContact[];registryPhone?:string;registryEmail?:string;siteAssociation?:string;
    pages?:Array<{url:string;text:string;observedAt:string;limitation?:string}>;
    activity?:{status:string;signals:Array<{kind:string;sourceUrl:string;excerpt:string;observedAt:string;publishedDate?:string}>;limitation:string};
    qualification?:{targetStatus:string;productFit:string;reasons:string[];evidenceIds:string[];evidenceSources?:Array<{id:string;sourceUrl:string}>;provider?:string;model?:string};limitations?:string[];
  }};history:Array<{id:string;status:string;updated_at:string}>}
