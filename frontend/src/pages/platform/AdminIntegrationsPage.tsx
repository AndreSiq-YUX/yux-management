import { useEffect, useState } from 'react'
import { ProviderConnectionEditor } from '@/components/platform/admin/ProviderConnectionEditor'
import { ProviderConnectionPanel } from '@/components/platform/admin/ProviderConnectionPanel'
import {
  jinaAiProviderDefaults,
  openAiDirectFallbackDefaults,
  openRouterDefaults,
  smtp2GoProviderDefaults,
} from '@/lib/platform/providerDefaults'
import { adminPlatformService } from '@/services/adminPlatformService'
import type { PlatformProviderConnection } from '@/types/adminPlatform'

export function AdminIntegrationsPage() {
  const [providers, setProviders] = useState<PlatformProviderConnection[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function loadProviders(active = true) {
    setLoading(true)
    setError(null)

    try {
      const result = await adminPlatformService.getProviderConnections()
      if (active) setProviders(result)
    } catch (error) {
      console.error('Error loading platform provider connections:', error)
      if (active) setError('Nao foi possivel carregar as integracoes globais.')
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
  const smtpProvider = providers.find(provider => provider.providerKey === 'smtp2go')
  const jinaProvider = providers.find(provider => provider.providerKey === 'jina_ai')
  const fallbackProviders = providers.filter(provider => provider.providerType === 'llm' && provider.providerKey !== 'openrouter')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Integracoes globais</h1>
        <p className="text-gray-600">
          Configure provedores compartilhados do YUX Hub para IA, email, automacoes e demais servicos.
        </p>
      </div>

      <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
        Esta area salva configuracoes operacionais e identificadores internos. Provedores como SMTP2GO devem ser
        conectados pelo fluxo seguro do Admin, com credenciais criptografadas no backend da VPS.
      </div>

      {loading && <p className="text-sm text-gray-600">Carregando integracoes globais...</p>}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          {error}
        </div>
      )}

      {!loading && !error && (
        <div className="grid gap-4 xl:grid-cols-2">
          <ProviderConnectionEditor
            title="OpenRouter principal"
            description="Modelo principal, lista de fallback dentro do OpenRouter e fallback externo para OpenAI direto."
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
            description="Fallback externo quando o OpenRouter inteiro estiver fora, sem substituir o roteador principal."
            provider={openAiProvider}
            defaults={openAiDirectFallbackDefaults}
            onSave={async input => {
              await adminPlatformService.upsertProviderConnection(input)
              await loadProviders()
            }}
          />
          <ProviderConnectionEditor
            title="Jina AI - Reader/Search/Grounding"
            description="Leitura limpa, busca e grounding controlados para Radar e agentes do Marketing Studio."
            provider={jinaProvider}
            defaults={jinaAiProviderDefaults}
            onSave={async input => {
              await adminPlatformService.upsertProviderConnection(input)
              await loadProviders()
            }}
          />
          <div className="xl:col-span-2">
            <ProviderConnectionEditor
              title="SMTP2GO global"
              description="Conta master, subcontas, dominios, webhooks e envios transacionais/operacionais."
              provider={smtpProvider}
              defaults={smtp2GoProviderDefaults}
              onSave={async input => {
                await adminPlatformService.upsertProviderConnection(input)
                await loadProviders()
              }}
              onTest={async providerId => {
                const result = await adminPlatformService.testProviderConnection(providerId)
                await loadProviders()
                return result
              }}
              onSaveCredential={async (providerId, apiKey) => {
                const result = await adminPlatformService.saveProviderCredential(providerId, apiKey)
                await loadProviders()
                return result
              }}
            />
          </div>
        </div>
      )}

      {!loading && !error && providers.length > 0 && (
        <ProviderConnectionPanel providers={providers} />
      )}
    </div>
  )
}
