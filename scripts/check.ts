/**
 * Arithmetic checks for the three calculators the app is judged on:
 * the skip calculator, "what do I need", and SM-2 scheduling.
 *
 *   npm run check
 */
import { attendanceStats } from '../src/lib/attendance'
import { gradeCourse, whatDoINeed, computeGpa } from '../src/lib/grades'
import { schedule, expandCloze } from '../src/lib/srs'
import { buildPlan } from '../src/lib/planner'
import { renderMarkdown } from '../src/lib/markdown'
import { advanceRecurring, burnDown, byCategory, creepers, habitStreak } from '../src/lib/money'
import { effortMinutes, queueItems } from '../src/lib/pipeline'
import { buildResume, dateRange, resumeDocx, resumeMarkdown } from '../src/lib/resume'
import { crc32 } from '../src/lib/zip'
import { addDays, dayKey } from '../src/lib/date'
import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildSchedule, inQuietHours, numericId } from '../src/lib/notify'
import { critique, weeklyReview } from '../src/lib/insights'
import { buildQuiz, gradeQuiz, plainify } from '../src/lib/quiz'
import { extractCards } from '../src/lib/extract'
import { cellStatus, nextStatus, rowsFor, slotsFor } from '../src/db/attendance'
import { bySemester, cumulative } from '../src/lib/grades'
import { shouldSnapshot } from '../src/db/history'
import { alive } from '../src/db/mutate'
import type { AttendanceStatus } from '../src/db/db'
import type { StudySession, TimetableSlot } from '../src/db/db'
import {
  DEFAULT_GRADE_BANDS,
  type Application,
  type Assessment,
  type Attendance,
  type Budget,
  type Card,
  type Course,
  type Habit,
  type HabitLog,
  type Profile,
  type Recurring,
  type ResumeItem,
  type ResumeVersion,
  type StudyTask,
  type Topic,
  type Transaction,
} from '../src/db/db'
import { defaultProfile } from '../src/db/mutate'

let failures = 0
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`}`)
}

const base = { user_id: null, updated_at: '2026-08-31T00:00:00Z', deleted_at: null }

/* ── attendance ─────────────────────────────────────────────────────────── */
const att = (present: number, absent: number, cancelled = 0): Attendance[] => [
  ...Array.from({ length: present }, (_, i) => ({ id: `p${i}`, ...base, course_id: 'c', slot_id: null, date: '2026-08-01', status: 'present' as const })),
  ...Array.from({ length: absent }, (_, i) => ({ id: `a${i}`, ...base, course_id: 'c', slot_id: null, date: '2026-08-02', status: 'absent' as const })),
  ...Array.from({ length: cancelled }, (_, i) => ({ id: `x${i}`, ...base, course_id: 'c', slot_id: null, date: '2026-08-03', status: 'cancelled' as const })),
]

// 30 held, 24 present = exactly 80%. At a 75% threshold: 24/0.75 = 32, minus 30 held = 2 more skips.
const a1 = attendanceStats(att(24, 6), 0.75)
check('attendance 24/30 = 80%', Math.round(a1.pct! * 1000) / 10, 80)
check('can skip 2 more at 75%', a1.canSkip, 2)
check('cancelled classes are not held', attendanceStats(att(24, 6, 5), 0.75).held, 30)

// 20 held, 12 present = 60%. (0.75·20 − 12)/(1 − 0.75) = 3/0.25 = 12 in a row.
const a2 = attendanceStats(att(12, 8), 0.75)
check('below threshold: must attend 12 in a row', a2.mustAttend, 12)
check('below threshold: canSkip is 0', a2.canSkip, 0)
check('12 attended + 12 more of 12 → 24/32 = 75%', (12 + 12) / (20 + 12), 0.75)

/* ── grades ─────────────────────────────────────────────────────────────── */
const asm = (title: string, weight: number, score: number | null, max: number): Assessment => ({
  id: title, ...base, course_id: 'c', title, weight_pct: weight, score, max, date: null,
})

