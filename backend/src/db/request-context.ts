import { AsyncLocalStorage } from 'node:async_hooks'
import type { UserRole } from '../http/request-context.js'

export type DatabaseRequestContext = {
  role: UserRole
  organizationIds: string[]
}

const storage = new AsyncLocalStorage<DatabaseRequestContext>()

export function enterDatabaseRequestContext(context: DatabaseRequestContext) {
  storage.enterWith(context)
}

export function runWithDatabaseRequestContext<T>(context: DatabaseRequestContext, callback: () => Promise<T>) {
  return storage.run(context, callback)
}

export function getDatabaseRequestContext() {
  return storage.getStore()
}
