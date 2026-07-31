import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Bot, CheckCircle2, CircleDashed, FileCheck2, Layers3, Mail, ShieldCheck, SlidersHorizontal } from 'lucide-react'
import { AdminMetricCard } from '@/components/platform/admin/AdminMetricCard'
import { adminPlatformService } from '@/services/adminPlatformService'
import { platformService } from '@/services/platformService'
import type { ClientModuleLimit, PlatformLimitStatus, PlatformUsageCounter } from '@/types/adminPlatform'
import type { ContractDetails } from '@/types/platform'

type GovernanceStatus = 'available' | 'attention' | 'planned'

interface GovernedModule {
  key: string
  label: string
  description: string
  moduleKeys: string[]
  plannedLimits: string[]
}

interface ModuleGovernanceSummary extends GovernedModule {
  activeContractCount: number
  configuredLimitCount: number
  usageCounterCount: number
  usedValue: number
  statuses: PlatformLimitStatus[]
  status: GovernanceStatus
}

const governedModules: GovernedModule[] = [
  {
    key: 'crm',
    label: 'CRM',
    description: 'Leads, funis, pipelines, usuarios comerciais e regras de governanca CRM.',
    moduleKeys: ['crm'],
    plannedLimits: ['assentos por perfil', 'pipelines ativos', 'campos e automacoes por funil'],
  },
  {
    key: 'automations',
    label: 'Automacoes',
    description: 'Execucoes, gatilhos, blueprints e integracoes operacionais por cliente.',
    moduleKeys: ['automations'],
    plannedLimits: ['execucoes mensais', 'workflows ativos', 'webhooks e retries'],
  },
  {
    key: 'finance',
    label: 'Financeiro',
    description: 'Acesso financeiro, recorrencia, cobrancas e visao de receitas por contrato.',
    moduleKeys: ['finance'],
    plannedLimits: ['usuarios financeiros', 'rotinas de cobranca', 'relatorios liberados'],
  },
  {
    key: 'support',
    label: 'Suporte',
    description: 'Tickets, filas, SLA, atendimento e governanca de suporte ao cliente.',
    moduleKeys: ['support'],
    plannedLimits: ['tickets mensais', 'filas ativas', 'SLA por contrato'],
  },
  {
    key: 'email',
    label: 'Email',
    description: 'Envios transacionais, SMTP2GO, dominios, subcontas e reputacao.',
    moduleKeys: ['email', 'smtp2go'],
    plannedLimits: ['envios diarios', 'subcontas', 'dominios verificados'],
  },
  {
    key: 'ai',
    label: 'IA',
    description: 'Consumo de IA, modelos, atendimento inteligente e limites de custo.',
    moduleKeys: ['ai', 'llm', 'whatsapp_ai'],
    plannedLimits: ['requests mensais', 'tokens', 'orcamento por modulo'],
  },
]

const statusCopy: Record<GovernanceStatus, { label: string; className: string }> = {
  available: {
    label: 'Disponivel',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  },
  attention: {
    label: 'Atencao',
    className: 'border-amber-200 bg-amber-50 text-amber-700',
  },
  planned: {
    label: 'Planejado',
    className: 'border-gray-200 bg-gray-50 text-gray-600',
  },
}

function matchesModule(module: GovernedModule, moduleKey: string) {
  return module.moduleKeys.includes(moduleKey)
}

function summarizeModule(
  module: GovernedModule,
  contracts: ContractDetails[],
  limits: ClientModuleLimit[],
  usageCounters: PlatformUsageCounter[],
): ModuleGovernanceSummary {
  const activeContractCount = contracts.filter(contract =>
    contract.status === 'active' &&
    contract.modules.some(contractModule => contractModule.enabled && matchesModule(module, contractModule.moduleKey))
  ).length
  const moduleLimits = limits.filter(limit => matchesModule(module, limit.moduleKey))
  const moduleUsageCounters = usageCounters.filter(counter => matchesModule(module, counter.moduleKey))
  const statuses = moduleUsageCounters.map(counter => counter.status)
  const hasLimitAttention = statuses.some(status => status === 'near_limit' || status === 'over_limit' || status === 'blocked')
  const status: GovernanceStatus = hasLimitAttention
    ? 'attention'
    : activeContractCount > 0 || moduleLimits.length > 0 || moduleUsageCounters.length > 0
      ? 'available'
      : 'planned'

  return {
    ...module,
    activeContractCount,
    configuredLimitCount: moduleLimits.length,
    usageCounterCount: moduleUsageCounters.length,
    usedValue: moduleUsageCounters.reduce((sum, counter) => sum + counter.usedValue, 0),
    statuses,
    status,
  }
}

function formatUsage(value: number) {
  return new Intl.NumberFormat('pt-BR').format(value)
}