// 10% quiz at 17/20 (=8.5 of 100) + 30% mid at 41/50 (=24.6) → 33.1 earned of 40 assessed
const g = gradeCourse([asm('quiz', 10, 17, 20), asm('mid', 30, 41, 50), asm('final', 60, null, 100)], DEFAULT_GRADE_BANDS)
check('earned of total = 33.1', Math.round(g.earnedOfTotal * 10) / 10, 33.1)
check('current % across graded = 82.75', Math.round(g.currentPct! * 100) / 100, 82.75)
check('remaining weight = 60', g.remainingWeight, 60)
check('band for 82.75 is A / 9 points', [g.band!.letter, g.band!.points], ['A', 9])

// need 85 overall: (85 − 33.1) / 60 × 100 = 86.5%
const need = whatDoINeed(g, 85)
check('what do I need = 86.5%', Math.round(need.required * 10) / 10, 86.5)
check('…and it is reachable', need.status, 'reachable')
check('target 20 is already banked', whatDoINeed(g, 20).status, 'locked-in')
check('target 99 is out of reach', whatDoINeed(g, 99).status, 'impossible')

// SGPA: 4 credits at 9 points and 2 credits at 6 points → (36+12)/6 = 8.00
const profile: Profile = { ...defaultProfile(), grade_bands: DEFAULT_GRADE_BANDS }
const course = (id: string, credits: number): Course => ({
  id, ...base, code: id, name: id, credits, colour: '#3358CC', instructor: '', target_grade: 80,
  attendance_threshold: 0.75, archived: false, semester: 'Semester 5',
})
const gpa = computeGpa(
  [
    { course: course('A', 4), grade: gradeCourse([asm('x', 100, 85, 100)], DEFAULT_GRADE_BANDS) },
    { course: course('B', 2), grade: gradeCourse([asm('y', 100, 55, 100)], DEFAULT_GRADE_BANDS) },
  ],
  profile,
)
check('credit-weighted SGPA = 8.00', Number(gpa.value!.toFixed(2)), 8)

/* ── SM-2 ───────────────────────────────────────────────────────────────── */
const card: Card = {
  id: 'c', ...base, course_id: null, topic_id: null, front: 'f', back: 'b',
  ease: 2.5, interval: 10, reps: 3, due_at: base.updated_at, lapses: 0, suspended: false, is_formula: false,
}
check('Good on a mature card: 10 × 2.5 = 25 days', schedule(card, 2).interval, 25)
check('Again resets the interval and counts a lapse', [schedule(card, 0).interval, schedule(card, 0).lapses], [0, 1])
check('Again drops ease by 0.20', Number(schedule(card, 0).ease.toFixed(2)), 2.3)
check('Hard is a pass that grows slowly: 10 × 1.2 = 12', schedule(card, 1).interval, 12)
check('Hard drops ease by 0.15', Number(schedule(card, 1).ease.toFixed(2)), 2.35)
check('Easy adds a 1.3 bonus: round(25 × 1.3) = 33', schedule(card, 3).interval, 33)
check('Good holds ease at 2.5', Number(schedule(card, 2).ease.toFixed(2)), 2.5)
check('ease never falls below 1.3', schedule({ ...card, ease: 1.3 }, 0).ease, 1.3)
check('first correct answer schedules 1 day', schedule({ ...card, reps: 0, interval: 0 }, 2).interval, 1)
check('second schedules 6 days', schedule({ ...card, reps: 1, interval: 1 }, 2).interval, 6)

check('cloze makes one card per marker', expandCloze('A needs {{c1::x}} and {{c2::y}}.').length, 2)
check('cloze front hides only its own marker', expandCloze('A needs {{c1::x}} and {{c2::y}}.')[0].front, 'A needs […] and y.')

