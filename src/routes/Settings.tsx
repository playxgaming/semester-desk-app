import { useEffect, useRef, useState } from 'react'
import { Download, Upload } from 'lucide-react'
import {
  Badge,
  Button,
  Card,
  Field,
  Note,
  PageHeader,
  Panel,
  Row,
  Select,
  Stat,
} from '@/components/ui'
import { useProfile } from '@/hooks/data'
import { saveProfile } from '@/db/mutate'
import { DEFAULT_GRADE_BANDS, type GradeBand, type Profile } from '@/db/db'
import { download, exportCsvBundle, exportJson, importJson } from '@/lib/backup'
import { wipeEverything } from '@/db/seed'
import { humanMinutes } from '@/lib/date'
import { useUi } from '@/store/ui'
import { restartOnboarding } from '@/components/Onboarding'
import { useAttachmentTotals } from '@/components/Attachments'
import { humanBytes } from '@/db/files'
import {
  fireTest,
  isNative,
  NOTIFY_LABELS,
  permissionState,
  requestPermission,
  type NotifyKind,
  type PermissionState,
} from '@/lib/notify'
import { reschedule } from '@/lib/scheduler'
import { COUNTRIES, fetchHolidays } from '@/lib/holidays'
import { useExceptions } from '@/hooks/data'
import { put } from '@/db/mutate'
import { uid } from '@/lib/id'

const GPA4_BANDS: GradeBand[] = [
  { min_pct: 90, letter: 'A', points: 4 },
  { min_pct: 85, letter: 'A-', points: 3.7 },
  { min_pct: 80, letter: 'B+', points: 3.3 },
  { min_pct: 75, letter: 'B', points: 3 },
  { min_pct: 70, letter: 'B-', points: 2.7 },
  { min_pct: 65, letter: 'C+', points: 2.3 },
  { min_pct: 60, letter: 'C', points: 2 },
  { min_pct: 50, letter: 'D', points: 1 },
  { min_pct: 0, letter: 'F', points: 0 },
]

