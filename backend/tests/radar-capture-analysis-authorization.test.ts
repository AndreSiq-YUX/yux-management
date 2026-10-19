import {it,expect} from 'vitest'
import {radarCaptureRefreshAuthorized} from '../src/modules/radar/capture-analysis-authorization.js'
import {startRadarCandidateResearch} from '../src/modules/radar/research-service.js'

const grant={requestId:'request',approvedBy:'admin',configurationRevision:3,candidateIds:['candidate']}
const operation={resume_request_id:'request',configuration_revision:3,analysis_refresh_authorizations:[grant]}
const noQuery={query:async()=>{throw Error('approval_not_applicable')}}
it('does not reuse an authorization for another request, revision or candidate',async()=>{
  expect(await radarCaptureRefreshAuthorized(noQuery as never,{...operation,resume_request_id:'new'},'candidate')).toBe(false)
  expect(await radarCaptureRefreshAuthorized(noQuery as never,{...operation,configuration_revision:4},'candidate')).toBe(false)
  expect(await radarCaptureRefreshAuthorized(noQuery as never,operation,'other')).toBe(false)
})
it('rechecks the approving administrator instead of trusting persisted metadata',async()=>{
  const revoked={query:async()=>({rows:[]})}
  expect(await radarCaptureRefreshAuthorized(revoked as never,operation,'candidate')).toBe(false)
})
it.each(['yux_operator','client_admin','client_member'])('rejects forged analysis approval by %s before database access',async role=>{
  await expect(startRadarCandidateResearch(noQuery as never,{id:'other',role} as never,{organizationId:'org',candidateId:'candidate',configurationRevision:3,allowSemanticRefresh:true})).rejects.toMatchObject({statusCode:403})
})
