import { ClientAccessError } from './clientAccess.js'

type ClientIdentityDb = {
  query(sql: string, params?: unknown[]): Promise<{ rows: any[] }>
}

type ClientIdentityInput = {
  userId: string
  email: string
  displayName: string
}

export async function syncClientPortalIdentity(db: ClientIdentityDb, input: ClientIdentityInput) {
  const email = input.email.trim()
  const displayName = input.displayName.trim()

  if (!email) throw new ClientAccessError('invalid_client_email', 400)

  const userResult = await db.query(
    `SELECT id, email, display_name
     FROM app_users
     WHERE id = $1
     FOR UPDATE`,
    [input.userId],
  )
  const user = userResult.rows[0]

  if (!user) throw new ClientAccessError('client_portal_user_not_found', 409)

  if (String(user.email).toLowerCase() !== email.toLowerCase()) {
    const conflictResult = await db.query(
      `SELECT id
       FROM app_users
       WHERE lower(email) = lower($1)
         AND id <> $2
       LIMIT 1`,
      [email, input.userId],
    )

    if (conflictResult.rows[0]) {
      throw new ClientAccessError('client_login_email_already_exists', 409)
    }
  }

  if (user.email === email && user.display_name === displayName) return

  await db.query(
    `UPDATE app_users
     SET email = $1, display_name = $2, updated_at = NOW()
     WHERE id = $3`,
    [email, displayName || user.display_name, input.userId],
  )
}
