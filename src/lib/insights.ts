import type {
  Assessment,
  Attendance,
  Card,
  Course,
  Profile,
  Review,
  StudySession,
  StudyTask,
  Topic,
} from '@/db/db'
import { attendanceStats } from './attendance'
import { addDays, dayKey, differenceInCalendarDays, humanMinutes, parseISO } from './date'
import { gradeCourse, whatDoINeed } from './grades'
import { retention } from './srs'
import { taskScore } from './priority'

/**
 * The retrospective and the plan critique, computed rather than generated.
 *
 * The original plan had a language model write these. It turns out almost
 * nothing here needs one: "your attendance in MA201 is one miss from the
 * line" and "these three weeks do not fit, and here is the cheapest thing to
 * drop" are arithmetic. Doing it locally means it is free, instant, works on
 * a train with no signal, and cannot invent a number that is not in your
 * data — which is the failure mode that matters for something you are going
 * to make decisions on.
 */

export type Severity = 'good' | 'watch' | 'urgent'

export interface Finding {
  id: string
  severity: Severity
  headline: string
  detail: string
  /** What to actually do about it, when there is something. */
  action?: string
}

export interface WeeklyReview {
  from: string
  to: string
  findings: Finding[]
  numbers: {
    studiedMin: number
    plannedMin: number
    adherence: number | null
    reviews: number
    retention: number | null
    tasksDone: number
    tasksAdded: number
    classesHeld: number
    classesAttended: number
  }
  verdict: string
}

export interface ReviewInput {
  now?: Date
  profile: Profile
  courses: Course[]
  attendance: Attendance[]
  assessments: Assessment[]
  tasks: StudyTask[]
  topics: Topic[]
  sessions: StudySession[]
  cards: Card[]
  reviews: Review[]
}

const WEEK = 7

