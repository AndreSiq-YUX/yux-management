import { z } from 'zod'
import {
  evaluateProfileRule, matchesQualification, qualificationBandsError,
  qualificationBandSchema, qualificationComparisonSchema, qualificationOperatorSchema,
} from './qualification.js'

const id = z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/)
const label = z.string().trim().min(1).max(120)
const points = z.number().int().min(0).max(100)
const days = z.number().int().min(1).max(730)
const recordTypeId = z.string().uuid().nullable().default(null)
const channels = z.enum(['whatsapp', 'email', 'call', 'meeting', 'crm'])
const signalKind = z.enum([
  'buyer_reply', 'quote_requested', 'meeting_booked', 'meeting_completed',
  'purchase_window', 'not_interested', 'task_completed', 'stage_changed',
])
const bandSchema = qualificationBandSchema.extend({ points })
const predicate = z.object({
  fieldKey: z.string().min(1).max(160),
  operator: qualificationOperatorSchema.default('exists'),
  comparisonValue: qualificationComparisonSchema.optional(),
  recordTypeId,
}).strict()
const alternative = predicate.extend({
  points: points.default(0),
  bands: z.array(bandSchema).max(20).default([]),
  estimated: z.boolean().default(false),
})
const signalRule = z.object({
  kind: signalKind,
  channel: channels.optional(),
  points: points.default(0),
  validForDays: days.optional(),
  buyerRelevant: z.boolean().default(false),
  purchaseBands: z.array(bandSchema).max(20).default([]),
}).strict()
const fitGroup = z.object({
  id, label, recordTypeId, maxPoints: points.min(1),
  alternatives: z.array(alternative).min(1).max(20),
}).strict()
const interestGroup = z.object({
  id, label, maxPoints: points.min(1),
  strategy: z.enum(['max', 'sumCapped']),
  rules: z.array(signalRule).min(1).max(20),
}).strict()
const band = z.object({ id, label, min: points }).strict()
const timeZone = z.string().max(80).refine(value => {
  try { new Intl.DateTimeFormat('en', { timeZone: value }); return true }
  catch { return false }
}, 'Fuso horário inválido.')

export const priorityDefinitionSchema = z.object({
  fitWeight: points,
  temperatureWeight: points,
  minimumCoverage: points,
  fitGroups: z.array(fitGroup).min(1).max(30),
  interestGroups: z.array(interestGroup).max(20).default([]),
  penalties: z.object({
    maxPoints: points.min(1),
    rules: z.array(signalRule).min(1).max(20),
  }).strict().optional(),
  inactivity: z.array(z.object({ afterDays: days, points }).strict()).max(20).default([]),
  historyDays: days,
  timeZone: timeZone.default('UTC'),
  fitBands: z.array(band).min(1).max(10),
  temperatureBands: z.array(band).min(1).max(10),
  queues: z.array(z.object({
    id, label,
    recommendation: z.string().trim().max(240).optional(),
    taskDueDays: days.optional(),
  }).strict()).min(1).max(20),
  matrix: z.array(z.object({ fitBandId: id, temperatureBandId: id, queueId: id }).strict()).max(100),
  exclusions: z.array(predicate.extend({ id, label })).max(30).default([]),
}).strict().superRefine((definition, context) => {
  const issue = (message: string) => context.addIssue({ code: 'custom', message })
  if (definition.fitWeight + definition.temperatureWeight !== 100)
    issue('Os pesos de potencial e temperatura devem somar 100.')
  if (definition.queues.some(queue => queue.taskDueDays !== undefined && !queue.recommendation))
    issue('Preencha a próxima ação sugerida nas filas com criação de tarefa.')
  for (const entries of [definition.fitGroups, definition.interestGroups, definition.fitBands, definition.temperatureBands, definition.queues, definition.exclusions]) {
    if (new Set(entries.map(entry => entry.id)).size !== entries.length)
      issue('Os identificadores devem ser únicos em cada conjunto.')
  }
  for (const bands of [definition.fitBands, definition.temperatureBands]) {
    if (bands[0]?.min !== 0 || bands.some((entry, i) => i > 0 && entry.min <= bands[i - 1].min))
      issue('As faixas de classificação devem começar em zero e estar em ordem crescente.')
  }
  const matrixKeys = new Set(definition.matrix.map(cell => `${cell.fitBandId}:${cell.temperatureBandId}`))
  if (matrixKeys.size !== definition.matrix.length ||
      definition.matrix.length !== definition.fitBands.length * definition.temperatureBands.length ||
      definition.matrix.some(cell =>
        !definition.fitBands.some(entry => entry.id === cell.fitBandId) ||
        !definition.temperatureBands.some(entry => entry.id === cell.temperatureBandId) ||
        !definition.queues.some(entry => entry.id === cell.queueId)))
    issue('A matriz deve associar cada combinação de faixas a uma única fila.')

  for (const group of definition.fitGroups) {
    for (const rule of group.alternatives) {
      if (group.recordTypeId && rule.recordTypeId && group.recordTypeId !== rule.recordTypeId)
        issue('O tipo da alternativa deve ser compatível com o grupo.')
      const error = qualificationBandsError(rule.bands)
      if (error) issue(error)
      if (rule.points > group.maxPoints || rule.bands.some(entry => entry.points > group.maxPoints))
        issue('Os pontos da alternativa devem respeitar o teto do grupo.')
    }
  }
  for (const group of [...definition.interestGroups, ...(definition.penalties ? [definition.penalties] : [])]) {
    for (const rule of group.rules) {
      if (rule.validForDays && rule.validForDays > definition.historyDays)
        issue('A validade do sinal deve caber na janela histórica.')
      if (rule.purchaseBands.length && rule.kind !== 'purchase_window')
        issue('Faixas de prazo exigem uma previsão de compra.')
      if (rule.kind === 'purchase_window' && !rule.purchaseBands.length)
        issue('A previsão de compra exige faixas de dias até a data prevista.')
      if (rule.purchaseBands.some(band => [band.min, band.max].some(bound => bound !== null && (!Number.isInteger(bound) || bound < 0))))
        issue('Os limites da previsão de compra devem ser dias inteiros não negativos.')
      const error = qualificationBandsError(rule.purchaseBands)
      if (error) issue(error)
    }
  }
  if (definition.inactivity.some((entry, i) => entry.afterDays >= definition.historyDays ||
      (i > 0 && entry.afterDays <= definition.inactivity[i - 1].afterDays)))
    issue('As faixas de inatividade devem estar ordenadas e caber na janela histórica.')
})

