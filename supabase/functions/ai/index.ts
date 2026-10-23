/**
 * Phase 3 — the Claude proxy. Deployed with:
 *
 *   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
 *   supabase functions deploy ai
 *
 * The point of this file is the thing the whole architecture turns on: the
 * API key lives in Supabase secrets and never reaches the browser. A key
 * shipped to the client is a public key — anyone who opens devtools can spend
 * it. The client sends { task, courseId, payload } and its session token; the
 * function authenticates, checks the monthly spend cap, assembles the context
 * from Postgres under RLS, and streams the answer back.
 *
 * The UI for these tasks is not built yet. This is the server half, ready.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const MODELS = {
  cheap: 'claude-haiku-4-5',
  strong: 'claude-sonnet-4-5',
} as const

/** Per-task: which model, and the system prompt. Lives server-side so prompt
 *  changes ship without a new app version. */
const TASKS: Record<string, { model: keyof typeof MODELS; system: string }> = {
  tutor: {
    model: 'strong',
    system:
      'You are tutoring one student in a specific course. You are given their topic tree with self-rated confidence. Do not explain what they have rated 3. Ask what they have tried before giving a full solution.',
  },
  solve: {
    model: 'strong',
    system:
      'Work the problem one equation per line. Carry units at every step. End with a sanity check on the magnitude of the answer.',
  },
  cards: {
    model: 'cheap',
    system:
      'Turn the notes into atomic flashcards. One fact per card. Use LaTeX between $ delimiters for any maths. Return JSON: [{"front":"…","back":"…"}].',
  },
  syllabus: {
    model: 'cheap',
    system:
      'Extract a topic tree from this syllabus. Return JSON: [{"name":"…","est_minutes":90,"exam_critical":true}]. Estimate honestly for a first pass by an average student.',
  },
  critique: {
    model: 'strong',
    system:
      'You are given deadlines, daily capacity and attendance. Say plainly whether the next three weeks are survivable. If not, name what should be cut. Do not encourage.',
  },
  retro: {
    model: 'strong',
    system:
      'Read the review log, attendance and completion rate. Write an honest weekly assessment. No encouragement, no padding — what went well, what slipped, what to change.',
  },
}

const MONTHLY_CAP_INR = 600

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors() })
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  const auth = req.headers.get('Authorization') ?? ''
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: auth } } },
  )

  const { data: userData } = await supabase.auth.getUser()
  const user = userData?.user
  if (!user) return json({ error: 'Not signed in' }, 401)

  const { task, courseId, payload } = (await req.json()) as {
    task: string
    courseId?: string
    payload: unknown
  }
  const spec = TASKS[task]
  if (!spec) return json({ error: `Unknown task: ${task}` }, 400)

  // 1. spend cap — refusing here is kinder than failing mid-answer
  const monthStart = new Date()
  monthStart.setDate(1)
  monthStart.setHours(0, 0, 0, 0)
  const { data: spend } = await supabase
    .from('ai_messages')
    .select('cost_inr')
    .gte('updated_at', monthStart.toISOString())
  const spent = (spend ?? []).reduce((s, r) => s + Number(r.cost_inr ?? 0), 0)
  if (spent >= MONTHLY_CAP_INR) {
    return json({ error: 'Monthly AI budget reached', spent, cap: MONTHLY_CAP_INR }, 402)
  }

  // 2. context assembled here, under RLS — the client never uploads it
  let context = ''
  if (courseId) {
    const [{ data: topics }, { data: tasks }] = await Promise.all([
      supabase.from('topics').select('name,confidence,exam_critical').eq('course_id', courseId),
      supabase.from('tasks').select('title,due_at,weight_pct,status').eq('course_id', courseId),
    ])
    context = `Topics: ${JSON.stringify(topics ?? [])}\nDeadlines: ${JSON.stringify(tasks ?? [])}`
  }

  // 3. call Anthropic with streaming, relay it straight through
  const upstream = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODELS[spec.model],
      max_tokens: 2048,
      stream: true,
      system: `${spec.system}\n\n${context}`,
      messages: [{ role: 'user', content: JSON.stringify(payload) }],
    }),
  })

  return new Response(upstream.body, {
    headers: { ...cors(), 'content-type': 'text/event-stream' },
  })
})

function cors() {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'authorization, content-type',
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(), 'content-type': 'application/json' },
  })
}
