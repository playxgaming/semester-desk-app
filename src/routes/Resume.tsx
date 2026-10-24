import { useEffect, useMemo, useState } from 'react'
import { Copy, FileDown, Plus, Printer, Trash2 } from 'lucide-react'
import { Badge, Button, Card, Check, Empty, Field, Modal, Note, PageHeader, Panel, Row, Select } from '@/components/ui'
import { useProfile, useResumeItems, useResumeVersions } from '@/hooks/data'
import { buildResume, dateRange, ITEM_KINDS, resumeDocx, resumeMarkdown } from '@/lib/resume'
import { download, downloadBytes } from '@/lib/backup'
import { patch, put, remove } from '@/db/mutate'
import { uid } from '@/lib/id'
import type { ResumeItem, ResumeVersion } from '@/db/db'
import { useUi } from '@/store/ui'

function ItemForm({ item, onDone }: { item?: ResumeItem; onDone: () => void }) {
  const notify = useUi((s) => s.notify)
  const [form, setForm] = useState<ResumeItem>(
    item ?? {
      id: uid(),
      user_id: null,
      updated_at: '',
      deleted_at: null,
      kind: 'project',
      title: '',
      org: '',
      start: null,
      end: null,
      bullets: [''],
    },
  )

  function setBullet(i: number, value: string) {
    setForm({ ...form, bullets: form.bullets.map((b, j) => (i === j ? value : b)) })
  }

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault()
        if (!form.title.trim()) return
        if (form.start && form.end && form.end < form.start) {
          notify('The end month must be on or after the start month.', 'warn')
          return
        }
        await put('resume_items', { ...form, title: form.title.trim(), bullets: form.bullets.map((b) => b.trim()).filter(Boolean) })
        notify('Saved to your record')
        onDone()
      }}
    >
      <Row>
        <Select
          label="Kind"
          value={form.kind}
          onChange={(e) => setForm({ ...form, kind: e.target.value as ResumeItem['kind'] })}
        >
          {ITEM_KINDS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </Select>
        <Field
          label="Organisation or stack"
          placeholder="Next.js · Supabase"
          value={form.org}
          onChange={(e) => setForm({ ...form, org: e.target.value })}
        />
      </Row>
      <Field
        className="mt-3"
        label="Title"
        required
        placeholder="Rokda.io — multiplayer price-guessing game"
        value={form.title}
        onChange={(e) => setForm({ ...form, title: e.target.value })}
      />
      <Row className="mt-3">
        <Field
          label="Started"
          type="month"
          max={form.end?.slice(0, 7)}
          value={form.start?.slice(0, 7) ?? ''}
          onChange={(e) => setForm({ ...form, start: e.target.value ? `${e.target.value}-01` : null })}
        />
        <Field
          label="Ended"
          type="month"
          min={form.start?.slice(0, 7)}
          hint="Leave empty for ongoing."
          value={form.end?.slice(0, 7) ?? ''}
          onChange={(e) => setForm({ ...form, end: e.target.value ? `${e.target.value}-01` : null })}
        />
      </Row>

      <div className="mt-4">
        <span className="mb-1 block text-[12.5px] font-medium text-ink-2">Bullets</span>
        <p className="mb-2 text-[11.5px] text-ink-3">
          Write what you did and what it changed. A number in the line does more work than an adjective.
        </p>
        {form.bullets.map((b, i) => (
          <div key={i} className="mb-2 flex gap-2">
            <input
              className="field"
              value={b}
              placeholder="Cut cold-start time from 4s to 900ms by…"
              onChange={(e) => setBullet(i, e.target.value)}
            />
            <Button
              size="sm"
              aria-label="Remove bullet"
              onClick={() => setForm({ ...form, bullets: form.bullets.filter((_, j) => j !== i) })}
            >
              <Trash2 size={13} />
            </Button>
          </div>
        ))}
        <Button size="sm" onClick={() => setForm({ ...form, bullets: [...form.bullets, ''] })}>
          <Plus size={13} /> Add bullet
        </Button>
      </div>

      <div className="mt-5 flex gap-2">
        <Button type="submit" variant="primary">
          Save
        </Button>
        <Button onClick={onDone}>Cancel</Button>
        {item ? (
          <Button
            variant="danger"
            className="ml-auto"
            onClick={async () => {
              await remove('resume_items', item.id)
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

export default function Resume() {
  const profile = useProfile()
  const items = useResumeItems()
  const versions = useResumeVersions()
  const notify = useUi((s) => s.notify)
  const [versionId, setVersionId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<ResumeItem | undefined>()

  useEffect(() => {
    if ((!versionId || !versions.some((version) => version.id === versionId)) && versions.length) setVersionId(versions[0].id)
  }, [versions, versionId])

  const version = versions.find((v) => v.id === versionId) ?? null
  const doc = useMemo(() => (version ? buildResume(version, items) : null), [version, items])

  async function newVersion() {
    const v: ResumeVersion = {
      id: uid(),
      user_id: null,
      updated_at: '',
      deleted_at: null,
      name: versions.length ? `Version ${versions.length + 1}` : 'General',
      item_ids: items.map((i) => i.id),
      target_role: '',
    }
    await put('resume_versions', v)
    setVersionId(v.id)
  }

  async function toggleItem(id: string) {
    if (!version) return
    const has = version.item_ids.includes(id)
    await patch('resume_versions', version.id, {
      item_ids: has ? version.item_ids.filter((x) => x !== id) : [...version.item_ids, id],
    })
  }

  return (
    <>
      <PageHeader
        eyebrow="Career"
        title="Resume"
        lede="One structured record of everything you have done, and several versions cut from it. Bullets come from the log, not from memory at 2am the night before a deadline."
        action={
          <div className="flex gap-2">
            <Button onClick={() => setAdding(true)}>
              <Plus size={15} /> Add item
            </Button>
            <Button variant="primary" onClick={() => void newVersion()}>
              New version
            </Button>
          </div>
        }
      />

      {items.length === 0 ? (
        <Empty
          title="Nothing on record yet"
          action={
            <Button variant="primary" onClick={() => setAdding(true)}>
              Add your first item
            </Button>
          }
        >
          Add experience, projects, education and awards once. Every version of your CV is then a
          selection from this list rather than a rewrite.
        </Empty>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
          <div className="space-y-4">
            <Panel title="Versions" sub={`${versions.length}`}>
              {versions.length ? (
                <>
                  <Select
                    aria-label="Version"
                    value={versionId ?? ''}
                    onChange={(e) => setVersionId(e.target.value)}
                  >
                    {versions.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                  </Select>
                  {version ? (
                    <>
                      <Field
                        className="mt-3"
                        label="Name"
                        value={version.name}
                        onChange={(e) => void patch('resume_versions', version.id, { name: e.target.value })}
                      />
                      <Field
                        className="mt-3"
                        label="Target role"
                        placeholder="Backend intern, Japan"
                        value={version.target_role}
                        hint="Shown under your name and used to name the export."
                        onChange={(e) =>
                          void patch('resume_versions', version.id, { target_role: e.target.value })
                        }
                      />
                      <Button
                        size="sm"
                        variant="danger"
                        className="mt-3"
                        onClick={async () => {
                          await remove('resume_versions', version.id)
                          setVersionId(null)
                        }}
                      >
                        <Trash2 size={13} /> Delete version
                      </Button>
                    </>
                  ) : null}
                </>
              ) : (
                <p className="text-[13.5px] text-ink-3">
                  A version is a selection of items plus a target role.{' '}
                  <button type="button" className="text-accent" onClick={() => void newVersion()}>
                    Create one
                  </button>
                  .
                </p>
              )}
            </Panel>

            <Panel title="Your record" sub={`${items.length} items`}>
              <ul className="-my-1">
                {items.map((i) => {
                  const included = version?.item_ids.includes(i.id) ?? false
                  return (
                    <li
                      key={i.id}
                      className="flex items-start gap-2 border-b border-rule py-2.5 text-[13.5px] last:border-0"
                    >
                      <Check
                        className="mt-3"
                        checked={included}
                        disabled={!version}
                        label={`Include ${i.title}`}
                        onChange={() => void toggleItem(i.id)}
                      />
                      <button
                        type="button"
                        className="tap-text min-w-0 flex-1"
                        onClick={() => setEditing(i)}
                      >
                        <span className="block truncate font-medium">{i.title}</span>
                        <span className="block truncate text-[11.5px] text-ink-3">
                          {i.kind} · {i.org || 'no org'} · {i.bullets.length} bullet
                          {i.bullets.length === 1 ? '' : 's'}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </Panel>
          </div>

          <div>
            {doc && version ? (
              <>
                <div className="no-print mb-3 flex flex-wrap gap-2">
                  <Button variant="primary" onClick={() => window.print()}>
                    <Printer size={14} /> Print / PDF
                  </Button>
                  <Button
                    onClick={() => {
                      const bytes = resumeDocx(doc, profile)
                      const safe = (version.target_role || version.name).replace(/[^\w-]+/g, '-')
                      downloadBytes(
                        `${(profile.name || 'resume').replace(/\s+/g, '-')}-${safe}.docx`,
                        bytes,
                        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                      )
                      notify('DOCX downloaded')
                    }}
                  >
                    <FileDown size={14} /> DOCX
                  </Button>
                  <Button
                    onClick={() => {
                      download(`${version.name.replace(/\s+/g, '-')}.md`, resumeMarkdown(doc, profile), 'text/markdown')
                    }}
                  >
                    <FileDown size={14} /> Markdown
                  </Button>
                  <Button
                    onClick={async () => {
                      try {
                        if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable')
                        await navigator.clipboard.writeText(resumeMarkdown(doc, profile))
                        notify('Copied as markdown')
                      } catch {
                        notify('Clipboard access is unavailable. Use Markdown to download a copy instead.', 'warn')
                      }
                    }}
                  >
                    <Copy size={14} /> Copy
                  </Button>
                  <Badge className="self-center">{doc.items.length} items included</Badge>
                </div>

                {!profile.name && (
                  <Note tone="warn" title="No name set">
                    Add your name in Settings — it is what the exports put at the top.
                  </Note>
                )}

                <Card className="print-root p-8">
                  <h2 className="text-[24px] leading-tight">{profile.name || 'Your name'}</h2>
                  <p className="mb-6 text-[13px] text-ink-3">
                    {[profile.institution, version.target_role].filter(Boolean).join(' · ') ||
                      'Set your institution in Settings'}
                  </p>
                  {doc.sections.length ? (
                    doc.sections.map((section) => (
                      <section key={section.heading} className="mb-6 last:mb-0">
                        <h3 className="mb-3 border-b border-rule pb-1 text-[11px] uppercase tracking-[0.12em] text-ink-3">
                          {section.heading}
                        </h3>
                        {section.items.map((item) => (
                          <article key={item.id} className="mb-4 last:mb-0">
                            <div className="flex flex-wrap items-baseline gap-x-2">
                              <b className="text-[14px]">{item.title}</b>
                              {item.org ? <span className="text-[13px] text-ink-2">— {item.org}</span> : null}
                              <span className="ml-auto font-mono text-[11.5px] text-ink-3">
                                {dateRange(item)}
                              </span>
                            </div>
                            {item.bullets.filter(Boolean).length ? (
                              <ul className="mt-1 list-disc pl-5 text-[13px] text-ink-2">
                                {item.bullets.filter(Boolean).map((b, i) => (
                                  <li key={i} className="mb-0.5">
                                    {b}
                                  </li>
                                ))}
                              </ul>
                            ) : null}
                          </article>
                        ))}
                      </section>
                    ))
                  ) : (
                    <p className="text-[13.5px] text-ink-3">
                      Nothing selected. Tick items on the left to build this version.
                    </p>
                  )}
                </Card>
              </>
            ) : (
              <Card className="p-8">
                <Empty title="No version selected">
                  Create a version, then tick the items that belong in it.
                </Empty>
              </Card>
            )}
          </div>
        </div>
      )}

      <Modal open={adding} onClose={() => setAdding(false)} title="Add to your record" wide>
        <ItemForm onDone={() => setAdding(false)} />
      </Modal>
      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(undefined)}
        title={editing ? editing.title : ''}
        wide
      >
        {editing ? <ItemForm item={editing} onDone={() => setEditing(undefined)} /> : null}
      </Modal>
    </>
  )
}
