import { canMemberSeeLead } from '@/lib/crm/governanceRules'
import type { CrmInstanceMember, CrmLead, CrmTeamMember } from '@/types/crm'
import type { PackageDefinition } from '@/types/platform'
import type {
  ClosingApprovalDecision,
  ClosingProposalLike,
  ConversionPlan,
  ConversionRunLike,
  PackageRecommendation,
  ProposalFromLeadDraft,
} from '@/types/crmClosing'

const normalize = (value?: string | null) => (value || '').trim().toLowerCase()

const sourceModuleHints: Record<string, string[]> = {
  paid_campaign: ['campaigns', 'reports'],
  landing_page: ['landing_pages', 'reports'],
  whatsapp_cta: ['whatsapp_ai', 'omnichannel'],
  organic: ['crm', 'reports'],
  referral: ['crm', 'proposals'],
  manual: ['crm'],
}

const segmentModuleHints: Record<string, string[]> = {
  clinica: ['crm', 'whatsapp_ai', 'reports'],
  medico: ['crm', 'whatsapp_ai', 'support'],
  imobiliaria: ['crm', 'proposals', 'campaigns'],
  ecommerce: ['campaigns', 'landing_pages', 'reports'],
  agencia: ['projects', 'proposals', 'reports'],
  consultoria: ['crm', 'proposals', 'automations'],
}

export const recommendPackageForLead = (
  lead: Pick<CrmLead, 'sourceKind' | 'segment' | 'interest' | 'value'>,
  packages: PackageDefinition[],
): PackageRecommendation | null => {
  if (!packages.length) return null

  const hints = new Set<string>(['crm'])
  sourceModuleHints[lead.sourceKind || 'manual']?.forEach(item => hints.add(item))

  const segment = normalize(lead.segment || lead.interest)
  Object.entries(segmentModuleHints).forEach(([key, moduleKeys]) => {
    if (segment.includes(key)) moduleKeys.forEach(item => hints.add(item))
  })

  if ((lead.value || 0) >= 10000) {
    hints.add('proposals')
    hints.add('projects')
    hints.add('finance')
  }

  const ranked = packages.map(pkg => {
    const matchingModules = pkg.moduleKeys.filter(moduleKey => hints.has(moduleKey))
    const score = matchingModules.length * 25 + (pkg.moduleKeys.includes('crm') ? 10 : 0)
    return {
      package: pkg,
      score,
      reasons: matchingModules.map(moduleKey => `module:${moduleKey}`),
      moduleKeys: Array.from(new Set([...matchingModules, ...pkg.moduleKeys.filter(key => key === 'crm' || key === 'proposals')])),
    }
  }).sort((a, b) => b.score - a.score)

  return ranked[0] || null
}

export const canCreateProposalFromLead = (
  member: CrmInstanceMember | undefined,
  lead: Pick<CrmLead, 'ownerMemberId' | 'teamId' | 'status'>,
  teamMemberships: CrmTeamMember[] = [],
) => {
  if (!member) return { allowed: false as const, reason: 'missing_member' as const }
  if (lead.status === 'lost') return { allowed: false as const, reason: 'lost_lead' as const }
  if (!canMemberSeeLead(member, lead, teamMemberships)) return { allowed: false as const, reason: 'lead_not_accessible' as const }
  return { allowed: true as const }
}

export const buildProposalFromLeadDraft = (
  lead: CrmLead,
  recommendation: PackageRecommendation,
): ProposalFromLeadDraft => ({
  organizationId: lead.organizationId,
  leadId: lead.id,
  packageId: recommendation.package.id,
  recommendedPackageId: recommendation.package.id,
  crmInstanceId: lead.crmInstanceId,
  title: `Proposta - ${lead.name}`,
  billingCycle: 'monthly',
  selectedModuleKeys: recommendation.moduleKeys.length ? recommendation.moduleKeys : recommendation.package.moduleKeys,
  scope: [
    lead.company ? `Cliente: ${lead.company}` : '',
    lead.interest ? `Interesse: ${lead.interest}` : '',
    lead.aiSummary ? `Resumo IA: ${lead.aiSummary}` : '',
  ].filter(Boolean).join('\n'),
})

export const requiresClosingApproval = (
  proposal: Pick<ClosingProposalLike, 'finalValue' | 'selectedModuleKeys'>,
  threshold = 20000,
): ClosingApprovalDecision => {
  const reasons: string[] = []
  if ((proposal.finalValue || 0) >= threshold) reasons.push('high_value')
  if (proposal.selectedModuleKeys.includes('finance')) reasons.push('finance_module')
  if (proposal.selectedModuleKeys.includes('contracts')) reasons.push('contract_sensitive')

  return { required: reasons.length > 0, reasons }
}

const normalizeRunStatus = (run: Pick<ConversionRunLike, 'status'>) => run.status

export const buildConversionPlan = (
  proposal: Pick<ClosingProposalLike, 'id' | 'status'>,
  runs: ConversionRunLike[] = [],
): ConversionPlan => {
  const idempotencyKey = `proposal:${proposal.id}:conversion`
  const completed = runs.some(run => normalizeRunStatus(run) === 'completed')
  const running = runs.some(run => normalizeRunStatus(run) === 'running' || normalizeRunStatus(run) === 'pending')
  const maxAttempt = runs.reduce((max, run) => Math.max(max, Number(run.attemptNumber || 0)), 0)

  if (proposal.status === 'converted' || completed) {
    return { canRun: false, idempotencyKey, nextAttemptNumber: maxAttempt + 1, blockedReason: 'already_converted' }
  }

  if (running) {
    return { canRun: false, idempotencyKey, nextAttemptNumber: maxAttempt + 1, blockedReason: 'conversion_in_progress' }
  }

  if (proposal.status !== 'approved') {
    return { canRun: false, idempotencyKey, nextAttemptNumber: maxAttempt + 1, blockedReason: 'proposal_not_approved' }
  }

  return { canRun: true, idempotencyKey, nextAttemptNumber: maxAttempt + 1 }
}

export const isConversionRetryable = (run?: Pick<ConversionRunLike, 'status'> & { error?: string }) => (
  Boolean(run && normalizeRunStatus(run) === 'failed')
)
