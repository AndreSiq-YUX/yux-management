import { Palette } from 'lucide-react'
import { PortalJourneyPage } from '@/components/client-portal/PortalJourneyPage'

export function PortalBrandVoicePage() {
  return (
    <PortalJourneyPage
      eyebrow="Empresa"
      title="Marca e Tom de Voz"
      description="Define como a empresa se comunica em atendimento, conteúdo, campanhas e materiais comerciais."
      icon={Palette}
      metrics={[
        { label: 'Tom', value: 'Marca', detail: 'Formalidade, estilo e linguagem.' },
        { label: 'Regras', value: 'Guardrails', detail: 'Promessas, restrições e temas proibidos.' },
        { label: 'Assets', value: 'Visual', detail: 'Materiais e referências da marca.' },
      ]}
      capabilities={[
        'Tom da marca, nível de formalidade, uso de emojis e exemplos de comunicação.',
        'Palavras proibidas, temas proibidos, promessas permitidas e restrições legais.',
        'Personas, estilo visual, assets da marca e orientações para campanhas.',
        'Diretrizes usadas por Agente IA, Marketing Studio, criativos e respostas sugeridas.',
      ]}
      secondaryActions={[
        { label: 'Base de Conhecimento', href: '/portal/empresa/conhecimento' },
        { label: 'Conteúdo Orgânico', href: '/portal/marketing/conteudo' },
        { label: 'Criativos e Assets', href: '/portal/marketing/criativos' },
      ]}
    />
  )
}