export type PriorityDefinition = z.infer<typeof priorityDefinitionSchema>
export type PriorityVersion = { id: string; revision: number; definition: PriorityDefinition }
export type PrioritySignal = {
  id: string
  canonicalKey: string
  kind: string
  channel: z.infer<typeof channels>
  actor: 'buyer' | 'operator' | 'system'
  occurredAt: string
  targetDate?: string
}
export type PriorityInput = {
  leadId: string
  recordTypeId: string | null
  fields: Record<string, string | number | boolean | null>
  archivedFieldKeys?: ReadonlySet<string>
  signals: readonly PrioritySignal[]
  status: 'open' | 'won' | 'lost'
  deleted: boolean
  contactBlocked: boolean
}
export type PriorityReason =
  | { kind: 'criterion'; id: string; label: string; fieldKey: string; points: number; estimated: boolean }
  | { kind: 'missing_data'; id: string; label: string; fieldKeys: string[]; archivedFieldKeys: string[] }
  | { kind: 'signal' | 'expired_signal' | 'penalty'; id: string; label: string; points: number; signalId?: string; occurredAt?: string }
  | { kind: 'exclusion'; id: string; label: string }

export type PriorityResult = {
  versionId: string
  fitScore: number | null
  temperatureScore: number
  priorityScore: number | null
  coveragePercent: number
  fitBandId: string | null
  temperatureBandId: string
  queueId: string | null
  state: 'ranked' | 'needs_data' | 'excluded'
  reasons: readonly PriorityReason[]
  nextEvaluationAt: string | null
}

const DAY = 86_400_000

function hasKnownField(rule: z.infer<typeof predicate>, input: PriorityInput) {
  const value = input.fields[rule.fieldKey]
  return (!rule.recordTypeId || rule.recordTypeId === input.recordTypeId) &&
    !input.archivedFieldKeys?.has(rule.fieldKey) &&
    value !== undefined && value !== null && value !== '' &&
    (typeof value !== 'number' || Number.isFinite(value))
}

