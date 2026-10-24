import { db, type Attendance, type AttendanceStatus, type TimetableException, type TimetableSlot } from './db'
import { alive, patch, put, remove } from './mutate'
import { uid } from '@/lib/id'

/**
 * The single write path for attendance.
 *
 * There used to be two. Today's list wrote one row per timetable slot; the
 * Attendance grid wrote one row with no slot at all. Log the same class from
 * both screens and it counted twice in `held`, quietly pushing the percentage
 * — and therefore the skip calculator, the thing the app is judged on — off
 * the truth. Everything now goes through here.
 *
 * The rule: if the timetable knows about classes for that course on that day,
 * there is exactly one row per slot. If it does not, there is exactly one row
 * with `slot_id: null`. Never both.
 */

export const CYCLE: AttendanceStatus[] = ['present', 'absent', 'cancelled', 'excused']

/** Resolve the recurring timetable against this day's holidays and changes. */
export function slotsOnDate(slots: TimetableSlot[], date: string, exceptions: TimetableException[] = []): TimetableSlot[] {
  const changes = exceptions.filter((e) => !e.deleted_at && e.date === date)
  if (changes.some((e) => !e.slot_id && (e.kind === 'holiday' || e.kind === 'cancelled'))) return []
  const weekday = new Date(`${date}T00:00:00`).getDay()
  return slots.flatMap((slot) => {
    if (slot.deleted_at) return []
    const matching = changes.filter((e) => e.slot_id === slot.id)
    const change = matching[matching.length - 1]
    if (change?.kind === 'cancelled' || change?.kind === 'holiday') return []
    if (slot.weekday !== weekday && change?.kind !== 'extra' && change?.kind !== 'moved') return []
    return [{ ...slot, start: change?.new_start ?? slot.start, end: change?.new_end ?? slot.end }]
  })
}

export function slotsFor(
  slots: TimetableSlot[],
  courseId: string,
  date: string,
  exceptions: TimetableException[] = [],
): TimetableSlot[] {
  return slotsOnDate(slots, date, exceptions).filter((s) => s.course_id === courseId)
}

export function rowsFor(rows: Attendance[], courseId: string, date: string): Attendance[] {
  return rows.filter((r) => !r.deleted_at && r.course_id === courseId && r.date === date)
}

/**
 * What one cell in the grid should show: a single status when every slot
 * agrees, `mixed` when they do not, `null` when nothing is logged.
 */
export function cellStatus(rows: Attendance[]): AttendanceStatus | 'mixed' | null {
  if (!rows.length) return null
  const first = rows[0].status
  return rows.every((r) => r.status === first) ? first : 'mixed'
}

/** Set every slot of a course on a date to one status, creating or updating. */
export async function setAttendance(
  courseId: string,
  date: string,
  status: AttendanceStatus,
  slots: TimetableSlot[],
  existing: Attendance[],
  exceptions: TimetableException[] = [],
): Promise<void> {
  const daySlots = slotsFor(slots, courseId, date, exceptions)
  const current = rowsFor(existing, courseId, date)

  if (daySlots.length === 0) {
    // no timetable for that day — one bare row carries the whole day
    const bare = current.find((r) => r.slot_id === null)
    for (const stale of current.filter((r) => r.slot_id !== null)) {
      await remove('attendance', stale.id)
    }
    if (bare) await patch('attendance', bare.id, { status })
    else await write(courseId, date, null, status)
    return
  }

  // a slotted day must not also keep a bare row, or the class counts twice
  for (const bare of current.filter((r) => r.slot_id === null)) {
    await remove('attendance', bare.id)
  }
  for (const slot of daySlots) {
    const row = current.find((r) => r.slot_id === slot.id)
    if (row) await patch('attendance', row.id, { status })
    else await write(courseId, date, slot.id, status)
  }
}

/** Set one specific slot — used by Today, where each class is its own row. */
export async function setSlotAttendance(
  courseId: string,
  date: string,
  slotId: string,
  status: AttendanceStatus,
  existing: Attendance[],
): Promise<void> {
  const current = rowsFor(existing, courseId, date)
  for (const bare of current.filter((r) => r.slot_id === null)) {
    await remove('attendance', bare.id)
  }
  const row = current.find((r) => r.slot_id === slotId)
  if (row) await patch('attendance', row.id, { status })
  else await write(courseId, date, slotId, status)
}

/** The next status when a cell is tapped. Mixed collapses to present. */
export function nextStatus(current: AttendanceStatus | 'mixed' | null): AttendanceStatus {
  if (current === null || current === 'mixed') return 'present'
  return CYCLE[(CYCLE.indexOf(current) + 1) % CYCLE.length]
}

async function write(
  courseId: string,
  date: string,
  slotId: string | null,
  status: AttendanceStatus,
) {
  await put('attendance', {
    id: uid(),
    user_id: null,
    updated_at: '',
    deleted_at: null,
    course_id: courseId,
    slot_id: slotId,
    date,
    status,
  })
}

/**
 * One-time repair for databases written by the older, split code path.
 * Drops bare rows that sit alongside slotted ones for the same course and
 * day, and collapses duplicate rows for the same slot.
 */
export async function repairAttendance(): Promise<number> {
  const KEY = 'semester-desk:attendance-repaired-v1'
  try {
    if (localStorage.getItem(KEY)) return 0
  } catch {
    /* private mode: just run it */
  }

  const rows = alive(await db.attendance.toArray())
  const byDay = new Map<string, Attendance[]>()
  for (const r of rows) {
    const key = `${r.course_id}|${r.date}`
    byDay.set(key, [...(byDay.get(key) ?? []), r])
  }

  let removed = 0
  for (const group of byDay.values()) {
    const slotted = group.filter((r) => r.slot_id !== null)
    const bare = group.filter((r) => r.slot_id === null)

    // a bare row next to slotted ones is the duplicate
    if (slotted.length && bare.length) {
      for (const r of bare) {
        await remove('attendance', r.id)
        removed += 1
      }
    }

    // two rows for the same slot: keep the most recently updated
    const seen = new Map<string, Attendance>()
    for (const r of slotted) {
      const key = r.slot_id!
      const kept = seen.get(key)
      if (!kept) {
        seen.set(key, r)
        continue
      }
      const loser = kept.updated_at >= r.updated_at ? r : kept
      seen.set(key, kept.updated_at >= r.updated_at ? kept : r)
      await remove('attendance', loser.id)
      removed += 1
    }

    if (!slotted.length && bare.length > 1) {
      const sorted = [...bare].sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      for (const r of sorted.slice(1)) {
        await remove('attendance', r.id)
        removed += 1
      }
    }
  }

  try {
    localStorage.setItem(KEY, '1')
  } catch {
    /* ignore */
  }
  return removed
}
