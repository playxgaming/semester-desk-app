import { useEffect, useMemo, useState } from 'react'
import { Layers, Pause, Play, Plus, Printer, Trash2 } from 'lucide-react'
import {
  Bar as RBar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  Badge,
  Button,
  Card,
  Dot,
  Empty,
  Modal,
  Note,
  PageHeader,
  Panel,
  Row,
  Select,
  Stat,
  TextArea,
} from '@/components/ui'
import { AXIS, ChartTooltip, heatStep } from '@/components/charts'
import { Markdown } from '@/components/Markdown'
import { plainPreview } from '@/lib/markdown'
import { useCards, useCourseMap, useCourses, useReviews, useTopics } from '@/hooks/data'
import { expandCloze, GRADE_LABELS, intervalLabel, isDue, previewIntervals, retention, schedule, type Grade } from '@/lib/srs'
import { addDays, dayKey, humanMinutes } from '@/lib/date'
import { patch, put} from '@/db/mutate'
import { removeWithUndo } from '@/lib/undoable'
import { uid } from '@/lib/id'
import type { Card as CardRow } from '@/db/db'
import { useUi } from '@/store/ui'
import { tap } from '@/lib/haptics'

function AddCards({ onDone }: { onDone: () => void }) {
  const courses = useCourses()
  const topics = useTopics()
  const notify = useUi((s) => s.notify)
  const [courseId, setCourseId] = useState(courses[0]?.id ?? '')
  const [topicId, setTopicId] = useState('')
  const [front, setFront] = useState('')
  const [back, setBack] = useState('')
  const [cloze, setCloze] = useState('')
  const [isFormula, setIsFormula] = useState(false)

  const clozePreview = useMemo(() => expandCloze(cloze), [cloze])
  const courseTopics = topics.filter((t) => t.course_id === courseId)

  async function write(pairs: { front: string; back: string }[]) {
    for (const p of pairs) {
      await put('cards', {
        id: uid(),
        user_id: null,
        updated_at: '',
        deleted_at: null,
        course_id: courseId || null,
        topic_id: topicId || null,
        front: p.front,
        back: p.back,
        ease: 2.5,
        interval: 0,
        reps: 0,
        due_at: new Date().toISOString(),
        lapses: 0,
        suspended: false,
        is_formula: isFormula,
      })
    }
    notify(`${pairs.length} card${pairs.length === 1 ? '' : 's'} added`)
    onDone()
  }

  return (
    <div>
      <Row>
        <Select label="Course" value={courseId} onChange={(e) => { setCourseId(e.target.value); setTopicId('') }}>
          <option value="">No course</option>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.code}
            </option>
          ))}
        </Select>
        <Select label="Topic" value={topicId} onChange={(e) => setTopicId(e.target.value)}>
          <option value="">No topic</option>
          {courseTopics.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </Select>
      </Row>

      <label className="mt-3 flex items-center gap-2 text-[13px] text-ink-2">
        <input
          type="checkbox"
          checked={isFormula}
          className="h-4 w-4 accent-[color:var(--accent)]"
          onChange={(e) => setIsFormula(e.target.checked)}
        />
        Tag as a formula — these assemble into the printable formula sheet
      </label>

      <h4 className="mt-5 text-[13px] font-semibold text-ink-2">One card</h4>
      <TextArea
        className="mt-2"
        label="Front"
        rows={2}
        value={front}
        placeholder="Variance of a binomial $X \sim B(n,p)$?"
        onChange={(e) => setFront(e.target.value)}
      />
      <TextArea
        className="mt-2"
        label="Back"
        rows={2}
        value={back}
        placeholder="$\operatorname{Var}(X) = np(1-p)$"
        onChange={(e) => setBack(e.target.value)}
      />
      <Button
        className="mt-2"
        variant="primary"
        disabled={!front.trim() || !back.trim()}
        onClick={() => void write([{ front, back }])}
      >
        Add card
      </Button>

      <h4 className="mt-6 text-[13px] font-semibold text-ink-2">Or a cloze paragraph</h4>
      <p className="mb-2 text-[12.5px] text-ink-3">
        Wrap what should be hidden: <code className="font-mono">{'{{c1::…}}'}</code>. Each distinct
        number becomes its own card, so one paragraph is five cards.
      </p>
      <TextArea
        rows={3}
        value={cloze}
        placeholder="A deadlock needs {{c1::mutual exclusion}}, {{c2::hold and wait}}, {{c3::no preemption}} and {{c4::circular wait}}."
        onChange={(e) => setCloze(e.target.value)}
      />
      {clozePreview.length > 0 && (
        <p className="mt-2 text-[12.5px] text-ink-3">
          Makes {clozePreview.length} cards. First one: “{clozePreview[0].front}”
        </p>
      )}
      <Button
        className="mt-2"
        variant="primary"
        disabled={!clozePreview.length}
        onClick={() => void write(clozePreview)}
      >
        Add {clozePreview.length || ''} cloze cards
      </Button>
    </div>
  )
}

