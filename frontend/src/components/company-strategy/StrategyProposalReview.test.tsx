import { describe, expect, it, vi } from 'vitest'
import { render, click, byText } from '@/components/portal-ui/__tests__/render'
import { StrategyProposalReview } from './StrategyProposalReview'

vi.mock('@/services/companyIntelligenceService',()=>({companyIntelligenceService:{listRepresentedBusinesses:vi.fn().mockResolvedValue([{id:'archived',name:'Marca antiga',status:'archived'}])}}))
const content={schemaVersion:1 as const,title:'Estratégia da oficina',objective:'Aumentar agendamentos da oficina',summary:'Priorizar serviços preventivos e retorno dos clientes.',sections:[],references:{productIds:[],documentIds:[]}}
const proposal={proposalId:'proposal-1',strategyId:null,baseRevisionId:null,baseStrategyVersion:null,content,sourceRefs:[],status:'suggested' as const,currentStrategy:null,baseRevision:null,responseHash:'a'.repeat(64),appliedStrategyId:null}
describe('StrategyProposalReview',()=>{
  it('saves a reviewed draft without offering or automatically performing publication',async()=>{
    const apply=vi.fn().mockResolvedValue(undefined)
    const {container,unmount}=await render(<StrategyProposalReview proposal={proposal} onApply={apply} />)
    expect(container.textContent).toContain('Revisar estratégia')
    expect(byText(container,'button','Publicar para os agentes')).toBeNull()
    await click(byText(container,'button','Salvar rascunho'))
    expect(apply.mock.calls[0][0].title).toBe('Estratégia da oficina')
    await unmount()
  })
  it('preserves the review on a failed save and shows the base for comparison',async()=>{
    const apply=vi.fn().mockRejectedValue(new Error('A estratégia foi alterada.'))
    const {container,unmount}=await render(<StrategyProposalReview proposal={proposal} onApply={apply} />)
    await click(byText(container,'button','Salvar rascunho'))
    expect(container.textContent).toContain('A estratégia foi alterada.')
    expect(container.querySelector('input[aria-label="Título da estratégia"]')).not.toBeNull()
    await unmount()
  })
})

it('shows an archived linked brand and allows its explicit removal during proposal review',async()=>{
 const apply=vi.fn().mockResolvedValue(undefined)
 const view=await render(<StrategyProposalReview organizationId="org" proposal={{...proposal,content:{...content,references:{...content.references,representedBusinessIds:['archived']}}}} onApply={apply}/>)
 expect(view.container.textContent).toContain('Marca antiga · Arquivada')
 await click(view.container.querySelector('input[type="checkbox"]'))
 await click(byText(view.container,'button','Salvar rascunho'))
 expect(apply.mock.calls[0][0].references.representedBusinessIds).toEqual([])
 await view.unmount()
})