/* ── planner ────────────────────────────────────────────────────────────── */
const topic = (id: string, est: number, confidence: 0 | 1 | 2 | 3): Topic => ({
  id, ...base, course_id: 'c', name: id, order_index: 0, confidence, est_minutes: est, exam_critical: true,
})
const plan = buildPlan({
  from: '2026-09-01',
  days: 5,
  capacityMin: 120,
  courses: [course('c', 4)],
  topics: [topic('t1', 600, 0), topic('t2', 600, 0)],
  tasks: [] as StudyTask[],
  slots: [],
  existing: [],
})
const perDay = plan.days.map((d) => d.plannedMin)
check('no day exceeds capacity', perDay.every((m) => m <= 120), true)
check('capacity is fully used when demand exceeds it', perDay, [120, 120, 120, 120, 120])
check('demand 1200 vs capacity 600 → overloaded', plan.diagnostics.verdict, 'overloaded')
check('shortfall is reported, not hidden', plan.diagnostics.shortfallMin, 600)

const light = buildPlan({
  from: '2026-09-01', days: 5, capacityMin: 120,
  courses: [course('c', 4)], topics: [topic('t1', 120, 2)], tasks: [], slots: [], existing: [],
})
check('a light week reads as comfortable', light.diagnostics.verdict, 'comfortable')

/* ── markdown + math ────────────────────────────────────────────────────── */
const md = renderMarkdown('Energy is $E = mc^2$ and **bold** works.')
check('inline math renders through KaTeX', md.includes('katex'), true)
check('bold still works alongside math', md.includes('<strong>bold</strong>'), true)
check('subscripts survive the italic pass', renderMarkdown('$a_1$ and $a_2$').includes('<em>'), false)
check('tables render', renderMarkdown('| a | b |\n| --- | --- |\n| 1 | 2 |').includes('<table'), true)

/* ── money ──────────────────────────────────────────────────────────────── */
const SEPT = new Date(2026, 8, 12, 12, 0, 0) // 12 September 2026, a 30-day month

const tx = (amount: number, category: string, day: number, month = 8): Transaction => ({
  id: `${category}-${month}-${day}-${amount}`,
  ...base,
  at: new Date(2026, month, day, 10).toISOString(),
  amount,
  category,
  method: 'upi',
  note: '',
})

const foodBudget: Budget = {
  id: 'b1', ...base, month: '2026-09', category: 'Food', limit_amount: 4000,
}
// 2720 of 4000 spent by day 12 of 30: 68% of the budget, 40% of the month
const burn = burnDown(foodBudget, [tx(2000, 'Food', 3), tx(720, 'Food', 9), tx(500, 'Fun', 5)], SEPT)
check('burn-down counts only its own category', burn.spent, 2720)
check('68% of the budget used', Math.round(burn.used * 100), 68)
check('40% of the month elapsed', Math.round(burn.elapsed * 100), 40)
check('spending faster than the month passes → over-pace', burn.status, 'over-pace')
check('…and says so with the day number', burn.message.includes('day 12 of 30'), true)
check(
  'what is left, per remaining day',
  Math.round(burn.leftPerDay),
  Math.round((4000 - 2720) / 18),
)
check('under pace reads as ahead', burnDown(foodBudget, [tx(400, 'Food', 3)], SEPT).status, 'ahead')
check('over the limit reads as blown', burnDown(foodBudget, [tx(4500, 'Food', 3)], SEPT).status, 'blown')

const cats = byCategory(
  [tx(1000, 'Food', 3), tx(500, 'Fun', 4), tx(400, 'Fun', 6, 7)],
  '2026-09',
  '2026-08',
)
check('categories rank by spend', cats.map((c) => c.category), ['Food', 'Fun'])
check('share of the month total', Math.round((cats[0].share ?? 0) * 100), 67)
check('Fun grew 25% on last month', Math.round((cats[1].delta ?? 0) * 100), 25)
check('creepers needs both growth and size', creepers(cats, 300).length, 0)

