import { db, SYNCED_TABLES } from '@/db/db'

/**
 * Your data is yours: one file, every table, readable without the app and
 * importable back into it. No account required to read it.
 */

export interface Backup {
  app: 'semester-desk'
  version: 2
  exported_at: string
  tables: Record<string, unknown[]>
}

export async function exportJson(): Promise<Backup> {
  const tables: Record<string, unknown[]> = {}
  for (const t of SYNCED_TABLES) {
    tables[t] = await (db as unknown as Record<string, { toArray(): Promise<unknown[]> }>)[t].toArray()
  }
  return { app: 'semester-desk', version: 2, exported_at: new Date().toISOString(), tables }
}

export function download(name: string, content: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return ''
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))]
  const cell = (v: unknown) => {
    const s = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n')
}

export async function exportCsvBundle(): Promise<string> {
  const backup = await exportJson()
  return Object.entries(backup.tables)
    .filter(([, rows]) => rows.length)
    .map(([name, rows]) => `# ${name}\n${toCsv(rows as Record<string, unknown>[])}`)
    .join('\n\n')
}

export async function importJson(text: string): Promise<{ tables: number; rows: number }> {
  const parsed = JSON.parse(text) as Backup
  if (parsed.app !== 'semester-desk') throw new Error('That file is not a Semester Desk backup.')
  let tables = 0
  let rows = 0
  for (const [name, list] of Object.entries(parsed.tables)) {
    const table = (db as unknown as Record<string, { bulkPut(v: unknown[]): Promise<unknown> } | undefined>)[name]
    if (!table || !Array.isArray(list) || !list.length) continue
    await table.bulkPut(list)
    tables += 1
    rows += list.length
  }
  return { tables, rows }
}

/** Same, for binary payloads (the .docx export). */
export function downloadBytes(name: string, bytes: Uint8Array, type: string) {
  const buffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buffer).set(bytes)
  const url = URL.createObjectURL(new Blob([buffer], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
