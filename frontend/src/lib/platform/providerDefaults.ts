import type { PlatformProviderConnectionInput } from '@/services/adminPlatformService'

export const openAiDirectFallbackDefaults: PlatformProviderConnectionInput = {
  providerType: 'llm',
  providerKey: 'openai_direct',
  displayName: 'OpenAI direto',
  environment: 'production',
  status: 'not_configured',
  secretReference: 'OPENAI_API_KEY',
  isDefault: false,
  publicConfig: {
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4.1-mini',
    purpose: 'fallback externo quando o OpenRouter estiver indisponivel',
    managedBy: 'YUX Hub Admin',
    requiredSecret: 'OPENAI_API_KEY',
  },
}

export const openRouterDefaults: PlatformProviderConnectionInput = {
  providerType: 'llm',
  providerKey: 'openrouter',
  displayName: 'OpenRouter',
  environment: 'production',
  status: 'not_configured',
  secretReference: 'OPENROUTER_API_KEY',
  isDefault: true,
  publicConfig: {
    baseUrl: 'https://openrouter.ai/api/v1',
    chatCompletionsPath: '/chat/completions',
    primaryModel: 'openai/gpt-4.1-mini',
    fallbackModels: ['anthropic/claude-sonnet-4', 'google/gemini-2.5-flash'],
    providerRouting: {
      allowFallbacks: true,
      sort: 'throughput',
    },
    externalFallbackProviderKey: 'openai_direct',
    managedBy: 'YUX Hub Admin',
    requiredSecret: 'OPENROUTER_API_KEY',
  },
}

export const smtp2GoProviderDefaults: PlatformProviderConnectionInput = {
  providerType: 'email',
  providerKey: 'smtp2go',
  displayName: 'SMTP2GO',
  environment: 'production',
  status: 'not_configured',
  secretReference: 'smtp2go:master',
  isDefault: true,
  publicConfig: {
    purpose: 'infraestrutura compartilhada de email do YUX Hub',
    subaccounts: true,
    defaultDailySendLimit: 500,
    defaultMonthlyQuota: 15000,
    credentialSource: 'admin_encrypted',
    masterCredentialReference: 'smtp2go:master',
    webhookSecretReference: 'smtp2go:webhook',
    provisioningMode: 'automatic',
    clientIsolation: 'smtp2go_subaccount',
    backendSendJob: 'email.send',
    sendEndpoint: '/api/email/send',
    webhookEndpoint: '/api/email/smtp2go-webhook',
    requiredApiPermissions: [
      'emails',
      'subaccounts',
      'sender_domains',
      'webhooks',
      'suppressions',
      'statistics',
      'activity',
      'api_keys',
      'smtp_users',
    ],
  },
}

export const jinaAiProviderDefaults: PlatformProviderConnectionInput = {
  providerType: 'internal_service',
  providerKey: 'jina_ai',
  displayName: 'Jina AI',
  environment: 'production',
  status: 'not_configured',
  secretReference: 'JINA_API_KEY',
  isDefault: true,
  publicConfig: {
    baseUrl: 'https://api.jina.ai/v1',
    readerBaseUrl: 'https://r.jina.ai',
    searchBaseUrl: 'https://s.jina.ai',
    readerTool: 'jina_reader',
    searchTool: 'jina_search',
    groundingTool: 'jina_grounding',
    purpose: 'leitura, busca e grounding controlados para Marketing Studio',
    managedBy: 'YUX Hub Admin',
    requiredSecret: 'JINA_API_KEY',
  },
}