function scoreFit(definition: PriorityDefinition, input: PriorityInput, reasons: PriorityReason[]) {
  let scored = 0
  let known = 0
  let applicable = 0
  const context = { ...input.fields, recordTypeId: input.recordTypeId }
  for (const group of definition.fitGroups) {
    if (group.recordTypeId && group.recordTypeId !== input.recordTypeId) continue
    const rules = group.alternatives.filter(rule => !rule.recordTypeId || rule.recordTypeId === input.recordTypeId)
    if (!rules.length) continue
    applicable += group.maxPoints
    const selected = rules.findIndex(rule => hasKnownField(rule, input) && (!rule.bands.length || typeof input.fields[rule.fieldKey] === 'number'))
    const skipped = selected < 0 ? rules : rules.slice(0, selected)
    if (skipped.length) {
      const fieldKeys = [...new Set(skipped.map(item => item.fieldKey))]
      reasons.push({
        kind: 'missing_data', id: group.id, label: group.label, fieldKeys,
        archivedFieldKeys: fieldKeys.filter(key => input.archivedFieldKeys?.has(key)),
      })
    }
    if (selected < 0) continue
    const rule = rules[selected]
    const points = evaluateProfileRule(rule, context)
    known += group.maxPoints
    scored += points
    reasons.push({ kind: 'criterion', id: group.id, label: group.label, fieldKey: rule.fieldKey, points, estimated: rule.estimated })
  }
  return {
    fitScore: known ? Math.round(100 * scored / known) : null,
    coveragePercent: applicable ? Math.floor(100 * known / applicable) : 0,
  }
}

function localDay(time: number, formatter: Intl.DateTimeFormat) {
  const parts = formatter.formatToParts(time)
  const value = (type: string) => Number(parts.find(part => part.type === type)?.value)
  return Date.UTC(value('year'), value('month') - 1, value('day'))
}

function startOfLocalDay(now: number, formatter: Intl.DateTimeFormat, target: number, daysUntilTarget: number) {
  let left = now
  let right = now + daysUntilTarget * DAY + 36 * 3_600_000
  while (right - left > 1) {
    const middle = Math.floor((left + right) / 2)
    if (localDay(middle, formatter) >= target) right = middle
    else left = middle
  }
  return right
}

type TimedSignal = PrioritySignal & { time: number }
type Candidate = { signal: TimedSignal; points: number }
function scoreInterest(definition: PriorityDefinition, input: PriorityInput, now: number, reasons: PriorityReason[]) {
  let next = Infinity
  let lastBuyer = -Infinity
  const due = (time: number) => { if (time > now) next = Math.min(next, time) }
  const signals = input.signals.map(signal => ({ ...signal, time: Date.parse(signal.occurredAt) }))
    .filter(signal => signal.time <= now && signal.time > now - definition.historyDays * DAY)
    .sort((a, b) => b.time - a.time || a.id.localeCompare(b.id))
  const latestPurchase = signals.find(signal => signal.kind === 'purchase_window')
  const purchaseDate = latestPurchase?.targetDate
  const formatter = purchaseDate ? new Intl.DateTimeFormat('en', {
    timeZone: definition.timeZone, year: 'numeric', month: 'numeric', day: 'numeric',
  }) : null
  const day = formatter ? localDay(now, formatter) : 0
  const targetDate = purchaseDate && /^\d{4}-\d{2}-\d{2}$/.test(purchaseDate) ? Date.parse(purchaseDate) : NaN
  const daysLeft = (targetDate - day) / DAY
  const purchaseBoundaries = new Map<number, number>()

  function scoreGroup(group: { id: string; label: string; rules: z.infer<typeof signalRule>[]; maxPoints: number; strategy: 'max' | 'sumCapped' }, penalty: boolean) {
    const canonical = new Map<string, Candidate>()
    const expired = new Map<string, TimedSignal>()
    for (const signal of signals) {
      for (const rule of group.rules) {
        if (rule.kind !== signal.kind || (rule.channel && rule.channel !== signal.channel)) continue
        const historyEnd = signal.time + definition.historyDays * DAY
        due(historyEnd)
        if (rule.buyerRelevant && signal.actor === 'buyer' && !['task_completed', 'stage_changed'].includes(signal.kind))
          lastBuyer = Math.max(lastBuyer, signal.time)
        const expiry = signal.time + (rule.validForDays ?? definition.historyDays) * DAY
        if (expiry <= now) {
          if (!expired.has(signal.canonicalKey)) expired.set(signal.canonicalKey, signal)
          continue
        }
        due(expiry)
        let points = rule.points
        if (rule.kind === 'purchase_window') {
          if (signal !== latestPurchase || !formatter || !Number.isInteger(daysLeft)) continue
          if (daysLeft < 0) {
            if (!expired.has(signal.canonicalKey)) expired.set(signal.canonicalKey, signal)
            continue
          }
          const bounds = rule.purchaseBands.flatMap(band => [band.min, band.max])
            .filter((bound): bound is number => bound !== null && bound <= daysLeft)
          const untilBoundary = daysLeft - Math.max(0, ...bounds) + 1
          let boundary = purchaseBoundaries.get(untilBoundary)
          if (boundary === undefined) {
            boundary = startOfLocalDay(now, formatter, day + untilBoundary * DAY, untilBoundary)
            purchaseBoundaries.set(untilBoundary, boundary)
          }
          due(boundary)
          points = rule.purchaseBands.find(band => (band.min === null || daysLeft >= band.min) &&
            (band.max === null || daysLeft < band.max))?.points ?? 0
        }
        if (points > (canonical.get(signal.canonicalKey)?.points ?? 0))
          canonical.set(signal.canonicalKey, { signal, points })
      }
    }
    for (const [key, signal] of expired) {
      if (!canonical.has(key))
        reasons.push({ kind: 'expired_signal', id: group.id, label: group.label, points: 0, signalId: signal.id, occurredAt: signal.occurredAt })
    }
    const ranked = [...canonical.values()].sort((a, b) => b.points - a.points || b.signal.time - a.signal.time || a.signal.id.localeCompare(b.signal.id))
    let total = 0
    for (const { signal, points } of ranked) {
      const contribution = Math.min(points, group.maxPoints - total)
      if (contribution <= 0) break
      total += contribution
      reasons.push({ kind: penalty ? 'penalty' : 'signal', id: group.id, label: group.label, points: penalty ? -contribution : contribution, signalId: signal.id, occurredAt: signal.occurredAt })
      if (group.strategy === 'max') break
    }
    return total
  }

  const positive = definition.interestGroups.reduce((sum, group) => sum + scoreGroup(group, false), 0)
  const negative = definition.penalties ? scoreGroup({
    ...definition.penalties, id: 'signal_penalties', label: 'Penalidades comerciais', strategy: 'sumCapped',
  }, true) : 0
  let inactivity = 0
  if (Number.isFinite(lastBuyer)) {
    for (const band of definition.inactivity) {
      const starts = lastBuyer + band.afterDays * DAY
      if (starts <= now) inactivity = band.points
      else due(starts)
    }
  }
  if (inactivity) reasons.push({ kind: 'penalty', id: 'inactivity', label: 'Inatividade do comprador', points: -inactivity, occurredAt: new Date(lastBuyer).toISOString() })
  return {
    temperatureScore: Math.max(0, Math.min(100, positive - negative - inactivity)),
    nextEvaluationAt: Number.isFinite(next) ? new Date(next).toISOString() : null,
  }
}

