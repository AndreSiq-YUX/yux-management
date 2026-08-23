import type { MissionMode } from '@/types/actionEngine'

export type AutonomyEnvelopeDraft = {
  mode: MissionMode
  deadline: string
  allowedModules: string[]
  maxTotalCostBrl: string
  maxHumanHours: string
  maxExternalContacts: string
}

const modes: Array<{ key: MissionMode; label: string; description: string }> = [
  { key: 'shadow', label: 'Simular', description: 'Analisa e simula todas as ações sem alterar o sistema.' },
  { key: 'prepare', label: 'Preparar', description: 'Pode criar rascunhos; demais mudanças são simuladas.' },
  { key: 'assisted', label: 'Assistido', description: 'Executa ações aprovadas e pede confirmação para efeitos externos.' },
  { key: 'autonomous', label: 'Autônomo', description: 'Age dentro do prazo e orçamento; ações destrutivas continuam exigindo aprovação.' },
]

const modules = [
  { key: 'crm', label: 'CRM' }, { key: 'automations', label: 'Automações' },
  { key: 'campaigns', label: 'Campanhas' }, { key: 'email', label: 'E-mail' },
  { key: 'omnichannel', label: 'Omnichannel' }, { key: 'reports', label: 'Relatórios' },
]

export function AutonomyEnvelopeForm({ value, onChange }: { value: AutonomyEnvelopeDraft; onChange: (value: AutonomyEnvelopeDraft) => void }) {
  const update = <K extends keyof AutonomyEnvelopeDraft>(key: K, next: AutonomyEnvelopeDraft[K]) => onChange({ ...value, [key]: next })
  const toggleModule = (key: string) => update(
    'allowedModules',
    value.allowedModules.includes(key) ? value.allowedModules.filter(item => item !== key) : [...value.allowedModules, key],
  )
  return (
    <div className="space-y-5">
      <fieldset><legend className="text-sm font-semibold text-slate-900">Quanto o agente pode fazer?</legend><div className="mt-3 grid gap-2 sm:grid-cols-2">{modes.map(mode => <label key={mode.key} className={`cursor-pointer border p-3 ${value.mode === mode.key ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-white'}`}><input className="sr-only" type="radio" name="mission-mode" value={mode.key} checked={value.mode === mode.key} onChange={() => update('mode', mode.key)} /><span className="block text-sm font-semibold text-slate-900">{mode.label}</span><span className="mt-1 block text-xs leading-5 text-slate-600">{mode.description}</span></label>)}</div></fieldset>
      <fieldset><legend className="text-sm font-semibold text-slate-900">Áreas permitidas</legend><div className="mt-3 flex flex-wrap gap-2">{modules.map(module => <label key={module.key} className={`cursor-pointer border px-3 py-2 text-xs font-semibold ${value.allowedModules.includes(module.key) ? 'border-blue-500 bg-blue-50 text-blue-800' : 'border-slate-200 text-slate-600'}`}><input className="sr-only" type="checkbox" checked={value.allowedModules.includes(module.key)} onChange={() => toggleModule(module.key)} />{module.label}</label>)}</div></fieldset>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><EnvelopeField label="Prazo" type="date" value={value.deadline} onChange={next => update('deadline', next)} /><EnvelopeField label="Custo máximo (R$)" type="number" value={value.maxTotalCostBrl} onChange={next => update('maxTotalCostBrl', next)} /><EnvelopeField label="Horas humanas" type="number" value={value.maxHumanHours} onChange={next => update('maxHumanHours', next)} /><EnvelopeField label="Contatos externos" type="number" value={value.maxExternalContacts} onChange={next => update('maxExternalContacts', next)} /></div>
    </div>
  )
}

function EnvelopeField({ label, type, value, onChange }: { label: string; type: string; value: string; onChange: (value: string) => void }) {
  return <label className="space-y-2"><span className="block text-xs font-semibold text-slate-700">{label}</span><input className="h-10 w-full border border-slate-300 bg-white px-3 text-sm outline-none focus:border-blue-500" type={type} min={type === 'number' ? '0' : undefined} value={value} onChange={event => onChange(event.target.value)} /></label>
}
