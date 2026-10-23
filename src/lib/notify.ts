import type { Attendance, Card, Course, Profile, StudySession, StudyTask, TimetableSlot } from '@/db/db'
import { addDays, dayKey, differenceInCalendarDays, humanMinutes, minutesOfDay, parseISO } from './date'
import { isDue } from './srs'
import { taskScore } from './priority'

/**
 * Notifications with no server and no push service.
 *
 * The original plan fired these from `pg_cron` through Web Push, which needs
 * a backend, a VAPID keypair and a project that never sleeps. Everything here
 * is computed on the device from data already on the device, and handed to
 * Android's alarm scheduler. It works on a plane. It costs nothing. And it
 * keeps working if you never create a single account.
 *
 * The trade: a browser tab cannot schedule anything for when it is closed, so
 * the web build only fires while the app is open. The Android build is where
 * this feature actually lives.
 */

export type NotifyKind = 'morning' | 'deadline' | 'attendance' | 'review'

export interface PlannedNotification {
  /** Stable across rebuilds so rescheduling replaces rather than duplicates. */
  id: string
  kind: NotifyKind
  at: Date
  title: string
  body: string
}

export const NOTIFY_LABELS: Record<NotifyKind, { label: string; detail: string }> = {
  morning: {
    label: 'Morning brief',
    detail: "Today's classes, study blocks, cards due and anything slipping.",
  },
  deadline: {
    label: 'Deadline escalation',
    detail: 'At 7 days, 3 days, 1 day and overdue — weighted, so a 2% quiz stays quiet.',
  },
  attendance: {
    label: 'Attendance nudge',
    detail: 'Right after each class ends, because it is only ever logged if it takes one tap.',
  },
  review: {
    label: 'Sunday review',
    detail: 'The week in numbers, once a week.',
  },
}

export interface NotifyInput {
  profile: Profile
  courses: Course[]
  slots: TimetableSlot[]
  tasks: StudyTask[]
  sessions: StudySession[]
  cards: Card[]
  attendance: Attendance[]
  holidays?: Set<string>
  now?: Date
  days?: number
}

/** Is this moment inside the user's quiet hours? Handles the overnight wrap. */
export function inQuietHours(at: Date, quiet: [string, string]): boolean {
  const start = minutesOfDay(quiet[0])
  const end = minutesOfDay(quiet[1])
  const m = at.getHours() * 60 + at.getMinutes()
  return start <= end ? m >= start && m < end : m >= start || m < end
}

function at(day: Date, hhmm: string): Date {
  const d = new Date(day)
  const [h, m] = hhmm.split(':').map(Number)
  d.setHours(h || 0, m || 0, 0, 0)
  return d
}

/** The morning brief's body, assembled from the day it describes. */
export function briefFor(date: string, input: NotifyInput): string {
  const weekday = new Date(`${date}T00:00:00`).getDay()
  const byId = new Map(input.courses.map((c) => [c.id, c]))
  const slots = input.slots
    .filter((s) => !s.deleted_at && s.weekday === weekday)
    .sort((a, b) => a.start.localeCompare(b.start))
  const blocks = input.sessions.filter((s) => !s.deleted_at && s.date === date && s.status === 'planned')
  const due = input.cards.filter((c) => isDue(c, new Date(`${date}T23:59:59`)))
  const open = input.tasks.filter((t) => t.status !== 'done' && !t.deleted_at)
  const top = open.length
    ? open.reduce((best, t) => (taskScore(t) > taskScore(best) ? t : best))
    : null

  const parts: string[] = []
  parts.push(
    slots.length
      ? `${slots.length} classes from ${slots[0].start} — ${slots
          .map((s) => byId.get(s.course_id)?.code ?? '?')
          .join(', ')}`
      : 'No classes today',
  )
  if (blocks.length) {
    parts.push(`${humanMinutes(blocks.reduce((s, b) => s + b.planned_min, 0))} of study planned`)
  }
  if (due.length) parts.push(`${due.length} cards due`)
  if (top) {
    const days = top.due_at ? differenceInCalendarDays(parseISO(top.due_at), new Date(date)) : null
    parts.push(
      `Next: ${top.title}${days === null ? '' : days < 0 ? ' (overdue)' : days === 0 ? ' (today)' : ` (${days}d)`}`,
    )
  }
  return parts.join(' · ')
}

/**
 * Everything to schedule over the next `days`. Pure — no side effects, no
 * platform APIs — so it can be unit tested and reasoned about.
 */
