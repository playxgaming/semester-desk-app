import {
  db,
  type Application,
  type ApplicationEvent,
  type Assessment,
  type Attendance,
  type Budget,
  type Card,
  type Contact,
  type Course,
  type Habit,
  type HabitLog,
  type Note,
  type Recurring,
  type ResumeItem,
  type ResumeVersion,
  type StudyTask,
  type TimetableSlot,
  type Topic,
  type Transaction,
} from './db'
import { uid } from '@/lib/id'
import { addDays, dayKey } from '@/lib/date'
import { monthKey } from '@/lib/money'

/**
 * A worked demo semester, written once on a fresh install so no screen is
 * ever empty on first open. Settings → "Reset and start empty" clears it.
 */

const SEED_FLAG = 'semester-desk:seeded'

const PALETTE_FOR_PAST = ['#3358CC', '#0B7A50', '#E09400', '#C0392B', '#8B4FD1', '#0E90B3', '#7A8C1F', '#C43C86']

function base() {
  return { user_id: null, updated_at: new Date().toISOString(), deleted_at: null }
}

const COURSES: Omit<Course, 'id' | 'user_id' | 'updated_at' | 'deleted_at'>[] = [
  { code: 'CS301', name: 'Data Structures & Algorithms', credits: 4, colour: '#3358CC', instructor: 'Dr. R. Menon', target_grade: 85, attendance_threshold: 0.75, archived: false, semester: 'Semester 5' },
  { code: 'CS302', name: 'Database Management Systems', credits: 4, colour: '#0B7A50', instructor: 'Prof. A. Iyer', target_grade: 80, attendance_threshold: 0.75, archived: false, semester: 'Semester 5' },
  { code: 'CS303', name: 'Operating Systems', credits: 3, colour: '#E09400', instructor: 'Dr. S. Kulkarni', target_grade: 75, attendance_threshold: 0.75, archived: false, semester: 'Semester 5' },
  { code: 'MA201', name: 'Probability & Statistics', credits: 3, colour: '#C0392B', instructor: 'Dr. N. Bhatt', target_grade: 70, attendance_threshold: 0.75, archived: false, semester: 'Semester 5' },
  { code: 'HS210', name: 'Technical Communication', credits: 2, colour: '#8B4FD1', instructor: 'Ms. P. Rao', target_grade: 80, attendance_threshold: 0.75, archived: false, semester: 'Semester 5' },
]

/** Finished terms: archived, one final mark each, kept only so CGPA is real. */
const PAST: [string, string, string, number, number][] = [
  // semester, code, name, credits, final percentage
  ['Semester 3', 'CS201', 'Discrete Mathematics', 4, 78],
  ['Semester 3', 'CS202', 'Digital Logic', 3, 71],
  ['Semester 3', 'MA101', 'Linear Algebra', 3, 84],
  ['Semester 3', 'HS110', 'Economics', 2, 66],
  ['Semester 4', 'CS210', 'Object-Oriented Programming', 4, 88],
  ['Semester 4', 'CS211', 'Computer Organisation', 4, 74],
  ['Semester 4', 'MA102', 'Numerical Methods', 3, 69],
  ['Semester 4', 'HS120', 'Environmental Studies', 2, 81],
]

const SLOTS: [string, number, string, string, string, TimetableSlot['kind']][] = [
  ['CS301', 1, '09:00', '10:00', 'LT-3', 'lecture'],
  ['CS301', 3, '09:00', '10:00', 'LT-3', 'lecture'],
  ['CS301', 5, '14:00', '16:00', 'Lab-2', 'lab'],
  ['CS302', 1, '10:15', '11:15', 'LT-1', 'lecture'],
  ['CS302', 4, '10:15', '11:15', 'LT-1', 'lecture'],
  ['CS302', 2, '14:00', '16:00', 'Lab-1', 'lab'],
  ['CS303', 2, '09:00', '10:00', 'LT-4', 'lecture'],
  ['CS303', 4, '09:00', '10:00', 'LT-4', 'lecture'],
  ['MA201', 3, '11:30', '12:30', 'LT-2', 'lecture'],
  ['MA201', 5, '11:30', '12:30', 'LT-2', 'lecture'],
  ['MA201', 1, '15:00', '16:00', 'LT-2', 'tutorial'],
  ['HS210', 4, '15:00', '16:00', 'S-12', 'lecture'],
]

