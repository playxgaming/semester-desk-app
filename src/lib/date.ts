import {
  addDays,
  differenceInCalendarDays,
  format,
  isSameDay,
  parseISO,
  startOfWeek,
} from 'date-fns'

export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export const WEEKDAYS_LONG = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
]

/** "2026-09-01" — the key format for every date-indexed table. */
export function dayKey(d: Date | string = new Date()): string {
  const date = typeof d === 'string' ? parseISO(d) : d
  return format(date, 'yyyy-MM-dd')
}

export function today(): string {
  return dayKey(new Date())
}

export function parseDay(key: string): Date {
  return parseISO(`${key}T00:00:00`)
}

export function prettyDay(key: string): string {
  const d = parseDay(key)
  const diff = differenceInCalendarDays(d, new Date())
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  if (diff === -1) return 'Yesterday'
  return format(d, 'EEE d MMM')
}

export function prettyDateTime(iso: string): string {
  return format(parseISO(iso), 'd MMM, HH:mm')
}

/** Human countdown used all over the deadline queue. */
export function relativeDue(iso: string | null): { label: string; days: number } {
  if (!iso) return { label: 'no date', days: Number.POSITIVE_INFINITY }
  const days = differenceInCalendarDays(parseISO(iso), new Date())
  if (days < 0) return { label: `${Math.abs(days)}d overdue`, days }
  if (days === 0) return { label: 'due today', days }
  if (days === 1) return { label: 'due tomorrow', days }
  return { label: `in ${days}d`, days }
}

export function weekOf(d: Date = new Date()): string[] {
  const start = startOfWeek(d, { weekStartsOn: 1 })
  return Array.from({ length: 7 }, (_, i) => dayKey(addDays(start, i)))
}

export function nextNDays(n: number, from: Date = new Date()): string[] {
  return Array.from({ length: n }, (_, i) => dayKey(addDays(from, i)))
}

/** "09:30" → 570 */
export function minutesOfDay(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

export function fromMinutes(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function durationMin(start: string, end: string): number {
  return Math.max(0, minutesOfDay(end) - minutesOfDay(start))
}

export function humanMinutes(min: number): string {
  if (min < 60) return `${Math.round(min)}m`
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return m ? `${h}h ${m}m` : `${h}h`
}

export { addDays, differenceInCalendarDays, format, isSameDay, parseISO }
