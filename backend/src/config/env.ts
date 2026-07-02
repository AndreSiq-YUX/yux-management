import { z } from 'zod'

const optionalUrl = z.preprocess((value) => {
  if (typeof value === 'string' && value.trim() === '') return undefined
  return value
}, z.string().url().optional())

const optionalString = z.preprocess((value) => {
  if (typeof value === 'string' && value.trim() === '') return undefined
  return value
}, z.string().optional())

const optionalEmail = z.preprocess((value) => {
  if (typeof value === 'string' && value.trim() === '') return undefined
  return value
}, z.string().email().optional())

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),
  SESSION_COOKIE_NAME: z.string().default('yux_session'),
  SESSION_SECRET: z.string().min(32),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  PUBLIC_APP_URL: optionalUrl,
  SMTP2GO_API_KEY: optionalString,
  SMTP2GO_SENDER_EMAIL: optionalEmail,
  SMTP2GO_SENDER_NAME: optionalString,
  YUX_AGENT_RUNTIME_URL: optionalUrl,
  YUX_AGENT_RUNTIME_TOKEN: z.string().optional(),
  JINA_API_KEY: optionalString,
  N8N_CRM_WEBHOOK_URL: optionalUrl,
  OMNICHANNEL_ATTACHMENTS_DIR: z.string().optional(),
  OMNICHANNEL_ATTACHMENT_MAX_MB: z.coerce.number().int().positive().optional(),
})

export type AppEnv = z.infer<typeof envSchema>

export function loadEnv(input: NodeJS.ProcessEnv = process.env): AppEnv {
  return envSchema.parse(input)
}