function Session({ queue, onExit }: { queue: CardRow[]; onExit: () => void }) {
  const [index, setIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [done, setDone] = useState(0)
  const [again, setAgain] = useState<CardRow[]>([])
  const notify = useUi((s) => s.notify)

  const list = useMemo(() => [...queue, ...again], [queue, again])
  const card = list[index]

  async function answer(g: Grade) {
    if (!card) return
    const next = schedule(card, g)
    await patch('cards', card.id, {
      ease: next.ease,
      interval: next.interval,
      reps: next.reps,
      lapses: next.lapses,
      due_at: next.due_at,
    })
    await put('reviews', {
      id: uid(),
      user_id: null,
      updated_at: '',
      deleted_at: null,
      card_id: card.id,
      at: new Date().toISOString(),
      grade: g,
      prev_interval: card.interval,
      next_interval: next.interval,
    })
    if (g === 0) setAgain((a) => (a.some((c) => c.id === card.id) ? a : [...a, card]))
    setDone((d) => d + 1)
    setRevealed(false)
    setIndex((i) => i + 1)
  }

  /** Not now: push it to tomorrow and move on, without touching its ease. */
  async function bury() {
    if (!card) return
    await patch('cards', card.id, { due_at: addDays(new Date(), 1).toISOString() })
    notify(`Buried until tomorrow`, 'warn', async () => {
      await patch('cards', card.id, { due_at: card.due_at })
    })
    setRevealed(false)
    setIndex((i) => i + 1)
  }

  /** Not ever, for now: a card that is wrong, duplicated, or off the syllabus. */
  async function suspend() {
    if (!card) return
    await patch('cards', card.id, { suspended: true })
    notify('Card suspended', 'warn', async () => {
      await patch('cards', card.id, { suspended: false })
    })
    setRevealed(false)
    setIndex((i) => i + 1)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        if (!revealed) setRevealed(true)
        else void answer(2)
      }
      if (revealed && ['1', '2', '3', '4'].includes(e.key)) {
        e.preventDefault()
        void answer((Number(e.key) - 1) as Grade)
      }
      if (e.key === 'Escape') onExit()
      if (e.key === '-') {
        e.preventDefault()
        void bury()
      }
      if (e.key === '!') {
        e.preventDefault()
        void suspend()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  })

  if (!card) {
    return (
      <Card className="p-8 text-center">
        <h2 className="mb-2 text-[20px]">Session finished</h2>
        <p className="mb-5 text-[14px] text-ink-2">
          {done} reviews. Anything you pressed <b>Again</b> on came back before the end, which is the
          point.
        </p>
        <Button
          variant="primary"
          onClick={() => {
            notify(`${done} cards reviewed`)
            onExit()
          }}
        >
          Back to decks
        </Button>
      </Card>
    )
  }

  const preview = previewIntervals(card)
  const progress = done / Math.max(1, list.length)

  return (
    <Card className="overflow-hidden">
      <div className="h-1 bg-surface-2">
        <div className="h-full bg-accent transition-[width]" style={{ width: `${progress * 100}%` }} />
      </div>
      <div className="flex items-center gap-2 border-b border-rule px-4 py-2 text-[11.5px] text-ink-3">
        <span className="font-mono">
          {done + 1} / {list.length}
        </span>
        <span>· ease {card.ease.toFixed(2)}</span>
        {card.lapses > 0 ? <span>· {card.lapses} lapses</span> : null}
        <button
          type="button"
          className="tap-link ml-auto !text-ink-3 hover:!text-ink"
          onClick={() => void bury()}
          title="Skip this card until tomorrow"
        >
          Bury
        </button>
        <button
          type="button"
          className="tap-link !text-ink-3 hover:!text-ink"
          onClick={() => void suspend()}
          title="Take this card out of rotation until you bring it back"
        >
          Suspend
        </button>
        <button type="button" className="tap-link !text-ink-3 hover:!text-ink" onClick={onExit}>
          Exit
        </button>
      </div>

      <div className="px-5 py-8 text-center" aria-live="polite">
        <Markdown className="mx-auto max-w-[62ch] text-[17px]" source={card.front} />
        {revealed ? (
          <>
            <hr className="mx-auto my-6 w-16 border-rule-2" />
            <Markdown className="mx-auto max-w-[62ch] text-[16px] text-ink-2" source={card.back} />
          </>
        ) : null}
      </div>

      <div className="border-t border-rule bg-surface-2 p-3">
        {revealed ? (
          <div className="grid grid-cols-4 gap-2">
            {([0, 1, 2, 3] as Grade[]).map((g) => (
              <Button
                key={g}
                variant={g === 2 ? 'primary' : 'ghost'}
                onClick={() => {
                  void answer(g)
                  void tap()
                }}
                className="min-h-[56px] flex-col !px-1 !py-2"
              >
                <span>{GRADE_LABELS[g]}</span>
                <span className="font-mono text-[10.5px] opacity-70">
                  {intervalLabel(preview[g])}
                </span>
              </Button>
            ))}
          </div>
        ) : (
          <Button variant="primary" className="w-full" onClick={() => setRevealed(true)}>
            Show answer <span className="ml-1 font-mono text-[11px] opacity-70">space</span>
          </Button>
        )}
      </div>
    </Card>
  )
}

