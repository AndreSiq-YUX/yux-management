import crypto from 'node:crypto'

export const DEFAULT_INVITATION_DAYS = 7

export function createInvitationToken() {
  return crypto.randomBytes(32).toString('base64url')
}

export function hashInvitationToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('base64url')
}

export function invitationExpiry(days = DEFAULT_INVITATION_DAYS) {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date
}

export function buildSetPasswordUrl(publicAppUrl: string, token: string) {
  return `${publicAppUrl.replace(/\/+$/, '')}/auth/set-password?token=${encodeURIComponent(token)}`
}

export function buildClientInvitationEmail(input: {
  contactName: string
  companyName: string
  inviteUrl: string
}) {
  const subject = `Acesso ao YUX Hub - ${input.companyName}`
  const text = [
    `Ola, ${input.contactName}.`,
    '',
    `Seu acesso ao YUX Hub foi criado para ${input.companyName}.`,
    'Use o link abaixo para definir sua senha e acessar o portal:',
    '',
    input.inviteUrl,
    '',
    'Este link expira em 7 dias.',
    '',
    'Equipe YUX',
  ].join('\n')
  const html = `
    <p>Ola, ${escapeHtml(input.contactName)}.</p>
    <p>Seu acesso ao <strong>YUX Hub</strong> foi criado para <strong>${escapeHtml(input.companyName)}</strong>.</p>
    <p>Use o botao abaixo para definir sua senha e acessar o portal.</p>
    <p>
      <a href="${escapeAttribute(input.inviteUrl)}" style="display:inline-block;background:#0284c7;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:6px;font-weight:600;">
        Definir senha
      </a>
    </p>
    <p>Este link expira em 7 dias.</p>
    <p>Equipe YUX</p>
  `

  return { subject, text, html }
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function escapeAttribute(value: string) {
  return escapeHtml(value).replace(/`/g, '&#96;')
}