/** Honest weekly assessment. No encouragement, no padding. */
export function weeklyReview(input: ReviewInput): WeeklyReview {
  const now = input.now ?? new Date()
  const from = dayKey(addDays(now, -WEEK))
  const to = dayKey(now)
  const inWeek = (key: string) => key > from && key <= to

  const weekSessions = input.sessions.filter((s) => inWeek(s.date) && !s.deleted_at)
  const studiedMin = weekSessions.reduce((sum, s) => sum + s.actual_min, 0)
  const plannedMin = weekSessions.reduce((sum, s) => sum + s.planned_min, 0)
  const adherence = plannedMin > 0 ? studiedMin / plannedMin : null

  const weekReviews = input.reviews.filter((r) => inWeek(dayKey(r.at)) && !r.deleted_at)
  const r = retention(weekReviews)

  const weekAttendance = input.attendance.filter((a) => inWeek(a.date) && !a.deleted_at)
  const classesHeld = weekAttendance.filter((a) => a.status !== 'cancelled').length
  const classesAttended = weekAttendance.filter((a) => a.status === 'present').length

  const tasksDone = input.tasks.filter(
    (t) => t.status === 'done' && inWeek(dayKey(t.updated_at)),
  ).length
  const openTasks = input.tasks.filter((t) => t.status !== 'done' && !t.deleted_at)
  const tasksAdded = input.tasks.filter((t) => inWeek(dayKey(t.updated_at))).length

  const findings: Finding[] = []

  /* attendance — the one with a hard threshold behind it */
  for (const c of input.courses) {
    const s = attendanceStats(
      input.attendance.filter((a) => a.course_id === c.id),
      c.attendance_threshold ?? input.profile.attendance_threshold,
    )
    if (s.held === 0) continue
    if (!s.meets) {
      findings.push({
        id: `att-${c.id}`,
        severity: 'urgent',
        headline: `${c.code} attendance is below the line at ${(s.pct! * 100).toFixed(1)}%`,
        detail: s.message,
        action: `Attend the next ${s.mustAttend} ${c.code} classes without exception.`,
      })
    } else if (s.canSkip === 0) {
      findings.push({
        id: `att-${c.id}`,
        severity: 'watch',
        headline: `${c.code} attendance has no slack left`,
        detail: `${(s.pct! * 100).toFixed(1)}% — exactly at the line. The next miss drops you below it.`,
      })
    }
  }

  /* grades — courses drifting away from their own target */
  for (const c of input.courses) {
    const g = gradeCourse(
      input.assessments.filter((a) => a.course_id === c.id),
      input.profile.grade_bands,
    )
    if (g.currentPct === null) continue
    const need = whatDoINeed(g, c.target_grade)
    if (need.status === 'impossible') {
      findings.push({
        id: `grade-${c.id}`,
        severity: 'urgent',
        headline: `${c.code} can no longer reach ${c.target_grade}%`,
        detail: `Ceiling is ${g.ceilingPct.toFixed(1)}%. ${need.message}`,
        action: `Reset the target on ${c.code} to something real, and put the hours where they still change the outcome.`,
      })
    } else if (need.status === 'reachable' && need.required > 90) {
      findings.push({
        id: `grade-${c.id}`,
        severity: 'watch',
        headline: `${c.code} needs ${need.required.toFixed(0)}% on everything left`,
        detail: `${g.currentPct.toFixed(1)}% so far, with ${g.remainingWeight}% of the marks still to come.`,
        action: `This is the course where an extra hour is worth the most.`,
      })
    }
  }

  /* the plan versus what actually happened */
  if (adherence !== null) {
    if (adherence < 0.5) {
      findings.push({
        id: 'adherence',
        severity: 'urgent',
        headline: `You did ${Math.round(adherence * 100)}% of the study you planned`,
        detail: `${humanMinutes(studiedMin)} against ${humanMinutes(plannedMin)} planned. A plan you miss by half is not a plan, it is a wish.`,
        action: `Lower your daily capacity in Settings until the plan is one you actually execute.`,
      })
    } else if (adherence > 1.15) {
      findings.push({
        id: 'adherence',
        severity: 'good',
        headline: `You did more than you planned — ${Math.round(adherence * 100)}% of it`,
        detail: `${humanMinutes(studiedMin)} against ${humanMinutes(plannedMin)}. Your capacity setting is too low; raise it and the planner will schedule closer to the truth.`,
      })
    }
  } else if (plannedMin === 0 && studiedMin === 0) {
    findings.push({
      id: 'adherence',
      severity: 'watch',
      headline: 'Nothing planned and nothing logged this week',
      detail: 'The planner has no evidence to work from, so its estimates will stay guesses.',
      action: 'Build a plan, then mark blocks done as you finish them.',
    })
  }

  /* spaced repetition */
  if (r.reviews === 0 && input.cards.length > 0) {
    findings.push({
      id: 'srs',
      severity: 'watch',
      headline: 'No cards reviewed this week',
      detail: `${input.cards.length} cards are sitting in your decks. Intervals only work if you turn up.`,
      action: 'Ten minutes clears most of a backlog.',
    })
  } else if (r.retention !== null && r.retention < 0.75 && r.reviews >= 20) {
    findings.push({
      id: 'srs',
      severity: 'watch',
      headline: `Retention is ${Math.round(r.retention * 100)}% — below where it should sit`,
      detail: `${r.reviews} reviews, ${r.reviews - r.correct} failures. Below about 80% usually means the cards are too big rather than that you are forgetting.`,
      action: 'Split the cards you keep failing into smaller ones.',
    })
  }

  /* deadlines that slipped past */
  const overdue = openTasks.filter(
    (t) => t.due_at && differenceInCalendarDays(parseISO(t.due_at), now) < 0,
  )
  if (overdue.length) {
    findings.push({
      id: 'overdue',
      severity: 'urgent',
      headline: `${overdue.length} deadline${overdue.length === 1 ? '' : 's'} already past`,
      detail: overdue.map((t) => t.title).join(', '),
      action: 'Close them or move the dates — an overdue list you ignore trains you to ignore the list.',
    })
  }

  /* syllabus coverage against time left in the term */
  const daysLeft = differenceInCalendarDays(parseISO(`${input.profile.term_end}T00:00:00`), now)
  const untouched = input.topics.filter((t) => !t.deleted_at && t.confidence === 0)
  if (daysLeft > 0 && daysLeft < 45 && untouched.length > 0) {
    const minutes = untouched.reduce((s, t) => s + t.est_minutes, 0)
    findings.push({
      id: 'coverage',
      severity: untouched.length > 8 ? 'urgent' : 'watch',
      headline: `${untouched.length} topics still untouched with ${daysLeft} days of term left`,
      detail: `About ${humanMinutes(minutes)} of first-pass work, against roughly ${humanMinutes(daysLeft * input.profile.daily_capacity_min)} of capacity.`,
      action:
        minutes > daysLeft * input.profile.daily_capacity_min
          ? 'That does not fit. Decide now which topics you are choosing not to learn.'
          : 'It fits, but only if you start.',
    })
  }

  if (!findings.length) {
    findings.push({
      id: 'clear',
      severity: 'good',
      headline: 'Nothing is going wrong',
      detail:
        'Attendance is clear of its thresholds, every course can still reach its target, and the plan is being executed. Keep going.',
    })
  }

  const urgent = findings.filter((f) => f.severity === 'urgent').length
  const verdict =
    urgent > 2
      ? `A hard week — ${urgent} things need attention at once. Pick the two with a real deadline behind them and let the rest wait.`
      : urgent === 2
        ? 'Two things need fixing this week. Neither is fatal on its own; both left alone is how a term goes wrong.'
        : urgent === 1
          ? 'Mostly fine, with one thing to fix this week.'
          : findings.every((f) => f.severity === 'good')
            ? 'A good week by the numbers.'
            : 'Nothing urgent, a couple of things worth watching.'

  return {
    from,
    to,
    findings: findings.sort(
      (a, b) => rank(b.severity) - rank(a.severity),
    ),
    numbers: {
      studiedMin,
      plannedMin,
      adherence,
      reviews: r.reviews,
      retention: r.retention,
      tasksDone,
      tasksAdded,
      classesHeld,
      classesAttended,
    },
    verdict,
  }
}

