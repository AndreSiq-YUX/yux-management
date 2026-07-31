import { createPool } from '../src/db/client.js'
import { reencryptPlatformProviderSecrets } from '../src/modules/platform/adminRepository.js'

const legacySessionSecret = process.env.OLD_SESSION_SECRET || ''

if (!process.env.PROVIDER_SECRET_ENCRYPTION_KEY_B64) {
  throw new Error('PROVIDER_SECRET_ENCRYPTION_KEY_B64 is required')
}
if (!legacySessionSecret) {
  throw new Error('OLD_SESSION_SECRET is required')
}

const pool = createPool()
try {
  const result = await reencryptPlatformProviderSecrets(pool, legacySessionSecret)
  console.log(`reencrypted ${result.reencrypted} platform provider secrets`)
} finally {
  await pool.end()
}
