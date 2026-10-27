import { Streamdown } from 'streamdown'
import { SectionCard, StatusChip } from '@/components/portal-ui'
import type { CompanyStrategy, CompanyStrategyRevision } from '@/types/companyStrategy'

export function StrategyOverview({ strategy, revision }: { strategy: CompanyStrategy; revision?: CompanyStrategyRevision | null }) {
  const current = revision ?? strategy.publishedRevision ?? strategy.draftRevision
  if (!current) return null
  return <div className="flex min-w-0 flex-col gap-5">
    <SectionCard title={current.content.title} description={revision ? `Versão ${revision.revisionNumber} · histórico` : strategy.publishedRevision ? `Versão publicada ${strategy.publishedRevision.revisionNumber}` : 'Rascunho — ainda não orienta os agentes'} action={<StatusChip variant={strategy.archivedAt ? 'neutral' : strategy.publishedRevision ? 'ok' : 'warn'}>{strategy.archivedAt ? 'Arquivada' : strategy.publishedRevision ? 'Publicada' : 'Rascunho'}</StatusChip>}>
      <p className="text-base font-medium text-yx-fg">{current.content.objective}</p>
      <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-yx-fg-2">{current.content.summary}</p>
    </SectionCard>
    {current.content.sections.filter(section => section.body.trim()).map(section => <SectionCard key={section.id} title={section.title} description={section.agentUse === 'external_guidance' ? 'Orientação liberada ao atendimento' : undefined}>
      <Streamdown mode="static" skipHtml controls={false} className="break-words text-sm leading-relaxed text-yx-fg-2">{section.body}</Streamdown>
    </SectionCard>)}
  </div>
}
