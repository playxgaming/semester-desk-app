import { db, SYNCED_TABLES, type SyncedTable } from '@/db/db'
import { getSupabase, getUserId, SUPABASE_CONFIGURED, syncEnabled } from './supabase'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Push then pull, both cursor-based, both safe to call at any time.
 *
 * Conflict rule: last write wins by `updated_at`. For one person on two
 * devices that is right almost always and costs nothing. Notes are the
 * exception — a remote body that differs from the local one is kept as a
 * version rather than silently overwriting, which is what `note_versions`
 * is for.
 */

export type SyncState = 'idle' | 'syncing' | 'offline' | 'error' | 'disabled'

let running = false
const listeners = new Set<(s: SyncState, detail?: string) => void>()
let state: SyncState = 'disabled'

export function onSyncState(fn: (s: SyncState, detail?: string) => void): () => void {
  listeners.add(fn)
  fn(state)
  return () => {
    listeners.delete(fn)
  }
}

function set(s: SyncState, detail?: string) {
  state = s
  listeners.forEach((l) => l(s, detail))
}

export async function pendingCount(): Promise<number> {
  return db.outbox.count()
}

async function push(sb: SupabaseClient): Promise<number> {
  const batch = await db.outbox.orderBy('seq').limit(200).toArray()
  if (!batch.length) return 0
  const userId = getUserId()

  // Collapse to the last write per row — no point replaying six edits.
  const byRow = new Map<string, (typeof batch)[number]>()
  for (const m of batch) byRow.set(`${m.table}:${m.row_id}`, m)

  const byTable = new Map<string, unknown[]>()
  for (const m of byRow.values()) {
    const row = { ...(m.payload as Record<string, unknown>), user_id: userId }
    const list = byTable.get(m.table) ?? []
    list.push(row)
    byTable.set(m.table, list)
  }

  for (const [table, rows] of byTable) {
    const { error } = await sb.from(table).upsert(rows as never, { onConflict: 'id' })
    if (error) throw new Error(`${table}: ${error.message}`)
  }

  await db.outbox.bulkDelete(batch.map((b) => b.seq!).filter(Boolean) as number[])
  return batch.length
}

async function pullTable(sb: SupabaseClient, table: SyncedTable): Promise<number> {
  const cursor = await db.sync_cursors.get(table)
  const since = cursor?.last_pulled_at ?? '1970-01-01T00:00:00Z'

  const { data, error } = await sb
    .from(table)
    .select('*')
    .gt('updated_at', since)
    .order('updated_at', { ascending: true })
    .limit(1000)

  if (error) throw new Error(`${table}: ${error.message}`)
  const rows = (data ?? []) as { id: string; updated_at: string; [k: string]: unknown }[]
  if (!rows.length) return 0

  const local = db[table] as unknown as {
    get(id: string): Promise<Record<string, unknown> | undefined>
    bulkPut(rows: unknown[]): Promise<unknown>
  }

  const toWrite: unknown[] = []
  for (const remote of rows) {
    const mine = await local.get(remote.id)
    if (mine && String(mine.updated_at) > remote.updated_at) continue // ours is newer

    if (table === 'notes' && mine && mine.body_md !== remote.body_md) {
      // Never lose a paragraph typed on the bus.
      await db.note_versions.put({
        id: `${remote.id}:${String(mine.updated_at)}`,
        user_id: getUserId(),
        updated_at: new Date().toISOString(),
        deleted_at: null,
        note_id: remote.id,
        body_md: String(mine.body_md ?? ''),
        at: String(mine.updated_at),
        source: 'local',
      })
    }
    toWrite.push(remote)
  }

  if (toWrite.length) await local.bulkPut(toWrite)
  await db.sync_cursors.put({ table, last_pulled_at: rows[rows.length - 1].updated_at })
  return rows.length
}

export async function syncNow(): Promise<{ pushed: number; pulled: number } | null> {
  const sb = await getSupabase()
  if (!sb || !syncEnabled()) {
    set('disabled')
    return null
  }
  if (!navigator.onLine) {
    set('offline')
    return null
  }
  if (running) return null
  running = true
  set('syncing')
  try {
    const pushed = await push(sb)
    let pulled = 0
    for (const t of SYNCED_TABLES) pulled += await pullTable(sb, t)
    set('idle')
    return { pushed, pulled }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    set('error', msg)
    return null
  } finally {
    running = false
  }
}

let timer: number | undefined

export function startSync() {
  if (!SUPABASE_CONFIGURED) {
    set('disabled')
    return
  }
  void syncNow()
  window.addEventListener('online', () => void syncNow())
  window.addEventListener('offline', () => set('offline'))
  timer = window.setInterval(() => void syncNow(), 60_000)
}

export function stopSync() {
  if (timer) window.clearInterval(timer)
}
