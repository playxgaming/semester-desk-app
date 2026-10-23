import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import {
  Badge,
  Bar,
  Button,
  Card,
  Dot,
  Empty,
  Field,
  Modal,
  PageHeader,
  Row,
  Select,
} from '@/components/ui'
import { useAssessments, useAttendance, useCourses, useProfile, useTopics } from '@/hooks/data'
import type { Course } from '@/db/db'
import { put, remove } from '@/db/mutate'
import { uid } from '@/lib/id'
import { gradeCourse } from '@/lib/grades'
import { attendanceStats } from '@/lib/attendance'
import { useUi } from '@/store/ui'

import { SERIES_LIGHT } from '@/lib/palette'

const PALETTE = [...SERIES_LIGHT]

export function CourseForm({
  course,
  onDone,
}: {
  course?: Course
  onDone: () => void
}) {
  const profile = useProfile()
  const [form, setForm] = useState<Course>(
    course ?? {
      id: uid(),
      user_id: null,
      updated_at: '',
      deleted_at: null,
      code: '',
      name: '',
      credits: 3,
      colour: PALETTE[0],
      instructor: '',
      target_grade: 80,
      attendance_threshold: profile.attendance_threshold,
      archived: false,
      semester: profile.current_semester,
    },
  )
  const notify = useUi((s) => s.notify)

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault()
        if (!form.code.trim()) return
        await put('courses', form)
        notify(`${form.code} saved`)
        onDone()
      }}
    >
      <Row>
        <Field
          label="Course code"
          value={form.code}
          required
          placeholder="CS301"
          onChange={(e) => setForm({ ...form, code: e.target.value })}
        />
        <Field
          label="Credits"
          type="number"
          min={0}
          max={20}
          step={0.5}
          value={form.credits}
          onChange={(e) => setForm({ ...form, credits: Number(e.target.value) })}
        />
      </Row>
      <Field
        className="mt-3"
        label="Title"
        value={form.name}
        placeholder="Data Structures & Algorithms"
        onChange={(e) => setForm({ ...form, name: e.target.value })}
      />
      <Row className="mt-3">
        <Field
          label="Instructor"
          value={form.instructor}
          onChange={(e) => setForm({ ...form, instructor: e.target.value })}
        />
        <Field
          label="Target mark (%)"
          type="number"
          min={0}
          max={100}
          value={form.target_grade}
          hint="What the “what do I need” calculator aims at."
          onChange={(e) => setForm({ ...form, target_grade: Number(e.target.value) })}
        />
      </Row>
      <Row className="mt-3">
        <Field
          label="Semester"
          value={form.semester}
          placeholder="Semester 5"
          hint="Courses are grouped by this. CGPA spans every semester."
          onChange={(e) => setForm({ ...form, semester: e.target.value })}
        />
        <label className="flex items-end pb-2">
          <span className="flex items-center gap-2.5">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[color:var(--accent)]"
              checked={form.archived}
              onChange={(e) => setForm({ ...form, archived: e.target.checked })}
            />
            <span className="text-[13.5px] text-ink-2">Finished — keep for CGPA, hide elsewhere</span>
          </span>
        </label>
      </Row>
      <Row className="mt-3">
        <Select
          label="Attendance threshold"
          value={String(form.attendance_threshold)}
          onChange={(e) => setForm({ ...form, attendance_threshold: Number(e.target.value) })}
        >
          <option value="0.75">75% — standard</option>
          <option value="0.8">80%</option>
          <option value="0.85">85%</option>
          <option value="0.6">60%</option>
          <option value="0">No requirement</option>
        </Select>
        <div>
          <span className="mb-1 block text-[12.5px] font-medium text-ink-2">Colour</span>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Colour ${c}`}
                onClick={() => setForm({ ...form, colour: c })}
                className={
                  form.colour === c
                    ? 'h-7 w-7 rounded border-2 border-ink'
                    : 'h-7 w-7 rounded border border-rule'
                }
                style={{ background: c }}
              />
            ))}
          </div>
        </div>
      </Row>
      <div className="mt-5 flex gap-2">
        <Button type="submit" variant="primary">
          Save course
        </Button>
        <Button onClick={onDone}>Cancel</Button>
        {course ? (
          <Button
            variant="danger"
            className="ml-auto"
            onClick={async () => {
              await remove('courses', course.id)
              notify(`${course.code} removed`, 'warn')
              onDone()
            }}
          >
            Delete
          </Button>
        ) : null}
      </div>
    </form>
  )
}

export default function Courses() {
  const courses = useCourses(true)
  const profile = useProfile()
  const assessments = useAssessments()
  const attendance = useAttendance()
  const topics = useTopics()
  const [adding, setAdding] = useState(false)

  return (
    <>
      <PageHeader
        eyebrow="Academic core"
        title="Courses"
        lede="Everything else in the app hangs off these — timetable, attendance, deadlines, grades, topics and cards all point at a course."
        action={
          <Button variant="primary" onClick={() => setAdding(true)}>
            <Plus size={15} /> Add course
          </Button>
        }
      />

      {courses.length ? (
        <div className="grid gap-3 md:grid-cols-2">
          {courses.map((c) => {
            const g = gradeCourse(
              assessments.filter((a) => a.course_id === c.id),
              profile.grade_bands,
            )
            const att = attendanceStats(
              attendance.filter((a) => a.course_id === c.id),
              c.attendance_threshold || profile.attendance_threshold,
            )
            const ts = topics.filter((t) => t.course_id === c.id)
            const coverage = ts.length
              ? ts.reduce((s, t) => s + t.confidence, 0) / (ts.length * 3)
              : 0
            return (
              <Card key={c.id} className="p-4">
                <Link to={`/courses/${c.id}`} className="group block">
                  <div className="mb-1 flex items-center gap-2">
                    <Dot colour={c.colour} />
                    <b className="font-mono text-[14px] font-medium group-hover:text-accent">{c.code}</b>
                    <Badge>{c.credits} cr</Badge>
                    {c.archived ? <Badge tone="warn">archived</Badge> : null}
                  </div>
                  <p className="mb-3 text-[14px] text-ink-2">{c.name || 'Untitled course'}</p>
                </Link>
                <dl className="grid grid-cols-3 gap-3 text-[12px]">
                  <div>
                    <dt className="text-ink-3">Mark</dt>
                    <dd className="font-mono text-[14px] tabnum">
                      {g.currentPct === null ? '—' : `${g.currentPct.toFixed(1)}%`}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-ink-3">Attendance</dt>
                    <dd
                      className={`font-mono text-[14px] tabnum ${att.meets ? '' : 'text-crit'}`}
                    >
                      {att.pct === null ? '—' : `${Math.round(att.pct * 100)}%`}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-ink-3">Syllabus</dt>
                    <dd className="font-mono text-[14px] tabnum">{Math.round(coverage * 100)}%</dd>
                  </div>
                </dl>
                <Bar className="mt-3" value={coverage} tone={coverage > 0.66 ? 'ok' : 'accent'} />
              </Card>
            )
          })}
        </div>
      ) : (
        <Empty
          title="No courses yet"
          action={
            <Button variant="primary" onClick={() => setAdding(true)}>
              Add your first course
            </Button>
          }
        >
          Add the courses you are taking this semester — code, credits and the mark you are aiming at.
        </Empty>
      )}

      <Modal open={adding} onClose={() => setAdding(false)} title="Add course">
        <CourseForm onDone={() => setAdding(false)} />
      </Modal>
    </>
  )
}
