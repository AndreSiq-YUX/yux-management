import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  AlertCircle,
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  FileText,
  Gauge,
  Globe2,
  Image,
  Link2,
  Megaphone,
  MessageCircle,
  MousePointer2,
  Radio,
  Save,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Target,
  Users,
  Zap,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import {
  PageHeader,
  PendingBadge,
  ResponsiveTable,
  StatusChip,
  portalButtonClasses,
} from '@/components/portal-ui'
import { getPendingFeature } from '@/lib/client-portal/pendingFeatures'
import { campaignService } from '@/services/campaignService'
import { cn } from '@/lib/utils'
import type { AdProviderConnection, CreateCampaignDraftInput } from '@/types/campaign'
import type { ContractDetails } from '@/types/platform'

type BuilderStepKey = 'strategy' | 'campaign' | 'audience' | 'creative' | 'tracking' | 'review'
type CampaignObjectiveOption = 'lead_generation' | 'conversions' | 'traffic' | 'awareness' | 'engagement'
type BuilderStatus = 'complete' | 'editing' | 'pending' | 'blocked'

interface MetaCampaignBuilderProps {
  contract: ContractDetails
  organizationId?: string
  onBack: () => void
  onSaveDraft: (input: CreateCampaignDraftInput) => Promise<void>
  onSubmitForApproval: (input: CreateCampaignDraftInput) => Promise<void>
}

interface BuilderStep {
  key: BuilderStepKey
  label: string
  description: string
  icon: LucideIcon
  status: BuilderStatus
}

interface ObjectiveCard {
  key: CampaignObjectiveOption
  label: string
  description: string
  icon: LucideIcon
}

interface CampaignFormState {
  objective: CampaignObjectiveOption
  name: string
  offer: string
  promise: string
  /** Públicos separados por vírgula. */
  audience: string
  dailyBudget: string
  totalBudget: string
  utmCampaign: string
  adHeadline: string
  adText: string
  adCta: string
}

const objectiveCards: ObjectiveCard[] = [
  { key: 'lead_generation', label: 'Leads', description: 'Capturar contatos no WhatsApp, formulário ou CRM.', icon: Target },
  { key: 'conversions', label: 'Vendas', description: 'Otimizar para evento comercial ou compra.', icon: BarChart3 },
  { key: 'traffic', label: 'Tráfego', description: 'Levar visitantes qualificados para uma página.', icon: MousePointer2 },
  { key: 'engagement', label: 'Engajamento', description: 'Aumentar respostas, conversas e interações.', icon: MessageCircle },
  { key: 'awareness', label: 'Reconhecimento', description: 'Expandir alcance e lembrança da marca.', icon: Radio },
]

const emptyForm: CampaignFormState = {
  objective: 'lead_generation',
  name: '',
  offer: '',
  promise: '',
  audience: '',
  dailyBudget: '',
  totalBudget: '',
  utmCampaign: '',
  adHeadline: '',
  adText: '',
  adCta: '',
}

const NEUTRAL_ACCOUNT_LABEL = 'Conta de anúncios: verificar na publicação'

