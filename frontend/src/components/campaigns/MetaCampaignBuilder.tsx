import { useMemo, useState } from 'react'
import {
  AlertCircle,
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileText,
  Gauge,
  Globe2,
  Image,
  Layers3,
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
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { CreateCampaignDraftInput } from '@/types/campaign'
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
  audience: string[]
  location: string
  dailyBudget: number
  totalBudget: number
  budgetMode: 'campaign' | 'adset'
  conversionEvent: string
  destination: string
  utmCampaign: string
}

const objectiveCards: ObjectiveCard[] = [
  { key: 'lead_generation', label: 'Leads', description: 'Capturar contatos no WhatsApp, formulario ou CRM.', icon: Target },
  { key: 'conversions', label: 'Vendas', description: 'Otimizar para evento comercial ou compra.', icon: BarChart3 },
  { key: 'traffic', label: 'Trafego', description: 'Levar visitantes qualificados para uma pagina.', icon: MousePointer2 },
  { key: 'engagement', label: 'Engajamento', description: 'Aumentar respostas, conversas e interacoes.', icon: MessageCircle },
  { key: 'awareness', label: 'Reconhecimento', description: 'Expandir alcance e lembranca da marca.', icon: Radio },
]

const defaultForm: CampaignFormState = {
  objective: 'lead_generation',
  name: 'Captacao WhatsApp - Julho',
  offer: 'Diagnostico WhatsApp 48h',
  promise: 'Reduzir perda de leads por demora no atendimento',
  audience: ['Clinicas medicas', 'Odontologia', 'Saude particular', 'Brasil'],
  location: 'Brasil',
  dailyBudget: 80,
  totalBudget: 2400,
  budgetMode: 'campaign',
  conversionEvent: 'Lead WhatsApp',
  destination: 'Landing page + WhatsApp',
  utmCampaign: 'diagnostico_whatsapp_48h',
}

