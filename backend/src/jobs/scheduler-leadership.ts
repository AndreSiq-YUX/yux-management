import type pg from 'pg'

export type SchedulerLeadership = {
  release(): Promise<void>
}

export async function acquireSchedulerLeadership(pool: pg.Pool): Promise<SchedulerLeadership | null> {
  const client = await pool.connect()
  try {
    const result = await client.query<{ acquired: boolean }>(
      `SELECT pg_try_advisory_lock(hashtextextended('yux:commercial-scheduler',0)) AS acquired`,
    )
    if (result.rows[0]?.acquired !== true) {
      client.release()
      return null
    }
    let released = false
    return {
      async release() {
        if (released) return
        released = true
        try {
          await client.query(`SELECT pg_advisory_unlock(hashtextextended('yux:commercial-scheduler',0))`)
        } finally {
          client.release()
        }
      },
    }
  } catch (error) {
    client.release()
    throw error
  }
}
