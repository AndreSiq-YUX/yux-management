import type { MarketingStudioSettings, PortalMarketingContentItem } from '@/types/marketingStudio'

interface PortalMarketingStudioWorkspaceProps {
  contents: PortalMarketingContentItem[]
  settings: MarketingStudioSettings | null
}

export function PortalMarketingStudioWorkspace({ contents, settings }: PortalMarketingStudioWorkspaceProps) {
  const pending = contents.filter(content => content.status === 'in_review').length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-950">Marketing Studio</h1>
        <p className="text-sm text-slate-600">Calendario, conteudos e aprovacoes do seu contrato.</p>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Metric label="Aguardando aprovacao" value={pending} />
        <Metric label="Conteudos" value={contents.length} />
        <Metric label="Creditos" value={settings?.currentCreditBalance ?? 0} />
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <section className="rounded-md border border-slate-200 bg-white p-3">
          <h2 className="text-sm font-semibold text-slate-950">Calendario</h2>
          <p className="mt-1 text-sm text-slate-600">Proximas publicacoes e ajustes pendentes.</p>
        </section>
        <section className="rounded-md border border-slate-200 bg-white p-3">
          <h2 className="text-sm font-semibold text-slate-950">Campanhas e criativos</h2>
          <p className="mt-1 text-sm text-slate-600">Pecas aprovadas e criativos em revisao.</p>
        </section>
        <section className="rounded-md border border-slate-200 bg-white p-3">
          <h2 className="text-sm font-semibold text-slate-950">Relatorios</h2>
          <p className="mt-1 text-sm text-slate-600">Resumo de resultados do periodo.</p>
        </section>
      </div>

      <section>
        <h2 className="text-base font-semibold text-slate-950">Conteudos</h2>
        <div className="mt-3 divide-y rounded-md border border-slate-200 bg-white">
          {contents.length === 0 ? (
            <p className="p-3 text-sm text-slate-500">Nenhum conteudo disponivel.</p>
          ) : (
            contents.map(content => (
              <article key={content.id} className="p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-medium text-slate-950">{content.title}</h3>
                    <p className="text-xs text-slate-500">{content.channel}</p>
                  </div>
                  <span className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-700">{content.status}</span>
                </div>
              </article>
            ))
          )}
        </div>
      </section>
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
