import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { FileSignature } from 'lucide-react'
import {
  ConfirmDialog,
  EmptyState,
  ErrorState,
  MasterDetail,
  PageHeader,
  portalButtonClasses,
  SectionCard,
  SkeletonCard,
  StatusChip,
  Timeline,
  TimelineItem,
  type StatusChipVariant,
} from '@/components/portal-ui'
import { Textarea } from '@/components/ui/textarea'
import {
  billingCycleLabel,
  formatPortalCurrency,
  formatPortalDate,
  formatShortDate,
  statusLabel,
} from '@/lib/client-portal/portalDisplay'
import { canDecideProposalVersion, validateProposalDecision } from '@/lib/proposals/proposalRules'
import { cn } from '@/lib/utils'
import { proposalService } from '@/services/proposalService'
import { useAuthStore } from '@/stores/authStore'
import type { ProposalDecisionValue, ProposalDraft, ProposalVersion } from '@/types/proposal'

const COMMENT_REQUIRED_MESSAGES: Partial<Record<ProposalDecisionValue, string>> = {
  adjustments_requested: 'Descreva os ajustes solicitados.',
  rejected: 'Conte o motivo da recusa para a equipe poder ajudar.',
}

const STATUS_VARIANT: Record<string, StatusChipVariant> = {
  draft: 'neutral',
  sent: 'warn',
  pending: 'warn',
  adjustments_requested: 'warn',
  approved: 'ok',
  converted: 'ok',
  rejected: 'crit',
  conversion_failed: 'crit',
  superseded: 'neutral',
}
const statusVariant = (status?: string): StatusChipVariant => STATUS_VARIANT[status ?? ''] ?? 'neutral'

interface DecisionCopy {
  title: string
  description: string
  confirmLabel: string
  commentLabel: string
  tone: 'default' | 'danger'
  required: boolean
}

const DECISION_COPY: Record<ProposalDecisionValue, DecisionCopy> = {
  approved: {
    title: 'Aprovar esta proposta?',
    description: 'Você confirma o escopo e o valor desta versão. A equipe será avisada e a decisão não poderá ser desfeita.',
    confirmLabel: 'Confirmar aprovação',
    commentLabel: 'Comentário (opcional)',
    tone: 'default',
    required: false,
  },
  adjustments_requested: {
    title: 'Solicitar ajustes',
    description: 'Conte o que precisa mudar para a equipe preparar uma nova versão.',
    confirmLabel: 'Enviar pedido de ajustes',
    commentLabel: 'O que precisa mudar',
    tone: 'default',
    required: true,
  },
  rejected: {
    title: 'Recusar esta proposta?',
    description: 'Conte o motivo para a equipe poder ajudar. A decisão não poderá ser desfeita.',
    confirmLabel: 'Confirmar recusa',
    commentLabel: 'Motivo da recusa',
    tone: 'danger',
    required: true,
  },
}

function pickCurrentVersion(proposal: ProposalDraft, versions: ProposalVersion[]) {
  return versions.find(item => item.id === proposal.currentVersionId)
    ?? [...versions].sort((a, b) => b.versionNumber - a.versionNumber)[0]
}

function LoadingBlock({ label, lines = 4 }: { label: string; lines?: number }) {
  return (
    <div>
      <p role="status" className="sr-only">{label}</p>
      <div aria-hidden="true">
        <SkeletonCard lines={lines} />
      </div>
    </div>
  )
}

