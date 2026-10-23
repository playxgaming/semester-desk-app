import { db, type Base, type Profile, DEFAULT_GRADE_BANDS, type SyncedTable } from './db'
import { uid } from '@/lib/id'
import { getUserId, syncEnabled } from '@/sync/supabase'

/**
 * The only way the app writes. Three rules, enforced here rather than
 * remembered at every call site:
 *   1. the write lands in IndexedDB immediately — nothing awaits the network
 *   2. every row gets a fresh `updated_at`
 *   3. the change is queued for the server, whether or not one is configured
 */

type AnyRow = Base & Record<string, unknown>

async function enqueue(table: SyncedTable, op: 'put' | 'delete', row: AnyRow) {
  if (!syncEnabled()) return
  await db.outbox.add({
    table,
    op,
    row_id: row.id,
    payload: row,
    at: new Date().toISOString(),
    tries: 0,
    last_error: null,
  })
}

export function stamp<T extends Partial<Base>>(row: T): T & Base {
  return {
    ...(row as T),
    id: row.id ?? uid(),
    user_id: row.user_id ?? getUserId(),
    updated_at: new Date().toISOString(),
    deleted_at: row.deleted_at ?? null,
  } as T & Base
}

/**
 * The table → row-type map. It is what makes `patch('cards', id, { ease: 2.1 })`
 * type-check the field names against the right table without a cast.
 */
export interface TableRow {
  profiles: Profile
  courses: import('./db').Course
  timetable_slots: import('./db').TimetableSlot
  timetable_exceptions: import('./db').TimetableException
  attendance: import('./db').Attendance
  assessments: import('./db').Assessment
  topics: import('./db').Topic
  tasks: import('./db').StudyTask
  subtasks: import('./db').Subtask
  attachments: import('./db').Attachment
  sessions: import('./db').StudySession
  cards: import('./db').Card
  reviews: import('./db').Review
  focus_sessions: import('./db').FocusSession
  notes: import('./db').Note
  note_versions: import('./db').NoteVersion
  applications: import('./db').Application
  application_events: import('./db').ApplicationEvent
  contacts: import('./db').Contact
  resume_items: import('./db').ResumeItem
  resume_versions: import('./db').ResumeVersion
  transactions: import('./db').Transaction
  budgets: import('./db').Budget
  recurring: import('./db').Recurring
  habits: import('./db').Habit
  habit_logs: import('./db').HabitLog
  ai_threads: import('./db').AiThread
  ai_messages: import('./db').AiMessage
  notification_prefs: import('./db').NotificationPref
}

export async function put<K extends keyof TableRow>(
  table: K,
  row: TableRow[K],
): Promise<TableRow[K]> {
  const next = stamp(row) as TableRow[K]
  await (db as never as Record<string, { put(v: unknown): Promise<unknown> }>)[table].put(next)
  await enqueue(table as SyncedTable, 'put', next as unknown as AnyRow)
  return next
}

export async function patch<K extends keyof TableRow>(
  table: K,
  id: string,
  changes: Partial<TableRow[K]>,
): Promise<TableRow[K] | undefined> {
  const t = (db as never as Record<string, { get(id: string): Promise<TableRow[K] | undefined> }>)[
    table
  ]
  const current = await t.get(id)
  if (!current) return undefined
  return put(table, { ...current, ...changes, id })
}

/** Soft delete. The row stays so the tombstone can travel to other devices. */
export async function remove(table: SyncedTable, id: string): Promise<void> {
  const t = (db as never as Record<string, { get(id: string): Promise<AnyRow | undefined> }>)[table]
  const current = await t.get(id)
  if (!current) return
  const next = { ...current, deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() }
  await (db as never as Record<string, { put(v: AnyRow): Promise<unknown> }>)[table].put(next)
  await enqueue(table, 'delete', next)
}

/**
 * Bring a soft-deleted row back.
 *
 * Because `remove` only writes a tombstone, undoing a delete is a matter of
 * clearing it — which is what makes an Undo on the toast honest rather than a
 * best effort. A file attachment's bytes are kept too; only the metadata row
 * was tombstoned.
 */
export async function restore(table: SyncedTable, id: string): Promise<boolean> {
  const t = (db as never as Record<string, { get(id: string): Promise<AnyRow | undefined> }>)[table]
  const current = await t.get(id)
  if (!current) return false
  const next = { ...current, deleted_at: null, updated_at: new Date().toISOString() }
  await (db as never as Record<string, { put(v: AnyRow): Promise<unknown> }>)[table].put(next)
  await enqueue(table, 'put', next)
  return true
}

/** Every read in the app goes through this so tombstones never show up. */
export function alive<T extends Base>(rows: T[] | undefined): T[] {
  return (rows ?? []).filter((r) => !r.deleted_at)
}

/* ── Profile ───────────────────────────────────────────────────────────── */

export const PROFILE_ID = 'me'

export function defaultProfile(): Profile {
  const year = new Date().getFullYear()
  return {
    id: PROFILE_ID,
    user_id: null,
    updated_at: new Date().toISOString(),
    deleted_at: null,
    name: '',
    institution: '',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata',
    term_start: `${year}-07-15`,
    term_end: `${year}-11-30`,
    grading_scheme: 'cgpa10',
    grade_bands: DEFAULT_GRADE_BANDS,
    attendance_threshold: 0.75,
    daily_capacity_min: 180,
    quiet_hours: ['22:30', '07:00'],
    theme: 'system',
    onboarded: false,
    brief_time: '07:00',
    // conservative by default: six pushes a day gets an app muted in a week
    notify: { morning: true, deadline: true, attendance: false, review: true },
    current_semester: 'Semester 1',
  }
}

export async function ensureProfile(): Promise<Profile> {
  const existing = await db.profiles.get(PROFILE_ID)
  if (existing) return existing
  const p = defaultProfile()
  await db.profiles.put(p)
  return p
}

export async function saveProfile(changes: Partial<Profile>): Promise<Profile> {
  const current = await ensureProfile()
  const next = { ...current, ...changes, id: PROFILE_ID, updated_at: new Date().toISOString() }
  await db.profiles.put(next)
  if (syncEnabled()) await enqueue('profiles', 'put', next as unknown as AnyRow)
  return next
}
