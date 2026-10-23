import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Eye, History, Layers, Pencil, Pin, Plus, Search, Trash2 } from 'lucide-react'
import { Badge, Button, Card, Dot, Empty, Modal, PageHeader, Select } from '@/components/ui'
import { CardExtractor } from '@/components/CardExtractor'
import { Markdown } from '@/components/Markdown'
import { useCourseMap, useCourses, useNotes, useTopics } from '@/hooks/data'
import { plainPreview } from '@/lib/markdown'
import { patch, put } from '@/db/mutate'
import { listVersions, restoreVersion, saveNote } from '@/db/history'
import { removeWithUndo } from '@/lib/undoable'
import { uid } from '@/lib/id'
import { prettyDateTime } from '@/lib/date'
import type { Note as NoteRow } from '@/db/db'
import { useUi } from '@/store/ui'

export default function Notes() {
  const notes = useNotes()
  const courses = useCourses()
  const topics = useTopics()
  const byId = useCourseMap()
  const notify = useUi((s) => s.notify)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState<'write' | 'read'>('read')
  const [draft, setDraft] = useState('')
  const [title, setTitle] = useState('')
  const [extracting, setExtracting] = useState(false)
  const [history, setHistory] = useState(false)

  const selected = notes.find((n) => n.id === selectedId) ?? null

  useEffect(() => {
    if (selected) {
      setDraft(selected.body_md)
      setTitle(selected.title)
    }
  }, [selectedId, selected?.updated_at]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selectedId && notes.length) setSelectedId(notes[0].id)
  }, [notes, selectedId])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return notes
    return notes.filter(
      (n) => n.title.toLowerCase().includes(q) || n.body_md.toLowerCase().includes(q),
    )
  }, [notes, query])

  async function create() {
    const n: NoteRow = {
      id: uid(),
      user_id: null,
      updated_at: '',
      deleted_at: null,
      course_id: courses[0]?.id ?? null,
      topic_id: null,
      title: 'Untitled note',
      body_md: '',
      pinned: false,
    }
    await put('notes', n)
    setSelectedId(n.id)
    setMode('write')
  }

  async function save() {
    if (!selected) return
    const { snapshot } = await saveNote(selected.id, { title, body_md: draft })
    notify(snapshot ? 'Note saved — the previous version is in History' : 'Note saved')
  }

  // Ctrl/Cmd+S saves, Ctrl/Cmd+E toggles the editor
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void save()
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'e') {
        e.preventDefault()
        setMode((m) => (m === 'write' ? 'read' : 'write'))
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  })

  return (
    <>
      <PageHeader
        eyebrow="Study engine"
        title="Notes"
        lede="Markdown with real LaTeX, attached to a course and topic, searchable. Math is lifted out before anything else parses the text, so $a_1$ stays a subscript."
        action={
          <Button variant="primary" onClick={() => void create()}>
            <Plus size={15} /> New note
          </Button>
        }
      />

      {notes.length === 0 ? (
        <Empty
          title="No notes yet"
          action={
            <Button variant="primary" onClick={() => void create()}>
              Write your first note
            </Button>
          }
        >
          Notes belong to a course and topic, so the planner and the review analytics can point at them
          later.
        </Empty>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
          <div>
            <div className="relative mb-3">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
              <input
                className="field pl-8"
                type="search"
                inputMode="search"
                enterKeyHint="search"
                autoCorrect="off"
                placeholder="Search notes…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <ul className="space-y-1.5">
              {filtered.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedId(n.id)
                      setMode('read')
                    }}
                    className={`w-full rounded border px-3 py-2 text-left transition ${
                      n.id === selectedId
                        ? 'border-accent bg-accent-soft'
                        : 'border-rule bg-surface hover:border-rule-2'
                    }`}
                  >
                    <span className="flex items-center gap-1.5">
                      {n.course_id ? <Dot colour={byId.get(n.course_id)?.colour ?? '#888'} /> : null}
                      <b className="min-w-0 flex-1 truncate text-[13.5px] font-semibold">{n.title}</b>
                      {n.pinned ? <Pin size={11} className="text-accent" /> : null}
                    </span>
                    <span className="mt-0.5 block truncate text-[11.5px] text-ink-3">
                      {plainPreview(n.body_md, 60) || 'Empty'}
                    </span>
                  </button>
                </li>
              ))}
              {!filtered.length && (
                <li className="px-3 py-4 text-center text-[13px] text-ink-3">
                  Nothing matches “{query}”.
                </li>
              )}
            </ul>
          </div>

          {selected ? (
            <Card className="min-w-0 p-4">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                {/* The title takes the whole first line on a phone; the
                    actions wrap under it rather than squeezing it to nothing. */}
                <input
                  className="field w-full flex-1 basis-full border-0 px-0 text-[17px] font-bold shadow-none sm:w-auto sm:basis-auto"
                  style={{ fontFamily: 'Bricolage Grotesque, sans-serif' }}
                  value={title}
                  autoCapitalize="sentences"
                  enterKeyHint="done"
                  onChange={(e) => setTitle(e.target.value)}
                  onBlur={() => void save()}
                  aria-label="Note title"
                />
                <Button
                  size="sm"
                  onClick={() => setMode(mode === 'write' ? 'read' : 'write')}
                  title="Ctrl/Cmd + E"
                >
                  {mode === 'write' ? <Eye size={13} /> : <Pencil size={13} />}
                  {mode === 'write' ? 'Preview' : 'Edit'}
                </Button>
                <Button
                  size="sm"
                  disabled={!draft.trim()}
                  onClick={() => setExtracting(true)}
                  title="Pull flashcards out of this note"
                >
                  <Layers size={13} /> Make cards
                </Button>
                <Button
                  size="sm"
                  onClick={() => void patch('notes', selected.id, { pinned: !selected.pinned })}
                  title="Pin"
                >
                  <Pin size={13} />
                </Button>
                <Button size="sm" onClick={() => setHistory(true)} title="Earlier versions of this note">
                  <History size={13} />
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={async () => {
                    await removeWithUndo('notes', selected.id, selected.title)
                    setSelectedId(null)
                  }}
                >
                  <Trash2 size={13} />
                </Button>
              </div>

              <div className="mb-3 flex flex-wrap gap-2">
                <Select
                  className="w-auto"
                  value={selected.course_id ?? ''}
                  aria-label="Course"
                  onChange={(e) =>
                    void patch('notes', selected.id, {
                      course_id: e.target.value || null,
                      topic_id: null,
                    })
                  }
                >
                  <option value="">No course</option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code}
                    </option>
                  ))}
                </Select>
                <Select
                  className="w-auto"
                  value={selected.topic_id ?? ''}
                  aria-label="Topic"
                  onChange={(e) =>
                    void patch('notes', selected.id, { topic_id: e.target.value || null })
                  }
                >
                  <option value="">No topic</option>
                  {topics
                    .filter((t) => t.course_id === selected.course_id)
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                </Select>
                <Badge className="self-center">edited {prettyDateTime(selected.updated_at)}</Badge>
              </div>

              {mode === 'write' ? (
                <>
                  <textarea
                    className="field min-h-[380px] font-mono text-[13.5px] leading-relaxed"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={() => void save()}
                    placeholder={'# Heading\n\nInline math like $E = mc^2$, display math with $$…$$, **bold**, lists, tables.'}
                  />
                  <div className="mt-2 flex items-center gap-2">
                    <Button variant="primary" size="sm" onClick={() => void save()}>
                      Save
                    </Button>
                    <span className="text-[11.5px] text-ink-3">
                      Ctrl/Cmd + S saves · Ctrl/Cmd + E toggles preview
                    </span>
                  </div>
                </>
              ) : selected.body_md.trim() ? (
                <Markdown source={selected.body_md} />
              ) : (
                <p className="py-8 text-center text-[13.5px] text-ink-3">
                  Empty note.{' '}
                  <button type="button" className="text-accent" onClick={() => setMode('write')}>
                    Start writing
                  </button>
                  .
                </p>
              )}
            </Card>
          ) : (
            <Card className="p-8">
              <Empty title="Pick a note">Choose one on the left, or start a new one.</Empty>
            </Card>
          )}
        </div>
      )}

      <Modal
        open={extracting}
        onClose={() => setExtracting(false)}
        title={selected ? `Cards from “${selected.title}”` : 'Make cards'}
        wide
      >
        {selected ? (
          <CardExtractor
            markdown={draft}
            courseId={selected.course_id}
            topicId={selected.topic_id}
            onDone={() => setExtracting(false)}
          />
        ) : null}
      </Modal>

      <Modal
        open={history}
        onClose={() => setHistory(false)}
        title={selected ? `History of “${selected.title}”` : 'History'}
        wide
      >
        {selected ? <NoteHistory note={selected} onClose={() => setHistory(false)} /> : null}
      </Modal>
    </>
  )
}

