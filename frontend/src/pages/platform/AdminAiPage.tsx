import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Bot, BrainCircuit, Building2, DollarSign, Layers3, ServerCog, ShieldCheck } from 'lucide-react'
import { AdminMetricCard } from '@/components/platform/admin/AdminMetricCard'
import { ProviderConnectionEditor } from '@/components/platform/admin/ProviderConnectionEditor'
import { ProviderConnectionPanel } from '@/components/platform/admin/ProviderConnectionPanel'
import { isProviderFailing } from '@/lib/platform/adminRules'
import { openAiDirectFallbackDefaults, openRouterDefaults } from '@/lib/platform/providerDefaults'
import { adminPlatformService } from '@/services/adminPlatformService'
import type { PlatformProviderConnection } from '@/types/adminPlatform'

const governanceSections = [
  {
    title: 'Modelos globais',
    description: 'Catalogo de modelos aprovados para automacoes, atendimento e analises internas.',
    items: ['Modelo padrao por caso de uso', 'Politica de fallback entre provedores', 'Janela de revisao de versoes'],
    icon: BrainCircuit,
  },
  {
    title: 'Uso por modulo',
    description: 'Leitura operacional para comparar consumo de IA entre CRM, Automacoes, Suporte e Omnichannel.',
    items: ['Requests e tokens por modulo', 'Limites comerciais aplicaveis', 'Alertas de uso anormal'],
    icon: Layers3,
  },
  {
    title: 'Overrides por cliente',
    description: 'Governanca de excecoes por organizacao sem expor segredos ou chaves de provedor no frontend.',
    items: ['Heranca do provedor global', 'Modelo permitido por contrato', 'Limites manuais auditaveis'],
    icon: Building2,
  },
  {
    title: 'Custos e falhas',
    description: 'Base para acompanhar custo estimado, indisponibilidade e degradacao dos provedores LLM.',
    items: ['Falhas recentes por provedor', 'Custo por modulo e cliente', 'Eventos de fallback'],
    icon: DollarSign,
  },
]

export function AdminAiPage() {
  const [providers, setProviders] = useState<PlatformProviderConnection[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function loadProviders(active = true) {
    setLoading(true)
    setError(null)

    try {
      const result = await adminPlatformService.getProviderConnections()
      if (active) {
        setProviders(result.filter(provider => provider.providerType === 'llm'))
      }
    } catch (error) {
      console.error('Error loading LLM administration:', error)
      if (active) setError('Nao foi possivel carregar a administracao de IA/LLM.')
    } finally {
      if (active) setLoading(false)
    }
  }

  useEffect(() => {
    let active = true
    loadProviders()

    return () => {
      active = false
    }
  }, [])

  const openRouterProvider = providers.find(provider => provider.providerKey === 'openrouter')
  const openAiProvider = providers.find(provider => provider.providerKey === 'openai_direct')
  const fallbackProviders = providers.filter(provider => provider.providerKey !== 'openrouter')
  const activeProviders = providers.filter(provider => provider.status === 'active').length
  const defaultProviders = providers.filter(provider => provider.isDefault).length
  const failingProviders = providers.filter(provider => isProviderFailing(provider.status)).length

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">IA/LLM</h1>
          <p className="text-gray-600">
            Governanca central de provedores LLM, modelos, consumo, overrides por cliente, custos e falhas.
          </p>
        </div>
        <Link
          to="/admin/integrations"
          className="inline-flex items-center justify-center rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Ver integracoes
        </Link>
      </div>

      <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
        OpenRouter e OpenAI direto usam secrets server-side. Configure aqui os modelos, fallback e nomes de secrets; cadastre os
        valores reais como <span className="font-mono">OPENROUTER_API_KEY</span> e <span className="font-mono">OPENAI_API_KEY</span>.
      </div>

      {loading && <p className="text-sm text-gray-600">Carregando administracao de IA/LLM...</p>}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          {error}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <AdminMetricCard
          label="Provedores LLM"
          value={loading ? '-' : providers.length}
          detail="Conexoes globais filtradas por IA"
          icon={Bot}
        />
        <AdminMetricCard
          label="Ativos"
          value={loading ? '-' : activeProviders}
          detail="Prontos para uso operacional"
          icon={ShieldCheck}
        />
        <AdminMetricCard
          label="Padroes"
          value={loading ? '-' : defaultProviders}
          detail="Marcados como provedor padrao"
          icon={ServerCog}
        />
        <AdminMetricCard
          label="Atencao"
          value={loading ? '-' : failingProviders}
          detail="Degradados, falhando, stale ou reauth"
          icon={AlertTriangle}
        />
      </div>

      {!loading && !error && (
        <section className="grid gap-4 xl:grid-cols-2">
          <ProviderConnectionEditor
            title="OpenRouter principal"
            description="Define modelo principal, fallbackModels do OpenRouter e provedor externo caso o roteador falhe."
            provider={openRouterProvider}
            defaults={{
              ...openRouterDefaults,
              fallbackProviderId: openRouterProvider?.fallbackProviderId || openAiProvider?.id || null,
            }}
            fallbackProviders={fallbackProviders}
            onSave={async input => {
              await adminPlatformService.upsertProviderConnection(input)
              await loadProviders()
            }}
          />
          <ProviderConnectionEditor
            title="OpenAI direto"
            description="Fallback externo aprovado para indisponibilidade total do OpenRouter."
            provider={openAiProvider}
            defaults={openAiDirectFallbackDefaults}
            onSave={async input => {
              await adminPlatformService.upsertProviderConnection(input)
              await loadProviders()
            }}
          />
        </section>
      )}

      {!loading && !error && (
        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Provedores LLM</h2>
            <p className="text-sm text-gray-600">
              Lista derivada das integracoes globais com filtro para provedores de linguagem.
            </p>
          </div>

          {providers.length === 0 ? (
            <div className="rounded-lg border border-dashed bg-white p-6 text-sm text-gray-500">
              Nenhum provedor LLM configurado. Cadastre a conexao global em Integracoes antes de liberar IA para clientes.
            </div>
          ) : (
            <ProviderConnectionPanel providers={providers} />
          )}
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {governanceSections.map(section => {
          const Icon = section.icon

          return (
            <section key={section.title} className="rounded-lg border bg-white p-4">
              <div className="flex items-start gap-3">
                <span className="rounded-md bg-yux-50 p-2 text-yux-700">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <h2 className="text-base font-semibold text-gray-900">{section.title}</h2>
                  <p className="mt-1 text-sm text-gray-600">{section.description}</p>
                </div>
              </div>
              <ul className="mt-4 space-y-2 text-sm text-gray-600">
                {section.items.map(item => (
                  <li key={item} className="flex gap-2">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-yux-600" aria-hidden="true" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </section>
          )
        })}
      </div>
    </div>
  )
}
