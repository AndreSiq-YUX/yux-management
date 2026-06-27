import crypto from 'node:crypto'

export const DEFAULT_SESSION_DAYS = 7

export function createSessionToken() {
  return crypto.randomBytes(32).toString('base64url')
}

export function hashSessionToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('base64url')
}

export function sessionExpiry(days = DEFAULT_SESSION_DAYS) {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date
}