/**
 * Earlier bodies of a note. A snapshot is kept when a save lands more than a
 * few minutes after the last one, so this is a list of editing sessions
 * rather than of keystrokes.
 */
function NoteHistory({ note, onClose }: { note: NoteRow; onClose: () => void }) {
  const notify = useUi((s) => s.notify)
  const versions = useLiveQuery(async () => listVersions(note.id), [note.id, note.updated_at]) ?? []
  const [open, setOpen] = useState<string | null>(null)

  if (!versions.length) {
    return (
      <p className="text-[13.5px] text-ink-2">
        Nothing yet. A version is kept the first time you save after a gap of five minutes or more,
        which is what makes this a list of drafts rather than of keystrokes.
      </p>
    )
  }

  return (
    <ul className="-my-1">
      {versions.map((v) => (
        <li key={v.id} className="border-b border-rule py-3 last:border-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13.5px]">{prettyDateTime(v.at)}</span>
            <Badge>{v.body_md.split(/\s+/).filter(Boolean).length} words</Badge>
            <Button
              size="sm"
              className="ml-auto"
              onClick={() => setOpen(open === v.id ? null : v.id)}
            >
              {open === v.id ? 'Hide' : 'Read'}
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={async () => {
                await restoreVersion(v)
                notify('Note restored — the version you replaced was kept too')
                onClose()
              }}
            >
              Restore
            </Button>
          </div>
          {open === v.id ? (
            <div className="mt-3 max-h-[40vh] overflow-y-auto rounded border border-rule bg-surface-2 p-3">
              <Markdown source={v.body_md} />
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  )
}
