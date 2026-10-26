import {companyIntelligenceService} from '@/services/companyIntelligenceService'
import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { SectionCard, portalButtonClasses, portalFocusRing } from '@/components/portal-ui'
import { strategySectionLabels, type CompanyStrategyContentV1, type StrategySectionKind } from '@/types/companyStrategy'

type Props = { organizationId?:string; content: CompanyStrategyContentV1; onChange: (content: CompanyStrategyContentV1) => void; saving: boolean }
export function StrategyEditor({ organizationId, content, onChange, saving }: Props) {
  const [brands,setBrands]=useState<Array<{id:string;name:string;status:string}>>([])
  useEffect(()=>{let active=true;if(organizationId)companyIntelligenceService.listRepresentedBusinesses(organizationId).then(items=>{if(active)setBrands(items)}).catch(()=>{});return()=>{active=false}},[organizationId])
  const [newKind, setNewKind] = useState<StrategySectionKind>('custom')
  const update = (key: 'title' | 'objective' | 'summary', value: string) => onChange({ ...content, [key]: value })
  const move = (index: number, direction: number) => {
    const sections = [...content.sections]
    const next = index + direction
    if (next < 0 || next >= sections.length) return
    ;[sections[index], sections[next]] = [sections[next], sections[index]]
    onChange({ ...content, sections })
  }
  return <fieldset disabled={saving} className="flex min-w-0 flex-col gap-5">
    <legend className="sr-only">Editar estratégia</legend>
    <SectionCard title="Direção da estratégia" description="O que queremos alcançar e qual caminho vamos seguir.">
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-2 text-sm font-medium">Título<Input aria-label="Título da estratégia" value={content.title} maxLength={200} onChange={event => update('title', event.target.value)} /></label>
        <label className="flex flex-col gap-2 text-sm font-medium">Objetivo<Textarea aria-label="Objetivo da estratégia" value={content.objective} maxLength={2000} rows={3} onChange={event => update('objective', event.target.value)} /></label>
        <label className="flex flex-col gap-2 text-sm font-medium">Resumo<Textarea aria-label="Resumo da estratégia" value={content.summary} maxLength={2000} rows={4} onChange={event => update('summary', event.target.value)} /></label>
      </div>
    </SectionCard>
    {!!brands.length&&<SectionCard title="Marcas que participam desta estratégia">{brands.filter(brand=>brand.status==='active'||(content.references.representedBusinessIds??[]).includes(brand.id)).map(brand=><label key={brand.id} className="mr-4 inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={(content.references.representedBusinessIds??[]).includes(brand.id)} onChange={e=>onChange({...content,references:{...content.references,representedBusinessIds:e.target.checked?[...(content.references.representedBusinessIds??[]),brand.id]:(content.references.representedBusinessIds??[]).filter(id=>id!==brand.id)}})}/>{brand.name}{brand.status==='archived'?' · Arquivada':brand.status==='paused'?' · Pausada':''}</label>)}</SectionCard>}
    {content.sections.map((section, index) => <SectionCard key={section.id} title={section.title || 'Nova seção'} action={<div className="flex gap-1">
      <button type="button" className={portalButtonClasses('ghost')} aria-label={`Mover ${section.title} para cima`} disabled={index === 0} onClick={() => move(index, -1)}>↑</button>
      <button type="button" className={portalButtonClasses('ghost')} aria-label={`Mover ${section.title} para baixo`} disabled={index === content.sections.length - 1} onClick={() => move(index, 1)}>↓</button>
      <button type="button" className={portalButtonClasses('ghost')} aria-label={`Remover ${section.title}`} onClick={() => onChange({ ...content, sections: content.sections.filter(item => item.id !== section.id) })}>Remover</button>
    </div>}>
      <div className="flex flex-col gap-3">
        <Input data-section-title aria-label={`Título da seção ${index + 1}`} value={section.title} maxLength={160} onChange={event => onChange({ ...content, sections: content.sections.map(item => item.id === section.id ? { ...item, title: event.target.value } : item) })} />
        <Textarea aria-label={`Conteúdo de ${section.title}`} rows={6} value={section.body} maxLength={12000} onChange={event => onChange({ ...content, sections: content.sections.map(item => item.id === section.id ? { ...item, body: event.target.value } : item) })} />
        <label className="flex items-start gap-2 text-sm text-yx-fg-2"><input type="checkbox" checked={section.agentUse === 'external_guidance'} onChange={event => onChange({ ...content, sections: content.sections.map(item => item.id === section.id ? { ...item, agentUse: event.target.checked ? 'external_guidance' : 'internal' } : item) })} />Disponível como orientação para o atendimento aos clientes</label>
      </div>
    </SectionCard>)}
    <div className="flex flex-wrap items-center gap-3">
      <label className="sr-only" htmlFor="strategy-new-section">Tipo de seção</label>
      <select id="strategy-new-section" className={`min-h-10 rounded-lg border border-yx-line-strong bg-yx-surface px-3 text-sm ${portalFocusRing}`} value={newKind} onChange={event => setNewKind(event.target.value as StrategySectionKind)}>
        {Object.entries(strategySectionLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select>
      <button type="button" className={portalButtonClasses('ghost')} disabled={content.sections.length >= 30} onClick={() => onChange({ ...content, sections: [...content.sections, { id: crypto.randomUUID(), kind: newKind, title: strategySectionLabels[newKind], body: '', agentUse: 'internal' }] })}>Adicionar seção</button>
      <p className="text-xs text-yx-fg-3">Use somente as seções que fizerem sentido para esta estratégia.</p>
    </div>
  </fieldset>
}
