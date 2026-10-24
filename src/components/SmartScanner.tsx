import { useState, useRef, useEffect } from 'react'
import { Button, Modal, Note, Card, Field, Select } from '@/components/ui'
import { Camera, Loader2 } from 'lucide-react'
import { put, stamp } from '@/db/mutate'
import { db } from '@/db/db'
import { useCourses } from '@/hooks/data'
import { useUi } from '@/store/ui'
import { aiRequest } from '@/lib/ai'
import { uid } from '@/lib/id'

interface Item {
  title: string
  type: 'class' | 'deadline' | 'exam' | 'holiday'
  date: string
  startTime: string
  endTime: string
  dayOfWeek: string
  location: string
  course: string
  selected: boolean
}
const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value
const validTime = (value: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value)

export default function SmartScanner({ onClose, courseId }: { onClose?: () => void; courseId?: string }) {
  const courses = useCourses()
  const notify = useUi(s => s.notify)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState('')
  const [items, setItems] = useState<Item[] | null>(null)
  const [error, setError] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const generation = useRef(0)
  const request = useRef<AbortController | null>(null)
  useEffect(() => () => request.current?.abort(), [])
  useEffect(() => { if (!file) { setPreview(''); return }
    const url = URL.createObjectURL(file); setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])
  const close = () => {
    if (saving) return
    generation.current++; request.current?.abort(); setBusy(false); setOpen(false); setFile(null); setItems(null); setError(''); onClose?.()
  }
  const edit = (index: number, changes: Partial<Item>) => setItems(current => current?.map((item, i) => i === index ? { ...item, ...changes } : item) || null)
  const scan = async () => {
    if (!file || busy) return
    setBusy(true); setError('')
    const token = ++generation.current
    const controller = new AbortController(); request.current = controller
    try {
      const form = new FormData(); form.append('document', file)
      const result = await aiRequest<unknown>('scan-document', form, controller.signal)
      if (!Array.isArray(result) || result.length > 100) throw new Error('Invalid scan response. Please try another image.')
      const rows: Item[] = result.map(raw => {
        if (!raw || typeof raw.title !== 'string' || !['class', 'deadline', 'exam', 'holiday'].includes(raw.type)) throw new Error('Invalid extracted item. Please retry.')
        const text = (key: string) => typeof raw[key] === 'string' ? raw[key] : ''
        const matched = courses.find(c => raw.title.toLowerCase().includes(c.code.toLowerCase()) || raw.title.toLowerCase().includes(c.name.toLowerCase()))
        return { title: raw.title.slice(0, 200), type: raw.type, date: text('date'), startTime: text('startTime'), endTime: text('endTime'), dayOfWeek: Number.isInteger(raw.dayOfWeek) && raw.dayOfWeek >= 0 && raw.dayOfWeek <= 6 ? String(raw.dayOfWeek) : '', location: text('location'), course: courseId || matched?.id || '', selected: true }
      })
      if (token === generation.current) setItems(rows)
    } catch (e) { if (token === generation.current) setError(e instanceof Error ? e.message : 'Scanning failed.') }
    finally { if (token === generation.current) { setBusy(false); request.current = null } }
  }
  const save = async () => {
    if (busy || !items) return
    const chosen = items.filter(i => i.selected)
    if (!chosen.length) return
    for (const item of chosen) {
      if (!item.title.trim()) { setError('Every selected item needs a title.'); return }
      if (item.course && !courses.some(c => c.id === item.course)) { setError('Select an available course.'); return }
      if (item.type === 'class') {
        if (!item.course || !/^[0-6]$/.test(item.dayOfWeek) || !validTime(item.startTime) || !validTime(item.endTime) || item.endTime <= item.startTime) {
          setError('Each weekly class needs a course, weekday, and an end time after its start time.'); return
        }
      } else if (!validDate(item.date) || (item.startTime && !validTime(item.startTime))) {
        setError('Each deadline, exam, or holiday needs a valid date. Check any times too.'); return
      }
    }
    setBusy(true); setSaving(true); setError('')
    try {
      // One transaction: an interrupted import cannot leave half a timetable.
      await db.transaction('rw', [db.tasks, db.timetable_slots, db.timetable_exceptions, db.outbox], async () => {
        for (const item of chosen) {
          if (item.type === 'class') {
            await put('timetable_slots', stamp({ id: uid(), course_id: item.course, weekday: Number(item.dayOfWeek), start: item.startTime, end: item.endTime, room: item.location, kind: 'lecture' as const }))
          } else if (item.type === 'holiday') {
            await put('timetable_exceptions', stamp({ id: uid(), slot_id: null, date: item.date, kind: 'holiday' as const, new_start: null, new_end: null, note: item.title }))
          } else {
            await put('tasks', stamp({ id: uid(), course_id: item.course || null, title: item.title.trim(), type: item.type === 'exam' ? 'exam' as const : 'assignment' as const, due_at: new Date(`${item.date}T${item.startTime || '23:59'}:00`).toISOString(), status: 'todo' as const, weight_pct: 0, est_minutes: 60, notes: item.location ? `Location: ${item.location}` : '' }))
          }
        }
      })
      notify(`Imported ${chosen.length} items. Classes are in Timetable; exams and deadlines are in Deadlines.`)
      setBusy(false); setSaving(false); setOpen(false); setFile(null); setItems(null); onClose?.()
    } catch { setError('Could not save the import. No items were added. Please try again.'); setBusy(false); setSaving(false) }
  }
  return <>
    <Button onClick={() => setOpen(true)} className="text-accent"><Camera size={16} /> Scan Document</Button>
    <Modal open={open} onClose={close} title="Smart Scanner" footer={<div className="flex flex-wrap justify-end gap-3">
      <Button onClick={close} disabled={saving}>{busy && !saving ? 'Cancel scan' : 'Cancel'}</Button>
      <Button variant="primary" onClick={items ? save : scan} disabled={busy || (items ? !items.some(i => i.selected) : !file)}>
        {busy && <Loader2 size={16} className="animate-spin" />}{busy ? 'Working…' : items ? `Import ${items.filter(i => i.selected).length} items` : 'Scan image'}
      </Button>
    </div>}>
      <Note>Upload a timetable or circular (JPEG, PNG, WebP, up to 8 MB). The image is sent to the AI service. Review and correct every item before importing. Weekly classes repeat throughout your term.</Note>
      <input ref={input} aria-label="Choose document image" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={e => {
        const selected = e.target.files?.[0]; if (!selected) return
        setError(''); setItems(null)
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(selected.type) || selected.size > 8 * 1024 * 1024) { setFile(null); setError('Choose a JPEG, PNG, or WebP image under 8 MB.'); return }
        setFile(selected)
      }} />
      {preview && <img src={preview} alt="Selected document" className="my-4 max-h-[200px] max-w-full rounded object-contain" />}
      {error && <div role="alert"><Note tone="crit">{error}</Note></div>}
      {items && <div className="space-y-3">
        <p className="text-sm">{items.length ? 'Select the items to import. AI extraction can make mistakes.' : 'No events found. Try a clearer image.'}</p>
        {items.map((item, i) => <Card key={i} className="p-3 space-y-3">
          <label className="flex min-h-[44px] items-center gap-2"><input type="checkbox" checked={item.selected} disabled={busy} onChange={e => edit(i, { selected: e.target.checked })} />Include item {i + 1}</label>
          <Field label={`Title ${i + 1}`} value={item.title} disabled={busy} maxLength={200} onChange={e => edit(i, { title: e.target.value })} />
          <Select label={`Type ${i + 1}`} value={item.type} disabled={busy} onChange={e => edit(i, { type: e.target.value as Item['type'] })}>
            <option value="class">Weekly class</option><option value="deadline">Deadline</option><option value="exam">Exam</option><option value="holiday">Holiday (whole day)</option>
          </Select>
          {item.type !== 'holiday' && <Select label={`Course ${i + 1}`} value={item.course} disabled={busy} onChange={e => edit(i, { course: e.target.value })}>
            <option value="">{item.type === 'class' ? 'Select a course (required)' : 'General / no course'}</option>{courses.map(c => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
          </Select>}
          {item.type === 'class' ? <Select label={`Weekday ${i + 1}`} value={item.dayOfWeek} disabled={busy} onChange={e => edit(i, { dayOfWeek: e.target.value })}>
            <option value="">Select weekday</option>{weekdays.map((day, index) => <option key={day} value={index}>{day}</option>)}
          </Select> : <Field label={`Date ${i + 1}`} type="date" value={item.date} disabled={busy} onChange={e => edit(i, { date: e.target.value })} />}
          {item.type !== 'holiday' && <Field label={`${item.type === 'class' ? 'Start time' : 'Due time (optional)'} ${i + 1}`} type="time" value={item.startTime} disabled={busy} onChange={e => edit(i, { startTime: e.target.value })} />}
          {item.type === 'class' && <Field label={`End time ${i + 1}`} type="time" value={item.endTime} disabled={busy} onChange={e => edit(i, { endTime: e.target.value })} />}
          {item.type !== 'holiday' && <Field label={`Location ${i + 1}`} value={item.location} disabled={busy} onChange={e => edit(i, { location: e.target.value })} />}
        </Card>)}
      </div>}
    </Modal>
  </>
}
