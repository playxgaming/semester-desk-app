import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Command } from 'lucide-react'
import { useUi } from '@/store/ui'
import { saveProfile } from '@/db/mutate'
import { db } from '@/db/db'
import { ensureProfile } from '@/db/mutate'

/**
 * Ctrl/Cmd + K. A study tool lives or dies on how fast you can get a thought
 * out of your head and into it, and on a laptop the fastest path is never a
 * mouse.
 */

interface Action {
  id: string
  label: string
  hint: string
  group: 'Go to' | 'Do'
  run: () => void | Promise<void>
}

export function CommandPalette() {
  const navigate = useNavigate()
  const notify = useUi((s) => s.notify)
  const open = useUi((s) => s.commandOpen)
  const setOpen = useUi((s) => s.setCommandOpen)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const actions = useMemo<Action[]>(() => {
    const go = (path: string, label: string, hint: string): Action => ({
      id: `go:${path}`,
      label,
      hint,
      group: 'Go to',
      run: () => navigate(path),
    })
    return [
      go('/', 'Today', 'classes, queue, study blocks'),
      go('/timetable', 'Timetable', 'weekly grid and holidays'),
      go('/attendance', 'Attendance', 'skip calculator'),
      go('/tasks', 'Deadlines', 'impact × urgency queue'),
      go('/grades', 'Grades', 'what do I need'),
      go('/planner', 'Planner', 'capacity-aware plan'),
      go('/review', 'Review', 'spaced repetition'),
      go('/coach', 'Coach', 'weekly review, critique, quiz'),
      go('/tutor', 'AI Tutor', 'step-by-step problem solving'),
      go('/notes', 'Notes', 'markdown with LaTeX'),
      go('/focus', 'Focus', 'pomodoro'),
      go('/courses', 'Courses', 'syllabus trackers'),
      go('/applications', 'Applications', 'pipeline board'),
      go('/resume', 'Resume', 'versions and exports'),
      go('/money', 'Money', 'budgets and habits'),
      go('/settings', 'Settings', 'grading, reminders, data'),
      go('/install', 'Install app', 'download, home screen, offline access'),
      {
        id: 'do:plan',
        label: 'Rebuild the study plan',
        hint: 'ten days, inside your capacity',
        group: 'Do',
        run: async () => {
          const { buildPlan } = await import('@/lib/planner')
          const { alive, put, remove } = await import('@/db/mutate')
          const profile = await ensureProfile()
          const [courses, topics, tasks, slots, sessions] = await Promise.all([
            db.courses.toArray(),
            db.topics.toArray(),
            db.tasks.toArray(),
            db.timetable_slots.toArray(),
            db.sessions.toArray(),
          ])
          const today = new Date().toISOString().slice(0, 10)
          const live = alive(sessions)
          const plan = buildPlan({
            from: today,
            days: 10,
            capacityMin: profile.daily_capacity_min,
            courses: alive(courses),
            topics: alive(topics),
            tasks: alive(tasks),
            slots: alive(slots),
            existing: live,
          })
          for (const s of live.filter((s) => s.auto && s.status === 'planned' && s.date >= today)) {
            await remove('sessions', s.id)
          }
          for (const s of plan.sessions) await put('sessions', s)
          notify(`${plan.sessions.length} blocks planned — ${plan.diagnostics.verdict}`)
          navigate('/planner')
        },
      },
      {
        id: 'do:remind',
        label: 'Reschedule reminders',
        hint: 'rebuild the device alarm list',
        group: 'Do',
        run: async () => {
          const { reschedule } = await import('@/lib/scheduler')
          const r = await reschedule()
          notify(
            r.native
              ? `${r.scheduled} reminders scheduled`
              : 'Scheduling while closed needs the Android build',
            r.native ? 'ok' : 'warn',
          )
        },
      },
      {
        id: 'do:export',
        label: 'Export a backup',
        hint: 'every table, as JSON',
        group: 'Do',
        run: async () => {
          const { exportJson, download } = await import('@/lib/backup')
          const b = await exportJson()
          download(`semester-desk-${b.exported_at.slice(0, 10)}.json`, JSON.stringify(b, null, 2))
          notify('Backup downloaded')
        },
      },
      {
        id: 'do:theme',
        label: 'Switch theme',
        hint: 'light, dark, or follow the system',
        group: 'Do',
        run: async () => {
          const p = await ensureProfile()
          const next = p.theme === 'dark' ? 'light' : p.theme === 'light' ? 'system' : 'dark'
          await saveProfile({ theme: next })
          notify(`Theme: ${next}`)
        },
      },
    ]
  }, [navigate, notify])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return actions
    return actions.filter(
      (a) => a.label.toLowerCase().includes(q) || a.hint.toLowerCase().includes(q),
    )
  }, [actions, query])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(!open)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, setOpen])

  useEffect(() => {
    if (open) {
      setQuery('')
      setActive(0)
      window.setTimeout(() => inputRef.current?.focus(), 10)
    }
  }, [open])

  useEffect(() => {
    listRef.current?.querySelectorAll('li')[active]?.scrollIntoView({ block: 'nearest' })
  }, [active])

  if (!open) return null

  async function run(a: Action) {
    setOpen(false)
    await a.run()
  }

  let lastGroup = ''

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center bg-black/40 p-4 pt-[12vh] backdrop-blur-[2px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setOpen(false)
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="w-full max-w-lg overflow-hidden rounded border border-rule bg-surface shadow-card"
      >
        <div className="flex items-center gap-2 border-b border-rule px-3.5 py-2.5">
          <Command size={15} className="shrink-0 text-ink-3" />
          <input
            ref={inputRef}
            className="w-full border-0 bg-transparent text-[15px] outline-none"
            placeholder="Jump to, or do…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActive(0)
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setActive((i) => Math.min(results.length - 1, i + 1))
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault()
                setActive((i) => Math.max(0, i - 1))
              }
              if (e.key === 'Enter' && results[active]) {
                e.preventDefault()
                void run(results[active])
              }
              if (e.key === 'Escape') setOpen(false)
            }}
          />
          <kbd className="chip">esc</kbd>
        </div>

        <ul ref={listRef} className="max-h-[52vh] overflow-y-auto py-1">
          {results.map((a, i) => {
            const header = a.group !== lastGroup ? a.group : null
            lastGroup = a.group
            return (
              <li key={a.id}>
                {header ? <div className="eyebrow px-3.5 pb-1 pt-2">{header}</div> : null}
                <button
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => void run(a)}
                  className={`flex w-full items-baseline gap-2 px-3.5 py-2 text-left ${
                    i === active ? 'bg-accent-soft text-accent' : 'hover:bg-surface-2'
                  }`}
                >
                  <span className="text-[14px]">{a.label}</span>
                  <span className="truncate text-[11.5px] text-ink-3">{a.hint}</span>
                </button>
              </li>
            )
          })}
          {!results.length && (
            <li className="px-3.5 py-6 text-center text-[13px] text-ink-3">
              Nothing matches “{query}”.
            </li>
          )}
        </ul>
      </div>
    </div>
  )
}
