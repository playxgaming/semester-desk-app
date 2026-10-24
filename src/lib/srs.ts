import type { Card, Review } from '@/db/db'
import { dayKey } from './date'

/**
 * SM-2 with lapse tracking. Four buttons rather than six, because nobody
 * meaningfully distinguishes a 3 from a 4 at 1am.
 */

export type Grade = 0 | 1 | 2 | 3 // again | hard | good | easy

export const GRADE_LABELS: Record<Grade, string> = {
  0: 'Again',
  1: 'Hard',
  2: 'Good',
  3: 'Easy',
}

/**
 * Ease deltas. SM-2's own curve punishes a single blackout by 0.8, which
 * sends a card you fumbled once into a spiral it takes weeks to leave. These
 * are the gentler deltas Anki settled on after two decades of use; the
 * interval maths below is still SM-2.
 */
const EASE_DELTA: Record<Grade, number> = { 0: -0.2, 1: -0.15, 2: 0, 3: 0.15 }

export const MIN_EASE = 1.3
/** Hard is a pass, but a grudging one — it grows the interval slowly. */
const HARD_FACTOR = 1.2
const EASY_BONUS = 1.3

export interface Scheduled {
  ease: number
  interval: number
  reps: number
  lapses: number
  due_at: string
}

export function schedule(card: Card, grade: Grade, now: Date = new Date()): Scheduled {
  let { ease, interval, reps, lapses } = card

  if (grade === 0) {
    reps = 0
    lapses += 1
    interval = 0 // relearn today; shown again at the end of this session
  } else if (grade === 1) {
    interval = Math.max(1, Math.round(interval * HARD_FACTOR))
    reps += 1
  } else {
    if (reps === 0) interval = 1
    else if (reps === 1) interval = 6
    else interval = Math.round(interval * ease)
    reps += 1
    if (grade === 3) interval = Math.round(interval * EASY_BONUS)
  }

  ease = Math.max(MIN_EASE, ease + EASE_DELTA[grade])

  const due = new Date(now)
  if (interval === 0) due.setMinutes(due.getMinutes() + 10)
  else due.setDate(due.getDate() + interval)

  return { ease, interval, reps, lapses, due_at: due.toISOString() }
}

/** Preview of every button's next interval, shown on the review buttons. */
export function previewIntervals(card: Card): Record<Grade, number> {
  return {
    0: schedule(card, 0).interval,
    1: schedule(card, 1).interval,
    2: schedule(card, 2).interval,
    3: schedule(card, 3).interval,
  }
}

export function intervalLabel(days: number): string {
  if (days === 0) return '10m'
  if (days === 1) return '1d'
  if (days < 30) return `${days}d`
  if (days < 365) return `${(days / 30).toFixed(days < 60 ? 1 : 0)}mo`
  return `${(days / 365).toFixed(1)}y`
}

export function isDue(card: Card, now: Date = new Date()): boolean {
  return !card.suspended && !card.deleted_at && new Date(card.due_at) <= now
}

export interface RetentionStats {
  reviews: number
  correct: number
  retention: number | null
  lapseRate: number | null
  byDay: { date: string; count: number; correct: number }[]
}

export function retention(reviews: Review[]): RetentionStats {
  const n = reviews.length
  const correct = reviews.filter((r) => r.grade > 0).length
  const map = new Map<string, { count: number; correct: number }>()
  for (const r of reviews) {
    const d = dayKey(r.at)
    const e = map.get(d) ?? { count: 0, correct: 0 }
    e.count += 1
    if (r.grade > 0) e.correct += 1
    map.set(d, e)
  }
  return {
    reviews: n,
    correct,
    retention: n ? correct / n : null,
    lapseRate: n ? (n - correct) / n : null,
    byDay: [...map.entries()]
      .map(([date, v]) => ({ date, ...v }))
      .sort((a, b) => a.date.localeCompare(b.date)),
  }
}

/**
 * Cloze: `{{c1::the hidden bit}}` → front hides c1, back reveals it.
 * One card per distinct cN, which is how a paragraph becomes five cards.
 */
export function expandCloze(text: string): { front: string; back: string }[] {
  const re = /\{\{c(\d+)::(.*?)(?:::(.*?))?\}\}/g
  const nums = new Set<string>()
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) nums.add(m[1])
  if (!nums.size) return []
  return [...nums].sort().map((n) => {
    const front = text.replace(re, (_all, num: string, body: string, hint?: string) =>
      num === n ? `[${hint || '…'}]` : body,
    )
    const back = text.replace(re, (_all, _num: string, body: string) => body)
    return { front, back }
  })
}
