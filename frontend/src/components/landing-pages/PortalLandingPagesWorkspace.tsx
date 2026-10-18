import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, ExternalLink, LayoutTemplate, MessageSquare } from 'lucide-react'
import { ConfirmDialog, EmptyState, StatusChip, portalButtonClasses, type StatusChipVariant } from '@/components/portal-ui'
import { PortalPage } from '@/components/client-portal/PortalPage'
import { usePortalWorkspacePath } from '@/hooks/usePortalWorkspacePath'
import { calculateLandingPageMetrics } from '@/lib/landing-pages/landingPageRules'
import { formatPortalDateTime, statusLabel } from '@/lib/client-portal/portalDisplay'
import { cn } from '@/lib/utils'
import type { LandingPageForm, LandingPageStatus, PortalLandingPage } from '@/types/landingPage'
import type { ContractDetails } from '@/types/platform'

/** Quantidade mínima de caracteres do pedido de ajuste. */
export const MIN_CHANGE_REQUEST_LENGTH = 10

interface PortalLandingPagesWorkspaceProps {
  contract: ContractDetails
  pages: PortalLandingPage[]
  /** Recebe a mensagem digitada pelo cliente (mínimo de 10 caracteres). */
  onRequestChange: (landingPageId: string, message: string) => void | Promise<void>
  onApprove: (landingPageId: string) => void | Promise<void>
  onCreateLeadForm?: (landingPageId: string) => Promise<unknown>
  onToggleLeadForm?: (formId: string, isActive: boolean) => Promise<unknown>
}

const STATUS_VARIANT: Record<LandingPageStatus, StatusChipVariant> = {
  active: 'ok',
  pending_approval: 'warn',
  draft: 'neutral',
  paused: 'neutral',
  archived: 'neutral',
}

const formatDate = (value: string) => formatPortalDateTime(value)

function ctaCaption(type: string, value: string) {
  if (type === 'whatsapp') return `Chamada principal: WhatsApp ${value}`
  if (type === 'phone') return `Chamada principal: telefone ${value}`
  return `Chamada principal: ${value}`
}

export function PortalLandingPagesWorkspace({
  contract,
  pages,
  onRequestChange,
  onApprove,
  onCreateLeadForm = async () => undefined,
  onToggleLeadForm = async () => undefined,
}: PortalLandingPagesWorkspaceProps) {
  const [approving, setApproving] = useState<PortalLandingPage | null>(null)
  const [requesting, setRequesting] = useState<PortalLandingPage | null>(null)
  const [message, setMessage] = useState('')

  const totals = pages.reduce(
    (sum, page) => ({ visits: sum.visits + page.visits, leads: sum.leads + page.leads }),
    { visits: 0, leads: 0 },
  )
  const awaiting = pages.filter(page => page.status === 'pending_approval').length
  const trimmedLength = message.trim().length
  const messageTooShort = trimmedLength < MIN_CHANGE_REQUEST_LENGTH

  const closeRequest = (open: boolean) => {
    if (open) return
    setRequesting(null)
    setMessage('')
  }

  return (
    <>
      <PortalPage
        eyebrow={contract.name || undefined}
        title="Landing pages"
        description="Acompanhe suas páginas de captação, aprove publicações e peça ajustes à YUX."
        metrics={
          pages.length > 0
            ? [
                { label: 'Páginas', value: String(pages.length) },
                { label: 'Visitas', value: totals.visits.toLocaleString('pt-BR') },
                { label: 'Leads', value: totals.leads.toLocaleString('pt-BR') },
                { label: 'Aguardando aprovação', value: String(awaiting) },
              ]
            : []
        }
        related={[{ label: 'Formulários externos', href: '/portal/marketing/formularios' }]}
      >
        {pages.length === 0 ? (
          <EmptyState
            icon={LayoutTemplate}
            title="Nenhuma landing page ainda"
            description="Quando a YUX publicar uma página para a sua campanha, ela aparece aqui. Você poderá acompanhar visitas e leads, aprovar a publicação e pedir ajustes."
          />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {pages.map(page => (
              <LandingPageCard
                key={page.id}
                page={page}
                onApprove={() => setApproving(page)}
                onRequestChange={() => setRequesting(page)}
                onCreateLeadForm={onCreateLeadForm}
                onToggleLeadForm={onToggleLeadForm}
              />
            ))}
          </div>
        )}
      </PortalPage>

      <ConfirmDialog
        open={approving !== null}
        onOpenChange={open => {
          if (!open) setApproving(null)
        }}
        title="Aprovar publicação"
        description={
          approving
            ? `Ao aprovar, a YUX pode publicar "${approving.name}". Sua aprovação fica registrada.`
            : ''
        }
        confirmLabel="Aprovar publicação"
        onConfirm={async () => {
          if (approving) await onApprove(approving.id)
        }}
      />

      <ConfirmDialog
        open={requesting !== null}
        onOpenChange={closeRequest}
        title="Solicitar ajuste"
        description={
          requesting
            ? `Conte o que você quer mudar em "${requesting.name}". A equipe da YUX recebe o seu pedido.`
            : ''
        }
        confirmLabel="Enviar solicitação"
        confirmDisabled={messageTooShort}
        onConfirm={async () => {
          if (!requesting) return
          await onRequestChange(requesting.id, message.trim())
          setMessage('')
        }}
      >
        <label className="grid gap-1.5 text-[13px] font-medium text-yx-fg">
          O que você quer ajustar?
          <textarea
            value={message}
            onChange={event => setMessage(event.target.value)}
            required
            minLength={MIN_CHANGE_REQUEST_LENGTH}
            rows={4}
            placeholder="Ex.: Trocar o título e atualizar o telefone de contato."
            className="min-h-24 w-full rounded-lg border border-yx-line-strong bg-yx-surface p-3 text-sm font-normal text-yx-fg outline-none placeholder:text-yx-fg-3 focus-visible:ring-2 focus-visible:ring-yx-blue"
          />
        </label>
        <p className={cn('mt-1.5 text-xs', messageTooShort ? 'text-yx-fg-3' : 'text-yx-ok')}>
          {messageTooShort
            ? `Escreva pelo menos ${MIN_CHANGE_REQUEST_LENGTH} caracteres (${trimmedLength}/${MIN_CHANGE_REQUEST_LENGTH}).`
            : 'Pronto para enviar.'}
        </p>
      </ConfirmDialog>
    </>
  )
}

