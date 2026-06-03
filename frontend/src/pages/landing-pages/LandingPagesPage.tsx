import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { LandingPagesWorkspace } from '@/components/landing-pages/LandingPagesWorkspace'
import { landingPageService } from '@/services/landingPageService'
import { platformService } from '@/services/platformService'
import type { LandingPage } from '@/types/landingPage'
import type { ContractDetails, Organization } from '@/types/platform'

export function LandingPagesPage() {
  const [pages, setPages] = useState<LandingPage[]>([])
  const [contracts, setContracts] = useState<ContractDetails[]>([])
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [loadedPages, loadedContracts, loadedOrganizations] = await Promise.all([
        landingPageService.getLandingPages(),
        platformService.getContracts(),
        platformService.getOrganizations(),
      ])
      setPages(loadedPages)
      setContracts(loadedContracts)
      setOrganizations(loadedOrganizations)
    } catch (error) {
      console.error('Erro ao carregar landing pages:', error)
      toast.error('Erro ao carregar landing pages')
      setPages([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  if (loading) return <p className="text-sm text-slate-600">Carregando landing pages...</p>

  return (
    <LandingPagesWorkspace
      pages={pages}
      onRefresh={load}
      onCreatePage={async () => {
        const contract = contracts[0]
        const organization = organizations.find(item => item.slug === 'yux') || organizations[0]
        if (!contract || !organization) {
          toast.error('Contrato ou organizacao nao encontrado')
          return
        }
        await landingPageService.createLandingPage({
          organizationId: organization.id,
          clientId: contract.clientId,
          contractId: contract.id,
          name: 'Nova landing comercial',
          slug: `landing-${Date.now()}`,
          primaryCtaType: 'form',
          primaryCtaValue: 'Solicitar contato',
          internalNotes: 'Criada pelo cockpit de Landing Pages.',
        })
        toast.success('Landing page criada')
        load()
      }}
      onAddVersion={async landingPageId => {
        await landingPageService.addLandingPageVersion({ landingPageId, title: 'Nova versao', internalOnly: true })
        toast.success('Versao adicionada')
        load()
      }}
      onRequestChange={async landingPageId => {
        await landingPageService.requestLandingPageChange({ landingPageId, message: 'Solicitacao registrada pelo time interno.' })
        toast.success('Ajuste solicitado')
        load()
      }}
      onApprove={async landingPageId => {
        await landingPageService.approveLandingPage({ landingPageId, status: 'approved', comment: 'Aprovado pelo cockpit.' })
        toast.success('Publicacao aprovada')
        load()
      }}
      onStatusChange={async (landingPageId, status) => {
        await landingPageService.updateLandingPageStatus(landingPageId, status)
        toast.success('Status atualizado')
        load()
      }}
    />
  )
}