const habit: Habit = { id: 'h', ...base, name: 'Gym', cadence: 'daily', target: 1, colour: '#000' }
const log = (daysAgo: number): HabitLog => ({
  id: `l${daysAgo}`, ...base, habit_id: 'h', date: dayKey(addDays(SEPT, -daysAgo)), value: 1,
})
check('streak counts back from today', habitStreak(habit, [log(0), log(1), log(2)], SEPT).streak, 3)
check(
  'today unlogged does not break yesterday\'s streak',
  habitStreak(habit, [log(1), log(2)], SEPT).streak,
  2,
)
check('a gap ends the streak', habitStreak(habit, [log(0), log(2), log(3)], SEPT).streak, 1)

const rec: Recurring = {
  id: 'r', ...base, name: 'Mess', amount: 3200, cadence: 'monthly',
  next_at: new Date(2026, 7, 4).toISOString(),
}
check('a monthly payment rolls past today', new Date(advanceRecurring(rec, SEPT)) > SEPT, true)

/* ── pipeline ───────────────────────────────────────────────────────────── */
const app = (over: Partial<Application>): Application => ({
  id: 'a1', ...base, org: 'Rakuten', role: 'Intern', kind: 'internship', stage: 'sourced',
  deadline: null, link: '', note: '', resume_version_id: null, sop_status: 'none', lor_status: 'none',
  ...over,
})

check('an untouched application is ~6h of work', effortMinutes(app({})), 350)
check('a sent SOP and a received LOR cut it right down', effortMinutes(app({ stage: 'applied', sop_status: 'sent', lor_status: 'received' })), 45)
check('a closed application is no work at all', effortMinutes(app({ stage: 'rejected' })), 0)

const soonTask: StudyTask = {
  id: 't1', ...base, course_id: null, title: 'Tiny quiz', type: 'quiz',
  due_at: addDays(SEPT, 1).toISOString(), weight_pct: 2, est_minutes: 30, status: 'todo', notes: '',
}
const merged = queueItems(
  [soonTask],
  [app({ deadline: addDays(SEPT, 3).toISOString(), sop_status: 'none' })],
  SEPT,
)
check('applications join the same queue as coursework', merged.length, 2)
check('a scholarship in 3 days outranks a 2% quiz tomorrow', merged[0].kind, 'application')
check('closed applications stay out of the queue', queueItems([], [app({ stage: 'offer', deadline: addDays(SEPT, 3).toISOString() })], SEPT).length, 0)

/* ── resume export ──────────────────────────────────────────────────────── */
const item = (kind: ResumeItem['kind'], title: string): ResumeItem => ({
  id: `i-${title}`, ...base, kind, title, org: 'Acme & Co', start: '2026-01-01', end: null,
  bullets: ['Shipped <the> thing', 'Cut latency 40%'],
})
const resumeItems = [item('project', 'Rokda.io'), item('education', 'B.Tech')]
const version: ResumeVersion = {
  id: 'v', ...base, name: 'Backend intern', item_ids: resumeItems.map((i) => i.id),
  target_role: 'Backend intern',
}
const resume = buildResume(version, resumeItems)
check('sections come out in resume order', resume.sections.map((s) => s.heading), ['Projects', 'Education'])
check('an ongoing item reads as Present', dateRange(resumeItems[0]).endsWith('Present'), true)
check('markdown export carries the bullets', resumeMarkdown(resume, profile).includes('- Cut latency 40%'), true)

const docx = resumeDocx(resume, { ...profile, name: 'Sarvesh' }, SEPT)
check('the .docx starts with a zip local header', Array.from(docx.slice(0, 4)), [0x50, 0x4b, 0x03, 0x04])
check('it ends with an end-of-central-directory record', Array.from(docx.slice(-22, -18)), [0x50, 0x4b, 0x05, 0x06])
check('crc32 matches the known check value', crc32(new TextEncoder().encode('123456789')), 0xcbf43926)
const docxText = new TextDecoder().decode(docx)
check('XML special characters are escaped, not injected', docxText.includes('Shipped &lt;the&gt; thing'), true)
check('the package declares every part it ships', ['word/document.xml', 'word/styles.xml', 'word/numbering.xml', '[Content_Types].xml'].every((n) => docxText.includes(n)), true)

