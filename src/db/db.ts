import Dexie, { type Table } from 'dexie'

/**
 * Local-first store. Every screen in the app reads and writes here, never
 * over the network. `src/sync/engine.ts` is what later reconciles this with
 * Postgres — but the app is fully functional with that switched off.
 *
 * Every row carries `updated_at` and `deleted_at` so a delete on one device
 * propagates instead of being resurrected by another.
 */

export interface Base {
  id: string
  user_id: string | null
  updated_at: string // ISO
  deleted_at: string | null
}

/* ── Academic ──────────────────────────────────────────────────────────── */

export interface Course extends Base {
  code: string
  name: string
  credits: number
  colour: string
  instructor: string
  target_grade: number // percentage the "what do I need" calculator aims at
  attendance_threshold: number // 0–1, per course; falls back to the profile default
  archived: boolean
  /** Which term this course belongs to, e.g. "Sem 5". CGPA spans all of them. */
  semester: string
}

export type SlotKind = 'lecture' | 'lab' | 'tutorial' | 'other'

export interface TimetableSlot extends Base {
  course_id: string
  weekday: number // 0 = Sunday … 6 = Saturday
  start: string // "09:00"
  end: string // "10:00"
  room: string
  kind: SlotKind
}

export type ExceptionKind = 'cancelled' | 'moved' | 'holiday' | 'extra'

export interface TimetableException extends Base {
  slot_id: string | null // null = whole-day holiday
  date: string // "2026-09-14"
  kind: ExceptionKind
  new_start: string | null
  new_end: string | null
  note: string
}

export type AttendanceStatus = 'present' | 'absent' | 'cancelled' | 'excused'

export interface Attendance extends Base {
  course_id: string
  slot_id: string | null
  date: string
  status: AttendanceStatus
}

export interface Assessment extends Base {
  course_id: string
  title: string
  weight_pct: number
  score: number | null
  max: number
  date: string | null
}

export interface Topic extends Base {
  course_id: string
  name: string
  order_index: number
  confidence: 0 | 1 | 2 | 3 // 0 untouched → 3 could teach it
  est_minutes: number
  exam_critical: boolean
}

/* ── Work queue ────────────────────────────────────────────────────────── */

export type TaskType = 'assignment' | 'exam' | 'quiz' | 'project' | 'reading' | 'admin'
export type TaskStatus = 'todo' | 'doing' | 'done'

export interface StudyTask extends Base {
  course_id: string | null
  title: string
  type: TaskType
  due_at: string | null // ISO
  weight_pct: number
  est_minutes: number
  status: TaskStatus
  notes: string
}

export interface Subtask extends Base {
  task_id: string
  title: string
  done: boolean
  order_index: number
}

export interface Attachment extends Base {
  parent_type: 'task' | 'note' | 'course' | 'application'
  parent_id: string
  name: string
  storage_path: string
  kind: string
  size: number
}

/* ── Study engine ──────────────────────────────────────────────────────── */

export type SessionKind = 'study' | 'revise' | 'practice' | 'task'
export type SessionStatus = 'planned' | 'done' | 'skipped'

export interface StudySession extends Base {
  course_id: string | null
  topic_id: string | null
  task_id: string | null
  date: string // "2026-09-01"
  kind: SessionKind
  planned_min: number
  actual_min: number
  status: SessionStatus
  auto: boolean // written by the planner rather than by hand
}

export interface Card extends Base {
  course_id: string | null
  topic_id: string | null
  front: string
  back: string
  ease: number
  interval: number // days
  reps: number
  due_at: string // ISO
  lapses: number
  suspended: boolean
  is_formula: boolean
}

export interface Review extends Base {
  card_id: string
  at: string
  grade: 0 | 1 | 2 | 3 // again / hard / good / easy
  prev_interval: number
  next_interval: number
}

export interface FocusSession extends Base {
  course_id: string | null
  task_id: string | null
  started: string
  ended: string | null
  minutes: number
  interruptions: number
}

export interface Note extends Base {
  course_id: string | null
  topic_id: string | null
  title: string
  body_md: string
  pinned: boolean
}

export interface NoteVersion extends Base {
  note_id: string
  body_md: string
  at: string
  source: 'local' | 'remote'
}

/* ── Career (schema present from day one; UI lands in phase 5) ─────────── */

export type ApplicationStage =
  | 'sourced'
  | 'applied'
  | 'test'
  | 'interview'
  | 'offer'
  | 'rejected'

