import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { runWithDatabaseRequestContext } from '../../db/request-context.js'
import { submitLeadForm } from './repository.js'

const paramsSchema = z.object({ token: z.string().min(32).max(200) })

export async function registerPublicLeadFormRoutes(app: FastifyInstance) {
  app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (_request, body, done) => {
    done(null, Object.fromEntries(new URLSearchParams(typeof body === 'string' ? body : body.toString('utf8'))))
  })

  app.post('/:token/submissions', {
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const params = paramsSchema.safeParse(request.params)
    if (!params.success) return reply.code(404).send({ accepted: false, error: 'lead_form_not_found' })

    const payload = normalizePayload(request.body)
    if (!payload || Object.keys(payload).length === 0) {
      return reply.code(400).send({ accepted: false, error: 'invalid_lead_form_payload' })
    }

    const idempotencyKey = headerString(request.headers['idempotency-key'])
      || stablePayloadHash(payload)
    const externalSubmissionId = headerString(request.headers['x-external-submission-id'])

    try {
      const result = await runWithDatabaseRequestContext(
        { role: 'yux_admin', organizationIds: [] },
        () => submitLeadForm(app.pg, {
          payload,
          idempotencyKey,
          externalSubmissionId,
          origin: headerString(request.headers.origin),
          language: headerString(request.headers['accept-language']),
          referrer: headerString(request.headers.referer),
        }, params.data.token),
      )

      if (result.event) {
        try {
          await app.jobQueue.add('automation.dispatch', {
            requestedBy: 'public-lead-form',
            event: {
              ...result.event,
              eventId: `${result.formId}:${idempotencyKey}`,
            },
          })
        } catch (error) {
          request.log.error(error, 'lead form automation dispatch failed')
          return reply.code(503).send({
            accepted: false,
            error: 'lead_created_automation_unavailable',
            leadId: result.leadId,
          })
        }
      }

      return reply.code(result.duplicate ? 200 : 201).send({
        accepted: true,
        duplicate: result.duplicate,
        leadId: result.leadId,
        formId: result.formId,
      })
    } catch (error) {
      const statusCode = getStatusCode(error)
      const message = error instanceof Error ? error.message : 'lead_form_submission_failed'
      if (statusCode >= 500) request.log.error(error, 'lead form submission failed')
      return reply.code(statusCode).send({ accepted: false, error: message })
    }
  })
}

function normalizePayload(body: unknown): Record<string, unknown> | null {
  if (Buffer.isBuffer(body)) {
    try { return normalizePayload(JSON.parse(body.toString('utf8'))) } catch { return null }
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null
  const parsed = z.record(z.string(), z.unknown()).safeParse(body)
  return parsed.success ? parsed.data : null
}

function headerString(value: string | string[] | undefined) {
  return typeof value === 'string' ? value.trim() : Array.isArray(value) ? value[0]?.trim() : ''
}

function stablePayloadHash(payload: Record<string, unknown>) {
  const canonicalPayload = Object.entries(payload)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}:${stableSerialize(value)}`)
    .join('|')
  return createHash('sha256').update(canonicalPayload).digest('hex')
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${key}:${stableSerialize(item)}`)
      .join(',')}}`
  }
  return String(value ?? '')
}

function getStatusCode(error: unknown) {
  if (!error || typeof error !== 'object' || !('statusCode' in error)) return 500
  const statusCode = Reflect.get(error, 'statusCode')
  return typeof statusCode === 'number' ? statusCode : 500
}
