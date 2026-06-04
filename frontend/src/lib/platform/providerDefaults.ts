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
  secretReference: 'SMTP2GO_API_KEY',
  isDefault: true,
  publicConfig: {
    purpose: 'infraestrutura compartilhada de email do YUX Hub',
    subaccounts: true,
    defaultDailySendLimit: 500,
    defaultMonthlyQuota: 15000,
    requiredSecret: 'SMTP2GO_API_KEY',
    requiredWebhookSecret: 'SMTP2GO_WEBHOOK_SECRET',
    sendFunction: 'send-email',
    webhookFunction: 'smtp2go-webhook',
  },
}
