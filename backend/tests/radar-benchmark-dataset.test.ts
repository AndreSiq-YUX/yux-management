import {expect,it} from 'vitest'
import {readFile} from 'node:fs/promises'
const api=await import('../src/modules/radar/benchmark-dataset.js').catch(()=>({})) as Record<string,any>
const choices=['compatible','outside_profile','investigate'] as const
const manifest={schemaVersion:1,datasetVersion:'v1',criteriaVersion:'v1',contextVersion:'v1',labelStatus:'reviewed',status:'frozen',plannedCases:100,quotas:{calibration:{compatible:18,outside_profile:18,investigate:24},validation:{compatible:12,outside_profile:12,investigate:16}}}
function reviewedCases(){return(['calibration','validation'] as const).flatMap(partition=>choices.flatMap(choice=>Array.from({length:manifest.quotas[partition][choice]},(_,i)=>{
 const id=`${partition}-${choice}-${i}`
 return{id,entityGroupId:id,partition,labelStatus:'reviewed',criteria:{segment:'Critério sintético'},evidence:[{id:'source',url:'https://empresa.example/',text:'Evidência sintética exclusivamente para testar o validador.',observedAt:'2026-10-19T12:00:00Z'}],expected:choice,expectedSourceIds:['source'],reviewedBy:'fixture-reviewer-1',reviewedAt:'2026-10-19T12:00:00Z',reason:'Fixture de teste; não representa rótulo humano real.',secondReview:{reviewedBy:'fixture-reviewer-2',reviewedAt:'2026-10-19T12:00:00Z',agrees:true}}
})))}
it('requires reviewed labels, stratified partitions, evidence sources and independent second review before final quality reporting',()=>{
 expect(api.validateRadarBenchmarkDataset).toBeTypeOf('function')
 const cases=reviewedCases()
 expect(api.validateRadarBenchmarkDataset(manifest,cases)).toMatchObject({readyForQualityReport:true,reviewed:100,pending:0})
 for(const [mutate,code]of [
  [(values:any[])=>values[0].labelStatus='pending','benchmark_label_pending'],
  [(values:any[])=>values[0].secondReview.agrees=false,'benchmark_review_conflict'],
  [(values:any[])=>values[0].secondReview.reviewedBy=values[0].reviewedBy,'benchmark_independent_review_required'],
  [(values:any[])=>values[99].entityGroupId=values[0].entityGroupId,'benchmark_group_partition_leak'],
  [(values:any[])=>values[0].evidence[0].url='','benchmark_case_invalid'],
  [(values:any[])=>values[0].expectedSourceIds=['missing'],'benchmark_evidence_source_missing'],
  [(values:any[])=>values[0].partition='validation','benchmark_partition_quota_mismatch'],
 ] as const){const changed=structuredClone(cases);mutate(changed);const result=api.validateRadarBenchmarkDataset(manifest,changed);expect(result.readyForQualityReport).toBe(false);expect(result.issues.map((issue:any)=>issue.code)).toContain(code)}
})
it('ships pending collection slots, never labels or evidence attributed to the user',async()=>{
 expect(api.validateRadarBenchmarkDataset).toBeTypeOf('function')
 const base=new URL('../../contracts/radar/benchmark/v1/',import.meta.url)
 const config=JSON.parse(await readFile(new URL('manifest.json',base),'utf8'))
 const data=JSON.parse(await readFile(new URL('cases.json',base),'utf8'))
 const result=api.validateRadarBenchmarkDataset(config,data.cases)
 expect(data.cases).toHaveLength(100)
 expect(result).toMatchObject({readyForQualityReport:false,reviewed:0,pending:100})
 expect(data.cases.every((item:any)=>item.labelStatus==='pending'&&!item.reviewedBy&&!item.expected&&item.evidence.length===0)).toBe(true)
 const scopes=JSON.parse(await readFile(new URL('discovery-scopes.json',base),'utf8'))
 expect(scopes.executionStatus).toBe('not_evaluated')
 expect(scopes.sources).toContain('osm_extract')
})
it('does not permit silently replacing the agreed stratification with all-positive cases',()=>{
 const changed=reviewedCases().map(item=>({...item,expected:'compatible'}))
 const config={...manifest,quotas:{calibration:{compatible:60,outside_profile:0,investigate:0},validation:{compatible:40,outside_profile:0,investigate:0}}}
 expect(api.validateRadarBenchmarkDataset(config,changed).readyForQualityReport).toBe(false)
})