export function MetaCampaignBuilder({
  contract,
  organizationId,
  onBack,
  onSaveDraft,
  onSubmitForApproval,
}: MetaCampaignBuilderProps) {
  const [activeStep, setActiveStep] = useState<BuilderStepKey>('strategy')
  const [form, setForm] = useState<CampaignFormState>(defaultForm)
  const [isSaving, setIsSaving] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [selectedCreative, setSelectedCreative] = useState('Dor + prova social')

  const readiness = useMemo(() => buildReadiness(form, Boolean(organizationId)), [form, organizationId])
  const steps = useMemo<BuilderStep[]>(() => [
    { key: 'strategy', label: 'Estrategia', description: 'Oferta, promessa e objetivo.', icon: Sparkles, status: activeStep === 'strategy' ? 'editing' : 'complete' },
    { key: 'campaign', label: 'Configuracao da campanha', description: 'Orcamento, agenda e estrutura.', icon: SlidersHorizontal, status: activeStep === 'campaign' ? 'editing' : 'complete' },
    { key: 'audience', label: 'Publico e segmentacao', description: 'Interesses, regioes e exclusoes.', icon: Users, status: activeStep === 'audience' ? 'editing' : 'pending' },
    { key: 'creative', label: 'Criativos e anuncios', description: 'Pecas, copies, formatos e CTAs.', icon: Image, status: activeStep === 'creative' ? 'editing' : 'pending' },
    { key: 'tracking', label: 'Tracking e destino', description: 'Pixel, evento, UTM e CRM.', icon: Link2, status: activeStep === 'tracking' ? 'editing' : 'complete' },
    { key: 'review', label: 'Revisao e publicacao', description: 'Bloqueios, aprovacao e envio.', icon: ShieldCheck, status: activeStep === 'review' ? 'editing' : readiness.blockers > 0 ? 'blocked' : 'pending' },
  ], [activeStep, readiness.blockers])

  const payload = useMemo<CreateCampaignDraftInput>(() => ({
    organizationId: organizationId || '',
    clientId: contract.clientId,
    contractId: contract.id,
    provider: 'meta',
    name: form.name,
    objective: mapObjective(form.objective),
    dailyBudget: form.dailyBudget,
    totalBudget: form.totalBudget,
    utmCampaign: form.utmCampaign,
  }), [contract.clientId, contract.id, form, organizationId])

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

  return (
    <div className="-mx-4 -my-6 min-h-[calc(100vh-4rem)] space-y-5 bg-[#f4f4f4] px-4 py-5 text-[#141821] sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-6">
      <header className="flex flex-col gap-4 border-b border-slate-300 pb-5 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 xl:max-w-[720px]">
          <button
            type="button"
            onClick={onBack}
            className="mb-4 inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:border-blue-300 hover:text-blue-700"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar para campanhas
          </button>
          <h1 className="text-3xl font-bold leading-tight text-slate-950">Nova Campanha Meta Ads</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-700">
            Monte, valide e publique campanhas com controle de estrategia, criativos, publico e tracking.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-700">
            <ContextChip icon={Megaphone} label={`Contrato: ${contract.name || 'Captacao'}`} />
            <ContextChip icon={Globe2} label="Conta Meta: Empresa ABC" />
            <ContextChip icon={ShieldCheck} label="Pixel verificado" tone="emerald" />
            <ContextChip icon={Clock3} label="Atualizado agora" />
            <ContextChip icon={FileText} label="Rascunho" tone="amber" />
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2 2xl:gap-3">
          <Button
            type="button"
            title="Salvar rascunho"
            variant="outline"
            className="h-10 border-slate-300 bg-white px-3 2xl:px-4"
            disabled={isSaving || !organizationId}
            onClick={handleSaveDraft}
          >
            <Save className="mr-2 h-4 w-4" />
            {isSaving ? 'Salvando...' : 'Salvar rascunho'}
          </Button>
          <Button
            type="button"
            title="Enviar para aprovacao"
            variant="outline"
            className="h-10 border-blue-200 bg-white px-3 text-blue-700 hover:bg-blue-50 2xl:px-4"
            disabled={isSubmitting || !organizationId}
            onClick={handleSubmitForApproval}
          >
            <Send className="mr-2 h-4 w-4" />
            {isSubmitting ? 'Enviando...' : 'Enviar para aprovacao'}
          </Button>
          <Button
            type="button"
            title="Publicar campanha"
            className="h-10 bg-[#2563EB] px-3 hover:bg-blue-700 2xl:px-4"
            onClick={() => setActiveStep('review')}
          >
            <Zap className="mr-2 h-4 w-4" />
            Publicar campanha
          </Button>
        </div>
      </header>

      <div className="grid gap-4 2xl:grid-cols-[280px_minmax(0,1fr)_380px]">
        <aside className="overflow-hidden rounded-md border border-slate-300 bg-white">
          <div className="border-b border-slate-300 px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-950">Fluxo Meta Ads</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">Etapas para publicar com seguranca operacional.</p>
          </div>
          <div className="divide-y divide-slate-200">
            {steps.map((step, index) => (
              <button
                key={step.key}
                type="button"
                onClick={() => setActiveStep(step.key)}
                className={cn(
                  'flex w-full items-start gap-3 px-4 py-4 text-left transition',
                  activeStep === step.key ? 'bg-blue-50' : 'bg-white hover:bg-slate-50',
                )}
              >
                <span className={cn(
                  'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border',
                  step.status === 'editing' && 'border-blue-200 bg-blue-100 text-blue-700',
                  step.status === 'complete' && 'border-emerald-200 bg-emerald-50 text-emerald-700',
                  step.status === 'pending' && 'border-slate-200 bg-white text-slate-500',
                  step.status === 'blocked' && 'border-amber-200 bg-amber-50 text-amber-700',
                )}>
                  <step.icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-950">{index + 1}. {step.label}</span>
                    <StepStatus status={step.status} />
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-slate-500">{step.description}</span>
                </span>
              </button>
            ))}
          </div>
        </aside>

        <main className="min-w-0 space-y-4">
          <section className="overflow-hidden rounded-md border border-slate-300 bg-white">
            <div className="flex flex-col gap-2 border-b border-slate-300 px-5 py-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-950">Estrategia da campanha</p>
                <p className="mt-1 text-sm text-slate-600">Defina a tese comercial antes de abrir a configuracao tecnica.</p>
              </div>
              <div className="inline-flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-700">
                <Sparkles className="h-4 w-4" />
                IA YUX sugerindo estrutura inicial
              </div>
            </div>

            <div className="space-y-5 p-5">
              <div>
                <SectionLabel icon={Target} label="Objetivo da campanha" />
                <div className="mt-3 grid gap-3 xl:grid-cols-5">
                  {objectiveCards.map(objective => (
                    <button
                      key={objective.key}
                      type="button"
                      onClick={() => setForm(current => ({ ...current, objective: objective.key }))}
                      className={cn(
                        'min-h-[126px] rounded-md border bg-white p-4 text-left transition',
                        form.objective === objective.key
                          ? 'border-blue-500 shadow-[0_0_0_1px_rgba(37,99,235,0.18)]'
                          : 'border-slate-300 hover:border-blue-300',
                      )}
                    >
                      <span className={cn(
                        'flex h-9 w-9 items-center justify-center rounded-full border',
                        form.objective === objective.key ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-500',
                      )}>
                        <objective.icon className="h-4 w-4" />
                      </span>
                      <span className="mt-3 block text-sm font-semibold text-slate-950">{objective.label}</span>
                      <span className="mt-1 block text-xs leading-5 text-slate-500">{objective.description}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                <EditableField
                  label="Nome da campanha"
                  value={form.name}
                  onChange={value => setForm(current => ({ ...current, name: value }))}
                />
                <EditableField
                  label="Oferta principal"
                  value={form.offer}
                  onChange={value => setForm(current => ({ ...current, offer: value }))}
                />
                <EditableField
                  label="Promessa comercial"
                  value={form.promise}
                  onChange={value => setForm(current => ({ ...current, promise: value }))}
                  className="xl:col-span-2"
                />
              </div>

              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
                <section className="rounded-md border border-slate-300 bg-[#fbfbfb] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <SectionLabel icon={Users} label="Publico principal" />
                      <p className="mt-2 text-sm leading-6 text-slate-600">Segmentacao inicial derivada do contrato, oferta e ativos de conhecimento.</p>
                    </div>
                    <button type="button" className="rounded-sm border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:border-blue-300 hover:text-blue-700">
                      Editar
                    </button>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {form.audience.map(tag => (
                      <span key={tag} className="rounded-sm border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700">{tag}</span>
                    ))}
                  </div>
                </section>

                <section className="rounded-md border border-amber-300 bg-amber-50/60 p-4">
                  <div className="flex gap-3">
                    <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                    <div>
                      <p className="text-sm font-semibold text-amber-900">Categoria especial</p>
                      <p className="mt-1 text-xs leading-5 text-amber-800">Confirmar se ha restricao aplicavel antes de enviar para aprovacao.</p>
                    </div>
                  </div>
                </section>
              </div>
            </div>
          </section>

          <section className="overflow-hidden rounded-md border border-slate-300 bg-white">
            <div className="border-b border-slate-300 px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-950">Estrutura sugerida pela IA YUX</p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-[760px] w-full text-left text-sm">
                <thead className="bg-[#f4f4f4] text-xs uppercase tracking-[0.12em] text-slate-500">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Nivel</th>
                    <th className="px-5 py-3 font-semibold">Nome</th>
                    <th className="px-5 py-3 font-semibold">Papel</th>
                    <th className="px-5 py-3 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  <StructureRow icon={Megaphone} level="Campanha" name={form.name} role="Geracao de leads Meta Ads" status="Em edicao" />
                  <StructureRow icon={Users} level="Conjunto" name="Interesses Saude + Gestao" role="Clinicas e decisores comerciais" status="Pendente" />
                  <StructureRow icon={Image} level="Anuncio" name={selectedCreative} role="Criativo 4:5 + copy direta" status="Pendente" />
                </tbody>
              </table>
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-4">
            <ConfigTile icon={Gauge} label="Orcamento" value={`R$ ${form.dailyBudget}/dia`} detail={`Total R$ ${form.totalBudget}`} />
            <ConfigTile icon={Layers3} label="Posicionamentos" value="Advantage+" detail="Ajuste manual disponivel" />
            <ConfigTile icon={MessageCircle} label="Conversao" value={form.conversionEvent} detail={form.destination} />
            <ConfigTile icon={Link2} label="UTM" value="Configurada" detail={form.utmCampaign} />
          </section>
        </main>

        <aside className="space-y-4 rounded-md border border-slate-300 bg-[#f8fafc] p-4 shadow-[inset_3px_0_0_rgba(37,99,235,0.16)]">
          <div>
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-950">Prontidao da campanha</p>
              <span className="rounded-sm border border-blue-200 bg-white px-2 py-1 text-xs font-semibold text-blue-700">{readiness.score}%</span>
            </div>
            <div className="mt-3 h-2 rounded-full bg-slate-200">
              <div className="h-2 rounded-full bg-[#2563EB]" style={{ width: `${readiness.score}%` }} />
            </div>
          </div>

          <div className="space-y-2">
            {readiness.items.map(item => (
              <div key={item.label} className="flex items-start gap-2 rounded-md border border-slate-200 bg-white px-3 py-2">
                {item.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" /> : <AlertCircle className="mt-0.5 h-4 w-4 text-amber-600" />}
                <div>
                  <p className="text-xs font-semibold text-slate-950">{item.label}</p>
                  <p className="mt-0.5 text-[11px] leading-4 text-slate-500">{item.detail}</p>
                </div>
              </div>
            ))}
          </div>

          <section className="overflow-hidden rounded-md border border-slate-300 bg-white">
            <div className="border-b border-slate-200 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-950">Preview do anuncio</p>
            </div>
            <div className="p-4">
              <div className="rounded-md border border-slate-300 bg-white p-3 shadow-sm">
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">Y</span>
                  <div>
                    <p className="text-xs font-semibold text-slate-950">Empresa ABC</p>
                    <p className="text-[11px] text-slate-500">Patrocinado</p>
                  </div>
                </div>
                <div className="mt-3 overflow-hidden rounded-md bg-slate-900">
                  <div className="aspect-[4/3] bg-[radial-gradient(circle_at_80%_20%,rgba(37,99,235,0.35),transparent_28%),linear-gradient(135deg,#132033,#1f2937_48%,#dbeafe_49%,#ecfeff)] p-4 text-white">
                    <p className="max-w-[190px] text-lg font-bold leading-tight">Quanto dinheiro sua clinica perde porque o WhatsApp demora a responder?</p>
                    <div className="mt-5 inline-flex rounded-sm bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white">Solicitar diagnostico</div>
                  </div>
                </div>
                <p className="mt-3 text-xs leading-5 text-slate-700">{form.promise}. Diagnostico rapido com plano de acao.</p>
                <button type="button" className="mt-3 h-9 w-full rounded-sm bg-slate-100 text-xs font-semibold text-slate-800">Solicitar diagnostico</button>
              </div>
            </div>
          </section>

          <section className="rounded-md border border-slate-300 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-950">Estimativa operacional</p>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              <MiniMetric label="Alcance" value="18k-42k" />
              <MiniMetric label="CPL" value="R$ 68-96" />
              <MiniMetric label="Budget" value={`R$ ${form.dailyBudget}/dia`} />
            </div>
            <div className="mt-4 rounded-md border border-blue-200 bg-blue-50 p-3">
              <div className="flex gap-2">
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" />
                <p className="text-xs leading-5 text-blue-900">Gerar 3 variacoes de criativo antes de publicar reduz risco de saturacao inicial.</p>
              </div>
            </div>
          </section>

          <section className="rounded-md border border-slate-300 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-950">Criativo ativo</p>
            <div className="mt-3 grid gap-2">
              {['Dor + prova social', 'Antes e depois operacional', 'Oferta diagnostico 48h'].map(creative => (
                <button
                  key={creative}
                  type="button"
                  onClick={() => setSelectedCreative(creative)}
                  className={cn(
                    'flex items-center justify-between rounded-sm border px-3 py-2 text-left text-xs font-medium',
                    selectedCreative === creative ? 'border-blue-400 bg-blue-50 text-blue-800' : 'border-slate-200 bg-white text-slate-700 hover:border-blue-300',
                  )}
                >
                  {creative}
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </div>
  )
}

function ContextChip({ icon: Icon, label, tone = 'slate' }: { icon: LucideIcon; label: string; tone?: 'slate' | 'emerald' | 'amber' }) {
  const toneClass = tone === 'emerald'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
    : tone === 'amber'
      ? 'border-amber-200 bg-amber-50 text-amber-800'
      : 'border-slate-300 bg-white text-slate-700'

  return (
    <span className={cn('inline-flex h-8 items-center gap-2 rounded-md border px-3 text-xs font-medium', toneClass)}>
      <Icon className="h-3.5 w-3.5" />
      {label}
    </span>
  )
}

function StepStatus({ status }: { status: BuilderStatus }) {
  const label = status === 'complete' ? 'Completo' : status === 'editing' ? 'Em edicao' : status === 'blocked' ? 'Bloqueado' : 'Pendente'
  const className = status === 'complete'
    ? 'text-emerald-700'
    : status === 'editing'
      ? 'text-blue-700'
      : status === 'blocked'
        ? 'text-amber-700'
        : 'text-slate-500'

  return <span className={cn('text-[11px] font-semibold', className)}>{label}</span>
}

function SectionLabel({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4 text-blue-600" />
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-950">{label}</p>
    </div>
  )
}

function EditableField({
  label,
  value,
  onChange,
  className,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  className?: string
}) {
  return (
    <label className={cn('block rounded-md border border-slate-300 bg-white p-4', className)}>
      <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</span>
      <input
        value={value}
        onChange={event => onChange(event.target.value)}
        className="mt-2 h-9 w-full border-0 bg-transparent p-0 text-sm font-semibold text-slate-950 outline-none placeholder:text-slate-400"
      />
    </label>
  )
}

function StructureRow({ icon: Icon, level, name, role, status }: { icon: LucideIcon; level: string; name: string; role: string; status: string }) {
  return (
    <tr className="bg-white">
      <td className="px-5 py-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
          <Icon className="h-4 w-4 text-blue-600" />
          {level}
        </div>
      </td>
      <td className="px-5 py-4 text-sm font-medium text-slate-950">{name}</td>
      <td className="px-5 py-4 text-sm text-slate-600">{role}</td>
      <td className="px-5 py-4"><span className="rounded-sm border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700">{status}</span></td>
    </tr>
  )
}

function ConfigTile({ icon: Icon, label, value, detail }: { icon: LucideIcon; label: string; value: string; detail: string }) {
  return (
    <div className="rounded-md border border-slate-300 bg-white p-4">
      <Icon className="h-4 w-4 text-blue-600" />
      <p className="mt-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className="mt-2 text-lg font-bold text-slate-950">{value}</p>
      <p className="mt-1 truncate text-xs text-slate-500">{detail}</p>
    </div>
  )
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-[#f8fafc] px-2 py-3">
      <p className="text-xs font-bold text-slate-950">{value}</p>
      <p className="mt-1 text-[11px] text-slate-500">{label}</p>
    </div>
  )
}

function buildReadiness(form: CampaignFormState, hasOrganization: boolean) {
  const items = [
    { label: 'Conta conectada', detail: hasOrganization ? 'Conta Meta disponivel para rascunho.' : 'Workspace sem organizacao carregada.', ok: hasOrganization },
    { label: 'Pixel verificado', detail: 'Evento principal detectado no contrato.', ok: true },
    { label: 'Publico definido', detail: `${form.audience.length} criterios iniciais selecionados.`, ok: form.audience.length >= 3 },
    { label: 'Criativo principal', detail: 'Selecionar pelo menos uma peca aprovada.', ok: false },
    { label: 'UTM configurada', detail: form.utmCampaign, ok: Boolean(form.utmCampaign) },
    { label: 'Aprovacao cliente', detail: 'Necessaria antes de publicar no provedor.', ok: false },
  ]
  const okCount = items.filter(item => item.ok).length
  return {
    items,
    score: Math.round((okCount / items.length) * 100),
    blockers: items.length - okCount,
  }
}

function mapObjective(objective: CampaignObjectiveOption): CreateCampaignDraftInput['objective'] {
  if (objective === 'conversions') return 'conversions'
  if (objective === 'traffic') return 'traffic'
  if (objective === 'awareness') return 'awareness'
  return 'lead_generation'
}