function rank(s: Severity): number {
  return s === 'urgent' ? 2 : s === 'watch' ? 1 : 0
}

/* ── Plan critique ─────────────────────────────────────────────────────── */

export interface Cut {
  label: string
  minutes: number
  /** Why this is the cheapest thing to drop. */
  because: string
}

export interface Critique {
  survivable: boolean
  headline: string
  demandMin: number
  capacityMin: number
  cuts: Cut[]
}

/**
 * "Are the next N days survivable?" — and if not, what is cheapest to drop.
 * Cheapest means lowest marks at stake per hour it frees.
 */
export function critique(
  input: {
    days: number
    capacityMin: number
    tasks: StudyTask[]
    topics: Topic[]
    courses: Course[]
    now?: Date
  },
): Critique {
  const now = input.now ?? new Date()
  const horizon = addDays(now, input.days)

  const tasks = input.tasks.filter(
    (t) =>
      t.status !== 'done' &&
      !t.deleted_at &&
      t.due_at &&
      parseISO(t.due_at) <= horizon,
  )
  const topics = input.topics.filter((t) => !t.deleted_at && t.confidence < 2)

  const taskMin = tasks.reduce((s, t) => s + t.est_minutes, 0)
  const topicMin = topics.reduce(
    (s, t) => s + Math.round((t.est_minutes * (3 - t.confidence)) / 3),
    0,
  )
  const demandMin = taskMin + topicMin
  const capacityMin = input.days * input.capacityMin
  const survivable = demandMin <= capacityMin

  // cost per hour freed: the marks you give up by not doing it
  const cuts: Cut[] = [
    ...tasks.map((t) => ({
      label: t.title,
      minutes: t.est_minutes,
      weight: Math.max(0.5, t.weight_pct),
      score: t.est_minutes / Math.max(0.5, t.weight_pct),
      because: `${t.weight_pct}% of a grade for ${humanMinutes(t.est_minutes)} of work`,
    })),
    ...topics.map((t) => ({
      label: t.name,
      minutes: Math.round((t.est_minutes * (3 - t.confidence)) / 3),
      weight: t.exam_critical ? 12 : 4,
      score:
        Math.round((t.est_minutes * (3 - t.confidence)) / 3) / (t.exam_critical ? 12 : 4),
      because: t.exam_critical
        ? 'exam critical, so expensive to skip'
        : 'not flagged exam critical',
    })),
  ]
    .sort((a, b) => b.score - a.score)
    .map(({ label, minutes, because }) => ({ label, minutes, because }))

  const over = demandMin - capacityMin
  const needed: Cut[] = []
  let freed = 0
  for (const c of cuts) {
    if (freed >= over) break
    needed.push(c)
    freed += c.minutes
  }

  return {
    survivable,
    demandMin,
    capacityMin,
    cuts: survivable ? [] : needed,
    headline: survivable
      ? `The next ${input.days} days fit, with ${humanMinutes(capacityMin - demandMin)} to spare.`
      : `The next ${input.days} days do not fit. ${humanMinutes(over)} of work has nowhere to go — dropping the ${needed.length} item${needed.length === 1 ? '' : 's'} below is the cheapest way to make it real.`,
  }
}

/** The next thing worth doing, with the reason stated. */
export function nextAction(tasks: StudyTask[], now: Date = new Date()): StudyTask | null {
  const open = tasks.filter((t) => t.status !== 'done' && !t.deleted_at)
  if (!open.length) return null
  return open.reduce((best, t) => (taskScore(t, now) > taskScore(best, now) ? t : best))
}
