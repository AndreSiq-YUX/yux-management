import { randomUUID } from 'node:crypto'
import { hashPassword } from '../src/auth/password.js'
import { createPool } from '../src/db/client.js'

const email = process.env.ADMIN_EMAIL || 'admin@yux.com.br'
const password = process.env.ADMIN_PASSWORD
const displayName = process.env.ADMIN_NAME || 'Admin YUX'

if (!password) {
  throw new Error('ADMIN_PASSWORD is required')
}

const pool = createPool()
const client = await pool.connect()

try {
  const passwordHash = await hashPassword(password)

  await client.query('BEGIN')

  const existing = await client.query<{ id: string }>('SELECT id FROM app_users WHERE lower(email) = lower($1)', [email])
  const userId = existing.rows[0]?.id ?? randomUUID()

  await client.query(
    `INSERT INTO app_users (id, email, password_hash, display_name, role)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (email)
     DO UPDATE SET
       password_hash = EXCLUDED.password_hash,
       display_name = EXCLUDED.display_name,
       role = EXCLUDED.role,
       is_active = TRUE,
       updated_at = NOW()`,
    [userId, email, passwordHash, displayName, 'yux_admin'],
  )

  await client.query(
    `INSERT INTO public.users (id, name, role)
     VALUES ($1, $2, 'ADMIN')
     ON CONFLICT (id)
     DO UPDATE SET name = EXCLUDED.name, role = EXCLUDED.role, updated_at = NOW()`,
    [userId, displayName],
  )

  await client.query(
    `INSERT INTO public.organizations (id, name, slug, kind)
     VALUES ('650e8400-e29b-41d4-a716-446655440001', 'YUX Solucoes em IA', 'yux', 'yux')
     ON CONFLICT (slug)
     DO UPDATE SET name = EXCLUDED.name, kind = EXCLUDED.kind, updated_at = NOW()`,
  )

  await client.query(
    `INSERT INTO public.memberships (user_id, organization_id, role_key)
     SELECT $1, id, 'yux_admin'
     FROM public.organizations
     WHERE slug = 'yux'
     ON CONFLICT (user_id, organization_id)
     DO UPDATE SET role_key = EXCLUDED.role_key, updated_at = NOW()`,
    [userId],
  )

  await client.query('COMMIT')
  console.log(`admin user ready: ${email}`)
} catch (error) {
  await client.query('ROLLBACK')
  throw error
} finally {
  client.release()
  await pool.end()
}
