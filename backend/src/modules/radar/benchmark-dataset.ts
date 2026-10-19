import {z} from 'zod'
const choice=z.enum(['compatible','outside_profile','investigate'])
const quota=z.object({compatible:z.number().int().nonnegative(),outside_profile:z.number().int().nonnegative(),investigate:z.number().int().nonnegative()}).strict()
const manifestSchema=z.object({schemaVersion:z.literal(1),datasetVersion:z.string().min(1),criteriaVersion:z.string().min(1),contextVersion:z.string().min(1),
 labelStatus:z.enum(['pending','reviewed']),status:z.enum(['draft','frozen']),plannedCases:z.literal(100),quotas:z.object({calibration:quota,validation:quota}).strict(),notes:z.array(z.string()).optional()}).strict()
const review=z.object({reviewedBy:z.string().min(1),reviewedAt:z.iso.datetime(),agrees:z.boolean()}).strict()
const caseSchema=z.object({id:z.string().min(1),entityGroupId:z.string().min(1).optional(),partition:z.enum(['calibration','validation']),labelStatus:z.enum(['pending','reviewed','disputed']),
 criteria:z.record(z.string(),z.unknown()).nullable(),evidence:z.array(z.object({id:z.string().min(1),url:z.url({protocol:/^https?$/}),text:z.string().min(8),observedAt:z.iso.datetime()}).strict()),
 expected:choice.optional(),expectedSourceIds:z.array(z.string()),reviewedBy:z.string().min(1).optional(),reviewedAt:z.iso.datetime().optional(),reason:z.string().min(8).optional(),secondReview:review.optional()}).strict()
export type RadarBenchmarkCase=z.infer<typeof caseSchema>
export function validateRadarBenchmarkDataset(manifest:unknown,values:unknown){
 const issues:Array<{code:string;caseId?:string}>=[]
 const fail=(code:string,caseId?:string)=>issues.push({code,...(caseId?{caseId}:{})})
 const config=manifestSchema.safeParse(manifest)
 if(!config.success)return{readyForQualityReport:false,reviewed:0,pending:0,issues:[{code:'benchmark_manifest_invalid'}]}
 const requiredQuotas={calibration:{compatible:18,outside_profile:18,investigate:24},validation:{compatible:12,outside_profile:12,investigate:16}}
 for(const partition of ['calibration','validation'] as const)for(const label of ['compatible','outside_profile','investigate'] as const)if(config.data.quotas[partition][label]!==requiredQuotas[partition][label])fail('benchmark_manifest_quota_invalid')
 const cases=Array.isArray(values)?values:[]
 if(cases.length!==config.data.plannedCases)fail('benchmark_case_count_mismatch')
 if(config.data.status!=='frozen'||config.data.labelStatus!=='reviewed')fail('benchmark_manifest_not_frozen')
 const counts={calibration:{compatible:0,outside_profile:0,investigate:0},validation:{compatible:0,outside_profile:0,investigate:0}}
 const ids=new Set<string>(),groups=new Map<string,string>()
 let reviewed=0,pending=0
 for(const value of cases){
  const parsed=caseSchema.safeParse(value)
  if(!parsed.success){fail('benchmark_case_invalid');continue}
  const item=parsed.data
  if(ids.has(item.id))fail('benchmark_duplicate_case',item.id)
  ids.add(item.id)
  if(item.entityGroupId){if(groups.has(item.entityGroupId)&&groups.get(item.entityGroupId)!==item.partition)fail('benchmark_group_partition_leak',item.id);groups.set(item.entityGroupId,item.partition)}
  if(item.labelStatus!=='reviewed'){pending++;fail(item.labelStatus==='disputed'?'benchmark_review_conflict':'benchmark_label_pending',item.id);continue}
  const before=issues.length
  if(!item.expected||!item.reviewedBy||!item.reviewedAt||!item.reason||!item.criteria||!item.entityGroupId)fail('benchmark_human_review_required',item.id)
  const sources=new Set(item.evidence.map(source=>source.id))
  if(sources.size!==item.evidence.length||!sources.size||!item.expectedSourceIds.length||item.expectedSourceIds.some(id=>!sources.has(id)))fail('benchmark_evidence_source_missing',item.id)
  if(item.expected!=='investigate'&&!item.secondReview)fail('benchmark_independent_review_required',item.id)
  if(item.secondReview){if(!item.secondReview.agrees)fail('benchmark_review_conflict',item.id);if(item.secondReview.reviewedBy===item.reviewedBy)fail('benchmark_independent_review_required',item.id)}
  if(issues.length===before){reviewed++;if(item.expected)counts[item.partition][item.expected]++}
 }
 for(const partition of ['calibration','validation'] as const)for(const label of ['compatible','outside_profile','investigate'] as const)if(counts[partition][label]!==config.data.quotas[partition][label])fail('benchmark_partition_quota_mismatch')
 return{readyForQualityReport:issues.length===0,reviewed,pending,counts,versions:{dataset:config.data.datasetVersion,criteria:config.data.criteriaVersion,context:config.data.contextVersion},issues}
}