export default function Settings() {
  const profile = useProfile()
  const notify = useUi((s) => s.notify)
  const fileRef = useRef<HTMLInputElement>(null)
  const exceptions = useExceptions()
  const totals = useAttachmentTotals()
  const [permission, setPermission] = useState<PermissionState>('prompt')
  const [scheduled, setScheduled] = useState(0)
  const [country, setCountry] = useState('IN')
  const [year, setYear] = useState(new Date().getFullYear())
  const [busy, setBusy] = useState(false)
  const native = isNative()

  useEffect(() => {
    void permissionState().then(async (state) => {
      setPermission(state)
      if (state === 'granted') {
        const n = await reschedule()
        setScheduled(n.scheduled)
      }
    })
  }, [])

  const existingHolidays = new Set(
    exceptions.filter((e) => e.kind === 'holiday').map((e) => e.date),
  )
  const notifyState =
    permission === 'granted'
      ? native
        ? `${scheduled} scheduled`
        : 'browser: only while open'
      : permission === 'denied'
        ? 'blocked'
        : 'off'

  function setBand(i: number, changes: Partial<GradeBand>) {
    const bands = profile.grade_bands.map((b, j) => (i === j ? { ...b, ...changes } : b))
    void saveProfile({ grade_bands: bands })
  }

  function applyScheme(scheme: Profile['grading_scheme']) {
    void saveProfile({
      grading_scheme: scheme,
      grade_bands: scheme === 'gpa4' ? GPA4_BANDS : DEFAULT_GRADE_BANDS,
    })
  }

  return (
    <>
      <PageHeader
        eyebrow="System"
        title="Settings"
        lede="Grading rules, capacity and your data. Everything here is stored on this device first; sync is optional and off until you configure a project."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="You">
          <Row>
            <Field
              label="Name"
              value={profile.name}
              onChange={(e) => void saveProfile({ name: e.target.value })}
            />
            <Field
              label="Institution"
              value={profile.institution}
              onChange={(e) => void saveProfile({ institution: e.target.value })}
            />
          </Row>
          <Row className="mt-3">
            <Field
              label="Term starts"
              type="date"
              value={profile.term_start}
              onChange={(e) => void saveProfile({ term_start: e.target.value })}
            />
            <Field
              label="Term ends"
              type="date"
              value={profile.term_end}
              onChange={(e) => void saveProfile({ term_end: e.target.value })}
            />
          </Row>
          <Field
            className="mt-3"
            label="Current semester"
            value={profile.current_semester}
            hint="New courses land here. CGPA is the credit-weighted mean across every semester."
            onChange={(e) => void saveProfile({ current_semester: e.target.value })}
          />
          <Row className="mt-3">
            <Select
              label="Theme"
              value={profile.theme}
              onChange={(e) => void saveProfile({ theme: e.target.value as Profile['theme'] })}
            >
              <option value="system">Follow the system</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </Select>
            <Select
              label="Default attendance threshold"
              value={String(profile.attendance_threshold)}
              onChange={(e) => void saveProfile({ attendance_threshold: Number(e.target.value) })}
            >
              <option value="0.75">75% — standard Indian requirement</option>
              <option value="0.8">80%</option>
              <option value="0.85">85%</option>
              <option value="0.6">60%</option>
              <option value="0">No requirement</option>
            </Select>
          </Row>
          <label className="mt-4 block">
            <span className="mb-1 block text-[12.5px] font-medium text-ink-2">
              Daily study capacity — {humanMinutes(profile.daily_capacity_min)}
            </span>
            <input
              type="range"
              min={30}
              max={480}
              step={15}
              value={profile.daily_capacity_min}
              className="w-full accent-[color:var(--accent)]"
              onChange={(e) => void saveProfile({ daily_capacity_min: Number(e.target.value) })}
            />
            <span className="mt-1 block text-[11.5px] text-ink-3">
              The ceiling the planner will never write past. Be honest rather than aspirational.
            </span>
          </label>
        </Panel>

        <Panel title="Grading scheme" sub={profile.grading_scheme}>
          <div className="mb-4 flex gap-1">
            {(['cgpa10', 'gpa4', 'percent'] as const).map((s) => (
              <Button
                key={s}
                size="sm"
                variant={profile.grading_scheme === s ? 'primary' : 'ghost'}
                onClick={() => applyScheme(s)}
              >
                {s === 'cgpa10' ? '10-point CGPA' : s === 'gpa4' ? '4.0 GPA' : 'Percentage'}
              </Button>
            ))}
          </div>
          <p className="mb-3 text-[13px] text-ink-2">
            SGPA is the credit-weighted mean of the grade points below; CGPA is the same across
            semesters. Edit any row if your university's table differs.
          </p>
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-rule">
                <th className="pb-2 text-left text-[10.5px] uppercase tracking-[0.09em] text-ink-3">
                  From %
                </th>
                <th className="pb-2 text-left text-[10.5px] uppercase tracking-[0.09em] text-ink-3">
                  Letter
                </th>
                <th className="pb-2 text-left text-[10.5px] uppercase tracking-[0.09em] text-ink-3">
                  Points
                </th>
              </tr>
            </thead>
            <tbody>
              {profile.grade_bands.map((b, i) => (
                <tr key={`${b.letter}-${i}`} className="border-b border-rule last:border-0">
                  <td className="py-1 pr-2">
                    <input
                      className="field w-[74px] py-1 font-mono text-[12.5px]"
                      type="number"
                      inputMode="decimal"
                      enterKeyHint="done"
                      value={b.min_pct}
                      onChange={(e) => setBand(i, { min_pct: Number(e.target.value) })}
                    />
                  </td>
                  <td className="py-1 pr-2">
                    <input
                      className="field w-[70px] py-1 font-mono text-[12.5px]"
                      autoCapitalize="characters"
                      autoCorrect="off"
                      enterKeyHint="done"
                      value={b.letter}
                      onChange={(e) => setBand(i, { letter: e.target.value })}
                    />
                  </td>
                  <td className="py-1">
                    <input
                      className="field w-[74px] py-1 font-mono text-[12.5px]"
                      type="number"
                      inputMode="decimal"
                      enterKeyHint="done"
                      step="0.1"
                      value={b.points}
                      onChange={(e) => setBand(i, { points: Number(e.target.value) })}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        <Panel title="Notifications" sub={notifyState}>
          {permission === 'granted' ? (
            <>
              <p className="mb-3 text-[13.5px] text-ink-2">
                {native
                  ? `${scheduled} reminders are on this device's alarm clock. They fire with the app closed, offline, with no account behind them.`
                  : 'A browser tab cannot schedule anything for when it is closed, so in the browser these only fire while the app is open. The Android build is where this feature actually lives.'}
              </p>
              <div className="space-y-2">
                {(Object.keys(NOTIFY_LABELS) as NotifyKind[]).map((kind) => {
                  const on = profile.notify?.[kind] ?? (kind !== 'attendance')
                  return (
                    <label key={kind} className="flex items-start gap-2.5">
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 accent-[color:var(--accent)]"
                        checked={on}
                        onChange={() =>
                          void saveProfile({ notify: { ...profile.notify, [kind]: !on } })
                        }
                      />
                      <span>
                        <span className="block text-[13.5px]">{NOTIFY_LABELS[kind].label}</span>
                        <span className="block text-[11.5px] text-ink-3">{NOTIFY_LABELS[kind].detail}</span>
                      </span>
                    </label>
                  )
                })}
              </div>
              <Row className="mt-4">
                <Field
                  label="Morning brief at"
                  type="time"
                  value={profile.brief_time}
                  onChange={(e) => void saveProfile({ brief_time: e.target.value })}
                />
                <div className="grid grid-cols-2 gap-2">
                  <Field
                    label="Quiet from"
                    type="time"
                    value={profile.quiet_hours[0]}
                    onChange={(e) =>
                      void saveProfile({ quiet_hours: [e.target.value, profile.quiet_hours[1]] })
                    }
                  />
                  <Field
                    label="until"
                    type="time"
                    value={profile.quiet_hours[1]}
                    onChange={(e) =>
                      void saveProfile({ quiet_hours: [profile.quiet_hours[0], e.target.value] })
                    }
                  />
                </div>
              </Row>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  variant="primary"
                  onClick={async () => {
                    const n = await reschedule()
                    notify(
                      n.native
                        ? `${n.scheduled} reminders scheduled`
                        : 'Scheduling needs the Android build — nothing was set',
                      n.native ? 'ok' : 'warn',
                    )
                    setScheduled(n.scheduled)
                  }}
                >
                  Reschedule now
                </Button>
                <Button
                  onClick={async () => {
                    const ok = await fireTest('Semester Desk', 'This is what a reminder looks like.')
                    if (!ok) notify('Could not fire a test notification', 'warn')
                  }}
                >
                  Send a test
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="mb-3 text-[13.5px] text-ink-2">
                The morning brief, deadline escalation and the Sunday review all run on this device —
                no push service, no server, nothing to sign up for. They need one permission.
              </p>
              <Button
                variant="primary"
                disabled={permission === 'unsupported'}
                onClick={async () => {
                  const state = await requestPermission()
                  setPermission(state)
                  if (state === 'granted') {
                    const n = await reschedule()
                    setScheduled(n.scheduled)
                  }
                }}
              >
                {permission === 'denied' ? 'Blocked — enable in system settings' : 'Allow notifications'}
              </Button>
            </>
          )}
        </Panel>

        <Panel title="Public holidays" sub="the one optional network call">
          <p className="mb-3 text-[13.5px] text-ink-2">
            Fills your timetable exceptions for the year so no class is counted on a day nobody
            taught. It uses a free public API with no key and no account, and it is the only request
            this app ever makes. Nothing else breaks if it fails.
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <Select
              className="w-[150px]"
              label="Country"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
            >
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </Select>
            <Field
              className="w-[110px]"
              label="Year"
              type="number"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
            />
            <Button
              disabled={busy}
              onClick={async () => {
                setBusy(true)
                try {
                  const res = await fetchHolidays(country, year)
                  if (!res.ok) {
                    notify(res.message, 'warn')
                    return
                  }
                  let added = 0
                  for (const h of res.holidays) {
                    if (existingHolidays.has(h.date)) continue
                    await put('timetable_exceptions', {
                      id: uid(),
                      user_id: null,
                      updated_at: '',
                      deleted_at: null,
                      slot_id: null,
                      date: h.date,
                      kind: 'holiday',
                      new_start: null,
                      new_end: null,
                      note: h.name,
                    })
                    added += 1
                  }
                  notify(
                    added
                      ? `${added} holidays added for ${year}`
                      : `Already had every ${year} holiday`,
                  )
                } finally {
                  setBusy(false)
                }
              }}
            >
              {busy ? 'Fetching…' : 'Import holidays'}
            </Button>
          </div>
        </Panel>

        <Panel title="Your data">
          <div className="mb-4 grid grid-cols-2 gap-3">
            <Stat value="100%" label="Stored locally" hint="on this device, nowhere else" />
            <Stat
              value={totals.files ? humanBytes(totals.bytes) : '0 B'}
              label="Attached files"
              hint={`${totals.files} file${totals.files === 1 ? '' : 's'} — not included in the JSON export`}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={async () => {
                const b = await exportJson()
                download(`semester-desk-${b.exported_at.slice(0, 10)}.json`, JSON.stringify(b, null, 2))
                notify('Backup downloaded')
              }}
            >
              <Download size={14} /> Export JSON
            </Button>
            <Button
              onClick={async () => {
                const csv = await exportCsvBundle()
                download(`semester-desk-${new Date().toISOString().slice(0, 10)}.csv`, csv, 'text/csv')
              }}
            >
              <Download size={14} /> Export CSV
            </Button>
            <Button onClick={() => fileRef.current?.click()}>
              <Upload size={14} /> Import
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0]
                if (!file) return
                try {
                  const r = await importJson(await file.text())
                  notify(`Imported ${r.rows} rows across ${r.tables} tables`)
                } catch (err) {
                  notify(err instanceof Error ? err.message : 'Import failed', 'crit')
                }
                e.target.value = ''
              }}
            />
          </div>

          <div className="mt-4 border-t border-rule pt-3">
            <p className="mb-2 text-[13px] text-ink-2">
              Want to start over with your own courses? The setup wizard clears the demo semester and
              walks through grading, capacity and courses again.
            </p>
            <Button size="sm" onClick={() => void restartOnboarding()}>
              Run setup again
            </Button>
          </div>

          <Note tone="crit" title="Danger zone">
            <p className="mb-2">
              Clearing wipes every table on this device, including the demo semester. There is no undo
              — export first.
            </p>
            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                if (window.confirm('Delete everything stored on this device?')) void wipeEverything()
              }}
            >
              Reset and start empty
            </Button>
          </Note>
        </Panel>
      </div>

      <Card className="mt-6 p-4 text-[13px] text-ink-2">
        <b className="mb-1 block font-display text-[14px] text-ink">What is built, and what is next</b>
        <p className="mb-2">
          Phases 0–2 and 5 are here: foundations, the academic core, the study engine, and the career
          and money modules. Phase 3 is the Claude proxy — an Edge Function that holds the API key
          server-side; the function and its SQL are in <code className="chip">supabase/</code>, waiting
          on a key. Phase 4 is notifications; phase 6 is hardening.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {['0 Foundations', '1 Academic core', '2 Study engine', '5 Career & money'].map((p) => (
            <Badge key={p} tone="ok">
              {p} ✓
            </Badge>
          ))}
          {['3 AI layer', '4 Notifications', '6 Hardening'].map((p) => (
            <Badge key={p}>{p}</Badge>
          ))}
        </div>
      </Card>
    </>
  )
}
