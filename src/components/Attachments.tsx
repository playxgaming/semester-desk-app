import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ExternalLink, FileText, ImageIcon, Paperclip, Trash2 } from 'lucide-react'
import { Badge, Button, Modal } from '@/components/ui'
import { db, type Attachment } from '@/db/db'
import { restore } from '@/db/mutate'
import {
  deleteFile,
  fileUrl,
  humanBytes,
  isImage,
  isPdf,
  listAttachments,
  saveFile,
} from '@/db/files'
import { tap } from '@/lib/haptics'
import { useUi } from '@/store/ui'

/**
 * Files attached to a course or a deadline — the resource bank.
 *
 * Everything is stored in the app's own database, so a past paper you saved
 * in September is still there in December whether or not the portal it came
 * from still exists, and whether or not you have signal.
 */
export function Attachments({
  parentType,
  parentId,
  label = 'Files',
}: {
  parentType: Attachment['parent_type']
  parentId: string
  label?: string
}) {
  const notify = useUi((s) => s.notify)
  const inputRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<{ a: Attachment; url: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const files =
    useLiveQuery(async () => listAttachments(parentType, parentId), [parentType, parentId]) ?? []

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview.url)
    }
  }, [preview])

  async function add(list: FileList | null) {
    if (!list?.length) return
    setBusy(true)
    try {
      let added = 0
      for (const file of Array.from(list)) {
        const res = await saveFile(parentType, parentId, file)
        if (res.ok) added += 1
        else notify(res.message, 'warn')
      }
      if (added) {
        notify(`${added} file${added === 1 ? '' : 's'} saved to this device`)
        void tap()
      }
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  async function open(a: Attachment) {
    const url = await fileUrl(a)
    if (!url) {
      notify('The file could not be read back — it may have been cleared.', 'crit')
      return
    }
    if (isImage(a) || isPdf(a)) {
      setPreview({ a, url })
      return
    }
    // everything else is handed to whatever the platform uses for that type
    const link = document.createElement('a')
    link.href = url
    link.target = '_blank'
    link.rel = 'noopener noreferrer'
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 30_000)
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="eyebrow flex items-center gap-1.5">
          <Paperclip size={12} /> {label}
        </span>
        {files.length ? (
          <Badge>
            {files.length} · {humanBytes(files.reduce((s, f) => s + f.size, 0))}
          </Badge>
        ) : null}
        <Button
          size="sm"
          className="ml-auto"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? 'Saving…' : 'Add files'}
        </Button>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => void add(e.target.files)}
        />
      </div>

      {files.length ? (
        <ul className="-my-1">
          {files.map((f) => (
            <li
              key={f.id}
              className="flex items-center gap-2.5 border-b border-rule py-2 last:border-0"
            >
              {isImage(f) ? (
                <ImageIcon size={15} className="shrink-0 text-ink-3" />
              ) : (
                <FileText size={15} className="shrink-0 text-ink-3" />
              )}
              <button
                type="button"
                className="tap-text min-w-0 flex-1"
                onClick={() => void open(f)}
              >
                <span className="block truncate text-[13.5px]">{f.name}</span>
                <span className="text-[11.5px] text-ink-3">
                  {humanBytes(f.size)} · {f.kind.split('/').pop()}
                </span>
              </button>
              <button
                type="button"
                aria-label={`Open ${f.name}`}
                className="icon-btn"
                onClick={() => void open(f)}
              >
                <ExternalLink size={14} />
              </button>
              <button
                type="button"
                aria-label={`Delete ${f.name}`}
                className="icon-btn icon-btn-danger"
                onClick={async () => {
                  await deleteFile(f)
                  void tap()
                  notify(`${f.name} deleted`, 'warn', async () => {
                    await restore('attachments', f.id)
                  })
                }}
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[13px] text-ink-3">
          Past papers, slide decks, problem sheets. They are stored in the app on this device — no
          upload, no account, and they still open with no signal.
        </p>
      )}

      <Modal
        open={Boolean(preview)}
        onClose={() => setPreview(null)}
        title={preview?.a.name ?? ''}
        wide
      >
        {preview ? (
          isImage(preview.a) ? (
            <img
              src={preview.url}
              alt={preview.a.name}
              className="mx-auto max-h-[70vh] w-auto rounded border border-rule"
            />
          ) : (
            <>
              <object
                data={preview.url}
                type="application/pdf"
                className="h-[70vh] w-full rounded border border-rule"
              >
                <p className="p-4 text-[13.5px] text-ink-2">
                  This device cannot preview PDFs inside the app. Open it with your usual reader
                  instead.
                </p>
              </object>
              <a
                href={preview.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-block text-[13px] text-accent"
              >
                Open outside the app
              </a>
            </>
          )
        ) : null}
      </Modal>
    </div>
  )
}

/** Used by Settings to report what the files are costing in storage. */
export function useAttachmentTotals() {
  return (
    useLiveQuery(async () => {
      const rows = (await db.attachments.toArray()).filter((a) => !a.deleted_at)
      return { files: rows.length, bytes: rows.reduce((s, a) => s + (a.size || 0), 0) }
    }, []) ?? { files: 0, bytes: 0 }
  )
}