const TOPICS: Record<string, [string, number, 0 | 1 | 2 | 3, boolean][]> = {
  CS301: [
    ['Arrays and complexity analysis', 90, 3, false],
    ['Linked lists', 90, 3, false],
    ['Stacks and queues', 75, 2, false],
    ['Trees and BSTs', 150, 2, true],
    ['Heaps and priority queues', 120, 1, true],
    ['Hashing', 100, 1, true],
    ['Graphs: BFS, DFS, shortest paths', 210, 0, true],
    ['Dynamic programming', 240, 0, true],
  ],
  CS302: [
    ['ER modelling', 90, 3, false],
    ['Relational algebra', 120, 2, true],
    ['SQL: joins and subqueries', 150, 2, true],
    ['Normalisation up to BCNF', 150, 1, true],
    ['Transactions and ACID', 120, 1, true],
    ['Indexing and B+ trees', 150, 0, true],
    ['Concurrency control', 120, 0, true],
  ],
  CS303: [
    ['Processes and threads', 90, 2, false],
    ['CPU scheduling', 120, 2, true],
    ['Synchronisation and deadlock', 180, 1, true],
    ['Memory management and paging', 150, 0, true],
    ['File systems', 90, 0, false],
  ],
  MA201: [
    ['Probability axioms', 60, 3, false],
    ['Random variables', 120, 2, true],
    ['Standard distributions', 150, 1, true],
    ['Joint distributions', 120, 0, true],
    ['Hypothesis testing', 150, 0, true],
  ],
  HS210: [
    ['Report structure', 45, 2, false],
    ['Technical presentations', 60, 1, false],
  ],
}

const ASSESSMENTS: Record<string, [string, number, number | null, number, number][]> = {
  // title, weight, score, max, daysAgo (negative = future)
  CS301: [
    ['Quiz 1', 10, 17, 20, 26],
    ['Mid-semester exam', 30, 41, 50, 12],
    ['Lab assessment', 20, null, 50, -9],
    ['End-semester exam', 40, null, 100, -38],
  ],
  CS302: [
    ['Quiz 1', 10, 15, 20, 24],
    ['Mid-semester exam', 30, 33, 50, 11],
    ['Mini project', 20, null, 50, -16],
    ['End-semester exam', 40, null, 100, -36],
  ],
  CS303: [
    ['Quiz 1', 15, 11, 20, 21],
    ['Mid-semester exam', 35, 24, 50, 13],
    ['End-semester exam', 50, null, 100, -34],
  ],
  MA201: [
    ['Assignment 1', 10, 8, 10, 30],
    ['Mid-semester exam', 30, 22, 50, 12],
    ['End-semester exam', 60, null, 100, -40],
  ],
  HS210: [
    ['Presentation', 40, 34, 40, 18],
    ['Final report', 60, null, 60, -20],
  ],
}

const TASKS: [string, string, StudyTask['type'], number, number, number][] = [
  // course, title, type, daysFromNow, weight, estMinutes
  ['CS301', 'DSA Lab: implement AVL rotations', 'assignment', 2, 20, 180],
  ['CS302', 'DBMS mini project — schema + 8 queries', 'project', 6, 20, 420],
  ['CS303', 'OS assignment 2: scheduling simulation', 'assignment', 4, 10, 150],
  ['MA201', 'Problem set 4 (distributions)', 'assignment', 1, 5, 90],
  ['HS210', 'Final report draft', 'assignment', 9, 60, 240],
  ['CS301', 'Graphs unit test', 'quiz', 11, 10, 200],
  ['CS302', 'Normalisation quiz', 'quiz', 8, 10, 120],
]