const resumePath = join(tmpdir(), 'semester-desk-resume.docx')
writeFileSync(resumePath, docx)
console.log(`\nwrote ${resumePath} for external validation`)

/* ── notifications, on device ───────────────────────────────────────────── */
const NIGHT = new Date(2026, 8, 1, 8, 0, 0) // Tuesday 1 September 2026, 08:00

check('quiet hours wrap past midnight', inQuietHours(new Date(2026, 8, 1, 23, 30), ['22:30', '07:00']), true)
check('…and end in the morning', inQuietHours(new Date(2026, 8, 1, 6, 30), ['22:30', '07:00']), true)
check('midday is never quiet', inQuietHours(new Date(2026, 8, 1, 12, 0), ['22:30', '07:00']), false)
check('a daytime quiet window does not wrap', inQuietHours(new Date(2026, 8, 1, 20, 0), ['13:00', '15:00']), false)

const notifyProfile: Profile = {
  ...profile,
  brief_time: '07:00',
  quiet_hours: ['22:30', '07:00'],
  notify: { morning: true, deadline: true, attendance: false, review: true },
}
const slot = (weekday: number, start: string, end: string): TimetableSlot => ({
  id: `s${weekday}${start}`, ...base, course_id: 'c', weekday, start, end, room: 'LT-1', kind: 'lecture',
})
const bigTask: StudyTask = {
  id: 'big', ...base, course_id: 'c', title: 'Final report', type: 'assignment',
  due_at: new Date(2026, 8, 9, 23, 59).toISOString(), weight_pct: 40, est_minutes: 300, status: 'todo', notes: '',
}
const tinyTask: StudyTask = { ...bigTask, id: 'tiny', title: 'Pop quiz', weight_pct: 2, est_minutes: 20 }

const sched = buildSchedule({
  profile: notifyProfile,
  courses: [course('c', 4)],
  slots: [slot(2, '09:00', '10:00')],
  tasks: [bigTask, tinyTask],
  sessions: [],
  cards: [],
  attendance: [],
  now: NIGHT,
  days: 10,
})

check('one morning brief per remaining day', sched.filter((n) => n.kind === 'morning').length, 9)
check('attendance nudges stay off unless asked for', sched.some((n) => n.kind === 'attendance'), false)
check('a 40% report gets its week-out warning', sched.some((n) => n.id === 'task:big:7'), true)
check('a 2% quiz does not', sched.some((n) => n.id === 'task:tiny:7'), false)
check('…but still warns the day before', sched.some((n) => n.id === 'task:tiny:1'), true)
check('nothing lands inside quiet hours', sched.every((n) => !inQuietHours(n.at, notifyProfile.quiet_hours)), true)
// a brief set for 03:00 falls inside the default quiet window, so it is dropped
check('a brief inside quiet hours is suppressed', buildSchedule({
  profile: { ...notifyProfile, brief_time: '03:00' },
  courses: [], slots: [], tasks: [], sessions: [], cards: [], attendance: [], now: NIGHT, days: 5,
}).filter((n) => n.kind === 'morning').length, 0)
check('the list comes out in time order', sched.map((n) => n.at.getTime()).every((t, i, a) => i === 0 || a[i - 1] <= t), true)
check('ids are stable across two builds', buildSchedule({
  profile: notifyProfile, courses: [course('c', 4)], slots: [slot(2, '09:00', '10:00')],
  tasks: [bigTask, tinyTask], sessions: [], cards: [], attendance: [], now: NIGHT, days: 10,
}).map((n) => n.id).join(), sched.map((n) => n.id).join())
check('numeric ids are positive 32-bit ints', [numericId('morning:2026-09-02'), numericId('task:big:7')].every((n) => n > 0 && n < 2 ** 31), true)
check('different keys do not collide', numericId('a') === numericId('b'), false)

