import {it,expect} from 'vitest'
import {normalizePerplexityEvidence} from '../src/modules/radar/perplexity-evidence.js'
import {radarDeepResearchBudget} from '../src/modules/radar/deep-research.js'
import {radarAgentCampaignSpentUsd} from '../src/modules/radar/deep-research-execution.js'
it('keeps original currency and uncertain prior attempts in campaign spend, independently of exchange rate changes',()=>{
 const first={source:'perplexity_agent',requestId:'old',reservedUsd:'0.1',reservedBrl:'0.5'},second={source:'perplexity_agent',requestId:'new',reservedUsd:'0.1',reservedBrl:'100',actualUsd:'0.03',previous:[first]}
 expect(radarAgentCampaignSpentUsd([{calls:{one:first,two:second}}] as never)).toBe('0.13')
 expect(()=>radarAgentCampaignSpentUsd([{calls:{one:{...first,reservedUsd:undefined}}}] as never)).toThrow('radar_deep_research_legacy_budget_requires_review')
})
it('reserves exact decimal budget units without treating the estimate as a remote cap',()=>{
 expect(radarDeepResearchBudget({enabled:true,allowEstimatedBudget:true,estimatedUsdPerAttempt:.1,budgetUsdPerResearch:.3,budgetUsdPerCampaign:3,maxAttempts:3},2)).toMatchObject({attempts:3,amountUsd:'0.3',hardCeiling:false})
 expect(()=>radarDeepResearchBudget({enabled:true,estimatedUsdPerAttempt:.1,budgetUsdPerResearch:1,budgetUsdPerCampaign:3},2)).toThrow('research_estimated_budget_approval_required')
})
const source={id:'1',source:'web',url:'https://alfa.example/fornecedor',title:'Alfa',snippet:'Alfa: fornecedores escrevam para compras@alfa.example.'}
it('resolves explicit web markers with empty annotations but publishes no invented contact',()=>{
 const result=normalizePerplexityEvidence({id:'r1',output:[{type:'search_results',results:[source]},{type:'message',content:[{type:'output_text',text:'Fornecedores [web:1].',annotations:[]}]}]})
 expect(result.references).toEqual([{marker:'web:1',evidenceId:'r1:web:1'}])
 expect(result.evidence[0]).toMatchObject({id:'r1:web:1',sourceUrl:source.url,scope:'unresolved',text:source.snippet})
 expect(result.claims).toEqual([])
})
it('does not guess missing markers or duplicate ids with different source URLs',()=>{
 const result=normalizePerplexityEvidence({id:'r1',output:[{type:'search_results',results:[source,{...source,url:'https://other.example'}]},{type:'message',content:[{text:'Contato [web:1] e [web:99]'}]}]})
 expect(result.references).toEqual([])
 expect(result.unresolved).toEqual(['web:1','web:99'])
})
it('accepts a claim only when its exact excerpt and value are present in its single source',()=>{
 const result=normalizePerplexityEvidence({id:'r1',output:[{type:'search_results',results:[source]}],claims:[{kind:'email',value:'compras@alfa.example',excerpt:'fornecedores escrevam para compras@alfa.example.',sourceIds:['web:1']},{kind:'email',value:'inventado@alfa.example',excerpt:'Alfa',sourceIds:['web:1']}]})
 expect(result.claims).toHaveLength(1)
 expect(result.claims[0]).toMatchObject({value:'compras@alfa.example',association:'review'})
})
