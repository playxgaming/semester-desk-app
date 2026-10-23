import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ChevronLeft, GripVertical, Plus, Trash2 } from 'lucide-react'
import {
  Badge,
  Bar,
  Button,
  Card,
  Empty,
  Field,
  Modal,
  Note,
  PageHeader,
  Panel,
  Stat,
} from '@/components/ui'
import {
  useAssessments,
  useAttendance,
  useCards,
  useCourse,
  useNotes,
  useProfile,
  useTasks,
  useTopics,
} from '@/hooks/data'
import { gradeCourse, whatDoINeed } from '@/lib/grades'
import { attendanceStats } from '@/lib/attendance'
import { humanMinutes } from '@/lib/date'
import { patch, put} from '@/db/mutate'
import { removeWithUndo } from '@/lib/undoable'
import { uid } from '@/lib/id'
import type { Topic } from '@/db/db'
import { CourseForm } from './Courses'
import { tap } from '@/lib/haptics'
import { Attachments } from '@/components/Attachments'

const CONFIDENCE = ['Untouched', 'Seen it', 'Can do it', 'Could teach it']

function TopicRow({ topic }: { topic: Topic }) {
  return (
    <li className="flex flex-wrap items-center gap-3 border-b border-rule py-2.5 last:border-0">
      <GripVertical size={14} className="hidden shrink-0 text-ink-3 sm:block" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px]">{topic.name}</span>
        <span className="text-[11.5px] text-ink-3">
          {humanMinutes(topic.est_minutes)}
          {topic.exam_critical ? ' · exam critical' : ''}
        </span>
      </span>
      <div className="flex gap-1" role="group" aria-label={`Confidence for ${topic.name}`}>
        {[0, 1, 2, 3].map((n) => (
          <button
            key={n}
            type="button"
            title={CONFIDENCE[n]}
            onClick={() => {
          void patch('topics', topic.id, { confidence: n as 0 | 1 | 2 | 3 })
          void tap()
        }}
            className={
              topic.confidence === n
                ? 'h-10 w-10 rounded border border-accent bg-accent font-mono text-[13px] text-[color:var(--accent-ink)] sm:h-7 sm:w-7 sm:text-[11px]'
                : 'h-10 w-10 rounded border border-rule font-mono text-[13px] text-ink-3 hover:border-rule-2 hover:text-ink sm:h-7 sm:w-7 sm:text-[11px]'
            }
          >
            {n}
          </button>
        ))}
      </div>
      <button
        type="button"
        aria-label={`Delete ${topic.name}`}
        className="icon-btn icon-btn-danger"
        onClick={() => void removeWithUndo('topics', topic.id, topic.name)}
      >
        <Trash2 size={14} />
      </button>
    </li>
  )
}

