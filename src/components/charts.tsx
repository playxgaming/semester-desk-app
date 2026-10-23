import type { ReactNode } from 'react'

/**
 * Shared chart furniture. Two rules the charts here follow:
 * axes and grid stay recessive (token rule colour, 1px, no chartjunk), and
 * every value that matters is direct-labelled rather than left to a legend.
 */

export function ChartTooltip({
  active,
  payload,
  label,
  format,
}: {
  active?: boolean
  payload?: { value?: number | string; name?: string; payload?: Record<string, unknown> }[]
  label?: string | number
  format?: (v: number | string, row: Record<string, unknown>) => ReactNode
}) {
  if (!active || !payload?.length) return null
  const row = (payload[0]?.payload ?? {}) as Record<string, unknown>
  const value = payload[0]?.value ?? ''
  return (
    <div className="rounded border border-rule bg-surface px-2.5 py-1.5 text-[12.5px] shadow-card">
      <div className="font-mono text-[11px] text-ink-3">{label}</div>
      <div className="text-ink">{format ? format(value, row) : String(value)}</div>
    </div>
  )
}

export const AXIS = {
  stroke: 'var(--rule-2)',
  tick: { fill: 'var(--ink-3)', fontSize: 11 },
  tickLine: false,
  axisLine: { stroke: 'var(--rule)' },
} as const

/** A one-hue sequential ramp for the review heatmap: light → dark, five steps. */
export function heatStep(value: number, max: number): { background: string; label: string } {
  if (value <= 0) return { background: 'var(--surface-2)', label: 'no reviews' }
  const q = Math.min(4, Math.ceil((value / Math.max(1, max)) * 4))
  const alpha = [0, 0.22, 0.42, 0.68, 1][q]
  return {
    background: `color-mix(in srgb, var(--accent) ${alpha * 100}%, var(--surface-2))`,
    label: `${value} review${value === 1 ? '' : 's'}`,
  }
}