export function AdminModuleGovernancePage() {
  const [contracts, setContracts] = useState<ContractDetails[]>([])
  const [limits, setLimits] = useState<ClientModuleLimit[]>([])
  const [usageCounters, setUsageCounters] = useState<PlatformUsageCounter[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    async function loadGovernance() {
      setLoading(true)
      setError(null)

      try {
        const [loadedContracts, loadedLimits, loadedUsageCounters] = await Promise.all([
          platformService.getContracts(),
          adminPlatformService.getClientModuleLimits(),
          adminPlatformService.getUsageCounters(),
        ])

        if (active) {
          setContracts(loadedContracts)
          setLimits(loadedLimits)
          setUsageCounters(loadedUsageCounters)
        }
      } catch (error) {
        console.error('Error loading module governance:', error)
        if (active) setError('Nao foi possivel carregar dados reais de governanca por modulo.')
      } finally {
        if (active) setLoading(false)
      }
    }

    loadGovernance()

    return () => {
      active = false
    }
  }, [])

  const moduleSummaries = useMemo(
    () => governedModules.map(module => summarizeModule(module, contracts, limits, usageCounters)),
    [contracts, limits, usageCounters],
  )
  const availableModules = moduleSummaries.filter(module => module.status === 'available').length
  const attentionModules = moduleSummaries.filter(module => module.status === 'attention').length
  const activeContractLinks = moduleSummaries.reduce((sum, module) => sum + module.activeContractCount, 0)
  const configuredLimits = moduleSummaries.reduce((sum, module) => sum + module.configuredLimitCount, 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Governanca por Modulo</h1>
        <p className="text-gray-600">
          Visao operacional de disponibilidade, contratos ativos, limites e consumo para CRM, Automacoes, Financeiro,
          Suporte, Email e IA.
        </p>
      </div>

      {loading && <p className="text-sm text-gray-600">Carregando governanca por modulo...</p>}

      {error && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800" role="alert">
          {error} Exibindo catalogo planejado ate os dados ficarem disponiveis.
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <AdminMetricCard
          label="Modulos disponiveis"
          value={loading ? '-' : availableModules}
          detail="Com contrato, limite ou contador real"
          icon={CheckCircle2}
        />
        <AdminMetricCard
          label="Modulos em atencao"
          value={loading ? '-' : attentionModules}
          detail="Uso proximo, acima do limite ou bloqueado"
          icon={AlertTriangle}
        />
        <AdminMetricCard
          label="Contratos vinculados"
          value={loading ? '-' : activeContractLinks}
          detail="Contratos ativos por modulo governado"
          icon={FileCheck2}
        />
        <AdminMetricCard
          label="Limites configurados"
          value={loading ? '-' : configuredLimits}
          detail="Regras em client_module_limits"
          icon={SlidersHorizontal}
        />
      </div>

      <section className="grid gap-4 lg:grid-cols-2">
        {moduleSummaries.map(module => {
          const status = statusCopy[module.status]
          const Icon = module.key === 'email' ? Mail : module.key === 'ai' ? Bot : Layers3

          return (
            <article key={module.key} className="rounded-lg border bg-white p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <span className="rounded-md bg-yux-50 p-2 text-yux-700">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div>
                    <h2 className="text-base font-semibold text-gray-900">{module.label}</h2>
                    <p className="mt-1 text-sm text-gray-600">{module.description}</p>
                  </div>
                </div>
                <span className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium ${status.className}`}>
                  {status.label}
                </span>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-md bg-gray-50 p-3">
                  <p className="text-xs font-medium text-gray-500">Contratos ativos</p>
                  <p className="mt-1 text-lg font-semibold text-gray-900">{module.activeContractCount}</p>
                </div>
                <div className="rounded-md bg-gray-50 p-3">
                  <p className="text-xs font-medium text-gray-500">Limites</p>
                  <p className="mt-1 text-lg font-semibold text-gray-900">{module.configuredLimitCount}</p>
                </div>
                <div className="rounded-md bg-gray-50 p-3">
                  <p className="text-xs font-medium text-gray-500">Uso registrado</p>
                  <p className="mt-1 text-lg font-semibold text-gray-900">{formatUsage(module.usedValue)}</p>
                </div>
              </div>

              <div className="mt-4 border-t pt-4">
                <div className="flex items-center gap-2 text-sm font-medium text-gray-800">
                  <ShieldCheck className="h-4 w-4 text-yux-700" aria-hidden="true" />
                  Limites previstos
                </div>
                <ul className="mt-3 grid gap-2 text-sm text-gray-600 sm:grid-cols-2">
                  {module.plannedLimits.map(limit => (
                    <li key={limit} className="flex gap-2">
                      <CircleDashed className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
                      <span>{limit}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </article>
          )
        })}
      </section>
    </div>
  )
}
