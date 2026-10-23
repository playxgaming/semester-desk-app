import clsx from 'clsx'
import { Link } from 'react-router-dom'
import { Briefcase, Check, Minus, Slash, Timer as TimerIcon } from 'lucide-react'
import { Badge, Bar, Button, Card, Check as CheckBox, Dot, Empty, Note, PageHeader, Panel, Stat } from '@/components/ui'
import {
  useApplications,
  useAssessments,
  useAttendance,
  useCards,
  useContacts,
  useHabitLogs,
  useHabits,
  useRecurring,
  useCourseMap,
  useCourses,
  useProfile,
  useSessionsOn,
  useSlots,
  useTasks,
} from '@/hooks/data'
import { durationMin, humanMinutes, prettyDay, relativeDue, today } from '@/lib/date'
import { attendanceStats } from '@/lib/attendance'
import { computeGpa, formatGpa, gradeCourse } from '@/lib/grades'
import { isDue } from '@/lib/srs'
import { dueTone } from '@/lib/priority'
import { queueItems } from '@/lib/pipeline'
import { dueSoon, habitStreak, rupees } from '@/lib/money'
import { patch } from '@/db/mutate'
import { patchWithUndo } from '@/lib/undoable'
import { setSlotAttendance } from '@/db/attendance'
import { tap } from '@/lib/haptics'
import type { Attendance, AttendanceStatus, TimetableSlot } from '@/db/db'
import { useUi } from '@/store/ui'

function ClassRow({
  slot,
  colour,
  code,
  logged,
  onLog,
}: {
  slot: TimetableSlot
  colour: string
  code: string
  logged: Attendance | undefined
  onLog: (status: AttendanceStatus) => void
}) {
  // The short words are for the phone, where three unlabelled boxes tell you
  // nothing; the full label is what a screen reader and a tooltip get.
  const options: { s: AttendanceStatus; icon: typeof Check; label: string; short: string }[] = [
    { s: 'present', icon: Check, label: 'Present', short: 'Here' },
    { s: 'absent', icon: Minus, label: 'Absent', short: 'Missed' },
    { s: 'cancelled', icon: Slash, label: 'Cancelled', short: 'Off' },
  ]
  return (
    <li className="flex flex-wrap items-center gap-3 border-b border-rule py-2.5 last:border-0">
      <Dot colour={colour} />
      <span className="font-mono text-[12.5px] text-ink-3 tabnum">
        {slot.start}–{slot.end}
      </span>
      <span className="min-w-0 flex-1">
        <b className="font-mono text-[13px] font-medium">{code}</b>
        <span className="ml-2 text-[13px] text-ink-3">
          {slot.kind === 'lecture' ? '' : `${slot.kind} · `}
          {slot.room}
        </span>
      </span>
      {/* Wide enough for a thumb on a phone, compact on a laptop where a
          pointer is doing the work. */}
      <div className="flex w-full gap-1.5 sm:w-auto sm:gap-1">
        {options.map(({ s, icon: Icon, label, short }) => (
          <button
            key={s}
            type="button"
            aria-label={label}
            title={label}
            aria-pressed={logged?.status === s}
            onClick={() => onLog(s)}
            className={clsx(
              'flex h-11 flex-1 items-center justify-center gap-1.5 rounded border text-[12px] sm:h-8 sm:w-9 sm:flex-none sm:gap-0',
              logged?.status === s
                ? 'border-accent bg-accent text-[color:var(--accent-ink)]'
                : 'border-rule text-ink-3 hover:border-rule-2 hover:text-ink',
            )}
          >
            <Icon size={15} className="sm:hidden" />
            <Icon size={13} className="hidden sm:block" />
            <span className="sm:hidden">{short}</span>
          </button>
        ))}
      </div>
    </li>
  )
}

