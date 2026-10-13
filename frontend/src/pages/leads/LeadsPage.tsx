import { CrmWorkspace } from '@/components/crm/CrmWorkspace'
import {useSearchParams} from 'react-router-dom'

export function LeadsPage() {
  const [params]=useSearchParams()
  return <CrmWorkspace key={`${params.get('pipelineId')??''}:${params.get('leadId')??''}`} initialPipelineId={params.get('pipelineId')??undefined} initialLeadId={params.get('leadId')??undefined}/>
}
