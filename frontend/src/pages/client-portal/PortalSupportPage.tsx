import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { LifeBuoy } from 'lucide-react'
import { EmptyState, ErrorState, PageHeader, SkeletonCard } from '@/components/portal-ui'
import { PortalSupportWorkspace } from '@/components/support/PortalSupportWorkspace'
import { createPortalTicket } from '@/lib/support/createPortalTicket'
import { supportService } from '@/services/supportService'
import { useAuthStore } from '@/stores/authStore'
import { usePlatformStore } from '@/stores/platformStore'
import type { PortalSupportTicket } from '@/types/support'

export function PortalSupportPage() {
  const activeContract = usePlatformStore(state => state.activeContract)
  const isPlatformLoading = usePlatformStore(state => state.isLoading)
  const userName = useAuthStore(state => state.user?.name)
  const [tickets, setTickets] = useState<PortalSupportTicket[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const contractId = activeContract?.id

  /** `silent` recarrega a lista sem trocar a tela por "carregando" (mantém o chamado aberto e os textos). */
  const load = useCallback(async (silent = false) => {
    if (isPlatformLoading) {
      setLoading(true)
      return
    }

    if (!contractId) {
      setLoading(false)
      return
    }

    if (!silent) setLoading(true)
    setError(false)
    try {
      setTickets(await supportService.getPortalTickets(contractId))
    } catch (cause) {
      console.error('Erro ao carregar suporte do portal:', cause)
      if (silent) {
        toast.error('Não foi possível atualizar a lista de chamados.')
      } else {
        toast.error('Erro ao carregar suporte')
        setTickets([])
        setError(true)
      }
    } finally {
      setLoading(false)
    }
  }, [contractId, isPlatformLoading])

  useEffect(() => {
    void load()
  }, [load])

  if (isPlatformLoading || loading) {
    return (
      <div className="w-full space-y-6" aria-busy="true">
        <PageHeader title="Ajuda e suporte" lead="Carregando seus chamados…" />
        <SkeletonCard lines={5} />
      </div>
    )
  }

  if (!activeContract) {
    return (
      <div className="w-full space-y-6">
        <PageHeader title="Ajuda e suporte" />
        <EmptyState
          icon={LifeBuoy}
          title="Nenhum contrato ativo"
          description="Não encontramos um contrato ativo para a sua conta. Quando ele estiver ativo, você poderá abrir chamados aqui."
        />
      </div>
    )
  }

  if (error) {
    return (
      <div className="w-full space-y-6">
        <PageHeader title="Ajuda e suporte" />
        <ErrorState title="Não foi possível carregar seus chamados." description="Verifique sua conexão e tente de novo." onRetry={() => void load()} />
      </div>
    )
  }

  return (
    <PortalSupportWorkspace
      contract={activeContract}
      tickets={tickets}
      currentUserName={userName}
      onRefresh={() => load(true)}
      onCreateTicket={async input => {
        try {
          await createPortalTicket(input)
        } catch (cause) {
          console.error('Erro ao abrir chamado:', cause)
          toast.error('Não foi possível abrir o chamado.')
          throw cause
        }
        toast.success('Chamado aberto. A equipe YUX vai responder por aqui.')
        await load(true)
      }}
      onAddMessage={async input => {
        try {
          await supportService.addMessage(input)
        } catch (cause) {
          console.error('Erro ao enviar resposta:', cause)
          toast.error('Não foi possível enviar a resposta.')
          throw cause
        }
        toast.success('Resposta enviada')
        await load(true)
      }}
    />
  )
}