const CARDS: [string, string, string, boolean][] = [
  ['CS301', 'Average-case time to search a balanced BST of $n$ nodes?', '$O(\\log n)$ — the height of a balanced tree is $\\lfloor \\log_2 n \\rfloor$.', false],
  ['CS301', 'Master theorem, case 2', 'If $T(n) = aT(n/b) + \\Theta(n^{\\log_b a})$ then $T(n) = \\Theta(n^{\\log_b a}\\log n)$.', true],
  ['CS301', 'Why is Dijkstra wrong with negative edges?', 'It finalises a node the first time it is popped; a later negative edge could still lower that distance. Use Bellman–Ford instead.', false],
  ['CS302', 'Definition of BCNF', 'For every non-trivial dependency $X \\to Y$, $X$ must be a superkey.', false],
  ['CS302', 'The four ACID properties', 'Atomicity, Consistency, Isolation, Durability.', false],
  ['CS303', 'Four necessary conditions for deadlock', 'Mutual exclusion, hold and wait, no preemption, circular wait.', false],
  ['CS303', "Belady's anomaly appears in which algorithm?", 'FIFO page replacement — more frames can mean more faults. LRU and OPT are stack algorithms and never show it.', false],
  ['MA201', 'Variance of a binomial $X \\sim B(n,p)$', '$\\operatorname{Var}(X) = np(1-p)$', true],
  ['MA201', 'Bayes theorem', "$P(A\\mid B) = \\dfrac{P(B\\mid A)\\,P(A)}{P(B)}$", true],
  ['MA201', 'Expectation of a Poisson $X \\sim \\text{Pois}(\\lambda)$', '$E[X] = \\lambda$, and $\\operatorname{Var}(X) = \\lambda$ too.', true],
]


/* ── Phase 5: career, money and life ───────────────────────────────────── */

const APPLICATIONS: [string, string, Application['kind'], Application['stage'], number | null, Application['sop_status'], Application['lor_status']][] = [
  // org, role, kind, stage, days from now for the deadline, sop, lor
  ['MEXT Scholarship', 'Undergraduate, Japan', 'scholarship', 'applied', 12, 'sent', 'received'],
  ['Rakuten', 'Summer SWE intern', 'internship', 'interview', 4, 'sent', 'none'],
  ['Zoho', 'Backend intern', 'internship', 'test', 9, 'none', 'none'],
  ['Tokyo Tech', 'Asia Bridge Program', 'university', 'sourced', 26, 'draft', 'requested'],
  ['Smart India Hackathon', 'Team entry', 'competition', 'applied', 18, 'none', 'none'],
  ['Zomato', 'SDE intern', 'internship', 'rejected', null, 'sent', 'none'],
  ['Flipkart', 'Runway intern', 'internship', 'offer', null, 'sent', 'received'],
]

const APP_EVENTS: [string, string, string, number][] = [
  // org, kind, note, days ago
  ['Rakuten', 'applied', 'Applied through the campus portal.', 21],
  ['Rakuten', 'test', 'Online assessment — 3 of 4 solved.', 14],
  ['Rakuten', 'interview', 'Round 1 cleared. Round 2 is systems design.', 3],
  ['MEXT Scholarship', 'email sent', 'SOP and transcripts submitted to the embassy.', 9],
  ['Zoho', 'applied', 'Referred by a senior.', 11],
  ['Flipkart', 'result', 'Offer received — deferred to next summer.', 30],
  ['Zomato', 'result', 'Rejected after round 2. Feedback: weak on DP.', 40],
]

const CONTACTS: [string, string, string, string, number | null][] = [
  ['Dr. R. Menon', 'College — CSE dept', 'menon@example.ac.in', 'Writing the MEXT recommendation. Chased once.', -2],
  ['Aditi Sharma', 'Rakuten', 'aditi@example.com', 'Campus recruiter. Said to ping after round 2.', 5],
  ['Kenji Watanabe', 'Tokyo Tech', 'kenji@example.jp', 'Met at the Asia Bridge webinar; offered to review my SOP.', 12],
]

const RESUME_ITEMS: [ResumeItem['kind'], string, string, string | null, string | null, string[]][] = [
  [
    'project',
    'Rokda.io — multiplayer price-guessing game',
    'Next.js 14 · Supabase · Zustand',
    '2026-01-01',
    '2026-04-01',
    [
      'Built realtime multiplayer rounds on Supabase Realtime for 40+ concurrent players with sub-200ms state sync.',
      'Designed the JWT admin auth and question pipeline; shipped 600 curated products.',
    ],
  ],
  [
    'project',
    'Semester Desk — offline-first student PWA',
    'React · TypeScript · Dexie',
    '2026-08-01',
    null,
    [
      'Local-first architecture: every write lands in IndexedDB first, with a cursor-based sync queue to Postgres.',
      'Implemented SM-2 spaced repetition and a capacity-aware study planner that reports unschedulable load instead of overcommitting.',
    ],
  ],
  [
    'experience',
    'Founder',
    'PlayX Gaming Cafe',
    '2025-06-01',
    null,
    [
      'Run day-to-day operations and built the booking and session-billing system used at the counter.',
    ],
  ],
  [
    'education',
    'B.Tech, Computer Science',
    'College, Jaipur',
    '2026-07-01',
    null,
    ['Coursework: data structures, DBMS, operating systems, probability and statistics.'],
  ],
  [
    'award',
    'CS50x — Introduction to Computer Science',
    'HarvardX via Verizon Skill Forward',
    '2026-02-01',
    null,
    ['Completed the problem sets in C and Python; final project was a small web app.'],
  ],
]

