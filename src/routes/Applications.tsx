import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, ExternalLink, Plus, Trash2, UserPlus } from 'lucide-react'
import {
  Badge,
  Button,
  Card,
  Empty,
  Field,
  Modal,
  Note,
  PageHeader,
  Panel,
  Row,
  Select,
  Stat,
  TextArea,
} from '@/components/ui'
import {
  useApplicationEvents,
  useApplications,
  useContacts,
  useResumeVersions,
} from '@/hooks/data'
import { effortMinutes, funnel, health, isOpen, KINDS, STAGES } from '@/lib/pipeline'
import { dayKey, humanMinutes, prettyDateTime, relativeDue } from '@/lib/date'
import { dueTone } from '@/lib/priority'
import { patch, put, remove } from '@/db/mutate'
import { removeWithUndo } from '@/lib/undoable'
import { uid } from '@/lib/id'
import type { Application, ApplicationEvent, ApplicationStage, Contact } from '@/db/db'
import { useUi } from '@/store/ui'

const EVENT_KINDS = ['note', 'applied', 'test', 'interview', 'email sent', 'follow-up', 'result']

function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function ApplicationForm({ app, onDone }: { app?: Application; onDone: () => void }) {
  const notify = useUi((s) => s.notify)
  const versions = useResumeVersions()
  const [form, setForm] = useState<Application>(
    app ?? {
      id: uid(),
      user_id: null,
      updated_at: '',
      deleted_at: null,
      org: '',
      role: '',
      kind: 'internship',
      stage: 'sourced',
      deadline: null,
      link: '',
      note: '',
      resume_version_id: null,
      sop_status: 'none',
      lor_status: 'none',
    },
  )

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault()
        if (!form.org.trim()) return
        await put('applications', { ...form, org: form.org.trim(), role: form.role.trim() })
        if (app && app.stage !== form.stage) await put('application_events', {
          id: uid(), user_id: null, updated_at: '', deleted_at: null,
          application_id: form.id, at: new Date().toISOString(), kind: 'stage',
          note: `Moved to ${STAGES.find((stage) => stage.key === form.stage)?.label ?? form.stage}`,
        })
        notify(`${form.org} saved`)
        onDone()
      }}
    >
      <Row>
        <Field
          label="Organisation"
          required
          placeholder="Rakuten"
          value={form.org}
          onChange={(e) => setForm({ ...form, org: e.target.value })}
        />
        <Field
          label="Role or programme"
          placeholder="Summer SWE intern"
          value={form.role}
          onChange={(e) => setForm({ ...form, role: e.target.value })}
        />
      </Row>
      <Row className="mt-3">
        <Select
          label="Kind"
          value={form.kind}
          onChange={(e) => setForm({ ...form, kind: e.target.value as Application['kind'] })}
        >
          {KINDS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </Select>
        <Select
          label="Stage"
          value={form.stage}
          onChange={(e) => setForm({ ...form, stage: e.target.value as ApplicationStage })}
        >
          {STAGES.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </Select>
      </Row>
      <Row className="mt-3">
        <Field
          label="Deadline"
          type="datetime-local"
          value={toLocalInput(form.deadline)}
          hint="This lands in your main deadline queue."
          onChange={(e) =>
            setForm({ ...form, deadline: e.target.value ? new Date(e.target.value).toISOString() : null })
          }
        />
        <Field
          label="Link"
          type="url"
          placeholder="https://…"
          value={form.link}
          onChange={(e) => setForm({ ...form, link: e.target.value })}
        />
      </Row>

      <h4 className="mt-5 text-[13px] font-semibold text-ink-2">Documents</h4>
      <div className="mt-2 grid gap-3 sm:grid-cols-3">
        <Select
          label="CV sent"
          value={form.resume_version_id ?? ''}
          onChange={(e) => setForm({ ...form, resume_version_id: e.target.value || null })}
        >
          <option value="">Not sent</option>
          {versions.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </Select>
        <Select
          label="SOP"
          value={form.sop_status}
          onChange={(e) => setForm({ ...form, sop_status: e.target.value as Application['sop_status'] })}
        >
          <option value="none">Not started</option>
          <option value="draft">Draft</option>
          <option value="sent">Sent</option>
        </Select>
        <Select
          label="Recommendation"
          value={form.lor_status}
          onChange={(e) => setForm({ ...form, lor_status: e.target.value as Application['lor_status'] })}
        >
          <option value="none">Not asked</option>
          <option value="requested">Requested</option>
          <option value="received">Received</option>
        </Select>
      </div>

      <TextArea
        className="mt-3"
        label="Notes"
        rows={3}
        value={form.note}
        onChange={(e) => setForm({ ...form, note: e.target.value })}
      />

      <div className="mt-5 flex gap-2">
        <Button type="submit" variant="primary">
          Save
        </Button>
        <Button onClick={onDone}>Cancel</Button>
        {app ? (
          <Button
            variant="danger"
            className="ml-auto"
            onClick={async () => {
              await remove('applications', app.id)
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

function Timeline({ app }: { app: Application }) {
  const events = useApplicationEvents(app.id)
  const [kind, setKind] = useState('note')
  const [note, setNote] = useState('')

  return (
    <div>
      <form
        className="mb-3 flex flex-wrap gap-2"
        onSubmit={async (e) => {
          e.preventDefault()
          if (!note.trim()) return
          await put('application_events', {
            id: uid(),
            user_id: null,
            updated_at: '',
            deleted_at: null,
            application_id: app.id,
            at: new Date().toISOString(),
            kind,
            note: note.trim(),
          } as ApplicationEvent)
          setNote('')
        }}
      >
        <select
          className="field w-auto py-1 text-[13px]"
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          aria-label="Event kind"
        >
          {EVENT_KINDS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
        <input
          className="field flex-1 py-1 text-[13px]"
          enterKeyHint="done"
          autoCapitalize="sentences"
          placeholder="What happened?"
          aria-label="Timeline event note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <Button type="submit" size="sm" aria-label="Add timeline event">
          <Plus size={13} />
        </Button>
      </form>
      {events.length ? (
        <ul className="-my-1">
          {events.map((ev) => (
            <li key={ev.id} className="flex items-start gap-2 border-b border-rule py-2 text-[13px] last:border-0">
              <Badge>{ev.kind}</Badge>
              <span className="min-w-0 flex-1">{ev.note}</span>
              <span className="whitespace-nowrap font-mono text-[11px] text-ink-3">
                {prettyDateTime(ev.at)}
              </span>
              <button
                type="button"
                aria-label="Delete event"
                className="icon-btn icon-btn-danger"
                onClick={() => void removeWithUndo('application_events', ev.id, 'Event')}
              >
                <Trash2 size={12} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[13px] text-ink-3">
          Nothing logged. Every email and call goes here — three weeks of silence is what marks an
          application stale.
        </p>
      )}
    </div>
  )
}

function ContactForm({ contact, onDone }: { contact?: Contact; onDone: () => void }) {
  const [form, setForm] = useState<Contact>(
    contact ?? {
      id: uid(),
      user_id: null,
      updated_at: '',
      deleted_at: null,
      name: '',
      org: '',
      email: '',
      last_touch: null,
      follow_up_at: null,
      note: '',
    },
  )
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault()
        if (!form.name.trim()) return
        await put('contacts', form)
        onDone()
      }}
    >
      <Row>
        <Field
          label="Name"
          required
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
        <Field label="Organisation" value={form.org} onChange={(e) => setForm({ ...form, org: e.target.value })} />
      </Row>
      <Row className="mt-3">
        <Field
          label="Email"
          type="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
        <Field
          label="Follow up on"
          type="date"
          value={form.follow_up_at ? dayKey(form.follow_up_at) : ''}
          onChange={(e) =>
            setForm({ ...form, follow_up_at: e.target.value ? new Date(`${e.target.value}T00:00:00`).toISOString() : null })
          }
        />
      </Row>
      <TextArea
        className="mt-3"
        label="Context"
        rows={2}
        placeholder="Met at the campus talk; offered to review my SOP."
        value={form.note}
        onChange={(e) => setForm({ ...form, note: e.target.value })}
      />
      <div className="mt-5 flex gap-2">
        <Button type="submit" variant="primary">
          Save
        </Button>
        <Button onClick={onDone}>Cancel</Button>
        {contact ? (
          <Button
            variant="danger"
            className="ml-auto"
            aria-label="Delete contact"
            onClick={async () => {
              await remove('contacts', contact.id)
              onDone()
            }}
          >
            <Trash2 size={14} />
          </Button>
        ) : null}
      </div>
    </form>
  )
}

function DocDots({ app }: { app: Application }) {
  const dots: [string, boolean, string][] = [
    ['CV', Boolean(app.resume_version_id), 'CV sent'],
    ['SOP', app.sop_status === 'sent', `SOP ${app.sop_status}`],
    ['LOR', app.lor_status === 'received', `Recommendation ${app.lor_status}`],
  ]
  return (
    <span className="flex gap-1">
      {dots.map(([label, done, title]) => (
        <span
          key={label}
          title={title}
          className={
            done
              ? 'rounded border border-transparent bg-[color:var(--ok-soft)] px-1 font-mono text-[10px] text-ok'
              : 'rounded border border-rule px-1 font-mono text-[10px] text-ink-3'
          }
        >
          {label}
        </span>
      ))}
    </span>
  )
}

export default function Applications() {
  const apps = useApplications()
  const contacts = useContacts()
  const allEvents = useApplicationEvents()
  const [adding, setAdding] = useState(false)
  const [open, setOpen] = useState<Application | undefined>()
  const [editing, setEditing] = useState<Application | undefined>()
  const [addingContact, setAddingContact] = useState(false)
  const [editingContact, setEditingContact] = useState<Contact | undefined>()

  const lastEventAt = useMemo(() => {
    const m = new Map<string, string>()
    for (const e of allEvents) {
      const cur = m.get(e.application_id)
      if (!cur || e.at > cur) m.set(e.application_id, e.at)
    }
    return m
  }, [allEvents])

  const h = health(apps, lastEventAt)
  const columns = funnel(apps)
  const totalEffort = apps.filter(isOpen).reduce((s, a) => s + effortMinutes(a), 0)

  async function move(app: Application, dir: -1 | 1) {
    const i = STAGES.findIndex((s) => s.key === app.stage)
    const next = STAGES[Math.min(STAGES.length - 1, Math.max(0, i + dir))]
    if (next.key === app.stage) return
    await patch('applications', app.id, { stage: next.key })
    await put('application_events', {
      id: uid(),
      user_id: null,
      updated_at: '',
      deleted_at: null,
      application_id: app.id,
      at: new Date().toISOString(),
      kind: 'stage',
      note: `Moved to ${next.label}`,
    } as ApplicationEvent)
  }

  const dueContacts = contacts.filter(
    (c) => c.follow_up_at && new Date(c.follow_up_at) <= new Date(),
  )

  return (
    <>
      <PageHeader
        eyebrow="Career"
        title="Applications"
        lede="Internships, scholarships, universities and competitions on one board. Their deadlines merge into your main queue, so an SOP due Friday competes with a problem set on equal terms."
        action={
          <Button variant="primary" onClick={() => setAdding(true)}>
            <Plus size={15} /> Add application
          </Button>
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat value={h.open} label="Open" hint={`${humanMinutes(totalEffort)} of work left`} />
        <Stat value={h.offers} label="Offers" tone={h.offers ? 'ok' : undefined} />
        <Stat
          value={h.conversion === null ? '—' : `${Math.round(h.conversion * 100)}%`}
          label="Conversion"
          hint={`${h.offers + h.rejected} decided`}
        />
        <Stat
          value={h.urgent.length}
          label="Inside a week"
          tone={h.urgent.length ? 'crit' : undefined}
          hint={h.urgent.length ? h.urgent[0].org : 'nothing urgent'}
        />
      </div>

      {h.stale.length > 0 && (
        <Note tone="warn" title="Gone quiet">
          {h.stale.map((a) => (
            <p key={a.id} className="mb-1 last:mb-0">
              <b>{a.org}</b> — nothing logged in three weeks. A follow-up costs one email.
            </p>
          ))}
        </Note>
      )}

      {apps.length === 0 ? (
        <Empty
          title="Nothing in the pipeline"
          action={
            <Button variant="primary" onClick={() => setAdding(true)}>
              Add your first application
            </Button>
          }
        >
          Internships, scholarships, university programmes and competitions all live here — the board
          is the same for each.
        </Empty>
      ) : (
        <div className="-mx-4 overflow-x-auto px-4 pb-2">
          <div className="grid min-w-[900px] grid-cols-6 gap-3">
            {columns.map((col) => (
              <div key={col.stage}>
                <div className="mb-2 flex items-baseline gap-2 px-1">
                  <h3 className="text-[13px]">{col.label}</h3>
                  <span className="font-mono text-[11px] text-ink-3">{col.count}</span>
                </div>
                <ul className="space-y-2">
                  {apps
                    .filter((a) => a.stage === col.stage)
                    .map((a) => {
                      const rel = relativeDue(a.deadline)
                      return (
                        <Card as="li" key={a.id} className="p-2.5">
                          <button
                            type="button"
                            className="block w-full text-left"
                            onClick={() => setOpen(a)}
                          >
                            <b className="block text-[13px] leading-tight">{a.org}</b>
                            <span className="mt-0.5 block truncate text-[11.5px] text-ink-3">
                              {a.role || a.kind}
                            </span>
                          </button>
                          <div className="mt-2 flex items-center gap-1">
                            <DocDots app={a} />
                            {a.deadline ? (
                              <Badge className="ml-auto" tone={dueTone(rel.days)}>
                                {rel.label}
                              </Badge>
                            ) : null}
                          </div>
                          {isOpen(a) && (
                            <div className="mt-2 flex gap-1">
                              <Button
                                size="sm"
                                className="flex-1 !px-1"
                                aria-label="Move back a stage"
                                disabled={a.stage === STAGES[0].key}
                                onClick={() => void move(a, -1)}
                              >
                                <ChevronLeft size={12} />
                              </Button>
                              <Button
                                size="sm"
                                className="flex-1 !px-1"
                                aria-label="Move forward a stage"
                                onClick={() => void move(a, 1)}
                              >
                                <ChevronRight size={12} />
                              </Button>
                            </div>
                          )}
                        </Card>
                      )
                    })}
                  {col.count === 0 && (
                    <li className="rounded border border-dashed border-rule px-2 py-4 text-center text-[11.5px] text-ink-3">
                      Empty
                    </li>
                  )}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      <Panel
        className="mt-6"
        title="Contacts and follow-ups"
        sub={dueContacts.length ? `${dueContacts.length} due` : undefined}
        action={
          <Button size="sm" onClick={() => setAddingContact(true)}>
            <UserPlus size={13} /> Add
          </Button>
        }
      >
        {contacts.length ? (
          <ul className="-my-1">
            {contacts.map((c) => {
              const due = c.follow_up_at && new Date(c.follow_up_at) <= new Date()
              return (
                <li
                  key={c.id}
                  className="flex flex-wrap items-center gap-2 border-b border-rule py-2.5 text-[13.5px] last:border-0"
                >
                  <button
                    type="button"
                    className="tap-text font-semibold hover:text-accent"
                    onClick={() => setEditingContact(c)}
                  >
                    {c.name}
                  </button>
                  <span className="text-ink-3">{c.org}</span>
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-3">{c.note}</span>
                  {c.follow_up_at ? (
                    <Badge tone={due ? 'crit' : 'neutral'}>
                      {due ? 'follow up now' : `follow up ${relativeDue(c.follow_up_at).label}`}
                    </Badge>
                  ) : null}
                  <Button
                    size="sm"
                    onClick={() =>
                      void patch('contacts', c.id, {
                        last_touch: new Date().toISOString(),
                        follow_up_at: new Date(Date.now() + 14 * 864e5).toISOString(),
                      })
                    }
                  >
                    Touched
                  </Button>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="text-[13.5px] text-ink-3">
            Who you spoke to, when, and when to nudge again. The people who write your recommendations
            live here.
          </p>
        )}
      </Panel>

      <Modal open={adding} onClose={() => setAdding(false)} title="Add application" wide>
        <ApplicationForm onDone={() => setAdding(false)} />
      </Modal>

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(undefined)}
        title={editing ? `Edit ${editing.org}` : ''}
        wide
      >
        {editing ? <ApplicationForm app={editing} onDone={() => setEditing(undefined)} /> : null}
      </Modal>

      <Modal
        open={Boolean(open)}
        onClose={() => setOpen(undefined)}
        title={open ? `${open.org} — ${open.role || open.kind}` : ''}
        wide
      >
        {open ? (
          <>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <Badge tone="accent">{STAGES.find((s) => s.key === open.stage)?.label}</Badge>
              <Badge>{open.kind}</Badge>
              {open.deadline ? (
                <Badge tone={dueTone(relativeDue(open.deadline).days)}>
                  {relativeDue(open.deadline).label}
                </Badge>
              ) : null}
              <DocDots app={open} />
              {open.link ? (
                <a
                  href={open.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-auto inline-flex items-center gap-1 text-[12.5px] text-accent"
                >
                  Open posting <ExternalLink size={12} />
                </a>
              ) : null}
            </div>
            {open.note ? (
              <p className="mb-4 whitespace-pre-wrap text-[13.5px] text-ink-2">{open.note}</p>
            ) : null}
            {isOpen(open) && (
              <Note tone="accent" title="Still to do">
                About {humanMinutes(effortMinutes(open))} of work: {open.sop_status === 'sent' ? '' : 'the SOP, '}
                {open.resume_version_id ? '' : 'a tailored CV, '}
                {open.lor_status === 'received' ? '' : 'the recommendation, '}
                then the form itself.
              </Note>
            )}
            <h4 className="mb-2 mt-4 text-[13px] font-semibold text-ink-2">Timeline</h4>
            <Timeline app={open} />
            <div className="mt-5 flex gap-2">
              <Button
                variant="primary"
                onClick={() => {
                  setEditing(open)
                  setOpen(undefined)
                }}
              >
                Edit
              </Button>
              <Button onClick={() => setOpen(undefined)}>Close</Button>
            </div>
          </>
        ) : null}
      </Modal>

      <Modal open={addingContact} onClose={() => setAddingContact(false)} title="Add contact">
        <ContactForm onDone={() => setAddingContact(false)} />
      </Modal>
      <Modal
        open={Boolean(editingContact)}
        onClose={() => setEditingContact(undefined)}
        title={editingContact ? editingContact.name : ''}
      >
        {editingContact ? (
          <ContactForm contact={editingContact} onDone={() => setEditingContact(undefined)} />
        ) : null}
      </Modal>
    </>
  )
}
