import { useState } from 'react'
import { StrategyEditor } from './StrategyEditor'
import { ErrorState, SectionCard, portalButtonClasses, useUnsavedChangesWarning } from '@/components/portal-ui'
import type { CompanyStrategy, CompanyStrategyContentV1, CompanyStrategyProposal } from '@/types/companyStrategy'

export function StrategyProposalReview({ organizationId,proposal, onApply,onContinueFromCurrent }: {organizationId?:string;onContinueFromCurrent?:(content:CompanyStrategyContentV1,current:CompanyStrategy)=>void; proposal: CompanyStrategyProposal; onApply: (content: CompanyStrategyContentV1) => Promise<unknown> }) {
  const [content, setContent] = useState(() => structuredClone(proposal.content))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useUnsavedChangesWarning(JSON.stringify(content) !== JSON.stringify(proposal.content))
  const stale=Boolean(proposal.currentStrategy&&proposal.baseStrategyVersion!==null&&proposal.currentStrategy.version!==proposal.baseStrategyVersion)
  const currentRevision=proposal.currentStrategy?.draftRevision??proposal.currentStrategy?.publishedRevision
  const apply = async () => {
    setBusy(true); setError(null)
    try { await onApply(content) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível salvar. Sua revisão foi preservada.') }
    finally { setBusy(false) }
  }
  return <SectionCard title="Revisar estratégia" description="Confira e ajuste a proposta do agente. Salvar cria apenas um rascunho; a publicação é uma decisão separada.">
    {proposal.baseRevision && <details className="mb-5 rounded-lg border border-yx-line p-4"><summary className="cursor-pointer text-sm font-medium">Comparar com a versão de origem</summary><p className="mt-3 text-sm">{proposal.baseRevision.content.objective}</p><p className="mt-2 whitespace-pre-wrap text-sm text-yx-fg-2">{proposal.baseRevision.content.summary}</p>{proposal.baseRevision.content.sections.map(section => <div key={section.id} className="mt-3 text-sm"><strong>{section.title}</strong><p className="whitespace-pre-wrap">{section.body}</p></div>)}</details>}
    {error && <ErrorState title="Não foi possível salvar" description={error} />}
    {stale&&currentRevision&&<details open className="mb-5 rounded-lg border border-yx-warn-line p-4"><summary className="cursor-pointer text-sm font-semibold">Versão atual para comparação</summary><p className="mt-3 font-medium">{currentRevision.content.title}</p><p className="mt-2 text-sm">{currentRevision.content.objective}</p><p className="mt-2 whitespace-pre-wrap text-sm">{currentRevision.content.summary}</p>{currentRevision.content.sections.map(section=><div key={section.id} className="mt-3 text-sm"><strong>{section.title}</strong><p className="whitespace-pre-wrap">{section.body}</p></div>)}<p className="mt-4 text-sm">A proposta original permanece vinculada à versão anterior. Compare os textos e, se desejar, transfira sua revisão para uma edição manual baseada na versão atual.</p>{onContinueFromCurrent&&<button className={`${portalButtonClasses('ghost')} mt-3`} type="button" disabled={busy} onClick={()=>onContinueFromCurrent(content,proposal.currentStrategy!)}>Continuar pela versão atual</button>}</details>}
    <StrategyEditor organizationId={organizationId} content={content} onChange={setContent} saving={busy} />
    <button type="button" className={`${portalButtonClasses('primary')} mt-5`} disabled={busy || proposal.status === 'applied'||stale} onClick={() => void apply()}>Salvar rascunho</button>
  </SectionCard>
}