export function buildSchedule(input: NotifyInput): PlannedNotification[] {
  const now = input.now ?? new Date()
  const days = input.days ?? 14
  const p = input.profile
  const enabled = p.notify ?? {}
  const out: PlannedNotification[] = []
  const holidays = input.holidays ?? new Set<string>()

  const byId = new Map(input.courses.map((c) => [c.id, c]))

  for (let i = 0; i < days; i++) {
    const day = addDays(now, i)
    const key = dayKey(day)
    const isHoliday = holidays.has(key)

    /* morning brief */
    if (enabled.morning !== false) {
      const when = at(day, p.brief_time || '07:00')
      if (when > now) {
        out.push({
          id: `morning:${key}`,
          kind: 'morning',
          at: when,
          title: i === 0 ? 'Today' : new Intl.DateTimeFormat('en-IN', { weekday: 'long' }).format(day),
          body: briefFor(key, input),
        })
      }
    }

    /* attendance nudge, five minutes after each class ends */
    if (enabled.attendance === true && !isHoliday) {
      const weekday = day.getDay()
      for (const slot of input.slots.filter((s) => !s.deleted_at && s.weekday === weekday)) {
        const when = new Date(at(day, slot.end).getTime() + 5 * 60_000)
        if (when <= now) continue
        const already = input.attendance.some(
          (a) => a.date === key && a.slot_id === slot.id && !a.deleted_at,
        )
        if (already) continue
        out.push({
          id: `att:${key}:${slot.id}`,
          kind: 'attendance',
          at: when,
          title: `${byId.get(slot.course_id)?.code ?? 'Class'} — were you there?`,
          body: 'One tap now, or it never gets logged.',
        })
      }
    }

    /* Sunday review */
    if (enabled.review !== false && day.getDay() === 0) {
      const when = at(day, '18:00')
      if (when > now) {
        out.push({
          id: `review:${key}`,
          kind: 'review',
          at: when,
          title: 'Your week, in numbers',
          body: 'Attendance, retention, what slipped and what to change.',
        })
      }
    }
  }

  /* deadline escalation — weighted, so a 2% quiz does not shout */
  if (enabled.deadline !== false) {
    for (const t of input.tasks) {
      if (t.status === 'done' || t.deleted_at || !t.due_at) continue
      const due = parseISO(t.due_at)
      const steps: { lead: number; label: string }[] = [
        { lead: 7, label: 'in a week' },
        { lead: 3, label: 'in three days' },
        { lead: 1, label: 'tomorrow' },
        { lead: 0, label: 'today' },
      ]
      for (const step of steps) {
        // only shout early about things that carry real weight
        if (step.lead >= 7 && t.weight_pct < 15) continue
        if (step.lead === 3 && t.weight_pct < 5) continue
        const when = at(addDays(due, -step.lead), '09:00')
        if (when <= now || differenceInCalendarDays(when, now) > days) continue
        out.push({
          id: `task:${t.id}:${step.lead}`,
          kind: 'deadline',
          at: when,
          title: `${t.title} — due ${step.label}`,
          body: `${t.weight_pct}% of the grade · ${humanMinutes(t.est_minutes)} of work left`,
        })
      }
    }
  }

  return out
    .filter((n) => !inQuietHours(n.at, p.quiet_hours))
    .sort((a, b) => a.at.getTime() - b.at.getTime())
}

/** Capacitor wants a 32-bit int; this maps our string ids onto one stably. */
export function numericId(id: string): number {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h % 2147483000) || 1
}

/* ── platform adapter ──────────────────────────────────────────────────── */

interface CapacitorGlobal {
  isNativePlatform?: () => boolean
}

export function isNative(): boolean {
  const c = (globalThis as { Capacitor?: CapacitorGlobal }).Capacitor
  return Boolean(c?.isNativePlatform?.())
}

export type PermissionState = 'granted' | 'denied' | 'prompt' | 'unsupported'

export async function permissionState(): Promise<PermissionState> {
  if (isNative()) {
    try {
      const { LocalNotifications } = await import('@capacitor/local-notifications')
      const res = await LocalNotifications.checkPermissions()
      return res.display === 'granted' ? 'granted' : res.display === 'denied' ? 'denied' : 'prompt'
    } catch {
      return 'unsupported'
    }
  }
  if (typeof Notification === 'undefined') return 'unsupported'
  return Notification.permission === 'granted'
    ? 'granted'
    : Notification.permission === 'denied'
      ? 'denied'
      : 'prompt'
}

export async function requestPermission(): Promise<PermissionState> {
  if (isNative()) {
    try {
      const { LocalNotifications } = await import('@capacitor/local-notifications')
      const res = await LocalNotifications.requestPermissions()
      return res.display === 'granted' ? 'granted' : 'denied'
    } catch {
      return 'unsupported'
    }
  }
  if (typeof Notification === 'undefined') return 'unsupported'
  const res = await Notification.requestPermission()
  return res === 'granted' ? 'granted' : 'denied'
}

/**
 * Hand the schedule to the platform. On Android every item becomes a real
 * alarm that fires with the app closed. In a browser only the ones due while
 * the tab stays open can fire, which is why the Android build exists.
 */
export async function applySchedule(
  planned: PlannedNotification[],
): Promise<{ scheduled: number; native: boolean }> {
  if (!isNative()) {
    return { scheduled: 0, native: false }
  }
  const { LocalNotifications } = await import('@capacitor/local-notifications')

  const pending = await LocalNotifications.getPending()
  if (pending.notifications.length) {
    await LocalNotifications.cancel({
      notifications: pending.notifications.map((n: { id: number }) => ({ id: n.id })),
    })
  }

  // Android caps how many alarms one app may hold; stay well under it
  const batch = planned.slice(0, 60)
  if (!batch.length) return { scheduled: 0, native: true }

  await LocalNotifications.schedule({
    notifications: batch.map((n) => ({
      id: numericId(n.id),
      title: n.title,
      body: n.body,
      schedule: { at: n.at, allowWhileIdle: n.kind === 'morning' },
      extra: { kind: n.kind, key: n.id },
    })),
  })
  return { scheduled: batch.length, native: true }
}

/** Fire one immediately — used by "send a test" in Settings. */
export async function fireTest(title: string, body: string): Promise<boolean> {
  if (isNative()) {
    try {
      const { LocalNotifications } = await import('@capacitor/local-notifications')
      await LocalNotifications.schedule({
        notifications: [
          { id: 999001, title, body, schedule: { at: new Date(Date.now() + 3000) } },
        ],
      })
      return true
    } catch {
      return false
    }
  }
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return false
  new Notification(title, { body })
  return true
}
