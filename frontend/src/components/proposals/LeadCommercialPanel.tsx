import { useCallback, useEffect, useRef, useState } from 'react'
import { apiRequest } from '@/lib/apiClient'
import { Button } from '@/components/ui/button'
import { ProposalEditor } from './ProposalEditor'
import { useAuthStore } from '@/stores/authStore'
import { ClosingChecklistPanel } from '@/components/crm/ClosingChecklistPanel'
import { LeadProposalLauncher } from '@/components/crm/LeadProposalLauncher'
import { ProposalEventTimeline } from '@/components/crm/ProposalEventTimeline'
import { ProposalRecommendationPanel } from '@/components/crm/ProposalRecommendationPanel'
import { crmClosingService } from '@/services/crmClosingService'
import { usePlatformStore } from '@/stores/platformStore'
import type { CrmLead } from '@/types/crm'
import type {
  CrmProposalConversionRun,
  LeadProposalRecommendation,
  ProposalClosingChecklist,
  ProposalFollowUpTask,
  ProposalObjection,
  ProposalViewEvent,
} from '@/types/crmClosing'
import type { ProposalDraft } from '@/types/proposal'

export function LeadCommercialPanel({ lead }: { lead: CrmLead }) {
  const role = useAuthStore((state) => state.user?.role)
  const internal = role === 'admin' || role === 'manager'
  const active = useRef(true),
    pending = useRef(false),
    requestId = useRef(crypto.randomUUID())
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [selectedId, setSelectedId] = useState('')
  const packages = usePlatformStore((state) => state.packages)
  const [packageId, setPackageId] = useState('')
  const [proposals, setProposals] = useState<ProposalDraft[]>([])
  const [recommendations, setRecommendations] = useState<
    LeadProposalRecommendation[]
  >([])
  const [events, setEvents] = useState<ProposalViewEvent[]>([])
  const [followUps, setFollowUps] = useState<ProposalFollowUpTask[]>([])
  const [objections, setObjections] = useState<ProposalObjection[]>([])
  const [checklists, setChecklists] = useState<ProposalClosingChecklist[]>([])
  const [conversionRuns, setConversionRuns] = useState<
    CrmProposalConversionRun[]
  >([])
  const refresh = useCallback(async () => {
    try {
      const rows = await apiRequest<ProposalDraft[]>(
        `/crm/leads/${lead.id}/proposals`,
      )
      if (!active.current) return
      setProposals(rows)
      if (internal) {
        const context = await crmClosingService.getLeadProposalContext(lead.id)
        if (!active.current) return
        setRecommendations(context.recommendations)
        setEvents(context.events)
        setFollowUps(context.followUps)
        setObjections(context.objections)
        setChecklists(context.checklists)
        setConversionRuns(context.conversionRuns)
      }
    } catch {
      if (active.current)
        setError(
          'Não foi possível carregar as propostas. Atualize esta seção para tentar novamente.',
        )
    }
  }, [lead.id, internal])
  useEffect(() => {
    active.current = true
    void refresh()
    return () => {
      active.current = false
    }
  }, [refresh])
  const create = async () => {
    if (!packageId || pending.current) return
    pending.current = true
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const proposal = await apiRequest<ProposalDraft>(
        `/crm/leads/${lead.id}/proposal-drafts`,
        { method: 'POST', body: { packageId, requestId: requestId.current } },
      )
      if (!active.current) return
      setSelectedId(proposal.id)
      setMessage('Rascunho criado. Revise a proposta antes de enviar.')
      requestId.current = crypto.randomUUID()
      await refresh()
      window.dispatchEvent(new Event('crm-leads-changed'))
    } catch (reason) {
      if (active.current)
        setError(
          reason instanceof Error
            ? reason.message
            : 'Não foi possível criar a proposta.',
        )
    } finally {
      pending.current = false
      if (active.current) setBusy(false)
    }
  }
  const convert = async (proposalId: string) => {
    if (pending.current) return
    pending.current = true
    setBusy(true)
    setError('')
    try {
      await crmClosingService.runProposalConversion(proposalId)
      if (active.current) {
        setMessage('Conversão registrada.')
        await refresh()
      }
    } catch {
      if (active.current)
        setError(
          'Não foi possível concluir a conversão. Confira a situação da proposta.',
        )
    } finally {
      pending.current = false
      if (active.current) setBusy(false)
    }
  }
  return (
    <div className="space-y-3">
      {error && (
        <div role="alert" className="text-sm text-destructive">
          {error}
          <Button variant="ghost" size="sm" onClick={() => void refresh()}>
            Atualizar propostas
          </Button>
        </div>
      )}
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
      <LeadProposalLauncher
        lead={lead}
        packages={packages}
        packageId={packageId}
        onPackageChange={(value) => {
          setPackageId(value)
          requestId.current = crypto.randomUUID()
        }}
        onCreate={create}
        busy={busy}
      />
      {internal && (
        <>
          <ProposalRecommendationPanel
            recommendations={recommendations}
            packages={packages}
          />
          <ClosingChecklistPanel
            proposals={proposals}
            checklists={checklists}
            conversionRuns={conversionRuns}
            onConvert={convert}
          />
          <ProposalEventTimeline
            events={events}
            followUps={followUps}
            objections={objections}
          />
        </>
      )}
      {proposals.length === 0 && (
        <p className="text-sm text-gray-500">Nenhuma proposta vinculada.</p>
      )}
      {proposals.map((item) => (
        <div key={item.id} className="rounded-md border p-3 text-sm">
          <p className="font-medium">{item.title}</p>
          <p className="text-gray-500">
            {item.status === 'draft' ? 'Rascunho' : item.status} - R${' '}
            {item.finalValue.toLocaleString('pt-BR')}
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setSelectedId(selectedId === item.id ? '' : item.id)}
          >
            {selectedId === item.id ? 'Fechar proposta' : 'Abrir proposta'}
          </Button>
          {selectedId === item.id && (
            <div className="mt-3">
              <ProposalEditor proposal={item} onRefresh={refresh} />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
