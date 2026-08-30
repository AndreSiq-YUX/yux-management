import { useState } from 'react'
import { Bot, ChevronLeft, ChevronRight, Loader2, Sparkles } from 'lucide-react'
import { AutonomyEnvelopeForm, type AutonomyEnvelopeDraft } from './AutonomyEnvelopeForm'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { actionEngineService } from '@/services/actionEngineService'
import type { ActionMission, CreateMissionIntentInput } from '@/types/actionEngine'

type MissionIntakeProps = {
  open: boolean
  organizationId: string
  contractId?: string
  canWrite: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (mission: ActionMission) => void
}

const defaultDeadline = () => new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10)
const defaultEnvelope = (): AutonomyEnvelopeDraft => ({
  mode: 'assisted', deadline: defaultDeadline(), allowedModules: ['crm'],
  maxTotalCostBrl: '1000', maxHumanHours: '10', maxExternalContacts: '100',
})

export function MissionIntake({ open, organizationId, contractId, canWrite, onOpenChange, onCreated }: MissionIntakeProps) {
  const [step, setStep] = useState(1)
  const [title, setTitle] = useState('')
  const [objective, setObjective] = useState('')
  const [expectedValueBrl, setExpectedValueBrl] = useState('')
  const [quickStart, setQuickStart] = useState<CreateMissionIntentInput['quickStart']>()
  const [envelope, setEnvelope] = useState<AutonomyEnvelopeDraft>(defaultEnvelope)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const deadlineAt = envelope.deadline ? new Date(`${envelope.deadline}T23:59:59.000Z`).toISOString() : ''
  const objectiveReady = objective.trim().length >= 10
  const envelopeBlockers = [
    ...(envelope.allowedModules.length === 0 ? ['Selecione ao menos uma área permitida.'] : []),
    ...(!deadlineAt || Date.parse(deadlineAt) <= Date.now() ? ['Defina um prazo futuro.'] : []),
    ...(Number(envelope.maxTotalCostBrl) <= 0 ? ['O orçamento precisa ser maior que zero.'] : []),
    ...(Number(envelope.maxHumanHours) < 0 ? ['As horas humanas não podem ser negativas.'] : []),
  ]

  function selectRevenueRecovery() {
    setQuickStart('revenue_recovery')
    setTitle('Recuperar receita de oportunidades inativas')
    setObjective('Recuperar receita de oportunidades inativas com abordagem governada, preservando consentimento e ownership.')
    setExpectedValueBrl('10000')
    setEnvelope(current => ({ ...current, allowedModules: ['crm'], mode: 'assisted' }))
  }

  function selectFunnelNurture() {
    setQuickStart('funnel_nurture')
    setTitle('Criar funil e nutrição comercial')
    setObjective('Criar um funil comercial completo e automatizar uma sequência de e-mails fundamentada na base de conhecimento da empresa.')
    setExpectedValueBrl('10000')
    setEnvelope(current => ({ ...current, allowedModules: ['crm', 'automations', 'funnel_nurture_agent'], mode: 'prepare' }))
  }

  async function createIntent() {
    if (!canWrite || !objectiveReady || envelopeBlockers.length > 0) return
    setBusy(true); setError(null)
    try {
      const mission = await actionEngineService.createMissionIntent({
        organizationId, contractId, title: title.trim() || undefined, objective: objective.trim(),
        mode: envelope.mode, deadlineAt, allowedModules: envelope.allowedModules,
        maxTotalCostBrl: envelope.maxTotalCostBrl, maxHumanHours: envelope.maxHumanHours,
        maxExternalContacts: Number(envelope.maxExternalContacts || 0),
        expectedValueBrl: expectedValueBrl || undefined, quickStart,
      })
      onCreated(mission); onOpenChange(false)
      setStep(1); setTitle(''); setObjective(''); setExpectedValueBrl(''); setQuickStart(undefined); setEnvelope(defaultEnvelope())
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível criar a missão.')
    } finally { setBusy(false) }
  }

  function updateObjective(value: string) {
    setObjective(value); setQuickStart(undefined)
    if (/(funil|pipeline|nutri[cç][aã]o|sequ[eê]ncia\s+de\s+e-?mails?)/iu.test(value)) {
      setEnvelope(current => ({ ...current, allowedModules: [...new Set([...current.allowedModules, 'crm', 'automations', 'funnel_nurture_agent'])] }))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto rounded-sm">
        <DialogHeader><div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-blue-700"><Bot className="h-4 w-4" /> Mission Supervisor</div><DialogTitle>O que você quer que a YUX realize?</DialogTitle><DialogDescription>Descreva o resultado. O agente usará apenas o Harness, a base publicada e as áreas autorizadas para propor um plano verificável.</DialogDescription></DialogHeader>
        {!canWrite ? <div className="border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Seu perfil pode acompanhar missões, mas não criar ou alterar uma.</div> : <>
          <div className="grid grid-cols-2 gap-2 border-y border-slate-200 py-3"><StepLabel active={step === 1} done={step > 1} number={1} label="Pedido" /><StepLabel active={step === 2} done={false} number={2} label="Autonomia e limites" /></div>
          {step === 1 ? <div className="space-y-5 py-2"><div className="grid gap-3 sm:grid-cols-2"><button type="button" onClick={selectFunnelNurture} className={`flex w-full items-start gap-3 border p-4 text-left ${quickStart === 'funnel_nurture' ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-blue-300'}`}><Sparkles className="mt-0.5 h-5 w-5 text-blue-600" /><span><span className="block text-sm font-semibold text-slate-900">Funil + nutrição</span><span className="mt-1 block text-xs leading-5 text-slate-600">Prepara funil, e-mails, sequência e automação para revisão.</span></span></button><button type="button" onClick={selectRevenueRecovery} className={`flex w-full items-start gap-3 border p-4 text-left ${quickStart === 'revenue_recovery' ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-blue-300'}`}><Sparkles className="mt-0.5 h-5 w-5 text-blue-600" /><span><span className="block text-sm font-semibold text-slate-900">Revenue Recovery</span><span className="mt-1 block text-xs leading-5 text-slate-600">Recupera oportunidades inativas com abordagem governada.</span></span></button></div><label className="block space-y-2"><span className="text-sm font-semibold text-slate-900">Descreva o resultado desejado</span><textarea aria-label="Descreva o resultado desejado" className="min-h-36 w-full border border-slate-300 p-3 text-sm leading-6 outline-none focus:border-blue-500" placeholder="Ex.: crie um funil comercial com quatro etapas e automatize uma sequência de quatro e-mails para novos leads" value={objective} onChange={event => updateObjective(event.target.value)} /><span className="block text-xs text-slate-500">O agente fará no máximo três perguntas de esclarecimento, agrupadas.</span></label><div className="grid gap-4 sm:grid-cols-2"><TextField label="Título opcional" value={title} onChange={setTitle} placeholder="Será sugerido a partir do objetivo" /><TextField label="Valor esperado opcional (R$)" value={expectedValueBrl} onChange={setExpectedValueBrl} type="number" placeholder="0" /></div></div> : <div className="space-y-5 py-2"><AutonomyEnvelopeForm value={envelope} onChange={setEnvelope} /><div className="border border-slate-200 bg-slate-50 p-4"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Antes de executar</p><p className="mt-2 text-sm leading-6 text-slate-700">Conexões, permissões, consentimento, ownership, orçamento e catálogo serão verificados novamente imediatamente antes de cada ação.</p>{envelopeBlockers.length > 0 ? <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-red-700">{envelopeBlockers.map(blocker => <li key={blocker}>{blocker}</li>)}</ul> : null}</div></div>}
          {error ? <p className="border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
          <DialogFooter className="mt-2 flex-row justify-between sm:justify-between sm:space-x-0"><Button variant="outline" disabled={busy || step === 1} onClick={() => setStep(1)}><ChevronLeft className="mr-2 h-4 w-4" /> Voltar</Button>{step === 1 ? <Button className="bg-blue-600 hover:bg-blue-700" disabled={!objectiveReady} onClick={() => setStep(2)}>Definir limites <ChevronRight className="ml-2 h-4 w-4" /></Button> : <Button className="bg-blue-600 hover:bg-blue-700" disabled={busy || envelopeBlockers.length > 0} onClick={() => void createIntent()}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Criar missão</Button>}</DialogFooter>
        </>}
      </DialogContent>
    </Dialog>
  )
}

function StepLabel({ active, done, number, label }: { active: boolean; done: boolean; number: number; label: string }) { return <span className={`border-b-2 pb-2 text-xs font-semibold ${active ? 'border-blue-600 text-blue-700' : done ? 'border-emerald-500 text-emerald-700' : 'border-slate-200 text-slate-400'}`}>{number}. {label}</span> }
function TextField({ label, value, onChange, type = 'text', placeholder }: { label: string; value: string; onChange: (value: string) => void; type?: string; placeholder?: string }) { return <label className="space-y-2"><span className="block text-xs font-semibold text-slate-700">{label}</span><input className="h-10 w-full border border-slate-300 px-3 text-sm outline-none focus:border-blue-500" type={type} min={type === 'number' ? '0' : undefined} value={value} placeholder={placeholder} onChange={event => onChange(event.target.value)} /></label> }