export default function Today() {
  const profile = useProfile()
  const courses = useCourses()
  const byId = useCourseMap()
  const slots = useSlots()
  const attendance = useAttendance()
  const tasks = useTasks()
  const cards = useCards()
  const assessments = useAssessments()
  const applications = useApplications()
  const contacts = useContacts()
  const recurring = useRecurring()
  const habits = useHabits()
  const habitLogs = useHabitLogs()
  const key = today()
  const sessions = useSessionsOn(key)
  const notify = useUi((s) => s.notify)

  const weekday = new Date().getDay()
  const todaySlots = slots
    .filter((s) => s.weekday === weekday)
    .sort((a, b) => a.start.localeCompare(b.start))
  const loggedToday = new Map(attendance.filter((a) => a.date === key).map((a) => [a.slot_id, a]))

  const open = tasks.filter((t) => t.status !== 'done')
  const queue = queueItems(open, applications).slice(0, 6)
  const openApplications = applications.filter((a) => a.stage !== 'offer' && a.stage !== 'rejected')
  const followUps = contacts.filter((c) => c.follow_up_at && new Date(c.follow_up_at) <= new Date())
  const recurringSoon = dueSoon(recurring)
  const dueCards = cards.filter((c) => isDue(c))

  const gpa = computeGpa(
    courses.map((c) => ({
      course: c,
      grade: gradeCourse(
        assessments.filter((a) => a.course_id === c.id),
        profile.grade_bands,
      ),
    })),
    profile,
  )

  const atRisk = courses
    .map((c) => ({
      course: c,
      stats: attendanceStats(
        attendance.filter((a) => a.course_id === c.id),
        c.attendance_threshold || profile.attendance_threshold,
      ),
    }))
    .filter((x) => x.stats.held > 0 && (!x.stats.meets || x.stats.canSkip === 0))

  const plannedMin = sessions.reduce((s, x) => s + (x.status === 'planned' ? x.planned_min : 0), 0)
  const doneMin = sessions.reduce((s, x) => s + x.actual_min, 0)
  const classMin = todaySlots.reduce((s, x) => s + durationMin(x.start, x.end), 0)

  async function log(slot: TimetableSlot, status: AttendanceStatus) {
    await setSlotAttendance(slot.course_id, key, slot.id, status, attendance)
    notify(`${byId.get(slot.course_id)?.code ?? 'Class'} marked ${status}`)
    void tap()
  }

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  return (
    <>
      <PageHeader
        eyebrow={prettyDay(key)}
        title={profile.name ? `${greeting}, ${profile.name.split(' ')[0]}` : greeting}
        lede={
          todaySlots.length
            ? `${todaySlots.length} classes (${humanMinutes(classMin)}) and ${humanMinutes(plannedMin)} of planned study. ${dueCards.length} cards due.`
            : `No classes today. ${humanMinutes(plannedMin)} of planned study, ${dueCards.length} cards due.`
        }
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          value={formatGpa(gpa)}
          label={profile.grading_scheme === 'percent' ? 'Weighted average' : 'Current SGPA'}
          hint={`${gpa.credits} credits graded`}
        />
        <Stat
          value={open.length}
          label="Open deadlines"
          hint={
            open.filter((t) => relativeDue(t.due_at).days <= 3).length
              ? `${open.filter((t) => relativeDue(t.due_at).days <= 3).length} inside 3 days`
              : 'nothing urgent'
          }
          tone={open.filter((t) => relativeDue(t.due_at).days < 0).length ? 'crit' : undefined}
        />
        <Stat value={dueCards.length} label="Cards due" hint={`${cards.length} in your decks`} />
        <Stat
          value={humanMinutes(doneMin)}
          label="Studied today"
          hint={plannedMin ? `of ${humanMinutes(plannedMin)} planned` : 'nothing planned yet'}
          tone={doneMin >= plannedMin && plannedMin > 0 ? 'ok' : undefined}
        />
      </div>

      {atRisk.length > 0 && (
        <Note tone={atRisk.some((a) => !a.stats.meets) ? 'crit' : 'warn'} title="Attendance">
          {atRisk.map((a) => (
            <p key={a.course.id} className="mb-1 last:mb-0">
              <b className="font-mono text-[13px]">{a.course.code}</b> — {(a.stats.pct! * 100).toFixed(1)}%.{' '}
              {a.stats.message}
            </p>
          ))}
        </Note>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title="Today's classes"
          sub={todaySlots.length ? `${loggedToday.size}/${todaySlots.length} logged` : undefined}
          action={
            <Link to="/timetable" className="tap-link text-[12.5px]">
              Timetable
            </Link>
          }
        >
          {todaySlots.length ? (
            <ul className="-my-1">
              {todaySlots.map((s) => (
                <ClassRow
                  key={s.id}
                  slot={s}
                  colour={byId.get(s.course_id)?.colour ?? 'var(--accent)'}
                  code={byId.get(s.course_id)?.code ?? '—'}
                  logged={loggedToday.get(s.id)}
                  onLog={(status) => void log(s, status)}
                />
              ))}
            </ul>
          ) : (
            <Empty title="Nothing scheduled">
              No classes on the timetable for today. Good day to clear a deadline.
            </Empty>
          )}
        </Panel>

        <Panel
          title="What to do next"
          sub="impact × urgency"
          action={
            <Link to="/tasks" className="tap-link text-[12.5px]">
              All deadlines
            </Link>
          }
        >
          {queue.length ? (
            <ul className="-my-1">
              {queue.map((q) => {
                const rel = relativeDue(q.dueAt)
                const c = q.courseId ? byId.get(q.courseId) : undefined
                return (
                  <li
                    key={q.id}
                    className="flex items-center gap-3 border-b border-rule py-2.5 last:border-0"
                  >
                    {q.kind === 'task' ? (
                      <CheckBox
                        label={`Mark ${q.title} done`}
                        onChange={() => void patchWithUndo('tasks', q.id, { status: 'done' }, `${q.title} done`)}
                      />
                    ) : (
                      <Briefcase size={15} className="shrink-0 text-accent" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px]">{q.title}</span>
                      <span className="text-[11.5px] text-ink-3">
                        {c ? `${c.code} · ` : q.kind === 'application' ? `${q.subtitle} · ` : ''}
                        {q.weightPct}% of grade · {humanMinutes(q.estMinutes)}
                      </span>
                    </span>
                    <Badge tone={dueTone(rel.days)}>{rel.label}</Badge>
                  </li>
                )
              })}
            </ul>
          ) : (
            <Empty title="Queue is clear">Nothing open. Add a deadline when the next one lands.</Empty>
          )}
        </Panel>

        <Panel
          title="Study blocks"
          sub={prettyDay(key)}
          action={
            <Link to="/planner" className="tap-link text-[12.5px]">
              Planner
            </Link>
          }
        >
          {sessions.length ? (
            <ul className="-my-1">
              {sessions.map((s) => {
                const c = s.course_id ? byId.get(s.course_id) : undefined
                return (
                  <li
                    key={s.id}
                    className="flex items-center gap-3 border-b border-rule py-2.5 last:border-0"
                  >
                    <Dot colour={c?.colour ?? 'var(--rule-2)'} />
                    <span className="min-w-0 flex-1 truncate text-[13.5px]">
                      {c?.code ?? 'General'}{' '}
                      <span className="text-ink-3">· {s.kind}</span>
                    </span>
                    <span className="font-mono text-[12px] text-ink-3 tabnum">
                      {humanMinutes(s.planned_min)}
                    </span>
                    {s.status === 'done' ? (
                      <Badge tone="ok">done</Badge>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() =>
                          void patch('sessions', s.id, { status: 'done', actual_min: s.planned_min })
                        }
                      >
                        Done
                      </Button>
                    )}
                  </li>
                )
              })}
            </ul>
          ) : (
            <Empty
              title="No blocks planned"
              action={
                <Link to="/planner">
                  <Button variant="primary" size="sm">
                    Build a plan
                  </Button>
                </Link>
              }
            >
              The planner writes your week around the timetable and a capacity you set.
            </Empty>
          )}
        </Panel>

        <Panel
          title="Course load"
          sub="mark · attendance"
          action={
            <Link to="/grades" className="tap-link text-[12.5px]">
              Grades
            </Link>
          }
        >
          {courses.length ? (
            <ul className="space-y-3">
              {courses.map((c) => {
                const g = gradeCourse(
                  assessments.filter((a) => a.course_id === c.id),
                  profile.grade_bands,
                )
                const att = attendanceStats(
                  attendance.filter((a) => a.course_id === c.id),
                  c.attendance_threshold || profile.attendance_threshold,
                )
                return (
                  <li key={c.id}>
                    <Link to={`/courses/${c.id}`} className="group block py-1.5 sm:py-0">
                      <div className="mb-1 flex items-baseline gap-2">
                        <Dot colour={c.colour} />
                        <b className="font-mono text-[13px] font-medium group-hover:text-accent">
                          {c.code}
                        </b>
                        <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-3">{c.name}</span>
                        <span className="font-mono text-[12.5px] tabnum" title="Current mark">
                          {g.currentPct === null ? '—' : `${g.currentPct.toFixed(1)}%`}
                        </span>
                        <span
                          title="Attendance"
                          className={
                            att.meets
                              ? 'font-mono text-[12.5px] text-ink-3 tabnum'
                              : 'font-mono text-[12.5px] text-crit tabnum'
                          }
                        >
                          {att.pct === null ? '—' : `${Math.round(att.pct * 100)}%`}
                        </span>
                      </div>
                      <Bar
                        value={(g.currentPct ?? 0) / 100}
                        tone={
                          g.currentPct === null
                            ? 'accent'
                            : g.currentPct >= c.target_grade
                              ? 'ok'
                              : g.currentPct >= c.target_grade - 10
                                ? 'warn'
                                : 'crit'
                        }
                      />
                    </Link>
                  </li>
                )
              })}
            </ul>
          ) : (
            <Empty
              title="No courses yet"
              action={
                <Link to="/courses">
                  <Button variant="primary" size="sm">
                    Add your courses
                  </Button>
                </Link>
              }
            >
              Everything else in the app hangs off a course.
            </Empty>
          )}
        </Panel>
        <Panel
          title="Beyond the semester"
          sub="career · money · habits"
          className="lg:col-span-2"
          action={
            <Link to="/applications" className="tap-link text-[12.5px]">
              Applications
            </Link>
          }
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <div className="eyebrow mb-1.5">Applications</div>
              {openApplications.length ? (
                <ul className="space-y-1 text-[13px]">
                  {openApplications.slice(0, 3).map((a) => (
                    <li key={a.id} className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate">{a.org}</span>
                      {a.deadline ? (
                        <Badge tone={dueTone(relativeDue(a.deadline).days)}>
                          {relativeDue(a.deadline).label}
                        </Badge>
                      ) : (
                        <Badge>{a.stage}</Badge>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[12.5px] text-ink-3">Nothing in the pipeline.</p>
              )}
              {followUps.length ? (
                <p className="mt-2 text-[12.5px] text-warn">
                  {followUps.length} follow-up{followUps.length === 1 ? '' : 's'} overdue.
                </p>
              ) : null}
            </div>

            <div>
              <div className="eyebrow mb-1.5">Money</div>
              {recurringSoon.length ? (
                <ul className="space-y-1 text-[13px]">
                  {recurringSoon.slice(0, 3).map((r) => (
                    <li key={r.id} className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate">{r.name}</span>
                      <span className="font-mono text-[12px] tabnum">{rupees(r.amount)}</span>
                      <Badge tone={relativeDue(r.next_at).days <= 2 ? 'warn' : 'neutral'}>
                        {relativeDue(r.next_at).label}
                      </Badge>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[12.5px] text-ink-3">Nothing due this week.</p>
              )}
              <Link to="/money" className="tap-link mt-2 text-[12.5px]">
                Log an expense
              </Link>
            </div>

            <div>
              <div className="eyebrow mb-1.5">Habits</div>
              {habits.length ? (
                <ul className="space-y-1 text-[13px]">
                  {habits.slice(0, 4).map((h) => {
                    const s = habitStreak(h, habitLogs)
                    return (
                      <li key={h.id} className="flex items-center gap-2">
                        <span
                          aria-hidden
                          className={
                            s.doneToday
                              ? 'inline-block h-2.5 w-2.5 rounded-full bg-ok'
                              : 'inline-block h-2.5 w-2.5 rounded-full border border-rule-2'
                          }
                        />
                        <span className="min-w-0 flex-1 truncate">{h.name}</span>
                        <span className="font-mono text-[11.5px] text-ink-3">{s.streak}d</span>
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <p className="text-[12.5px] text-ink-3">No habits tracked yet.</p>
              )}
            </div>
          </div>
        </Panel>
      </div>

      <Card className="mt-6 p-4">
        <div className="flex items-start gap-3">
          <TimerIcon size={16} className="mt-0.5 shrink-0 text-accent" />
          <span className="text-[13.5px] text-ink-2">
            {dueCards.length
              ? `${dueCards.length} cards are waiting. Ten minutes now is worth an hour the night before.`
              : 'Decks are clear for today.'}
          </span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link to="/review" className="flex-1 sm:flex-none">
            <Button variant={dueCards.length ? 'primary' : 'ghost'} className="w-full sm:w-auto">
              {dueCards.length ? 'Start review' : 'Open decks'}
            </Button>
          </Link>
          <Link to="/focus" className="flex-1 sm:flex-none">
            <Button className="w-full sm:w-auto">Focus timer</Button>
          </Link>
        </div>
      </Card>
    </>
  )
}
