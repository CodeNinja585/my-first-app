import {
  pgTable,
  text,
  timestamp,
  boolean,
  bigint,
  integer,
  primaryKey,
} from 'drizzle-orm/pg-core';

export const habits = pgTable('habits', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  clientUpdatedAt: timestamp('client_updated_at', { withTimezone: true }).notNull().defaultNow(),
  serverVersion: bigint('server_version', { mode: 'number' }).notNull().default(0),
});

export const habitLogs = pgTable(
  'habit_logs',
  {
    habitId: text('habit_id')
      .notNull()
      .references(() => habits.id, { onDelete: 'cascade' }),
    dayKey: text('day_key').notNull(),
    done: boolean('done').notNull(),
    clientUpdatedAt: timestamp('client_updated_at', { withTimezone: true }).notNull(),
    serverVersion: bigint('server_version', { mode: 'number' }).notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.habitId, table.dayKey] }),
  })
);

export const syncVersion = pgTable('sync_version', {
  id: integer('id').primaryKey().default(1),
  version: bigint('version', { mode: 'number' }).notNull().default(0),
});
