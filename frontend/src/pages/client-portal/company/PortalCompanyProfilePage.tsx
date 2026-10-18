import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { PortalPage } from '@/components/client-portal/PortalPage'
import { CompanyProfileForm } from '@/components/company-intelligence/CompanyProfileForm'
import { WebsiteOnboardingCard } from '@/components/company-intelligence/WebsiteOnboardingCard'
import { ErrorState, SectionCard, SkeletonCard } from '@/components/portal-ui'
import { usePortalMarketingContext } from '@/hooks/usePortalMarketingContext'
import { isProfileEmpty } from '@/lib/company-intelligence/profileCompleteness'
import { companyIntelligenceService } from '@/services/companyIntelligenceService'
import type { CompanyProfile, CompanyProfileInput } from '@/types/companyIntelligence'

export function PortalCompanyProfilePage() {
  const {
    activeContract,
    organization,
    error,
    brandProfile,
    productsServices,
    knowledgeDocuments,
  } = usePortalMarketingContext({ resources: ['brandProfile', 'productsServices', 'knowledgeDocuments'] })
  const [companyProfile, setCompanyProfile] = useState<CompanyProfile | null>(null)
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileFailed, setProfileFailed] = useState(false)
  const [saving, setSaving] = useState(false)

  const loadProfile = useCallback(() => {
    if (!organization?.id) return
    setProfileLoading(true)
    setProfileFailed(false)
    companyIntelligenceService.getProfile(organization.id)
      .then(setCompanyProfile)
      .catch(failure => {
        console.error(failure)
        setProfileFailed(true)
        toast.error('Não foi possível carregar as informações da empresa.')
      })
      .finally(() => setProfileLoading(false))
  }, [organization?.id])

  useEffect(() => { loadProfile() }, [loadProfile])

  const saveProfile = async (input: CompanyProfileInput) => {
    if (!organization?.id) return
    setSaving(true)
    try {
      const saved = await companyIntelligenceService.updateProfile(organization.id, input)
      setCompanyProfile(saved)
      toast.success('Informações da empresa salvas.')
    } catch (failure) {
      console.error(failure)
      toast.error('Não foi possível salvar as informações da empresa.')
      throw failure
    } finally {
      setSaving(false)
    }
  }

  const reloadProfile = async () => {
    if (!organization?.id) return
    setCompanyProfile(await companyIntelligenceService.getProfile(organization.id))
  }

  const activeProducts = productsServices.filter(product => product.status === 'active')
  const publishedDocuments = knowledgeDocuments.filter(document => document.status === 'published')

  const websiteCard = organization?.id ? (
    <WebsiteOnboardingCard
      organizationId={organization.id}
      contractId={activeContract?.id}
      initialUrl={companyProfile?.websiteUrl}
      onApplied={reloadProfile}
      defaultOpen={companyProfile ? isProfileEmpty(companyProfile) : true}
    />
  ) : null

  return (
    <PortalPage
      eyebrow="Empresa"
      title="Perfil da empresa"
      description="Os dados da sua empresa que orientam o atendimento, o marketing, as campanhas e os relatórios."
      metrics={[
        { label: 'Ofertas ativas', value: String(activeProducts.length), detail: 'Produtos e serviços cadastrados.' },
        { label: 'Documentos publicados', value: String(publishedDocuments.length), detail: 'Na base de conhecimento.' },
      ]}
      help={[
        'Nome, segmento, descrição, site e redes sociais da empresa.',
        'Telefones, e-mails, endereço e horário de atendimento.',
        'Regiões atendidas, diferenciais e posicionamento.',
        'Recados para a equipe YUX, que ajudam a atender melhor a sua empresa.',
      ]}
      related={[
        { label: 'Marca e tom de voz', href: '/portal/empresa/marca' },
        { label: 'Base de conhecimento', href: '/portal/empresa/conhecimento' },
        { label: 'Conexões', href: '/portal/empresa/integracoes' },
      ]}
    >
      {error ? <ErrorState title="Não foi possível carregar parte dos dados da empresa." description={error} /> : null}
      {profileLoading && !companyProfile ? <SkeletonCard lines={6} /> : null}
      {profileFailed && !companyProfile && !profileLoading ? (
        <>
          {websiteCard}
          <ErrorState title="Não foi possível carregar o perfil." description="Verifique sua conexão e tente novamente." onRetry={loadProfile} />
        </>
      ) : null}
      {companyProfile ? (
        <CompanyProfileForm
          profile={companyProfile}
          saving={saving}
          onSave={saveProfile}
          logoUrl={brandProfile?.visualIdentity?.logoUrl}
          beforeSections={websiteCard}
        />
      ) : null}

      <SectionCard
        id="profile-offers"
        title="Produtos e serviços ativos"
        description="O que a YUX e os agentes podem apresentar aos seus clientes."
      >
        {activeProducts.length ? (
          <ul className="m-0 grid list-none gap-2.5 p-0 md:grid-cols-2">
            {activeProducts.slice(0, 4).map(product => (
              <li key={product.id} className="rounded-lg border border-yx-line bg-yx-surface-2 p-3">
                <p className="text-sm font-semibold text-yx-fg">{product.name}</p>
                {product.description ? <p className="mt-1 line-clamp-2 text-xs text-yx-fg-3">{product.description}</p> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-yx-fg-3">Nenhum produto ou serviço ativo cadastrado ainda. Eles aparecem aqui quando forem cadastrados no Marketing Studio ou lidos do seu site.</p>
        )}
      </SectionCard>
    </PortalPage>
  )
}
