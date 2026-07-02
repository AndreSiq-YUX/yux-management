import { Link } from 'react-router-dom'
import { ArrowRight, BrainCircuit, CheckCircle2, MessageCircle, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'

const profileByModule: Record<string, { profile: string; title: string; actions: string[] }> = {
  crm: {
    profile: 'crm_controller',
    title: 'CRM Controller',
    actions: ['priorizar leads parados', 'registrar objecoes', 'definir proxima acao'],
  },
  marketing_studio: {
    profile: 'marketing_strategist',
    title: 'Marketing Strategist',
    actions: ['gerar pauta por etapa', 'quebrar objecoes', 'revisar calendario'],
  },
  omnichannel: {
    profile: 'ai_sdr_comercial_1',
    title: 'AI SDR / Conversa',
    actions: ['qualificar demanda', 'sugerir handoff', 'revisar resposta'],
  },
  reports: {
    profile: 'metrics_cash_mroi',
    title: 'Metrics & Cash',
    actions: ['diagnosticar gargalo', 'priorizar por caixa', 'comparar CAC, ticket e MROI'],
  },
}

export function StrategyContextPanel({
  organizationId,
  moduleKey,
  recordType,
  recordTitle,
  contextSummary,
}: {
  organizationId?: string
  moduleKey: string
  recordType?: string
  recordTitle?: string
  contextSummary?: string
}) {
  const config = profileByModule[moduleKey] || {
    profile: 'growth_strategist',
    title: 'Growth Strategist',
    actions: ['diagnosticar prioridade', 'gerar recomendacao', 'definir proximo passo'],
  }
  const query = new URLSearchParams({
    tab: 'strategist',
    mode: moduleKey === 'reports' ? 'diagnostic_48h' : 'general',
    module: moduleKey,
    profile: config.profile,
    ...(organizationId ? { organizationId } : {}),
    ...(recordType ? { recordType } : {}),
    ...(recordTitle ? { recordTitle } : {}),
  }).toString()

  return (
    <section className="rounded-lg border border-yux-100 bg-yux-50 p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <BrainCircuit className="mt-0.5 h-5 w-5 text-yux-700" aria-hidden="true" />
          <div>
            <p className="text-xs font-medium uppercase text-yux-700">Strategy Harness ativo</p>
            <h2 className="mt-1 text-base font-semibold text-gray-950">{config.title}</h2>
            <p className="mt-1 max-w-4xl text-sm text-gray-700">
              {contextSummary || 'Use o agente estrategico para transformar os dados deste modulo em diagnostico, proxima acao, tarefas, mensagens ou recomendações de melhoria.'}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {config.actions.map(action => (
                <span key={action} className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-1 text-xs font-medium text-gray-700 ring-1 ring-yux-100">
                  <CheckCircle2 className="h-3.5 w-3.5 text-yux-700" aria-hidden="true" />
                  {action}
                </span>
              ))}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link to="/admin/strategy-engine?tab=packs">
              <ShieldCheck className="mr-2 h-4 w-4" />
              Packs
            </Link>
          </Button>
          <Button asChild>
            <Link to={`/admin/strategy-engine?${query}`}>
              <MessageCircle className="mr-2 h-4 w-4" />
              Abrir estrategista
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  )
}
