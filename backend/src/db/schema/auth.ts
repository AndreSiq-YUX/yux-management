import { boolean, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const appUsers = pgTable('app_users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  displayName: text('display_name').notNull(),
  role: text('role').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const appSessions = pgTable(
  'app_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => appUsers.id, { onDelete: 'cascade' }),
    sessionTokenHash: text('session_token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('app_sessions_user_id_idx').on(table.userId),
    index('app_sessions_expires_at_idx').on(table.expiresAt),
  ],
)

export const auditEvents = pgTable(
  'audit_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actorUserId: uuid('actor_user_id').references(() => appUsers.id, { onDelete: 'set null' }),
    organizationId: uuid('organization_id'),
    eventType: text('event_type').notNull(),
    resourceType: text('resource_type').notNull(),
    resourceId: uuid('resource_id'),
    metadata: jsonb('metadata').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('audit_events_actor_user_id_idx').on(table.actorUserId),
    index('audit_events_organization_id_idx').on(table.organizationId),
    index('audit_events_created_at_idx').on(table.createdAt),
  ],
)
