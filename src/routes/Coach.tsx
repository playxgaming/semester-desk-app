import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, ChevronRight, Scissors, X } from 'lucide-react'
import {
  Badge,
  Bar,
  Button,
  Card,
  Dot,
  Empty,
  Note,
  PageHeader,
  Panel,
  Select,
  Stat,
} from '@/components/ui'
import { Markdown } from '@/components/Markdown'
import {
  useAssessments,
  useAttendance,
  useCards,
  useCourseMap,
  useCourses,
  useProfile,
  useReviews,
  useSessions,
  useTasks,
  useTopics,
} from '@/hooks/data'
import { critique, weeklyReview, type Severity } from '@/lib/insights'
import { buildQuiz, gradeQuiz, plainify, type Question } from '@/lib/quiz'
import { humanMinutes, prettyDay } from '@/lib/date'
import { patch } from '@/db/mutate'
import { useUi } from '@/store/ui'

const TONE: Record<Severity, 'ok' | 'warn' | 'crit'> = {
  good: 'ok',
  watch: 'warn',
  urgent: 'crit',
}

function Review() {
  const profile = useProfile()
  const courses = useCourses()
  const attendance = useAttendance()
  const assessments = useAssessments()
  const tasks = useTasks()
  const topics = useTopics()
  const sessions = useSessions()
  const cards = useCards()
  const reviews = useReviews()

  const r = useMemo(
    () =>
      weeklyReview({
        profile,
        courses,
        attendance,
        assessments,
        tasks,
        topics,
        sessions,
        cards,
        reviews,
      }),
    [profile, courses, attendance, assessments, tasks, topics, sessions, cards, reviews],
  )

  return (
    <>
      <Note tone={r.findings[0]?.severity === 'urgent' ? 'crit' : 'accent'} title={`${prettyDay(r.from)} to ${prettyDay(r.to)}`}>
        {r.verdict}
      </Note>

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          value={humanMinutes(r.numbers.studiedMin)}
          label="Studied"
          hint={r.numbers.plannedMin ? `of ${humanMinutes(r.numbers.plannedMin)} planned` : 'nothing planned'}
        />
        <Stat
          value={r.numbers.adherence === null ? '—' : `${Math.round(r.numbers.adherence * 100)}%`}
          label="Plan adherence"
          tone={
            r.numbers.adherence === null
              ? undefined
              : r.numbers.adherence < 0.6
                ? 'crit'
                : r.numbers.adherence < 0.85
                  ? 'warn'
                  : 'ok'
          }
        />
        <Stat
          value={r.numbers.retention === null ? '—' : `${Math.round(r.numbers.retention * 100)}%`}
          label="Retention"
          hint={`${r.numbers.reviews} reviews`}
        />
        <Stat
          value={`${r.numbers.classesAttended}/${r.numbers.classesHeld}`}
          label="Classes attended"
          hint={`${r.numbers.tasksDone} deadlines closed`}
        />
      </div>

      <div className="space-y-3">
        {r.findings.map((f) => (
          <Card key={f.id} className="p-4">
            <div className="mb-1 flex flex-wrap items-baseline gap-2">
              <Badge tone={TONE[f.severity]}>{f.severity}</Badge>
              <h3 className="text-[15px]">{f.headline}</h3>
            </div>
            <p className="mb-0 text-[13.5px] text-ink-2">{f.detail}</p>
            {f.action ? (
              <p className="mt-2 flex items-start gap-1.5 text-[13.5px] text-ink">
                <ChevronRight size={15} className="mt-0.5 shrink-0 text-accent" />
                {f.action}
              </p>
            ) : null}
          </Card>
        ))}
      </div>

      <Card className="mt-6 p-4 text-[13px] text-ink-2">
        <b className="mb-1 block font-display text-[14px] text-ink">Where these come from</b>
        Every line above is computed from your own rows — attendance ratios, weighted marks, planned
        versus logged minutes, the review log. Nothing is generated, so nothing can be invented, and it
        works with no connection and no account.
      </Card>
    </>
  )
}

