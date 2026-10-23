import { patch, remove, restore, type TableRow } from '@/db/mutate'
import { db, type SyncedTable } from '@/db/db'
import { useUi } from '@/store/ui'
import { tap } from '@/lib/haptics'

/**
 * Destructive taps, with a way back.
 *
 * On a phone the difference between "delete" and "delete by accident" is a
 * few millimetres, and a row that vanishes silently is the fastest way to
 * make someone distrust an app. Every delete here is a soft delete, so Undo
 * is not a re-creation — it is the same row, with the same id, un-tombstoned.
 */
export async function removeWithUndo(
  table: SyncedTable,
  id: string,
  label: string,
): Promise<void> {
  await remove(table, id)
  void tap()
  useUi.getState().notify(`${label} deleted`, 'warn', async () => {
    const ok = await restore(table, id)
    useUi.getState().notify(ok ? `${label} restored` : `${label} could not be restored`, ok ? 'ok' : 'crit')
  })
}

/**
 * A status change that makes something leave the list it was in — ticking a
 * deadline done, mostly. Same idea: say what happened, and offer the way back.
 */
export async function patchWithUndo<K extends keyof TableRow>(
  table: K,
  id: string,
  changes: Partial<TableRow[K]>,
  message: string,
): Promise<void> {
  // read the old values first — `patch` hands back the row after the change
  const table_ = (db as unknown as Record<string, { get(id: string): Promise<unknown> }>)[
    table as string
  ]
  const before = (await table_.get(id)) as Record<string, unknown> | undefined
  if (!before) return
  const previous = Object.fromEntries(
    (Object.keys(changes) as string[]).map((k) => [k, before[k]]),
  ) as Partial<TableRow[K]>
  await patch(table, id, changes)
  void tap()
  useUi.getState().notify(message, 'ok', async () => {
    await patch(table, id, previous)
  })
}
