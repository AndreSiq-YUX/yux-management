import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Building2 } from 'lucide-react'
import { PortalJourneyPage } from '@/components/client-portal/PortalJourneyPage'
import { CompanyProfileForm } from '@/components/company-intelligence/CompanyProfileForm'
import { WebsiteOnboardingCard } from '@/components/company-intelligence/WebsiteOnboardingCard'
import { usePortalMarketingContext } from '@/hooks/usePortalMarketingContext'
import { formatPortalCurrency, formatPortalDate, statusLabel } from '@/lib/client-portal/portalDisplay'
import { companyIntelligenceService } from '@/services/companyIntelligenceService'
import type { CompanyProfile, CompanyProfileInput } from '@/types/companyIntelligence'

export function PortalCompanyProfilePage() {
  const {
    activeContract,
    organization,
    loading,
    error,
    productsServices,
    knowledgeDocuments,
    settings,
  } = usePortalMarketingContext()
  const [companyProfile, setCompanyProfile] = useState<CompanyProfile | null>(null)
  const [profileLoading, setProfileLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!organization?.id) return
    setProfileLoading(true)
    companyIntelligenceService.getProfile(organization.id)
      .then(setCompanyProfile)
      .catch(error => {
        console.error(error)
        toast.error('Não foi possível carregar as informações da empresa.')
      })
      .finally(() => setProfileLoading(false))
  }, [organization?.id])

  const saveProfile = async (input: CompanyProfileInput) => {
    if (!organization?.id) return
    setSaving(true)
    try {
      const saved = await companyIntelligenceService.updateProfile(organization.id, input)
      setCompanyProfile(saved)
      toast.success('Informações da empresa salvas.')
    } catch (error) {
      console.error(error)
      toast.error('Não foi possível salvar as informações da empresa.')
      throw error
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

  return (
    <PortalJourneyPage
      eyebrow="Empresa"
      title="Perfil da Empresa"
      description="Centraliza dados institucionais e comerciais que orientam atendimento, marketing, campanhas e relatorios."
      icon={Building2}
      metrics={[
        { label: 'Organizacao', value: organization?.name || 'Sem contexto', detail: organization?.kind === 'client' ? 'Cliente ativo do portal.' : 'Contexto institucional carregado.' },
        { label: 'Contrato', value: activeContract ? statusLabel(activeContract.status) : 'Sem contrato', detail: activeContract?.package?.name || 'Nenhum pacote ativo encontrado.' },
        { label: 'Ofertas', value: String(activeProducts.length), detail: `${publishedDocuments.length} documentos publicados na base.` },
      ]}
      capabilities={[
        'Dados da empresa, segmento, descricao, site e redes sociais.',
        'Telefone, endereco, horarios de atendimento e regioes atendidas.',
        'Produtos e servicos principais, diferenciais e posicionamento.',
        'Observacoes internas que ajudam a YUX e os agentes a contextualizar a operacao.',
      ]}
      secondaryActions={[
        { label: 'Marca e Tom de Voz', href: '/portal/empresa/marca' },
        { label: 'Base de Conhecimento', href: '/portal/empresa/conhecimento' },
        { label: 'Integracoes', href: '/portal/empresa/integracoes' },
      ]}
      note="Nesta fase, esta pagina define a responsabilidade de produto e evita misturar dados da empresa com Configuracoes da Conta."
    >
      {organization?.id && <WebsiteOnboardingCard organizationId={organization.id} contractId={activeContract?.id} initialUrl={companyProfile?.websiteUrl} onApplied={reloadProfile} />}
      {profileLoading && <p className="rounded-lg border bg-white p-5 text-sm text-gray-600">Carregando informações editáveis...</p>}
      {!profileLoading && companyProfile && <CompanyProfileForm profile={companyProfile} saving={saving} onSave={saveProfile} />}

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-lg border bg-white p-5">
          <h2 className="text-base font-semibold text-gray-900">Contexto carregado</h2>
          {loading ? (
            <p className="mt-3 text-sm text-gray-600">Carregando dados da empresa...</p>
          ) : error ? (
            <p className="mt-3 text-sm text-red-600">{error}</p>
          ) : (
            <dl className="mt-4 grid gap-3 text-sm">
              <div className="flex justify-between gap-4 border-b pb-2">
                <dt className="text-gray-500">Empresa</dt>
                <dd className="font-medium text-gray-900">{organization?.name || 'Nao informada'}</dd>
              </div>
              <div className="flex justify-between gap-4 border-b pb-2">
                <dt className="text-gray-500">Pacote</dt>
                <dd className="font-medium text-gray-900">{activeContract?.package?.name || 'Nao informado'}</dd>
              </div>
              <div className="flex justify-between gap-4 border-b pb-2">
                <dt className="text-gray-500">Valor contratado</dt>
                <dd className="font-medium text-gray-900">{formatPortalCurrency(activeContract?.value)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-gray-500">Vigencia</dt>
                <dd className="font-medium text-gray-900">
                  {formatPortalDate(activeContract?.startsAt)} ate {formatPortalDate(activeContract?.endsAt)}
                </dd>
              </div>
            </dl>
          )}
        </article>

        <article className="rounded-lg border bg-white p-5">
          <h2 className="text-base font-semibold text-gray-900">Informacoes operacionais</h2>
          <div className="mt-4 space-y-3">
            {activeProducts.slice(0, 4).map(product => (
              <div key={product.id} className="rounded-md border bg-gray-50 p-3">
                <p className="text-sm font-medium text-gray-900">{product.name}</p>
                <p className="mt-1 line-clamp-2 text-xs text-gray-600">{product.description}</p>
              </div>
            ))}
            {!activeProducts.length && (
              <p className="text-sm text-gray-600">Nenhum produto ou servico ativo cadastrado no Marketing Studio.</p>
            )}
          </div>
          {settings && (
            <p className="mt-4 text-xs text-gray-500">
              Canais permitidos no Marketing Studio: {settings.allowedChannels.join(', ') || 'nao configurado'}.
            </p>
          )}
        </article>
      </section>
    </PortalJourneyPage>
  )
}
