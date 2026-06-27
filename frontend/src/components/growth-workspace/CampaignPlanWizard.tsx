import { useMemo, useState } from 'react'
import { ClipboardList, Sparkles } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { buildCampaignPlanStepTemplates, createCampaignPlanDraft } from '@/lib/growth-workspace/campaignPlanRules'
import type { CampaignPlan, CampaignPlanObjective } from '@/types/growthWorkspace'

interface CampaignPlanWizardProps {
  organizationId?: string
  contractId?: string
  onCreatePlan: (plan: CampaignPlan) => Promise<CampaignPlan | void> | CampaignPlan | void
}

const objectives: Array<{ key: CampaignPlanObjective; label: string; description: string }> = [
  { key: 'lead_generation', label: 'Gerar leads', description: 'Landing page, formulario, anuncio, follow-up e MROI.' },
  { key: 'whatsapp_capture', label: 'Capturar WhatsApp', description: 'Conversas, handoff e resposta rapida no centro.' },
  { key: 'offer_promotion', label: 'Promover oferta', description: 'Oferta, criativos e canais pagos/organicos.' },
  { key: 'reactivation', label: 'Reativar base', description: 'Segmento parado, mensagem e automacao de retorno.' },
  { key: 'appointment_booking', label: 'Agendar atendimento', description: 'Formulario, agenda e follow-up comercial.' },
  { key: 'service_launch', label: 'Lancamento', description: 'Campanha completa para novo servico ou produto.' },
  { key: 'remarketing', label: 'Remarketing', description: 'Publicos ja impactados e atribuicao de retorno.' },
]

export function CampaignPlanWizard({ organizationId, contractId, onCreatePlan }: CampaignPlanWizardProps) {
  const [objective, setObjective] = useState<CampaignPlanObjective>('lead_generation')
  const [name, setName] = useState('Campanha de geracao de leads')
  const [targetSegment, setTargetSegment] = useState('Leads novos e oportunidades em aberto')
  const [isSaving, setIsSaving] = useState(false)
  const templates = useMemo(() => buildCampaignPlanStepTemplates(objective), [objective])
  const canCreate = Boolean(organizationId && name.trim() && !isSaving)

  return (
    <section className="rounded-md border bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-slate-600" />
            <h2 className="font-semibold text-slate-950">Criar plano guiado</h2>
          </div>
          <p className="mt-1 text-sm text-slate-600">Comece pelo objetivo e gere um checklist completo de campanha.</p>
        </div>
        <Badge variant="secondary">{templates.length} etapas</Badge>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-7">
        {objectives.map(item => (
          <button
            key={item.key}
            type="button"
            className={`rounded-md border p-3 text-left text-sm transition ${objective === item.key ? 'border-slate-950 bg-slate-50' : 'bg-white hover:bg-slate-50'}`}
            onClick={() => setObjective(item.key)}
          >
            <span className="font-medium text-slate-950">{item.label}</span>
            <span className="mt-1 block text-xs text-slate-500">{item.description}</span>
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <label className="text-sm">
          <span className="font-medium text-slate-700">Nome da campanha</span>
          <input
            className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
            value={name}
            onChange={event => setName(event.target.value)}
          />
        </label>
        <label className="text-sm">
          <span className="font-medium text-slate-700">Segmento alvo</span>
          <input
            className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
            value={targetSegment}
            onChange={event => setTargetSegment(event.target.value)}
          />
        </label>
      </div>

      <div className="mt-4 rounded-md border bg-slate-50 p-3">
        <div className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-950">
          <ClipboardList className="h-4 w-4" />
          Checklist gerado
        </div>
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
          {templates.map(template => (
            <div key={template.key} className="rounded-md border bg-white p-2 text-xs">
              <p className="font-medium text-slate-950">{template.sortOrder}. {template.label}</p>
              <p className="mt-1 text-slate-500">{template.moduleKey}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 flex justify-end">
        <Button
          title="Criar plano guiado de campanha"
          disabled={!canCreate}
          onClick={async () => {
            if (!organizationId || !canCreate) return
            setIsSaving(true)
            try {
              await onCreatePlan(createCampaignPlanDraft({
                organizationId,
                contractId,
                name: `${name.trim()} - ${targetSegment.trim()}`,
                objective,
              }))
            } finally {
              setIsSaving(false)
            }
          }}
        >
          {isSaving ? 'Criando...' : 'Criar plano guiado'}
        </Button>
      </div>
    </section>
  )
}
