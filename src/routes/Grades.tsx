import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import {
  Bar as BarChartBar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  Badge,
  Button,
  Card,
  Dot,
  Empty,
  Field,
  Modal,
  Note,
  PageHeader,
  Panel,
  Row,
  Stat,
} from '@/components/ui'
import { AXIS, ChartTooltip } from '@/components/charts'
import { useAssessments, useCourses, useProfile } from '@/hooks/data'
import { bySemester, computeGpa, cumulative, formatGpa, gradeCourse, GPA_MAX, whatDoINeed } from '@/lib/grades'
import type { Assessment } from '@/db/db'
import { put, remove } from '@/db/mutate'
import { uid } from '@/lib/id'
import { useUi } from '@/store/ui'

function AssessmentForm({
  courseId,
  assessment,
  onDone,
}: {
  courseId: string
  assessment?: Assessment
  onDone: () => void
}) {
  const notify = useUi((s) => s.notify)
  const [form, setForm] = useState<Assessment>(
    assessment ?? {
      id: uid(),
      user_id: null,
      updated_at: '',
      deleted_at: null,
      course_id: courseId,
      title: '',
      weight_pct: 20,
      score: null,
      max: 100,
      date: null,
    },
  )
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault()
        if (!form.title.trim()) return
        await put('assessments', form)
        notify('Assessment saved')
        onDone()
      }}
    >
      <Field
        label="Title"
        required
        placeholder="Mid-semester exam"
        value={form.title}
        onChange={(e) => setForm({ ...form, title: e.target.value })}
      />
      <Row className="mt-3">
        <Field
          label="Weight (% of final grade)"
          type="number"
          min={0}
          max={100}
          value={form.weight_pct}
          onChange={(e) => setForm({ ...form, weight_pct: Number(e.target.value) })}
        />
        <Field
          label="Date"
          type="date"
          value={form.date ?? ''}
          onChange={(e) => setForm({ ...form, date: e.target.value || null })}
        />
      </Row>
      <Row className="mt-3">
        <Field
          label="Score"
          type="number"
          step="0.5"
          placeholder="leave empty until graded"
          value={form.score ?? ''}
          onChange={(e) => setForm({ ...form, score: e.target.value === '' ? null : Number(e.target.value) })}
        />
        <Field
          label="Out of"
          type="number"
          min={1}
          value={form.max}
          onChange={(e) => setForm({ ...form, max: Number(e.target.value) })}
        />
      </Row>
      <div className="mt-5 flex gap-2">
        <Button type="submit" variant="primary">
          Save
        </Button>
        <Button onClick={onDone}>Cancel</Button>
        {assessment ? (
          <Button
            variant="danger"
            className="ml-auto"
            onClick={async () => {
              await remove('assessments', assessment.id)
              onDone()
            }}
          >
            <Trash2 size={14} /> Delete
          </Button>
        ) : null}
      </div>
    </form>
  )
}