function LandingPageCard({
  page,
  onApprove,
  onRequestChange,
  onCreateLeadForm,
  onToggleLeadForm,
}: {
  page: PortalLandingPage
  onApprove: () => void
  onRequestChange: () => void
  onCreateLeadForm: (landingPageId: string) => Promise<unknown>
  onToggleLeadForm: (formId: string, isActive: boolean) => Promise<unknown>
}) {
  const metrics = calculateLandingPageMetrics(page)
  const awaitingApproval = page.status === 'pending_approval'
  const canRequestChange = page.status !== 'archived'
  const openRequests = (page.changeRequests || []).filter(request => request.status === 'open').length

  return (
    <article className="flex min-w-0 flex-col overflow-hidden rounded-[10px] border border-yx-line bg-yx-surface text-yx-fg shadow-[0_1px_2px_rgba(14,17,32,0.04),0_2px_8px_rgba(14,17,32,0.04)] dark:shadow-none">
      <div className="aspect-[16/7] bg-yx-surface-2">
        {page.thumbnailUrl ? (
          <img src={page.thumbnailUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-yx-fg-3">Prévia indisponível</div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-4 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-base font-semibold leading-snug text-yx-fg">{page.name}</h2>
            {page.primaryCtaValue ? <p className="mt-0.5 break-words text-[13px] text-yx-fg-3">{ctaCaption(page.primaryCtaType, page.primaryCtaValue)}</p> : null}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusChip variant={STATUS_VARIANT[page.status] || 'neutral'}>{statusLabel(page.status)}</StatusChip>
            {openRequests > 0 ? (
              <StatusChip variant="warn">{openRequests === 1 ? 'Ajuste solicitado' : `${openRequests} ajustes solicitados`}</StatusChip>
            ) : null}
          </div>
        </div>

        <dl className="m-0 grid grid-cols-3 gap-2">
          <PageMetric label="Visitas" value={metrics.visits.toLocaleString('pt-BR')} />
          <PageMetric label="Leads" value={metrics.leads.toLocaleString('pt-BR')} />
          <PageMetric label="Conversão" value={`${metrics.conversionRate.toString().replace('.', ',')}%`} />
        </dl>

        <div className="flex flex-wrap gap-2">
          {page.previewUrl ? (
            <a href={page.previewUrl} target="_blank" rel="noreferrer" title="Ver prévia" className={portalButtonClasses('ghost')}>
              <ExternalLink aria-hidden="true" />
              Prévia
            </a>
          ) : null}
          {page.publishedUrl ? (
            <a href={page.publishedUrl} target="_blank" rel="noreferrer" title="Ver página publicada" className={portalButtonClasses('ghost')}>
              <ExternalLink aria-hidden="true" />
              Página publicada
            </a>
          ) : null}
          {canRequestChange ? (
            <button type="button" title="Solicitar ajuste" onClick={onRequestChange} className={portalButtonClasses('ghost')}>
              <MessageSquare aria-hidden="true" />
              Solicitar ajuste
            </button>
          ) : null}
          {awaitingApproval ? (
            <button type="button" title="Aprovar publicação" onClick={onApprove} className={portalButtonClasses('primary')}>
              <CheckCircle2 aria-hidden="true" />
              Aprovar
            </button>
          ) : null}
        </div>

        <LeadCaptureSection
          form={page.forms?.[0]}
          onCreate={() => onCreateLeadForm(page.id)}
          onToggle={onToggleLeadForm}
        />
      </div>
    </article>
  )
}

function PageMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-yx-line bg-yx-surface-2 p-3">
      <dt className="font-mono text-[11px] font-medium uppercase tracking-[0.07em] text-yx-fg-3">{label}</dt>
      <dd className="m-0 mt-1 font-display text-lg font-semibold leading-none tabular-nums text-yx-fg">{value}</dd>
    </div>
  )
}

/** Captura de leads da página, recolhida: o lado técnico fica em "Formulários externos". */
function LeadCaptureSection({
  form,
  onCreate,
  onToggle,
}: {
  form?: LandingPageForm
  onCreate: () => Promise<unknown>
  onToggle: (formId: string, isActive: boolean) => Promise<unknown>
}) {
  const toWorkspace = usePortalWorkspacePath()
  const [busy, setBusy] = useState(false)

  const run = async (action: () => Promise<unknown>) => {
    if (busy) return
    setBusy(true)
    try {
      await action()
    } catch {
      // A tela que fornece a ação avisa o cliente; aqui só liberamos o botão.
    } finally {
      setBusy(false)
    }
  }

  return (
    <details className="group rounded-lg border border-dashed border-yx-line-strong bg-yx-surface-2">
      <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-3 rounded-lg px-3 py-2 text-[13px] font-semibold text-yx-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yx-blue [&::-webkit-details-marker]:hidden">
        <span>Captura de leads</span>
        <span className="flex items-center gap-2">
          {form ? (
            <StatusChip variant={form.isActive ? 'ok' : 'neutral'}>{form.isActive ? 'Ativa' : 'Pausada'}</StatusChip>
          ) : (
            <StatusChip>Desativada</StatusChip>
          )}
          <span aria-hidden="true" className="text-yx-fg-3 transition-transform group-open:rotate-180">▾</span>
        </span>
      </summary>
      <div className="grid gap-3 border-t border-yx-line px-3 pb-3 pt-3">
        {!form ? (
          <>
            <p className="text-[13px] leading-snug text-yx-fg-2">
              Receba os leads desta página no seu CRM. Ative a captura e depois siga o passo a passo de instalação em Formulários externos.
            </p>
            <div>
              <button type="button" disabled={busy} onClick={() => run(onCreate)} className={portalButtonClasses('ghost')}>
                Ativar captura de leads
              </button>
            </div>
          </>
        ) : (
          <>
            <dl className="m-0 grid grid-cols-2 gap-2 text-[13px]">
              <div>
                <dt className="font-mono text-[11px] font-medium uppercase tracking-[0.07em] text-yx-fg-3">Leads recebidos</dt>
                <dd className="m-0 font-semibold text-yx-fg">{form.submissionCount}</dd>
              </div>
              <div>
                <dt className="font-mono text-[11px] font-medium uppercase tracking-[0.07em] text-yx-fg-3">Último lead</dt>
                <dd className="m-0 font-semibold text-yx-fg">{form.lastSubmissionAt ? formatDate(form.lastSubmissionAt) : 'Ainda não'}</dd>
              </div>
            </dl>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={busy} onClick={() => run(() => onToggle(form.id, !form.isActive))} className={portalButtonClasses('ghost')}>
                {form.isActive ? 'Pausar captura' : 'Ativar captura'}
              </button>
              <Link to={toWorkspace('/portal/marketing/formularios')} className={portalButtonClasses('ghost')}>
                Ver instruções de instalação
              </Link>
            </div>
          </>
        )}
      </div>
    </details>
  )
}
