import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FolderArchive } from 'lucide-react'
import { PortalJourneyPage } from '@/components/client-portal/PortalJourneyPage'
import { billingCycleLabel, formatPortalCurrency, formatPortalDate, statusLabel } from '@/lib/client-portal/portalDisplay'
import { usePortalWorkspacePath } from '@/hooks/usePortalWorkspacePath'
import { financeService } from '@/services/financeService'
import { proposalService } from '@/services/proposalService'
import { PendingAction } from '@/components/portal-ui'
import { usePlatformStore } from '@/stores/platformStore'
import type { PortalFinanceInvoice } from '@/types/finance'
import type { ProposalDraft } from '@/types/proposal'

export function PortalDocumentsPage() {
  const portalPath = usePortalWorkspacePath()
  const activeContract = usePlatformStore(state => state.activeContract)
  const isPlatformLoading = usePlatformStore(state => state.isLoading)
  const [proposals, setProposals] = useState<ProposalDraft[]>([])
  const [invoices, setInvoices] = useState<PortalFinanceInvoice[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      if (isPlatformLoading) {
        setLoading(true)
        return
      }

      if (!activeContract) {
        setLoading(false)
        return
      }

      setLoading(true)
      setError(null)

      try {
        const [loadedProposals, loadedInvoices] = await Promise.all([
          proposalService.getPortalProposals(),
          financeService.getPortalInvoices(activeContract.id),
        ])
        if (cancelled) return
        setProposals(loadedProposals.filter(proposal => (
          proposal.contractId === activeContract.id ||
          proposal.clientId === activeContract.clientId ||
          proposal.packageId === activeContract.packageId
        )))
        setInvoices(loadedInvoices)
      } catch (loadError) {
        console.error('Erro ao carregar documentos do portal:', loadError)
        if (!cancelled) {
          setProposals([])
          setInvoices([])
          setError('Não foi possível carregar os documentos.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()

    return () => {
      cancelled = true
    }
  }, [activeContract, isPlatformLoading])

  return (
    <PortalJourneyPage
      eyebrow="Projetos"
      title="Documentos"
      description="Propostas, faturas e arquivos das entregas do seu contrato."
      icon={FolderArchive}
      metrics={[
        { label: 'Propostas', value: String(proposals.length), detail: 'Documentos comerciais vinculados.' },
        { label: 'Faturas', value: String(invoices.length), detail: 'Documentos financeiros do contrato.' },
        { label: 'Contrato', value: activeContract ? statusLabel(activeContract.status) : 'Sem contrato', detail: activeContract?.name || activeContract?.package?.name || 'Nenhum contrato ativo.' },
      ]}
      capabilities={[
        'Abrir cada proposta para revisar o escopo e registrar sua decisão.',
        'Acompanhar vencimentos e valores das faturas do contrato.',
      ]}
      secondaryActions={[
        { label: 'Projetos', href: '/portal/projetos/projetos' },
        { label: 'Propostas', href: '/portal/projetos/propostas' },
        { label: 'Aprovações', href: '/portal/projetos/aprovacoes' },
        { label: 'Financeiro', href: '/portal/financeiro' },
      ]}
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-white p-4">
        <p className="text-sm text-gray-700">Precisa enviar um arquivo para a YUX?</p>
        <PendingAction code="B14">Enviar arquivo</PendingAction>
      </div>
      <section className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-lg border bg-white p-5">
          <h2 className="text-base font-semibold text-gray-900">Propostas</h2>
          {loading ? (
            <p className="mt-3 text-sm text-gray-600">Carregando documentos...</p>
          ) : error ? (
            <p className="mt-3 text-sm text-red-600">{error}</p>
          ) : (
            <div className="mt-4 space-y-3">
              {proposals.slice(0, 6).map(proposal => (
                <Link
                  key={proposal.id}
                  to={`${portalPath('/portal/projetos/propostas')}?proposalId=${encodeURIComponent(proposal.id)}`}
                  className="block rounded-md border bg-gray-50 p-3 transition-colors hover:bg-gray-100"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium text-gray-900">{proposal.title}</p>
                    <span className="rounded-full bg-white px-2 py-1 text-xs text-gray-600">{statusLabel(proposal.status)}</span>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    {billingCycleLabel(proposal.billingCycle)} · {formatPortalCurrency(proposal.finalValue)}
                  </p>
                </Link>
              ))}
              {!proposals.length && (
                <p className="text-sm text-gray-600">Nenhuma proposta vinculada ao contrato atual.</p>
              )}
            </div>
          )}
        </article>

        <article className="rounded-lg border bg-white p-5">
          <h2 className="text-base font-semibold text-gray-900">Documentos financeiros</h2>
          <div className="mt-4 space-y-3">
            {invoices.slice(0, 6).map(invoice => (
              <Link
                key={invoice.id}
                to={portalPath('/portal/financeiro')}
                className="block rounded-md border bg-gray-50 p-3 transition-colors hover:bg-gray-100"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-gray-900">{invoice.invoiceNumber}</p>
                  <span className="rounded-full bg-white px-2 py-1 text-xs text-gray-600">{statusLabel(invoice.status)}</span>
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  Vencimento {formatPortalDate(invoice.dueDate)} · {formatPortalCurrency(invoice.totalAmount)}
                </p>
              </Link>
            ))}
            {!invoices.length && (
              <p className="text-sm text-gray-600">Nenhuma fatura encontrada para este contrato.</p>
            )}
          </div>
        </article>
      </section>
    </PortalJourneyPage>
  )
}
