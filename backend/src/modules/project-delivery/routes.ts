import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { requireMembership } from '../../http/guards.js'
import {
  projectRow,
  projectTaskRow,
  projectPhaseRow,
  projectDeliverableRow,
  approvalRequestRow,
  projectTimelineRow,
} from '../workspace/routes.js'
import { decisionSchema } from './validation.js'

const scopeSchema = z.object({ organizationId: z.string().uuid() })
const projectSchema = z.object({ projectId: z.string().uuid() })
const approvalSchema = projectSchema.extend({ approvalId: z.string().uuid() })

// Projects belong to clients; organizations link the authenticated workspace to that client.
const ownedProject = `SELECT p.id FROM public.projects p
  JOIN public.organizations o ON o.client_id = p.client_id
  WHERE p.id = $1 AND o.id = $2 AND NOT COALESCE(p.is_archived, false) AND p.status <> 'ARCHIVED'`

export async function registerProjectDeliveryRoutes(app: FastifyInstance) {
  app.get('/portal/approvals', async (request, reply) => {
    const scope = scopeSchema.safeParse(request.query)
    if (!scope.success)
      return reply.code(400).send({ error: 'invalid_project_scope' })
    requireMembership(request, scope.data.organizationId)
    const { rows } = await app.pg.query(
      `SELECT ar.* FROM public.approval_requests ar
      JOIN public.project_deliverables d ON d.id = ar.target_id AND d.project_id = ar.project_id
      JOIN public.projects p ON p.id = ar.project_id
      JOIN public.organizations o ON o.client_id = p.client_id
      WHERE o.id = $1 AND ar.target_type = 'deliverable' AND ar.is_client_visible = true AND d.is_client_visible = true
        AND NOT COALESCE(p.is_archived, false) AND p.status <> 'ARCHIVED'
      ORDER BY ar.submitted_at DESC`,
      [scope.data.organizationId]
    )
    return { approvals: rows.map(approvalRequestRow) }
  })

  app.get('/portal/projects', async (request, reply) => {
    const scope = scopeSchema.safeParse(request.query)
    if (!scope.success)
      return reply.code(400).send({ error: 'invalid_project_scope' })
    requireMembership(request, scope.data.organizationId)
    const { rows } = await app.pg.query(
      `SELECT p.id, p.name, p.description, p.status, p.priority, p.type,
      p.start_date, p.expected_end_date, p.actual_end_date, p.progress, p.client_id, p.created_at, p.updated_at
      FROM public.projects p JOIN public.organizations o ON o.client_id = p.client_id
      WHERE o.id = $1 AND NOT COALESCE(p.is_archived, false) AND p.status <> 'ARCHIVED'
      ORDER BY p.created_at DESC`,
      [scope.data.organizationId]
    )
    return { projects: rows.map(projectRow) }
  })

  app.get('/portal/projects/:projectId', async (request, reply) => {
    const scope = scopeSchema.safeParse(request.query)
    const params = projectSchema.safeParse(request.params)
    if (!scope.success || !params.success)
      return reply.code(400).send({ error: 'invalid_project_scope' })
    requireMembership(request, scope.data.organizationId)
    const projectId = params.data.projectId
    const owned = await app.pg.query(ownedProject, [
      projectId,
      scope.data.organizationId,
    ])
    if (!owned.rows[0])
      return reply.code(404).send({ error: 'project_not_found' })
    const [tasks, phases, deliverables, approvals, timeline] =
      await Promise.all([
        app.pg.query(
          'SELECT * FROM public.project_tasks WHERE project_id = $1 AND is_client_visible = true ORDER BY order_index',
          [projectId]
        ),
        app.pg.query(
          'SELECT id, project_id, name, description, status, start_date, end_date, progress, order_index, created_at, updated_at FROM public.project_phases WHERE project_id = $1 ORDER BY order_index',
          [projectId]
        ),
        app.pg.query(
          'SELECT * FROM public.project_deliverables WHERE project_id = $1 AND is_client_visible = true ORDER BY created_at DESC',
          [projectId]
        ),
        app.pg.query(
          `SELECT ar.*, COALESCE((SELECT jsonb_agg(to_jsonb(ad) ORDER BY ad.created_at)
        FROM public.approval_decisions ad WHERE ad.approval_request_id = ar.id), '[]'::jsonb) AS approval_decisions
        FROM public.approval_requests ar JOIN public.project_deliverables d ON d.id = ar.target_id AND d.project_id = ar.project_id
        WHERE ar.project_id = $1 AND ar.target_type = 'deliverable' AND ar.is_client_visible = true AND d.is_client_visible = true
        ORDER BY ar.submitted_at DESC`,
          [projectId]
        ),
        app.pg.query(
          'SELECT * FROM public.project_timeline_entries WHERE project_id = $1 AND is_client_visible = true ORDER BY created_at DESC',
          [projectId]
        ),
      ])
    return {
      tasks: tasks.rows.map((row) => projectTaskRow(row)),
      phases: phases.rows.map((row) => projectPhaseRow(row)),
      deliverables: deliverables.rows.map(projectDeliverableRow),
      approvals: approvals.rows.map(approvalRequestRow),
      timeline: timeline.rows.map(projectTimelineRow),
    }
  })

  app.post(
    '/portal/projects/:projectId/approvals/:approvalId/decision',
    async (request, reply) => {
      const scope = scopeSchema.safeParse(request.query)
      const params = approvalSchema.safeParse(request.params)
      const input = decisionSchema.safeParse(request.body)
      if (!scope.success || !params.success || !input.success)
        return reply.code(400).send({ error: 'invalid_approval_decision' })
      const ctx = requireMembership(request, scope.data.organizationId)
      const client = await app.pg.connect()
      try {
        await client.query('BEGIN')
        const { rows } = await client.query(
          `SELECT ar.* FROM public.approval_requests ar
        JOIN public.project_deliverables d ON d.id = ar.target_id AND d.project_id = ar.project_id
        JOIN public.projects p ON p.id = ar.project_id
        JOIN public.organizations o ON o.client_id = p.client_id
        WHERE ar.id = $1 AND ar.project_id = $2 AND o.id = $3
          AND ar.target_type = 'deliverable' AND ar.is_client_visible = true AND d.is_client_visible = true
          AND NOT COALESCE(p.is_archived, false) AND p.status <> 'ARCHIVED'
        FOR UPDATE OF ar, d`,
          [
            params.data.approvalId,
            params.data.projectId,
            scope.data.organizationId,
          ]
        )
        if (!rows[0]) {
          await client.query('ROLLBACK')
          return reply.code(404).send({ error: 'approval_not_found' })
        }
        if (rows[0].status !== 'pending') {
          await client.query('ROLLBACK')
          return reply.code(409).send({ error: 'approval_already_decided' })
        }
        await client.query(
          `INSERT INTO public.approval_decisions (approval_request_id, decision, comment, decided_by)
        VALUES ($1, $2, $3, $4)`,
          [
            params.data.approvalId,
            input.data.decision,
            input.data.comment || null,
            ctx.userId,
          ]
        )
        // The existing decision trigger preserves the request and timeline history.
        await client.query(
          'UPDATE public.project_deliverables SET status = $1, updated_at = NOW() WHERE id = $2 AND project_id = $3',
          [input.data.decision, rows[0].target_id, params.data.projectId]
        )
        await client.query('COMMIT')
        return { success: true }
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      } finally {
        client.release()
      }
    }
  )
}
