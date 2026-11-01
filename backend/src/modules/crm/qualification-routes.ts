import { profileError as validationError } from './record-profile.js'
import { z } from 'zod'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { AuthUser } from '../../auth/routes.js'
import {
  getActiveScoringModel,
  createScoringModel,
} from './scoring-repository.js'
import {
  getLeadProfile,
  inProfileTransaction,
  profileError,
} from './record-profile.js'
import { qualificationRuleSchema } from './qualification.js'
import {
  scoringAccess,
  qualificationFields,
  loadQualificationRules,
  reconcileQualification,
} from './qualification-repository.js'
const idSchema = z.object({ id: z.string().uuid() })
const instanceSchema = z.object({ crmInstanceId: z.string().uuid() })
export async function registerQualificationRoutes(
  app: FastifyInstance,
  authenticate: (
    request: FastifyRequest,
    reply: FastifyReply,
  ) => Promise<AuthUser | null>,
) {
  app.post('/scoring/activate-sum', async (request, reply) => {
    const user = await authenticate(request, reply)
    if (!user) return reply
    const input = checked(() => instanceSchema.parse(request.body))
    await scoringAccess(app.pg, user, input.crmInstanceId, true)
    await app.pg.query(
      `UPDATE public.lead_scoring_models SET calculation_mode='sum',updated_at=now() WHERE crm_instance_id=$1 AND is_active`,
      [input.crmInstanceId],
    )
    return { success: true }
  })
  app.post('/scoring/model', async (request, reply) => {
    const user = await authenticate(request, reply)
    if (!user) return reply
    const input = checked(() => instanceSchema.parse(request.body))
    return inProfileTransaction(app.pg, async (db) => {
      await scoringAccess(db, user, input.crmInstanceId, true)
      await db.query(
        `SELECT id FROM public.crm_instances WHERE id=$1 FOR UPDATE`,
        [input.crmInstanceId],
      )
      if (await getActiveScoringModel(db, input.crmInstanceId))
        throw profileError(
          409,
          'A pontuação deste CRM já foi configurada. Atualize a página.',
        )
      const model = await createScoringModel(db, {
        crmInstanceId: input.crmInstanceId,
        name: 'Qualificação comercial',
        fitWeight: 50,
        intentWeight: 50,
        thresholds: [40, 70],
        createdBy: user.id,
      })
      await db.query(
        `UPDATE public.lead_scoring_models SET calculation_mode='sum' WHERE id=$1`,
        [model.id],
      )
      return reply
        .code(201)
        .send({
          ...model,
          calculationMode: 'sum',
          warmThreshold: 40,
          hotThreshold: 70,
        })
    })
  })
  app.get('/scoring/fields', async (request, reply) => {
    const user = await authenticate(request, reply)
    if (!user) return reply
    const input = checked(() => instanceSchema.parse(request.query))
    const fields = await qualificationFields(app.pg, user, input.crmInstanceId)
    const stages = await app.pg.query<{ id: string; name: string }>(
      `SELECT s.id,s.name FROM public.crm_pipeline_stages s JOIN public.crm_pipelines p ON p.id=s.pipeline_id WHERE p.crm_instance_id=$1 AND s.is_active ORDER BY p.name,s.order_index`,
      [input.crmInstanceId],
    )
    return fields.map((f) =>
      f.type === 'stage'
        ? {
            ...f,
            type: 'select',
            options: stages.rows.map((s) => ({ value: s.id, label: s.name })),
          }
        : f,
    )
  })
  app.get('/scoring/qualification-rules', async (request, reply) => {
    const user = await authenticate(request, reply)
    if (!user) return reply
    const input = checked(() => instanceSchema.parse(request.query))
    await scoringAccess(app.pg, user, input.crmInstanceId)
    const model = await getActiveScoringModel(app.pg, input.crmInstanceId)
    return model ? loadQualificationRules(app.pg, model.id) : []
  })
  app.post('/scoring/qualification-rules', async (request, reply) => {
    const user = await authenticate(request, reply)
    if (!user) return reply
    const body = checked(() =>
      z
        .object({
          id: z.string().uuid().optional(),
          crmInstanceId: z.string().uuid(),
          rule: qualificationRuleSchema,
        })
        .strict()
        .parse(request.body),
    )
    return inProfileTransaction(app.pg, async (db) => {
      const config = await scoringAccess(db, user, body.crmInstanceId, true)
      await db.query(
        `SELECT id FROM public.crm_instances WHERE id=$1 FOR UPDATE`,
        [body.crmInstanceId],
      )
      const model = await getActiveScoringModel(db, body.crmInstanceId)
      if (!model || model.calculationMode !== 'sum')
        throw profileError(
          409,
          'Crie ou ative o modelo de soma para configurar estas regras.',
        )
      const rule = body.rule
      const fields = await qualificationFields(db, user, body.crmInstanceId)
      const activityFields = [
        { key: 'activity.channel', type: 'select', recordTypeId: null },
        { key: 'activity.text', type: 'text', recordTypeId: null },
        { key: 'activity.stageId', type: 'select', recordTypeId: null },
        { key: 'activity.interactionType', type: 'select', recordTypeId: null },
      ]
      const field = [
        ...fields,
        ...(rule.kind === 'activity' ? activityFields : []),
      ].find((f) => f.key === rule.fieldKey)
      if (rule.fieldKey && !field)
        throw profileError(422, 'Escolha um campo disponível neste CRM.')
      if (
        rule.recordTypeId &&
        !config.recordTypes.some(
          (t) => t.id === rule.recordTypeId && t.isActive,
        )
      )
        throw profileError(422, 'Tipo de cliente inválido.')
      if (field?.recordTypeId && field.recordTypeId !== rule.recordTypeId)
        throw profileError(422, 'Selecione o tipo de cliente deste campo.')
      if (rule.bands.length && field?.type !== 'number')
        throw profileError(422, 'Somente campos numéricos aceitam faixas.')
      const numeric = [
        'greater_than',
        'less_than',
        'at_least',
        'at_most',
      ].includes(rule.operator)
      if (
        numeric &&
        (field?.type !== 'number' || typeof rule.comparisonValue !== 'number')
      )
        throw profileError(422, 'Informe um campo e valor numérico.')
      if (
        rule.operator !== 'exists' &&
        !rule.bands.length &&
        rule.fieldKey &&
        (rule.comparisonValue === undefined || rule.comparisonValue === null)
      )
        throw profileError(422, 'Informe o valor da condição.')
      if (
        field?.type === 'boolean' &&
        rule.operator !== 'exists' &&
        typeof rule.comparisonValue !== 'boolean'
      )
        throw profileError(422, 'Selecione Sim ou Não.')
      if (
        field?.type === 'number' &&
        rule.operator !== 'exists' &&
        !rule.bands.length &&
        typeof rule.comparisonValue !== 'number'
      )
        throw profileError(422, 'Informe um valor numérico.')
      if (
        ['contains', 'not_contains'].includes(rule.operator) &&
        !['text', 'textarea'].includes(field?.type || '')
      )
        throw profileError(422, 'A condição de texto exige um campo de texto.')
      const scope = await db.query<{ organization_id: string }>(
        `SELECT organization_id FROM public.crm_instances WHERE id=$1`,
        [body.crmInstanceId],
      )
      if (body.id) {
        const existing = (await loadQualificationRules(db, model.id)).find(
          (r) => r.id === body.id,
        )
        if (!existing)
          throw profileError(404, 'Regra não encontrada neste CRM.')
        if (
          existing.kind !== rule.kind ||
          existing.dimension !== rule.dimension
        )
          throw profileError(
            422,
            'Para mudar a categoria da regra, desative-a e crie outra. O histórico é preservado.',
          )
        await db.query(
          `UPDATE public.crm_qualification_rules SET name=$2,definition=$3::jsonb,updated_at=now() WHERE id=$1 AND model_id=$4`,
          [body.id, rule.name, JSON.stringify(rule), model.id],
        )
        return { id: body.id, ...rule }
      }
      const inserted = await db.query<{ id: string }>(
        `INSERT INTO public.crm_qualification_rules(organization_id,crm_instance_id,model_id,name,definition) VALUES($1,$2,$3,$4,$5::jsonb) RETURNING id`,
        [
          scope.rows[0].organization_id,
          body.crmInstanceId,
          model.id,
          rule.name,
          JSON.stringify(rule),
        ],
      )
      return reply.code(201).send({ id: inserted.rows[0].id, ...rule })
    })
  })
  app.delete('/scoring/qualification-rules/:id', async (request, reply) => {
    const user = await authenticate(request, reply)
    if (!user) return reply
    const { id } = checked(() => idSchema.parse(request.params))
    return inProfileTransaction(app.pg, async (db) => {
      const found = await db.query<{ crm_instance_id: string }>(
        `SELECT crm_instance_id FROM public.crm_qualification_rules WHERE id=$1`,
        [id],
      )
      if (!found.rows[0]) throw profileError(404, 'Regra não encontrada.')
      await scoringAccess(db, user, found.rows[0].crm_instance_id, true)
      await db.query(
        `UPDATE public.crm_qualification_rules SET is_active=FALSE,updated_at=now() WHERE id=$1`,
        [id],
      )
      return { success: true }
    })
  })
  app.patch('/scoring/temperature', async (request, reply) => {
    const user = await authenticate(request, reply)
    if (!user) return reply
    const body = checked(() =>
      z
        .object({
          crmInstanceId: z.string().uuid(),
          warmThreshold: z.number().int().min(0).max(99),
          hotThreshold: z.number().int().min(1).max(100),
        })
        .strict()
        .refine((v) => v.warmThreshold < v.hotThreshold)
        .parse(request.body),
    )
    await scoringAccess(app.pg, user, body.crmInstanceId, true)
    await app.pg.query(
      `UPDATE public.lead_scoring_models SET warm_threshold=$2,hot_threshold=$3,thresholds=to_jsonb(ARRAY[$2::integer,$3::integer]),updated_at=now() WHERE crm_instance_id=$1 AND is_active`,
      [body.crmInstanceId, body.warmThreshold, body.hotThreshold],
    )
    return { success: true }
  })
  app.post('/scoring/recalculate', async (request, reply) => {
    const user = await authenticate(request, reply)
    if (!user) return reply
    const body = checked(() =>
      z
        .object({
          crmInstanceId: z.string().uuid(),
          preview: z.boolean().default(true),
          afterId: z.string().uuid().optional(),
        })
        .strict()
        .parse(request.body),
    )
    return inProfileTransaction(app.pg, async (db) => {
      await scoringAccess(db, user, body.crmInstanceId, true)
      const leads = await db.query<{ id: string }>(
        `SELECT id FROM public.leads WHERE crm_instance_id=$1 AND deleted_at IS NULL AND ($2::uuid IS NULL OR id>$2) ORDER BY id LIMIT 51`,
        [body.crmInstanceId, body.afterId ?? null],
      )
      const results = []
      for (const lead of leads.rows.slice(0, 50))
        results.push(
          await reconcileQualification(db, lead.id, undefined, body.preview),
        )
      return {
        preview: body.preview,
        results,
        nextCursor: leads.rows.length > 50 ? leads.rows[49].id : null,
      }
    })
  })
  app.get('/leads/:id/qualification', async (request, reply) => {
    const user = await authenticate(request, reply)
    if (!user) return reply
    const { id } = checked(() => idSchema.parse(request.params))
    return inProfileTransaction(app.pg, async (db) => {
      await getLeadProfile(db, user, id)
      return reconcileQualification(db, id, undefined, true)
    })
  })
}

function checked<T>(parse: () => T): T {
  try {
    return parse()
  } catch (error) {
    if (error instanceof z.ZodError)
      throw validationError(400, error.issues[0]?.message || 'Dados inválidos.')
    throw error
  }
}
