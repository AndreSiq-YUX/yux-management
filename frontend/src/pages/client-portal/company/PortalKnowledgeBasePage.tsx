import { BookOpen } from 'lucide-react'
import { PortalJourneyPage } from '@/components/client-portal/PortalJourneyPage'

export function PortalKnowledgeBasePage() {
  return (
    <PortalJourneyPage
      eyebrow="Empresa"
      title="Base de Conhecimento"
      description="Fonte compartilhada da empresa para IA, marketing, respostas sugeridas, campanhas, landing pages, FAQ e suporte."
      icon={BookOpen}
      metrics={[
        { label: 'Fonte', value: 'Compartilhada', detail: 'Uma base para várias áreas.' },
        { label: 'Revisão', value: 'Aprovada', detail: 'Conhecimento só alimenta IA após validação.' },
        { label: 'Uso', value: 'Multimódulo', detail: 'Atendimento, marketing, campanhas e suporte.' },
      ]}
      capabilities={[
        'Enviar documentos, cadastrar FAQs, produtos, serviços, políticas, preços e objeções.',
        'Importar site, ver páginas lidas e revisar conhecimento extraído.',
        'Aprovar conhecimento para Agente IA, respostas sugeridas e Marketing Studio.',
        'Marcar conteúdo como público ou interno e acompanhar lacunas detectadas pela IA.',
      ]}
      secondaryActions={[
        { label: 'Agente IA', href: '/portal/atendimento/agente-ia' },
        { label: 'Marketing Studio', href: '/portal/marketing/studio' },
        { label: 'Marca e Tom de Voz', href: '/portal/empresa/marca' },
      ]}
      note="A regra de produto é evitar bases duplicadas por módulo. Esta página representa a fonte única de conhecimento da empresa."
    />
  )
}
