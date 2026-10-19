import {z} from 'zod'

// Bounded exact decimal strings, not binary floats. The bound protects parsing
// resources; it is not a campaign spending quota.
const decimal=z.string().regex(/^\d{1,36}(?:\.\d{1,36})?$/,'radar_cost_decimal_invalid')
function parts(value:string){const [whole,fraction='']=decimal.parse(value).split('.');return{units:BigInt(whole+fraction),scale:fraction.length}}
function render(units:bigint,scale:number){
 const digits=units.toString().padStart(scale+1,'0')
 const result=scale?`${digits.slice(0,-scale)}.${digits.slice(-scale)}`.replace(/0+$/,'').replace(/\.$/,''):digits
 return result.replace(/^0+(?=\d)/,'')
}
function aligned(left:string,right:string){const a=parts(left),b=parts(right),scale=Math.max(a.scale,b.scale);return{left:a.units*10n**BigInt(scale-a.scale),right:b.units*10n**BigInt(scale-b.scale),scale}}
export function addRadarDecimal(left:string,right:string){const value=aligned(left,right);return render(value.left+value.right,value.scale)}
export function multiplyRadarDecimal(left:string,right:string){const a=parts(left),b=parts(right);return render(a.units*b.units,a.scale+b.scale)}
export function compareRadarDecimal(left:string,right:string){const value=aligned(left,right);return value.left<value.right?-1:value.left>value.right?1:0}
export function remainingRadarCostUnits(input:{budget:string;used:string;unitPrice:string}){
 const value=aligned(input.budget,input.used)
 if(value.left<=value.right)return 0
 const unit=parts(input.unitPrice)
 if(!unit.units)return Number.MAX_SAFE_INTEGER
 const units=(value.left-value.right)*10n**BigInt(unit.scale)/(unit.units*10n**BigInt(value.scale))
 return Number(units>BigInt(Number.MAX_SAFE_INTEGER)?BigInt(Number.MAX_SAFE_INTEGER):units)
}
export function radarReportedCostAmount(value:unknown):string|null{
 if(typeof value!=='number'&&typeof value!=='string'||typeof value==='number'&&(!Number.isFinite(value)||value<0))return null
 let amount=String(value)
 const scientific=/^(\d+)(?:\.(\d+))?e([+-]?\d+)$/i.exec(amount)
 if(scientific){const digits=scientific[1]+(scientific[2]??''),position=scientific[1].length+Number(scientific[3]);if(Math.abs(position)>72)return null
  amount=position<=0?`0.${'0'.repeat(-position)}${digits}`:position>=digits.length?digits+'0'.repeat(position-digits.length):`${digits.slice(0,position)}.${digits.slice(position)}`}
 return decimal.safeParse(amount).success?amount:null
}
export const radarCostPolicySchema=z.object({usdToBrl:decimal.refine(value=>parts(value).units>0n,'radar_cost_rate_invalid').nullable(),rateAsOf:z.iso.datetime().nullable(),rateSource:z.literal('manual'),marginPercent:decimal}).strict().superRefine((value,ctx)=>{
 if((value.usdToBrl===null)!==(value.rateAsOf===null))ctx.addIssue({code:'custom',message:'radar_cost_rate_date_required'})
})
export type RadarCostPolicy=z.infer<typeof radarCostPolicySchema>
export const defaultRadarCostPolicy:RadarCostPolicy={usdToBrl:null,rateAsOf:null,rateSource:'manual',marginPercent:'0'}
export type RadarCostEstimate={amountBrl:string|null;originalAmount:string|null;currency:'BRL'|'USD';rateSnapshot:Readonly<RadarCostPolicy>|null;estimated:true;reason?:'radar_cost_unknown'|'radar_cost_rate_missing'}
export function estimateRadarCostBrl(input:{amount:string|null;currency:'BRL'|'USD';rateSnapshot:RadarCostPolicy|null}):RadarCostEstimate{
 const currency=z.enum(['BRL','USD']).parse(input.currency)
 const rateSnapshot=input.rateSnapshot?Object.freeze({...radarCostPolicySchema.parse(input.rateSnapshot)}):null
 const base={originalAmount:input.amount,currency,rateSnapshot,estimated:true as const}
 if(input.amount===null)return{...base,amountBrl:null,reason:'radar_cost_unknown'}
 const amount=parts(input.amount)
 if(currency==='BRL'||amount.units===0n)return{...base,amountBrl:render(amount.units,amount.scale)}
 if(!rateSnapshot?.usdToBrl)return{...base,amountBrl:null,reason:'radar_cost_rate_missing'}
 const rate=parts(rateSnapshot.usdToBrl),margin=parts(rateSnapshot.marginPercent)
 const factor=100n*10n**BigInt(margin.scale)+margin.units
 return{...base,amountBrl:render(amount.units*rate.units*factor,amount.scale+rate.scale+margin.scale+2)}
}
