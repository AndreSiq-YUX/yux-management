import type {
  CrmCockpitFilterState,
  CrmCockpitLead,
  CrmLeadTemperature,
  CrmLossReasonConfig,
  LeadImportPreview,
  LossReasonStage,
  StageAgeInput,
} from '@/types/crmCockpit'

const DAY_MS = 24 * 60 * 60 * 1000

const normalize = (value?: string | null) => (value || '').trim().toLowerCase()

const normalizePhone = (value?: string | null) => (value || '').replace(/\D/g, '')

const splitCsvLine = (line: string) => {
  const cells: string[] = []
  let current = ''
  let quoted = false

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    const next = line[index + 1]

    if (char === '"' && quoted && next === '"') {
      current += '"'
      index += 1
    } else if (char === '"') {
      quoted = !quoted
    } else if (char === ',' && !quoted) {
      cells.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }

  cells.push(current.trim())
  return cells
}

export const calculateStageAge = (lead: StageAgeInput, now = new Date()) => {
  const enteredAt = lead.currentStageEnteredAt || lead.updatedAt || lead.createdAt
  const enteredDate = new Date(enteredAt)

  if (Number.isNaN(enteredDate.getTime())) return 0

  return Math.max(0, Math.floor((now.getTime() - enteredDate.getTime()) / DAY_MS))
}

export const isLeadStalled = (
  lead: StageAgeInput & Pick<CrmCockpitLead, 'status'>,
  thresholdDays = 3,
  now = new Date(),
) => (lead.status || 'open') === 'open' && calculateStageAge(lead, now) >= thresholdDays

export const rankTodayLead = (lead: CrmCockpitLead, now = new Date()) => {
  let rank = lead.score || 0
  const nextFollowUpAt = lead.nextFollowUpAt ? new Date(lead.nextFollowUpAt) : null

  if (nextFollowUpAt && nextFollowUpAt.getTime() <= now.getTime()) rank += 100
  if (lead.temperature === 'hot') rank += 70
  if (lead.urgency === 'high') rank += 50
  if (isLeadStalled(lead, 3, now)) rank += 30
  if (!lead.ownerMemberId && !lead.assignedTo && !lead.ownerId) rank += 15

  return rank
}

export const requiresLossReason = (
  stage: LossReasonStage,
  reasons: CrmLossReasonConfig[],
) => stage.isLost && reasons.some(reason => (
  reason.isActive &&
  reason.requiredForLost &&
  (!reason.stageId || reason.stageId === stage.id)
))

export const detectDuplicateLeadCandidates = (
  leads: CrmCockpitLead[],
  candidate: Pick<CrmCockpitLead, 'id' | 'email' | 'phone' | 'whatsappPhone'>,
) => {
  const candidateEmail = normalize(candidate.email)
  const candidatePhones = [
    normalizePhone(candidate.phone),
    normalizePhone(candidate.whatsappPhone),
  ].filter(Boolean)

  return leads.filter(lead => {
    if (candidate.id && lead.id === candidate.id) return false

    const emailMatch = candidateEmail && normalize(lead.email) === candidateEmail
    const phoneMatch = candidatePhones.some(phone => (
      phone === normalizePhone(lead.phone) ||
      phone === normalizePhone(lead.whatsappPhone)
    ))

    return Boolean(emailMatch || phoneMatch)
  })
}

const looksLikeEmail = (value?: string) => Boolean(value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))

const temperatureValues: CrmLeadTemperature[] = ['hot', 'warm', 'cold', 'unqualified']

export const buildCsvImportPreview = (csv: string): LeadImportPreview => {
  const lines = csv.split(/\r?\n/).filter(line => line.trim().length > 0)

  if (lines.length === 0) {
    return { rows: [], validRows: 0, invalidRows: 0 }
  }

  const headers = splitCsvLine(lines[0]).map(normalize)
  const rows = lines.slice(1).map((line, index) => {
    const cells = splitCsvLine(line)
    const raw = Object.fromEntries(headers.map((header, cellIndex) => [header, cells[cellIndex] || '']))
    const errors: string[] = []
    const lead: Partial<CrmCockpitLead> = {
      name: raw.name || raw.nome || '',
      email: raw.email || '',
      phone: raw.phone || raw.telefone || undefined,
      whatsappPhone: raw.whatsapp || raw.whatsapp_phone || undefined,
      company: raw.company || raw.empresa || undefined,
      source: raw.source || raw.origem || 'CSV',
      score: Number(raw.score || 0),
      value: raw.value || raw.valor ? Number(raw.value || raw.valor) : undefined,
      temperature: temperatureValues.includes(raw.temperature as CrmLeadTemperature)
        ? raw.temperature as CrmLeadTemperature
        : undefined,
    }

    if (!lead.name) errors.push('name_required')
    if (!lead.email && !lead.phone && !lead.whatsappPhone) errors.push('contact_required')
    if (lead.email && !looksLikeEmail(lead.email)) errors.push('invalid_email')
    if (Number.isNaN(lead.score)) errors.push('invalid_score')
    if (lead.value !== undefined && Number.isNaN(lead.value)) errors.push('invalid_value')

    return {
      rowNumber: index + 2,
      raw,
      lead,
      errors,
    }
  })

  return {
    rows,
    validRows: rows.filter(row => row.errors.length === 0).length,
    invalidRows: rows.filter(row => row.errors.length > 0).length,
  }
}

export const applyCockpitFilters = (
  leads: CrmCockpitLead[],
  filters: CrmCockpitFilterState,
  now = new Date(),
) => leads.filter(lead => {
  if (filters.search) {
    const haystack = [lead.name, lead.email, lead.company, lead.phone, lead.whatsappPhone].map(normalize).join(' ')
    if (!haystack.includes(normalize(filters.search))) return false
  }

  if (filters.ownerMemberId && lead.ownerMemberId !== filters.ownerMemberId) return false
  if (filters.teamId && lead.teamId !== filters.teamId) return false
  if (filters.source && normalize(lead.source) !== normalize(filters.source)) return false
  if (filters.campaignId && lead.attributionContext?.campaignId !== filters.campaignId) return false
  if (filters.stageId && lead.stageId !== filters.stageId) return false
  if (filters.minValue !== undefined && (lead.value || 0) < filters.minValue) return false
  if (filters.maxValue !== undefined && (lead.value || 0) > filters.maxValue) return false
  if (filters.temperature && lead.temperature !== filters.temperature) return false
  if (filters.stalledOnly && !isLeadStalled(lead, 3, now)) return false
  if (filters.tagIds?.length && !filters.tagIds.every(tagId => lead.tagIds?.includes(tagId))) return false

  return true
})
