import type { Application, ApplicationStage, StudyTask } from '@/db/db'
import { differenceInCalendarDays, parseISO } from './date'
import { taskScore } from './priority'

/**
 * The application pipeline, and the rule that makes it worth having in the
 * same app as coursework: an application deadline competes for your attention
 * on equal terms with a problem set. Both end up in one queue, scored the
 * same way.
 */

export const STAGES: { key: ApplicationStage; label: string; open: boolean }[] = [
  { key: 'sourced', label: 'Sourced', open: true },
  { key: 'applied', label: 'Applied', open: true },
  { key: 'test', label: 'Test', open: true },
  { key: 'interview', label: 'Interview', open: true },
  { key: 'offer', label: 'Offer', open: false },
  { key: 'rejected', label: 'Rejected', open: false },
]

export const KINDS: Application['kind'][] = [
  'internship',
  'job',
  'scholarship',
  'university',
  'competition',
]

export function isOpen(a: Application): boolean {
  return a.stage !== 'offer' && a.stage !== 'rejected'
}

/**
 * How much work an application still represents. A scholarship you have not
 * started is a bigger commitment than one where the SOP is already sent, and
 * the queue should say so.
 */
export function effortMinutes(a: Application): number {
  if (!isOpen(a)) return 0
  const base = a.stage === 'sourced' ? 180 : a.stage === 'applied' ? 45 : 120
  const sop = a.sop_status === 'none' ? 150 : a.sop_status === 'draft' ? 60 : 0
  const lor = a.lor_status === 'none' ? 20 : 0
  return base + sop + lor
}

/** Applications carry no grade weight, so they get a fixed one — a missed
 *  deadline costs the whole opportunity, which is worth about a mid-sem. */
const APPLICATION_WEIGHT = 25

export interface QueueItem {
  id: string
  kind: 'task' | 'application'
  title: string
  subtitle: string
  dueAt: string | null
  weightPct: number
  estMinutes: number
  score: number
  courseId: string | null
  source: StudyTask | Application
}

export function queueItems(
  tasks: StudyTask[],
  applications: Application[],
  now: Date = new Date(),
): QueueItem[] {
  const fromTasks: QueueItem[] = tasks
    .filter((t) => t.status !== 'done' && !t.deleted_at)
    .map((t) => ({
      id: t.id,
      kind: 'task' as const,
      title: t.title,
      subtitle: t.type,
      dueAt: t.due_at,
      weightPct: t.weight_pct,
      estMinutes: t.est_minutes,
      score: taskScore(t, now),
      courseId: t.course_id,
      source: t,
    }))

  const fromApps: QueueItem[] = applications
    .filter((a) => isOpen(a) && a.deadline && !a.deleted_at)
    .map((a) => {
      const est = effortMinutes(a)
      const shim: StudyTask = {
        id: a.id,
        user_id: a.user_id,
        updated_at: a.updated_at,
        deleted_at: null,
        course_id: null,
        title: a.role,
        type: 'admin',
        due_at: a.deadline,
        weight_pct: APPLICATION_WEIGHT,
        est_minutes: est,
        status: 'todo',
        notes: '',
      }
      return {
        id: a.id,
        kind: 'application' as const,
        title: `${a.role} — ${a.org}`,
        subtitle: a.kind,
        dueAt: a.deadline,
        weightPct: APPLICATION_WEIGHT,
        estMinutes: est,
        score: taskScore(shim, now),
        courseId: null,
        source: a,
      }
    })

  return [...fromTasks, ...fromApps].sort((a, b) => b.score - a.score)
}

export interface Funnel {
  stage: ApplicationStage
  label: string
  count: number
}

export function funnel(applications: Application[]): Funnel[] {
  return STAGES.map((s) => ({
    stage: s.key,
    label: s.label,
    count: applications.filter((a) => a.stage === s.key && !a.deleted_at).length,
  }))
}

export interface PipelineHealth {
  open: number
  offers: number
  rejected: number
  /** Offers as a share of everything that reached a decision. */
  conversion: number | null
  /** Open applications with a deadline inside a week. */
  urgent: Application[]
  /** Applied or later, with nothing logged for three weeks. */
  stale: Application[]
}

export function health(
  applications: Application[],
  lastEventAt: Map<string, string>,
  now: Date = new Date(),
): PipelineHealth {
  const live = applications.filter((a) => !a.deleted_at)
  const open = live.filter(isOpen)
  const offers = live.filter((a) => a.stage === 'offer').length
  const rejected = live.filter((a) => a.stage === 'rejected').length
  const decided = offers + rejected

  return {
    open: open.length,
    offers,
    rejected,
    conversion: decided ? offers / decided : null,
    urgent: open
      .filter((a) => a.deadline && differenceInCalendarDays(parseISO(a.deadline), now) <= 7)
      .sort((a, b) => (a.deadline ?? '').localeCompare(b.deadline ?? '')),
    stale: open
      .filter((a) => a.stage !== 'sourced')
      .filter((a) => {
        const last = lastEventAt.get(a.id) ?? a.updated_at
        return differenceInCalendarDays(now, parseISO(last)) >= 21
      }),
  }
}
