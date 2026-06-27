import type { ReactNode } from 'react'
import { AlertTriangle, BrainCircuit, CheckCircle2, Lightbulb } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

interface RecordIntelligencePanelProps {
  summary?: string
  sentiment?: string
  risk?: string
  nextBestAction?: string
  missingData: string[]
  sources: string[]
}

export function RecordIntelligencePanel({
  summary,
  sentiment,
  risk,
  nextBestAction,
  missingData,
  sources,
}: RecordIntelligencePanelProps) {
  return (
    <section className="rounded-md border bg-white">
      <div className="flex items-center justify-between gap-3 border-b p-3">
        <div className="flex items-center gap-2">
          <BrainCircuit className="h-4 w-4 text-slate-500" />
          <h3 className="font-medium text-slate-950">Inteligencia Comercial YUX</h3>
        </div>
        <Badge variant="secondary">{sentiment || 'Sem leitura'}</Badge>
      </div>
      <div className="space-y-4 p-3">
        <InfoBlock icon={<BrainCircuit className="h-4 w-4" />} title="Resumo do registro">
          {summary || 'A IA ainda nao gerou um resumo consolidado para este registro.'}
        </InfoBlock>
        <div className="grid gap-3 md:grid-cols-2">
          <InfoBlock icon={<AlertTriangle className="h-4 w-4 text-amber-600" />} title="Risco ou objecao">
            {risk || 'Nenhum risco comercial destacado.'}
          </InfoBlock>
          <InfoBlock icon={<Lightbulb className="h-4 w-4 text-cyan-700" />} title="Proxima melhor acao">
            {nextBestAction || 'Revise o historico e defina o proximo follow-up.'}
          </InfoBlock>
        </div>
        <div className="rounded-md border bg-slate-50 p-3">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-900">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            Qualidade dos dados
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {missingData.length > 0
              ? missingData.map(item => <Badge key={item} variant="outline">{item}</Badge>)
              : <span className="text-sm text-slate-500">Dados essenciais preenchidos.</span>}
          </div>
        </div>
        <div className="text-xs text-slate-500">
          Fontes: {sources.length > 0 ? sources.join(', ') : 'CRM'}
        </div>
      </div>
    </section>
  )
}

function InfoBlock({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="rounded-md border bg-slate-50 p-3">
      <div className="flex items-center gap-2 text-sm font-medium text-slate-900">
        {icon}
        {title}
      </div>
      <p className="mt-2 text-sm text-slate-700">{children}</p>
    </div>
  )
}
