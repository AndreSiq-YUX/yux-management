import { AlertTriangle, Bot, BrainCircuit, Database, Route, ShieldCheck, type LucideIcon } from 'lucide-react'
import type { StrategyAgentProfile, StrategyConversationAssistant, StrategyKnowledgeStats, StrategyLlmProvider, StrategyModelRoute, StrategySkill } from '@/types/strategyEngine'

function StatusTile({
  label,
  value,
  detail,
  tone = 'neutral',
  icon: Icon,
}: {
  label: string
  value: number | string
  detail: string
  tone?: 'neutral' | 'warning' | 'good'
  icon: LucideIcon
}) {
  const toneClass = tone === 'warning' ? 'border-amber-200 bg-amber-50 text-amber-800' : tone === 'good' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-gray-200 bg-white text-gray-700'
  return (
    <div className={`rounded-lg border p-4 ${toneClass}`}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">{label}</span>
        <Icon className="h-4 w-4" aria-hidden="true" />
      </div>
      <div className="mt-2 text-2xl font-bold text-gray-950">{value}</div>
      <p className="mt-1 text-xs">{detail}</p>
    </div>
  )
}

export function StrategyOverviewPanel({
  profiles,
  skills,
  providers,
  modelRoutes,
  assistants,
  knowledgeStats,
}: {
  profiles: StrategyAgentProfile[]
  skills: StrategySkill[]
  providers: StrategyLlmProvider[]
  modelRoutes: StrategyModelRoute[]
  assistants: StrategyConversationAssistant[]
  knowledgeStats: StrategyKnowledgeStats
}) {
  const configuredProviders = providers.filter(provider => provider.status === 'active').length
  const activeAssistants = assistants.filter(assistant => assistant.status === 'active').length
  const knowledgeEmpty = knowledgeStats.cards === 0 || knowledgeStats.chunks === 0
  const routesByProfile = profiles.filter(profile => modelRoutes.some(route => route.agentType === profile.profileKey)).length

  const alerts = [
    configuredProviders === 0 ? 'Nenhum provedor LLM esta ativo. Configure OpenRouter/OpenAI antes de testar respostas reais.' : null,
    activeAssistants === 0 ? 'Nenhum assistente conversacional ativo. Crie uma IA SDR, Closer, Suporte ou Retencao por organizacao.' : null,
    knowledgeEmpty ? 'Base Strategy RAG ainda sem cards/chunks. Os agentes seguem skills, mas nao recuperam conhecimento do livro.' : null,
    routesByProfile < profiles.length ? `${profiles.length - routesByProfile} perfis ainda sem rota de modelo explicita.` : null,
  ].filter(Boolean)

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatusTile label="Perfis" value={profiles.length} detail={`${skills.length} skills vinculaveis`} icon={Bot} tone="good" />
        <StatusTile label="Modelos" value={modelRoutes.length} detail={`${routesByProfile}/${profiles.length} perfis com rota`} icon={Route} tone={routesByProfile === profiles.length ? 'good' : 'warning'} />
        <StatusTile label="LLM ativos" value={`${configuredProviders}/${providers.length}`} detail="Provedores globais de IA" icon={ShieldCheck} tone={configuredProviders > 0 ? 'good' : 'warning'} />
        <StatusTile label="Assistentes" value={activeAssistants} detail={`${assistants.length} configurados no total`} icon={BrainCircuit} tone={activeAssistants > 0 ? 'good' : 'warning'} />
        <StatusTile label="RAG" value={knowledgeStats.cards} detail={`${knowledgeStats.documents} docs / ${knowledgeStats.chunks} chunks`} icon={Database} tone={knowledgeEmpty ? 'warning' : 'good'} />
      </div>

      {alerts.length > 0 && (
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-center gap-2 font-semibold text-amber-900">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            Pendencias antes de uso operacional
          </div>
          <ul className="mt-3 space-y-2 text-sm text-amber-900">
            {alerts.map(alert => <li key={alert as string}>{alert}</li>)}
          </ul>
        </section>
      )}
    </div>
  )
}