export default function Review() {
  const cards = useCards()
  const reviews = useReviews()
  const courses = useCourses()
  const byId = useCourseMap()
  const [filter, setFilter] = useState('')
  const [adding, setAdding] = useState(false)
  const [running, setRunning] = useState(false)
  const [showFormulas, setShowFormulas] = useState(false)

  const pool = filter ? cards.filter((c) => c.course_id === filter) : cards
  const due = pool.filter((c) => isDue(c))
  const stats = retention(reviews)

  const last30 = Array.from({ length: 30 }, (_, i) => dayKey(addDays(new Date(), -(29 - i))))
  const byDay = new Map(stats.byDay.map((d) => [d.date, d]))
  const chart = last30.map((d) => ({ date: d.slice(5), count: byDay.get(d)?.count ?? 0 }))
  const maxDay = Math.max(1, ...chart.map((c) => c.count))

  const weakest = useMemo(() => {
    const m = new Map<string, { card: CardRow; fails: number }>()
    for (const r of reviews) {
      if (r.grade > 0) continue
      const card = cards.find((c) => c.id === r.card_id)
      if (!card) continue
      const e = m.get(card.id) ?? { card, fails: 0 }
      e.fails += 1
      m.set(card.id, e)
    }
    return [...m.values()].sort((a, b) => b.fails - a.fails).slice(0, 5)
  }, [reviews, cards])

  const formulas = cards.filter((c) => c.is_formula)

  if (running) {
    return (
      <>
        <PageHeader eyebrow="Study engine" title="Review" />
        <Session queue={due} onExit={() => setRunning(false)} />
      </>
    )
  }

  return (
    <>
      <PageHeader
        eyebrow="Study engine"
        title="Review"
        lede="SM-2 with lapse tracking and real LaTeX. Space reveals, 1–4 grade, Esc exits — the whole session is keyboard-driven because speed is the entire point."
        action={
          <div className="flex gap-2">
            <Button onClick={() => setAdding(true)}>
              <Plus size={15} /> Add cards
            </Button>
            <Button variant="primary" disabled={!due.length} onClick={() => setRunning(true)}>
              <Layers size={15} /> Review {due.length}
            </Button>
          </div>
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat value={due.length} label="Due now" hint={`${pool.length} cards in scope`} />
        <Stat
          value={stats.retention === null ? '—' : `${Math.round(stats.retention * 100)}%`}
          label="Retention"
          hint={`${stats.reviews} reviews logged`}
          tone={stats.retention !== null && stats.retention < 0.8 ? 'warn' : 'ok'}
        />
        <Stat
          value={cards.filter((c) => c.lapses > 0).length}
          label="Cards with lapses"
          hint="the ones that keep coming back"
        />
        <Stat
          value={humanMinutes(due.length * 0.4)}
          label="Estimated session"
          hint="about 25 seconds a card"
        />
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <Button size="sm" variant={filter ? 'ghost' : 'primary'} onClick={() => setFilter('')}>
          All decks
        </Button>
        {courses.map((c) => (
          <Button
            key={c.id}
            size="sm"
            variant={filter === c.id ? 'primary' : 'ghost'}
            onClick={() => setFilter(c.id)}
          >
            <Dot colour={c.colour} /> {c.code}
            <span className="font-mono text-[11px] opacity-70">
              {cards.filter((x) => x.course_id === c.id && isDue(x)).length}
            </span>
          </Button>
        ))}
      </div>

      {cards.length === 0 ? (
        <Empty
          title="No cards yet"
          action={
            <Button variant="primary" onClick={() => setAdding(true)}>
              Add your first cards
            </Button>
          }
        >
          Write them as you study, or paste a paragraph with cloze markers and get five cards from it.
        </Empty>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Review activity" sub="last 30 days">
            <div className="h-[150px] min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart} margin={{ top: 4, right: 4, bottom: 0, left: -22 }}>
                  <CartesianGrid vertical={false} stroke="var(--rule)" />
                  <XAxis dataKey="date" interval={6} {...AXIS} />
                  <YAxis allowDecimals={false} {...AXIS} />
                  <Tooltip
                    cursor={{ fill: 'var(--surface-2)' }}
                    content={<ChartTooltip format={(v) => `${v} reviews`} />}
                  />
                  <RBar
                    dataKey="count"
                    fill="var(--accent)"
                    radius={[3, 3, 0, 0]}
                    maxBarSize={10}
                    isAnimationActive={false}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 flex flex-wrap gap-[3px]" role="img" aria-label="Review heatmap, last 30 days">
              {last30.map((d) => {
                const v = byDay.get(d)?.count ?? 0
                const s = heatStep(v, maxDay)
                return (
                  <span
                    key={d}
                    title={`${d}: ${s.label}`}
                    className="h-4 w-4 rounded-[2px] border border-rule"
                    style={{ background: s.background }}
                  />
                )
              })}
            </div>
          </Panel>

          <Panel
            title="Topics you keep failing"
            sub="from the review log, not a guess"
            action={
              formulas.length ? (
                <Button size="sm" onClick={() => setShowFormulas(true)}>
                  <Printer size={13} /> Formula sheet
                </Button>
              ) : undefined
            }
          >
            {weakest.length ? (
              <ul className="-my-1">
                {weakest.map(({ card, fails }) => (
                  <li
                    key={card.id}
                    className="flex items-center gap-3 border-b border-rule py-2.5 text-[13.5px] last:border-0"
                  >
                    {card.course_id ? <Dot colour={byId.get(card.course_id)?.colour ?? '#888'} /> : null}
                    <span className="min-w-0 flex-1 truncate">{card.front.replace(/\$/g, '')}</span>
                    <Badge tone="crit">{fails} fails</Badge>
                    <button
                      type="button"
                      aria-label="Suspend card"
                      className="icon-btn"
                      onClick={() => void patch('cards', card.id, { suspended: !card.suspended })}
                    >
                      {card.suspended ? <Play size={13} /> : <Pause size={13} />}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13.5px] text-ink-3">
                Nothing failing yet. Once you have review history, the cards you keep missing rank here
                and the planner treats their topics as weak.
              </p>
            )}
          </Panel>

          <Panel title="All cards" sub={`${pool.length}`} className="lg:col-span-2">
            <ul className="-my-1 max-h-[420px] overflow-y-auto">
              {pool.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center gap-3 border-b border-rule py-2.5 text-[13.5px] last:border-0"
                >
                  {c.course_id ? <Dot colour={byId.get(c.course_id)?.colour ?? '#888'} /> : null}
                  <span className="min-w-0 flex-1 truncate">{plainPreview(c.front, 80)}</span>
                  {c.is_formula ? <Badge tone="accent">formula</Badge> : null}
                  <Badge tone={c.suspended ? 'neutral' : isDue(c) ? 'warn' : 'neutral'}>
                    {c.suspended ? 'suspended' : isDue(c) ? 'due' : intervalLabel(c.interval)}
                  </Badge>
                  <button
                    type="button"
                    aria-label={c.suspended ? `Bring back: ${plainPreview(c.front, 40)}` : `Suspend: ${plainPreview(c.front, 40)}`}
                    title={c.suspended ? 'Bring this card back into rotation' : 'Take this card out of rotation'}
                    className="icon-btn"
                    onClick={() => void patch('cards', c.id, { suspended: !c.suspended })}
                  >
                    {c.suspended ? <Play size={13} /> : <Pause size={13} />}
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete card: ${plainPreview(c.front, 40)}`}
                    className="icon-btn icon-btn-danger"
                    onClick={() => void removeWithUndo('cards', c.id, 'Card')}
                  >
                    <Trash2 size={13} />
                  </button>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      )}

      <Modal open={adding} onClose={() => setAdding(false)} title="Add cards" wide>
        <AddCards onDone={() => setAdding(false)} />
      </Modal>

      <Modal open={showFormulas} onClose={() => setShowFormulas(false)} title="Formula sheet" wide>
        <Note tone="accent">
          Assembled from every card tagged as a formula. Print this the night before.
        </Note>
        <ul className="space-y-3">
          {formulas.map((f) => (
            <li key={f.id} className="border-b border-rule pb-3 last:border-0">
              <div className="mb-1 text-[12.5px] text-ink-3">
                {f.course_id ? byId.get(f.course_id)?.code : 'General'}
              </div>
              <Markdown source={f.front} />
              <Markdown className="text-ink-2" source={f.back} />
            </li>
          ))}
        </ul>
        <Button className="mt-4" onClick={() => window.print()}>
          <Printer size={14} /> Print
        </Button>
      </Modal>
    </>
  )
}
