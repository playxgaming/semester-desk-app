import clsx from 'clsx'
import { X } from 'lucide-react'
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'

/* ── Surfaces ──────────────────────────────────────────────────────────── */

export function Card({
  children,
  className,
  as: As = 'div',
}: {
  children: ReactNode
  className?: string
  as?: 'div' | 'section' | 'li'
}) {
  return (
    // `min-w-0` matters: a card is usually a grid or flex item, and without it
    // one wide child (a chart's SVG, a long formula) sets the card's minimum
    // width and pushes the whole page sideways on a 360px screen.
    <As className={clsx('min-w-0 rounded-xl border border-rule bg-surface shadow-card', className)}>
      {children}
    </As>
  )
}

export function Panel({
  title,
  action,
  children,
  className,
  sub,
}: {
  title: ReactNode
  sub?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <Card className={className}>
      <header className="flex items-baseline gap-3 rounded-t-xl border-b border-rule bg-surface-2 px-4 py-3">
        <h3 className="text-[15px]">{title}</h3>
        {sub ? <span className="font-mono text-[11px] text-ink-3">{sub}</span> : null}
        {action ? <div className="ml-auto">{action}</div> : null}
      </header>
      <div className="p-4">{children}</div>
    </Card>
  )
}

export function PageHeader({
  eyebrow,
  title,
  lede,
  action,
}: {
  eyebrow?: string
  title: string
  lede?: ReactNode
  action?: ReactNode
}) {
  return (
    <header className="page-header mb-7 border-b border-rule pb-6">
      {eyebrow ? <div className="eyebrow mb-2 text-accent">{eyebrow}</div> : null}
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-[clamp(24px,3.4vw,34px)] leading-[1.08]">{title}</h1>
          {lede ? <p className="mt-2 max-w-[62ch] text-[15px] text-ink-2">{lede}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </header>
  )
}

/* ── Controls ──────────────────────────────────────────────────────────── */

type BtnVariant = 'primary' | 'ghost' | 'danger' | 'quiet'

export function Button({
  variant = 'ghost',
  className,
  size = 'md',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: BtnVariant
  size?: 'sm' | 'md' | 'lg'
}) {
  return (
    <button
      type="button"
      {...rest}
      className={clsx(
        'inline-flex items-center justify-center gap-1.5 rounded-lg border font-medium transition disabled:cursor-not-allowed disabled:opacity-45',
        // 44px is the smallest reliable thumb target; small buttons keep 36
        size === 'sm'
          ? 'min-h-[36px] px-2.5 py-1 text-[12.5px]'
          : size === 'lg'
            ? 'min-h-[48px] px-5 py-2.5 text-[15px]'
            : 'min-h-[44px] px-3.5 py-2 text-[14px] sm:min-h-[40px] sm:text-[13.5px]',
        variant === 'primary' && 'border-[color:var(--brand-lime)] bg-[color:var(--brand-lime)] text-[color:var(--action-ink)] shadow-sm hover:brightness-95',
        variant === 'ghost' && 'border-rule bg-surface text-ink hover:border-rule-2 hover:bg-surface-2',
        variant === 'quiet' && 'border-transparent bg-transparent text-ink-2 hover:bg-surface-2',
        variant === 'danger' && 'border-crit bg-[color:var(--crit-soft)] text-crit hover:opacity-90',
        className,
      )}
    />
  )
}

/**
 * Which soft keyboard Android should raise for a given input type.
 *
 * Getting this wrong is the difference between typing "1200" with one thumb
 * and hunting for the 123 key. `type="number"` alone is not enough on Android
 * — several keyboards still show the full QWERTY layout for it.
 */
function keyboardFor(type: string | undefined): Partial<InputHTMLAttributes<HTMLInputElement>> {
  switch (type) {
    case 'number':
      return { inputMode: 'decimal', enterKeyHint: 'done', autoComplete: 'off' }
    case 'email':
      return { inputMode: 'email', enterKeyHint: 'done', autoCapitalize: 'off', autoCorrect: 'off' }
    case 'url':
      return { inputMode: 'url', enterKeyHint: 'go', autoCapitalize: 'off', autoCorrect: 'off' }
    case 'tel':
      return { inputMode: 'tel', enterKeyHint: 'done' }
    case 'search':
      return { inputMode: 'search', enterKeyHint: 'search', autoCorrect: 'off' }
    case 'date':
    case 'time':
    case 'datetime-local':
    case 'color':
    case 'range':
    case 'checkbox':
      return {}
    default:
      return { enterKeyHint: 'done', autoCapitalize: 'sentences' }
  }
}

export function Field({
  label,
  hint,
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label?: string; hint?: string }) {
  const id = useId()
  return (
    <label className={clsx('block', className)} htmlFor={id}>
      {label ? <span className="mb-1 block text-[12.5px] font-medium text-ink-2">{label}</span> : null}
      <input
        id={id}
        {...keyboardFor(rest.type)}
        {...rest}
        // a stray scroll over a focused number input silently changes it
        onWheel={(e) => {
          if (rest.type === 'number') (e.target as HTMLInputElement).blur()
          rest.onWheel?.(e)
        }}
        className="field"
      />
      {hint ? <span className="mt-1 block text-[11.5px] text-ink-3">{hint}</span> : null}
    </label>
  )
}

export function TextArea({
  label,
  className,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string }) {
  const id = useId()
  return (
    <label className={clsx('block', className)} htmlFor={id}>
      {label ? <span className="mb-1 block text-[12.5px] font-medium text-ink-2">{label}</span> : null}
      <textarea
        id={id}
        enterKeyHint="enter"
        autoCapitalize="sentences"
        {...rest}
        className="field resize-y"
      />
    </label>
  )
}

export function Select({
  label,
  className,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { label?: string }) {
  const id = useId()
  return (
    <label className={clsx('block', className)} htmlFor={id}>
      {label ? <span className="mb-1 block text-[12.5px] font-medium text-ink-2">{label}</span> : null}
      <select id={id} {...rest} className="field">
        {children}
      </select>
    </label>
  )
}

/* ── Feedback ──────────────────────────────────────────────────────────── */

export function Badge({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: 'neutral' | 'accent' | 'ok' | 'warn' | 'crit'
  children: ReactNode
  className?: string
}) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[11px] leading-tight',
        tone === 'neutral' && 'border-rule bg-surface-2 text-ink-2',
        tone === 'accent' && 'border-transparent bg-accent-soft text-accent',
        tone === 'ok' && 'border-transparent bg-[color:var(--ok-soft)] text-ok',
        tone === 'warn' && 'border-transparent bg-[color:var(--warn-soft)] text-warn',
        tone === 'crit' && 'border-transparent bg-[color:var(--crit-soft)] text-crit',
        className,
      )}
    >
      {children}
    </span>
  )
}

