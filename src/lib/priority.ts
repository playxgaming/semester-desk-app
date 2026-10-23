import type { StudyTask } from '@/db/db'
import { differenceInCalendarDays, parseISO } from './date'

/**
 * The deadline queue is sorted by impact × urgency, not by date. A 2% quiz
 * tomorrow should not outrank a 40% report due on Friday, and sorting by
 * date alone is exactly how that happens.
 */
export function taskScore(t: StudyTask, now: Date = new Date()): number {
  if (t.status === 'done') return -1
  const days = t.due_at ? differenceInCalendarDays(parseISO(t.due_at), now) : 30
  const urgency = days < 0 ? 3 : 1 / Math.max(0.5, days * 0.5 + 0.5)
  const impact = Math.max(1, t.weight_pct) + t.est_minutes / 60
  return urgency * impact
}

export function sortByPriority(tasks: StudyTask[], now: Date = new Date()): StudyTask[] {
  return [...tasks].sort((a, b) => taskScore(b, now) - taskScore(a, now))
}

/**
 * Status colour is reserved for things that need attention. A deadline three
 * weeks out is not "good" — it is simply not urgent — so it stays neutral
 * rather than green, which keeps the red and amber meaningful.
 */
export function dueTone(days: number): 'crit' | 'warn' | 'neutral' {
  if (days <= 1) return 'crit'
  if (days <= 3) return 'warn'
  return 'neutral'
}