const HABITS: [string, number][] = [
  ['Gym', 1],
  ['Japanese — 20 minutes', 1],
  ['Review cards', 1],
]

const SPEND_PATTERN: [string, number, number][] = [
  // category, times per month, typical amount
  ['Food', 22, 140],
  ['Mess', 1, 3200],
  ['Travel', 8, 90],
  ['Books', 2, 450],
  ['Phone', 1, 299],
  ['Subscriptions', 2, 199],
  ['Fun', 5, 320],
]

async function seedPhase5(now: Date) {
  const orgIds = new Map<string, string>()

  const applications: Application[] = APPLICATIONS.map(
    ([org, role, kind, stage, inDays, sop, lor]) => {
      const id = uid()
      orgIds.set(org, id)
      const deadline = inDays === null ? null : addDays(now, inDays)
      if (deadline) deadline.setHours(23, 59, 0, 0)
      return {
        id,
        ...base(),
        org,
        role,
        kind,
        stage,
        deadline: deadline ? deadline.toISOString() : null,
        link: '',
        note: '',
        resume_version_id: null,
        sop_status: sop,
        lor_status: lor,
      }
    },
  )
  await db.applications.bulkPut(applications)

  await db.application_events.bulkPut(
    APP_EVENTS.filter(([org]) => orgIds.has(org)).map(([org, kind, note, daysAgo]) => ({
      id: uid(),
      ...base(),
      application_id: orgIds.get(org)!,
      at: addDays(now, -daysAgo).toISOString(),
      kind,
      note,
    })) as ApplicationEvent[],
  )

  await db.contacts.bulkPut(
    CONTACTS.map(([name, org, email, note, inDays]) => ({
      id: uid(),
      ...base(),
      name,
      org,
      email,
      last_touch: addDays(now, -10).toISOString(),
      follow_up_at: inDays === null ? null : addDays(now, inDays).toISOString(),
      note,
    })) as Contact[],
  )

  const resumeItems: ResumeItem[] = RESUME_ITEMS.map(([kind, title, org, start, end, bullets]) => ({
    id: uid(),
    ...base(),
    kind,
    title,
    org,
    start,
    end,
    bullets,
  }))
  await db.resume_items.bulkPut(resumeItems)

  const version: ResumeVersion = {
    id: uid(),
    ...base(),
    name: 'Backend intern',
    item_ids: resumeItems.map((i) => i.id),
    target_role: 'Backend engineering intern',
  }
  await db.resume_versions.bulkPut([version])

  // two months of believable student spend
  const transactions: Transaction[] = []
  for (const monthsBack of [1, 0]) {
    const anchor = new Date(now.getFullYear(), now.getMonth() - monthsBack, 1)
    const lastDay = monthsBack === 0 ? now.getDate() : new Date(now.getFullYear(), now.getMonth(), 0).getDate()
    for (const [category, perMonth, typical] of SPEND_PATTERN) {
      const count = monthsBack === 0 ? Math.round((perMonth * lastDay) / 30) : perMonth
      for (let i = 0; i < count; i++) {
        const day = 1 + Math.floor(Math.random() * Math.max(1, lastDay - 1))
        const at = new Date(anchor.getFullYear(), anchor.getMonth(), day, 9 + Math.floor(Math.random() * 12))
        // this month's "Fun" runs hot on purpose, so the burn-down has something to say
        const drift = category === 'Fun' && monthsBack === 0 ? 1.6 : 1
        transactions.push({
          id: uid(),
          ...base(),
          at: at.toISOString(),
          amount: Math.round(typical * drift * (0.7 + Math.random() * 0.6)),
          category,
          method: category === 'Mess' ? 'upi' : Math.random() < 0.7 ? 'upi' : 'cash',
          note: '',
        })
      }
    }
  }
  await db.transactions.bulkPut(transactions)

  const month = monthKey(now)
  await db.budgets.bulkPut(
    [
      ['Food', 4000],
      ['Fun', 1500],
      ['Travel', 900],
    ].map(([category, limit]) => ({
      id: uid(),
      ...base(),
      month,
      category: category as string,
      limit_amount: limit as number,
    })) as Budget[],
  )

  await db.recurring.bulkPut(
    [
      ['Mess fees', 3200, 4],
      ['Phone', 299, 9],
      ['Cloud storage', 130, 19],
    ].map(([name, amount, inDays]) => ({
      id: uid(),
      ...base(),
      name: name as string,
      amount: amount as number,
      cadence: 'monthly' as const,
      next_at: addDays(now, inDays as number).toISOString(),
    })) as Recurring[],
  )

  const habits: Habit[] = HABITS.map(([name, target]) => ({
    id: uid(),
    ...base(),
    name,
    cadence: 'daily' as const,
    target,
    colour: 'var(--ok)',
  }))
  await db.habits.bulkPut(habits)

  const logs: HabitLog[] = []
  for (const h of habits) {
    for (let back = 29; back >= 0; back--) {
      // a believable streak: mostly done, with the odd gap
      if (Math.random() < (back < 6 ? 0.85 : 0.7)) {
        logs.push({
          id: uid(),
          ...base(),
          habit_id: h.id,
          date: dayKey(addDays(now, -back)),
          value: h.target,
        })
      }
    }
  }
  await db.habit_logs.bulkPut(logs)
}