export default function Grades() {
  const allCourses = useCourses(true)
  const profile = useProfile()
  const assessments = useAssessments()
  const [adding, setAdding] = useState<string | null>(null)
  const [editing, setEditing] = useState<Assessment | undefined>()

  const grade = (c: (typeof allCourses)[number]) => ({
    course: c,
    grade: gradeCourse(
      assessments.filter((a) => a.course_id === c.id),
      profile.grade_bands,
    ),
  })

  const courses = allCourses.filter((c) => !c.archived)
  const entries = courses.map(grade)
  const everyEntry = allCourses.map(grade)

  // SGPA is this term; CGPA is every term, which is the same calculation run
  // across all of them at once
  const gpa = computeGpa(entries, profile)
  const cgpa = cumulative(everyEntry, profile)
  const terms = bySemester(everyEntry, profile)
  const past = terms.filter((t) => t.semester !== profile.current_semester)
  const trend = terms.map((t) => ({ semester: t.semester, gpa: Number((t.gpa ?? 0).toFixed(2)) }))

  const chartData = entries
    .filter((e) => e.grade.currentPct !== null)
    .map((e) => ({
      code: e.course.code,
      mark: Number(e.grade.currentPct!.toFixed(1)),
      target: e.course.target_grade,
      ceiling: Number(e.grade.ceilingPct.toFixed(1)),
      status:
        e.grade.currentPct! >= e.course.target_grade
          ? 'on target'
          : e.grade.currentPct! >= e.course.target_grade - 10
            ? 'behind'
            : 'at risk',
    }))

  const statusColour: Record<string, string> = {
    'on target': 'var(--ok)',
    behind: 'var(--warn)',
    'at risk': 'var(--crit)',
  }

  if (!courses.length) {
    return (
      <>
        <PageHeader eyebrow="Academic core" title="Grades" />
        <Empty title="Add a course first">Grades are computed per course from weighted assessments.</Empty>
      </>
    )
  }

  return (
    <>
      <PageHeader
        eyebrow="Academic core"
        title="Grades"
        lede={`Live weighted marks, ${profile.grading_scheme === 'cgpa10' ? 'a 10-point SGPA' : profile.grading_scheme === 'gpa4' ? 'a 4.0 GPA' : 'a weighted average'}, and the mark you need on what is left.`}
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          value={formatGpa(gpa)}
          label={profile.grading_scheme === 'percent' ? 'This term' : 'SGPA this term'}
          hint={`${profile.current_semester} · ${gpa.credits} of ${courses.reduce((s, c) => s + c.credits, 0)} credits graded`}
        />
        <Stat
          value={formatGpa(cgpa)}
          label={profile.grading_scheme === 'percent' ? 'Overall average' : 'CGPA'}
          hint={`${cgpa.credits} credits across ${terms.length} semester${terms.length === 1 ? '' : 's'}`}
        />
        <Stat
          value={entries.filter((e) => (e.grade.currentPct ?? 0) >= e.course.target_grade).length}
          label="Courses on target"
          hint={`of ${courses.length}`}
        />
        <Stat
          value={`${Math.round(
            entries.reduce((s, e) => s + e.grade.gradedWeight, 0) / Math.max(1, courses.length),
          )}%`}
          label="Semester graded"
          hint="average weight assessed"
        />
      </div>

      {trend.length > 1 && (
        <Card className="mb-6 p-4">
          <div className="mb-1 flex flex-wrap items-baseline gap-3">
            <h3 className="text-[15px]">SGPA by semester</h3>
            <span className="text-[12.5px] text-ink-3">
              CGPA {formatGpa(cgpa)} is the credit-weighted mean of these
            </span>
          </div>
          <div className="h-[190px] min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend} margin={{ top: 16, right: 26, bottom: 4, left: -18 }}>
                <CartesianGrid vertical={false} stroke="var(--rule)" />
                <XAxis dataKey="semester" {...AXIS} />
                <YAxis domain={[0, GPA_MAX[profile.grading_scheme]]} {...AXIS} />
                <Tooltip
                  cursor={{ stroke: 'var(--rule-2)' }}
                  content={<ChartTooltip format={(v) => `SGPA ${v}`} />}
                />
                <ReferenceLine
                  y={cgpa.value ?? 0}
                  stroke="var(--ink-3)"
                  strokeDasharray="4 3"
                  label={{
                    value: `CGPA ${formatGpa(cgpa)}`,
                    position: 'insideTopRight',
                    style: { fill: 'var(--ink-3)', fontSize: 11, fontFamily: 'IBM Plex Mono' },
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="gpa"
                  stroke="var(--accent)"
                  strokeWidth={2}
                  dot={{ r: 4, fill: 'var(--accent)', stroke: 'var(--surface)', strokeWidth: 2 }}
                  isAnimationActive={false}
                >
                  <LabelList
                    dataKey="gpa"
                    position="top"
                    style={{ fill: 'var(--ink-2)', fontSize: 11, fontFamily: 'IBM Plex Mono' }}
                  />
                </Line>
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {chartData.length > 0 && (
        <Card className="mb-6 p-4">
          <div className="mb-1 flex items-baseline gap-3">
            <h3 className="text-[15px]">Where each course stands</h3>
            <span className="text-[12.5px] text-ink-3">bar = current mark, label = mark against your target</span>
          </div>
          <div className="h-[max(220px,var(--chart-h))]" style={{ ['--chart-h' as string]: `${chartData.length * 42 + 40}px` }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" margin={{ top: 8, right: 88, bottom: 4, left: 4 }}>
                <CartesianGrid horizontal={false} stroke="var(--rule)" />
                <XAxis type="number" domain={[0, 100]} {...AXIS} />
                <YAxis type="category" dataKey="code" width={62} {...AXIS} />
                <Tooltip
                  cursor={{ fill: 'var(--surface-2)' }}
                  content={
                    <ChartTooltip
                      format={(v, row) =>
                        `${v}% now · target ${row.target}% · ceiling ${row.ceiling}% (${row.status})`
                      }
                    />
                  }
                />
                <ReferenceLine x={0} stroke="var(--rule-2)" />
                <BarChartBar dataKey="mark" radius={[0, 4, 4, 0]} barSize={16} isAnimationActive={false}>
                  {chartData.map((d) => (
                    <Cell key={d.code} fill={statusColour[d.status]} />
                  ))}
                  <LabelList
                    dataKey="mark"
                    position="right"
                    content={(props: {
                      x?: number | string
                      y?: number | string
                      width?: number | string
                      height?: number | string
                      index?: number
                    }) => {
                      const row = chartData[props.index ?? 0]
                      if (!row) return null
                      return (
                        <text
                          x={Number(props.x ?? 0) + Number(props.width ?? 0) + 6}
                          y={Number(props.y ?? 0) + Number(props.height ?? 0) / 2 + 4}
                          fill="var(--ink-2)"
                          style={{ fontSize: 11, fontFamily: 'IBM Plex Mono' }}
                        >
                          {row.mark}% / {row.target}%
                        </text>
                      )
                    }}
                  />
                </BarChartBar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <ul className="mt-2 flex flex-wrap gap-3 text-[11.5px] text-ink-3">
            {Object.entries(statusColour).map(([k, v]) => (
              <li key={k} className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: v }} />
                {k}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="space-y-4">
        {entries.map(({ course, grade }) => {
          const need = whatDoINeed(grade, course.target_grade)
          const list = assessments
            .filter((a) => a.course_id === course.id)
            .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))
          return (
            <Panel
              key={course.id}
              title={
                <span className="flex items-center gap-2">
                  <Dot colour={course.colour} />
                  <span className="font-mono text-[14px]">{course.code}</span>
                  <span className="text-[13px] font-normal text-ink-3">{course.name}</span>
                </span>
              }
              action={
                <Button size="sm" onClick={() => setAdding(course.id)}>
                  <Plus size={13} /> Assessment
                </Button>
              }
            >
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Badge tone="accent">
                  {grade.currentPct === null ? 'ungraded' : `${grade.currentPct.toFixed(1)}% now`}
                </Badge>
                <Badge>{grade.gradedWeight}% assessed</Badge>
                <Badge>ceiling {grade.ceilingPct.toFixed(1)}%</Badge>
                {grade.band ? (
                  <Badge tone="ok">
                    {grade.band.letter} · {grade.band.points}
                  </Badge>
                ) : null}
              </div>

              {list.length ? (
                <>
                  {/* Phones get rows, not a four-column table squeezed into 360px */}
                  <ul className="-my-1 sm:hidden">
                    {list.map((a) => (
                      <li key={a.id} className="border-b border-rule py-2.5 last:border-0">
                        <button
                          type="button"
                          className="flex w-full items-start gap-3 text-left"
                          onClick={() => setEditing(a)}
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block text-[14px]">{a.title}</span>
                            <span className="text-[11.5px] text-ink-3">
                              {a.weight_pct}% of the grade
                              {a.score === null
                                ? ' · not marked yet'
                                : ` · contributes ${((a.score / a.max) * a.weight_pct).toFixed(1)}%`}
                            </span>
                          </span>
                          <span className="shrink-0 font-mono text-[14px] tabnum">
                            {a.score === null ? (
                              <span className="text-ink-3">—</span>
                            ) : (
                              `${a.score}/${a.max}`
                            )}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>

                  <div className="hidden overflow-x-auto sm:block">
                  <table className="w-full min-w-[420px] text-[13.5px]">
                    <thead>
                      <tr className="border-b border-rule">
                        <th className="pb-2 pr-2 text-left text-[10.5px] uppercase tracking-[0.09em] text-ink-3">
                          Assessment
                        </th>
                        <th className="pb-2 pr-2 text-right text-[10.5px] uppercase tracking-[0.09em] text-ink-3">
                          Weight
                        </th>
                        <th className="pb-2 pr-2 text-right text-[10.5px] uppercase tracking-[0.09em] text-ink-3">
                          Score
                        </th>
                        <th className="pb-2 text-right text-[10.5px] uppercase tracking-[0.09em] text-ink-3">
                          Contributes
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {list.map((a) => (
                        <tr key={a.id} className="border-b border-rule last:border-0">
                          <td className="py-2 pr-2">
                            <button
                              type="button"
                              className="text-left hover:text-accent"
                              onClick={() => setEditing(a)}
                            >
                              {a.title}
                            </button>
                          </td>
                          <td className="py-2 pr-2 text-right font-mono text-[12.5px] text-ink-3 tabnum">
                            {a.weight_pct}%
                          </td>
                          <td className="py-2 pr-2 text-right font-mono text-[13px] tabnum">
                            {a.score === null ? <span className="text-ink-3">—</span> : `${a.score}/${a.max}`}
                          </td>
                          <td className="py-2 text-right font-mono text-[13px] tabnum">
                            {a.score === null
                              ? '—'
                              : `${((a.score / a.max) * a.weight_pct).toFixed(1)}%`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                </>
              ) : (
                <p className="text-[13.5px] text-ink-3">
                  No assessments yet. Add them with their weights and the maths starts working.
                </p>
              )}

              <Note
                tone={need.status === 'impossible' ? 'crit' : need.status === 'locked-in' ? 'ok' : 'accent'}
                title={`To finish on ${course.target_grade}%`}
              >
                {need.message}
              </Note>
            </Panel>
          )
        })}
      </div>

      {past.length > 0 && (
        <Panel className="mt-4" title="Finished semesters" sub="kept for CGPA">
          <ul className="-my-1">
            {past.map((t) => (
              <li
                key={t.semester}
                className="flex items-center gap-3 border-b border-rule py-2.5 last:border-0"
              >
                <span className="min-w-0 flex-1 text-[13.5px]">{t.semester}</span>
                <span className="text-[12px] text-ink-3">
                  {t.courses} courses · {t.credits} credits
                </span>
                <Badge tone="accent">
                  {t.gpa === null ? '—' : profile.grading_scheme === 'percent' ? `${t.gpa.toFixed(1)}%` : t.gpa.toFixed(2)}
                </Badge>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[13px] text-ink-2">
            Archive a course when its term ends — it leaves the timetable, the planner and the
            deadline queue, but its credits keep counting toward CGPA.
          </p>
        </Panel>
      )}

      <Modal open={Boolean(adding)} onClose={() => setAdding(null)} title="Add assessment">
        {adding ? <AssessmentForm courseId={adding} onDone={() => setAdding(null)} /> : null}
      </Modal>
      <Modal open={Boolean(editing)} onClose={() => setEditing(undefined)} title="Edit assessment">
        {editing ? (
          <AssessmentForm
            courseId={editing.course_id}
            assessment={editing}
            onDone={() => setEditing(undefined)}
          />
        ) : null}
      </Modal>
    </>
  )
}
