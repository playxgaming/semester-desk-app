import type { Attendance } from '@/db/db'

/**
 * The skip calculator. Cancelled classes are not held, so they leave the
 * ratio untouched; excused absences count as held but not attended unless
 * your institution says otherwise.
 */

export interface AttendanceStats {
  present: number
  absent: number
  excused: number
  cancelled: number
  held: number
  pct: number | null
  threshold: number
  meets: boolean
  /** How many more you can miss and still be at or above the threshold. */
  canSkip: number
  /** How many in a row you must now attend to climb back to it. */
  mustAttend: number
  message: string
}

export function attendanceStats(rows: Attendance[], threshold: number): AttendanceStats {
  const present = rows.filter((r) => r.status === 'present').length
  const absent = rows.filter((r) => r.status === 'absent').length
  const excused = rows.filter((r) => r.status === 'excused').length
  const cancelled = rows.filter((r) => r.status === 'cancelled').length
  const held = present + absent + excused
  const pct = held > 0 ? present / held : null
  const meets = pct === null ? true : pct >= threshold

  // present / (held + k) ≥ t  ⇒  k ≤ present/t − held
  const canSkip = held === 0 ? 0 : Math.max(0, Math.floor(present / threshold - held))
  // (present + m) / (held + m) ≥ t  ⇒  m ≥ (t·held − present) / (1 − t)
  const mustAttend =
    threshold >= 1
      ? Number.POSITIVE_INFINITY
      : Math.max(0, Math.ceil((threshold * held - present) / (1 - threshold)))

  let message: string
  if (held === 0) {
    message = 'No classes logged yet.'
  } else if (meets) {
    message =
      canSkip > 0
        ? `You can miss ${canSkip} more and stay above ${Math.round(threshold * 100)}%.`
        : `Exactly at the line — the next miss drops you below ${Math.round(threshold * 100)}%.`
  } else {
    message = `Below the line. Attend the next ${mustAttend} in a row to get back to ${Math.round(threshold * 100)}%.`
  }

  return { present, absent, excused, cancelled, held, pct, threshold, meets, canSkip, mustAttend, message }
}

/** Forecast: where the percentage lands if you attend `a` of the next `n`. */
export function projectAttendance(s: AttendanceStats, attend: number, outOf: number): number {
  const held = s.held + outOf
  if (!held) return 0
  return (s.present + attend) / held
}
