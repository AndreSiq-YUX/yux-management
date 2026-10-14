import {expect,it} from 'vitest'
import {buildRadarPresenceSummary} from './radarPresenceSummary'
import type {RadarCandidateRecord} from '@/types/radar'
const candidateBase={id:'c',organizationId:'org',campaignId:'campaign',sourceType:'manual',status:'pending_review' as const,dedupeKey:'c',createdAt:'',updatedAt:'',title:'Alfa'}
it('never activates unsafe URLs or turns registry data into a public contact',()=>{
  const result=buildRadarPresenceSummary({...candidateBase,normalizedPayload:{websiteUrl:'javascript:alert(1)',phoneRaw:'123',publicContacts:[{kind:'social',value:'javascript:alert(1)',sourceUrl:'https://alfa.example/',association:'confirmed'}]}} as RadarCandidateRecord,5)
  expect(result.website).toBeUndefined();expect(result.contacts).toEqual([])
})
it('marks old projections as requiring an update rather than applying their confirmed identity',()=>{
  const result=buildRadarPresenceSummary({...candidateBase,normalizedPayload:{publicPresence:{version:1,configurationRevision:4,website:{url:'https://alfa.example/',association:'confirmed'}}}} as RadarCandidateRecord,5)
  expect(result.website).toBeUndefined();expect(result.pending.join(' ')).toContain('configuração anterior')
})
