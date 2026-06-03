import { CheckCircle2, ExternalLink, FilePlus2, MessageSquare, Pause, Play, RefreshCw } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { calculateLandingPageSummary } from '@/lib/landing-pages/landingPageRules'
import type { LandingPage } from '@/types/landingPage'

interface LandingPagesWorkspaceProps {
  pages: LandingPage[]
  onRefresh: () => void
  onCreatePage: () => void
  onAddVersion: (landingPageId: string) => void
  onRequestChange: (landingPageId: string) => void
  onApprove: (landingPageId: string) => void
  onStatusChange: (landingPageId: string, status: LandingPage['status']) => void
}

export function LandingPagesWorkspace({
  pages,
  onRefresh,
  onCreatePage,
  onAddVersion,
  onRequestChange,
  onApprove,
  onStatusChange,
}: LandingPagesWorkspaceProps) {
  const summary = calculateLandingPageSummary(pages)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-950">Landing Pages</h1>
          <p className="text-slate-600">Ativos de conversao, aprovacoes e roteamento comercial.</p>
        </div>
        <div className="flex gap-2">
          <Button title="Atualizar landing pages" variant="outline" onClick={onRefresh}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Atualizar
          </Button>
          <Button title="Criar landing page" onClick={onCreatePage}>
            <FilePlus2 className="mr-2 h-4 w-4" />
            Criar landing
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Metric label="Ativas" value={summary.activePages.toString()} />
        <Metric label="Conversao" value={`${summary.conversionRate}%`} />
        <Metric label="Leads" value={summary.leads.toString()} />
        <Metric label="Aprovacoes" value={summary.pendingApprovals.toString()} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {pages.map(page => (
          <article key={page.id} className="overflow-hidden rounded-md border bg-white">
            <div className="aspect-[16/7] bg-slate-100">
              {page.thumbnailUrl ? (
                <img src={page.thumbnailUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-slate-500">Sem thumbnail</div>
              )}
            </div>
            <div className="space-y-4 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-slate-950">{page.name}</h2>
                  <p className="text-sm text-slate-500">{page.slug}</p>
                </div>
                <Badge variant={page.status === 'active' ? 'default' : 'secondary'}>{page.status}</Badge>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <SmallInfo label="CTA" value={`${page.primaryCtaType}: ${page.primaryCtaValue}`} />
                <SmallInfo label="Versoes" value={page.versions.length.toString()} />
                <SmallInfo label="Forms" value={(page.forms?.length || 0).toString()} />
              </div>
              {page.internalNotes && <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">{page.internalNotes}</p>}
              <div className="flex flex-wrap gap-2">
                {page.previewUrl && (
                  <Button title="Abrir preview" variant="outline" size="sm" asChild>
                    <a href={page.previewUrl} target="_blank" rel="noreferrer"><ExternalLink className="mr-1 h-3.5 w-3.5" />Preview</a>
                  </Button>
                )}
                <Button title="Adicionar versao" variant="outline" size="sm" onClick={() => onAddVersion(page.id)}>Versao</Button>
                <Button title="Solicitar ajuste" variant="outline" size="sm" onClick={() => onRequestChange(page.id)}><MessageSquare className="mr-1 h-3.5 w-3.5" />Ajuste</Button>
                <Button title="Aprovar publicacao" variant="outline" size="sm" onClick={() => onApprove(page.id)}><CheckCircle2 className="mr-1 h-3.5 w-3.5" />Aprovar</Button>
                <Button title={page.status === 'active' ? 'Pausar landing page' : 'Ativar landing page'} variant="outline" size="sm" onClick={() => onStatusChange(page.id, page.status === 'active' ? 'paused' : 'active')}>
                  {page.status === 'active' ? <Pause className="mr-1 h-3.5 w-3.5" /> : <Play className="mr-1 h-3.5 w-3.5" />}
                  {page.status === 'active' ? 'Pausar' : 'Ativar'}
                </Button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-white p-4">
      <p className="text-xs font-medium uppercase text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
    </div>
  )
}

function SmallInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-slate-50 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="truncate text-sm font-medium text-slate-950">{value}</p>
    </div>
  )
}
