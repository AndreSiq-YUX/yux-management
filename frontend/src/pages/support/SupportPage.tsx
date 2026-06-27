import { useCallback, useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { SupportWorkspace } from '@/components/support/SupportWorkspace'
import { calculateSupportSummary } from '@/lib/support/supportRules'
import { platformService } from '@/services/platformService'
import { backendDataService } from '@/services/backendDataService'
import { supportService } from '@/services/supportService'
import type { SupportTicket } from '@/types/support'
import type { Client } from '@/types/client'
import type { ContractDetails, Organization } from '@/types/platform'
import type { Project } from '@/types/project'

export function SupportPage() {
  const [tickets, setTickets] = useState<SupportTicket[]>([])
  const [contracts, setContracts] = useState<ContractDetails[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)

  const summary = useMemo(() => calculateSupportSummary(tickets), [tickets])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [loadedTickets, loadedContracts, clientsResponse, loadedOrganizations, projectsResponse] = await Promise.all([
        supportService.getTickets(),
        platformService.getContracts(),
        backendDataService.getClients({ page: 1, limit: 500 }),
        platformService.getOrganizations(),
        backendDataService.getProjects({ page: 1, limit: 500 }),
      ])
      setTickets(loadedTickets)
      setContracts(loadedContracts)
      setClients(((clientsResponse as any).clients || (clientsResponse as any).data || []) as Client[])
      setOrganizations(loadedOrganizations)
      setProjects(((projectsResponse as any).projects || []) as Project[])
    } catch (error) {
      console.error('Erro ao carregar suporte:', error)
      toast.error('Erro ao carregar suporte')
      setTickets([])
      setContracts([])
      setClients([])
      setProjects([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  if (loading) return <p className="text-sm text-gray-600">Carregando suporte...</p>

  return (
    <SupportWorkspace
      tickets={tickets}
      summary={summary}
      clients={clients.map(client => ({ id: client.id, name: client.companyName }))}
      contracts={contracts.map(contract => ({ id: contract.id, clientId: contract.clientId, name: contract.name || contract.id }))}
      projects={projects.map(project => ({ id: project.id, clientId: project.clientId, name: project.name }))}
      defaultOrganizationId={organizations.find(organization => organization.slug === 'yux')?.id || organizations[0]?.id}
      onRefresh={load}
      onCreateTicket={async input => {
        await supportService.createTicket(input)
        toast.success('Chamado criado')
        load()
      }}
      onAddMessage={async input => {
        await supportService.addMessage(input)
        toast.success('Resposta registrada')
        load()
      }}
      onUpdateTicket={async (ticketId, input) => {
        await supportService.updateTicket(ticketId, input)
        toast.success('Chamado atualizado')
        load()
      }}
    />
  )
}
