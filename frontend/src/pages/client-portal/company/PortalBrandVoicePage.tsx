import { useCallback, useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { PortalPage } from '@/components/client-portal/PortalPage'
import { BrandVoiceForm } from '@/components/company-intelligence/BrandVoiceForm'
import { editableBrand } from '@/components/company-intelligence/brandProfileDraft'
import { ErrorState, SectionCard, SkeletonCard, StatusChip } from '@/components/portal-ui'
import { usePortalMarketingContext } from '@/hooks/usePortalMarketingContext'
import { summarizeBrandReadiness, type BrandReadinessCheck } from '@/lib/marketing-studio/marketingStudioRules'
import { companyIntelligenceService } from '@/services/companyIntelligenceService'
import { usePlatformStore } from '@/stores/platformStore'
import type { CompanyBrandProfile, CompanyBrandProfileInput } from '@/types/companyIntelligence'

const READINESS_COPY: Record<BrandReadinessCheck['key'], { label: string; detail: string }> = {
  logo: { label: 'Logo ou kit visual', detail: 'Usado em criativos, páginas e peças de campanha.' },
  colors: { label: 'Cores da marca', detail: 'Mantém as peças com a cara da sua empresa.' },
  tone: { label: 'Tom de voz e público', detail: 'Orienta textos, respostas sugeridas e o agente de IA.' },
  products: { label: 'Produtos ou serviços', detail: 'Define o que pode ser apresentado e vendido.' },
  restrictions: { label: 'Palavras e temas a evitar', detail: 'Reduz o risco de promessas indevidas.' },
  promises: { label: 'Promessas e restrições legais', detail: 'Ajuda a bloquear afirmações sensíveis antes de publicar.' },
  site: { label: 'Site lido pela YUX', detail: 'Mantém a base alinhada com o que você publica.' },
  social: { label: 'Redes sociais conectadas ou dispensadas', detail: 'Permite usar o que já foi aprovado nas redes.' },
}

export function PortalBrandVoicePage() {
  const organization = usePlatformStore(state => state.organization)
  const activeContract = usePlatformStore(state => state.activeContract)
  const {
    error,
    brandProfile,
    knowledgeDocuments,
    productsServices,
    settings,
  } = usePortalMarketingContext({ resources: ['brandProfile', 'knowledgeDocuments', 'productsServices', 'settings'] })
  const [editableProfile, setEditableProfile] = useState<CompanyBrandProfile | null>(null)
  const [brandLoading, setBrandLoading] = useState(false)
  const [brandFailed, setBrandFailed] = useState(false)
  const [saving, setSaving] = useState(false)

  const loadBrand = useCallback(() => {
    if (!organization?.id) return
    setBrandLoading(true)
    setBrandFailed(false)
    companyIntelligenceService.getBrand(organization.id)
      .then(setEditableProfile)
      .catch(failure => {
        console.error(failure)
        setBrandFailed(true)
        toast.error('Não foi possível carregar as diretrizes da marca.')
      })
      .finally(() => setBrandLoading(false))
  }, [organization?.id])

  useEffect(() => { loadBrand() }, [loadBrand])

  const formProfile = useMemo(
    () => editableBrand(editableProfile, activeContract?.id),
    [editableProfile, activeContract?.id],
  )

  const saveBrand = async (input: CompanyBrandProfileInput) => {
    if (!organization?.id) return
    setSaving(true)
    try {
      const saved = await companyIntelligenceService.updateBrand(organization.id, input)
      setEditableProfile(saved)
      toast.success('Marca, tom de voz e regras de uso salvos.')
    } catch (failure) {
      console.error(failure)
      toast.error('Não foi possível salvar as diretrizes da marca.')
      throw failure
    } finally {
      setSaving(false)
    }
  }

  const displayedProfile = editableProfile || brandProfile
  const avoidCount = new Set([
    ...(displayedProfile?.forbiddenTopics?.length ? displayedProfile.forbiddenTopics : settings?.forbiddenTopics || []),
    ...(displayedProfile?.vocabularyDont || []),
  ]).size
  const colorCount = displayedProfile?.visualIdentity?.colors?.filter(color => color.trim()).length ?? 0
  const readinessProfile = displayedProfile || (settings ? {
    toneOfVoice: settings.toneOfVoice || '',
    persona: settings.persona || '',
    brandVoiceSummary: settings.toneOfVoice || '',
    forbiddenTopics: settings.forbiddenTopics || [],
    priorityTopics: settings.priorityTopics || [],
    visualGuidelines: settings.visualPreferences,
    status: 'active' as const,
  } : null)
  const readiness = summarizeBrandReadiness(readinessProfile, knowledgeDocuments, productsServices)

  return (
    <PortalPage
      eyebrow="Empresa"
      title="Marca e tom de voz"
      description="Como a sua empresa se apresenta e fala: identidade visual, tom de voz e o que usar ou evitar em textos, campanhas e conversas."
      metrics={[
        { label: 'Prontidão da marca', value: `${readiness.percentage}%`, detail: `${readiness.ready} de ${readiness.total} itens atendidos.` },
        { label: 'Cores da paleta', value: String(colorCount) },
        { label: 'Itens a evitar', value: String(avoidCount), detail: 'Palavras, promessas e assuntos.' },
      ]}
      help={[
        'Tom de voz, público e um resumo de como a marca fala.',
        'Palavras e temas recomendados, e o que nunca deve ser dito ou prometido.',
        'Logo, cores, fontes e estilo visual usados em criativos e páginas.',
        'Tudo o que você salvar aqui orienta o agente de IA, o Marketing Studio e as respostas sugeridas.',
      ]}
      related={[
        { label: 'Base de conhecimento', href: '/portal/empresa/conhecimento' },
        { label: 'Central de conteúdo', href: '/portal/marketing/conteudo' },
        { label: 'Criativos e inspirações', href: '/portal/marketing/criativos' },
      ]}
    >
      {error ? <ErrorState title="Não foi possível carregar parte dos dados da marca." description={error} /> : null}
      {brandLoading ? (
        <SkeletonCard lines={6} />
      ) : brandFailed ? (
        <ErrorState title="Não foi possível carregar a marca." description="Verifique sua conexão e tente novamente." onRetry={loadBrand} />
      ) : (
        <BrandVoiceForm profile={formProfile} saving={saving} onSave={saveBrand} brandName={organization?.name} />
      )}

      <SectionCard
        id="brand-readiness"
        title="Prontidão para usar a marca"
        description="O que já está pronto e o que falta para campanhas e criativos com a identidade da sua empresa."
        action={<StatusChip variant={readiness.status === 'ready' ? 'ok' : readiness.status === 'partial' ? 'warn' : 'crit'}>{readiness.percentage}% pronta</StatusChip>}
      >
        <ul className="m-0 grid list-none gap-2 p-0 md:grid-cols-2">
          {readiness.checks.map(check => (
            <li key={check.key} className="flex items-start gap-2.5 rounded-lg border border-yx-line bg-yx-surface-2 p-3">
              {check.ready
                ? <CheckCircle2 aria-label="Atendido" className="mt-0.5 h-4 w-4 shrink-0 text-yx-ok" />
                : <AlertTriangle aria-label="Falta" className="mt-0.5 h-4 w-4 shrink-0 text-yx-warn" />}
              <div>
                <p className="text-sm font-medium text-yx-fg">{READINESS_COPY[check.key].label}</p>
                <p className="mt-0.5 text-xs text-yx-fg-3">{READINESS_COPY[check.key].detail}</p>
              </div>
            </li>
          ))}
        </ul>
      </SectionCard>
    </PortalPage>
  )
}
