import { loadEnv } from './config/env.js'
import { buildServer } from './server.js'

const env = loadEnv()
const app = await buildServer(env)

await app.listen({ host: '0.0.0.0', port: env.PORT })
