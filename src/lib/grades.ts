import type { Assessment, Course, GradeBand, Profile } from '@/db/db'

/**
 * Grade maths. Default scheme is a 10-point CGPA with a 90/80/70/… band
 * table — the common Indian university rule — but every band is editable in
 * settings, and the same functions serve the 4.0 and straight-percentage
 * schemes.
 */

export interface CourseGrade {
  /** Weight already assessed, as a percentage of the final mark. */
  gradedWeight: number
  /** Marks earned so far, expressed against the *whole* course out of 100. */
  earnedOfTotal: number
  /** Score across what has been graded — the number people mean by "my mark". */
  currentPct: number | null
  /** Weight still to be assessed. */
  remainingWeight: number
  /** Best still achievable if everything remaining is perfect. */
  ceilingPct: number
  band: GradeBand | null
  points: number | null
}

export function gradeCourse(assessments: Assessment[], bands: GradeBand[]): CourseGrade {
  const graded = assessments.filter((a) => a.score !== null && a.max > 0)
  const gradedWeight = graded.reduce((s, a) => s + a.weight_pct, 0)
  const earnedOfTotal = graded.reduce((s, a) => s + (a.score! / a.max) * a.weight_pct, 0)
  const totalWeight = assessments.reduce((s, a) => s + a.weight_pct, 0)
  const remainingWeight = Math.max(0, Math.max(100, totalWeight) - gradedWeight)
  const currentPct = gradedWeight > 0 ? (earnedOfTotal / gradedWeight) * 100 : null
  const ceilingPct = earnedOfTotal + remainingWeight
  const band = currentPct === null ? null : bandFor(currentPct, bands)
  return {
    gradedWeight,
    earnedOfTotal,
    currentPct,
    remainingWeight,
    ceilingPct,
    band,
    points: band ? band.points : null,
  }
}

export function bandFor(pct: number, bands: GradeBand[]): GradeBand {
  const sorted = [...bands].sort((a, b) => b.min_pct - a.min_pct)
  return sorted.find((b) => pct >= b.min_pct) ?? sorted[sorted.length - 1]
}

export interface NeedResult {
  status: 'reachable' | 'locked-in' | 'impossible' | 'no-data'
  /** Average required on every remaining assessment, as a percentage. */
  required: number
  remainingWeight: number
  message: string
}

/**
 * "What do I need on the rest to finish on `target`?"
 *
 * earned + remainingWeight × x/100 = target
 * ⇒ x = (target − earned) ÷ remainingWeight × 100
 */
export function whatDoINeed(g: CourseGrade, target: number): NeedResult {
  if (g.remainingWeight <= 0) {
    return {
      status: g.earnedOfTotal >= target ? 'locked-in' : 'impossible',
      required: 0,
      remainingWeight: 0,
      message:
        g.earnedOfTotal >= target
          ? `Everything is graded and you cleared ${target}%.`
          : `Everything is graded — this course finished at ${g.earnedOfTotal.toFixed(1)}%.`,
    }
  }
  const required = ((target - g.earnedOfTotal) / g.remainingWeight) * 100
  if (required <= 0) {
    return {
      status: 'locked-in',
      required: 0,
      remainingWeight: g.remainingWeight,
      message: `Already banked. Even a zero on the remaining ${g.remainingWeight}% clears ${target}%.`,
    }
  }
  if (required > 100) {
    return {
      status: 'impossible',
      required,
      remainingWeight: g.remainingWeight,
      message: `Out of reach: you would need ${required.toFixed(1)}% on the remaining ${g.remainingWeight}%. Ceiling is ${g.ceilingPct.toFixed(1)}%.`,
    }
  }
  return {
    status: 'reachable',
    required,
    remainingWeight: g.remainingWeight,
    message: `Average ${required.toFixed(1)}% across the remaining ${g.remainingWeight}% of the marks.`,
  }
}

export interface GpaResult {
  value: number | null
  credits: number
  scheme: Profile['grading_scheme']
  perCourse: { course: Course; grade: CourseGrade }[]
}

/** SGPA = Σ(grade points × credits) ÷ Σ credits. Ungraded courses sit out. */
export function computeGpa(
  entries: { course: Course; grade: CourseGrade }[],
  profile: Profile,
): GpaResult {
  const scored = entries.filter((e) => e.grade.points !== null && e.course.credits > 0)
  const credits = scored.reduce((s, e) => s + e.course.credits, 0)
  if (!credits) return { value: null, credits: 0, scheme: profile.grading_scheme, perCourse: entries }

  if (profile.grading_scheme === 'percent') {
    const weighted = scored.reduce((s, e) => s + (e.grade.currentPct ?? 0) * e.course.credits, 0)
    return { value: weighted / credits, credits, scheme: 'percent', perCourse: entries }
  }
  const weighted = scored.reduce((s, e) => s + (e.grade.points ?? 0) * e.course.credits, 0)
  const raw = weighted / credits
  // grade_bands are authored on whatever scale the scheme uses, so no rescaling here
  return { value: raw, credits, scheme: profile.grading_scheme, perCourse: entries }
}

export function formatGpa(g: GpaResult): string {
  if (g.value === null) return '—'
  return g.scheme === 'percent' ? `${g.value.toFixed(1)}%` : g.value.toFixed(2)
}

export interface SemesterResult {
  semester: string
  gpa: number | null
  credits: number
  courses: number
}

/**
 * SGPA per term, oldest first. Only terms with at least one graded course
 * appear — an empty semester has no grade point average, and inventing a zero
 * for it would drag the trend line through a number that never happened.
 */
export function bySemester(
  entries: { course: Course; grade: CourseGrade }[],
  profile: Profile,
): SemesterResult[] {
  const terms = new Map<string, { course: Course; grade: CourseGrade }[]>()
  for (const e of entries) {
    const key = e.course.semester || profile.current_semester || 'Semester 1'
    terms.set(key, [...(terms.get(key) ?? []), e])
  }
  return [...terms.entries()]
    .map(([semester, list]) => {
      const g = computeGpa(list, profile)
      return { semester, gpa: g.value, credits: g.credits, courses: list.length }
    })
    .filter((t) => t.credits > 0)
    .sort((a, b) => a.semester.localeCompare(b.semester, undefined, { numeric: true }))
}

/**
 * CGPA — the credit-weighted mean across every term, which is simply the same
 * calculation run over all courses at once rather than per term.
 */
export function cumulative(
  entries: { course: Course; grade: CourseGrade }[],
  profile: Profile,
): GpaResult {
  return computeGpa(entries, profile)
}

export const GPA_MAX: Record<Profile['grading_scheme'], number> = {
  cgpa10: 10,
  gpa4: 4,
  percent: 100,
}