const withNudges = buildSchedule({
  profile: { ...notifyProfile, notify: { ...notifyProfile.notify, attendance: true } },
  courses: [course('c', 4)], slots: [slot(2, '09:00', '10:00')],
  tasks: [], sessions: [], cards: [], attendance: [], now: NIGHT, days: 8,
})
// 1–8 September contains two Tuesdays, so a weekly slot nudges twice
check('turning nudges on schedules one per class meeting', withNudges.filter((n) => n.kind === 'attendance').length, 2)

/* ── the coach, computed rather than generated ──────────────────────────── */
const failingAttendance: Attendance[] = [
  ...Array.from({ length: 12 }, (_, i) => ({ id: `p${i}`, ...base, course_id: 'A', slot_id: null, date: '2026-08-10', status: 'present' as const })),
  ...Array.from({ length: 8 }, (_, i) => ({ id: `a${i}`, ...base, course_id: 'A', slot_id: null, date: '2026-08-11', status: 'absent' as const })),
]
const wr = weeklyReview({
  now: SEPT,
  profile,
  courses: [course('A', 4)],
  attendance: failingAttendance,
  assessments: [],
  tasks: [],
  topics: [],
  sessions: [],
  cards: [],
  reviews: [],
})
check('a course under its threshold is urgent', wr.findings.some((f) => f.id === 'att-A' && f.severity === 'urgent'), true)
check('urgent findings sort to the top', wr.findings[0].severity, 'urgent')
check('the finding carries something to do', Boolean(wr.findings[0].action), true)

// a week where the plan was written and executed, and nothing is at risk
const goodSession: StudySession = {
  id: 'ses', ...base, course_id: null, topic_id: null, task_id: null,
  date: dayKey(addDays(SEPT, -2)), kind: 'study', planned_min: 120, actual_min: 120,
  status: 'done', auto: true,
}
const calm = weeklyReview({
  now: SEPT, profile, courses: [], attendance: [], assessments: [], tasks: [], topics: [],
  sessions: [goodSession], cards: [], reviews: [],
})
check('a clean week reports nothing wrong', calm.findings[0].id, 'clear')
check('…and says so in the verdict', calm.verdict.includes('good week'), true)

// an empty week is itself worth flagging
const idle = weeklyReview({
  now: SEPT, profile, courses: [], attendance: [], assessments: [], tasks: [], topics: [],
  sessions: [], cards: [], reviews: [],
})
check('a week with nothing planned or logged is flagged', idle.findings[0].id, 'adherence')

const crit = critique({
  days: 5,
  capacityMin: 60,
  courses: [course('c', 4)],
  topics: [topic('t1', 600, 0)],
  tasks: [{ ...bigTask, due_at: addDays(SEPT, 2).toISOString(), est_minutes: 300 }],
  now: SEPT,
})
check('overloaded windows are not called survivable', crit.survivable, false)
check('cuts free at least the overflow', crit.cuts.reduce((s, c) => s + c.minutes, 0) >= crit.demandMin - crit.capacityMin, true)
check('the cheapest thing goes first', crit.cuts[0].label, 't1')
check('a light window needs no cuts', critique({
  days: 30, capacityMin: 240, courses: [course('c', 4)], topics: [topic('t1', 60, 2)], tasks: [], now: SEPT,
}).cuts.length, 0)

