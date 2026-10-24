import { useEffect, useRef, useState } from 'react'
import { Pause, Play, RotateCcw, Zap } from 'lucide-react'
import { Badge, Button, Card, Empty, PageHeader, Panel, Select, Stat } from '@/components/ui'
import { useCourseMap, useCourses, useFocusToday, useTasks } from '@/hooks/data'
import { humanMinutes, today } from '@/lib/date'
import { patch, put } from '@/db/mutate'
import { uid } from '@/lib/id'
import { useUi } from '@/store/ui'
import { buzz, tap, thud } from '@/lib/haptics'
import { db } from '@/db/db'
import { alive } from '@/db/mutate'
import { format } from '@/lib/date'

const PRESETS = [
  { work: 25, brk: 5, label: '25 / 5' },
  { work: 50, brk: 10, label: '50 / 10' },
  { work: 90, brk: 20, label: '90 / 20' },
]

export default function Focus() {
  const courses = useCourses()
  const byId = useCourseMap()
  const tasks = useTasks()
  const logged = useFocusToday()
  const notify = useUi((s) => s.notify)

  const [preset, setPreset] = useState(PRESETS[0])
  const [phase, setPhase] = useState<'work' | 'break'>('work')
  const [left, setLeft] = useState(PRESETS[0].work * 60)
  const [running, setRunning] = useState(false)
  const [courseId, setCourseId] = useState('')
  const [taskId, setTaskId] = useState('')
  const [interruptions, setInterruptions] = useState(0)
  const startedRef = useRef<string | null>(null)
  const finishingRef = useRef(false)
  // The deadline, not a countdown. Android suspends a backgrounded WebView's
  // timers, so a decrementing counter loses every minute you spend with the
  // screen off — which is most of a pomodoro. Wall-clock arithmetic against a
  // stored end time is correct however long the app was asleep, and survives
  // the app being killed outright.
  const [endsAt, setEndsAt] = useState<number | null>(null)

  const RUN_KEY = 'semester-desk:focus-run'

  useEffect(() => {
    try {
      const saved = localStorage.getItem(RUN_KEY)
      if (!saved) return
      const run = JSON.parse(saved) as {
        endsAt: number
        phase: 'work' | 'break'
        work: number
        brk: number
        courseId: string
        taskId: string
        interruptions: number
        started?: string | null
      }
      const remaining = Math.ceil((run.endsAt - Date.now()) / 1000)
      setPreset(PRESETS.find((p) => p.work === run.work) ?? { work: run.work, brk: run.brk, label: `${run.work} / ${run.brk}` })
      setPhase(run.phase)
      setCourseId(run.courseId)
      setTaskId(run.taskId)
      setInterruptions(run.interruptions)
      setEndsAt(run.endsAt)
      setLeft(Math.max(0, remaining))
      setRunning(true)
      startedRef.current = run.started ?? new Date(run.endsAt - (run.phase === 'work' ? run.work : run.brk) * 60_000).toISOString()
    } catch {
      /* a corrupt entry is not worth a crash */
    }
  }, [])

  useEffect(() => {
    if (!running || endsAt === null) return
    const sync = () => setLeft(Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)))
    sync()
    const t = window.setInterval(sync, 250)
    // coming back from the background must not wait for the next tick
    document.addEventListener('visibilitychange', sync)
    window.addEventListener('focus', sync)
    return () => {
      window.clearInterval(t)
      document.removeEventListener('visibilitychange', sync)
      window.removeEventListener('focus', sync)
    }
  }, [running, endsAt])

  // Keep changes made during a running block (especially interruptions) in
  // the recovery record as well as the visible timer.
  useEffect(() => {
    if (!running || endsAt === null) return
    try {
      localStorage.setItem(RUN_KEY, JSON.stringify({ endsAt, phase, work: preset.work, brk: preset.brk, courseId, taskId, interruptions, started: startedRef.current }))
    } catch { /* persistence is optional */ }
  }, [running, endsAt, phase, preset, courseId, taskId, interruptions])

  function beginCountdown(seconds: number, nextPhase: 'work' | 'break' = phase) {
    const end = Date.now() + seconds * 1000
    setEndsAt(end)
    setLeft(seconds)
    setRunning(true)
    try {
      localStorage.setItem(
        RUN_KEY,
        JSON.stringify({
          endsAt: end,
          phase: nextPhase,
          work: preset.work,
          brk: preset.brk,
          courseId,
          taskId,
          interruptions,
          started: startedRef.current,
        }),
      )
    } catch {
      /* the timer still works, it just will not survive a kill */
    }
  }

  function stopCountdown(remaining: number | null) {
    setRunning(false)
    setEndsAt(null)
    if (remaining !== null) setLeft(remaining)
    try {
      localStorage.removeItem(RUN_KEY)
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    if (left > 0 || !running) return
    stopCountdown(null)
    if (phase === 'work') void finish()
    else {
      startedRef.current = null
      setPhase('work')
      setLeft(preset.work * 60)
      void thud()
      notify('Break over — back to it')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left, running])

  async function finish() {
    if (finishingRef.current) return
    finishingRef.current = true
    try {
    const minutes = preset.work
    await put('focus_sessions', {
      id: uid(),
      user_id: null,
      updated_at: '',
      deleted_at: null,
      course_id: courseId || null,
      task_id: taskId || null,
      started: startedRef.current ?? new Date().toISOString(),
      ended: new Date().toISOString(),
      minutes,
      interruptions,
    })
    // credit the minutes to a planned block for the same course, if there is one
    const sessions = alive(await db.sessions.where('date').equals(today()).toArray())
    const block = sessions.find(
      (s) => s.status === 'planned' && (taskId ? s.task_id === taskId : s.course_id === (courseId || null)),
    )
    if (block) {
      const actual = block.actual_min + minutes
      await patch('sessions', block.id, {
        actual_min: actual,
        status: actual >= block.planned_min ? 'done' : 'planned',
      })
    }
    setInterruptions(0)
    startedRef.current = null
    setPhase('break')
    void thud()
    beginCountdown(preset.brk * 60, 'break')
    notify(`${minutes} minutes logged${block ? ' and credited to your plan' : ''}`)
    } finally {
      finishingRef.current = false
    }
  }

  const total = (phase === 'work' ? preset.work : preset.brk) * 60
  const pct = 1 - left / Math.max(1, total)
  const mm = String(Math.floor(left / 60)).padStart(2, '0')
  const ss = String(left % 60).padStart(2, '0')

  const todayMin = logged.reduce((s, f) => s + f.minutes, 0)
  const todayInt = logged.reduce((s, f) => s + f.interruptions, 0)

  const R = 92
  const C = 2 * Math.PI * R

  return (
    <>
      <PageHeader
        eyebrow="Study engine"
        title="Focus"
        lede="A pomodoro that logs to a course, counts interruptions, and feeds real minutes back into the planner's capacity estimate — so the plan is built on what you actually do."
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="flex flex-col items-center p-8">
          <div className="mb-4 flex gap-1">
            {PRESETS.map((p) => (
              <Button
                key={p.label}
                size="sm"
                variant={p.label === preset.label ? 'primary' : 'ghost'}
                disabled={running}
                onClick={() => {
                  setPreset(p)
                  setPhase('work')
                  stopCountdown(p.work * 60)
                  startedRef.current = null
                  setInterruptions(0)
                }}
              >
                {p.label}
              </Button>
            ))}
          </div>

          <svg viewBox="0 0 220 220" className="h-[220px] w-[220px]" role="img" aria-label={`${mm}:${ss} remaining`}>
            <circle cx="110" cy="110" r={R} fill="none" stroke="var(--rule)" strokeWidth="6" />
            <circle
              cx="110"
              cy="110"
              r={R}
              fill="none"
              stroke={phase === 'work' ? 'var(--accent)' : 'var(--ok)'}
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={C}
              strokeDashoffset={C * (1 - pct)}
              transform="rotate(-90 110 110)"
            />
            <text
              x="110"
              y="112"
              textAnchor="middle"
              fill="var(--ink)"
              style={{ fontFamily: 'IBM Plex Mono', fontSize: 38, fontVariantNumeric: 'tabular-nums' }}
            >
              {mm}:{ss}
            </text>
            <text x="110" y="140" textAnchor="middle" fill="var(--ink-3)" style={{ fontSize: 12 }}>
              {phase === 'work' ? 'focus' : 'break'}
            </text>
          </svg>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            <Button
              variant="primary"
              size="lg"
              onClick={() => {
                if (running) {
                  stopCountdown(Math.max(0, Math.ceil(((endsAt ?? Date.now()) - Date.now()) / 1000)))
                  return
                }
                if (!startedRef.current) startedRef.current = new Date().toISOString()
                beginCountdown(left)
                void tap()
              }}
            >
              {running ? <Pause size={16} /> : <Play size={16} />}
              {running ? 'Pause' : left === total ? 'Start' : 'Resume'}
            </Button>
            <Button
              size="lg"
              onClick={() => {
                stopCountdown(total)
                startedRef.current = null
                setInterruptions(0)
              }}
            >
              <RotateCcw size={15} /> Reset
            </Button>
            <Button
              size="lg"
              disabled={!running}
              onClick={() => {
                setInterruptions((i) => i + 1)
                void buzz()
              }}
            >
              <Zap size={15} /> Interrupted ({interruptions})
            </Button>
          </div>

          <div className="mt-6 grid w-full max-w-sm gap-2 sm:grid-cols-2">
            <Select
              label="Course"
              disabled={running || (phase === 'work' && left !== total)}
              value={courseId}
              onChange={(e) => {
                setCourseId(e.target.value)
                setTaskId('')
              }}
            >
              <option value="">No course</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code}
                </option>
              ))}
            </Select>
            <Select label="Deadline" disabled={running || (phase === 'work' && left !== total)} value={taskId} onChange={(e) => {
              setTaskId(e.target.value)
              const task = tasks.find((t) => t.id === e.target.value)
              if (task?.course_id) setCourseId(task.course_id)
            }}>
              <option value="">None</option>
              {tasks
                .filter((t) => t.status !== 'done' && (!courseId || t.course_id === courseId))
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
            </Select>
          </div>
        </Card>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Stat value={humanMinutes(todayMin)} label="Focused today" hint={`${logged.length} sessions`} />
            <Stat
              value={todayInt}
              label="Interruptions"
              tone={todayInt > 4 ? 'warn' : undefined}
              hint={logged.length ? `${(todayInt / logged.length).toFixed(1)} per session` : '—'}
            />
          </div>

          <Panel title="Today's sessions">
            {logged.length ? (
              <ul className="-my-1">
                {logged
                  .slice()
                  .reverse()
                  .map((f) => (
                    <li
                      key={f.id}
                      className="flex items-center gap-2 border-b border-rule py-2 text-[13px] last:border-0"
                    >
                      <span className="font-mono text-[12px] text-ink-3 tabnum">
                        {format(new Date(f.started), 'HH:mm')}
                      </span>
                      <span className="min-w-0 flex-1 truncate">
                        {f.course_id ? byId.get(f.course_id)?.code : 'General'}
                      </span>
                      <Badge>{humanMinutes(f.minutes)}</Badge>
                      {f.interruptions ? <Badge tone="warn">{f.interruptions} int</Badge> : null}
                    </li>
                  ))}
              </ul>
            ) : (
              <Empty title="Nothing logged yet">
                Finish a block and it lands here — and credits itself against today's plan.
              </Empty>
            )}
          </Panel>
        </div>
      </div>
    </>
  )
}
