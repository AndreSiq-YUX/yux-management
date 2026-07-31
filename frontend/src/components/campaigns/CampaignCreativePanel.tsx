import { CheckCircle2, ImageIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { CampaignCreative } from '@/types/campaign'

interface CampaignCreativePanelProps {
  creatives?: CampaignCreative[]
}

export function CampaignCreativePanel({ creatives = [] }: CampaignCreativePanelProps) {
  if (creatives.length === 0) {
    return (
      <div className="flex h-28 flex-col items-center justify-center rounded-md border bg-slate-50 text-sm text-slate-500">
        <ImageIcon className="mb-2 h-4 w-4" />
        <span>Criativo pendente</span>
        <span className="mt-1 text-xs">Necessario para anuncio e aprovacao</span>
      </div>
    )
  }

  const creative = creatives[0]

  return (
    <div className="rounded-md border bg-slate-50 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <Badge variant="secondary" className="gap-1">
          <CheckCircle2 className="h-3 w-3" />
          Pronto
        </Badge>
        <span className="text-xs text-slate-500">{creatives.length} variacao(oes)</span>
      </div>
      {creative.mediaUrl ? (
        <img src={creative.mediaUrl} alt={creative.headline || creative.name} className="mb-3 h-28 w-full rounded object-cover" />
      ) : (
        <div className="mb-3 flex h-28 items-center justify-center rounded bg-white text-slate-500">
          <ImageIcon className="h-5 w-5" />
        </div>
      )}
      <p className="text-sm font-medium text-slate-950">{creative.headline || creative.name}</p>
      {creative.body && <p className="mt-1 text-xs text-slate-500">{creative.body}</p>}
    </div>
  )
}
