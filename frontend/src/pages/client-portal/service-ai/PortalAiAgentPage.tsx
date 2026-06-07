import { Bot } from 'lucide-react'
import { PortalJourneyPage } from '@/components/client-portal/PortalJourneyPage'

export function PortalAiAgentPage() {
  return (
    <PortalJourneyPage
      eyebrow="Atendimento & IA"
      title="Agente IA"
      description="Configuração e acompanhamento do agente que responde clientes, sugere respostas e aciona handoff humano."
      icon={Bot}
      metrics={[
        { label: 'Operação', value: 'Assistida', detail: 'IA com supervisão e handoff.' },
        { label: 'Fontes', value: 'Base', detail: 'Usa conhecimento aprovado da empresa.' },
        { label: 'Qualidade', value: 'Confiança', detail: 'Histórico e perguntas sem resposta.' },
      ]}
      capabilities={[
        'Ver status do agente, objetivos, tom de voz, regras e campos a coletar.',
        'Testar o agente antes de publicar mudanças.',
        'Consultar fontes usadas, confiança, histórico de respostas e perguntas sem resposta.',
        'Adicionar conhecimento ou treinar pelo site usando a Base de Conhecimento da empresa.',
      ]}
      primaryAction={{ label: 'Abrir Base de Conhecimento', href: '/portal/empresa/conhecimento' }}
      secondaryActions={[
        { label: 'Conversas', href: '/portal/atendimento/conversas' },
        { label: 'Filas e Handoff', href: '/portal/atendimento/filas-handoff' },
        { label: 'Marca e Tom de Voz', href: '/portal/empresa/marca' },
      ]}
    />
  )
}
