import { db, SYNCED_TABLES, type SyncedTable } from '@/db/db'
import { put, type TableRow } from '@/db/mutate'

/**
 * Your data is yours: one file, every table, readable without the app and
 * importable back into it. No account required to read it.
 */

export interface Backup {
  app: 'semester-desk'
  version: 2
  exported_at: string
  tables: Record<string, unknown[]>
}

export async function exportJson(): Promise<Backup> {
  const tables: Record<string, unknown[]> = {}
  await db.transaction('r', SYNCED_TABLES.map((name) => db.table(name)), async () => {
    for (const t of SYNCED_TABLES) tables[t] = await db.table(t).toArray()
  })
  return { app: 'semester-desk', version: 2, exported_at: new Date().toISOString(), tables }
}

export function download(name: string, content: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return ''
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))]
  const cell = (v: unknown) => {
    const s = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n')
}

export async function exportCsvBundle(): Promise<string> {
  const backup = await exportJson()
  return Object.entries(backup.tables)
    .filter(([, rows]) => rows.length)
    .map(([name, rows]) => `# ${name}\n${toCsv(rows as Record<string, unknown>[])}`)
    .join('\n\n')
}

export async function importJson(text: string): Promise<{ tables: number; rows: number }> {
  let parsed: unknown
  try { parsed = JSON.parse(text) } catch { throw new Error('This file is not valid JSON.') }
  if (!isRecord(parsed) || parsed.app !== 'semester-desk') throw new Error('That file is not a Semester Desk backup.')
  if (parsed.version !== 2) throw new Error('This backup version is not supported. Export a version 2 backup from Semester Desk.')
  if (!isRecord(parsed.tables)) throw new Error('The backup is missing its data tables.')
  const entries: [SyncedTable, Record<string, unknown>[]][] = []
  // Validate the entire backup before writing any record. Internal stores,
  // blobs and arbitrary properties of the db object are never import targets.
  for (const [name, list] of Object.entries(parsed.tables)) {
    if (!(SYNCED_TABLES as readonly string[]).includes(name)) throw new Error(`Unknown backup table: ${name}.`)
    if (!Array.isArray(list)) throw new Error(`Invalid data in ${name}: expected a list of rows.`)
    const ids = new Set<string>()
    for (const row of list) {
      if (!validRow(name as SyncedTable, row) || ids.has(row.id)) throw new Error(`Invalid or duplicate row in ${name}. No data was imported.`)
      ids.add(row.id)
    }
    if (list.length) entries.push([name as SyncedTable, list])
  }
  await db.transaction('rw', [...SYNCED_TABLES.map((name) => db.table(name)), db.outbox], async () => {
    for (const [name, list] of entries) {
      for (const row of list) {
        // Use the normal mutation path so restored edits also reach optional
        // sync, with fresh timestamps rather than being lost to old cursors.
        await put(name, row as unknown as TableRow[typeof name])
      }
    }
  })
  return { tables: entries.length, rows: entries.reduce((total, [, list]) => total + list.length, 0) }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

// Validate field types consumed by every route. A malformed record must not
// turn a successful import into a crash on the next screen.
const ROW_FIELDS: Record<SyncedTable, Record<string, 'string' | 'number' | 'boolean' | 'array' | 'nullable'>> = {
  profiles: { name: 'string', institution: 'string', timezone: 'string', term_start: 'string', term_end: 'string', grading_scheme: 'string', grade_bands: 'array', attendance_threshold: 'number', daily_capacity_min: 'number', quiet_hours: 'array', theme: 'string', onboarded: 'boolean', brief_time: 'string', current_semester: 'string' },
  courses: { code: 'string', name: 'string', credits: 'number', colour: 'string', instructor: 'string', target_grade: 'number', attendance_threshold: 'number', archived: 'boolean', semester: 'string' },
  timetable_slots: { course_id: 'string', weekday: 'number', start: 'string', end: 'string', room: 'string', kind: 'string' },
  timetable_exceptions: { slot_id: 'nullable', date: 'string', kind: 'string', new_start: 'nullable', new_end: 'nullable', note: 'string' },
  attendance: { course_id: 'string', slot_id: 'nullable', date: 'string', status: 'string' },
  assessments: { course_id: 'string', title: 'string', weight_pct: 'number', max: 'number', date: 'nullable' },
  topics: { course_id: 'string', name: 'string', order_index: 'number', confidence: 'number', est_minutes: 'number', exam_critical: 'boolean' },
  tasks: { course_id: 'nullable', title: 'string', type: 'string', due_at: 'nullable', weight_pct: 'number', est_minutes: 'number', status: 'string', notes: 'string' },
  subtasks: { task_id: 'string', title: 'string', done: 'boolean', order_index: 'number' },
  attachments: { parent_type: 'string', parent_id: 'string', name: 'string', storage_path: 'string', kind: 'string', size: 'number' },
  sessions: { course_id: 'nullable', topic_id: 'nullable', task_id: 'nullable', date: 'string', kind: 'string', planned_min: 'number', actual_min: 'number', status: 'string', auto: 'boolean' },
  cards: { course_id: 'nullable', topic_id: 'nullable', front: 'string', back: 'string', ease: 'number', interval: 'number', reps: 'number', due_at: 'string', lapses: 'number', suspended: 'boolean', is_formula: 'boolean' },
  reviews: { card_id: 'string', at: 'string', grade: 'number', prev_interval: 'number', next_interval: 'number' },
  focus_sessions: { course_id: 'nullable', task_id: 'nullable', started: 'string', ended: 'nullable', minutes: 'number', interruptions: 'number' },
  notes: { course_id: 'nullable', topic_id: 'nullable', title: 'string', body_md: 'string', pinned: 'boolean' },
  note_versions: { note_id: 'string', body_md: 'string', at: 'string', source: 'string' },
  applications: { org: 'string', role: 'string', kind: 'string', stage: 'string', deadline: 'nullable', link: 'string', note: 'string', resume_version_id: 'nullable', sop_status: 'string', lor_status: 'string' },
  application_events: { application_id: 'string', at: 'string', kind: 'string', note: 'string' },
  contacts: { name: 'string', org: 'string', email: 'string', last_touch: 'nullable', follow_up_at: 'nullable', note: 'string' },
  resume_items: { kind: 'string', title: 'string', org: 'string', start: 'nullable', end: 'nullable', bullets: 'array' },
  resume_versions: { name: 'string', item_ids: 'array', target_role: 'string' },
  transactions: { at: 'string', amount: 'number', category: 'string', method: 'string', note: 'string' },
  budgets: { month: 'string', category: 'string', limit_amount: 'number' },
  recurring: { name: 'string', amount: 'number', cadence: 'string', next_at: 'string' },
  habits: { name: 'string', cadence: 'string', target: 'number', colour: 'string' },
  habit_logs: { habit_id: 'string', date: 'string', value: 'number' },
  ai_threads: { course_id: 'nullable', title: 'string', task_type: 'string' },
  ai_messages: { thread_id: 'string', role: 'string', content: 'string', tokens_in: 'number', tokens_out: 'number', cost_inr: 'number' },
  notification_prefs: { channel: 'string', enabled: 'boolean' },
}

function validRow(table: SyncedTable, row: unknown): row is Record<string, unknown> & { id: string } {
  if (!isRecord(row) || typeof row.id !== 'string' || !row.id.trim()) return false
  if (row.user_id !== null && typeof row.user_id !== 'string') return false
  if (typeof row.updated_at !== 'string' || !Number.isFinite(Date.parse(row.updated_at))) return false
  if (row.deleted_at !== null && (typeof row.deleted_at !== 'string' || !Number.isFinite(Date.parse(row.deleted_at)))) return false
  for (const [field, type] of Object.entries(ROW_FIELDS[table])) {
    const value = row[field]
    if (type === 'array' ? !Array.isArray(value) : type === 'nullable' ? value !== null && typeof value !== 'string' : typeof value !== type || (type === 'number' && !Number.isFinite(value))) return false
  }
  if (table === 'profiles') {
    if (row.id !== 'me' || !['cgpa10', 'gpa4', 'percent'].includes(String(row.grading_scheme)) || !['system', 'light', 'dark'].includes(String(row.theme))) return false
    if (!(row.grade_bands as unknown[]).length || !(row.grade_bands as unknown[]).every((band) => isRecord(band) && typeof band.letter === 'string' && typeof band.min_pct === 'number' && band.min_pct >= 0 && band.min_pct <= 100 && typeof band.points === 'number' && Number.isFinite(band.points) && band.points >= 0 && band.points <= (row.grading_scheme === 'gpa4' ? 4 : 10))) return false
    const time = (value: unknown) => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
    if ((row.quiet_hours as unknown[]).length !== 2 || !(row.quiet_hours as unknown[]).every(time) || !time(row.brief_time)) return false
    if (row.notify !== undefined && (!isRecord(row.notify) || !Object.values(row.notify).every((value) => typeof value === 'boolean'))) return false
    if (Number(row.daily_capacity_min) <= 0 || Number(row.attendance_threshold) < 0 || Number(row.attendance_threshold) > 1) return false
    if (String(row.term_end) < String(row.term_start)) return false
  }
  if (table === 'resume_items' && !(row.bullets as unknown[]).every((item) => typeof item === 'string')) return false
  if (table === 'resume_versions' && !(row.item_ids as unknown[]).every((item) => typeof item === 'string')) return false
  if (table === 'assessments' && row.score !== null && (typeof row.score !== 'number' || !Number.isFinite(row.score))) return false
  if (table === 'notification_prefs' && !isRecord(row.config)) return false
  if (table === 'ai_messages' && row.sequence !== undefined && (typeof row.sequence !== 'number' || !Number.isInteger(row.sequence) || row.sequence < 0)) return false
  const enums: Partial<Record<SyncedTable, Record<string, readonly string[]>>> = {
    timetable_slots: { kind: ['lecture', 'lab', 'tutorial', 'other'] },
    timetable_exceptions: { kind: ['cancelled', 'moved', 'holiday', 'extra'] },
    attendance: { status: ['present', 'absent', 'cancelled', 'excused'] },
    tasks: { status: ['todo', 'doing', 'done'], type: ['assignment', 'exam', 'quiz', 'project', 'reading', 'admin'] },
    attachments: { parent_type: ['task', 'note', 'course', 'application'] },
    sessions: { kind: ['study', 'revise', 'practice', 'task'], status: ['planned', 'done', 'skipped'] },
    note_versions: { source: ['local', 'remote'] },
    applications: { kind: ['internship', 'job', 'scholarship', 'university', 'competition'], stage: ['sourced', 'applied', 'test', 'interview', 'offer', 'rejected'], sop_status: ['none', 'draft', 'sent'], lor_status: ['none', 'requested', 'received'] },
    resume_items: { kind: ['experience', 'project', 'education', 'award'] },
    transactions: { method: ['upi', 'cash', 'card', 'other'] },
    recurring: { cadence: ['monthly', 'weekly', 'yearly'] },
    habits: { cadence: ['daily', 'weekly'] },
    ai_messages: { role: ['user', 'assistant', 'system'] },
  }
  for (const [field, values] of Object.entries(enums[table] ?? {})) if (!values.includes(String(row[field]))) return false
  const dates: Partial<Record<SyncedTable, string[]>> = {
    profiles: ['term_start', 'term_end'], timetable_exceptions: ['date'], attendance: ['date'], assessments: ['date'],
    tasks: ['due_at'], sessions: ['date'], cards: ['due_at'], reviews: ['at'], focus_sessions: ['started', 'ended'],
    note_versions: ['at'], applications: ['deadline'], application_events: ['at'], contacts: ['last_touch', 'follow_up_at'],
    resume_items: ['start', 'end'], transactions: ['at'], recurring: ['next_at'], habit_logs: ['date'],
  }
  for (const field of dates[table] ?? []) {
    const value = row[field]
    if (value === null) continue
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T|$)/.test(value) || !Number.isFinite(Date.parse(value))) return false
    const day = value.slice(0, 10)
    if (new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) !== day) return false
  }
  if (table === 'budgets' && !/^\d{4}-(0[1-9]|1[0-2])$/.test(String(row.month))) return false
  if ((table === 'transactions' || table === 'recurring') && Number(row.amount) <= 0) return false
  if (table === 'budgets' && Number(row.limit_amount) < 0) return false
  if (table === 'habits' && Number(row.target) <= 0) return false
  return true
}

/** Same, for binary payloads (the .docx export). */
export function downloadBytes(name: string, bytes: Uint8Array, type: string) {
  const buffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buffer).set(bytes)
  const url = URL.createObjectURL(new Blob([buffer], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
