import { useSearchParams } from 'react-router-dom'
import { CrmWorkspace } from '@/components/crm/CrmWorkspace'

/**
 * Leads do portal. Parâmetros aceitos: `pipelineId`, `leadId` e `company`
 * (filtra os leads de uma empresa; usado por Empresas e contas).
 */
export function PortalCommercialLeadsPage() {
  const [params] = useSearchParams()
  const pipelineId = params.get('pipelineId') ?? undefined
  const leadId = params.get('leadId') ?? undefined
  const company = params.get('company') ?? undefined

  return (
    <CrmWorkspace
      key={`${pipelineId ?? ''}:${leadId ?? ''}:${company ?? ''}`}
      profile="portal"
      initialPipelineId={pipelineId}
      initialLeadId={leadId}
      initialSearch={company}
    />
  )
}
