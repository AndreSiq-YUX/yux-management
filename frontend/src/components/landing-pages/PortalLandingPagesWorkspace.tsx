import { CheckCircle2, ExternalLink, MessageSquare } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { calculateLandingPageMetrics } from '@/lib/landing-pages/landingPageRules'
import type { PortalLandingPage } from '@/types/landingPage'
import type { ContractDetails } from '@/types/platform'

interface PortalLandingPagesWorkspaceProps {
  contract: ContractDetails
  pages: PortalLandingPage[]
  onRequestChange: (landingPageId: string) => void
  onApprove: (landingPageId: string) => void
}

export function PortalLandingPagesWorkspace({ contract, pages, onRequestChange, onApprove }: PortalLandingPagesWorkspaceProps) {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-950">Landing Pages do contrato</h1>
        <p className="text-slate-600">{contract.name || contract.id}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {pages.map(page => {
          const metrics = calculateLandingPageMetrics(page)
          return (
            <article key={page.id} className="overflow-hidden rounded-md border bg-white">
              <div className="aspect-[16/7] bg-slate-100">
                {page.thumbnailUrl ? (
                  <img src={page.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-slate-500">Preview indisponivel</div>
                )}
              </div>
              <div className="space-y-4 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="font-semibold text-slate-950">{page.name}</h2>
                    <p className="text-sm text-slate-500">{page.primaryCtaValue}</p>
                  </div>
                  <Badge variant={page.status === 'active' ? 'default' : 'secondary'}>{page.status}</Badge>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <Metric label="Visitas" value={metrics.visits.toString()} />
                  <Metric label="Leads" value={metrics.leads.toString()} />
                  <Metric label="Conversao" value={`${metrics.conversionRate}%`} />
                </div>
                <div className="flex flex-wrap gap-2">
                  {page.previewUrl && (
                    <Button title="Ver preview" variant="outline" size="sm" asChild>
                      <a href={page.previewUrl} target="_blank" rel="noreferrer"><ExternalLink className="mr-1 h-3.5 w-3.5" />Preview</a>
                    </Button>
                  )}
                  <Button title="Solicitar alteracao" variant="outline" size="sm" onClick={() => onRequestChange(page.id)}>
                    <MessageSquare className="mr-1 h-3.5 w-3.5" />
                    Solicitar ajuste
                  </Button>
                  <Button title="Aprovar publicacao" variant="outline" size="sm" onClick={() => onApprove(page.id)}>
                    <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                    Aprovar
                  </Button>
                </div>
              </div>
            </article>
          )
        })}
      </div>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-slate-50 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-sm font-semibold text-slate-950">{value}</p>
    </div>
  )
}
