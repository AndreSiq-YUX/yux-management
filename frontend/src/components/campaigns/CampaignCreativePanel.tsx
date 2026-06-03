import { ImageIcon } from 'lucide-react'
import type { CampaignCreative } from '@/types/campaign'

interface CampaignCreativePanelProps {
  creatives?: CampaignCreative[]
}

export function CampaignCreativePanel({ creatives = [] }: CampaignCreativePanelProps) {
  if (creatives.length === 0) {
    return (
      <div className="flex h-28 items-center justify-center rounded-md border bg-slate-50 text-sm text-slate-500">
        <ImageIcon className="mr-2 h-4 w-4" />
        Criativo pendente
      </div>
    )
  }

  const creative = creatives[0]

  return (
    <div className="rounded-md border bg-slate-50 p-3">
      {creative.mediaUrl ? (
        <img src={creative.mediaUrl} alt="" className="mb-3 h-28 w-full rounded object-cover" />
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
