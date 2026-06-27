import { supabase } from '@/lib/supabase'
import { crmService } from '@/services/crmService'
import { platformService } from '@/services/platformService'
import { supabaseService } from '@/services/supabaseService'
import type { Client } from '@/types/client'
import type { CrmLead } from '@/types/crm'
import type { BillingCycle, BlueprintApplicationRun, ContractDetails, ContractStatus, Organization, PackageDefinition } from '@/types/platform'

export interface LeadClientConversionInput {
  sourceOrganizationId: string
  lead: CrmLead
  packageItem: PackageDefinition
  blueprintId?: string
  client: {
    companyName: string
    contactName: string
    email: string
    phone?: string
    website?: string
    sector: string
    size: Client['size']
    leadSource: string
    acquisitionCost?: number
    notes?: string
  }
  contract: {
    name: string
    status: ContractStatus
    startsAt: string
    endsAt?: string
    value?: number
    billingCycle: BillingCycle
    notes?: string
  }
}

export interface LeadClientConversionResult {
  clientId: string
  organization: Organization
  contract: ContractDetails
  blueprintRun?: BlueprintApplicationRun
}

const buildOriginNote = (input: LeadClientConversionInput) => {
  const attribution = input.lead.attributionContext
    ? `\n\nAtribuicao original:\n${JSON.stringify(input.lead.attributionContext, null, 2)}`
    : ''

  return [
    input.client.notes?.trim(),
    `Origem comercial YUX: lead ${input.lead.id}`,
    `Fonte: ${input.lead.source || input.client.leadSource}`,
    `Workspace de origem: ${input.sourceOrganizationId}`,
    `Pacote fechado: ${input.packageItem.name}`,
    input.blueprintId ? `Blueprint aplicado: ${input.blueprintId}` : null,
    attribution,
  ].filter(Boolean).join('\n')
}

async function updateConvertedLead(input: LeadClientConversionInput, clientId: string) {
  const now = new Date().toISOString()
  const mergedNotes = [
    input.lead.notes,
    `Cliente convertido em ${now}. Cliente administrativo: ${clientId}. Contrato: ${input.contract.name}.`,
  ].filter(Boolean).join('\n\n')

  const { error } = await supabase
    .from('leads')
    .update({
      client_id: clientId,
      converted_to_client_id: clientId,
      status: 'won',
      stage: 'WON',
      value: input.contract.value ?? input.lead.value ?? null,
      won_at: now,
      lost_at: null,
      lost_reason: null,
      notes: mergedNotes,
      last_activity_at: now,
    })
    .eq('id', input.lead.id)

  if (error) throw error

  await crmService.recordLeadActivity({
    organizationId: input.sourceOrganizationId,
    leadId: input.lead.id,
    type: 'note',
    title: 'Lead convertido em cliente',
    description: `Cliente administrativo ${clientId} criado com contrato ${input.contract.name}.`,
    date: now,
  })
}

export const clientConversionService = {
  async convertLeadToClientContract(input: LeadClientConversionInput): Promise<LeadClientConversionResult> {
    const clientResponse = await supabaseService.createClient({
      ...input.client,
      status: 'active',
      acquisitionCost: input.client.acquisitionCost,
      notes: buildOriginNote(input),
      tags: ['convertido-yux', `lead:${input.lead.id}`],
      communicationPreferences: ['email', 'whatsapp'],
    })

    if (!clientResponse.success || !clientResponse.data?.id) {
      throw new Error('Nao foi possivel criar o cliente administrativo.')
    }

    const clientId = clientResponse.data.id as string
    const organization = await platformService.createClientOrganization({
      clientId,
      name: input.client.companyName,
    })

    const contract = await platformService.createContract({
      clientId,
      packageId: input.packageItem.id,
      name: input.contract.name,
      status: input.contract.status,
      startsAt: input.contract.startsAt,
      endsAt: input.contract.endsAt,
      value: input.contract.value,
      billingCycle: input.contract.billingCycle,
      notes: [
        input.contract.notes?.trim(),
        `Contrato criado a partir do lead YUX ${input.lead.id}.`,
        input.blueprintId ? `Blueprint selecionado: ${input.blueprintId}.` : null,
      ].filter(Boolean).join('\n'),
    })

    if (!input.blueprintId && input.packageItem.moduleKeys.length) {
      await Promise.all(input.packageItem.moduleKeys.map(moduleKey => (
        platformService.setContractModule(contract.id, moduleKey, true)
      )))
    }

    const blueprintRun = input.blueprintId
      ? await platformService.applyBlueprintToContract({
          blueprintId: input.blueprintId,
          contractId: contract.id,
          organizationId: organization.id,
        })
      : undefined

    await updateConvertedLead(input, clientId)

    return {
      clientId,
      organization,
      contract: await platformService.getContractById(contract.id),
      blueprintRun,
    }
  },
}
