import { useState } from 'react'
import { Briefcase, Plus, Trash2 } from 'lucide-react'
import { Badge, Button, Card, Check, Dot, Empty, Field, Modal, PageHeader, Row, Select, TextArea } from '@/components/ui'
import { Link } from 'react-router-dom'
import { useApplications, useCourseMap, useCourses, useSubtasks, useTasks } from '@/hooks/data'
import { humanMinutes, relativeDue } from '@/lib/date'
import { dueTone, taskScore } from '@/lib/priority'
import { queueItems } from '@/lib/pipeline'
import { Attachments } from '@/components/Attachments'
import { patch, put, remove } from '@/db/mutate'
import { patchWithUndo, removeWithUndo } from '@/lib/undoable'
import { uid } from '@/lib/id'
import type { Application, StudyTask } from '@/db/db'
import { useUi } from '@/store/ui'

const TYPES: StudyTask['type'][] = ['assignment', 'exam', 'quiz', 'project', 'reading', 'admin']

function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function TaskForm({ task, onDone }: { task?: StudyTask; onDone: () => void }) {
  const courses = useCourses()
  const notify = useUi((s) => s.notify)
  const [form, setForm] = useState<StudyTask>(
    task ?? {
      id: uid(),
      user_id: null,
      updated_at: '',
      deleted_at: null,
      course_id: courses[0]?.id ?? null,
      title: '',
      type: 'assignment',
      due_at: null,
      weight_pct: 10,
      est_minutes: 120,
      status: 'todo',
      notes: '',
    },
  )

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault()
        if (!form.title.trim()) return
        await put('tasks', form)
        notify('Deadline saved')
        onDone()
      }}
    >
      <Field
        label="What is due"
        required
        value={form.title}
        placeholder="DBMS mini project — schema + 8 queries"
        onChange={(e) => setForm({ ...form, title: e.target.value })}
      />
      <Row className="mt-3">
        <Select
          label="Course"
          value={form.course_id ?? ''}
          onChange={(e) => setForm({ ...form, course_id: e.target.value || null })}
        >
          <option value="">No course</option>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.code}
            </option>
          ))}
        </Select>
        <Select
          label="Type"
          value={form.type}
          onChange={(e) => setForm({ ...form, type: e.target.value as StudyTask['type'] })}
        >
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </Select>
      </Row>
      <Row className="mt-3">
        <Field
          label="Due"
          type="datetime-local"
          value={toLocalInput(form.due_at)}
          onChange={(e) =>
            setForm({ ...form, due_at: e.target.value ? new Date(e.target.value).toISOString() : null })
          }
        />
        <Field
          label="Weight toward the final grade (%)"
          type="number"
          min={0}
          max={100}
          value={form.weight_pct}
          onChange={(e) => setForm({ ...form, weight_pct: Number(e.target.value) })}
        />
      </Row>
      <Field
        className="mt-3"
        label="Estimated effort (minutes)"
        type="number"
        min={0}
        step={15}
        value={form.est_minutes}
        hint="The planner schedules exactly this much, split into blocks."
        onChange={(e) => setForm({ ...form, est_minutes: Number(e.target.value) })}
      />
      <TextArea
        className="mt-3"
        label="Notes"
        rows={3}
        value={form.notes}
        onChange={(e) => setForm({ ...form, notes: e.target.value })}
      />
      <div className="mt-5 flex gap-2">
        <Button type="submit" variant="primary">
          Save
        </Button>
        <Button onClick={onDone}>Cancel</Button>
        {task ? (
          <Button
            variant="danger"
            className="ml-auto"
            onClick={async () => {
              await remove('tasks', task.id)
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

function Subtasks({ taskId }: { taskId: string }) {
  const subs = useSubtasks(taskId)
  const [text, setText] = useState('')
  return (
    <div className="mt-2 border-t border-rule pt-2">
      <ul className="mb-2 space-y-1">
        {subs.map((s) => (
          <li key={s.id} className="flex items-center gap-2 text-[13px]">
            <Check
              checked={s.done}
              label={`Mark step done: ${s.title}`}
              onChange={() => void patch('subtasks', s.id, { done: !s.done })}
            />
            <span className={s.done ? 'text-ink-3 line-through' : ''}>{s.title}</span>
            <button
              type="button"
              className="icon-btn icon-btn-danger ml-auto"
              aria-label="Delete step"
              onClick={() => void removeWithUndo('subtasks', s.id, 'Step')}
            >
              <Trash2 size={12} />
            </button>
          </li>
        ))}
      </ul>
      <form
        className="flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault()
          if (!text.trim()) return
          await put('subtasks', {
            id: uid(),
            user_id: null,
            updated_at: '',
            deleted_at: null,
            task_id: taskId,
            title: text.trim(),
            done: false,
            order_index: subs.length,
          })
          setText('')
        }}
      >
        <input
          className="field py-1 text-[13px]"
          enterKeyHint="done"
          autoCapitalize="sentences"
          placeholder="Break it into a step…"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <Button type="submit" size="sm">
          <Plus size={13} />
        </Button>
      </form>
    </div>
  )
}

export default function Tasks() {
  const tasks = useTasks()
  const applications = useApplications()
  const byId = useCourseMap()
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<StudyTask | undefined>()
  const [expanded, setExpanded] = useState<string | null>(null)
  const [showDone, setShowDone] = useState(false)

  const queue = queueItems(
    tasks.filter((t) => t.status !== 'done'),
    applications,
  )
  const done = tasks
    .filter((t) => t.status === 'done')
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))

  const totalEffort = queue.reduce((s, q) => s + q.estMinutes, 0)
  const fromApplications = queue.filter((q) => q.kind === 'application').length

  function TaskCard({ t }: { t: StudyTask }) {
    const rel = relativeDue(t.due_at)
    const c = t.course_id ? byId.get(t.course_id) : undefined
    return (
      <Card as="li" className="p-3.5">
        <div className="flex items-start gap-3">
          <Check
            className="mt-3"
            checked={t.status === 'done'}
            label={`Mark ${t.title} done`}
            onChange={() =>
              void patchWithUndo(
                'tasks',
                t.id,
                { status: t.status === 'done' ? 'todo' : 'done' },
                t.status === 'done' ? `${t.title} reopened` : `${t.title} done`,
              )
            }
          />
          <div className="min-w-0 flex-1">
            <button
              type="button"
              className="tap-text w-full"
              onClick={() => setExpanded(expanded === t.id ? null : t.id)}
            >
              <span className={`block text-[14px] ${t.status === 'done' ? 'text-ink-3 line-through' : ''}`}>
                {t.title}
              </span>
            </button>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[11.5px] text-ink-3">
              {c ? (
                <span className="flex items-center gap-1">
                  <Dot colour={c.colour} />
                  <span className="font-mono">{c.code}</span>
                </span>
              ) : null}
              <span>{t.type}</span>
              <span>· {t.weight_pct}% of grade</span>
              <span>· {humanMinutes(t.est_minutes)}</span>
              <span className="font-mono">· priority {taskScore(t).toFixed(1)}</span>
            </div>
            {expanded === t.id ? (
              <>
                {t.notes ? (
                  <p className="mt-2 whitespace-pre-wrap text-[13px] text-ink-2">{t.notes}</p>
                ) : null}
                <Subtasks taskId={t.id} />
                <div className="mt-3 border-t border-rule pt-3">
                  <Attachments parentType="task" parentId={t.id} label="Attachments" />
                </div>
                <Button size="sm" className="mt-3" onClick={() => setEditing(t)}>
                  Edit
                </Button>
              </>
            ) : null}
          </div>
          <Badge tone={t.status === 'done' ? 'ok' : dueTone(rel.days)}>{rel.label}</Badge>
        </div>
      </Card>
    )
  }

  return (
    <>
      <PageHeader
        eyebrow="Work queue"
        title="Deadlines"
        lede={`Sorted by impact × urgency rather than date, so a 40% report on Friday outranks a 2% quiz tomorrow. ${queue.length} open${fromApplications ? ` (${fromApplications} from applications)` : ''}, ${humanMinutes(totalEffort)} of estimated work.`}
        action={
          <Button variant="primary" onClick={() => setAdding(true)}>
            <Plus size={15} /> Add deadline
          </Button>
        }
      />

      <div className="mb-4 flex gap-2">
        <Button size="sm" variant={showDone ? 'quiet' : 'ghost'} onClick={() => setShowDone(false)}>
          Open ({queue.length})
        </Button>
        <Button size="sm" variant={showDone ? 'ghost' : 'quiet'} onClick={() => setShowDone(true)}>
          Done ({done.length})
        </Button>
      </div>

      {showDone ? (
        done.length ? (
          <ul className="space-y-2">
            {done.map((t) => (
              <TaskCard key={t.id} t={t} />
            ))}
          </ul>
        ) : (
          <Empty title="Nothing finished yet">Completed deadlines land here.</Empty>
        )
      ) : queue.length ? (
        <ul className="space-y-2">
          {queue.map((q) => {
            if (q.kind === 'task') return <TaskCard key={q.id} t={q.source as StudyTask} />
            const app = q.source as Application
            const rel = relativeDue(q.dueAt)
            return (
              <Card as="li" key={q.id} className="border-dashed p-3.5">
                <div className="flex items-start gap-3">
                  <Briefcase size={16} className="mt-0.5 shrink-0 text-accent" />
                  <div className="min-w-0 flex-1">
                    <Link to="/applications" className="tap-text text-[14px] hover:text-accent">
                      {q.title}
                    </Link>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11.5px] text-ink-3">
                      <span>{q.subtitle}</span>
                      <span>· {app.stage}</span>
                      <span>· {humanMinutes(q.estMinutes)} of work left</span>
                      <span className="font-mono">· priority {q.score.toFixed(1)}</span>
                    </div>
                  </div>
                  <Badge tone={dueTone(rel.days)}>{rel.label}</Badge>
                </div>
              </Card>
            )
          })}
        </ul>
      ) : (
        <Empty
          title="Queue is clear"
          action={
            <Button variant="primary" onClick={() => setAdding(true)}>
              Add a deadline
            </Button>
          }
        >
          Add what is due with its weight and your effort estimate — the planner needs both.
        </Empty>
      )}

      <Modal open={adding} onClose={() => setAdding(false)} title="Add deadline">
        <TaskForm onDone={() => setAdding(false)} />
      </Modal>
      <Modal open={Boolean(editing)} onClose={() => setEditing(undefined)} title="Edit deadline">
        {editing ? <TaskForm task={editing} onDone={() => setEditing(undefined)} /> : null}
      </Modal>
    </>
  )
}
