import { useState } from 'react'
import { StrategyEditor } from './StrategyEditor'
import { ErrorState, SectionCard, portalButtonClasses, useUnsavedChangesWarning } from '@/components/portal-ui'
import type { CompanyStrategyContentV1, CompanyStrategyProposal } from '@/types/companyStrategy'

export function StrategyProposalReview({ proposal, onApply }: { proposal: CompanyStrategyProposal; onApply: (content: CompanyStrategyContentV1) => Promise<unknown> }) {
  const [content, setContent] = useState(() => structuredClone(proposal.content))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useUnsavedChangesWarning(JSON.stringify(content) !== JSON.stringify(proposal.content))
  const apply = async () => {
    setBusy(true); setError(null)
    try { await onApply(content) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível salvar. Sua revisão foi preservada.') }
    finally { setBusy(false) }
  }
  return <SectionCard title="Revisar estratégia" description="Confira e ajuste a proposta do agente. Salvar cria apenas um rascunho; a publicação é uma decisão separada.">
    {proposal.baseRevision && <details className="mb-5 rounded-lg border border-yx-line p-4"><summary className="cursor-pointer text-sm font-medium">Comparar com a versão de origem</summary><p className="mt-3 text-sm">{proposal.baseRevision.content.objective}</p><p className="mt-2 whitespace-pre-wrap text-sm text-yx-fg-2">{proposal.baseRevision.content.summary}</p>{proposal.baseRevision.content.sections.map(section => <div key={section.id} className="mt-3 text-sm"><strong>{section.title}</strong><p className="whitespace-pre-wrap">{section.body}</p></div>)}</details>}
    {error && <ErrorState title="Não foi possível salvar" description={error} />}
    <StrategyEditor content={content} onChange={setContent} saving={busy} />
    <button type="button" className={`${portalButtonClasses('primary')} mt-5`} disabled={busy || proposal.status === 'applied'} onClick={() => void apply()}>Salvar rascunho</button>
  </SectionCard>
}
