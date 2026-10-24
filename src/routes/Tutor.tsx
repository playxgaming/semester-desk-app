import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { PageHeader, Card, Button, TextArea, Select, Row, Note, Badge } from '@/components/ui'
import { Markdown } from '@/components/Markdown'
import { AiConnection } from '@/components/AiConnection'
import { Loader2, Send, Square, Plus, NotebookPen } from 'lucide-react'
import { AI_CONNECTION_EVENT, aiHealth, aiRequest } from '@/lib/ai'
import { db, type AiMessage } from '@/db/db'
import { alive, put, stamp } from '@/db/mutate'
import { useCourses } from '@/hooks/data'
import { useUi } from '@/store/ui'
import { uid } from '@/lib/id'

type Mode = 'explain' | 'hint' | 'practice'
// Starter questions per subject and learning mode: each one is specific enough
// to get a useful first answer instead of a generic overview.
const examples: Record<string, Record<Mode, string[]>> = {
  Maths: {
    explain: ['Explain integration by parts, then help me integrate x² sin(x).', 'Why does the derivative of eˣ equal eˣ? Build it up from the limit definition.', 'Explain eigenvalues with a 2×2 matrix example I can check by hand.'],
    hint: ['Help me solve x² − 5x + 6 = 0 without giving the answer yet.', 'I am stuck on ∫ x·eˣ dx. Give me only the first hint.', 'Prove √2 is irrational — one hint at a time, I want to do it myself.'],
    practice: ['Quiz me on conditional probability, one question at a time.', 'Give me 3 limit problems, easy to hard, and check my working.', 'Test me on matrix multiplication and explain any mistake I make.'],
  },
  Physics: {
    explain: ['Help me draw the forces on a block on an inclined plane.', 'I used v = u + at. When is that equation valid?', 'Explain the difference between electric field and electric potential.'],
    hint: ['A ball is thrown at 20 m/s at 30°. Hint me towards its maximum height.', 'Two resistors in parallel, 4 Ω and 6 Ω — hint me to the total resistance.', 'Hint me through finding the tension in a pendulum string at its lowest point.'],
    practice: ['Ask me a short practice question about conservation of energy.', 'Quiz me on Newton’s laws with real-world situations.', 'Give me one circuit problem at a time and grade my reasoning.'],
  },
  Chemistry: {
    explain: ['Explain how to balance a redox reaction, with one example.', 'How do I decide whether a molecule is polar?', 'Explain Le Chatelier’s principle using the Haber process.'],
    hint: ['How many grams of NaCl are in 250 mL of 0.5 M solution? Hint only.', 'Hint me through drawing the Lewis structure of SO₄²⁻.', 'Hint me towards the pH of 0.01 M HCl.'],
    practice: ['Quiz me on moles and molarity, one question at a time.', 'Test me on naming organic compounds, getting harder each time.', 'Give me equilibrium constant problems and check my steps.'],
  },
  'Computer Science': {
    explain: ['Trace binary search on [2, 5, 8, 12, 16] to find 12.', 'Explain a database join using a small student/course example.', 'Explain Big-O by comparing bubble sort and merge sort.'],
    hint: ['How do I reverse a linked list in place? Hint first, no code yet.', 'Hint me towards detecting a cycle in a directed graph.', 'My recursive Fibonacci is slow. Hint me towards why and how to fix it.'],
    practice: ['Quiz me on process scheduling and explain my mistakes.', 'Ask me SQL query questions on a students/courses table.', 'Give me one time-complexity question at a time.'],
  },
  'General Logic': {
    explain: ['Help me break this topic into concepts I need to learn.', 'Show me how to test an argument for a logical fallacy.', 'Explain the difference between necessary and sufficient conditions.'],
    hint: ['Hint me through this puzzle: which of three boxes, all labelled wrongly, holds the apples?', 'I am writing a proof by contradiction. Hint me on how to start.', 'Hint me on how to structure a revision plan for my exam.'],
    practice: ['Ask me questions to check whether I understand a concept.', 'Give me syllogisms and ask me if each is valid.', 'Quiz me with short critical-reasoning questions, one at a time.'],
  },
}
const followUps: Record<Mode, string[]> = {
  explain: ['Explain the last step more simply.', 'Show me another worked example.', 'What is a common mistake here?', 'Quiz me on this to check I understood.'],
  hint: ['Explain the last step more simply.', 'Give me the next hint.', 'Check my working: ', 'Show the full solution now.'],
  practice: ['Explain the last step more simply.', 'My answer: ', 'Give me a hint for this question.', 'Make the next question harder.'],
}

