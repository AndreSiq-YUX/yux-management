import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import type pg from 'pg'
import { renderSimulationReportPdf } from './simulation-report-pdf.js'

type Queryable = Pick<pg.Pool, 'query'>

export type SimulationReportSnapshot = {
  schemaVersion: 1
  redactionVersion: 1
  reportId: string
  reportHash: string
  missionTitle: string
  objective: string
  planRevision: number
  changes: Array<{ quantity: number; label: string }>
  contactImpact: { existingContacts: number; futureEligibleContacts: boolean; channels: string[] }
  economics: { estimatedCostBrl: string; maximumCostBrl: string; estimatedHumanMinutes: number }
  irreversibleEffects: Array<{ description: string }>
  assumptions: Array<{ key: string; value: string; source: string }>
  technicalProof: { packVersion: string; planHash: string; manifestHash: string; sourceCount: number }
  createdAt: string
  expiresAt: string
  disclaimer: string
}

type ReportRow = {
  id: string
  organization_id: string
  mission_id: string
  plan_id: string
  token_hash: string
  report_hash: string
  snapshot: SimulationReportSnapshot
  pdf_data: Buffer
  expires_at: string
  revoked_at: string | null
}

export async function createSimulationReport(db: Queryable, input: {
  organizationId: string
  missionId: string
  planId: string
  createdBy: string
  expiresInDays?: number
  now?: Date
}) {
  const expiresInDays = Math.max(1, Math.min(7, Math.floor(input.expiresInDays ?? 7)))
  const now = input.now ?? new Date()
  const source = await loadSimulationSource(db, input)
  if (!source) throw new Error('simulation_plan_not_found')
  if (source.mode !== 'shadow') throw new Error('simulation_report_requires_shadow_mode')
  const reportId = randomUUID()
  const secret = randomBytes(32).toString('base64url')
  const token = `${reportId}.${secret}`
  const expiresAt = new Date(now.getTime() + expiresInDays * 24 * 60 * 60 * 1_000).toISOString()
  const snapshotWithoutHash = buildSimulationSnapshot(source, { reportId, createdAt: now.toISOString(), expiresAt })
  const reportHash = hashStable(snapshotWithoutHash)
  const snapshot: SimulationReportSnapshot = { ...snapshotWithoutHash, reportHash }
  const pdfData = await renderSimulationReportPdf(snapshot)
  await db.query(
    `INSERT INTO public.action_simulation_reports (
       id, organization_id, mission_id, plan_id, plan_revision, token_hash, report_hash,
       redaction_version, snapshot, pdf_data, expires_at, created_by
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,1,$8,$9,$10,$11)`,
    [reportId, input.organizationId, input.missionId, input.planId, source.revision,
      sha256(token), reportHash, snapshot, Buffer.from(pdfData), expiresAt, input.createdBy],
  )
  return { id: reportId, token, url: `/mission-simulation/review/${token}`, expiresAt, reportHash, snapshot }
}

export async function getPublicSimulationReport(db: Queryable, token: string) {
  const report = await loadReportByToken(db, token)
  return { id: report.id, reportHash: report.report_hash, expiresAt: report.expires_at, snapshot: report.snapshot }
}

export async function getPublicSimulationReportPdf(db: Queryable, token: string) {
  const report = await loadReportByToken(db, token)
  return { id: report.id, reportHash: report.report_hash, pdf: report.pdf_data }
}

export async function revokeSimulationReport(db: Queryable, input: { reportId: string; organizationId: string }) {
  const result = await db.query<{ id: string }>(
    `UPDATE public.action_simulation_reports SET revoked_at = COALESCE(revoked_at, NOW())
      WHERE id = $1 AND organization_id = $2 RETURNING id`,
    [input.reportId, input.organizationId],
  )
  if (!result.rows[0]) throw new Error('simulation_report_not_found')
  return { id: result.rows[0].id, revoked: true }
}

export async function recordSimulationFeedback(db: Queryable, token: string, input: {
  reviewerName: string
  decision: 'support' | 'request_changes' | 'reject'
  reasonKey?: string
  comment?: string
}) {
  const report = await loadReportByToken(db, token)
  const result = await db.query<{ id: string; created_at: string }>(
    `INSERT INTO public.action_simulation_report_feedback (report_id, reviewer_name, decision, reason_key, comment)
     VALUES ($1,$2,$3,$4,$5) RETURNING id, created_at`,
    [report.id, redactText(input.reviewerName, 100), input.decision, input.reasonKey ?? null, input.comment ? redactText(input.comment, 2000) : null],
  )
  if (!result.rows[0]) throw new Error('simulation_feedback_not_recorded')
  return { id: result.rows[0].id, decision: input.decision, createdAt: result.rows[0].created_at, executionApproved: false }
}