function Critique() {
  const profile = useProfile()
  const tasks = useTasks()
  const topics = useTopics()
  const courses = useCourses()
  const [days, setDays] = useState(21)

  const c = useMemo(
    () => critique({ days, capacityMin: profile.daily_capacity_min, tasks, topics, courses }),
    [days, profile.daily_capacity_min, tasks, topics, courses],
  )

  const load = c.capacityMin ? c.demandMin / c.capacityMin : 0

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Select
          className="w-[170px]"
          label="Look ahead"
          value={String(days)}
          onChange={(e) => setDays(Number(e.target.value))}
        >
          <option value="7">The next week</option>
          <option value="14">Two weeks</option>
          <option value="21">Three weeks</option>
          <option value="42">Six weeks</option>
        </Select>
      </div>

      <Note tone={c.survivable ? 'ok' : 'crit'} title={c.survivable ? 'Survivable' : 'Not survivable as it stands'}>
        {c.headline}
      </Note>

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <Stat value={humanMinutes(c.demandMin)} label="Work due in the window" />
        <Stat value={humanMinutes(c.capacityMin)} label="Capacity" hint={`${humanMinutes(profile.daily_capacity_min)} a day`} />
        <Stat
          value={`${Math.round(load * 100)}%`}
          label="Load"
          tone={load > 1 ? 'crit' : load > 0.85 ? 'warn' : 'ok'}
        />
      </div>
      <Bar className="mb-6" value={Math.min(1, load)} tone={load > 1 ? 'crit' : load > 0.85 ? 'warn' : 'ok'} />

      {c.cuts.length > 0 && (
        <Panel title="The cheapest things to drop" sub="lowest marks at stake per hour freed">
          <ul className="-my-1">
            {c.cuts.map((cut) => (
              <li
                key={cut.label}
                className="flex flex-wrap items-center gap-3 border-b border-rule py-2.5 last:border-0"
              >
                <Scissors size={14} className="shrink-0 text-ink-3" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px]">{cut.label}</span>
                  <span className="text-[11.5px] text-ink-3">{cut.because}</span>
                </span>
                <Badge>{humanMinutes(cut.minutes)}</Badge>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[13px] text-ink-2">
            This is not advice to skip your degree. It is the arithmetic of what will not fit, shown
            before the deadline rather than after it — so the thing that slips is the one you chose.
          </p>
        </Panel>
      )}

      {c.survivable && (
        <Card className="p-4 text-[13.5px] text-ink-2">
          Nothing needs cutting. If that surprises you, check that your deadlines carry real effort
          estimates — the critique can only weigh what you have told it about.
        </Card>
      )}
    </>
  )
}

function Quiz() {
  const cards = useCards()
  const reviews = useReviews()
  const topics = useTopics()
  const courses = useCourses()
  const byId = useCourseMap()
  const notify = useUi((s) => s.notify)

  const [courseId, setCourseId] = useState<string>('')
  const [questions, setQuestions] = useState<Question[] | null>(null)
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, number | boolean>>({})
  const [revealed, setRevealed] = useState(false)

  const result = useMemo(
    () => (questions && index >= questions.length ? gradeQuiz(questions, answers, topics) : null),
    [questions, index, answers, topics],
  )

  function start() {
    const q = buildQuiz({ cards, reviews, topics, courseId: courseId || null, length: 10 })
    if (!q.length) {
      notify('Not enough cards in that deck to build a quiz', 'warn')
      return
    }
    setQuestions(q)
    setIndex(0)
    setAnswers({})
    setRevealed(false)
  }

  if (!cards.length) {
    return (
      <Empty
        title="No cards to quiz on"
        action={
          <Link to="/review">
            <Button variant="primary">Add some cards</Button>
          </Link>
        }
      >
        Quiz mode draws its questions — and its wrong answers — from your own deck.
      </Empty>
    )
  }

  if (result) {
    return (
      <>
        <Card className="mb-4 p-6 text-center">
          <div className="font-mono text-[34px] font-medium leading-none tabnum">
            {result.correct}/{result.total}
          </div>
          <p className="mt-2 text-[14px] text-ink-2">{result.followUp}</p>
        </Card>
        {result.weakest.length > 0 && (
          <Panel title="Where you lost marks">
            <ul className="-my-1">
              {result.weakest.map((w) => (
                <li
                  key={w.topicId ?? 'none'}
                  className="flex items-center gap-3 border-b border-rule py-2.5 last:border-0"
                >
                  <span className="min-w-0 flex-1 text-[13.5px]">{w.label}</span>
                  <Badge tone="crit">
                    {w.wrong}/{w.asked} wrong
                  </Badge>
                  {w.topicId ? (
                    <Button
                      size="sm"
                      onClick={async () => {
                        await patch('topics', w.topicId!, { confidence: 1 })
                        notify('Confidence lowered — the planner will schedule it again')
                      }}
                    >
                      Mark shaky
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          </Panel>
        )}
        <Button className="mt-4" variant="primary" onClick={start}>
          Another round
        </Button>
      </>
    )
  }

  if (!questions) {
    return (
      <>
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <Select
            className="w-[220px]"
            label="Deck"
            value={courseId}
            onChange={(e) => setCourseId(e.target.value)}
          >
            <option value="">Every course</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code}
              </option>
            ))}
          </Select>
          <Button variant="primary" onClick={start}>
            Start a 10-question quiz
          </Button>
        </div>
        <Card className="p-4 text-[13.5px] text-ink-2">
          Questions are drawn toward the cards you keep failing and the topics you rated low. The wrong
          answers are the backs of other cards from the same course — which makes them plausible in a
          way an invented distractor never is, and costs nothing to produce.
        </Card>
      </>
    )
  }

  const q = questions[index]
  const given = answers[q.id]

  function answer(value: number | boolean) {
    setAnswers((a) => ({ ...a, [q.id]: value }))
    setRevealed(true)
  }

  return (
    <Card className="overflow-hidden">
      <div className="h-1 bg-surface-2">
        <div
          className="h-full bg-accent transition-[width]"
          style={{ width: `${(index / questions.length) * 100}%` }}
        />
      </div>
      <div className="flex items-center gap-2 border-b border-rule px-4 py-2 text-[11.5px] text-ink-3">
        <span className="font-mono">
          {index + 1} / {questions.length}
        </span>
        {q.card.course_id ? (
          <span className="flex items-center gap-1.5">
            <Dot colour={byId.get(q.card.course_id)?.colour ?? '#888'} />
            {byId.get(q.card.course_id)?.code}
          </span>
        ) : null}
        <span className="ml-auto">{q.kind === 'choice' ? 'multiple choice' : 'recall'}</span>
      </div>

      <div className="px-5 py-7">
        <Markdown className="mx-auto max-w-[62ch] text-[16.5px]" source={q.prompt} />

        {q.kind === 'choice' ? (
          <ul className="mx-auto mt-6 grid max-w-[62ch] gap-2">
            {q.options.map((opt, i) => {
              const chosen = given === i
              const correct = i === q.answerIndex
              return (
                <li key={i}>
                  <button
                    type="button"
                    disabled={revealed}
                    onClick={() => answer(i)}
                    className={`w-full rounded border px-3 py-2.5 text-left text-[14px] transition ${
                      revealed && correct
                        ? 'border-ok bg-[color:var(--ok-soft)] text-ok'
                        : revealed && chosen
                          ? 'border-crit bg-[color:var(--crit-soft)] text-crit'
                          : 'border-rule bg-surface hover:border-rule-2 hover:bg-surface-2'
                    }`}
                  >
                    <span className="flex items-start gap-2">
                      {revealed && correct ? <Check size={15} className="mt-0.5 shrink-0" /> : null}
                      {revealed && chosen && !correct ? <X size={15} className="mt-0.5 shrink-0" /> : null}
                      <span>{opt}</span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        ) : (
          <div className="mx-auto mt-6 max-w-[62ch]">
            {revealed ? (
              <div className="rounded border border-rule bg-surface-2 p-4">
                <Markdown source={q.card.back} />
              </div>
            ) : null}
            <div className="mt-4 flex gap-2">
              {revealed ? (
                <>
                  <Button variant="primary" className="flex-1" onClick={() => answer(true)}>
                    I had it
                  </Button>
                  <Button variant="danger" className="flex-1" onClick={() => answer(false)}>
                    I did not
                  </Button>
                </>
              ) : (
                <Button variant="primary" className="w-full" onClick={() => setRevealed(true)}>
                  Show the answer
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      {revealed && (q.kind === 'choice' || given !== undefined) ? (
        <div className="border-t border-rule bg-surface-2 p-3">
          {q.kind === 'choice' && given !== q.answerIndex ? (
            <p className="mb-2 px-1 text-[13px] text-ink-2">
              The answer was <strong>{plainify(q.card.back)}</strong>.
            </p>
          ) : null}
          <Button
            variant="primary"
            className="w-full"
            onClick={() => {
              setIndex((i) => i + 1)
              setRevealed(false)
            }}
          >
            {index + 1 === questions.length ? 'See the score' : 'Next question'}
          </Button>
        </div>
      ) : null}
    </Card>
  )
}

const TABS = [
  { key: 'review', label: 'Weekly review' },
  { key: 'critique', label: 'Plan critique' },
  { key: 'quiz', label: 'Quiz me' },
] as const

export default function Coach() {
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('review')

  return (
    <>
      <PageHeader
        eyebrow="Coach"
        title="What the numbers say"
        lede="The honest assessment, the survivability check and the quiz — all computed on this device from your own data. No model, no key, no connection."
      />

      <div className="mb-5 flex flex-wrap gap-1">
        {TABS.map((t) => (
          <Button
            key={t.key}
            size="sm"
            variant={tab === t.key ? 'primary' : 'ghost'}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </Button>
        ))}
      </div>

      {tab === 'review' ? <Review /> : tab === 'critique' ? <Critique /> : <Quiz />}
    </>
  )
}
