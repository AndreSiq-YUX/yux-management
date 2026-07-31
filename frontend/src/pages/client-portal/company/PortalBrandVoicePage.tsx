import { Palette } from 'lucide-react'
import { PortalJourneyPage } from '@/components/client-portal/PortalJourneyPage'
import { BrandReadinessPanel } from '@/components/growth-workspace/BrandReadinessPanel'
import { usePortalMarketingContext } from '@/hooks/usePortalMarketingContext'

export function PortalBrandVoicePage() {
  const {
    loading,
    error,
    brandProfile,
    knowledgeDocuments,
    productsServices,
    settings,
    brandReadiness,
  } = usePortalMarketingContext()

  const tone = brandProfile?.toneOfVoice || settings?.toneOfVoice || 'Nao configurado'
  const persona = brandProfile?.persona || settings?.persona || 'Nao configurada'
  const forbiddenTopics = brandProfile?.forbiddenTopics?.length
    ? brandProfile.forbiddenTopics
    : settings?.forbiddenTopics || []
  const priorityTopics = brandProfile?.priorityTopics?.length
    ? brandProfile.priorityTopics
    : settings?.priorityTopics || []
  const brandReadinessProfile = brandProfile || (settings ? {
    toneOfVoice: settings.toneOfVoice || '',
    persona: settings.persona || '',
    brandVoiceSummary: settings.toneOfVoice || '',
    forbiddenTopics: settings.forbiddenTopics || [],
    priorityTopics: settings.priorityTopics || [],
    visualGuidelines: settings.visualPreferences,
    status: 'active' as const,
  } : null)

  return (
    <PortalJourneyPage
      eyebrow="Empresa"
      title="Central da Marca"
      description="Organiza identidade, tom de voz, guardrails e ativos usados por IA, atendimento, campanhas, landing pages e conteudos."
      icon={Palette}
      metrics={[
        { label: 'Prontidao', value: `${brandReadiness.percentage}%`, detail: `${brandReadiness.ready}/${brandReadiness.total} criterios atendidos.` },
        { label: 'Tom', value: brandProfile ? 'Configurado' : 'Pendente', detail: tone },
        { label: 'Persona', value: persona === 'Nao configurada' ? 'Pendente' : 'Definida', detail: persona },
        { label: 'Regras', value: String(forbiddenTopics.length), detail: 'Temas restritos para IA e marketing.' },
      ]}
      capabilities={[
        'Tom da marca, nivel de formalidade, uso de emojis e exemplos de comunicacao.',
        'Palavras proibidas, temas proibidos, promessas permitidas e restricoes legais.',
        'Personas, estilo visual, assets da marca e orientacoes para campanhas.',
        'Diretrizes usadas por Agente IA, Marketing Studio, criativos e respostas sugeridas.',
      ]}
      secondaryActions={[
        { label: 'Base de Conhecimento', href: '/portal/empresa/conhecimento' },
        { label: 'Central de Conteudo', href: '/portal/marketing/conteudo' },
        { label: 'Criativos e Inspiracoes', href: '/portal/marketing/criativos' },
      ]}
    >
      <BrandReadinessPanel
        profile={brandReadinessProfile}
        knowledgeDocuments={knowledgeDocuments}
        productsServices={productsServices}
        title="Prontidao para usar a marca no Studio"
      />

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-lg border bg-white p-5">
          <h2 className="text-base font-semibold text-gray-900">Diretrizes carregadas</h2>
          {loading ? (
            <p className="mt-3 text-sm text-gray-600">Carregando marca...</p>
          ) : error ? (
            <p className="mt-3 text-sm text-red-600">{error}</p>
          ) : (
            <div className="mt-4 space-y-4 text-sm">
              <div>
                <p className="font-medium text-gray-900">Resumo de voz</p>
                <p className="mt-1 text-gray-600">{brandProfile?.brandVoiceSummary || 'Resumo ainda nao cadastrado.'}</p>
              </div>
              <div>
                <p className="font-medium text-gray-900">Preferencias visuais</p>
                <p className="mt-1 text-gray-600">{brandProfile?.visualGuidelines || settings?.visualPreferences || 'Preferencias visuais ainda nao cadastradas.'}</p>
              </div>
            </div>
          )}
        </article>

        <article className="rounded-lg border bg-white p-5">
          <h2 className="text-base font-semibold text-gray-900">Guardrails da marca</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <p className="text-sm font-medium text-gray-900">Usar</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {(brandProfile?.vocabularyDo || priorityTopics).slice(0, 8).map(item => (
                  <span key={item} className="rounded-full bg-emerald-50 px-2 py-1 text-xs text-emerald-700">{item}</span>
                ))}
                {!(brandProfile?.vocabularyDo?.length || priorityTopics.length) && <p className="text-sm text-gray-600">Sem palavras ou temas prioritarios.</p>}
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">Evitar</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {(brandProfile?.vocabularyDont || forbiddenTopics).slice(0, 8).map(item => (
                  <span key={item} className="rounded-full bg-rose-50 px-2 py-1 text-xs text-rose-700">{item}</span>
                ))}
                {!(brandProfile?.vocabularyDont?.length || forbiddenTopics.length) && <p className="text-sm text-gray-600">Sem restricoes cadastradas.</p>}
              </div>
            </div>
          </div>
        </article>
      </section>
    </PortalJourneyPage>
  )
}
