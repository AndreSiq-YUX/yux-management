import { useCallback, useEffect, useState } from 'react'
import { Bot } from 'lucide-react'
import { AssistantSettingsPanel } from '@/components/ai-assistant/AssistantSettingsPanel'
import { EmptyState, SectionCard, StatusChip } from '@/components/portal-ui'
import { aiAssistantService } from '@/services/aiAssistantService'
import { statusLabel } from '@/lib/client-portal/portalDisplay'
import type { AiAssistantSettings } from '@/types/aiAssistant'

export interface PortalAssistantConfigProps {
  organizationId?: string
  /** `omnichannel.configure` ou `platform.manage`. Sem isso, só um resumo para leitura. */
  canConfigure: boolean
}

/**
 * Configuração do agente de atendimento (objetivo, tom, regras, campos a coletar, conhecimento).
 * Quem pode configurar edita aqui; os demais veem um resumo somente leitura.
 */
export function PortalAssistantConfig({ organizationId, canConfigure }: PortalAssistantConfigProps) {
  const [assistant, setAssistant] = useState<AiAssistantSettings | null>(null)
  const [loading, setLoading] = useState(Boolean(organizationId))
  const [failed, setFailed] = useState(false)

  const loadAssistant = useCallback(async () => {
    if (!organizationId) {
      setLoading(false)
      return
    }
    try {
      setFailed(false)
      setAssistant(await aiAssistantService.getActiveAssistant(organizationId))
    } catch (error) {
      console.error('Erro ao carregar o agente de atendimento:', error)
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }, [organizationId])

  useEffect(() => { void loadAssistant() }, [loadAssistant])

  if (canConfigure && organizationId) {
    return (
      <section aria-labelledby="agente-config-title" className="space-y-3">
        <div>
          <h2 id="agente-config-title" className="font-display text-base font-semibold tracking-[-0.01em] text-yx-fg">
            Configuração do agente
          </h2>
          <p className="mt-0.5 text-[13px] text-yx-fg-3">
            Defina o objetivo, o tom, as regras e os dados que o agente coleta. As mudanças valem para as próximas conversas.
          </p>
        </div>
        <AssistantSettingsPanel variant="portal" organizationId={organizationId} assistant={assistant} onSaveAssistant={() => { void loadAssistant() }} />
      </section>
    )
  }

  return (
    <SectionCard
      id="agente-resumo"
      title="Como o agente atende"
      description="Resumo somente leitura. Quem administra a conta pode alterar esta configuração."
    >
      {loading ? (
        <p className="text-sm text-yx-fg-2">Carregando o agente...</p>
      ) : failed ? (
        <p role="alert" className="text-sm text-yx-crit">Não foi possível carregar o agente agora. Tente novamente em instantes.</p>
      ) : !assistant ? (
        <EmptyState
          icon={Bot}
          title="O agente ainda não foi configurado"
          description="Quando o agente for configurado, o objetivo, o tom e as regras de atendimento aparecem aqui. Peça a quem administra a conta para configurá-lo."
        />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display text-[15px] font-semibold text-yx-fg">{assistant.name}</h3>
            <StatusChip variant={assistant.status === 'active' ? 'ok' : 'neutral'}>{statusLabel(assistant.status)}</StatusChip>
            <StatusChip>Tom {assistant.tone}</StatusChip>
          </div>
          <SummaryList title="Objetivos" empty="Nenhum objetivo definido." items={assistant.objectives.map(item => item.label)} />
          <SummaryList title="Dados que o agente coleta" empty="Nenhum campo definido." items={assistant.requiredFields.map(item => item.label)} />
          <SummaryList
            title="Quando transfere para atendente"
            empty="Nenhuma regra de transferência definida."
            items={assistant.handoffRules.filter(rule => rule.isEnabled).map(rule => rule.name)}
          />
          <SummaryList title="Conhecimento usado" empty="Nenhum material vinculado." items={assistant.knowledgeLinks.map(item => item.title)} />
        </div>
      )}
    </SectionCard>
  )
}

function SummaryList({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <div>
      <h4 className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-yx-fg-3">{title}</h4>
      {items.length ? (
        <ul className="mt-1.5 flex list-none flex-wrap gap-1.5 p-0">
          {items.map(item => (
            <li key={item} className="rounded-full border border-yx-line-strong bg-yx-surface-2 px-2.5 py-1 text-[13px] text-yx-fg">
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-[13px] text-yx-fg-2">{empty}</p>
      )}
    </div>
  )
}
