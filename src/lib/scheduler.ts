import { db } from '@/db/db'
import { alive, ensureProfile } from '@/db/mutate'
import { applySchedule, buildSchedule, permissionState } from './notify'

/**
 * Rebuild the device's reminder schedule from whatever is currently in the
 * database. Called on launch, after the planner writes a week, and from the
 * Settings button — it is cheap and idempotent, so calling it more often than
 * necessary costs nothing.
 */
export async function reschedule(): Promise<{ scheduled: number; native: boolean }> {
  if ((await permissionState()) !== 'granted') return { scheduled: 0, native: false }

  const [profile, courses, slots, tasks, sessions, cards, attendance, exceptions] = await Promise.all(
    [
      ensureProfile(),
      db.courses.toArray(),
      db.timetable_slots.toArray(),
      db.tasks.toArray(),
      db.sessions.toArray(),
      db.cards.toArray(),
      db.attendance.toArray(),
      db.timetable_exceptions.toArray(),
    ],
  )

  const holidays = new Set(
    alive(exceptions)
      .filter((e) => e.kind === 'holiday')
      .map((e) => e.date),
  )

  const planned = buildSchedule({
    profile,
    courses: alive(courses),
    slots: alive(slots),
    tasks: alive(tasks),
    sessions: alive(sessions),
    cards: alive(cards),
    attendance: alive(attendance),
    holidays,
  })

  return applySchedule(planned)
}

export interface RebalanceRecord {
  at: string
  moves: { id: string; from: string; to: string }[]
}

const LAST_REBALANCE = 'semester-desk:last-rebalance'

/** What the overnight pass moved, so the planner can offer to undo it. */
export function lastRebalance(): RebalanceRecord | null {
  try {
    const raw = localStorage.getItem(LAST_REBALANCE)
    if (!raw) return null
    const rec = JSON.parse(raw) as RebalanceRecord
    return rec.moves?.length ? rec : null
  } catch {
    return null
  }
}

export function clearRebalance() {
  try {
    localStorage.removeItem(LAST_REBALANCE)
  } catch {
    /* ignore */
  }
}

/** Put every moved block back where it was. */
export async function undoRebalance(): Promise<number> {
  const rec = lastRebalance()
  if (!rec) return 0
  const { patch } = await import('@/db/mutate')
  for (const m of rec.moves) await patch('sessions', m.id, { date: m.from })
  clearRebalance()
  return rec.moves.length
}

/**
 * Yesterday's unfinished blocks move forward on their own, so the morning
 * brief is already correct when it fires. Runs once per day at launch — and
 * because an automated change you did not ask for should always be
 * reversible, it records exactly what it moved.
 */
export async function overnightRebalance(): Promise<number> {
  const KEY = 'semester-desk:rebalanced'
  const today = new Date().toISOString().slice(0, 10)
  try {
    if (localStorage.getItem(KEY) === today) return 0
  } catch {
    /* private mode — just do the work */
  }

  const [sessionsRaw, profile] = await Promise.all([db.sessions.toArray(), ensureProfile()])
  const sessions = alive(sessionsRaw)
  const missed = sessions.filter((s) => s.status === 'planned' && s.date < today)
  if (!missed.length) {
    try {
      localStorage.setItem(KEY, today)
    } catch {
      /* ignore */
    }
    return 0
  }

  const { buildPlan, catchUp } = await import('./planner')
  const [courses, topics, tasks, slots] = await Promise.all([
    db.courses.toArray(),
    db.topics.toArray(),
    db.tasks.toArray(),
    db.timetable_slots.toArray(),
  ])

  const plan = buildPlan({
    from: today,
    days: 10,
    capacityMin: profile.daily_capacity_min,
    courses: alive(courses),
    topics: alive(topics),
    tasks: alive(tasks),
    slots: alive(slots),
    existing: sessions,
  })

  const before = new Map(missed.map((s) => [s.id, s.date]))
  const { moved } = catchUp(missed, plan.days)
  const { patch } = await import('@/db/mutate')
  for (const s of moved) await patch('sessions', s.id, { date: s.date })

  if (moved.length) {
    try {
      localStorage.setItem(
        LAST_REBALANCE,
        JSON.stringify({
          at: new Date().toISOString(),
          moves: moved.map((s) => ({ id: s.id, from: before.get(s.id) ?? s.date, to: s.date })),
        } satisfies RebalanceRecord),
      )
    } catch {
      /* the move still happened; only the undo is lost */
    }
  }

  try {
    localStorage.setItem(KEY, today)
  } catch {
    /* ignore */
  }
  return moved.length
}
