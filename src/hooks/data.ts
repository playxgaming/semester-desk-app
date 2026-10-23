import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Course, type Profile } from '@/db/db'
import { alive, defaultProfile, PROFILE_ID } from '@/db/mutate'
import { today } from '@/lib/date'

/**
 * Every read in the app goes through one of these. They all filter
 * tombstones, so a soft-deleted row can never leak into a view.
 */

export function useProfile(): Profile {
  const p = useLiveQuery(() => db.profiles.get(PROFILE_ID), [], undefined)
  return p ?? defaultProfile()
}

export function useCourses(includeArchived = false): Course[] {
  return (
    useLiveQuery(async () => {
      const rows = alive(await db.courses.toArray())
      return rows
        .filter((c) => includeArchived || !c.archived)
        .sort((a, b) => a.code.localeCompare(b.code))
    }, [includeArchived]) ?? []
  )
}

export function useCourse(id: string | undefined) {
  return useLiveQuery(async () => (id ? db.courses.get(id) : undefined), [id])
}

export function useSlots(courseId?: string) {
  return (
    useLiveQuery(async () => {
      const rows = alive(await db.timetable_slots.toArray())
      return rows
        .filter((s) => !courseId || s.course_id === courseId)
        .sort((a, b) => a.weekday - b.weekday || a.start.localeCompare(b.start))
    }, [courseId]) ?? []
  )
}

export function useExceptions() {
  return useLiveQuery(async () => alive(await db.timetable_exceptions.toArray()), []) ?? []
}

export function useAttendance(courseId?: string) {
  return (
    useLiveQuery(async () => {
      const rows = alive(await db.attendance.toArray())
      return rows.filter((a) => !courseId || a.course_id === courseId)
    }, [courseId]) ?? []
  )
}

export function useAssessments(courseId?: string) {
  return (
    useLiveQuery(async () => {
      const rows = alive(await db.assessments.toArray())
      return rows.filter((a) => !courseId || a.course_id === courseId)
    }, [courseId]) ?? []
  )
}

export function useTopics(courseId?: string) {
  return (
    useLiveQuery(async () => {
      const rows = alive(await db.topics.toArray())
      return rows
        .filter((t) => !courseId || t.course_id === courseId)
        .sort((a, b) => a.order_index - b.order_index)
    }, [courseId]) ?? []
  )
}

export function useTasks(courseId?: string) {
  return (
    useLiveQuery(async () => {
      const rows = alive(await db.tasks.toArray())
      return rows.filter((t) => !courseId || t.course_id === courseId)
    }, [courseId]) ?? []
  )
}

export function useSubtasks(taskId: string | undefined) {
  return (
    useLiveQuery(async () => {
      if (!taskId) return []
      const rows = alive(await db.subtasks.where('task_id').equals(taskId).toArray())
      return rows.sort((a, b) => a.order_index - b.order_index)
    }, [taskId]) ?? []
  )
}

export function useSessions() {
  return useLiveQuery(async () => alive(await db.sessions.toArray()), []) ?? []
}

export function useSessionsOn(date: string) {
  return (
    useLiveQuery(async () => alive(await db.sessions.where('date').equals(date).toArray()), [date]) ??
    []
  )
}

export function useCards(courseId?: string) {
  return (
    useLiveQuery(async () => {
      const rows = alive(await db.cards.toArray())
      return rows.filter((c) => !courseId || c.course_id === courseId)
    }, [courseId]) ?? []
  )
}

export function useReviews() {
  return useLiveQuery(async () => alive(await db.reviews.toArray()), []) ?? []
}

export function useNotes(courseId?: string) {
  return (
    useLiveQuery(async () => {
      const rows = alive(await db.notes.toArray())
      return rows
        .filter((n) => !courseId || n.course_id === courseId)
        .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updated_at.localeCompare(a.updated_at))
    }, [courseId]) ?? []
  )
}

export function useFocusToday() {
  return (
    useLiveQuery(async () => {
      const rows = alive(await db.focus_sessions.toArray())
      return rows.filter((f) => f.started.slice(0, 10) === today())
    }, []) ?? []
  )
}

export function useCourseMap(): Map<string, Course> {
  const courses = useCourses(true)
  return new Map(courses.map((c) => [c.id, c]))
}

/* ── Career, money and life (phase 5) ──────────────────────────────────── */

export function useApplications() {
  return (
    useLiveQuery(async () => {
      const rows = alive(await db.applications.toArray())
      return rows.sort((a, b) => (a.deadline ?? '9999').localeCompare(b.deadline ?? '9999'))
    }, []) ?? []
  )
}

export function useApplicationEvents(applicationId?: string) {
  return (
    useLiveQuery(async () => {
      const rows = alive(await db.application_events.toArray())
      return rows
        .filter((e) => !applicationId || e.application_id === applicationId)
        .sort((a, b) => b.at.localeCompare(a.at))
    }, [applicationId]) ?? []
  )
}

export function useContacts() {
  return (
    useLiveQuery(async () => {
      const rows = alive(await db.contacts.toArray())
      return rows.sort((a, b) => (a.follow_up_at ?? '9999').localeCompare(b.follow_up_at ?? '9999'))
    }, []) ?? []
  )
}

export function useResumeItems() {
  return (
    useLiveQuery(async () => {
      const rows = alive(await db.resume_items.toArray())
      return rows.sort((a, b) => (b.start ?? '').localeCompare(a.start ?? ''))
    }, []) ?? []
  )
}

export function useResumeVersions() {
  return useLiveQuery(async () => alive(await db.resume_versions.toArray()), []) ?? []
}

export function useTransactions() {
  return (
    useLiveQuery(async () => {
      const rows = alive(await db.transactions.toArray())
      return rows.sort((a, b) => b.at.localeCompare(a.at))
    }, []) ?? []
  )
}

export function useBudgets(month?: string) {
  return (
    useLiveQuery(async () => {
      const rows = alive(await db.budgets.toArray())
      return rows.filter((b) => !month || b.month === month)
    }, [month]) ?? []
  )
}

export function useRecurring() {
  return (
    useLiveQuery(async () => {
      const rows = alive(await db.recurring.toArray())
      return rows.sort((a, b) => a.next_at.localeCompare(b.next_at))
    }, []) ?? []
  )
}

export function useHabits() {
  return useLiveQuery(async () => alive(await db.habits.toArray()), []) ?? []
}

export function useHabitLogs() {
  return useLiveQuery(async () => alive(await db.habit_logs.toArray()), []) ?? []
}
