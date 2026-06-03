import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { PortalSupportWorkspace } from '@/components/support/PortalSupportWorkspace'
import { platformService } from '@/services/platformService'
import { supportService } from '@/services/supportService'
import { usePlatformStore } from '@/stores/platformStore'
import type { PortalSupportTicket } from '@/types/support'

export function PortalSupportPage() {
  const activeContract = usePlatformStore(state => state.activeContract)
  const [tickets, setTickets] = useState<PortalSupportTicket[]>([])
  const [organizationId, setOrganizationId] = useState<string>()
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!activeContract) {
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const [loadedTickets, organizations] = await Promise.all([
        supportService.getPortalTickets(activeContract.id),
        platformService.getOrganizations(),
      ])
      setTickets(loadedTickets)
      setOrganizationId(organizations.find(organization => organization.slug === 'yux')?.id || organizations[0]?.id)
    } catch (error) {
      console.error('Erro ao carregar suporte do portal:', error)
      toast.error('Erro ao carregar suporte')
      setTickets([])
    } finally {
      setLoading(false)
    }
  }, [activeContract])

  useEffect(() => {
    load()
  }, [load])

  if (!activeContract) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Suporte</h1>
        <p className="mt-2 text-gray-600">Nenhum contrato ativo encontrado para este usuario.</p>
      </div>
    )
  }

  if (loading) return <p className="text-sm text-gray-600">Carregando suporte...</p>

  return (
    <PortalSupportWorkspace
      contract={activeContract}
      tickets={tickets}
      onRefresh={load}
      onCreateTicket={async input => {
        if (!organizationId) {
          toast.error('Organizacao operacional nao encontrada')
          return
        }
        const ticket = await supportService.createTicket({
          organizationId,
          clientId: input.clientId,
          contractId: input.contractId,
          subject: input.subject,
          category: input.category,
          priority: input.priority,
        })
        await supportService.addMessage({
          ticketId: ticket.id,
          authorType: 'client',
          body: input.body,
          isInternal: false,
        })
        toast.success('Chamado aberto')
        load()
      }}
      onAddMessage={async input => {
        await supportService.addMessage(input)
        toast.success('Resposta enviada')
        load()
      }}
    />
  )
}