/* ── quiz ───────────────────────────────────────────────────────────────── */
const deck: Card[] = ['alpha', 'beta', 'gamma', 'delta', 'epsilon'].map((n, i) => ({
  id: `card-${n}`, ...base, course_id: 'c', topic_id: 't1', front: `What is ${n}?`, back: `${n} means ${i}`,
  ease: 2.5, interval: 3, reps: 2, due_at: base.updated_at, lapses: n === 'gamma' ? 4 : 0,
  suspended: false, is_formula: false,
}))
const quiz = buildQuiz({ cards: deck, reviews: [], topics: [topic('t1', 60, 0)], length: 4, seed: 42 })
check('a quiz is built at the length asked for', quiz.length, 4)
check('the most-lapsed card is included', quiz.some((q) => q.card.id === 'card-gamma'), true)
check('multiple choice has four options', quiz.filter((q) => q.kind === 'choice').every((q) => q.options.length === 4), true)
check('the answer is among them', quiz.filter((q) => q.kind === 'choice').every((q) => q.options[q.answerIndex] === plainify(q.card.back)), true)
check('no distractor repeats the answer', quiz.filter((q) => q.kind === 'choice').every((q) => new Set(q.options).size === q.options.length), true)
check('the same seed rebuilds the same quiz', buildQuiz({ cards: deck, reviews: [], topics: [], length: 4, seed: 42 }).map((q) => q.card.id).join(), quiz.map((q) => q.card.id).join())
check('a deck of one cannot make a quiz', buildQuiz({ cards: [deck[0]], reviews: [], topics: [] }).length, 0)

const graded = gradeQuiz(
  quiz,
  Object.fromEntries(quiz.map((q, i) => [q.id, i === 0 ? (q.answerIndex + 1) % 4 : q.answerIndex])),
  [topic('t1', 60, 0)],
)
check('grading counts the right ones', graded.correct, quiz.length - 1)
check('and names where the marks went', graded.weakest[0].wrong, 1)

/* ── notes → cards ──────────────────────────────────────────────────────── */
const NOTE = [
  '## Deadlock',
  '',
  'Four conditions must all hold at once.',
  '',
  '- **Mutual exclusion** — only one process may hold the resource',
  '- Circular wait: a cycle exists in the wait-for graph',
  '',
  '| Algorithm | Complexity |',
  '| --- | --- |',
  '| Dijkstra | O((V+E) log V) |',
  '',
  'Variance of a binomial',
  '$$\\operatorname{Var}(X) = np(1-p)$$',
].join('\n')

const found = extractCards(NOTE)
check('a bolded term with a dash becomes a card', found.some((c) => c.front.startsWith('Mutual exclusion')), true)
check('a colon definition becomes a card', found.some((c) => c.front.startsWith('Circular wait')), true)
check('a table row becomes a card', found.some((c) => c.front === 'Dijkstra' && c.back.includes('O((V+E)')), true)
check('a labelled formula becomes a formula card', found.some((c) => c.isFormula && c.back.includes('operatorname')), true)
check('the section is carried through', found.every((c) => c.section === 'Deadlock' || c.section === ''), true)
check('nothing is duplicated', new Set(found.map((c) => c.front + c.back)).size, found.length)
check('empty notes yield nothing', extractCards('').length, 0)
check('prose alone yields nothing card-shaped', extractCards('This is just a paragraph of ordinary prose with no structure.').length, 0)

/* ── attendance, now written through one path ───────────────────────────── */
const att2 = (slotId: string | null, status: AttendanceStatus, id = slotId ?? 'bare'): Attendance => ({
  id, ...base, course_id: 'c', slot_id: slotId, date: '2026-09-01', status,
})

check('nothing logged reads as null', cellStatus([]), null)
check('one status shows that status', cellStatus([att2('s1', 'present')]), 'present')
check('two slots agreeing show the status', cellStatus([att2('s1', 'present'), att2('s2', 'present', 'x')]), 'present')
check('two slots disagreeing show mixed', cellStatus([att2('s1', 'present'), att2('s2', 'absent', 'x')]), 'mixed')
check('the cycle starts at present', nextStatus(null), 'present')
check('present → absent', nextStatus('present'), 'absent')
check('absent → cancelled', nextStatus('absent'), 'cancelled')
check('excused wraps to present', nextStatus('excused'), 'present')
check('mixed collapses to present', nextStatus('mixed'), 'present')