export function MetaCampaignBuilder({
  contract,
  organizationId,
  onBack,
  onSaveDraft,
  onSubmitForApproval,
}: MetaCampaignBuilderProps) {
  const [activeStep, setActiveStep] = useState<BuilderStepKey>('strategy')
  const [form, setForm] = useState<CampaignFormState>(emptyForm)
  const [isSaving, setIsSaving] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [connection, setConnection] = useState<AdProviderConnection | null>(null)

  useEffect(() => {
    let cancelled = false
    const loadConnection = async () => {
      try {
        const connections = await campaignService.getProviderConnections()
        const metaConnections = connections.filter(item =>
          item.provider === 'meta'
          && (item.contractId === contract.id || (!item.contractId && item.clientId === contract.clientId)),
        )
        const preferred = metaConnections.find(item => item.status === 'connected') || metaConnections[0] || null
        if (!cancelled) setConnection(preferred)
      } catch {
        // Sem dado real da conta: o chip neutro continua valendo.
        if (!cancelled) setConnection(null)
      }
    }
    void loadConnection()
    return () => { cancelled = true }
  }, [contract.clientId, contract.id])

  const audienceTags = useMemo(() => splitList(form.audience), [form.audience])
  const dailyBudget = toAmount(form.dailyBudget)
  const totalBudget = toAmount(form.totalBudget)
  const canSave = Boolean(organizationId) && form.name.trim().length > 0 && dailyBudget > 0

  const readiness = useMemo(
    () => buildReadiness(form, audienceTags, connection),
    [form, audienceTags, connection],
  )
  const steps = useMemo<BuilderStep[]>(() => {
    const done = {
      strategy: form.name.trim() !== '' && form.offer.trim() !== '' && form.promise.trim() !== '',
      campaign: dailyBudget > 0,
      audience: audienceTags.length > 0,
      creative: form.adHeadline.trim() !== '' && form.adText.trim() !== '',
      tracking: form.utmCampaign.trim() !== '',
    }
    const statusOf = (key: Exclude<BuilderStepKey, 'review'>): BuilderStatus =>
      activeStep === key ? 'editing' : done[key] ? 'complete' : 'pending'

    return [
      { key: 'strategy', label: 'Estratégia', description: 'Oferta, promessa e objetivo.', icon: Sparkles, status: statusOf('strategy') },
      { key: 'campaign', label: 'Configuração da campanha', description: 'Orçamento e estrutura.', icon: SlidersHorizontal, status: statusOf('campaign') },
      { key: 'audience', label: 'Público e segmentação', description: 'Quem deve ver o anúncio.', icon: Users, status: statusOf('audience') },
      { key: 'creative', label: 'Criativos e anúncios', description: 'Título, texto e chamada.', icon: Image, status: statusOf('creative') },
      { key: 'tracking', label: 'Rastreamento e destino', description: 'UTM e vínculo com o CRM.', icon: Link2, status: statusOf('tracking') },
      { key: 'review', label: 'Revisão e envio', description: 'Pendências, aprovação e envio.', icon: ShieldCheck, status: activeStep === 'review' ? 'editing' : readiness.blockers > 0 ? 'blocked' : 'pending' },
    ]
  }, [activeStep, audienceTags.length, dailyBudget, form, readiness.blockers])

  const payload = useMemo<CreateCampaignDraftInput>(() => ({
    organizationId: organizationId || '',
    clientId: contract.clientId,
    contractId: contract.id,
    provider: 'meta',
    name: form.name.trim(),
    objective: mapObjective(form.objective),
    dailyBudget,
    totalBudget: totalBudget > 0 ? totalBudget : undefined,
    utmCampaign: form.utmCampaign.trim() || undefined,
  }), [contract.clientId, contract.id, dailyBudget, form, organizationId, totalBudget])

  const handleSaveDraft = async () => {
    setIsSaving(true)
    try {
      await onSaveDraft(payload)
    } finally {
      setIsSaving(false)
    }
  }

  const handleSubmitForApproval = async () => {
    setIsSubmitting(true)
    try {
      await onSubmitForApproval(payload)
    } finally {
      setIsSubmitting(false)
    }
  }

  const setField = <K extends keyof CampaignFormState>(key: K) => (value: CampaignFormState[K]) =>
    setForm(current => ({ ...current, [key]: value }))


  const structure: StructureItem[] = [
    { level: 'Campanha', icon: Megaphone, name: form.name.trim() || 'Não definido', role: objectiveLabel(form.objective), filled: form.name.trim() !== '' },
    { level: 'Conjunto', icon: Users, name: audienceTags.join(', ') || 'Não definido', role: 'Público principal', filled: audienceTags.length > 0 },
    { level: 'Anúncio', icon: Image, name: form.adHeadline.trim() || 'Não definido', role: 'Título do anúncio', filled: form.adHeadline.trim() !== '' },
  ]


  const adPending = getPendingFeature('B21')

  return (
    <div className="w-full space-y-6">
      <button type="button" onClick={onBack} className={portalButtonClasses('ghost')}>
        <ArrowLeft aria-hidden="true" />
        Voltar para campanhas
      </button>

      <PageHeader
        title="Nova campanha Meta Ads"
        lead="Monte e revise sua campanha: estratégia, público, orçamento, anúncio e rastreamento."
        meta={
          <>
            {contract.name ? <StatusChip icon={Megaphone}>{`Contrato: ${contract.name}`}</StatusChip> : null}
            {connection ? (
              <StatusChip icon={Globe2} variant={connection.status === 'connected' ? 'ok' : 'warn'}>
                {`Conta Meta: ${connection.name}`}
              </StatusChip>
            ) : (
              <StatusChip icon={Globe2}>{NEUTRAL_ACCOUNT_LABEL}</StatusChip>
            )}
            <StatusChip icon={FileText} variant="warn">Rascunho</StatusChip>
          </>
        }
        actions={
          <>
            <button
              type="button"
              title="Salvar rascunho"
              className={portalButtonClasses('ghost')}
              disabled={isSaving || !canSave}
              onClick={handleSaveDraft}
            >
              <Save aria-hidden="true" />
              {isSaving ? 'Salvando...' : 'Salvar rascunho'}
            </button>
            <button
              type="button"
              title="Enviar para aprovação"
              className={portalButtonClasses('ghost')}
              disabled={isSubmitting || !canSave}
              onClick={handleSubmitForApproval}
            >
              <Send aria-hidden="true" />
              {isSubmitting ? 'Enviando...' : 'Enviar para aprovação'}
            </button>
            <button
              type="button"
              title="Revisar antes de enviar"
              className={portalButtonClasses('primary')}
              onClick={() => setActiveStep('review')}
            >
              <Zap aria-hidden="true" />
              Revisar antes de enviar
            </button>
          </>
        }
      />
      {!canSave ? <p className="-mt-3 text-xs text-yx-fg-3">Informe o nome e o orçamento diário para salvar ou enviar.</p> : null}

      <div className="grid gap-4 2xl:grid-cols-[280px_minmax(0,1fr)_380px]">
        <nav aria-label="Etapas da campanha" className={cn(cardClasses, 'overflow-hidden self-start')}>
          <div className="border-b border-yx-line px-4 py-4">
            <p className={eyebrowClasses}>Etapas da campanha</p>
            <p className="mt-1 text-xs leading-5 text-yx-fg-3">Siga as etapas até enviar para aprovação.</p>
          </div>
          <div className="divide-y divide-yx-line">
            {steps.map((step, index) => (
              <button
                key={step.key}
                type="button"
                aria-current={activeStep === step.key ? 'step' : undefined}
                onClick={() => setActiveStep(step.key)}
                className={cn(
                  'flex min-h-12 w-full items-start gap-3 px-4 py-3.5 text-left transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-yx-blue',
                  activeStep === step.key ? 'bg-yx-blue-soft' : 'bg-yx-surface hover:bg-yx-surface-2',
                )}
              >
                <span
                  className={cn(
                    'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border',
                    step.status === 'editing' && 'border-yx-blue bg-yx-blue-soft text-yx-blue',
                    step.status === 'complete' && 'border-yx-ok-line bg-yx-ok-soft text-yx-ok',
                    step.status === 'pending' && 'border-yx-line-strong bg-yx-surface text-yx-fg-3',
                    step.status === 'blocked' && 'border-yx-warn-line bg-yx-warn-soft text-yx-warn',
                  )}
                >
                  <step.icon aria-hidden="true" className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-yx-fg">{index + 1}. {step.label}</span>
                    <StepStatus status={step.status} />
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-yx-fg-3">{step.description}</span>
                </span>
              </button>
            ))}
          </div>
        </nav>

        <div className="min-w-0 space-y-4">
          <BuilderCard title="Estratégia da campanha" description="Defina a tese comercial antes de abrir a configuração técnica.">
            <div className="space-y-5">
              <div>
                <SectionLabel icon={Target} label="Objetivo da campanha" />
                <div className="mt-3 grid grid-cols-1 gap-3 min-[560px]:grid-cols-2 xl:grid-cols-5">
                  {objectiveCards.map(objective => (
                    <button
                      key={objective.key}
                      type="button"
                      aria-pressed={form.objective === objective.key}
                      onClick={() => setField('objective')(objective.key)}
                      className={cn(
                        'min-h-[110px] rounded-lg border bg-yx-surface p-4 text-left transition-colors',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yx-blue',
                        form.objective === objective.key
                          ? 'border-yx-blue bg-yx-blue-soft'
                          : 'border-yx-line-strong hover:border-yx-blue',
                      )}
                    >
                      <span
                        className={cn(
                          'flex h-9 w-9 items-center justify-center rounded-full border',
                          form.objective === objective.key ? 'border-yx-blue bg-yx-surface text-yx-blue' : 'border-yx-line-strong text-yx-fg-3',
                        )}
                      >
                        <objective.icon aria-hidden="true" className="h-4 w-4" />
                      </span>
                      <span className="mt-3 block text-sm font-semibold text-yx-fg">{objective.label}</span>
                      <span className="mt-1 block text-xs leading-5 text-yx-fg-3">{objective.description}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                <EditableField label="Nome da campanha" value={form.name} placeholder="Ex.: Captação de leads - Julho" onChange={setField('name')} />
                <EditableField label="Oferta principal" value={form.offer} placeholder="Ex.: Diagnóstico gratuito em 48h" onChange={setField('offer')} />
                <EditableField
                  label="Promessa comercial"
                  value={form.promise}
                  placeholder="Ex.: Reduzir a perda de leads por demora no atendimento"
                  onChange={setField('promise')}
                  className="xl:col-span-2"
                />
              </div>

              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
                <section className="rounded-lg border border-yx-line bg-yx-surface-2 p-4">
                  <SectionLabel icon={Users} label="Público principal" />
                  <p className="mt-2 text-sm leading-6 text-yx-fg-2">Descreva quem deve ver o anúncio. Separe os públicos por vírgula.</p>
                  <EditableField
                    label="Públicos"
                    value={form.audience}
                    placeholder="Ex.: Clínicas médicas, Odontologia, Saúde particular"
                    onChange={setField('audience')}
                    className="mt-3"
                  />
                  <div className="mt-3 flex flex-wrap gap-2">
                    {audienceTags.length > 0 ? (
                      audienceTags.map(tag => <StatusChip key={tag}>{tag}</StatusChip>)
                    ) : (
                      <span className="text-xs text-yx-fg-3">Nenhum público definido.</span>
                    )}
                  </div>
                </section>

                <section className="rounded-lg border border-yx-warn-line bg-yx-warn-soft p-4">
                  <div className="flex gap-3">
                    <AlertCircle aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-yx-warn" />
                    <div>
                      <p className="text-sm font-semibold text-yx-fg">Categoria especial</p>
                      <p className="mt-1 text-xs leading-5 text-yx-fg-2">Confirmar se há restrição aplicável antes de enviar para aprovação.</p>
                    </div>
                  </div>
                </section>
              </div>
            </div>
          </BuilderCard>

          <BuilderCard title="Orçamento e rastreamento">
            <div className="grid gap-4 xl:grid-cols-3">
              <EditableField label="Orçamento diário (R$)" value={form.dailyBudget} placeholder="Ex.: 80" inputMode="decimal" onChange={setField('dailyBudget')} />
              <EditableField label="Orçamento total (R$)" value={form.totalBudget} placeholder="Ex.: 2400" inputMode="decimal" onChange={setField('totalBudget')} />
              <EditableField label="UTM da campanha" value={form.utmCampaign} placeholder="Ex.: diagnostico_48h" onChange={setField('utmCampaign')} />
            </div>
          </BuilderCard>

          <BuilderCard
            title="Anúncio"
            badge={<PendingBadge code="B21" />}
            description={`${adPending.clientMessage} Os textos abaixo alimentam a prévia ao lado.`}
          >
            <div className="grid gap-4 xl:grid-cols-2">
              <EditableField
                label="Título do anúncio"
                value={form.adHeadline}
                placeholder="Ex.: Quanto o atendimento lento custa para você?"
                onChange={setField('adHeadline')}
                className="xl:col-span-2"
              />
              <EditableField
                label="Texto do anúncio"
                value={form.adText}
                placeholder="Ex.: Receba um diagnóstico rápido com plano de ação."
                onChange={setField('adText')}
              />
              <EditableField
                label="Chamada para ação (botão)"
                value={form.adCta}
                placeholder="Ex.: Solicitar diagnóstico"
                onChange={setField('adCta')}
              />
            </div>
          </BuilderCard>

          <BuilderCard title="Estrutura da campanha" bodyClassName="p-0">
            <ResponsiveTable<StructureItem>
              caption="Estrutura da campanha"
              rows={structure}
              getRowKey={row => row.level}
              columns={[
                {
                  key: 'level',
                  header: 'Nível',
                  render: row => (
                    <span className="inline-flex items-center gap-2 font-semibold text-yx-fg">
                      <row.icon aria-hidden="true" className="h-4 w-4 text-yx-blue" />
                      {row.level}
                    </span>
                  ),
                },
                { key: 'name', header: 'Nome', render: row => <span className="font-medium text-yx-fg">{row.name}</span> },
                { key: 'role', header: 'Papel', render: row => <span className="text-yx-fg-2">{row.role}</span> },
                {
                  key: 'status',
                  header: 'Status',
                  render: row => <StatusChip variant={row.filled ? 'ok' : 'neutral'}>{row.filled ? 'Preenchido' : 'A preencher'}</StatusChip>,
                },
              ]}
            />
          </BuilderCard>

          <section className="grid gap-4 lg:grid-cols-2">
            <ConfigTile
              icon={Gauge}
              label="Orçamento"
              value={dailyBudget > 0 ? `R$ ${form.dailyBudget.trim()}/dia` : 'Não definido'}
              detail={totalBudget > 0 ? `Total R$ ${form.totalBudget.trim()}` : 'Sem orçamento total'}
            />
            <ConfigTile
              icon={Link2}
              label="UTM"
              value={form.utmCampaign.trim() || 'Não definida'}
              detail="Identifica a campanha no CRM"
            />
          </section>
        </div>

        <aside className="space-y-4 self-start rounded-[10px] border border-yx-line bg-yx-surface-2 p-4">
          <div>
            <div className="flex items-center justify-between gap-3">
              <p className={eyebrowClasses}>Prontidão da campanha</p>
              <StatusChip variant="neutral">{readiness.score}%</StatusChip>
            </div>
            <div
              role="progressbar"
              aria-label="Prontidão da campanha"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={readiness.score}
              className="mt-3 h-2 rounded-full bg-yx-bar-track"
            >
              <div className="h-2 rounded-full bg-yx-blue" style={{ width: `${readiness.score}%` }} />
            </div>
          </div>

          <ul className="m-0 grid list-none gap-2 p-0">
            {readiness.items.map(item => (
              <li key={item.label} className="flex items-start gap-2 rounded-lg border border-yx-line bg-yx-surface px-3 py-2">
                {item.ok ? (
                  <CheckCircle2 aria-label="Em ordem" className="mt-0.5 h-4 w-4 shrink-0 text-yx-ok" />
                ) : (
                  <AlertCircle aria-label="Requer atenção" className="mt-0.5 h-4 w-4 shrink-0 text-yx-warn" />
                )}
                <div>
                  <p className="text-xs font-semibold text-yx-fg">{item.label}</p>
                  <p className="mt-0.5 text-xs leading-4 text-yx-fg-3">{item.detail}</p>
                </div>
              </li>
            ))}
          </ul>

          <section className={cn(cardClasses, 'overflow-hidden')}>
            <div className="border-b border-yx-line px-4 py-3">
              <p className={eyebrowClasses}>Prévia do anúncio</p>
            </div>
            <div className="p-4">
              <div className="rounded-lg border border-yx-line bg-yx-surface p-3">
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-yx-surface-2 text-xs font-bold text-yx-fg-2">A</span>
                  <div>
                    <p className="text-xs font-semibold text-yx-fg">Página do anunciante</p>
                    <p className="text-xs text-yx-fg-3">Patrocinado</p>
                  </div>
                </div>
                <div className="mt-3 overflow-hidden rounded-lg bg-ink-800">
                  <div className="aspect-[4/3] bg-gradient-to-br from-ink-800 to-ink-600 p-4 text-white">
                    <p className={cn('max-w-[220px] text-lg font-bold leading-tight', !form.adHeadline.trim() && 'text-white/60')}>
                      {form.adHeadline.trim() || 'Título do anúncio'}
                    </p>
                  </div>
                </div>
                <p className={cn('mt-3 text-xs leading-5', form.adText.trim() ? 'text-yx-fg-2' : 'text-yx-fg-3')}>
                  {form.adText.trim() || 'O texto do anúncio aparece aqui.'}
                </p>
                <div
                  className={cn(
                    'mt-3 flex h-10 w-full items-center justify-center rounded-lg bg-yx-surface-2 text-xs font-semibold',
                    form.adCta.trim() ? 'text-yx-fg' : 'text-yx-fg-3',
                  )}
                >
                  {form.adCta.trim() || 'Chamada para ação'}
                </div>
              </div>
            </div>
          </section>

          <section className={cn(cardClasses, 'p-4')}>
            <p className={eyebrowClasses}>Estimativa de resultado</p>
            <p className="mt-3 text-xs leading-5 text-yx-fg-2">Estimativa disponível após a revisão da YUX.</p>
            <div className="mt-3 grid grid-cols-1 gap-2 text-center">
              <MiniMetric label="Orçamento diário" value={dailyBudget > 0 ? `R$ ${form.dailyBudget.trim()}/dia` : 'Não definido'} />
            </div>
          </section>
        </aside>
      </div>
    </div>
  )
}

interface StructureItem {
  level: string
  icon: LucideIcon
  name: string
  role: string
  filled: boolean
}

const cardClasses =
  'min-w-0 rounded-[10px] border border-yx-line bg-yx-surface text-yx-fg shadow-[0_1px_2px_rgba(14,17,32,0.04),0_2px_8px_rgba(14,17,32,0.04)] dark:shadow-none'
const eyebrowClasses = 'font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-yx-fg-3'

function BuilderCard({
  title,
  description,
  badge,
  bodyClassName,
  children,
}: {
  title: string
  description?: string
  badge?: ReactNode
  bodyClassName?: string
  children: ReactNode
}) {
  return (
    <section aria-label={title} className={cn(cardClasses, 'overflow-hidden')}>
      <div className="border-b border-yx-line px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-display text-base font-semibold leading-[1.3] tracking-[-0.01em] text-yx-fg">{title}</h2>
          {badge}
        </div>
        {description ? <p className="mt-1 text-[13px] leading-snug text-yx-fg-3">{description}</p> : null}
      </div>
      <div className={cn('p-5', bodyClassName)}>{children}</div>
    </section>
  )
}

function StepStatus({ status }: { status: BuilderStatus }) {
  const label = status === 'complete' ? 'Completo' : status === 'editing' ? 'Em edição' : status === 'blocked' ? 'Bloqueado' : 'A fazer'
  const className =
    status === 'complete' ? 'text-yx-ok' : status === 'editing' ? 'text-yx-blue' : status === 'blocked' ? 'text-yx-warn' : 'text-yx-fg-3'

  return <span className={cn('whitespace-nowrap text-xs font-semibold', className)}>{label}</span>
}

function SectionLabel({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <Icon aria-hidden="true" className="h-4 w-4 text-yx-blue" />
      <p className={eyebrowClasses}>{label}</p>
    </div>
  )
}

function EditableField({
  label,
  value,
  onChange,
  placeholder,
  inputMode,
  className,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  inputMode?: 'text' | 'decimal'
  className?: string
}) {
  return (
    <label className={cn('block rounded-lg border border-yx-line-strong bg-yx-surface p-3.5 focus-within:border-yx-blue focus-within:ring-2 focus-within:ring-yx-blue/30', className)}>
      <span className={eyebrowClasses}>{label}</span>
      <input
        value={value}
        placeholder={placeholder}
        inputMode={inputMode}
        onChange={event => onChange(event.target.value)}
        className="mt-2 h-10 w-full border-0 bg-transparent p-0 text-sm font-semibold text-yx-fg outline-none placeholder:font-normal placeholder:text-yx-fg-3"
      />
    </label>
  )
}

function ConfigTile({ icon: Icon, label, value, detail }: { icon: LucideIcon; label: string; value: string; detail: string }) {
  return (
    <div className={cn(cardClasses, 'p-4')}>
      <Icon aria-hidden="true" className="h-4 w-4 text-yx-blue" />
      <p className={cn(eyebrowClasses, 'mt-3')}>{label}</p>
      <p className="mt-2 font-display text-lg font-bold text-yx-fg">{value}</p>
      <p className="mt-1 truncate text-xs text-yx-fg-3">{detail}</p>
    </div>
  )
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-yx-line bg-yx-surface-2 px-2 py-3">
      <p className="text-xs font-bold text-yx-fg">{value}</p>
      <p className="mt-1 text-xs text-yx-fg-3">{label}</p>
    </div>
  )
}

function buildReadiness(form: CampaignFormState, audienceTags: string[], connection: AdProviderConnection | null) {
  const connected = connection?.status === 'connected'
  const items = [
    {
      label: 'Conta de anúncios',
      detail: connection
        ? `${connection.name}${connected ? '' : ' (requer atenção)'}`
        : 'Será verificada na publicação.',
      ok: connected,
    },
    { label: 'Nome e oferta', detail: form.name.trim() && form.offer.trim() ? 'Definidos.' : 'Informe o nome da campanha e a oferta.', ok: form.name.trim() !== '' && form.offer.trim() !== '' },
    { label: 'Público definido', detail: audienceTags.length > 0 ? `${audienceTags.length} ${audienceTags.length === 1 ? 'público informado' : 'públicos informados'}.` : 'Informe ao menos um público.', ok: audienceTags.length > 0 },
    { label: 'Orçamento', detail: toAmount(form.dailyBudget) > 0 ? 'Orçamento diário informado.' : 'Informe o orçamento diário.', ok: toAmount(form.dailyBudget) > 0 },
    { label: 'Anúncio', detail: form.adHeadline.trim() && form.adText.trim() ? 'Título e texto informados.' : 'Informe o título e o texto do anúncio.', ok: form.adHeadline.trim() !== '' && form.adText.trim() !== '' },
    { label: 'UTM configurada', detail: form.utmCampaign.trim() || 'Informe a UTM da campanha.', ok: form.utmCampaign.trim() !== '' },
    { label: 'Aprovação do cliente', detail: 'Necessária antes de publicar no provedor.', ok: false },
  ]
  const okCount = items.filter(item => item.ok).length
  return {
    items,
    score: Math.round((okCount / items.length) * 100),
    blockers: items.length - okCount,
  }
}

function splitList(value: string) {
  return value.split(',').map(item => item.trim()).filter(Boolean)
}

function toAmount(value: string) {
  const parsed = Number(value.trim().replace(',', '.'))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

function objectiveLabel(objective: CampaignObjectiveOption) {
  return objectiveCards.find(card => card.key === objective)?.label || 'Leads'
}

function mapObjective(objective: CampaignObjectiveOption): CreateCampaignDraftInput['objective'] {
  if (objective === 'conversions') return 'conversions'
  if (objective === 'traffic') return 'traffic'
  if (objective === 'awareness') return 'awareness'
  return 'lead_generation'
}
