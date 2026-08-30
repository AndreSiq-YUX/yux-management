import type { MissionEconomics } from '../economics.js'
import type { EvaluationConclusion } from '../evaluator.js'
import type { PackMetricSnapshot } from './collector.js'

export type CompositePackEvaluation = {
  packKey: string
  conclusion: EvaluationConclusion
  reasons: string[]
  optional: boolean
  dependsOn: string[]
}

export type CompositeEvaluation = {
  conclusion: EvaluationConclusion
  reasons: string[]
  affectedPacks: string[]
  packConclusions: Record<string, { conclusion: EvaluationConclusion; reasons: string[] }>
}

export function aggregateCompositeMetricSnapshots(snapshots: PackMetricSnapshot[], measuredAt = new Date().toISOString()): PackMetricSnapshot {
  if (new Set(snapshots.map(item => item.packKey)).size !== snapshots.length) throw new Error('mission_composite_metric_pack_duplicate')
  return {
    packKey: 'composite', measuredAt,
    metrics: Object.fromEntries(snapshots.flatMap(snapshot => Object.entries(snapshot.metrics).map(([key,value]) => [`${snapshot.packKey}.${key}`,value]))),
    evidence: Object.fromEntries(snapshots.flatMap(snapshot => Object.entries(snapshot.evidence).map(([key,value]) => [`${snapshot.packKey}.${key}`,value]))),
    signals: {
      criticalGuardrailBreached: snapshots.some(item => item.signals.criticalGuardrailBreached),
      killSwitchActive: snapshots.some(item => item.signals.killSwitchActive),
      minimumSampleReached: snapshots.every(item => item.signals.minimumSampleReached),
      offTrack: snapshots.some(item => item.signals.offTrack),
      requiredMetricUnknownIsBlocking: snapshots.some(item => item.signals.requiredMetricUnknownIsBlocking),
      reasons: snapshots.flatMap(item => item.signals.reasons.map(reason => `${item.packKey}:${reason}`)),
    },
  }
}

export function evaluateCompositeMission(input: {
  packs: CompositePackEvaluation[]
  economics: MissionEconomics
  maxTotalCostBrl: string
  acceptanceCriteriaMet?: boolean
}): CompositeEvaluation {
  if (input.packs.length < 2) throw new Error('mission_composite_evaluation_pack_count_invalid')
  if (Number(input.economics.totalExecutionCostBrl) > Number(input.maxTotalCostBrl)) return result('pause',['composite_budget_breached'],input.packs,input.packs.map(item=>item.packKey))
  const paused = input.packs.filter(item => item.conclusion === 'pause')
  if (paused.length) return result('pause',packReasons(paused),input.packs,dependents(paused.map(item=>item.packKey),input.packs))
  const requiredFailed = input.packs.filter(item => !item.optional && item.conclusion === 'fail')
  if (requiredFailed.length) return result('fail',packReasons(requiredFailed),input.packs,dependents(requiredFailed.map(item=>item.packKey),input.packs))
  const blocked = input.packs.filter(item => item.conclusion === 'block')
  if (blocked.length) return result('block',packReasons(blocked),input.packs,dependents(blocked.map(item=>item.packKey),input.packs))
  const replan = input.packs.filter(item => item.conclusion === 'propose_replan')
  if (replan.length) return result('propose_replan',packReasons(replan),input.packs,dependents(replan.map(item=>item.packKey),input.packs))
  const requiredExpired = input.packs.filter(item => !item.optional && item.conclusion === 'expire')
  if (requiredExpired.length) return result('expire',packReasons(requiredExpired),input.packs,dependents(requiredExpired.map(item=>item.packKey),input.packs))
  const optionalFailed = input.packs.filter(item => item.optional && ['fail','expire'].includes(item.conclusion))
  if (optionalFailed.length) return result('block',['optional_pack_incomplete',...packReasons(optionalFailed)],input.packs,optionalFailed.map(item=>item.packKey))
  if (input.acceptanceCriteriaMet === true || input.packs.every(item => item.optional || item.conclusion === 'succeed')) return result('succeed',['composite_acceptance_criteria_met'],input.packs,[])
  return result('continue',['composite_observation_continues'],input.packs,[])
}

function result(conclusion:EvaluationConclusion,reasons:string[],packs:CompositePackEvaluation[],affectedPacks:string[]):CompositeEvaluation{return{conclusion,reasons:[...new Set(reasons)],affectedPacks:[...new Set(affectedPacks)],packConclusions:Object.fromEntries(packs.map(item=>[item.packKey,{conclusion:item.conclusion,reasons:item.reasons}]))}}
function packReasons(packs:CompositePackEvaluation[]){return packs.flatMap(item=>item.reasons.map(reason=>`${item.packKey}:${reason}`))}
function dependents(seed:string[],packs:CompositePackEvaluation[]){const affected=new Set(seed);let changed=true;while(changed){changed=false;for(const pack of packs)if(pack.dependsOn.some(key=>affected.has(key))&&!affected.has(pack.packKey)){affected.add(pack.packKey);changed=true}}return [...affected]}
