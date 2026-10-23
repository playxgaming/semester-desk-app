import type { Card, Review, Topic } from '@/db/db'

/**
 * Quiz mode, built from your own deck rather than generated.
 *
 * The distractors in a multiple-choice question are the backs of other cards
 * from the same course — which makes them plausible in exactly the way a
 * made-up wrong answer is not, and costs nothing to produce. Questions are
 * drawn toward the cards you keep failing and the topics you rated low, so
 * the quiz is aimed at the gap rather than spread evenly over what you know.
 */

export type QuestionKind = 'choice' | 'recall'

export interface Question {
  id: string
  kind: QuestionKind
  card: Card
  prompt: string
  /** For 'choice': shuffled options, one of which is the answer. */
  options: string[]
  answerIndex: number
  topicId: string | null
}

export interface QuizResult {
  total: number
  correct: number
  score: number
  /** Topics ranked by how badly they went, worst first. */
  weakest: { topicId: string | null; label: string; wrong: number; asked: number }[]
  followUp: string
}

/** Deterministic shuffle so a given seed always produces the same quiz. */
function shuffle<T>(items: T[], seed: number): T[] {
  const out = [...items]
  let s = seed || 1
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) % 4294967296
    const j = s % (i + 1)
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** Strip markdown and LaTeX delimiters so an option reads as a plain line. */
export function plainify(text: string, max = 120): string {
  const s = text
    .replace(/\{\{c\d+::(.*?)(?:::.*?)?\}\}/g, '$1')
    .replace(/\$\$?([^$]*)\$?\$/g, '$1')
    .replace(/[*_`#>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return s.length > max ? `${s.slice(0, max - 1)}…` : s
}

export interface QuizInput {
  cards: Card[]
  reviews: Review[]
  topics: Topic[]
  courseId?: string | null
  length?: number
  seed?: number
}

/**
 * Priority = how much evidence there is that you do not know it.
 * Lapses and recent failures count most; a low confidence rating on the
 * card's topic counts next; everything else is filler.
 */
function priority(card: Card, failures: Map<string, number>, topics: Map<string, Topic>): number {
  const fails = failures.get(card.id) ?? 0
  const topic = card.topic_id ? topics.get(card.topic_id) : undefined
  const gap = topic ? (3 - topic.confidence) / 3 : 0.5
  return fails * 3 + card.lapses * 2 + gap * 2 + (card.reps === 0 ? 1 : 0)
}

export function buildQuiz(input: QuizInput): Question[] {
  const length = input.length ?? 10
  const seed = input.seed ?? Date.now() % 100000

  const pool = input.cards.filter(
    (c) => !c.deleted_at && !c.suspended && (!input.courseId || c.course_id === input.courseId),
  )
  if (pool.length < 2) return []

  const failures = new Map<string, number>()
  for (const r of input.reviews) {
    if (r.grade === 0) failures.set(r.card_id, (failures.get(r.card_id) ?? 0) + 1)
  }
  const topics = new Map(input.topics.map((t) => [t.id, t]))

  const ranked = [...pool].sort(
    (a, b) => priority(b, failures, topics) - priority(a, failures, topics),
  )
  // take from the top of the ranking, but not always the same ten
  const candidates = shuffle(ranked.slice(0, Math.max(length * 2, Math.min(pool.length, 12))), seed).slice(
    0,
    Math.min(length, pool.length),
  )

  return candidates.map((card, i) => {
    const siblings = pool.filter(
      (c) => c.id !== card.id && c.course_id === card.course_id && c.back.trim() !== card.back.trim(),
    )
    const distractors = shuffle(siblings, seed + i)
      .slice(0, 3)
      .map((c) => plainify(c.back))
      .filter((t, idx, arr) => t.length > 0 && arr.indexOf(t) === idx)

    if (distractors.length < 2) {
      return {
        id: `q${i}`,
        kind: 'recall' as const,
        card,
        prompt: card.front,
        options: [],
        answerIndex: -1,
        topicId: card.topic_id,
      }
    }

    const answer = plainify(card.back)
    const options = shuffle([answer, ...distractors], seed + i * 7)
    return {
      id: `q${i}`,
      kind: 'choice' as const,
      card,
      prompt: card.front,
      options,
      answerIndex: options.indexOf(answer),
      topicId: card.topic_id,
    }
  })
}

export function gradeQuiz(
  questions: Question[],
  answers: Record<string, number | boolean>,
  topics: Topic[],
): QuizResult {
  const byTopic = new Map<string, { label: string; wrong: number; asked: number }>()
  const topicName = new Map(topics.map((t) => [t.id, t.name]))
  let correct = 0

  for (const q of questions) {
    const given = answers[q.id]
    const right = q.kind === 'choice' ? given === q.answerIndex : given === true
    if (right) correct += 1

    const key = q.topicId ?? '_none'
    const entry = byTopic.get(key) ?? {
      label: q.topicId ? (topicName.get(q.topicId) ?? 'Unlabelled topic') : 'No topic set',
      wrong: 0,
      asked: 0,
    }
    entry.asked += 1
    if (!right) entry.wrong += 1
    byTopic.set(key, entry)
  }

  const weakest = [...byTopic.entries()]
    .map(([topicId, v]) => ({ topicId: topicId === '_none' ? null : topicId, ...v }))
    .filter((t) => t.wrong > 0)
    .sort((a, b) => b.wrong / b.asked - a.wrong / a.asked || b.wrong - a.wrong)

  const total = questions.length
  const score = total ? correct / total : 0

  const followUp = !total
    ? 'Nothing to quiz on yet.'
    : weakest.length === 0
      ? 'Clean sweep. These cards are not where your risk is — quiz a different course.'
      : weakest[0].topicId
        ? `Your misses cluster in ${weakest[0].label} — ${weakest[0].wrong} of ${weakest[0].asked}. Drop its confidence rating and the planner will schedule it again.`
        : `${weakest[0].wrong} of ${weakest[0].asked} wrong on cards with no topic attached. Tag them and the planner can act on this.`

  return { total, correct, score, weakest, followUp }
}
