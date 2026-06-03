import { AssistantSettingsPanel } from '@/components/ai-assistant/AssistantSettingsPanel'
import { HandoffRuleManager, type AdminHandoffRule } from './HandoffRuleManager'
import { KnowledgeManager, type AdminKnowledgeState } from './KnowledgeManager'
import { OmnichannelMetricsPanel, type AdminMetrics } from './OmnichannelMetricsPanel'
import { TeamQueueManager, type AdminQueue, type AdminTeam } from './TeamQueueManager'
import { WidgetSettingsPanel, type AdminWidgetSettings } from './WidgetSettingsPanel'
import type { AiAssistantSettings } from '@/types/aiAssistant'

interface AdminSettings {
  responseMode: string
  businessHours: string
  retentionMonths: number
  attachmentRetentionMonths: number
  anonymizeOnRetention: boolean
  crmFilters: string
  aiLogicalProvider: string
  aiModel: string
  tokenPrices: string
}

interface AdminWhatsAppProvider {
  providerAccountId?: string
  phoneNumberId?: string
  providerVerifyState: string
  tokenState: string
  lastProviderSyncAt?: string
  protectedReferences: string[]
}

export interface OmnichannelAdminTabsProps {
  organizationId: string
  profile: 'internal' | 'portal'
  teams?: AdminTeam[]
  queues?: AdminQueue[]
  rules?: AdminHandoffRule[]
  settings?: AdminSettings
  assistant?: AiAssistantSettings | null
  whatsappProvider?: AdminWhatsAppProvider
  knowledge?: AdminKnowledgeState
  widget?: AdminWidgetSettings
  metrics?: AdminMetrics
  onSaveTeam?: (teamId: string) => void
  onSaveQueue?: (queueId: string) => void
  onSaveRule?: (ruleId: string) => void
  onSaveSettings?: (organizationId: string) => void
  onSaveAssistant?: (organizationId: string) => void
  onCreateKnowledgeDraft?: (organizationId: string) => void
  onSubmitKnowledgeReview?: (entryId: string) => void
  onPublishKnowledge?: (entryId: string) => void
  onSaveWidget?: (organizationId: string) => void
  onRotateWidgetToken?: (organizationId: string) => void
}

const emptySettings: AdminSettings = {
  responseMode: 'assisted',
  businessHours: 'nao configurado',
  retentionMonths: 12,
  attachmentRetentionMonths: 12,
  anonymizeOnRetention: false,
  crmFilters: 'sem filtros',
  aiLogicalProvider: 'logico',
  aiModel: 'nao definido',
  tokenPrices: 'nao definido',
}

const emptyKnowledge: AdminKnowledgeState = { drafts: [], publications: [] }
const emptyWidget: AdminWidgetSettings = {
  name: 'Widget',
  isActive: false,
  branding: 'padrao',
  consentText: 'nao configurado',
  initialForm: 'nao configurado',
  allowedOrigins: [],
  embedSnippet: '<script src="/yux-webchat.js"></script>',
}
const emptyMetrics: AdminMetrics = { volume: 0, slaRate: 0, handoffCount: 0, channelMix: {} }
const emptyWhatsAppProvider: AdminWhatsAppProvider = {
  providerVerifyState: 'not_configured',
  tokenState: 'not_configured',
  protectedReferences: [],
}