export type DocStatus = 'none' | 'draft' | 'sent'
export type LorStatus = 'none' | 'requested' | 'received'

export interface Application extends Base {
  org: string
  role: string
  kind: 'internship' | 'job' | 'scholarship' | 'university' | 'competition'
  stage: ApplicationStage
  deadline: string | null
  link: string
  note: string
  /** Which CV you actually sent — a resume_versions id. */
  resume_version_id: string | null
  sop_status: DocStatus
  lor_status: LorStatus
}

export interface ApplicationEvent extends Base {
  application_id: string
  at: string
  kind: string
  note: string
}

export interface Contact extends Base {
  name: string
  org: string
  email: string
  last_touch: string | null
  follow_up_at: string | null
  note: string
}

export interface ResumeItem extends Base {
  kind: 'experience' | 'project' | 'education' | 'award'
  title: string
  org: string
  start: string | null
  end: string | null
  bullets: string[]
}

export interface ResumeVersion extends Base {
  name: string
  item_ids: string[]
  target_role: string
}

/* ── Money and life (same) ─────────────────────────────────────────────── */

export interface Transaction extends Base {
  at: string
  amount: number
  category: string
  method: 'upi' | 'cash' | 'card' | 'other'
  note: string
}

export interface Budget extends Base {
  month: string // "2026-09"
  category: string
  limit_amount: number
}

export interface Recurring extends Base {
  name: string
  amount: number
  cadence: 'monthly' | 'weekly' | 'yearly'
  next_at: string
}

export interface Habit extends Base {
  name: string
  cadence: 'daily' | 'weekly'
  target: number
  colour: string
}

export interface HabitLog extends Base {
  habit_id: string
  date: string
  value: number
}

/* ── System ────────────────────────────────────────────────────────────── */

export interface GradeBand {
  min_pct: number
  letter: string
  points: number
}

export interface Profile extends Base {
  name: string
  institution: string
  timezone: string
  term_start: string
  term_end: string
  grading_scheme: 'cgpa10' | 'gpa4' | 'percent'
  grade_bands: GradeBand[]
  attendance_threshold: number // 0–1
  daily_capacity_min: number
  quiet_hours: [string, string]
  theme: 'system' | 'light' | 'dark'
  onboarded: boolean
  /** When the morning brief fires, e.g. "07:00". */
  brief_time: string
  /** Per-type notification toggles. Absent means the type's default. */
  notify: Partial<Record<'morning' | 'deadline' | 'attendance' | 'review', boolean>>
  /** The term new courses land in, and the one SGPA is reported for. */
  current_semester: string
}

export interface AiThread extends Base {
  course_id: string | null
  title: string
  task_type: string
}

export interface AiMessage extends Base {
  thread_id: string
  /** Stable order within a conversation, independent of clock precision. */
  sequence?: number
  role: 'user' | 'assistant' | 'system'
  content: string
  tokens_in: number
  tokens_out: number
  cost_inr: number
}

export interface NotificationPref extends Base {
  channel: string
  enabled: boolean
  config: Record<string, unknown>
}

export interface SyncCursor {
  table: string
  last_pulled_at: string | null
}

export interface StoredBlob {
  id: string
  data: Blob
}

export type MutationOp = 'put' | 'delete'

export interface Outbox {
  seq?: number
  table: string
  op: MutationOp
  row_id: string
  payload: unknown
  at: string
  tries: number
  last_error: string | null
}

/* ── The database ──────────────────────────────────────────────────────── */

const BASE = 'id, user_id, updated_at, deleted_at'

export class SemesterDeskDB extends Dexie {
  courses!: Table<Course, string>
  timetable_slots!: Table<TimetableSlot, string>
  timetable_exceptions!: Table<TimetableException, string>
  attendance!: Table<Attendance, string>
  assessments!: Table<Assessment, string>
  topics!: Table<Topic, string>
  tasks!: Table<StudyTask, string>
  subtasks!: Table<Subtask, string>
  attachments!: Table<Attachment, string>
  sessions!: Table<StudySession, string>
  cards!: Table<Card, string>
  reviews!: Table<Review, string>
  focus_sessions!: Table<FocusSession, string>
  notes!: Table<Note, string>
  note_versions!: Table<NoteVersion, string>
  applications!: Table<Application, string>
  application_events!: Table<ApplicationEvent, string>
  contacts!: Table<Contact, string>
  resume_items!: Table<ResumeItem, string>
  resume_versions!: Table<ResumeVersion, string>
  transactions!: Table<Transaction, string>
  budgets!: Table<Budget, string>
  recurring!: Table<Recurring, string>
  habits!: Table<Habit, string>
  habit_logs!: Table<HabitLog, string>
  profiles!: Table<Profile, string>
  ai_threads!: Table<AiThread, string>
  ai_messages!: Table<AiMessage, string>
  notification_prefs!: Table<NotificationPref, string>
  sync_cursors!: Table<SyncCursor, string>
  outbox!: Table<Outbox, number>
  /** File bytes for attachments. Local only — never synced, never exported. */
  blobs!: Table<StoredBlob, string>

