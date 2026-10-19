import {expect,it} from 'vitest'
const api=await import('../src/modules/radar/company-projection.js') as Record<string,any>
const versions=await import('../src/modules/radar/evidence-version.js')
const old={cnpj:'12345678000190',tradeName:'Empresa Alfa',websiteUrl:'https://alfa.example/',siteFinalUrl:'https://alfa.example/',websiteStatus:'verified_present',siteCheckedAt:'2026-10-18T12:00:00Z',researchRunId:'old-run',researchRevision:1,
 researchDependencyVersions:{identityHash:'same-identity'},publicPresence:{version:1,configurationRevision:1,website:{url:'https://alfa.example/',association:'confirmed',scope:'group',readable:true,sourceUrl:'https://alfa.example/',observedAt:'2026-10-18T12:00:00Z'},contacts:[]},
 publicContacts:[{kind:'email',value:'compras@alfa.example',sourceUrl:'https://alfa.example/',observedAt:'2026-10-18T12:00:00Z',association:'confirmed',scope:'group'}],companyProfile:{summary:{value:'Atende empresas',sourceUrl:'https://alfa.example/',observedAt:'2026-10-18T12:00:00Z'}}}
const incoming={researchRunId:'new-run',researchRevision:1,websiteStatus:'unknown',websiteUrl:undefined,publicPresence:{version:1,configurationRevision:1,contacts:[]},publicContacts:[],researchComplete:false,researchQuality:{readyForReview:false},targetStatus:'review'}
const options={identityHash:'same-identity',configurationRevision:1,freshnessDays:30,now:Date.parse('2026-10-19T12:00:00Z')}
it('preserves dated known facts during incomplete refresh, without manufacturing current activity or changing group scope',()=>{
 expect(api.mergeRadarCompanyResearch).toBeTypeOf('function')
 const result=api.mergeRadarCompanyResearch(old,incoming,options)
 expect(result).toMatchObject({websiteUrl:old.websiteUrl,siteCheckedAt:old.siteCheckedAt,researchRefreshIncomplete:true,researchQuality:{readyForReview:false},previousResearch:{runId:'old-run',configurationRevision:1,belongsToCurrentIdentity:true}})
 expect(result.publicContacts[0]).toMatchObject({value:'compras@alfa.example',scope:'group',observedAt:'2026-10-18T12:00:00Z'})
 expect(result.activityAssessment?.status).not.toBe('operating_confirmed')
 expect(old.researchRunId).toBe('old-run')
 const again=api.mergeRadarCompanyResearch(result,{...incoming,researchRunId:'third-run'},options)
 expect(again.previousResearch.runId).toBe('old-run')
 expect(again.siteCheckedAt).toBe(old.siteCheckedAt)
})
it('retains a human-selected candidate site without promoting it to a verified association',()=>{
 const manual={...old,publicPresence:undefined,researchDependencyVersions:undefined,websiteStatus:'unverified',braveMatchStatus:'manual_matched',braveObservedAt:old.siteCheckedAt}
 const result=api.mergeRadarCompanyResearch(manual,incoming,options)
 expect(result).toMatchObject({websiteUrl:old.websiteUrl,websiteStatus:'unverified',researchAssociationNeedsReview:true})
 expect(api.mergeRadarCompanyResearch(manual,incoming,{...options,identityCnpj:'99999999000199'}).websiteUrl).toBeUndefined()
})
it('does not present an old identity or its history as current after a manual CNPJ change',()=>{
 const identity={name:old.tradeName,cnpj:old.cnpj,city:'',state:'',address:''}
 const researchDependencyVersions=versions.radarResearchDependencyVersions({identity,criteria:{},evidence:[]})
 const result=api.projectRadarCompanyFacts({...old,cnpj:'99999999000199',researchDependencyVersions,previousResearch:{belongsToCurrentIdentity:true,websiteUrl:old.websiteUrl}})
 expect(result.websiteUrl).toBeUndefined()
 expect(result.previousResearch.belongsToCurrentIdentity).toBe(false)
 expect(result.publicContacts.every((item:any)=>item.association!=='confirmed')).toBe(true)
})
it('does not promote unproven legacy, stale, identity-conflicting or directory facts back into the current company',()=>{
 expect(api.mergeRadarCompanyResearch).toBeTypeOf('function')
 for(const change of [{identityHash:'different-company'},{identityConflict:true},{now:Date.parse('2027-01-01T12:00:00Z')}])expect(api.mergeRadarCompanyResearch(old,incoming,{...options,...change}).websiteUrl).toBeUndefined()
 const legacy={...old,researchDependencyVersions:undefined}
 expect(api.mergeRadarCompanyResearch(legacy,incoming,options)).toMatchObject({websiteUrl:undefined,previousResearch:{belongsToCurrentIdentity:false}})
 const directory={...old,websiteUrl:'https://serasaexperian.com.br/consulta',siteFinalUrl:'https://serasaexperian.com.br/consulta',publicPresence:undefined}
 expect(api.mergeRadarCompanyResearch(directory,incoming,options).websiteUrl).toBeUndefined()
 expect(api.mergeRadarCompanyResearch(old,{...incoming,publicContacts:[{...old.publicContacts[0],value:'novo@alfa.example',observedAt:'2026-10-19T12:00:00Z'}]},options).publicContacts[0].value).toBe('novo@alfa.example')
})
