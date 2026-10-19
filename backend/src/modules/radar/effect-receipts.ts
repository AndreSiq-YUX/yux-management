import type pg from 'pg'
import {existsSync,readFileSync} from 'node:fs'
import {dirname,resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {Ajv2020} from 'ajv/dist/2020.js'
import formatsPlugin from 'ajv-formats'
import type {EffectReceiptV1} from '../../contracts/generated/radarResearch.js'

const relative='contracts/radar/v1/radar-research.schema.json',here=dirname(fileURLToPath(import.meta.url))
const path=[resolve(process.cwd(),relative),resolve(process.cwd(),'..',relative),resolve(here,'../../../..',relative),resolve(here,'../../../../..',relative)].find(existsSync)
if(!path)throw Error('radar_research_contract_missing')
const ajv=new Ajv2020({strict:true,allErrors:true})
const addFormats=formatsPlugin as unknown as (target:Ajv2020)=>Ajv2020
addFormats(ajv)
export const validateRadarResearchContract=ajv.compile(JSON.parse(readFileSync(path,'utf8')))
const finiteCost=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value)&&value>=0
export function inspectRadarEffectResponse(input:{response?:Record<string,unknown>;validationFailureCode?:string;uncertainAfterSend?:boolean;notStarted?:boolean}){
 if(input.response){
  const failureCode=input.response.finish_reason==='length'?'output_truncated':input.validationFailureCode??null
  return{transportOutcome:'received' as const,validationOutcome:failureCode?'invalid' as const:'pending' as const,billingOutcome:finiteCost(input.response.cost_usd)?'known' as const:'uncertain' as const,failureCode}
 }
 return{transportOutcome:input.notStarted?'not_started' as const:'uncertain' as const,validationOutcome:'pending' as const,billingOutcome:input.notStarted?'known' as const:'uncertain' as const,failureCode:null}
}
export function sanitizeRadarEffectBody(value:unknown):unknown{
 if(Array.isArray(value))return value.map(sanitizeRadarEffectBody)
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key])=>!/^(?:authorization|api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret|credential)$/i.test(key)).map(([key,item])=>[key,sanitizeRadarEffectBody(item)]))
 return value
}
// Internal writer only. API/worker DB roles have SELECT, not UPDATE, on this
// protected table; the runtime owns reservations and captures provider replies.
export async function recordRadarEffectResponse(db:Pick<pg.PoolClient,'query'>,input:EffectReceiptV1):Promise<void>{
 if(!validateRadarResearchContract(input)||!('effectKey' in input))throw Error('radar_effect_receipt_invalid')
 const body=JSON.stringify(sanitizeRadarEffectBody(input.responseBody))
 if(Buffer.byteLength(body)>1_000_000)throw Error('radar_effect_response_too_large')
 const result=await db.query(`WITH authorized AS MATERIALIZED(SELECT id FROM public.radar_analysis_receipts WHERE id=$4 AND organization_id=$1 AND owner_token=$5 AND status='reserved' FOR UPDATE)
  UPDATE public.radar_effect_receipts effect SET transport_outcome=$7,validation_outcome=$8,billing_outcome=$9,response_body=$10::jsonb,usage=$11::jsonb,failure_code=$12,provider=$13,model_snapshot=$14,external_request_id=$15,updated_at=NOW()
  WHERE effect.organization_id=$1 AND effect.effect_key=$2 AND effect.attempt=$3 AND effect.analysis_receipt_id=$4 AND effect.owner_token=$5 AND effect.lease_until=$6::timestamptz AND effect.lease_until>NOW()
  AND effect.analysis_receipt_id IN(SELECT id FROM authorized) AND (effect.response_body IS NULL OR effect.response_body=$10::jsonb) AND (effect.usage IS NULL OR effect.usage=$11::jsonb) RETURNING effect.id`,
 [input.organizationId,input.effectKey,input.attempt,input.analysisReceiptId,input.ownerToken,input.leaseUntil,input.transportOutcome,input.validationOutcome,input.billingOutcome,body,JSON.stringify(input.usage),input.failureCode,input.provider??null,input.modelSnapshot??null,input.externalRequestId??null])
 if(!result.rows[0])throw Error('radar_effect_receipt_lease_lost')
}