export function evaluatePriority(version: PriorityVersion, input: PriorityInput, now: Date): PriorityResult {
  const definition = version.definition
  const reasons: PriorityReason[] = []
  const { fitScore, coveragePercent } = scoreFit(definition, input, reasons)
  const { temperatureScore, nextEvaluationAt } = scoreInterest(definition, input, now.getTime(), reasons)
  const fitBandId = fitScore === null ? null : definition.fitBands.filter(band => fitScore >= band.min).at(-1)!.id
  const temperatureBandId = definition.temperatureBands.filter(band => temperatureScore >= band.min).at(-1)!.id
  if (input.status !== 'open' || input.deleted)
    reasons.push({ kind: 'exclusion', id: 'closed', label: 'Lead fora da carteira ativa' })
  if (input.contactBlocked)
    reasons.push({ kind: 'exclusion', id: 'contact_blocked', label: 'Contato bloqueado' })
  const context = { ...input.fields, recordTypeId: input.recordTypeId }
  for (const rule of definition.exclusions) {
    if (hasKnownField(rule, input) && matchesQualification(rule, context))
      reasons.push({ kind: 'exclusion', id: rule.id, label: rule.label })
  }
  const state = reasons.some(reason => reason.kind === 'exclusion') ? 'excluded'
    : fitScore === null || coveragePercent < definition.minimumCoverage ? 'needs_data' : 'ranked'
  const queue = state === 'ranked' ? definition.matrix.find(cell => cell.fitBandId === fitBandId && cell.temperatureBandId === temperatureBandId) : undefined
  return {
    versionId: version.id, fitScore, temperatureScore, coveragePercent, fitBandId, temperatureBandId, state,
    priorityScore: queue && fitScore !== null ? Math.round((fitScore * definition.fitWeight + temperatureScore * definition.temperatureWeight) / 100) : null,
    queueId: queue?.queueId ?? null,
    reasons, nextEvaluationAt,
  }
}