async function loadSimulationSource(db: Queryable, input: { organizationId: string; missionId: string; planId: string }) {
  const result = await db.query<{
    mission_title: string; objective: string; mode: string; revision: number; plan_hash: string;
    pack_content_hash: string; capability_manifest_hash: string; requested_payload: Record<string, unknown>;
  }>(
    `SELECT mission.title AS mission_title, mission.objective, mission.mode, plan.revision,
            plan.plan_hash, plan.pack_content_hash, plan.capability_manifest_hash, approval.requested_payload
       FROM public.action_missions mission
       JOIN public.action_plans plan ON plan.mission_id = mission.id AND plan.organization_id = mission.organization_id
       JOIN public.action_approvals approval ON approval.plan_id = plan.id AND approval.approval_type IN ('plan','replan')
      WHERE mission.id = $1 AND mission.organization_id = $2 AND plan.id = $3
        AND plan.status IN ('pending_approval','approved','active','completed')
      ORDER BY approval.created_at DESC LIMIT 1`,
    [input.missionId, input.organizationId, input.planId],
  )
  return result.rows[0] ?? null
}

function buildSimulationSnapshot(source: Awaited<ReturnType<typeof loadSimulationSource>> & {}, input: { reportId: string; createdAt: string; expiresAt: string }): Omit<SimulationReportSnapshot, 'reportHash'> {
  const summary = record(source.requested_payload.decisionSummary)
  const contact = record(summary.contactImpact)
  const economics = record(summary.economics)
  const proof = record(summary.technicalProof)
  return {
    schemaVersion: 1, redactionVersion: 1, reportId: input.reportId,
    missionTitle: redactText(source.mission_title, 120), objective: redactText(String(summary.headline ?? source.objective), 1000),
    planRevision: source.revision,
    changes: array(summary.changes).map(item => ({ quantity: safeNumber(item.quantity), label: redactText(String(item.label ?? 'Alteracao planejada'), 160) })),
    contactImpact: {
      existingContacts: safeNumber(contact.existingContacts), futureEligibleContacts: contact.futureEligibleContacts === true,
      channels: Array.isArray(contact.channels) ? contact.channels.filter((item): item is string => typeof item === 'string').map(channel => redactText(channel, 30)) : [],
    },
    economics: {
      estimatedCostBrl: decimal(economics.estimatedCostBrl), maximumCostBrl: decimal(economics.maximumCostBrl),
      estimatedHumanMinutes: safeNumber(economics.estimatedHumanMinutes),
    },
    irreversibleEffects: array(summary.irreversibleEffects).map(item => ({ description: redactText(String(item.description ?? 'Efeito irreversivel'), 400) })),
    assumptions: array(summary.assumptions).map(item => ({ key: redactText(String(item.key ?? 'premissa'), 100), value: redactText(String(item.value ?? ''), 300), source: redactText(String(item.source ?? 'desconhecida'), 50) })),
    technicalProof: {
      packVersion: source.pack_content_hash, planHash: String(proof.planHash ?? source.plan_hash),
      manifestHash: String(proof.manifestHash ?? source.capability_manifest_hash), sourceCount: safeNumber(proof.sourceCount),
    },
    createdAt: input.createdAt, expiresAt: input.expiresAt,
    disclaimer: 'Simulacao - nenhum efeito executado. Este link coleta feedback, mas nao autoriza execucao.',
  }
}

async function loadReportByToken(db: Queryable, token: string): Promise<ReportRow> {
  const [id] = token.split('.', 1)
  if (!id || !/^[a-f0-9-]{36}$/i.test(id)) throw new Error('simulation_report_token_invalid')
  const result = await db.query<ReportRow>(
    `SELECT id, organization_id, mission_id, plan_id, token_hash, report_hash, snapshot,
            pdf_data, expires_at, revoked_at FROM public.action_simulation_reports WHERE id = $1 LIMIT 1`,
    [id],
  )
  const report = result.rows[0]
  if (!report || !safeHashEquals(report.token_hash, sha256(token))) throw new Error('simulation_report_token_invalid')
  if (report.revoked_at) throw new Error('simulation_report_revoked')
  if (new Date(report.expires_at).getTime() <= Date.now()) throw new Error('simulation_report_expired')
  return report
}

export function redactSimulationValue(value: string) { return redactText(value, 2000) }
function redactText(value: string, max: number) {
  return value.trim().slice(0, max)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email removido]')
    .replace(/(?:^|\D)\+?\d[\d\s().-]{7,}\d(?:\D|$)/g, match => `${match[0] ?? ''}[telefone removido]${match.at(-1) ?? ''}`)
    .replace(/(?:Bearer\s+|access[_ -]?token[:=]?\s*)[^\s]+/gi, '[segredo removido]')
    .replace(/(?:provider|external)[_ -]?(?:reference|id)[:=]?\s*[^\s,;]+/gi, '[referencia removida]')
}
function record(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {} }
function array(value: unknown): Array<Record<string, unknown>> { return Array.isArray(value) ? value.map(record) : [] }
function safeNumber(value: unknown) { const number = Number(value); return Number.isFinite(number) && number >= 0 ? number : 0 }
function decimal(value: unknown) { return typeof value === 'string' && /^\d+(\.\d{1,6})?$/.test(value) ? value : '0' }
function sha256(value: string) { return createHash('sha256').update(value).digest('hex') }
function hashStable(value: unknown) { return sha256(stableSerialize(value)) }
function stableSerialize(value: unknown): string { if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`; if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableSerialize(item)}`).join(',')}}`; return JSON.stringify(value) }
function safeHashEquals(left: string, right: string) { const a = Buffer.from(left); const b = Buffer.from(right); return a.length === b.length && timingSafeEqual(a, b) }