  constructor() {
    super('semester-desk')
    this.version(1).stores({
      courses: `${BASE}, code, archived, semester`,
      timetable_slots: `${BASE}, course_id, weekday`,
      timetable_exceptions: `${BASE}, slot_id, date`,
      attendance: `${BASE}, course_id, date, [course_id+date]`,
      assessments: `${BASE}, course_id, date`,
      topics: `${BASE}, course_id, order_index, confidence`,
      tasks: `${BASE}, course_id, due_at, status`,
      subtasks: `${BASE}, task_id`,
      attachments: `${BASE}, parent_id`,
      sessions: `${BASE}, course_id, topic_id, date, status`,
      cards: `${BASE}, course_id, topic_id, due_at, suspended`,
      reviews: `${BASE}, card_id, at`,
      focus_sessions: `${BASE}, course_id, started`,
      notes: `${BASE}, course_id, topic_id, title`,
      note_versions: `${BASE}, note_id, at`,
      applications: `${BASE}, stage, deadline`,
      application_events: `${BASE}, application_id`,
      contacts: `${BASE}, follow_up_at`,
      resume_items: `${BASE}, kind`,
      resume_versions: `${BASE}`,
      transactions: `${BASE}, at, category`,
      budgets: `${BASE}, month, category`,
      recurring: `${BASE}, next_at`,
      habits: `${BASE}`,
      habit_logs: `${BASE}, habit_id, date`,
      profiles: `${BASE}`,
      ai_threads: `${BASE}, course_id`,
      ai_messages: `${BASE}, thread_id`,
      notification_prefs: `${BASE}, channel`,
      sync_cursors: `table`,
      outbox: `++seq, table, row_id, at`,
    })

    // v2 adds the local blob store behind attachments, and an index on the
    // course's semester. Dexie carries existing rows across untouched.
    this.version(2).stores({
      courses: `${BASE}, code, archived, semester`,
      blobs: `id`,
    })
  }
}

export const db = new SemesterDeskDB()

/** Tables that participate in sync, in dependency order. */
export const SYNCED_TABLES = [
  'profiles',
  'courses',
  'timetable_slots',
  'timetable_exceptions',
  'attendance',
  'assessments',
  'topics',
  'tasks',
  'subtasks',
  'attachments',
  'sessions',
  'cards',
  'reviews',
  'focus_sessions',
  'notes',
  'note_versions',
  'applications',
  'application_events',
  'contacts',
  'resume_items',
  'resume_versions',
  'transactions',
  'budgets',
  'recurring',
  'habits',
  'habit_logs',
  'ai_threads',
  'ai_messages',
  'notification_prefs',
] as const

export type SyncedTable = (typeof SYNCED_TABLES)[number]

export const DEFAULT_GRADE_BANDS: GradeBand[] = [
  { min_pct: 90, letter: 'A+', points: 10 },
  { min_pct: 80, letter: 'A', points: 9 },
  { min_pct: 70, letter: 'B+', points: 8 },
  { min_pct: 60, letter: 'B', points: 7 },
  { min_pct: 50, letter: 'C', points: 6 },
  { min_pct: 45, letter: 'D', points: 5 },
  { min_pct: 40, letter: 'E', points: 4 },
  { min_pct: 0, letter: 'F', points: 0 },
]

export const GPA4_GRADE_BANDS: GradeBand[] = [
  { min_pct: 90, letter: 'A', points: 4 },
  { min_pct: 85, letter: 'A-', points: 3.7 },
  { min_pct: 80, letter: 'B+', points: 3.3 },
  { min_pct: 75, letter: 'B', points: 3 },
  { min_pct: 70, letter: 'B-', points: 2.7 },
  { min_pct: 65, letter: 'C+', points: 2.3 },
  { min_pct: 60, letter: 'C', points: 2 },
  { min_pct: 50, letter: 'D', points: 1 },
  { min_pct: 0, letter: 'F', points: 0 },
]
