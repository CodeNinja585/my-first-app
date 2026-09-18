import { z } from 'zod';

// Habit operation: create or update a habit
export const habitOpSchema = z.object({
  op: z.literal('habit_upsert'),
  id: z.string(),
  name: z.string(),
  client_updated_at: z.string(),
  archived: z.boolean(),
});

// Log operation: toggle a habit for a day
export const logOpSchema = z.object({
  op: z.literal('log_toggle'),
  habit_id: z.string(),
  day_key: z.string(),
  done: z.boolean(),
  client_updated_at: z.string(),
});

// Union of all operation types
export const syncOpSchema = z.discriminatedUnion('op', [habitOpSchema, logOpSchema]);

// Push request: batch of operations
export const pushRequestSchema = z.object({
  ops: z.array(syncOpSchema).max(100),
});

// Push response: per-operation result
export const pushResultSchema = z.object({
  results: z.array(
    z.object({
      status: z.enum(['applied', 'stale', 'rejected']),
      server_row: z.any().optional(), // The canonical row if stale
      error: z.string().optional(), // Reason if rejected
    })
  ),
});

// Pull response: habits + logs + cursor
export const pullResponseSchema = z.object({
  habits: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      archived_at: z.string().nullable(),
      client_updated_at: z.string(),
      server_version: z.number(),
    })
  ),
  logs: z.array(
    z.object({
      habit_id: z.string(),
      day_key: z.string(),
      done: z.boolean(),
      client_updated_at: z.string(),
      server_version: z.number(),
    })
  ),
  cursor: z.number(),
});

// Type inference from schemas
export type HabitOp = z.infer<typeof habitOpSchema>;
export type LogOp = z.infer<typeof logOpSchema>;
export type SyncOp = z.infer<typeof syncOpSchema>;
export type PushRequest = z.infer<typeof pushRequestSchema>;
export type PushResult = z.infer<typeof pushResultSchema>;
export type PullResponse = z.infer<typeof pullResponseSchema>;
