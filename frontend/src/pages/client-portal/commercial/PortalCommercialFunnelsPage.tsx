import { GitBranch } from 'lucide-react'
import { PortalJourneyPage } from '@/components/client-portal/PortalJourneyPage'
import { usePortalCrmContext } from '@/hooks/usePortalCrmContext'
import { formatPortalCurrency } from '@/lib/client-portal/portalDisplay'

export function PortalCommercialFunnelsPage() {
  const { loading, error, pipelines, leads } = usePortalCrmContext()
  const openLeads = leads.filter(lead => (lead.status || 'open') === 'open')
  const openValue = openLeads.reduce((sum, lead) => sum + (lead.value || 0), 0)

  return (
    <PortalJourneyPage
      eyebrow="Comercial"
      title="Funis"
      description="Visao dos pipelines comerciais, etapas configuradas, gargalos e oportunidades em aberto."
      icon={GitBranch}
      metrics={[
        { label: 'Funis', value: String(pipelines.length), detail: 'Pipelines ativos para a organizacao.' },
        { label: 'Oportunidades', value: String(openLeads.length), detail: 'Leads abertos nos funis.' },
        { label: 'Valor aberto', value: formatPortalCurrency(openValue), detail: 'Soma das oportunidades abertas.' },
      ]}
      capabilities={[
        'Visualizar funis, etapas configuradas e oportunidades por etapa.',
        'Mover oportunidades, acompanhar conversao por etapa e identificar gargalos.',
        'Ver oportunidades paradas, motivo de perda e automacoes por etapa.',
        'Abrir a tela completa de Leads para operacao do kanban e lista comercial.',
      ]}
      primaryAction={{ label: 'Abrir Leads', href: '/portal/comercial/leads' }}
      secondaryActions={[
        { label: 'Empresas / Contas', href: '/portal/comercial/contas' },
        { label: 'Tarefas e Follow-ups', href: '/portal/comercial/tarefas' },
      ]}
    >
      <section className="rounded-lg border bg-white p-5">
        <h2 className="text-base font-semibold text-gray-900">Pipelines ativos</h2>
        {loading ? (
          <p className="mt-3 text-sm text-gray-600">Carregando funis comerciais...</p>
        ) : error ? (
          <p className="mt-3 text-sm text-red-600">{error}</p>
        ) : (
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {pipelines.map(pipeline => {
              const pipelineLeads = leads.filter(lead => lead.pipelineId === pipeline.id)
              const stages = pipeline.stages || []
              return (
                <article key={pipeline.id} className="rounded-md border bg-gray-50 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium text-gray-900">{pipeline.name}</p>
                    <span className="rounded-full bg-white px-2 py-1 text-xs text-gray-600">{pipelineLeads.length} leads</span>
                  </div>
                  {pipeline.description && <p className="mt-1 text-xs text-gray-600">{pipeline.description}</p>}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {stages.map(stage => (
                      <span key={stage.id} className="rounded-full bg-white px-2 py-1 text-xs text-gray-600">
                        {stage.name}
                      </span>
                    ))}
                    {!stages.length && <span className="text-xs text-gray-500">Sem etapas cadastradas.</span>}
                  </div>
                </article>
              )
            })}
            {!pipelines.length && (
              <p className="text-sm text-gray-600">Nenhum funil ativo encontrado para esta organizacao.</p>
            )}
          </div>
        )}
      </section>
    </PortalJourneyPage>
  )
}
