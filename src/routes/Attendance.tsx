import { useState } from 'react'
import { Badge, Bar, Card, Dot, Empty, Note, PageHeader, Panel, Stat } from '@/components/ui'
import { useAttendance, useCourses, useExceptions, useProfile, useSlots } from '@/hooks/data'
import { attendanceStats, projectAttendance } from '@/lib/attendance'
import { addDays, dayKey, prettyDay } from '@/lib/date'
import {
  cellStatus,
  nextStatus,
  rowsFor,
  setAttendance,
  slotsFor,
} from '@/db/attendance'
import { tap } from '@/lib/haptics'
import type { AttendanceStatus } from '@/db/db'

const STATUS_LABEL: Record<AttendanceStatus | 'mixed', string> = {
  present: 'P',
  absent: 'A',
  cancelled: 'C',
  excused: 'E',
  mixed: '~',
}

const STATUS_CLASS: Record<AttendanceStatus | 'mixed', string> = {
  present: 'bg-[color:var(--ok-soft)] text-ok border-transparent',
  absent: 'bg-[color:var(--crit-soft)] text-crit border-transparent',
  excused: 'bg-[color:var(--warn-soft)] text-warn border-transparent',
  cancelled: 'bg-surface-2 text-ink-3 border-transparent',
  mixed: 'bg-accent-soft text-accent border-transparent',
}

