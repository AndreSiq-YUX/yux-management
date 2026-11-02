import { createHash } from 'node:crypto'
import type pg from 'pg'
import type { AuthUser } from '../../auth/routes.js'
import { createDraft } from '../proposals/repository.js'
import { inProfileTransaction, profileError } from './record-profile.js'
import { requireActiveLead } from './lead-actions.js'

export async function createLeadProposal(
  pool: pg.Pool,
  user: AuthUser,
  leadId: string,
  input: { packageId: string; requestId: string },
) {
  return inProfileTransaction(pool, async (db) => {
    const lead = await requireActiveLead(db, user, leadId)
    if (lead.status === 'lost')
      throw profileError(409, 'Reabra o lead antes de preparar uma proposta.')
    const hash = createHash('sha256')
      .update(JSON.stringify(['proposal', input.packageId]))
      .digest('hex')
    const prior = (
      await db.query(
        'SELECT payload_hash,result FROM crm_lead_activity_requests WHERE id=$1 AND lead_id=$2',
        [input.requestId, leadId],
      )
    ).rows[0]
    if (prior) {
      if (prior.payload_hash !== hash)
        throw profileError(
          409,
          'Esta solicitação já foi usada. Abra uma nova proposta.',
        )
      return prior.result
    }
    if (
      !(
        await db.query('SELECT id FROM packages WHERE id=$1', [input.packageId])
      ).rows.length
    )
      throw profileError(422, 'Selecione um pacote comercial disponível.')
    const proposal = await createDraft(db as pg.Pool, user, {
      organizationId: lead.organization_id,
      leadId,
      crmInstanceId: lead.crm_instance_id,
      packageId: input.packageId,
      title: `Proposta - ${lead.name}`,
    })
    await db.query(
      "INSERT INTO interactions(organization_id,lead_id,type,title,description,date) VALUES($1,$2,'note','Rascunho de proposta criado','Proposta preparada para revisão. Nenhum envio realizado.',now())",
      [lead.organization_id, leadId],
    )
    await db.query(
      'INSERT INTO crm_lead_activity_requests(id,organization_id,lead_id,payload_hash,result) VALUES($1,$2,$3,$4,$5::jsonb)',
      [
        input.requestId,
        lead.organization_id,
        leadId,
        hash,
        JSON.stringify(proposal),
      ],
    )
    return proposal
  })
}
