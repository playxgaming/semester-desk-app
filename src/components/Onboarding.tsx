import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Plus, Trash2 } from 'lucide-react'
import { Badge, Button, Field, Modal, Note, Row, Select } from '@/components/ui'
import { PROFILE_ID, put, saveProfile } from '@/db/mutate'
import { uid } from '@/lib/id'
import { db, DEFAULT_GRADE_BANDS, GPA4_GRADE_BANDS, type Profile } from '@/db/db'
import { SERIES_LIGHT } from '@/lib/palette'
import { permissionState, requestPermission } from '@/lib/notify'
import { reschedule } from '@/lib/scheduler'
import { useUi } from '@/store/ui'

/**
 * First run. The demo semester is there so no screen is ever empty, but it is
 * someone else's semester — this is how you replace it with yours without
 * hunting through six settings screens.
 */

interface Draft {
  code: string
  name: string
  credits: number
}

const STEPS = ['You', 'Grading', 'Courses', 'Reminders'] as const
const RESTART_FLAG = 'semester-desk:setup-restarted'

export function Onboarding() {
  // Draft fields must start from the saved profile, not useProfile's temporary
  // fallback while IndexedDB loads (especially when setup is run again).
  const profile = useLiveQuery(() => db.profiles.get(PROFILE_ID), [])
  return profile && !profile.onboarded ? <Setup profile={profile} /> : null
}