export function Note({
  tone = 'accent',
  title,
  children,
}: {
  tone?: 'accent' | 'warn' | 'crit' | 'ok'
  title?: string
  children: ReactNode
}) {
  return (
    <div
      className={clsx(
        'my-4 rounded-r border-l-2 px-4 py-3 text-[14px]',
        tone === 'accent' && 'border-accent bg-accent-soft',
        tone === 'warn' && 'border-warn bg-[color:var(--warn-soft)]',
        tone === 'crit' && 'border-crit bg-[color:var(--crit-soft)]',
        tone === 'ok' && 'border-ok bg-[color:var(--ok-soft)]',
      )}
    >
      {title ? (
        <b
          className={clsx(
            'mb-1 block text-[10.5px] uppercase tracking-[0.1em]',
            tone === 'accent' && 'text-accent',
            tone === 'warn' && 'text-warn',
            tone === 'crit' && 'text-crit',
            tone === 'ok' && 'text-ok',
          )}
        >
          {title}
        </b>
      ) : null}
      <div className="text-ink-2">{children}</div>
    </div>
  )
}

export function Stat({
  value,
  label,
  hint,
  tone,
}: {
  value: ReactNode
  label: string
  hint?: ReactNode
  tone?: 'ok' | 'warn' | 'crit'
}) {
  return (
    <div className="rounded-xl border border-rule bg-surface px-4 py-3">
      <b
        className={clsx(
          'block font-mono text-[19px] font-medium leading-tight tabnum',
          tone === 'ok' && 'text-ok',
          tone === 'warn' && 'text-warn',
          tone === 'crit' && 'text-crit',
        )}
      >
        {value}
      </b>
      <span className="text-[11px] uppercase tracking-[0.07em] text-ink-3">{label}</span>
      {hint ? <em className="mt-1 block text-[12px] not-italic text-ink-2">{hint}</em> : null}
    </div>
  )
}