export function PortalProposalsPage() {
  const user = useAuthStore(state => state.user)
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedProposalId = searchParams.get('proposalId') || undefined

  const [proposals, setProposals] = useState<ProposalDraft[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  const [selectedId, setSelectedId] = useState<string | undefined>(requestedProposalId)
  const [versions, setVersions] = useState<ProposalVersion[]>([])
  const [versionLoading, setVersionLoading] = useState(false)
  const [versionError, setVersionError] = useState(false)
  const [versionReloadKey, setVersionReloadKey] = useState(0)

  const [comment, setComment] = useState('')
  const [pendingDecision, setPendingDecision] = useState<ProposalDecisionValue>()
  const [submitting, setSubmitting] = useState(false)
  const submittingRef = useRef(false)

  useEffect(() => {
    if (requestedProposalId) setSelectedId(requestedProposalId)
  }, [requestedProposalId])

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(false)
    proposalService.getPortalProposals()
      .then(items => {
        if (active) setProposals(items)
      })
      .catch(() => {
        if (active) setError(true)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [reloadKey])

  const selectedProposal = proposals.find(item => item.id === selectedId)
  const selectedProposalId = selectedProposal?.id

  useEffect(() => {
    if (!selectedProposalId) {
      setVersions([])
      return undefined
    }
    let active = true
    setVersionLoading(true)
    setVersionError(false)
    proposalService.getVersions(selectedProposalId)
      .then(items => {
        if (active) setVersions(items)
      })
      .catch(() => {
        if (active) {
          setVersions([])
          setVersionError(true)
        }
      })
      .finally(() => {
        if (active) setVersionLoading(false)
      })
    return () => {
      active = false
    }
  }, [selectedProposalId, versionReloadKey])

  const selectProposal = useCallback((proposal: ProposalDraft) => {
    if (submittingRef.current) return
    setSelectedId(proposal.id)
    setComment('')
    const next = new URLSearchParams(searchParams)
    next.set('proposalId', proposal.id)
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams])

  const clearSelection = useCallback(() => {
    if (submittingRef.current) return
    setSelectedId(undefined)
    setComment('')
    const next = new URLSearchParams(searchParams)
    next.delete('proposalId')
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams])

  const currentVersion = selectedProposal ? pickCurrentVersion(selectedProposal, versions) : undefined
  const canDecide = Boolean(
    selectedProposal && currentVersion
      && canDecideProposalVersion(currentVersion, selectedProposal.currentVersionId ?? currentVersion.id),
  )

  /** Registra a decisão. Lança um erro com a mensagem para o diálogo mostrar quando não foi possível registrar. */
  const decide = async (decision: ProposalDecisionValue) => {
    if (!currentVersion) return
    if (submittingRef.current) throw new Error('Aguarde o envio anterior terminar.')
    const validationError = validateProposalDecision(decision, comment)
      || (!comment.trim() ? COMMENT_REQUIRED_MESSAGES[decision] : undefined)
    if (validationError) {
      toast.error(validationError)
      throw new Error(validationError)
    }

    submittingRef.current = true
    setSubmitting(true)
    try {
      await proposalService.submitPortalDecision(currentVersion.id, decision, comment.trim() || undefined, user?.id)
      toast.success('Decisão registrada')
      setComment('')
      setReloadKey(value => value + 1)
      setVersionReloadKey(value => value + 1)
    } catch {
      // Mantém o comentário digitado para a pessoa poder tentar de novo.
      const message = 'Não foi possível registrar sua decisão. Tente novamente.'
      toast.error(message)
      throw new Error(message)
    } finally {
      submittingRef.current = false
      setSubmitting(false)
    }
  }

  const copy = pendingDecision ? DECISION_COPY[pendingDecision] : undefined
  const sortedVersions = [...versions].sort((a, b) => b.versionNumber - a.versionNumber)

  const list = (
    <aside aria-label="Selecionar proposta" className="grid gap-2">
      {proposals.map(item => (
        <button
          key={item.id}
          type="button"
          aria-pressed={selectedId === item.id}
          disabled={submitting}
          className={cn(
            'grid w-full gap-2 rounded-lg border border-yx-line bg-yx-surface p-3.5 text-left transition-colors hover:border-yx-blue',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yx-blue disabled:cursor-not-allowed disabled:opacity-60',
            'aria-pressed:border-yx-blue aria-pressed:bg-yx-blue-soft',
          )}
          onClick={() => selectProposal(item)}
        >
          <span className="break-words font-display text-sm font-semibold leading-snug text-yx-fg">{item.title}</span>
          <span className="flex flex-wrap items-center justify-between gap-2">
            <StatusChip variant={statusVariant(item.status)}>{statusLabel(item.status)}</StatusChip>
            <span className="font-mono text-[12.5px] font-medium text-yx-fg-2">{formatPortalCurrency(item.finalValue)}</span>
          </span>
        </button>
      ))}
    </aside>
  )

  const detail = selectedProposal ? (
    <section aria-label="Detalhe da proposta" className="grid gap-4">
      {versionLoading && <LoadingBlock label="Carregando proposta..." lines={5} />}

      {versionError && (
        <ErrorState
          title="Não foi possível carregar os detalhes desta proposta."
          onRetry={() => setVersionReloadKey(value => value + 1)}
        />
      )}

      {!versionLoading && !versionError && !currentVersion && (
        <EmptyState
          icon={FileSignature}
          title="Esta proposta ainda não tem uma versão enviada."
          description="Assim que a equipe enviar a versão para revisão, ela aparece aqui."
        />
      )}

      {!versionLoading && !versionError && currentVersion && (
        <>
          <SectionCard
            title={currentVersion.snapshot.title}
            description={`Versão ${currentVersion.versionNumber} · enviada em ${formatPortalDate(currentVersion.sentAt)}`}
            action={
              <StatusChip variant={statusVariant(selectedProposal.status)}>{statusLabel(selectedProposal.status)}</StatusChip>
            }
          >
            <div className="grid gap-4">
              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-yx-fg">{currentVersion.snapshot.scope}</p>
              <dl className="m-0 grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-yx-line bg-yx-surface-2 px-3.5 py-3">
                  <dt className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-yx-fg-3">Valor</dt>
                  <dd className="m-0 mt-1 font-display text-xl font-semibold text-yx-fg">
                    {formatPortalCurrency(currentVersion.snapshot.finalValue)}
                  </dd>
                </div>
                <div className="rounded-lg border border-yx-line bg-yx-surface-2 px-3.5 py-3">
                  <dt className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-yx-fg-3">Cobrança</dt>
                  <dd className="m-0 mt-1 font-display text-xl font-semibold text-yx-fg">
                    {billingCycleLabel(currentVersion.snapshot.billingCycle)}
                  </dd>
                </div>
              </dl>
            </div>
          </SectionCard>

          {sortedVersions.length > 1 && (
            <SectionCard title="Versões" description="Do envio mais recente ao mais antigo.">
              <Timeline aria-label="Versões da proposta">
                {sortedVersions.map(item => (
                  <TimelineItem
                    key={item.id}
                    when={formatShortDate(item.sentAt)}
                    title={`Versão ${item.versionNumber}`}
                    description={statusLabel(item.status)}
                    tag={item.id === currentVersion.id ? 'Versão atual' : undefined}
                  />
                ))}
              </Timeline>
            </SectionCard>
          )}

          {canDecide ? (
            <SectionCard
              title="Sua decisão"
              description="Para pedir ajustes ou recusar, você escreve um comentário para a equipe."
            >
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={submitting}
                  className={portalButtonClasses('primary')}
                  onClick={() => setPendingDecision('approved')}
                >
                  Aprovar
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  className={portalButtonClasses('ghost')}
                  onClick={() => setPendingDecision('adjustments_requested')}
                >
                  Solicitar ajustes
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  className={portalButtonClasses('ghost', 'text-yx-crit hover:border-yx-crit hover:text-yx-crit')}
                  onClick={() => setPendingDecision('rejected')}
                >
                  Recusar
                </button>
              </div>
            </SectionCard>
          ) : (
            <p className="rounded-lg border border-yx-line bg-yx-surface-2 px-4 py-3 text-sm text-yx-fg-2">
              Esta proposta não aguarda decisão no momento ({statusLabel(currentVersion.status)}).
            </p>
          )}
        </>
      )}
    </section>
  ) : null

  return (
    <div className="w-full space-y-6">
      <PageHeader title="Propostas" lead="Revise os escopos enviados pela equipe e registre sua decisão." />

      {loading && proposals.length === 0 && <LoadingBlock label="Carregando propostas..." lines={3} />}

      {error && (
        <ErrorState
          title="Não foi possível carregar suas propostas."
          description="Verifique sua conexão e tente de novo."
          onRetry={() => setReloadKey(value => value + 1)}
        />
      )}

      {!loading && !error && proposals.length === 0 && (
        <EmptyState
          icon={FileSignature}
          title="Nenhuma proposta enviada para você ainda."
          description="Quando a equipe enviar uma proposta, ela aparecerá aqui para você revisar e decidir."
        />
      )}

      {!error && proposals.length > 0 && (
        <MasterDetail
          list={list}
          detail={detail}
          onBack={clearSelection}
          backLabel="Voltar"
          listWidth={300}
          emptyDetail={
            <EmptyState
              icon={FileSignature}
              title="Selecione uma proposta"
              description="Escolha uma proposta da lista para ver o escopo, o valor e decidir."
            />
          }
        />
      )}

      <ConfirmDialog
        open={Boolean(pendingDecision)}
        onOpenChange={open => {
          if (!open) setPendingDecision(undefined)
        }}
        title={copy?.title ?? ''}
        description={copy?.description ?? ''}
        confirmLabel={copy?.confirmLabel ?? 'Confirmar'}
        tone={copy?.tone}
        confirmDisabled={Boolean(copy?.required && !comment.trim())}
        onConfirm={async () => {
          if (pendingDecision) await decide(pendingDecision)
        }}
      >
        {copy ? (
          <div className="grid gap-2">
            <label className="text-[13px] font-semibold text-yx-fg" htmlFor="proposal-decision-comment">
              {copy.commentLabel}
            </label>
            <Textarea
              id="proposal-decision-comment"
              placeholder={copy.required ? 'Obrigatório' : 'Se quiser, deixe um recado para a equipe'}
              value={comment}
              disabled={submitting}
              onChange={event => setComment(event.target.value)}
            />
          </div>
        ) : null}
      </ConfirmDialog>
    </div>
  )
}
