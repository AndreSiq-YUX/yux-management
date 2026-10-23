import { expect,it } from 'vitest'
import { deriveRadarProspectingMetrics,radarProspectingMetricCollector } from '../src/modules/action-engine/metrics/radar-prospecting.js'
import { buildMissionArtifactProjections } from '../src/modules/action-engine/mission-artifacts.js'

it('does not infer revenue, qualified leads or success from an empty research',()=>{
 const snapshot=deriveRadarProspectingMetrics({requested:10,found:0,complete:0,pending:0,blocked:0,partial:1,operations:1})
 expect(snapshot.metrics.attributed_revenue_brl.kind).toBe('not_applicable')
 const result=radarProspectingMetricCollector.evaluate({snapshot,mission:{parameters:{targetRevenueBrl:'0'}} as never,economics:{} as never,now:new Date().toISOString()})
 expect(result.conclusion).not.toBe('succeed')
})
it('projects Radar artifacts with a nested commercial allowlist',()=>{
 const campaignId='00000000-0000-4000-8000-000000000001'
 const artifacts=buildMissionArtifactProjections({plan:{parameters:{campaign:{name:'CNPJá Comércio',targetSegment:'Indústria',provider:'secret'}}},actions:[
 {stepKey:'pack.campaign',status:'succeeded',output:{output:{campaignId,status:'saved',provider:'secret'}}},
 {stepKey:'pack.await',status:'succeeded',output:{output:{status:'partial',campaignHref:'javascript:bad',counts:{found:4,approved:0,cost:100},raw:{token:'secret'}}}},
 ],approvals:[],sources:[]})
 expect(artifacts[0].data.name).toBe('CNPJá Comércio')
 expect(artifacts[0].data).not.toHaveProperty('provider')
 expect(JSON.stringify(artifacts)).not.toMatch(/secret|javascript|token|cost/)
 expect(artifacts[1].data.counts).toEqual({found:4,approved:0})
})
