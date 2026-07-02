import { Activity, Brain, CheckCircle2, FlaskConical, GitBranch, LockKeyhole, ScrollText, ShieldAlert, Workflow } from 'lucide-react'
import type { ReactNode } from 'react'
import type {
  AgentAutonomyPolicy,
  AgentExecutionRun,
  AgentImprovementRecommendation,
  AgentLearningSignal,
  AgentShadowExperiment,
  StrategyWorkflowSpec,
} from '@/types/strategyEngine'

function Metric({ label, value, detail }: { label: string; value: string | number; detail: string }) {
  return (
    <div className="rounded-lg border bg-white p-4">
      <div className="text-sm font-semibold text-gray-600">{label}</div>
      <div className="mt-2 text-2xl font-bold text-gray-950">{value}</div>
      <p className="mt-1 text-xs text-gray-500">{detail}</p>
    </div>
  )
}

function StatusPill({ value }: { value: string }) {
  const tone = value === 'succeeded' || value === 'active' || value === 'passed'
    ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
    : value === 'failed' || value === 'blocked'
      ? 'bg-red-50 text-red-700 ring-red-200'
      : value === 'waiting_approval' || value === 'proposed' || value === 'shadow_testing'
        ? 'bg-amber-50 text-amber-700 ring-amber-200'
        : 'bg-gray-50 text-gray-700 ring-gray-200'
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${tone}`}>{value}</span>
}

export function StrategyHarnessPanel({
  view = 'all',
  runs,
  policies,
  workflows,
  learningSignals,
  recommendations,
  experiments,
}: {
  view?: 'all' | 'traces' | 'workflows' | 'learning'
  runs: AgentExecutionRun[]
  policies: AgentAutonomyPolicy[]
  workflows: StrategyWorkflowSpec[]
  learningSignals: AgentLearningSignal[]
  recommendations: AgentImprovementRecommendation[]
  experiments: AgentShadowExperiment[]
}) {
  const waitingApproval = runs.filter(run => run.status === 'waiting_approval').length
  const failedRuns = runs.filter(run => run.status === 'failed' || run.status === 'blocked').length
  const activePolicies = policies.filter(policy => policy.status === 'active').length
  const activeWorkflows = workflows.filter(workflow => workflow.status === 'active').length
  const showTraces = view === 'all' || view === 'traces'
  const showWorkflows = view === 'all' || view === 'workflows'
  const showLearning = view === 'all' || view === 'learning'

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <Metric label="Runs" value={runs.length} detail={`${waitingApproval} aguardando aprovacao`} />
        <Metric label="Falhas" value={failedRuns} detail="Runs bloqueados ou com erro" />
        <Metric label="Policies" value={activePolicies} detail="Autonomia ativa por agente/cliente" />
        <Metric label="Workflows" value={activeWorkflows} detail="Specs LangGraph ativos" />
        <Metric label="Learning" value={learningSignals.length} detail="Sinais capturados" />
        <Metric label="Experimentos" value={experiments.length} detail="Shadow/offline registrados" />
      </div>

      {showTraces && <section className="rounded-lg border bg-white p-4">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-yux-700" aria-hidden="true" />
          <h2 className="text-base font-semibold text-gray-900">Execution Trace</h2>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="py-2 pr-3">Workflow</th>
                <th className="py-2 pr-3">Perfil</th>
                <th className="py-2 pr-3">Autonomia</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Custo</th>
                <th className="py-2 pr-3">Decisao</th>
              </tr>
            </thead>
            <tbody>
              {runs.slice(0, 12).map(run => (
                <tr key={run.id} className="border-t">
                  <td className="py-2 pr-3 font-medium text-gray-900">{run.workflowKey || run.runSource}</td>
                  <td className="py-2 pr-3 text-gray-600">{run.profileKey}</td>
                  <td className="py-2 pr-3 text-gray-600">{run.autonomyMode}</td>
                  <td className="py-2 pr-3"><StatusPill value={run.status} /></td>
                  <td className="py-2 pr-3 text-gray-600">{run.estimatedCost.toFixed(4)}</td>
                  <td className="max-w-sm truncate py-2 pr-3 text-gray-600">{run.decisionSummary || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {runs.length === 0 && <p className="rounded-md border border-dashed p-4 text-sm text-gray-500">Nenhuma execucao da harness registrada ainda.</p>}
        </div>
      </section>}

      <div className="grid gap-4 xl:grid-cols-2">
        {showWorkflows && <section className="rounded-lg border bg-white p-4">
          <div className="flex items-center gap-2">
            <LockKeyhole className="h-4 w-4 text-yux-700" aria-hidden="true" />
            <h2 className="text-base font-semibold text-gray-900">Autonomia por Agente</h2>
          </div>
          <List
            items={policies}
            empty="Nenhuma policy de autonomia cadastrada."
            render={policy => (
              <article key={policy.id} className="rounded-md border p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-gray-900">{policy.profileKey || 'global'} / {policy.channel || 'qualquer canal'}</p>
                  <StatusPill value={policy.autonomyMode} />
                </div>
                <p className="mt-1 text-xs text-gray-600">{policy.intentKey || '*'} / {policy.stageKey || '*'} / {policy.actionKey || '*'}</p>
              </article>
            )}
          />
        </section>}

        {showWorkflows && <section className="rounded-lg border bg-white p-4">
          <div className="flex items-center gap-2">
            <Workflow className="h-4 w-4 text-yux-700" aria-hidden="true" />
            <h2 className="text-base font-semibold text-gray-900">Workflows Estrategicos</h2>
          </div>
          <List
            items={workflows}
            empty="Nenhum workflow spec cadastrado."
            render={workflow => (
              <article key={workflow.id} className="rounded-md border p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-gray-900">{workflow.name}</p>
                  <StatusPill value={workflow.status} />
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-gray-600">{workflow.workflowKey} / {workflow.profileKey} / {workflow.maxSubagents} subagentes</p>
              </article>
            )}
          />
        </section>}

        {showLearning && <section className="rounded-lg border bg-white p-4">
          <div className="flex items-center gap-2">
            <Brain className="h-4 w-4 text-yux-700" aria-hidden="true" />
            <h2 className="text-base font-semibold text-gray-900">Active Learning</h2>
          </div>
          <List
            items={learningSignals}
            empty="Nenhum learning signal capturado."
            render={signal => (
              <article key={signal.id} className="rounded-md border p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-gray-900">{signal.signalType}</p>
                  <span className="text-xs text-gray-500">{Math.round(signal.confidence * 100)}%</span>
                </div>
                <p className="mt-1 text-xs text-gray-600">{signal.profileKey} / {signal.targetType} / {signal.targetId || '-'}</p>
              </article>
            )}
          />
        </section>}

        {showLearning && <section className="rounded-lg border bg-white p-4">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-yux-700" aria-hidden="true" />
            <h2 className="text-base font-semibold text-gray-900">Recommendation Queue</h2>
          </div>
          <List
            items={recommendations}
            empty="Nenhuma melhoria proposta."
            render={item => (
              <article key={item.id} className="rounded-md border p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-gray-900">{item.title}</p>
                  <StatusPill value={item.status} />
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-gray-600">{item.recommendationType} / risco {item.riskLevel}</p>
              </article>
            )}
          />
        </section>}

        {showLearning && <section className="rounded-lg border bg-white p-4 xl:col-span-2">
          <div className="flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-yux-700" aria-hidden="true" />
            <h2 className="text-base font-semibold text-gray-900">Shadow Experiments</h2>
          </div>
          <List
            items={experiments}
            empty="Nenhum experimento shadow/offline registrado."
            render={experiment => (
              <article key={experiment.id} className="grid gap-2 rounded-md border p-3 md:grid-cols-[1fr_auto_auto]">
                <div>
                  <p className="font-semibold text-gray-900">{experiment.experimentKey}</p>
                  <p className="text-xs text-gray-600">{experiment.baselineVersion} {'->'} {experiment.candidateVersion}</p>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-600">
                  <GitBranch className="h-3.5 w-3.5" aria-hidden="true" />
                  {experiment.sampleSize} amostras
                </div>
                <StatusPill value={experiment.status} />
              </article>
            )}
          />
        </section>}
      </div>

      {showLearning && <section className="rounded-lg border border-yux-100 bg-yux-50 p-4 text-sm text-yux-900">
        <div className="flex items-center gap-2 font-semibold">
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          Guardrail de aprendizado ativo
        </div>
        <p className="mt-1">
          O sistema pode propor melhorias e rodar shadow tests, mas prompts, guardrails, autonomia, cards, playbooks, modelos e ofertas so mudam em producao apos aprovacao e promocao versionada.
        </p>
      </section>}
    </div>
  )
}

function List<T extends { id: string }>({ items, empty, render }: { items: T[]; empty: string; render: (item: T) => ReactNode }) {
  if (items.length === 0) {
    return (
      <div className="mt-3 rounded-md border border-dashed p-4 text-sm text-gray-500">
        <ScrollText className="mb-2 h-4 w-4" aria-hidden="true" />
        {empty}
      </div>
    )
  }
  return <div className="mt-3 space-y-2">{items.slice(0, 8).map(render)}</div>
}
