/**
 * Notes → flashcards, without a model.
 *
 * This does not try to understand your notes. It looks for the shapes people
 * actually write definitions in — a bolded term followed by a dash, a
 * "X is Y" line, a two-column table, a labelled formula — and turns each into
 * a candidate you accept or reject. A heuristic that is right two-thirds of
 * the time and instant beats a model that is right nine-tenths of the time
 * and needs a network and a bill, because you are reviewing every card either
 * way before it enters the deck.
 */

export interface Candidate {
  front: string
  back: string
  /** Which rule matched — shown so you can judge it at a glance. */
  rule: 'definition' | 'table' | 'formula' | 'list' | 'heading'
  isFormula: boolean
  /** Section the line came from, when there was a heading above it. */
  section: string
}

const MIN_BACK = 3
const MAX_BACK = 320

function clean(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

function stripMd(s: string): string {
  return clean(s.replace(/^[-*+]\s+/, '').replace(/\*\*(.*?)\*\*/g, '$1').replace(/`/g, ''))
}

function usable(front: string, back: string): boolean {
  const f = clean(front)
  const b = clean(back)
  return (
    f.length >= 3 &&
    f.length <= 160 &&
    b.length >= MIN_BACK &&
    b.length <= MAX_BACK &&
    f.toLowerCase() !== b.toLowerCase()
  )
}

/** Lines that are prose rather than a definition — skip them. */
const PROSE_START = /^(and|but|so|then|also|however|therefore|this|that|these|those|it|we|you|i)\b/i

export function extractCards(markdown: string): Candidate[] {
  const out: Candidate[] = []
  const seen = new Set<string>()
  const push = (c: Candidate) => {
    const key = `${clean(c.front).toLowerCase()}|${clean(c.back).toLowerCase()}`
    if (seen.has(key)) return
    if (!usable(c.front, c.back)) return
    seen.add(key)
    out.push(c)
  }

  const lines = markdown.split('\n')
  let section = ''
  let lastLabel = ''

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]
    const line = raw.trim()
    if (!line) {
      lastLabel = ''
      continue
    }

    // headings set the section, and a heading followed by prose is itself a card
    const h = line.match(/^(#{1,4})\s+(.+)$/)
    if (h) {
      section = clean(h[2])
      const next = clean(lines[i + 1] ?? '')
      if (next && !next.startsWith('#') && !next.startsWith('|') && !next.startsWith('-')) {
        push({
          front: `${section} — what is it?`,
          back: stripMd(next),
          rule: 'heading',
          isFormula: false,
          section,
        })
      }
      continue
    }

    // pipe tables: first column asks, second answers
    if (/^\|.*\|$/.test(line) && !/^\|[\s:|-]+\|$/.test(line)) {
      const cells = line
        .replace(/^\||\|$/g, '')
        .split('|')
        .map(stripMd)
      const isHeader = /^\|[\s:|-]+\|$/.test(clean(lines[i + 1] ?? ''))
      if (!isHeader && cells.length >= 2 && cells[0] && cells[1]) {
        push({
          front: cells[0],
          back: cells.slice(1).join(' — '),
          rule: 'table',
          isFormula: /[=+\-*/^_\\]/.test(cells[1]) && cells[1].length < 60,
          section,
        })
      }
      continue
    }

    // display maths, labelled by the line above it
    const display = line.match(/^\$\$(.+)\$\$$/)
    if (display && lastLabel) {
      push({
        front: lastLabel.replace(/[:：]\s*$/, ''),
        back: `$$${clean(display[1])}$$`,
        rule: 'formula',
        isFormula: true,
        section,
      })
      lastLabel = ''
      continue
    }

    const body = stripMd(line)

    // **Term** — definition   /   - Term: definition
    const dash = body.match(/^(.{3,80}?)\s+[—–]\s+(.{3,})$/)
    const colon = body.match(/^([^:]{3,80}?):\s+(.{3,})$/)
    const pair = dash ?? colon
    if (pair && !PROSE_START.test(pair[1])) {
      const term = clean(pair[1])
      const def = clean(pair[2])
      push({
        front: /^(what|why|how|when|which)\b/i.test(term) ? term : `${term} — what is it?`,
        back: def,
        rule: 'definition',
        isFormula: /\$/.test(def),
        section,
      })
      lastLabel = term
      continue
    }

    // "X is/are Y" as a whole line
    const isA = body.match(/^(.{3,70}?)\s+(?:is|are)\s+(.{6,})$/i)
    if (isA && /^[-*+]\s/.test(line) && !PROSE_START.test(isA[1])) {
      push({
        front: `${clean(isA[1])} — what is it?`,
        back: clean(isA[2]),
        rule: 'list',
        isFormula: /\$/.test(isA[2]),
        section,
      })
      lastLabel = clean(isA[1])
      continue
    }

    lastLabel = body.length < 90 ? body : ''
  }

  return out
}

/** A one-line summary of what the extractor found, for the accept screen. */
export function describe(candidates: Candidate[]): string {
  if (!candidates.length) {
    return 'Nothing card-shaped found. The extractor looks for definitions (“Term — meaning”), two-column tables, and labelled formulas.'
  }
  const byRule = candidates.reduce<Record<string, number>>((m, c) => {
    m[c.rule] = (m[c.rule] ?? 0) + 1
    return m
  }, {})
  const parts = Object.entries(byRule).map(([rule, n]) => `${n} ${rule}`)
  return `${candidates.length} candidates — ${parts.join(', ')}. Reject anything that reads badly; nothing enters the deck until you accept it.`
}
