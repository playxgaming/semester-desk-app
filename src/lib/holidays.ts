/**
 * Public holidays, from the one free API this app uses.
 *
 * Nager's holiday API needs no key, no account and no sign-up, and it is the
 * only network call in the whole application. It is strictly optional: you
 * press a button, it fills your timetable exceptions for the year, and if it
 * fails nothing else is affected. The app never calls it on its own.
 *
 * Because the response shape differs between the two hosts Nager publishes,
 * the parser below reads whatever it gets rather than trusting one schema.
 */

export interface Holiday {
  date: string // "2026-01-26"
  name: string
}

const ENDPOINTS = (country: string, year: number) => [
  `https://date.nager.at/api/v3/PublicHolidays/${year}/${country}`,
  `https://nagerholidays.com/api/v4/Holidays/${country}/${year}`,
]

/** Pull the date and a human name out of a row whatever it is called. */
function normalise(row: unknown): Holiday | null {
  if (!row || typeof row !== 'object') return null
  const r = row as Record<string, unknown>
  const dateRaw =
    r.date ?? r.Date ?? r.observedDate ?? r.startDate ?? (r as { day?: unknown }).day
  const nameRaw = r.localName ?? r.name ?? r.Name ?? r.englishName ?? r.title
  const date = typeof dateRaw === 'string' ? dateRaw.slice(0, 10) : null
  const name = typeof nameRaw === 'string' ? nameRaw.trim() : null
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !name) return null
  return { date, name }
}

export interface FetchResult {
  ok: boolean
  holidays: Holiday[]
  message: string
}

export async function fetchHolidays(
  country: string,
  year: number,
  signal?: AbortSignal,
): Promise<FetchResult> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { ok: false, holidays: [], message: 'You are offline — try this when you have a connection.' }
  }

  let lastError = 'Could not reach the holiday service.'
  for (const url of ENDPOINTS(country, year)) {
    try {
      const res = await fetch(url, { signal, headers: { accept: 'application/json' } })
      if (!res.ok) {
        lastError = `The holiday service answered ${res.status}.`
        continue
      }
      const body: unknown = await res.json()
      const rows = Array.isArray(body)
        ? body
        : Array.isArray((body as { holidays?: unknown[] })?.holidays)
          ? (body as { holidays: unknown[] }).holidays
          : []
      const holidays = rows
        .map(normalise)
        .filter((h): h is Holiday => h !== null)
        .filter((h, i, arr) => arr.findIndex((x) => x.date === h.date) === i)
        .sort((a, b) => a.date.localeCompare(b.date))

      if (holidays.length) {
        return {
          ok: true,
          holidays,
          message: `${holidays.length} public holidays found for ${country} in ${year}.`,
        }
      }
      lastError = 'The holiday service returned nothing usable for that country and year.'
    } catch (e) {
      lastError =
        e instanceof Error && e.name === 'AbortError'
          ? 'Cancelled.'
          : 'Could not reach the holiday service. It is optional — you can add holidays by hand.'
    }
  }
  return { ok: false, holidays: [], message: lastError }
}

/** A few countries worth offering; the API covers 100+ more. */
export const COUNTRIES = [
  { code: 'IN', name: 'India' },
  { code: 'JP', name: 'Japan' },
  { code: 'US', name: 'United States' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'DE', name: 'Germany' },
  { code: 'SG', name: 'Singapore' },
  { code: 'AU', name: 'Australia' },
  { code: 'CA', name: 'Canada' },
]
