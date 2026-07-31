import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { CreateCampaignDraftInput } from '@/types/campaign'

interface CampaignBuilderProps {
  defaultOrganizationId?: string
  defaultClientId?: string
  defaultContractId?: string
  onCreateDraft: (input: CreateCampaignDraftInput) => void
}

export function CampaignBuilder({ defaultOrganizationId, defaultClientId, defaultContractId, onCreateDraft }: CampaignBuilderProps) {
  return (
    <div className="rounded-md border bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-slate-950">Builder de campanha</h2>
          <p className="text-sm text-slate-600">Rascunho API-first com provider, orcamento, UTM e rota de funil.</p>
        </div>
        <Button
          title="Criar rascunho de campanha"
          disabled={!defaultOrganizationId || !defaultClientId || !defaultContractId}
          onClick={() => {
            if (!defaultOrganizationId || !defaultClientId || !defaultContractId) return
            onCreateDraft({
              organizationId: defaultOrganizationId,
              clientId: defaultClientId,
              contractId: defaultContractId,
              provider: 'meta',
              name: 'Nova campanha comercial',
              objective: 'lead_generation',
              dailyBudget: 50,
              totalBudget: 1500,
            })
          }}
        >
          <Plus className="mr-2 h-4 w-4" />
          Novo rascunho
        </Button>
      </div>
    </div>
  )
}
