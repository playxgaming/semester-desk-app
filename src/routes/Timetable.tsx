import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import {
  Badge,
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
import SmartScanner from '@/components/SmartScanner'
import { useCourseMap, useCourses, useExceptions, useSlots } from '@/hooks/data'
import { durationMin, humanMinutes, minutesOfDay, prettyDay, today, WEEKDAYS_LONG } from '@/lib/date'
import type { TimetableSlot } from '@/db/db'
import { put, remove } from '@/db/mutate'
import { removeWithUndo } from '@/lib/undoable'
import { uid } from '@/lib/id'
import { useUi } from '@/store/ui'

const ORDER = [1, 2, 3, 4, 5, 6, 0] // Monday-first

function SlotForm({ slot, onDone }: { slot?: TimetableSlot; onDone: () => void }) {
  const courses = useCourses()
  const notify = useUi((s) => s.notify)
  const [form, setForm] = useState<TimetableSlot>(
    slot ?? {
      id: uid(),
      user_id: null,
      updated_at: '',
      deleted_at: null,
      course_id: courses[0]?.id ?? '',
      weekday: 1,
      start: '09:00',
      end: '10:00',
      room: '',
      kind: 'lecture',
    },
  )

  useEffect(() => {
    if (!form.course_id && courses.length) setForm((current) => ({ ...current, course_id: courses[0].id }))
  }, [courses, form.course_id])

  if (!courses.length) {
    return <p className="text-[13.5px] text-ink-2">Add a course first — a slot has to belong to one.</p>
  }

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault()
        if (!form.course_id || !courses.some((c) => c.id === form.course_id)) {
          notify('Choose a course for this class', 'crit')
          return
        }
        if (minutesOfDay(form.end) <= minutesOfDay(form.start)) {
          notify('End time has to be after the start', 'crit')
          return
        }
        await put('timetable_slots', form)
        notify('Timetable updated')
        onDone()
      }}
    >
      <Row>
        <Select
          label="Course"
          value={form.course_id}
          onChange={(e) => setForm({ ...form, course_id: e.target.value })}
        >
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.code} — {c.name}
            </option>
          ))}
        </Select>
        <Select
          label="Kind"
          value={form.kind}
          onChange={(e) => setForm({ ...form, kind: e.target.value as TimetableSlot['kind'] })}
        >
          <option value="lecture">Lecture</option>
          <option value="lab">Lab</option>
          <option value="tutorial">Tutorial</option>
          <option value="other">Other</option>
        </Select>
      </Row>
      <Row className="mt-3">
        <Select
          label="Day"
          value={String(form.weekday)}
          onChange={(e) => setForm({ ...form, weekday: Number(e.target.value) })}
        >
          {ORDER.map((d) => (
            <option key={d} value={d}>
              {WEEKDAYS_LONG[d]}
            </option>
          ))}
        </Select>
        <Field label="Room" value={form.room} onChange={(e) => setForm({ ...form, room: e.target.value })} />
      </Row>
      <Row className="mt-3">
        <Field
          label="Start"
          type="time"
          required
          value={form.start}
          onChange={(e) => setForm({ ...form, start: e.target.value })}
        />
        <Field
          label="End"
          type="time"
          required
          value={form.end}
          onChange={(e) => setForm({ ...form, end: e.target.value })}
        />
      </Row>
      <div className="mt-5 flex gap-2">
        <Button type="submit" variant="primary">
          Save slot
        </Button>
        <Button onClick={onDone}>Cancel</Button>
        {slot ? (
          <Button
            variant="danger"
            className="ml-auto"
            onClick={async () => {
              await remove('timetable_slots', slot.id)
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

export default function Timetable() {
  const slots = useSlots()
  const byId = useCourseMap()
  const exceptions = useExceptions()
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<TimetableSlot | undefined>()
  const [holiday, setHoliday] = useState('')

  const byDay = useMemo(() => {
    const m = new Map<number, TimetableSlot[]>()
    for (const d of ORDER) m.set(d, [])
    for (const s of slots) m.get(s.weekday)?.push(s)
    for (const list of m.values()) list.sort((a, b) => a.start.localeCompare(b.start))
    return m
  }, [slots])

  const weeklyMin = slots.reduce((s, x) => s + durationMin(x.start, x.end), 0)

  return (
    <>
      <PageHeader
        eyebrow="Academic core"
        title="Timetable"
        lede={`Your recurring week — ${slots.length} slots, ${humanMinutes(weeklyMin)} of contact time. Holidays and one-off cancellations are exceptions, so the recurrence stays intact.`}
        action={
          <div className="flex gap-2 items-center">
            <SmartScanner />
            <Button variant="primary" onClick={() => setAdding(true)}>
              <Plus size={15} /> Add slot
            </Button>
          </div>
        }
      />

      {slots.length ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {ORDER.map((d) => {
            const list = byDay.get(d) ?? []
            const isToday = new Date().getDay() === d
            return (
              <Card key={d} className={isToday ? 'border-accent p-4' : 'p-4'}>
                <div className="mb-3 flex items-baseline gap-2">
                  <h3 className="text-[14px]">{WEEKDAYS_LONG[d]}</h3>
                  {isToday ? <Badge tone="accent">today</Badge> : null}
                  <span className="ml-auto font-mono text-[11px] text-ink-3">
                    {humanMinutes(list.reduce((s, x) => s + durationMin(x.start, x.end), 0))}
                  </span>
                </div>
                {list.length ? (
                  <ul className="space-y-2">
                    {list.map((s) => {
                      const c = byId.get(s.course_id)
                      return (
                        <li key={s.id}>
                          <button
                            type="button"
                            onClick={() => setEditing(s)}
                            className="w-full rounded border border-rule bg-surface-2 px-3 py-2 text-left transition hover:border-rule-2"
                          >
                            <span className="flex items-center gap-2">
                              <Dot colour={c?.colour ?? 'var(--rule-2)'} />
                              <b className="font-mono text-[12.5px] font-medium">{c?.code ?? '—'}</b>
                              <span className="ml-auto font-mono text-[11.5px] text-ink-3 tabnum">
                                {s.start}–{s.end}
                              </span>
                            </span>
                            <span className="mt-0.5 block text-[11.5px] text-ink-3">
                              {s.kind} · {s.room || 'no room'}
                            </span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                ) : (
                  <p className="py-3 text-center text-[12.5px] text-ink-3">Free</p>
                )}
              </Card>
            )
          })}
        </div>
      ) : (
        <Empty
          title="No slots yet"
          action={
            <Button variant="primary" onClick={() => setAdding(true)}>
              Add your first class
            </Button>
          }
        >
          Enter your weekly classes once. Attendance, the planner and the morning view all read from here.
        </Empty>
      )}

      <Card className="mt-6 p-4">
        <h3 className="mb-1 text-[14px]">Holidays and cancellations</h3>
        <p className="mb-3 text-[13px] text-ink-2">
          Mark a date off and every class on it is skipped — no attendance prompt, no planned study
          assumed against class time.
        </p>
        <form
          className="flex flex-wrap gap-2"
          onSubmit={async (e) => {
            e.preventDefault()
            if (!holiday || exceptions.some((e) => e.date === holiday && !e.slot_id && e.kind === 'holiday')) return
            await put('timetable_exceptions', {
              id: uid(),
              user_id: null,
              updated_at: '',
              deleted_at: null,
              slot_id: null,
              date: holiday,
              kind: 'holiday',
              new_start: null,
              new_end: null,
              note: '',
            })
            setHoliday('')
          }}
        >
          <Field
            type="date"
            required
            className="w-[190px]"
            value={holiday}
            aria-label="Holiday date"
            onChange={(e) => setHoliday(e.target.value)}
          />
          <Button type="submit">Mark as holiday</Button>
        </form>
        {exceptions.length ? (
          <ul className="mt-3 flex flex-wrap gap-2">
            {exceptions
              .slice()
              .sort((a, b) => a.date.localeCompare(b.date))
              .map((x) => (
                <li key={x.id}>
                  <button
                    type="button"
                    className="chip hover:border-crit hover:text-crit"
                    onClick={() => void removeWithUndo('timetable_exceptions', x.id, 'Exception')}
                    title="Remove"
                  >
                    {x.date === today() ? 'Today' : prettyDay(x.date)} · {x.kind} ✕
                  </button>
                </li>
              ))}
          </ul>
        ) : null}
      </Card>

      <Modal open={adding} onClose={() => setAdding(false)} title="Add timetable slot">
        <SlotForm onDone={() => setAdding(false)} />
      </Modal>
      <Modal open={Boolean(editing)} onClose={() => setEditing(undefined)} title="Edit slot">
        {editing ? <SlotForm slot={editing} onDone={() => setEditing(undefined)} /> : null}
      </Modal>
    </>
  )
}
