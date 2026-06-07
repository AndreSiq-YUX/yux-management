import { useEffect, useState } from 'react'
import { FolderArchive } from 'lucide-react'
import { PortalJourneyPage } from '@/components/client-portal/PortalJourneyPage'
import { formatPortalCurrency, formatPortalDate, statusLabel } from '@/lib/client-portal/portalDisplay'
import { financeService } from '@/services/financeService'
import { proposalService } from '@/services/proposalService'
import { usePlatformStore } from '@/stores/platformStore'
import type { PortalFinanceInvoice } from '@/types/finance'
import type { ProposalDraft } from '@/types/proposal'

export function PortalDocumentsPage() {
  const activeContract = usePlatformStore(state => state.activeContract)
  const [proposals, setProposals] = useState<ProposalDraft[]>([])
  const [invoices, setInvoices] = useState<PortalFinanceInvoice[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
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
          setError('Nao foi possivel carregar documentos do portal.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()

    return () => {
      cancelled = true
    }
  }, [activeContract])

  return (
    <PortalJourneyPage
      eyebrow="Projetos"
      title="Documentos"
      description="Centraliza contratos, propostas, relatorios, arquivos de campanha, manuais, materiais enviados e documentos da empresa."
      icon={FolderArchive}
      metrics={[
        { label: 'Propostas', value: String(proposals.length), detail: 'Documentos comerciais vinculados.' },
        { label: 'Faturas', value: String(invoices.length), detail: 'Documentos financeiros do contrato.' },
        { label: 'Contrato', value: activeContract ? statusLabel(activeContract.status) : 'Sem contrato', detail: activeContract?.name || activeContract?.package?.name || 'Nenhum contrato ativo.' },
      ]}
      capabilities={[
        'Consultar contratos, propostas, relatorios e documentos de projeto.',
        'Organizar arquivos de campanha, manuais, materiais enviados e documentos da empresa.',
        'Separar documentos visiveis ao cliente de materiais internos da YUX.',
        'Preparar permissoes por papel para financeiro, marketing, comercial e visualizadores.',
      ]}
      secondaryActions={[
        { label: 'Projetos', href: '/portal/projetos/projetos' },
        { label: 'Aprovacoes', href: '/portal/projetos/aprovacoes' },
        { label: 'Financeiro', href: '/portal/financeiro' },
      ]}
    >
      <section className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-lg border bg-white p-5">
          <h2 className="text-base font-semibold text-gray-900">Propostas e contratos</h2>
          {loading ? (
            <p className="mt-3 text-sm text-gray-600">Carregando documentos...</p>
          ) : error ? (
            <p className="mt-3 text-sm text-red-600">{error}</p>
          ) : (
            <div className="mt-4 space-y-3">
              {proposals.slice(0, 6).map(proposal => (
                <article key={proposal.id} className="rounded-md border bg-gray-50 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium text-gray-900">{proposal.title}</p>
                    <span className="rounded-full bg-white px-2 py-1 text-xs text-gray-600">{statusLabel(proposal.status)}</span>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    {proposal.billingCycle} - {formatPortalCurrency(proposal.finalValue)}
                  </p>
                </article>
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
              <article key={invoice.id} className="rounded-md border bg-gray-50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-gray-900">{invoice.invoiceNumber}</p>
                  <span className="rounded-full bg-white px-2 py-1 text-xs text-gray-600">{statusLabel(invoice.status)}</span>
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  Vencimento {formatPortalDate(invoice.dueDate)} - {formatPortalCurrency(invoice.totalAmount)}
                </p>
              </article>
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
