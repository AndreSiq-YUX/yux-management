import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),
  SESSION_COOKIE_NAME: z.string().default('yux_session'),
  SESSION_SECRET: z.string().min(32),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  YUX_AGENT_RUNTIME_URL: z.string().url().optional(),
  YUX_AGENT_RUNTIME_TOKEN: z.string().optional(),
  N8N_CRM_WEBHOOK_URL: z.string().url().optional(),
  OMNICHANNEL_ATTACHMENTS_DIR: z.string().optional(),
  OMNICHANNEL_ATTACHMENT_MAX_MB: z.coerce.number().int().positive().optional(),
})

export type AppEnv = z.infer<typeof envSchema>

export function loadEnv(input: NodeJS.ProcessEnv = process.env): AppEnv {
  return envSchema.parse(input)
}
