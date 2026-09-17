import * as SQLite from 'expo-sqlite';
import { isValidDayKey } from '@app/shared';

const DB_NAME = 'habits.db';
let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export interface Habit {
  id: string;
  name: string;
  created_at: string;
}

export interface HabitLog {
  habit_id: string;
  day_key: string;
}

export async function initDb(): Promise<SQLite.SQLiteDatabase> {
  if (dbPromise) {
    return dbPromise;
  }
  dbPromise = SQLite.openDatabaseAsync(DB_NAME);
  const db = await dbPromise;
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS habits (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS habit_logs (
      habit_id TEXT NOT NULL,
      day_key TEXT NOT NULL,
      PRIMARY KEY (habit_id, day_key),
      FOREIGN KEY (habit_id) REFERENCES habits(id) ON DELETE CASCADE
    );
  `);
  return db;
}

export async function addHabit(name: string): Promise<string> {
  const db = await initDb();
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const created_at = new Date().toISOString();
  const stmt = await db.prepareAsync('INSERT INTO habits (id, name, created_at) VALUES (?, ?, ?)');
  try {
    await stmt.executeAsync([id, name, created_at]);
  } finally {
    await stmt.finalizeAsync();
  }
  return id;
}

export async function listHabits(): Promise<Habit[]> {
  const db = await initDb();
  const stmt = await db.prepareAsync(
    'SELECT id, name, created_at FROM habits ORDER BY created_at DESC'
  );
  try {
    const result = await stmt.executeAsync<{ id: string; name: string; created_at: string }>();
    return await result.getAllAsync();
  } finally {
    await stmt.finalizeAsync();
  }
}

export async function toggleLog(habitId: string, dayKey: string): Promise<void> {
  if (!isValidDayKey(dayKey)) {
    throw new Error(`Invalid day key: ${dayKey}`);
  }
  const db = await initDb();
  const result = await db.runAsync('DELETE FROM habit_logs WHERE habit_id = ? AND day_key = ?', [
    habitId,
    dayKey,
  ]);
  if (result.changes === 0) {
    await db.runAsync('INSERT INTO habit_logs (habit_id, day_key) VALUES (?, ?)', [
      habitId,
      dayKey,
    ]);
  }
}

export async function getLogsForDay(dayKey: string): Promise<Set<string>> {
  if (!isValidDayKey(dayKey)) {
    throw new Error(`Invalid day key: ${dayKey}`);
  }
  const db = await initDb();
  const stmt = await db.prepareAsync('SELECT habit_id FROM habit_logs WHERE day_key = ?');
  try {
    const result = await stmt.executeAsync<{ habit_id: string }>();
    const rows = await result.getAllAsync();
    return new Set(rows.map((row) => row.habit_id));
  } finally {
    await stmt.finalizeAsync();
  }
}

export async function getLogsForHabit(habitId: string): Promise<Set<string>> {
  const db = await initDb();
  const stmt = await db.prepareAsync('SELECT day_key FROM habit_logs WHERE habit_id = ?');
  try {
    const result = await stmt.executeAsync<{ day_key: string }>();
    const rows = await result.getAllAsync();
    return new Set(rows.map((row) => row.day_key));
  } finally {
    await stmt.finalizeAsync();
  }
}