export default function Attendance() {
  const courses = useCourses()
  const profile = useProfile()
  const rows = useAttendance()
  const slots = useSlots()
  const exceptions = useExceptions()
  const [days, setDays] = useState(14)

  const recent = Array.from({ length: days }, (_, i) => dayKey(addDays(new Date(), -i)))

  async function cycleCell(courseId: string, date: string) {
    const current = cellStatus(rowsFor(rows, courseId, date))
    await setAttendance(courseId, date, nextStatus(current), slots, rows, exceptions)
    void tap()
  }

  if (!courses.length) {
    return (
      <>
        <PageHeader eyebrow="Academic core" title="Attendance" />
        <Empty title="Add a course first">
          Attendance is tracked per course against a threshold you set on each one.
        </Empty>
      </>
    )
  }

  return (
    <>
      <PageHeader
        eyebrow="Academic core"
        title="Attendance"
        lede="Percentages, and the only two numbers that actually matter: how many more you can miss, and how many in a row you must now attend."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {courses.map((c) => {
          const s = attendanceStats(
            rows.filter((r) => r.course_id === c.id),
            c.attendance_threshold ?? profile.attendance_threshold,
          )
          const projected = projectAttendance(s, 0, 3)
          return (
            <Panel
              key={c.id}
              title={
                <span className="flex items-center gap-2">
                  <Dot colour={c.colour} />
                  <span className="font-mono text-[14px]">{c.code}</span>
                </span>
              }
              sub={`${Math.round((c.attendance_threshold ?? profile.attendance_threshold) * 100)}% required`}
              action={
                <Badge tone={s.meets ? 'ok' : 'crit'}>
                  {s.pct === null ? 'no data' : `${(s.pct * 100).toFixed(1)}%`}
                </Badge>
              }
            >
              <Bar value={s.pct ?? 0} tone={s.meets ? (s.canSkip > 1 ? 'ok' : 'warn') : 'crit'} />
              <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
                <Stat value={s.present} label="Attended" hint={`of ${s.held} held`} />
                <Stat value={Number.isFinite(s.canSkip) ? s.canSkip : '∞'} label="Can miss" tone={s.canSkip === 0 ? 'warn' : 'ok'} />
                <Stat
                  value={s.meets ? '—' : Number.isFinite(s.mustAttend) ? s.mustAttend : '∞'}
                  label="Must attend"
                  tone={s.meets ? undefined : 'crit'}
                />
              </div>
              <p className="mt-3 text-[13px] text-ink-2">{s.message}</p>
              {s.held > 0 && (
                <p className="mt-1 text-[12.5px] text-ink-3">
                  Miss the next three and you land at {(projected * 100).toFixed(1)}%.
                </p>
              )}
            </Panel>
          )
        })}
      </div>

      <Note title="How the maths works" tone="accent">
        <p className="mb-1">
          Can miss: the largest <em>k</em> where attended ÷ (held + k) is still at or above the
          threshold.
        </p>
        <p className="mb-0">
          Must attend: the smallest <em>m</em> where (attended + m) ÷ (held + m) reaches it again.
          Cancelled classes are not held, so they change neither.
        </p>
      </Note>

      <Card className="mt-2 p-4">
        <div className="mb-3 flex flex-wrap items-baseline gap-3">
          <h3 className="text-[15px]">Log</h3>
          <span className="text-[12.5px] text-ink-3">Tap to cycle P → A → C → E</span>
          <select
            className="ml-auto min-h-[38px] rounded border border-rule bg-surface px-2 py-1 text-[13px]"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            aria-label="Days shown"
          >
            <option value={7}>7 days</option>
            <option value={14}>14 days</option>
            <option value={28}>28 days</option>
          </select>
        </div>

        {/* Phones get a day-by-day list; a 6-column matrix on a 360px screen is
            a horizontal-scrolling puzzle, not a control. */}
        <ul className="space-y-2 md:hidden">
          {recent.map((d) => {
            const scheduled = courses.filter((c) => slotsFor(slots, c.id, d, exceptions).length > 0)
            const logged = courses.filter((c) => rowsFor(rows, c.id, d).length > 0)
            const shown = courses.filter((c) => scheduled.some((x) => x.id === c.id) || logged.some((x) => x.id === c.id))
            if (!shown.length) return null
            return (
              <li key={d} className="rounded border border-rule p-3">
                <div className="mb-2 text-[12.5px] font-medium text-ink-2">{prettyDay(d)}</div>
                <div className="flex flex-wrap gap-2">
                  {shown.map((c) => {
                    const status = cellStatus(rowsFor(rows, c.id, d))
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => void cycleCell(c.id, d)}
                        className={`flex min-h-[44px] items-center gap-2 rounded border px-3 text-[13px] ${
                          status ? STATUS_CLASS[status] : 'border-dashed border-rule-2 text-ink-3'
                        }`}
                      >
                        <Dot colour={c.colour} />
                        <span className="font-mono">{c.code}</span>
                        <span className="font-mono text-[15px] font-medium">
                          {status ? STATUS_LABEL[status] : '·'}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </li>
            )
          })}
        </ul>

        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[560px] border-collapse text-[13px]">
            <thead>
              <tr>
                <th className="pb-2 pr-3 text-left text-[10.5px] uppercase tracking-[0.09em] text-ink-3">
                  Date
                </th>
                {courses.map((c) => (
                  <th
                    key={c.id}
                    className="pb-2 text-center font-mono text-[11px] font-medium text-ink-3"
                  >
                    {c.code}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recent.map((d) => (
                <tr key={d} className="border-b border-rule last:border-0">
                  <td className="py-1.5 pr-3 text-[12.5px] text-ink-2">{prettyDay(d)}</td>
                  {courses.map((c) => {
                    const status = cellStatus(rowsFor(rows, c.id, d))
                    const scheduled = slotsFor(slots, c.id, d, exceptions).length > 0
                    return (
                      <td key={c.id} className="py-1.5 text-center">
                        <button
                          type="button"
                          disabled={!scheduled && !status}
                          onClick={() => void cycleCell(c.id, d)}
                          aria-label={`${c.code} on ${d}: ${status ?? 'not logged'}`}
                          className={`mx-auto flex h-8 w-8 items-center justify-center rounded border font-mono text-[12px] ${
                            status
                              ? STATUS_CLASS[status]
                              : 'border-dashed border-rule text-ink-3 disabled:border-transparent'
                          }`}
                        >
                          {status ? STATUS_LABEL[status] : scheduled ? '·' : ''}
                        </button>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  )
}
