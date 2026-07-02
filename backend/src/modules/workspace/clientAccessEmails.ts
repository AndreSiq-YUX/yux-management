import type pg from 'pg'
import type { AppEnv } from '../../config/env.js'
import {
  buildClientInvitationEmail,
  buildPasswordResetEmail,
  buildSetPasswordUrl,
  createInvitationToken,
  hashInvitationToken,
  invitationExpiry,
} from '../../auth/invitations.js'
import { getPublishedSystemTemplateByTrigger } from '../emailTemplates/repository.js'
import { renderEmailTemplate } from '../emailTemplates/templateRenderer.js'

export type ClientAccessEmailAction = 'client_invitation' | 'password_reset'

export type ClientAccessEmailToken = {
  action: ClientAccessEmailAction
  tokenId: string
  accessUrl: string
  subject: string
  text: string
  html: string
}

type ClientAccessEmailClient = Pick<pg.PoolClient, 'query'>

type ClientAccessEmailInput = {
  userId: string
  contactName: string
  companyName: string
  hasLoggedIn: boolean
}

type RenderClientAccessEmailInput = {
  action: ClientAccessEmailAction
  contactName: string
  companyName?: string
  accessUrl: string
}

export async function createClientAccessEmailToken(
  client: ClientAccessEmailClient,
  env: Pick<AppEnv, 'CORS_ORIGIN' | 'PUBLIC_APP_URL'>,
  input: ClientAccessEmailInput,
): Promise<ClientAccessEmailToken> {
  const action: ClientAccessEmailAction = input.hasLoggedIn ? 'password_reset' : 'client_invitation'

  await client.query(
    `UPDATE app_password_reset_tokens
     SET used_at = NOW()
     WHERE user_id = $1
       AND purpose = $2
       AND used_at IS NULL`,
    [input.userId, action],
  )

  const token = createInvitationToken()
  const tokenResult = await client.query<{ id: string }>(
    `INSERT INTO app_password_reset_tokens (user_id, token_hash, purpose, expires_at)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [input.userId, hashInvitationToken(token), action, invitationExpiry()],
  )
  const accessUrl = buildSetPasswordUrl(env.PUBLIC_APP_URL ?? env.CORS_ORIGIN, token)
  const email = await renderClientAccessEmail(client, {
    action,
    contactName: input.contactName,
    companyName: input.companyName,
    accessUrl,
  })

  return {
    action,
    tokenId: tokenResult.rows[0].id,
    accessUrl,
    subject: email.subject,
    text: email.text,
    html: email.html,
  }
}

export async function renderClientAccessEmail(
  client: Pick<pg.Pool, 'query'>,
  input: RenderClientAccessEmailInput,
) {
  try {
    const template = await getPublishedSystemTemplateByTrigger(client as pg.Pool, input.action)
    if (template) {
      return renderEmailTemplate({
        subject: template.subject,
        bodyHtml: template.bodyHtml,
        bodyText: template.bodyText,
        variables: {
          contact_name: input.contactName,
          company_name: input.companyName ?? '',
          invite_url: input.accessUrl,
          reset_url: input.accessUrl,
        },
      })
    }
  } catch {
    // Template lookup/rendering must never block account access emails.
  }

  if (input.action === 'client_invitation') {
    return buildClientInvitationEmail({
      contactName: input.contactName,
      companyName: input.companyName ?? 'YUX Hub',
      inviteUrl: input.accessUrl,
    })
  }

  return buildPasswordResetEmail({
    contactName: input.contactName,
    resetUrl: input.accessUrl,
  })
}