export async function seedIfEmpty(): Promise<void> {
  if (localStorage.getItem(SEED_FLAG)) return
  const count = await db.courses.count()
  if (count > 0) {
    localStorage.setItem(SEED_FLAG, '1')
    return
  }

  const now = new Date()
  const courseIds = new Map<string, string>()

  const courses: Course[] = COURSES.map((c) => {
    const id = uid()
    courseIds.set(c.code, id)
    return { id, ...base(), ...c }
  })
  await db.courses.bulkPut(courses)

  const slots: TimetableSlot[] = SLOTS.map(([code, weekday, start, end, room, kind]) => ({
    id: uid(),
    ...base(),
    course_id: courseIds.get(code)!,
    weekday,
    start,
    end,
    room,
    kind,
  }))
  await db.timetable_slots.bulkPut(slots)

  // four weeks of attendance, mostly present with a believable scatter of misses
  const attendance: Attendance[] = []
  for (let back = 28; back >= 1; back--) {
    const d = addDays(now, -back)
    const key = dayKey(d)
    for (const s of slots.filter((s) => s.weekday === d.getDay())) {
      const r = Math.random()
      const status: Attendance['status'] = r < 0.06 ? 'cancelled' : r < 0.24 ? 'absent' : 'present'
      attendance.push({ id: uid(), ...base(), course_id: s.course_id, slot_id: s.id, date: key, status })
    }
  }
  await db.attendance.bulkPut(attendance)

  const topics: Topic[] = []
  for (const [code, list] of Object.entries(TOPICS)) {
    list.forEach(([name, est, confidence, critical], i) => {
      topics.push({
        id: uid(),
        ...base(),
        course_id: courseIds.get(code)!,
        name,
        order_index: i,
        confidence,
        est_minutes: est,
        exam_critical: critical,
      })
    })
  }
  await db.topics.bulkPut(topics)

  const assessments: Assessment[] = []
  for (const [code, list] of Object.entries(ASSESSMENTS)) {
    for (const [title, weight_pct, score, max, daysAgo] of list) {
      assessments.push({
        id: uid(),
        ...base(),
        course_id: courseIds.get(code)!,
        title,
        weight_pct,
        score,
        max,
        date: dayKey(addDays(now, -daysAgo)),
      })
    }
  }
  // finished semesters — archived so they stay out of the day-to-day views
  const pastCourses: Course[] = []
  const pastAssessments: Assessment[] = []
  PAST.forEach(([semester, code, name, credits, final], i) => {
    const id = uid()
    pastCourses.push({
      id,
      ...base(),
      code,
      name,
      credits,
      colour: PALETTE_FOR_PAST[i % PALETTE_FOR_PAST.length],
      instructor: '',
      target_grade: 80,
      attendance_threshold: 0.75,
      archived: true,
      semester,
    })
    pastAssessments.push({
      id: uid(),
      ...base(),
      course_id: id,
      title: 'Final result',
      weight_pct: 100,
      score: final,
      max: 100,
      date: null,
    })
  })
  await db.courses.bulkPut(pastCourses)
  assessments.push(...pastAssessments)

  await db.assessments.bulkPut(assessments)

  const tasks: StudyTask[] = TASKS.map(([code, title, type, inDays, weight, est]) => {
    const due = addDays(now, inDays)
    due.setHours(23, 59, 0, 0)
    return {
      id: uid(),
      ...base(),
      course_id: courseIds.get(code)!,
      title,
      type,
      due_at: due.toISOString(),
      weight_pct: weight,
      est_minutes: est,
      status: 'todo' as const,
      notes: '',
    }
  })
  await db.tasks.bulkPut(tasks)

  // cards belong to a topic, so the quiz and the planner can both act on a miss
  const topicsByCourse = new Map<string, string[]>()
  for (const t of topics) {
    const list = topicsByCourse.get(t.course_id) ?? []
    list.push(t.id)
    topicsByCourse.set(t.course_id, list)
  }
  const perCourseCount = new Map<string, number>()

  const cards: Card[] = CARDS.map(([code, front, back, is_formula], i) => {
    const due = addDays(now, i % 3 === 0 ? -1 : i % 3 === 1 ? 0 : 2)
    const courseId = courseIds.get(code)!
    const courseTopics = topicsByCourse.get(courseId) ?? []
    const n = perCourseCount.get(courseId) ?? 0
    perCourseCount.set(courseId, n + 1)
    return {
      id: uid(),
      ...base(),
      course_id: courseId,
      topic_id: courseTopics.length ? courseTopics[n % courseTopics.length] : null,
      front,
      back,
      ease: 2.5,
      interval: i % 4,
      reps: i % 3,
      due_at: due.toISOString(),
      lapses: i % 5 === 0 ? 1 : 0,
      suspended: false,
      is_formula,
    }
  })
  await db.cards.bulkPut(cards)

  const notes: Note[] = [
    {
      id: uid(),
      ...base(),
      course_id: courseIds.get('CS301')!,
      topic_id: null,
      title: 'Graph algorithms — the one page that matters',
      pinned: true,
      body_md: `## Traversal

- **BFS** uses a queue, visits by layer, gives the shortest path in an *unweighted* graph.
- **DFS** uses a stack (or recursion) and is what you want for cycle detection and topological order.

Both are $O(V + E)$ on an adjacency list.

## Shortest paths

| when | use |
| --- | --- |
| unweighted | BFS |
| non-negative weights | Dijkstra, $O((V+E)\\log V)$ |
| negative weights | Bellman–Ford, $O(VE)$ |

> Dijkstra finalises a node the moment it is popped. A negative edge discovered later cannot undo that, which is exactly why it breaks.

## The relaxation step

$$d[v] \\leftarrow \\min\\bigl(d[v],\\; d[u] + w(u,v)\\bigr)$$

Every shortest-path algorithm on this page is a different answer to *what order do I relax in*.`,
    },
    {
      id: uid(),
      ...base(),
      course_id: courseIds.get('MA201')!,
      topic_id: null,
      title: 'Distributions cheat sheet',
      pinned: false,
      body_md: `- Binomial $X \\sim B(n,p)$: $E[X] = np$, $\\operatorname{Var}(X) = np(1-p)$
- Poisson $X \\sim \\text{Pois}(\\lambda)$: mean and variance are both $\\lambda$
- Exponential, rate $\\lambda$: $E[X] = 1/\\lambda$, memoryless
- Normal $X \\sim N(\\mu, \\sigma^2)$: standardise with $Z = \\dfrac{X - \\mu}{\\sigma}$

Poisson approximates the binomial when $n$ is large and $p$ small, with $\\lambda = np$.`,
    },
  ]
  await db.notes.bulkPut(notes)

  await seedPhase5(now)

  localStorage.setItem(SEED_FLAG, '1')
}

export async function wipeEverything(): Promise<void> {
  // Native alarms live outside IndexedDB; clearing records must clear their
  // reminders too. Stop before deleting if the platform cannot cancel them.
  const { applySchedule } = await import('@/lib/notify')
  await applySchedule([])
  await db.delete()
  const keys = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i))
  for (const key of keys) if (key?.startsWith('semester-desk:')) localStorage.removeItem(key)
  localStorage.setItem(SEED_FLAG, '1') // do not re-seed after a deliberate wipe
  window.location.reload()
}