const tuesdaySlots: TimetableSlot[] = [
  slot(2, '09:00', '10:00'),
  { ...slot(2, '14:00', '16:00'), id: 'lab' },
  { ...slot(3, '09:00', '10:00'), id: 'wed' },
]
check('a Tuesday finds both Tuesday slots', slotsFor(tuesdaySlots, 'c', '2026-09-01').length, 2)
check('and none of Wednesday\'s', slotsFor(tuesdaySlots, 'c', '2026-09-01').some((s) => s.id === 'wed'), false)
check('rows are matched by course and date', rowsFor([att2('s1', 'present')], 'c', '2026-09-01').length, 1)
check('a different date matches nothing', rowsFor([att2('s1', 'present')], 'c', '2026-09-02').length, 0)

/* ── SGPA per term, CGPA across them ────────────────────────────────────── */
const termCourse = (id: string, credits: number, semester: string): Course => ({
  ...course(id, credits), semester,
})
const finalMark = (pct: number): Assessment[] => [asm(`final-${pct}`, 100, pct, 100)]

// Sem 3: 4cr at 78 (B+ = 8) and 2cr at 66 (B = 7) → (32 + 14) / 6 = 7.67
// Sem 4: 4cr at 88 (A = 9) → 9.00
// CGPA over all 10 credits: (32 + 14 + 36) / 10 = 8.20
const termEntries = [
  { course: termCourse('A', 4, 'Semester 3'), grade: gradeCourse(finalMark(78), DEFAULT_GRADE_BANDS) },
  { course: termCourse('B', 2, 'Semester 3'), grade: gradeCourse(finalMark(66), DEFAULT_GRADE_BANDS) },
  { course: termCourse('C', 4, 'Semester 4'), grade: gradeCourse(finalMark(88), DEFAULT_GRADE_BANDS) },
]
const terms = bySemester(termEntries, profile)
check('one row per term with grades', terms.length, 2)
check('terms come out in order', terms.map((t) => t.semester), ['Semester 3', 'Semester 4'])
check('Semester 3 SGPA is 7.67', Number((terms[0].gpa ?? 0).toFixed(2)), 7.67)
check('Semester 4 SGPA is 9.00', Number((terms[1].gpa ?? 0).toFixed(2)), 9)
check('CGPA weights across every term', Number((cumulative(termEntries, profile).value ?? 0).toFixed(2)), 8.2)
check('CGPA counts every credit', cumulative(termEntries, profile).credits, 10)
check('an ungraded term is left out rather than scored zero', bySemester([
  ...termEntries,
  { course: termCourse('D', 4, 'Semester 5'), grade: gradeCourse([], DEFAULT_GRADE_BANDS) },
], profile).length, 2)

/* ── Note history: when a save is worth keeping the old body ────────────── */
const t0 = new Date('2026-08-31T10:00:00Z')
const later = (min: number) => new Date(t0.getTime() + min * 60_000)
check('the first real edit always keeps a snapshot', shouldSnapshot('old body', 'new body', null, t0), true)
check('an unchanged body keeps nothing', shouldSnapshot('same', 'same', null, t0), false)
check('there is nothing to lose from an empty note', shouldSnapshot('', 'first words', null, t0), false)
check(
  'a second save inside five minutes is the same sitting',
  shouldSnapshot('a', 'b', t0.toISOString(), later(3)),
  false,
)
check(
  'a save after the gap is a new sitting',
  shouldSnapshot('a', 'b', t0.toISOString(), later(6)),
  true,
)

/* ── Undo of a delete is a restore of the same row ──────────────────────── */
// `remove` writes a tombstone rather than dropping the row, which is the only
// reason Undo can be honest about bringing the same thing back.
const tombstoned = { id: 'x', deleted_at: new Date().toISOString(), updated_at: '' }
const living = { id: 'y', deleted_at: null, updated_at: '' }
check('tombstoned rows are hidden from every read', alive([tombstoned, living]).map((r) => r.id), ['y'])
check('clearing the tombstone brings it back', alive([{ ...tombstoned, deleted_at: null }]).length, 1)

console.log(failures ? `\n${failures} FAILED` : '\nAll checks passed')
process.exit(failures ? 1 : 0)