function Setup({ profile }: { profile: Profile }) {
  const notify = useUi((s) => s.notify)
  const [step, setStep] = useState(0)
  const [open, setOpen] = useState(true)
  const [busy, setBusy] = useState(false)
  const saving = useRef(false)
  const [error, setError] = useState('')

  const [name, setName] = useState(profile.name)
  const [institution, setInstitution] = useState(profile.institution)
  const [termStart, setTermStart] = useState(profile.term_start)
  const [termEnd, setTermEnd] = useState(profile.term_end)
  const [scheme, setScheme] = useState<Profile['grading_scheme']>(profile.grading_scheme)
  const [threshold, setThreshold] = useState(profile.attendance_threshold)
  const [capacity, setCapacity] = useState(profile.daily_capacity_min)
  const [semester, setSemester] = useState(profile.current_semester)
  const [courses, setCourses] = useState<Draft[]>([{ code: '', name: '', credits: 4 }])
  const [wipeDemo, setWipeDemo] = useState(
    !sessionStorage.getItem(RESTART_FLAG) && !profile.name && !profile.institution,
  )

  if (!open) return null

  const validCourses = courses.filter((c) => c.code.trim())

  function validationError(atStep: number): string {
    if (atStep === 0) {
      if (!name.trim()) return 'Enter your name, or choose Skip to explore the demo.'
      if (!semester.trim()) return 'Enter a semester name.'
      if (!termStart || !termEnd) return 'Choose both term dates.'
      if (termEnd < termStart) return 'The term end must be on or after its start.'
    }
    if (atStep === 2) {
      if (courses.some((c) => c.name.trim() && !c.code.trim())) return 'Add a code for each named course.'
      if (validCourses.some((c) => !Number.isFinite(c.credits) || c.credits <= 0)) {
        return 'Course credits must be greater than zero.'
      }
      const codes = validCourses.map((c) => c.code.trim().toUpperCase())
      if (new Set(codes).size !== codes.length) return 'Use a different code for each course.'
    }
    return ''
  }

  function advance() {
    const problem = validationError(step)
    setError(problem)
    if (!problem) setStep(step + 1)
  }

  async function finish(withReminders: boolean) {
    if (saving.current) return
    const problem = validationError(0) || validationError(2)
    if (problem) {
      setError(problem)
      setStep(validationError(0) ? 0 : 2)
      return
    }
    saving.current = true
    setBusy(true)
    setError('')
    try {
      // Permission must be requested from the user's button gesture. Storage
      // writes are atomic, so an error cannot leave half of a semester erased.
      const permission = withReminders ? await requestPermission() : null
      await db.transaction('rw', db.tables, async () => {
        if (wipeDemo) {
          // clear the demo semester, keep the profile
          await Promise.all([
            db.courses.clear(),
            db.timetable_slots.clear(),
            db.timetable_exceptions.clear(),
            db.attendance.clear(),
            db.assessments.clear(),
            db.topics.clear(),
            db.tasks.clear(),
            db.subtasks.clear(),
            db.attachments.clear(),
            db.blobs.clear(),
            db.sessions.clear(),
            db.cards.clear(),
            db.reviews.clear(),
            db.notes.clear(),
            db.note_versions.clear(),
            db.applications.clear(),
            db.application_events.clear(),
            db.contacts.clear(),
            db.resume_items.clear(),
            db.resume_versions.clear(),
            db.transactions.clear(),
            db.budgets.clear(),
            db.recurring.clear(),
            db.habits.clear(),
            db.habit_logs.clear(),
            db.focus_sessions.clear(),
            db.ai_threads.clear(),
            db.ai_messages.clear(),
            db.outbox.clear(),
          ])
        }

        for (const [i, c] of validCourses.entries()) {
          await put('courses', {
            id: uid(),
            user_id: null,
            updated_at: '',
            deleted_at: null,
            code: c.code.trim().toUpperCase(),
            name: c.name.trim(),
            credits: c.credits,
            colour: SERIES_LIGHT[i % SERIES_LIGHT.length],
            instructor: '',
            target_grade: 80,
            attendance_threshold: threshold,
            archived: false,
            semester: semester.trim(),
          })
        }

        await saveProfile({
          name: name.trim(),
          institution: institution.trim(),
          term_start: termStart,
          term_end: termEnd,
          grading_scheme: scheme,
          grade_bands: scheme === profile.grading_scheme &&
            (scheme !== 'gpa4' || profile.grade_bands.every((band) => band.points <= 4))
            ? profile.grade_bands
            : scheme === 'gpa4' ? GPA4_GRADE_BANDS : DEFAULT_GRADE_BANDS,
          current_semester: semester.trim(),
          attendance_threshold: threshold,
          daily_capacity_min: capacity,
          onboarded: true,
        })
      })

      const remindersFailed = permission === 'granted'
        ? await reschedule().then(() => false, () => true)
        : false

      setOpen(false)
      sessionStorage.removeItem(RESTART_FLAG)
      const confirmation = validCourses.length
          ? `Set up with ${validCourses.length} courses. Add your timetable next.`
          : 'Set up. Add your courses when you are ready.'
      const reminderNote = remindersFailed
        ? ' Retry reminders in Settings.'
        : permission === 'denied'
          ? ' Notifications are blocked; you can enable them in device settings.'
          : permission === 'unsupported' ? ' Notifications are unavailable on this device.' : ''
      notify(`${confirmation}${reminderNote}`, reminderNote ? 'warn' : 'ok')
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'The device could not save your setup.'
      setError(`Setup was not saved. ${message}`)
      notify('Setup could not be saved. Your previous data is unchanged.', 'crit')
    } finally {
      saving.current = false
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={() => { if (!saving.current) setOpen(false) }}
      title="Set up Semester Desk"
      wide
      footer={
        step < 3 ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" size="lg" disabled={busy} onClick={advance}>
              Continue
            </Button>
            {step > 0 ? <Button disabled={busy} onClick={() => { setError(''); setStep(step - 1) }}>Back</Button> : null}
            <Button
              variant="quiet"
              className="ml-auto"
              disabled={busy}
              onClick={async () => {
                try {
                  await saveProfile({ onboarded: true })
                  sessionStorage.removeItem(RESTART_FLAG)
                  setOpen(false)
                } catch {
                  setError('The device could not save setup. Please retry.')
                }
              }}
            >
              Skip
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" size="lg" disabled={busy} onClick={() => void finish(true)}>
              {busy ? 'Saving…' : 'Allow reminders and finish'}
            </Button>
            <Button disabled={busy} onClick={() => void finish(false)}>
              Without reminders
            </Button>
            <Button disabled={busy} onClick={() => setStep(step - 1)}>Back</Button>
          </div>
        )
      }
    >
      <div className="mb-5 flex flex-wrap gap-1.5">
        {STEPS.map((s, i) => (
          <Badge key={s} tone={i === step ? 'accent' : i < step ? 'ok' : 'neutral'}>
            {i + 1} {s}
          </Badge>
        ))}
      </div>
      {error ? <p role="alert" className="mb-4 text-[13.5px] text-crit">{error}</p> : null}

      {step === 0 && (
        <>
          <p className="mb-4 text-[14px] text-ink-2">
            Your study data is saved on this device. AI features send the questions and files you
            choose to the configured AI provider. Cloud sync is optional.
          </p>
          <Row>
            <Field label="Your name" autoComplete="name" autoCapitalize="words" enterKeyHint="next" value={name} placeholder="Sarvesh" onChange={(e) => setName(e.target.value)} />
            <Field
              label="Institution"
              autoComplete="organization"
              enterKeyHint="next"
              value={institution}
              placeholder="College, Jaipur"
              onChange={(e) => setInstitution(e.target.value)}
            />
          </Row>
          <Row className="mt-3">
            <Field label="Term starts" type="date" value={termStart} onChange={(e) => setTermStart(e.target.value)} />
            <Field label="Term ends" type="date" value={termEnd} onChange={(e) => setTermEnd(e.target.value)} />
          </Row>
          <Field
            className="mt-3"
            label="Which semester is this?"
            value={semester}
            placeholder="Semester 5"
            hint="Courses are grouped by it, and CGPA is the credit-weighted mean across all of them."
            onChange={(e) => setSemester(e.target.value)}
          />
        </>
      )}

      {step === 1 && (
        <>
          <Row>
            <Select
              label="Grading scheme"
              value={scheme}
              onChange={(e) => setScheme(e.target.value as Profile['grading_scheme'])}
            >
              <option value="cgpa10">10-point CGPA</option>
              <option value="gpa4">4.0 GPA</option>
              <option value="percent">Straight percentage</option>
            </Select>
            <Select
              label="Attendance requirement"
              value={String(threshold)}
              onChange={(e) => setThreshold(Number(e.target.value))}
            >
              <option value="0.75">75% — standard</option>
              <option value="0.8">80%</option>
              <option value="0.85">85%</option>
              <option value="0.6">60%</option>
              <option value="0">No requirement</option>
            </Select>
          </Row>
          <label className="mt-4 block">
            <span className="mb-1 block text-[12.5px] font-medium text-ink-2">
              How much can you actually study on a normal day? — {Math.floor(capacity / 60)}h{' '}
              {capacity % 60 ? `${capacity % 60}m` : ''}
            </span>
            <input
              type="range"
              min={30}
              max={480}
              step={15}
              value={capacity}
              className="w-full accent-[color:var(--accent)]"
              onChange={(e) => setCapacity(Number(e.target.value))}
            />
            <span className="mt-1 block text-[11.5px] text-ink-3">
              Be honest rather than aspirational. The planner will never write a day past this, which
              is the whole reason it produces plans you can execute.
            </span>
          </label>
          <Note tone="accent" title="You can change all of this later">
            Settings has every grade band, threshold and capacity as an editable field.
          </Note>
        </>
      )}

      {step === 2 && (
        <>
          <p className="mb-3 text-[14px] text-ink-2">
            Your courses this semester. Code and credits are enough to start — everything else hangs
            off these.
          </p>
          <ul className="mb-3 space-y-2">
            {courses.map((c, i) => (
              <li key={i} className="grid grid-cols-[minmax(0,1fr)_74px_36px] gap-2 sm:flex">
                <input
                  className="field min-w-0 uppercase sm:w-[110px]"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  enterKeyHint="next"
                  aria-label={`Course ${i + 1} code`}
                  placeholder="CS301"
                  value={c.code}
                  onChange={(e) =>
                    setCourses(courses.map((x, j) => (i === j ? { ...x, code: e.target.value } : x)))
                  }
                />
                <input
                  className="field col-span-3 row-start-2 min-w-0 sm:flex-1"
                  autoCapitalize="words"
                  enterKeyHint="next"
                  aria-label={`Course ${i + 1} name`}
                  placeholder="Data Structures"
                  value={c.name}
                  onChange={(e) =>
                    setCourses(courses.map((x, j) => (i === j ? { ...x, name: e.target.value } : x)))
                  }
                />
                <input
                  className="field col-start-2 row-start-1 min-w-0 sm:w-[74px]"
                  inputMode="decimal"
                  enterKeyHint="done"
                  type="number"
                  min={0.5}
                  step={0.5}
                  aria-label={`Course ${i + 1} credits`}
                  value={c.credits}
                  onChange={(e) =>
                    setCourses(
                      courses.map((x, j) => (i === j ? { ...x, credits: Number(e.target.value) } : x)),
                    )
                  }
                />
                <Button
                  size="sm"
                  className="col-start-3 row-start-1"
                  aria-label={`Remove course ${i + 1}`}
                  onClick={() => setCourses(courses.filter((_, j) => j !== i))}
                >
                  <Trash2 size={13} />
                </Button>
              </li>
            ))}
          </ul>
          <Button size="sm" onClick={() => setCourses([...courses, { code: '', name: '', credits: 4 }])}>
            <Plus size={13} /> Another course
          </Button>

          <label className="mt-5 flex items-start gap-2.5">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 accent-[color:var(--accent)]"
              checked={wipeDemo}
              onChange={(e) => setWipeDemo(e.target.checked)}
            />
            <span>
              <span className="block text-[13.5px]">Start fresh and clear existing data</span>
              <span className="block text-[11.5px] text-ink-3">
                Deletes existing courses, deadlines, notes and other saved data on this device.
                Uncheck this to keep your data and add these courses to it.
              </span>
            </span>
          </label>
        </>
      )}

      {step === 3 && (
        <>
          <p className="mb-3 text-[14px] text-ink-2">
            The morning brief, deadline escalation and the Sunday review run on this device's own
            clock. The Android app can remind you when it is closed. Browser notifications work
            while the app is open. You can finish without enabling them.
          </p>
          <Note tone="accent" title="Defaults are deliberately quiet">
            Morning brief, deadline escalation and the Sunday review are on. Attendance nudges are
            off, because six notifications a day gets an app muted inside a week. All four are
            toggles in Settings.
          </Note>
        </>
      )}

    </Modal>
  )
}

/** Used by Settings to offer running it again. */
export async function restartOnboarding() {
  // An unnamed profile can still contain real courses added after skipping
  // setup. Explicit restarts must never preselect deleting that work.
  sessionStorage.setItem(RESTART_FLAG, '1')
  await saveProfile({ onboarded: false })
  await permissionState()
  window.location.reload()
}