export function OmnichannelAdminTabs({
  organizationId,
  profile,
  teams = [],
  queues = [],
  rules = [],
  settings = emptySettings,
  assistant,
  whatsappProvider = emptyWhatsAppProvider,
  knowledge = emptyKnowledge,
  widget = emptyWidget,
  metrics = emptyMetrics,
  onSaveTeam,
  onSaveQueue,
  onSaveRule,
  onSaveSettings,
  onSaveAssistant,
  onCreateKnowledgeDraft,
  onSubmitKnowledgeReview,
  onPublishKnowledge,
  onSaveWidget,
  onRotateWidgetToken,
}: OmnichannelAdminTabsProps) {
  return (
    <section className="space-y-5">
      <nav className="flex flex-wrap gap-2 text-xs">
        {['Inbox', 'Equipes e filas', 'Regras de handoff', 'Assistente IA', 'Provider WhatsApp', 'Base de conhecimento', 'Webchat', 'Metricas'].map(tab => (
          <span key={tab} className="rounded-md border bg-white px-3 py-2 font-medium text-gray-700">{tab}</span>
        ))}
        {profile === 'internal' && <span className="rounded-md border bg-white px-3 py-2 font-medium text-gray-700">Logs e simulador</span>}
      </nav>
      <TeamQueueManager teams={teams} queues={queues} onSaveTeam={onSaveTeam} onSaveQueue={onSaveQueue} />
      <HandoffRuleManager rules={rules} onSaveRule={onSaveRule} />
      <SettingsPanel organizationId={organizationId} settings={settings} onSaveSettings={onSaveSettings} />
      <AssistantSettingsPanel organizationId={organizationId} assistant={assistant} onSaveAssistant={onSaveAssistant} />
      <WhatsAppProviderPanel organizationId={organizationId} provider={whatsappProvider} onSaveSettings={onSaveSettings} />
      <KnowledgeManager
        organizationId={organizationId}
        knowledge={knowledge}
        onCreateKnowledgeDraft={onCreateKnowledgeDraft}
        onSubmitKnowledgeReview={onSubmitKnowledgeReview}
        onPublishKnowledge={onPublishKnowledge}
      />
      <WidgetSettingsPanel organizationId={organizationId} widget={widget} onSaveWidget={onSaveWidget} onRotateWidgetToken={onRotateWidgetToken} />
      <OmnichannelMetricsPanel metrics={metrics} profile={profile} />
    </section>
  )
}

function WhatsAppProviderPanel({
  organizationId,
  provider,
  onSaveSettings,
}: {
  organizationId: string
  provider: AdminWhatsAppProvider
  onSaveSettings?: (organizationId: string) => void
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-gray-900">Provider WhatsApp</h2>
        <button type="button" title="Salvar provider WhatsApp" className="rounded-md bg-yux-600 px-3 py-2 text-sm font-medium text-white" onClick={() => onSaveSettings?.(organizationId)}>Salvar</button>
      </div>
      <div className="grid gap-3 rounded-md border bg-white p-3 text-sm md:grid-cols-3">
        <p>Conta {provider.providerAccountId || 'n/a'}</p>
        <p>Telefone ID {provider.phoneNumberId || 'n/a'}</p>
        <p>Webhook {provider.providerVerifyState}</p>
        <p>Token {provider.tokenState}</p>
        <p>Ultimo sync {provider.lastProviderSyncAt ? new Date(provider.lastProviderSyncAt).toLocaleString('pt-BR') : 'n/a'}</p>
        <p>Referencias protegidas {provider.protectedReferences.length ? provider.protectedReferences.join(', ') : 'sem referencias'}</p>
      </div>
    </section>
  )
}

function SettingsPanel({
  organizationId,
  settings,
  onSaveSettings,
}: {
  organizationId: string
  settings: AdminSettings
  onSaveSettings?: (organizationId: string) => void
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-gray-900">Configuracoes</h2>
        <button type="button" title="Salvar configuracoes" className="rounded-md bg-yux-600 px-3 py-2 text-sm font-medium text-white" onClick={() => onSaveSettings?.(organizationId)}>Salvar</button>
      </div>
      <div className="grid gap-3 rounded-md border bg-white p-3 text-sm md:grid-cols-3">
        <p>Modo {settings.responseMode}</p>
        <p>Horario {settings.businessHours}</p>
        <p>Retencao {settings.retentionMonths} meses</p>
        <p>Anexos {settings.attachmentRetentionMonths} meses</p>
        <p>{settings.anonymizeOnRetention ? 'Anonymizacao ativa' : 'Anonymizacao inativa'}</p>
        <p>CRM {settings.crmFilters}</p>
        <p>Provider {settings.aiLogicalProvider}</p>
        <p>Modelo {settings.aiModel}</p>
        <p>Token prices {settings.tokenPrices}</p>
      </div>
    </section>
  )
}
