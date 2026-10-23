import { db, type Attachment } from './db'
import { alive, put, remove } from './mutate'
import { uid } from '@/lib/id'

/**
 * The resource bank: past papers, slide decks, problem sheets, the PDF the
 * lecturer put up once and then deleted.
 *
 * Bytes live in a local-only `blobs` table; the metadata row is an ordinary
 * synced `attachments` record pointing at it. That split means a file never
 * leaves the device even if sync is switched on later, and a backup export
 * stays a readable JSON file rather than a hundred megabytes of base64.
 */

/** Past this size a single file starts to be a liability on a phone. */
export const MAX_FILE_BYTES = 25 * 1024 * 1024

export function humanBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

export function blobId(a: Attachment): string | null {
  return a.storage_path.startsWith('local:') ? a.storage_path.slice(6) : null
}

export async function listAttachments(
  parentType: Attachment['parent_type'],
  parentId: string,
): Promise<Attachment[]> {
  const rows = alive(await db.attachments.toArray())
  return rows
    .filter((a) => a.parent_type === parentType && a.parent_id === parentId)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
}

export async function saveFile(
  parentType: Attachment['parent_type'],
  parentId: string,
  file: File,
): Promise<{ ok: true; attachment: Attachment } | { ok: false; message: string }> {
  if (file.size > MAX_FILE_BYTES) {
    return {
      ok: false,
      message: `${file.name} is ${humanBytes(file.size)}. Files over ${humanBytes(MAX_FILE_BYTES)} are kept out — a phone's storage is not a filing cabinet.`,
    }
  }

  const id = uid()
  try {
    await db.blobs.put({ id, data: file })
  } catch {
    return {
      ok: false,
      message: 'The device refused to store that file. It may be out of space.',
    }
  }

  const attachment = await put('attachments', {
    id: uid(),
    user_id: null,
    updated_at: '',
    deleted_at: null,
    parent_type: parentType,
    parent_id: parentId,
    name: file.name,
    storage_path: `local:${id}`,
    kind: file.type || 'application/octet-stream',
    size: file.size,
  })
  return { ok: true, attachment }
}

export async function readFile(a: Attachment): Promise<Blob | null> {
  const id = blobId(a)
  if (!id) return null
  const row = await db.blobs.get(id)
  return row?.data ?? null
}

/** A URL the page can point an <img> or a link at. Revoke it when done. */
export async function fileUrl(a: Attachment): Promise<string | null> {
  const blob = await readFile(a)
  return blob ? URL.createObjectURL(blob) : null
}

/**
 * Deleting a file removes the metadata row and leaves the bytes alone, so an
 * Undo on the toast is real rather than a promise the app cannot keep. The
 * bytes are collected later by `purgeOrphanBlobs`, once the undo window is
 * long past.
 */
export async function deleteFile(a: Attachment): Promise<void> {
  await remove('attachments', a.id)
}

/** How long a deleted file's bytes are kept in case you want it back. */
const GRACE_MS = 24 * 60 * 60 * 1000

/**
 * Reclaim the bytes of files whose metadata row was deleted more than a day
 * ago, plus any blob no row points at (an import, an interrupted save). Runs
 * at startup; cheap, because it only reads keys and the small metadata table.
 */
export async function purgeOrphanBlobs(): Promise<number> {
  const rows = await db.attachments.toArray()
  const keep = new Set<string>()
  const cutoff = Date.now() - GRACE_MS
  for (const a of rows) {
    const id = blobId(a)
    if (!id) continue
    if (!a.deleted_at || new Date(a.deleted_at).getTime() > cutoff) keep.add(id)
  }
  const all = (await db.blobs.toCollection().primaryKeys()) as string[]
  const dead = all.filter((id) => !keep.has(id))
  if (dead.length) await db.blobs.bulkDelete(dead)
  return dead.length
}

/** Total bytes held, so Settings can be honest about what is on the device. */
export async function storageUsed(): Promise<{ files: number; bytes: number }> {
  const rows = alive(await db.attachments.toArray())
  return {
    files: rows.length,
    bytes: rows.reduce((s, a) => s + (a.size || 0), 0),
  }
}

export function isImage(a: Attachment): boolean {
  return a.kind.startsWith('image/')
}

export function isPdf(a: Attachment): boolean {
  return a.kind === 'application/pdf' || a.name.toLowerCase().endsWith('.pdf')
}
