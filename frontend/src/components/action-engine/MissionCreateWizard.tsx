import { useMemo, useState, type ReactNode } from 'react'
import { AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, Loader2, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { actionEngineService } from '@/services/actionEngineService'
import type { ActionMission, CreateMissionInput, MissionReadiness, RevenueRecoveryParameters } from '@/types/actionEngine'

type WizardProps = { open: boolean; organizationId: string; contractId?: string; onOpenChange: (open: boolean) => void; onCreated: (mission: ActionMission) => void }

const defaults: RevenueRecoveryParameters = {
  targetRevenueBrl: '10000', deadlineDays: 30, inactiveDays: 60, canarySize: 20, maxPopulation: 100,
  maxTotalCostBrl: '1000', maxHumanHours: '10', humanHourlyRateBrl: '100', minimumValueCostRatio: '3', channels: ['human_task'],
}

export function MissionCreateWizard({ open, organizationId, contractId, onOpenChange, onCreated }: WizardProps) {
  const [step, setStep] = useState(1)
  const [title, setTitle] = useState('Recuperar receita de leads inativos')
  const [objective, setObjective] = useState('Recuperar receita com oportunidades inativas, preservando consentimento, ownership e limites operacionais.')
  const [mode, setMode] = useState<CreateMissionInput['mode']>('assisted')
  const [deadline, setDeadline] = useState(() => new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10))
  const [parameters, setParameters] = useState(defaults)
  const [readiness, setReadiness] = useState<MissionReadiness | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const deadlineAt = useMemo(() => new Date(`${deadline}T23:59:59.000Z`).toISOString(), [deadline])

  const update = (key: keyof RevenueRecoveryParameters, value: string | number) => setParameters(current => ({ ...current, [key]: value }))

  async function validateReadiness() {
    setBusy(true); setError(null)
    try {
      const report = await actionEngineService.readiness({ organizationId, contractId, targetRevenueBrl: parameters.targetRevenueBrl, deadlineAt, maxTotalCostBrl: parameters.maxTotalCostBrl, maxHumanHours: parameters.maxHumanHours, humanHourlyRateBrl: parameters.humanHourlyRateBrl ?? '100' })
      setReadiness(report); setStep(3)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível validar a prontidão.') }
    finally { setBusy(false) }
  }

  async function create() {
    if (!readiness?.ready) return
    setBusy(true); setError(null)
    try {
      const mission = await actionEngineService.createMission({ organizationId, contractId, title, objective, mode, deadlineAt, parameters })
      onCreated(mission); onOpenChange(false); setStep(1); setReadiness(null)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível criar a missão.') }
    finally { setBusy(false) }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto rounded-sm">
        <DialogHeader><div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-[#2563EB]"><ShieldCheck className="h-4 w-4" /> Revenue Recovery Pack v0</div><DialogTitle>Nova missão</DialogTitle><DialogDescription>Configure os parâmetros; a topologia protegida será compilada pelo planner.</DialogDescription></DialogHeader>
        <div className="flex gap-2 border-y border-slate-200 py-3">{['Objetivo', 'Limites', 'Prontidão'].map((label, index) => <span key={label} className={`flex-1 border-b-2 pb-2 text-xs font-semibold ${step === index + 1 ? 'border-[#2563EB] text-[#2563EB]' : step > index + 1 ? 'border-emerald-500 text-emerald-700' : 'border-slate-200 text-slate-400'}`}>{index + 1}. {label}</span>)}</div>
        {step === 1 && <div className="grid gap-5 py-2"><Field label="Título"><Input value={title} onChange={event => setTitle(event.target.value)} /></Field><Field label="Objetivo"><textarea className="min-h-28 w-full rounded-sm border border-slate-300 p-3 text-sm focus:border-blue-500 focus:outline-none" value={objective} onChange={event => setObjective(event.target.value)} /></Field><div className="grid gap-4 sm:grid-cols-2"><Field label="Modo"><select className="h-10 w-full rounded-sm border border-slate-300 bg-white px-3 text-sm" value={mode} onChange={event => setMode(event.target.value as CreateMissionInput['mode'])}><option value="assisted">Assistido</option><option value="prepare">Preparação</option><option value="shadow">Shadow</option></select></Field><Field label="Prazo"><Input type="date" value={deadline} onChange={event => setDeadline(event.target.value)} /></Field></div></div>}
        {step === 2 && <div className="grid gap-4 py-2 sm:grid-cols-2"><NumberField label="Target de receita (R$)" value={parameters.targetRevenueBrl} onChange={value => update('targetRevenueBrl', value)} /><NumberField label="Custo máximo (R$)" value={parameters.maxTotalCostBrl} onChange={value => update('maxTotalCostBrl', value)} /><NumberField label="Horas humanas máximas" value={parameters.maxHumanHours} onChange={value => update('maxHumanHours', value)} /><NumberField label="Custo humano/hora (R$)" value={parameters.humanHourlyRateBrl ?? '100'} onChange={value => update('humanHourlyRateBrl', value)} /><NumberField label="Dias de inatividade" value={String(parameters.inactiveDays)} onChange={value => update('inactiveDays', Number(value))} /><NumberField label="População máxima" value={String(parameters.maxPopulation)} onChange={value => update('maxPopulation', Number(value))} /><NumberField label="Lote canário (máx. 20)" value={String(parameters.canarySize)} onChange={value => update('canarySize', Number(value))} /><NumberField label="Razão valor/custo mínima" value={parameters.minimumValueCostRatio} onChange={value => update('minimumValueCostRatio', value)} /></div>}
        {step === 3 && <div className="space-y-2 py-2">{readiness?.checks.map(check => <div key={check.code} className={`flex gap-3 border p-3 ${check.status === 'block' ? 'border-red-200 bg-red-50' : check.status === 'warn' ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}`}>{check.status === 'pass' ? <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-700" /> : <AlertCircle className={`mt-0.5 h-4 w-4 ${check.status === 'block' ? 'text-red-600' : 'text-amber-600'}`} />}<div><p className="text-sm font-medium text-slate-900">{check.message}</p><p className="mt-1 text-[10px] uppercase tracking-wide text-slate-500">{check.code.split('_').join(' ')}</p></div></div>)}</div>}
        {error && <p className="border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <DialogFooter className="mt-2 flex-row justify-between sm:justify-between sm:space-x-0"><Button variant="outline" disabled={busy || step === 1} onClick={() => setStep(value => value - 1)}><ChevronLeft className="mr-2 h-4 w-4" /> Voltar</Button>{step === 1 ? <Button className="bg-[#2563EB] hover:bg-blue-700" disabled={!title.trim() || !objective.trim()} onClick={() => setStep(2)}>Continuar <ChevronRight className="ml-2 h-4 w-4" /></Button> : step === 2 ? <Button className="bg-[#2563EB] hover:bg-blue-700" disabled={busy} onClick={() => void validateReadiness()}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Verificar prontidão</Button> : <Button className="bg-[#2563EB] hover:bg-blue-700" disabled={busy || !readiness?.ready} onClick={() => void create()}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Criar rascunho</Button>}</DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) { return <div className="space-y-2"><Label>{label}</Label>{children}</div> }
function NumberField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <Field label={label}><Input type="number" min="0" value={value} onChange={event => onChange(event.target.value)} /></Field> }
