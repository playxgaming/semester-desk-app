import { db, type NoteVersion } from './db'
import { alive, patch, put } from './mutate'
import { uid } from '@/lib/id'

/**
 * Note history.
 *
 * A note is the one place in this app where a careless keystroke can destroy
 * work that took an hour — you cannot un-paste over four paragraphs. So every
 * save that lands more than a few minutes after the last one keeps a snapshot
 * of what the note said *before* the edit. It is a local table, it never
 * leaves the device, and it is capped so a note edited daily for a semester
 * does not quietly become the largest thing in the database.
 */

/** Two saves inside this window are one edit; only the first keeps a snapshot. */
export const SNAPSHOT_GAP_MS = 5 * 60 * 1000

/** How many snapshots a single note keeps before the oldest are dropped. */
export const MAX_VERSIONS = 20

/**
 * Whether this save is worth a snapshot: the body actually changed, there was
 * something there to lose, and the last snapshot is old enough that this
 * counts as a separate sitting rather than the same one.
 */
export function shouldSnapshot(
  previousBody: string,
  nextBody: string,
  lastSnapshotAt: string | null,
  now = new Date(),
): boolean {
  if (previousBody === nextBody) return false
  if (!previousBody.trim()) return false
  if (!lastSnapshotAt) return true
  return now.getTime() - new Date(lastSnapshotAt).getTime() > SNAPSHOT_GAP_MS
}

export async function listVersions(noteId: string): Promise<NoteVersion[]> {
  const rows = alive(await db.note_versions.toArray())
  return rows.filter((v) => v.note_id === noteId).sort((a, b) => b.at.localeCompare(a.at))
}

/**
 * Save a note, keeping the previous body if this looks like a distinct
 * editing session rather than another keystroke in the same one.
 */
export async function saveNote(
  noteId: string,
  changes: { title: string; body_md: string },
  now = new Date(),
): Promise<{ snapshot: boolean }> {
  const current = await db.notes.get(noteId)
  if (!current) return { snapshot: false }

  const unchanged = current.body_md === changes.body_md && current.title === changes.title
  if (unchanged) return { snapshot: false }

  const versions = await listVersions(noteId)
  let snapshot = false
  if (shouldSnapshot(current.body_md, changes.body_md, versions[0]?.at ?? null, now)) {
    await put('note_versions', {
      id: uid(),
      user_id: null,
      updated_at: '',
      deleted_at: null,
      note_id: noteId,
      body_md: current.body_md,
      at: now.toISOString(),
      source: 'local',
    })
    snapshot = true

    const all = await listVersions(noteId)
    const extra = all.slice(MAX_VERSIONS)
    if (extra.length) await db.note_versions.bulkDelete(extra.map((v) => v.id))
  }

  await patch('notes', noteId, changes)
  return { snapshot }
}

/**
 * Put an older body back, keeping the current one as a version first — so
 * restoring is itself undoable by restoring the version it just created.
 */
export async function restoreVersion(version: NoteVersion): Promise<void> {
  const note = await db.notes.get(version.note_id)
  if (!note) return
  await put('note_versions', {
    id: uid(),
    user_id: null,
    updated_at: '',
    deleted_at: null,
    note_id: version.note_id,
    body_md: note.body_md,
    at: new Date().toISOString(),
    source: 'local',
  })
  await patch('notes', version.note_id, { body_md: version.body_md })
}
