import { RefreshCw } from 'lucide-react'
import type { MarketingContentItem, MarketingStudioSettings } from '@/types/marketingStudio'

interface MarketingStudioWorkspaceProps {
  contents: MarketingContentItem[]
  settings: MarketingStudioSettings | null
  onRefresh: () => void
}

const tabs = ['Visao geral', 'Conteudo', 'Calendario', 'Aprovacoes', 'Ideias', 'Agentes', 'Creditos']

export function MarketingStudioWorkspace({ contents, settings, onRefresh }: MarketingStudioWorkspaceProps) {
  const pendingApprovals = contents.filter(content => content.status === 'in_review').length
  const scheduled = contents.filter(content => content.status === 'scheduled').length

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-950">Marketing Studio</h1>
          <p className="text-sm text-slate-600">Operacao multicliente de conteudo, calendario, aprovacoes e creditos.</p>
        </div>
        <button
          type="button"
          title="Atualizar Marketing Studio"
          onClick={onRefresh}
          className="inline-flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
        >
          <RefreshCw className="h-4 w-4" />
          Atualizar
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Metric label="Conteudos" value={contents.length} />
        <Metric label="Aprovacoes" value={pendingApprovals} />
        <Metric label="Agendados" value={scheduled} />
        <Metric label="Creditos" value={settings?.currentCreditBalance ?? 0} />
      </div>

      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
        {tabs.map(tab => (
          <span key={tab} className="rounded-md bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
            {tab}
          </span>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <section>
          <h2 className="text-base font-semibold text-slate-950">Conteudo em producao</h2>
          <div className="mt-3 divide-y rounded-md border border-slate-200 bg-white">
            {contents.length === 0 ? (
              <p className="p-3 text-sm text-slate-500">Nenhum conteudo cadastrado.</p>
            ) : (
              contents.map(content => (
                <article key={content.id} className="p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-medium text-slate-950">{content.title}</h3>
                      <p className="text-xs text-slate-500">{content.channel} / {content.contentType}</p>
                    </div>
                    <span className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-700">{content.status}</span>
                  </div>
                  {content.internalNotes && (
                    <p className="mt-2 text-xs text-slate-500">{content.internalNotes}</p>
                  )}
                </article>
              ))
            )}
          </div>
        </section>

        <section>
          <h2 className="text-base font-semibold text-slate-950">Operacao</h2>
          <div className="mt-3 space-y-2 rounded-md border border-slate-200 bg-white p-3 text-sm text-slate-700">
            <p>Modo: {settings?.operationMode ?? 'sem configuracao'}</p>
            <p>Limite mensal: {settings?.monthlyCreditLimit ?? 0}</p>
            <p>Canais: {settings?.allowedChannels.join(', ') || 'nao configurado'}</p>
            <p>Aprovacao WordPress: {settings?.approvalPolicy.publishWordPress ? 'obrigatoria' : 'flexivel'}</p>
          </div>
        </section>
      </div>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-3">
      <p className="text-sm font-medium text-slate-700">{label} {value}</p>
    </div>
  )
}
