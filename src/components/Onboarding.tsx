import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Badge, Button, Field, Modal, Note, Row, Select } from '@/components/ui'
import { useProfile } from '@/hooks/data'
import { put, saveProfile } from '@/db/mutate'
import { uid } from '@/lib/id'
import { db, DEFAULT_GRADE_BANDS, type Profile } from '@/db/db'
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

export function Onboarding() {
  const profile = useProfile()
  const notify = useUi((s) => s.notify)
  const [step, setStep] = useState(0)
  const [open, setOpen] = useState(true)
  const [busy, setBusy] = useState(false)

  const [name, setName] = useState(profile.name)
  const [institution, setInstitution] = useState(profile.institution)
  const [termStart, setTermStart] = useState(profile.term_start)
  const [termEnd, setTermEnd] = useState(profile.term_end)
  const [scheme, setScheme] = useState<Profile['grading_scheme']>(profile.grading_scheme)
  const [threshold, setThreshold] = useState(profile.attendance_threshold)
  const [capacity, setCapacity] = useState(profile.daily_capacity_min)
  const [semester, setSemester] = useState(profile.current_semester)
  const [courses, setCourses] = useState<Draft[]>([{ code: '', name: '', credits: 4 }])
  const [wipeDemo, setWipeDemo] = useState(true)

  if (profile.onboarded || !open) return null

  const validCourses = courses.filter((c) => c.code.trim())

  async function finish(withReminders: boolean) {
    setBusy(true)
    try {
      if (wipeDemo) {
        // clear the demo semester, keep the profile
        await Promise.all([
          db.courses.clear(),
          db.timetable_slots.clear(),
          db.attendance.clear(),
          db.assessments.clear(),
          db.topics.clear(),
          db.tasks.clear(),
          db.sessions.clear(),
          db.cards.clear(),
          db.reviews.clear(),
          db.notes.clear(),
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
          semester,
        })
      }

      await saveProfile({
        name: name.trim(),
        institution: institution.trim(),
        term_start: termStart,
        term_end: termEnd,
        grading_scheme: scheme,
        grade_bands: DEFAULT_GRADE_BANDS,
        current_semester: semester,
        attendance_threshold: threshold,
        daily_capacity_min: capacity,
        onboarded: true,
      })

      if (withReminders) {
        const state = await requestPermission()
        if (state === 'granted') await reschedule()
      }

      setOpen(false)
      notify(
        validCourses.length
          ? `Set up with ${validCourses.length} courses. Add your timetable next.`
          : 'Set up. Add your courses when you are ready.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={() => setOpen(false)}
      title="Set up Semester Desk"
      wide
      footer={
        step < 3 ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" size="lg" onClick={() => setStep(step + 1)}>
              Continue
            </Button>
            {step > 0 ? <Button onClick={() => setStep(step - 1)}>Back</Button> : null}
            <Button
              variant="quiet"
              className="ml-auto"
              onClick={async () => {
                await saveProfile({ onboarded: true })
                setOpen(false)
              }}
            >
              Skip
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" size="lg" disabled={busy} onClick={() => void finish(true)}>
              Allow reminders and finish
            </Button>
            <Button disabled={busy} onClick={() => void finish(false)}>
              Without reminders
            </Button>
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

      {step === 0 && (
        <>
          <p className="mb-4 text-[14px] text-ink-2">
            Everything stays on this device. No account, no server, nothing leaves the phone — so
            none of this is being sent anywhere.
          </p>
          <Row>
            <Field label="Your name" value={name} placeholder="Sarvesh" onChange={(e) => setName(e.target.value)} />
            <Field
              label="Institution"
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
              <li key={i} className="flex gap-2">
                <input
                  className="field w-[110px] uppercase"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  enterKeyHint="next"
                  placeholder="CS301"
                  value={c.code}
                  onChange={(e) =>
                    setCourses(courses.map((x, j) => (i === j ? { ...x, code: e.target.value } : x)))
                  }
                />
                <input
                  className="field flex-1"
                  autoCapitalize="words"
                  enterKeyHint="next"
                  placeholder="Data Structures"
                  value={c.name}
                  onChange={(e) =>
                    setCourses(courses.map((x, j) => (i === j ? { ...x, name: e.target.value } : x)))
                  }
                />
                <input
                  className="field w-[74px]"
                  inputMode="decimal"
                  enterKeyHint="done"
                  type="number"
                  min={0}
                  step={0.5}
                  aria-label="Credits"
                  value={c.credits}
                  onChange={(e) =>
                    setCourses(
                      courses.map((x, j) => (i === j ? { ...x, credits: Number(e.target.value) } : x)),
                    )
                  }
                />
                <Button
                  size="sm"
                  aria-label="Remove course"
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
              <span className="block text-[13.5px]">Clear the demo semester</span>
              <span className="block text-[11.5px] text-ink-3">
                Removes the five sample courses and everything attached to them. Leave it ticked
                unless you want to keep poking at the demo.
              </span>
            </span>
          </label>
        </>
      )}

      {step === 3 && (
        <>
          <p className="mb-3 text-[14px] text-ink-2">
            The morning brief, deadline escalation and the Sunday review run on this device's own
            clock. There is no push service and no server — which is why they keep working offline,
            and why nothing about you is sent anywhere.
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
  await saveProfile({ onboarded: false })
  await permissionState()
  window.location.reload()
}
