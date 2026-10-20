import {it,expect} from 'vitest'
import {readFile} from 'node:fs/promises'
import {evaluateRadarDiscovery,type DiscoverySourceSample} from '../scripts/evaluate-radar-discovery.js'
import {validateRadarBenchmarkDataset} from '../src/modules/radar/benchmark-dataset.js'
import {projectRadarCommercialResponse} from '../src/modules/radar/commercial-view.js'

it('compares discovery coverage and complete costs across the new adapters without calling a provider',()=>{
 const company={identityKey:'synthetic:one',verifiedIdentity:true,reviewedFit:'compatible' as const,existing:false,complete:true,usefulContact:true}
 const sample=(source:string):DiscoverySourceSample=>({source,strategy:source,segment:'Perfil sintético',region:'Região sintética',queryPlanVersion:'fixture-v2',startedAt:'2026-10-20T12:00:00Z',status:'evaluated',rateSnapshot:{usdToBrl:'5',asOf:'2026-10-20',source:'synthetic'},rawItems:[{id:'one',kind:'directory',mentions:[company]}],companies:[company],costs:[{kind:'search',amount:'0.001',currency:'USD',billingOutcome:'known'},{kind:'extraction',amount:'0.002',currency:'USD',billingOutcome:'known'},{kind:'research',amount:'0.003',currency:'USD',billingOutcome:'known'}]})
 const result=evaluateRadarDiscovery(['serper_web_search','perplexity_search_fast','perplexity_agent'].map(sample))
 expect(result).toMatchObject({qualityStatus:'not_evaluated',uniqueCompatibleNew:1,uniqueReadyNew:1,costBrl:'0.09',costPerCompatibleNewBrl:'0.09'})
 expect(result.sources.every(item=>item.exclusiveCompatibleNew===0)).toBe(true)
 expect(result.intersections.every(item=>item.compatibleNew===1)).toBe(true)
})
it('does not present unreviewed collection slots as measured model quality or reveal new internal fields to clients',async()=>{
 const directory=new URL('../../contracts/radar/benchmark/v1/',import.meta.url)
 const [manifest,cases]=await Promise.all(['manifest.json','cases.json'].map(file=>readFile(new URL(file,directory),'utf8').then(JSON.parse)))
 expect(validateRadarBenchmarkDataset(manifest,cases)).toMatchObject({readyForQualityReport:false,reviewed:0})
 const projection=projectRadarCommercialResponse('candidates',[{title:'Empresa Alfa',normalizedPayload:{tradeName:'Empresa Alfa',discoverySourceType:'perplexity_search_fast',researchUsesPerplexity:true,stages:[{action:'radar_deep_research',meanElapsedMs:20}],analysisOutcomes:{uncertain:1},costRateSnapshot:{usdToBrl:'5'},companyProfile:{summary:{value:'Perplexity indisponível'}}}}])
 expect(JSON.stringify(projection)).not.toMatch(/perplexity|SourceType|researchUses|meanElapsed|costRate|uncertain/i)
 expect(JSON.stringify(projection)).toContain('Empresa Alfa')
})
