import type { Budget, Habit, HabitLog, Recurring, Transaction } from '@/db/db'
import { addDays, dayKey, differenceInCalendarDays, parseISO } from './date'
import { addMonths, addYears } from 'date-fns'

/**
 * Money maths. The number that matters mid-month is not "how much have I
 * spent" — it is "am I spending faster than the month is passing". Everything
 * here exists to answer that honestly.
 */

export const INR = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
})

export function rupees(n: number): string {
  return INR.format(Math.round(n))
}

/** "2026-09" for the month a date falls in. */
export function monthKey(d: Date | string = new Date()): string {
  const date = typeof d === 'string' ? parseISO(d) : d
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

export function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
}

export function daysInMonth(key: string): number {
  const [y, m] = key.split('-').map(Number)
  return new Date(y, m, 0).getDate()
}

/** How far through the month we are, 0–1. A finished month is 1. */
export function monthProgress(key: string, now: Date = new Date()): number {
  const total = daysInMonth(key)
  if (monthKey(now) !== key) return now > new Date(`${key}-01T00:00:00`) ? 1 : 0
  return now.getDate() / total
}

export interface BurnDown {
  category: string
  limit: number
  spent: number
  remaining: number
  /** Share of the budget used. */
  used: number
  /** Share of the month elapsed. */
  elapsed: number
  /** Spend per day if you keep this up, versus the pace the budget allows. */
  pacePerDay: number
  allowedPerDay: number
  /** What is left, per remaining day. */
  leftPerDay: number
  status: 'ahead' | 'on-track' | 'over-pace' | 'blown'
  message: string
}

export function burnDown(
  budget: Budget,
  transactions: Transaction[],
  now: Date = new Date(),
): BurnDown {
  const spent = transactions
    .filter((t) => !t.deleted_at && t.category === budget.category && monthKey(t.at) === budget.month)
    .reduce((s, t) => s + t.amount, 0)

  const limit = budget.limit_amount
  const total = daysInMonth(budget.month)
  const elapsed = monthProgress(budget.month, now)
  const dayOfMonth = Math.max(1, Math.round(elapsed * total))
  const daysLeft = Math.max(0, total - dayOfMonth)

  const used = limit > 0 ? spent / limit : 0
  const remaining = limit - spent
  const pacePerDay = spent / dayOfMonth
  const allowedPerDay = limit / total
  const leftPerDay = daysLeft > 0 ? remaining / daysLeft : remaining

  const status: BurnDown['status'] =
    spent > limit ? 'blown' : used > elapsed + 0.1 ? 'over-pace' : used < elapsed - 0.1 ? 'ahead' : 'on-track'

  const pct = Math.round(used * 100)
  const message =
    status === 'blown'
      ? `${pct}% of the ${budget.category} budget spent on day ${dayOfMonth} — ${rupees(Math.abs(remaining))} over.`
      : status === 'over-pace'
        ? `${pct}% spent, day ${dayOfMonth} of ${total}. ${rupees(leftPerDay)} a day left if the rest of the month is to hold.`
        : status === 'ahead'
          ? `${pct}% spent by day ${dayOfMonth}. Comfortably under pace.`
          : `${pct}% spent, day ${dayOfMonth} of ${total}. On pace.`

  return {
    category: budget.category,
    limit,
    spent,
    remaining,
    used,
    elapsed,
    pacePerDay,
    allowedPerDay,
    leftPerDay,
    status,
    message,
  }
}

export interface CategoryTotal {
  category: string
  amount: number
  share: number
  previous: number
  /** Change against last month, as a share of last month's total. */
  delta: number | null
}

export function byCategory(
  transactions: Transaction[],
  month: string,
  previousMonth: string,
): CategoryTotal[] {
  const live = transactions.filter((t) => !t.deleted_at)
  const sum = (rows: Transaction[]) =>
    rows.reduce((m, t) => m.set(t.category, (m.get(t.category) ?? 0) + t.amount), new Map<string, number>())

  const now = sum(live.filter((t) => monthKey(t.at) === month))
  const prev = sum(live.filter((t) => monthKey(t.at) === previousMonth))
  const total = [...now.values()].reduce((s, v) => s + v, 0)

  return [...new Set([...now.keys(), ...prev.keys()])]
    .map((category) => {
      const amount = now.get(category) ?? 0
      const previous = prev.get(category) ?? 0
      return {
        category,
        amount,
        share: total ? amount / total : 0,
        previous,
        delta: previous > 0 ? (amount - previous) / previous : null,
      }
    })
    .sort((a, b) => b.amount - a.amount)
}

/** Categories that quietly grew — the ones worth naming out loud. */
export function creepers(totals: CategoryTotal[], minAmount = 300): CategoryTotal[] {
  return totals
    .filter((c) => c.delta !== null && c.delta > 0.25 && c.amount >= minAmount)
    .sort((a, b) => (b.delta ?? 0) - (a.delta ?? 0))
}

export function advanceRecurring(r: Recurring, now: Date = new Date()): string {
  const due = parseISO(r.next_at)
  if (!Number.isFinite(due.getTime())) throw new Error('Set a valid next payment date first.')
  // A payment consumes one occurrence even when paid early. Calculate from
  // the original date so Jan 31 → Feb 28 → Mar 31 does not drift to the 28th.
  const occurrence = (count: number) => r.cadence === 'weekly'
    ? addDays(due, count * 7)
    : r.cadence === 'yearly' ? addYears(due, count) : addMonths(due, count)
  let count = 1
  let next = occurrence(count)
  while (next <= now) next = occurrence(++count)
  return next.toISOString()
}

export function dueSoon(rows: Recurring[], withinDays = 7, now: Date = new Date()): Recurring[] {
  return rows
    .filter((r) => !r.deleted_at)
    .filter((r) => differenceInCalendarDays(parseISO(r.next_at), now) <= withinDays)
    .sort((a, b) => a.next_at.localeCompare(b.next_at))
}

export interface HabitStreak {
  habit: Habit
  streak: number
  best: number
  last30: { date: string; value: number }[]
  doneToday: boolean
  rate: number
}

export function habitStreak(habit: Habit, logs: HabitLog[], now: Date = new Date()): HabitStreak {
  const mine = new Map(
    logs.filter((l) => l.habit_id === habit.id && !l.deleted_at).map((l) => [l.date, l.value]),
  )
  const hit = (key: string) => (mine.get(key) ?? 0) >= habit.target

  // Today not being logged yet does not break a streak — the day is not over.
  let streak = 0
  for (let i = hit(dayKey(now)) ? 0 : 1; ; i++) {
    if (!hit(dayKey(addDays(now, -i)))) break
    streak++
  }

  const last30 = Array.from({ length: 30 }, (_, i) => {
    const date = dayKey(addDays(now, -(29 - i)))
    return { date, value: mine.get(date) ?? 0 }
  })

  let best = 0
  let run = 0
  for (const d of last30) {
    if (d.value >= habit.target) {
      run += 1
      best = Math.max(best, run)
    } else run = 0
  }

  return {
    habit,
    streak,
    best: Math.max(best, streak),
    last30,
    doneToday: hit(dayKey(now)),
    rate: last30.filter((d) => d.value >= habit.target).length / 30,
  }
}

export const SPEND_CATEGORIES = [
  'Food',
  'Mess',
  'Rent',
  'Travel',
  'Books',
  'Phone',
  'Subscriptions',
  'Health',
  'Fun',
  'Other',
]
