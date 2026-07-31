import { afterEach, describe, expect, it } from 'vitest'
import { sendConfiguredSmtp2GoEmail } from '../src/email/smtp2goConfigured.js'

const originalEncryptionKey = process.env.PROVIDER_SECRET_ENCRYPTION_KEY_B64

class ProviderPool {
  async query(sql: string) {
    if (sql.includes('FROM public.platform_provider_connections')) {
      return {
        rows: [{
          id: '00000000-0000-4000-8000-000000000001',
          display_name: 'SMTP2GO',
          status: 'active',
          public_config: { defaultFromEmail: 'contato@example.com' },
        }],
      }
    }

    if (sql.includes('FROM public.platform_provider_secrets')) {
      return {
        rows: [{ ciphertext: 'ciphertext', nonce: 'nonce', auth_tag: 'auth-tag' }],
      }
    }

    throw new Error(`Unexpected SQL: ${sql}`)
  }
}

afterEach(() => {
  if (originalEncryptionKey === undefined) delete process.env.PROVIDER_SECRET_ENCRYPTION_KEY_B64
  else process.env.PROVIDER_SECRET_ENCRYPTION_KEY_B64 = originalEncryptionKey
})

describe('configured SMTP2GO email', () => {
  it('returns a controlled result when the provider secret cannot be decrypted', async () => {
    process.env.PROVIDER_SECRET_ENCRYPTION_KEY_B64 = Buffer.from('invalid-key').toString('base64')

    const result = await sendConfiguredSmtp2GoEmail(
      new ProviderPool() as never,
      'legacy-session-secret',
      {
        to: 'cliente@example.com',
        subject: 'Acesso ao portal',
        textBody: 'Convite',
        htmlBody: '<p>Convite</p>',
      },
    )

    expect(result).toMatchObject({
      sent: false,
      reason: 'smtp2go_not_configured',
      error: 'Não foi possível carregar a configuração do provedor de e-mail. Revise o SMTP2GO e tente novamente.',
    })
    expect(result).toHaveProperty('diagnosticError', expect.any(Error))
  })
})