export function Bar({
  value,
  tone = 'accent',
  className,
}: {
  value: number
  tone?: 'accent' | 'ok' | 'warn' | 'crit'
  className?: string
}) {
  const pct = Math.max(0, Math.min(100, value * 100))
  return (
    <div className={clsx('h-1.5 w-full overflow-hidden rounded bg-surface-2', className)}>
      <div
        className={clsx(
          'h-full rounded transition-[width]',
          tone === 'accent' && 'bg-[color:var(--brand-blue)]',
          tone === 'ok' && 'bg-ok',
          tone === 'warn' && 'bg-warn',
          tone === 'crit' && 'bg-crit',
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

export function Empty({
  title,
  children,
  action,
}: {
  title: string
  children?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="rounded-xl border border-dashed border-rule-2 px-6 py-10 text-center">
      <p className="mb-1 font-display text-[16px] font-bold text-ink">{title}</p>
      {children ? <p className="mx-auto max-w-[46ch] text-[13.5px] text-ink-2">{children}</p> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  )
}

/* ── Modal ─────────────────────────────────────────────────────────────── */

const ModalCtx = createContext<() => void>(() => {})
export const useCloseModal = () => useContext(ModalCtx)

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  /** Actions pinned below the scroll area — on a phone the alternative is a
   *  primary button sitting four pixels above the fold. */
  footer?: ReactNode
  wide?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const t = window.setTimeout(() => {
      ref.current?.querySelector<HTMLElement>('input,select,textarea,button')?.focus()
    }, 10)
    return () => {
      document.removeEventListener('keydown', onKey)
      window.clearTimeout(t)
    }
  }, [open, onClose])

  if (!open) return null
  return (
    <ModalCtx.Provider value={onClose}>
      {/* On a phone this is a bottom sheet: it opens under the thumb, it can
          be dismissed by the grab handle, and it never floats in the middle of
          a screen the keyboard is about to cover. On a wider screen it stays a
          centred dialog. */}
      <div
        className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-[2px] sm:items-start sm:overflow-y-auto sm:p-4 sm:pt-[8vh]"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onClose()
        }}
      >
        <div
          ref={ref}
          role="dialog"
          aria-modal="true"
          aria-label={title}
          className={clsx(
            'flex max-h-[92dvh] w-full flex-col border-rule bg-surface shadow-card',
            'animate-[sheet-up_.18s_ease-out] rounded-t-2xl border-t sm:animate-none sm:rounded-xl sm:border',
            wide ? 'sm:max-w-3xl' : 'sm:max-w-lg',
          )}
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <header className="relative flex shrink-0 items-center gap-3 border-b border-rule px-5 pb-3.5 pt-4 sm:pt-3.5">
            <span
              aria-hidden
              className="absolute left-1/2 top-1.5 h-1 w-9 -translate-x-1/2 rounded-full bg-rule-2 sm:hidden"
            />
            <h3 className="text-[16px]">{title}</h3>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="ml-auto flex h-9 w-9 items-center justify-center rounded text-ink-3 hover:bg-surface-2 hover:text-ink"
            >
              <X size={17} />
            </button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5">{children}</div>
          {footer ? (
            <div className="shrink-0 border-t border-rule bg-surface-2 px-5 py-3">{footer}</div>
          ) : null}
        </div>
      </div>
    </ModalCtx.Provider>
  )
}

export function Row({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx('grid gap-3 sm:grid-cols-2', className)}>{children}</div>
}

/**
 * A checkbox with a thumb-sized hit area.
 *
 * The box itself stays 16px — a 44px checkbox looks absurd — but the label
 * around it is 44×44 on a phone and forwards the tap, and negative margins
 * keep that extra area from pushing the row apart. On a pointer device it
 * collapses back to something normal.
 */
export function Check({
  checked,
  onChange,
  label,
  disabled,
  className,
}: {
  checked?: boolean
  onChange: () => void
  label: string
  disabled?: boolean
  className?: string
}) {
  return (
    <label
      className={clsx(
        'flex shrink-0 cursor-pointer items-center justify-center',
        '-m-3 h-11 w-11 sm:-m-1.5 sm:h-7 sm:w-7',
        disabled && 'cursor-not-allowed opacity-50',
        className,
      )}
    >
      <input
        type="checkbox"
        className="h-4 w-4 accent-[color:var(--accent)]"
        checked={checked}
        disabled={disabled}
        aria-label={label}
        onChange={onChange}
      />
    </label>
  )
}

export function Dot({ colour }: { colour: string }) {
  return (
    <span
      aria-hidden
      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
      style={{ background: colour }}
    />
  )
}