export default function CourseDetail() {
  const { id } = useParams()
  const course = useCourse(id)
  const profile = useProfile()
  const assessments = useAssessments(id)
  const attendance = useAttendance(id)
  const topics = useTopics(id)
  const tasks = useTasks(id)
  const cards = useCards(id)
  const notes = useNotes(id)
  const [editing, setEditing] = useState(false)
  const [newTopic, setNewTopic] = useState('')
  const [newEst, setNewEst] = useState(90)

  if (!course) {
    return (
      <Empty title="Course not found">
        It may have been deleted. <Link to="/courses" className="text-accent">Back to courses</Link>.
      </Empty>
    )
  }

  const grade = gradeCourse(assessments, profile.grade_bands)
  const need = whatDoINeed(grade, course.target_grade)
  const att = attendanceStats(attendance, course.attendance_threshold || profile.attendance_threshold)
  const coverage = topics.length
    ? topics.reduce((s, t) => s + t.confidence, 0) / (topics.length * 3)
    : 0
  const remainingStudy = topics.reduce(
    (s, t) => s + Math.round((t.est_minutes * (3 - t.confidence)) / 3),
    0,
  )

  return (
    <>
      <Link to="/courses" className="mb-3 inline-flex items-center gap-1 text-[13px] text-ink-3 hover:text-ink">
        <ChevronLeft size={14} /> Courses
      </Link>
      <PageHeader
        eyebrow={`${course.credits} credits · ${course.instructor || 'no instructor set'}`}
        title={`${course.code} — ${course.name}`}
        action={<Button onClick={() => setEditing(true)}>Edit course</Button>}
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          value={grade.currentPct === null ? '—' : `${grade.currentPct.toFixed(1)}%`}
          label="Current mark"
          hint={grade.band ? `${grade.band.letter} · ${grade.band.points} points` : 'nothing graded'}
        />
        <Stat
          value={att.pct === null ? '—' : `${(att.pct * 100).toFixed(1)}%`}
          label="Attendance"
          hint={`${att.present}/${att.held} held`}
          tone={att.meets ? undefined : 'crit'}
        />
        <Stat
          value={`${Math.round(coverage * 100)}%`}
          label="Syllabus confidence"
          hint={`${topics.length} topics`}
        />
        <Stat
          value={humanMinutes(remainingStudy)}
          label="Study left"
          hint="on your own estimates"
        />
      </div>

      <Note
        tone={
          need.status === 'impossible' ? 'crit' : need.status === 'locked-in' ? 'ok' : 'accent'
        }
        title={`Target ${course.target_grade}%`}
      >
        {need.message}
      </Note>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title="Syllabus tracker"
          sub={`${topics.filter((t) => t.confidence >= 2).length}/${topics.length} solid`}
        >
          <Bar className="mb-4" value={coverage} tone={coverage > 0.66 ? 'ok' : 'accent'} />
          {topics.length ? (
            <ul className="-my-1 mb-4">
              {topics.map((t) => (
                <TopicRow key={t.id} topic={t} />
              ))}
            </ul>
          ) : (
            <p className="mb-4 text-[13.5px] text-ink-3">
              Add the topics from the syllabus. The planner uses these estimates and your confidence
              rating to decide what to schedule.
            </p>
          )}
          <form
            className="flex flex-wrap gap-2"
            onSubmit={async (e) => {
              e.preventDefault()
              if (!newTopic.trim()) return
              await put('topics', {
                id: uid(),
                user_id: null,
                updated_at: '',
                deleted_at: null,
                course_id: course.id,
                name: newTopic.trim(),
                order_index: topics.length,
                confidence: 0,
                est_minutes: newEst,
                exam_critical: false,
              })
              setNewTopic('')
            }}
          >
            <Field
              className="min-w-[180px] flex-1"
              placeholder="Add a topic…"
              value={newTopic}
              onChange={(e) => setNewTopic(e.target.value)}
            />
            <Field
              className="w-[92px]"
              type="number"
              min={15}
              step={15}
              value={newEst}
              aria-label="Estimated minutes"
              onChange={(e) => setNewEst(Number(e.target.value))}
            />
            <Button type="submit" variant="primary">
              <Plus size={14} />
            </Button>
          </form>
        </Panel>

        <div className="space-y-4">
          <Panel title="Assessments" sub={`${grade.gradedWeight}% graded`}>
            {assessments.length ? (
              <table className="w-full text-[13.5px]">
                <tbody>
                  {assessments.map((a) => (
                    <tr key={a.id} className="border-b border-rule last:border-0">
                      <td className="py-2 pr-2">{a.title}</td>
                      <td className="py-2 pr-2 text-right font-mono text-[12.5px] text-ink-3 tabnum">
                        {a.weight_pct}%
                      </td>
                      <td className="py-2 text-right font-mono text-[13px] tabnum">
                        {a.score === null ? (
                          <span className="text-ink-3">pending</span>
                        ) : (
                          `${a.score}/${a.max}`
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-[13.5px] text-ink-3">
                No assessments yet — add them on the <Link className="text-accent" to="/grades">Grades</Link>{' '}
                page.
              </p>
            )}
          </Panel>

          <Panel title="Everything else">
            <ul className="space-y-2 text-[13.5px]">
              <li className="flex items-center gap-2">
                <Badge>{tasks.filter((t) => t.status !== 'done').length}</Badge> open deadlines
                <Link to="/tasks" className="tap-link ml-auto text-[12.5px]">open</Link>
              </li>
              <li className="flex items-center gap-2">
                <Badge>{cards.length}</Badge> flashcards
                <Link to="/review" className="tap-link ml-auto text-[12.5px]">review</Link>
              </li>
              <li className="flex items-center gap-2">
                <Badge>{notes.length}</Badge> notes
                <Link to="/notes" className="tap-link ml-auto text-[12.5px]">write</Link>
              </li>
              <li className="flex items-center gap-2">
                <Badge tone={att.meets ? 'ok' : 'crit'}>{att.canSkip}</Badge> classes you can still miss
                <Link to="/attendance" className="tap-link ml-auto text-[12.5px]">log</Link>
              </li>
            </ul>
          </Panel>

          <Panel title="Resource bank" sub="on this device">
            <Attachments parentType="course" parentId={course.id} label="Course files" />
          </Panel>

          <Card className="p-4 text-[13px] text-ink-2">
            <b className="mb-1 block font-display text-[14px] text-ink">How coverage is computed</b>
            Each topic contributes its confidence out of 3. Reading a chapter is a 1; working past-paper
            questions on it unaided is a 3. The bar is deliberately honest rather than flattering — it is
            the number the planner trusts.
          </Card>
        </div>
      </div>

      <Modal open={editing} onClose={() => setEditing(false)} title={`Edit ${course.code}`}>
        <CourseForm course={course} onDone={() => setEditing(false)} />
      </Modal>
    </>
  )
}