export default function Tutor() {
  const courses = useCourses()
  const notify = useUi(s => s.notify)
  const [problem, setProblem] = useState('')
  const [subject, setSubject] = useState('Maths')
  const [mode, setMode] = useState<Mode>('explain')
  const [level, setLevel] = useState('Undergraduate')
  const [course, setCourse] = useState('')
  const [threadId, setThreadId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [savingNote, setSavingNote] = useState(false)
  const [error, setError] = useState('')
  const [connection, setConnection] = useState<'checking' | 'ready' | 'setup'>('checking')
  const [showSetup, setShowSetup] = useState(false)
  const request = useRef<AbortController | null>(null)
  const editor = useRef<HTMLDivElement>(null)
  const threads = useLiveQuery(async () => alive(await db.ai_threads.toArray()).filter(t => t.task_type.startsWith('tutor:')).sort((a, b) => b.updated_at.localeCompare(a.updated_at)), []) || []
  const messages = useLiveQuery(async () => threadId ? alive(await db.ai_messages.where('thread_id').equals(threadId).toArray()).sort((a, b) => {
    if (typeof a.sequence === 'number' && typeof b.sequence === 'number') return a.sequence - b.sequence || a.id.localeCompare(b.id)
    if (typeof a.sequence === 'number') return 1
    if (typeof b.sequence === 'number') return -1
    return a.updated_at.localeCompare(b.updated_at) || a.id.localeCompare(b.id)
  }) : [], [threadId]) || []
  const legacyMessages = messages.some(m => typeof m.sequence !== 'number')

  useEffect(() => {
    let mounted = true
    let generation = 0
    const check = () => {
      const token = ++generation
      setConnection('checking')
      void aiHealth().then(h => { if (mounted && token === generation) setConnection(h.aiConfigured ? 'ready' : 'setup') }).catch(() => { if (mounted && token === generation) setConnection('setup') })
    }
    check()
    window.addEventListener(AI_CONNECTION_EVENT, check)
    return () => { mounted = false; window.removeEventListener(AI_CONNECTION_EVENT, check); request.current?.abort() }
  }, [])

  function selectThread(id: string) {
    setThreadId(id || null); setError(''); setProblem('')
    const thread = threads.find(t => t.id === id)
    if (thread) {
      try {
        const prefs = JSON.parse(thread.task_type.slice(6))
        setSubject(typeof prefs?.subject === 'string' && Object.prototype.hasOwnProperty.call(examples, prefs.subject) ? prefs.subject : 'Maths')
        setMode(['explain', 'hint', 'practice'].includes(prefs?.mode) ? prefs.mode : 'explain')
        setLevel(['School', 'Undergraduate', 'Advanced'].includes(prefs?.level) ? prefs.level : 'Undergraduate')
      } catch { setSubject('Maths'); setMode('explain'); setLevel('Undergraduate') }
      setCourse(thread.course_id || '')
    }
  }
  async function send() {
    const question = problem.trim()
    if (!question || loading || question.length > 8000) return
    setLoading(true); setError('')
    const controller = new AbortController(); request.current = controller
    const id = threadId || uid()
    try {
      const result = await aiRequest<unknown>('solve-problem', {
        problem: question, subject, mode, level,
        course: courses.find(c => c.id === course)?.name || '',
        history: messages.filter(m => typeof m.sequence === 'number').slice(-12).map(m => ({ role: m.role, content: m.content.slice(0, 6000) })),
      }, controller.signal)
      if (typeof result !== 'string' || !result.trim()) throw new Error('No answer returned. Try a more specific question.')
      if (controller.signal.aborted) throw new Error('Request cancelled. Your question is still here.')
      await db.transaction('rw', [db.ai_threads, db.ai_messages, db.outbox], async () => {
        await put('ai_threads', stamp({ id, course_id: course || null, title: threads.find(t => t.id === id)?.title || question.slice(0, 80), task_type: `tutor:${JSON.stringify({ subject, mode, level })}` }))
        const stored = alive(await db.ai_messages.where('thread_id').equals(id).toArray())
        const nextSequence = Math.max(-1, ...stored.map(m => m.sequence ?? -1)) + 1
        const row = (role: AiMessage['role'], content: string, sequence: number) => stamp({ id: uid(), thread_id: id, role, content, sequence, tokens_in: 0, tokens_out: 0, cost_inr: 0 })
        await put('ai_messages', row('user', question, nextSequence))
        await put('ai_messages', row('assistant', result, nextSequence + 1))
      })
      setThreadId(id); setProblem(''); setConnection('ready')
    } catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong. Your question is still here.') }
    finally { setLoading(false); request.current = null }
  }
  function draft(text: string) {
    setProblem(text)
    // Prompts ending in ": " expect the student to finish them, so leave the caret at the end.
    requestAnimationFrame(() => {
      const box = editor.current?.querySelector('textarea')
      box?.focus()
      box?.setSelectionRange(text.length, text.length)
    })
  }
  const selectedCourse = courses.find(c => c.id === course)
  const starters = [
    ...(selectedCourse ? [`Make me a 5-question revision check for ${selectedCourse.code} ${selectedCourse.name}, one question at a time.`] : []),
    ...(examples[subject] || examples.Maths)[mode],
  ]
  async function saveNote() {
    if (savingNote || !messages.length) return
    setSavingNote(true)
    try {
      const title = threads.find(t => t.id === threadId)?.title || 'Tutor conversation'
      await put('notes', stamp({ id: uid(), course_id: course || null, topic_id: null, title: `Tutor: ${title}`, body_md: messages.map(m => `## ${m.role === 'user' ? 'Question' : 'Tutor'}\n\n${m.content}`).join('\n\n'), pinned: false }))
      notify('Conversation saved in Notes.')
    } catch { setError('Could not save the note. Please retry.') }
    finally { setSavingNote(false) }
  }
  return <>
    <PageHeader eyebrow="AI Tutor" title="Understand it, step by step." lede="Ask for an explanation, a small hint, or a practice question. Follow up when a step is unclear." action={<Button disabled={loading} onClick={() => selectThread('')}><Plus size={16} />New conversation</Button>} />
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <Badge tone={connection === 'ready' ? 'ok' : 'neutral'}>{connection === 'ready' ? 'AI server connected' : connection === 'checking' ? 'Checking AI connection' : 'AI setup needed'}</Badge>
      <Button onClick={() => setShowSetup(v => !v)}>{showSetup ? 'Hide AI setup' : 'AI connection'}</Button>
      <span className="text-[12px] text-ink-3">Internet required. Only this conversation is sent to your AI server.</span>
    </div>
    {showSetup && <div className="mb-5"><AiConnection /></div>}
    {connection === 'setup' && !showSetup && <Note tone="warn">Tutor needs a configured Gemini server. <button className="inline-flex min-h-[44px] items-center font-medium text-accent underline" onClick={() => setShowSetup(true)}>Connect your AI server</button> or read the <a className="inline-flex min-h-[44px] items-center text-accent underline" href="https://github.com/playxgaming/semester-desk-app/blob/main/AI_SETUP.md" target="_blank" rel="noopener noreferrer">setup guide</a>. Your planner works without it.</Note>}
    <Card className="mb-5 p-4">
      <Row>
        <Select label="Subject" value={subject} disabled={loading} onChange={e => setSubject(e.target.value)}>{Object.keys(examples).map(s => <option key={s}>{s}</option>)}</Select>
        <Select label="Learning mode" value={mode} disabled={loading} onChange={e => setMode(e.target.value as Mode)}><option value="explain">Explain step by step</option><option value="hint">Hint first</option><option value="practice">Practice with me</option></Select>
        <Select label="Study level" value={level} disabled={loading} onChange={e => setLevel(e.target.value)}><option>School</option><option>Undergraduate</option><option>Advanced</option></Select>
        <Select label="Course context (optional)" value={course} disabled={loading} onChange={e => setCourse(e.target.value)}><option value="">No course selected</option>{courses.map(c => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}</Select>
      </Row>
      {threads.length > 0 && <div className="mt-3"><Select label="Saved conversations" value={threadId || ''} disabled={loading} onChange={e => selectThread(e.target.value)}><option value="">New conversation</option>{threads.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}</Select></div>}
    </Card>
    {!messages.length && <div className="mb-5"><p className="mb-2 text-[12.5px] font-medium text-ink-2">Try asking</p><div className="grid gap-2 sm:grid-cols-2">{starters.map(text => <Button key={text} className="text-left justify-start" disabled={loading} onClick={() => draft(text)}>{text}</Button>)}</div></div>}
    {messages.length > 0 && <section aria-label="Tutor conversation" className="mb-5 space-y-3">
      {legacyMessages && <Note tone="warn">This older conversation has messages without a verified turn order. They remain visible here; follow-ups use only newer, ordered turns. Start a new conversation when the earlier context matters.</Note>}
      {messages.map(m => <Card key={m.id} className={`p-4 ${m.role === 'user' ? 'bg-surface-2' : ''}`}><h2 className="mb-2 text-[12px] uppercase tracking-wider text-accent">{m.role === 'user' ? 'You' : 'Tutor'}</h2><Markdown source={m.content} /></Card>)}
      <div className="flex flex-wrap gap-2"><Button disabled={loading || savingNote} onClick={() => void saveNote()}><NotebookPen size={16} />{savingNote ? 'Saving…' : 'Save conversation to Notes'}</Button><Link className="inline-flex min-h-[44px] items-center text-[13px] text-accent underline" to="/notes">Open Notes</Link></div>
      <div className="mt-3 flex flex-wrap gap-2">{followUps[mode].map(text => <Button key={text} size="sm" disabled={loading} onClick={() => draft(text)}>{text.trim()}</Button>)}</div>
    </section>}
    <Card className="p-4" >
      <div ref={editor}><TextArea label="What's the problem?" placeholder="Include the question, what you tried, and the step that confused you." value={problem} onChange={e => setProblem(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void send() } }} rows={4} maxLength={8000} disabled={loading} /></div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3"><span className="text-[12px] text-ink-3">{problem.length}/8000 · Ctrl+Enter to send · Answers can contain mistakes; check the reasoning.</span><div className="flex gap-2">
        {loading && <Button onClick={() => request.current?.abort()}><Square size={14} />Stop</Button>}
        <Button variant="primary" onClick={() => void send()} disabled={!problem.trim() || loading}>{loading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}{loading ? 'Thinking…' : messages.length ? 'Ask follow-up' : 'Ask Tutor'}</Button>
      </div></div>
    </Card>
    {error && <div role="alert"><Note tone="crit">{error}</Note></div>}
  </>
}
