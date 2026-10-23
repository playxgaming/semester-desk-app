import { useEffect, useState } from 'react'

/**
 * The categorical series palette — course identity, everywhere.
 *
 * Both sets are validated rather than eyeballed: OKLCH lightness band, chroma
 * floor, adjacent-pair separation under protan/deutan/tritan simulation, and
 * contrast against the chart surface. Dark mode gets its own steps rather than
 * a flipped copy of the light ones.
 *
 * Two rules that keep it honest:
 *   • hues are assigned in fixed order and never cycled — a ninth course reuses
 *     nothing; it falls back to the neutral rule colour
 *   • a colour never carries meaning alone. Every dot sits beside a course code,
 *     and every chart mark is direct-labelled, which is the required relief for
 *     the one amber step that sits under 3:1 on the light surface.
 */

export const SERIES_LIGHT = [
  '#3358CC',
  '#E09400',
  '#0B7A50',
  '#8B4FD1',
  '#C0392B',
  '#0E90B3',
  '#7A8C1F',
  '#C43C86',
] as const

export const SERIES_DARK = [
  '#5C7FE8',
  '#BE8A28',
  '#22936A',
  '#9E74D8',
  '#D4665C',
  '#2A9BBE',
  '#8A9A2E',
  '#D0629A',
] as const

export const NEUTRAL_SERIES = 'var(--rule-2)'

/** Map a stored (light) course colour onto the palette for the active theme. */
export function seriesColour(hex: string, dark: boolean): string {
  const i = SERIES_LIGHT.indexOf(hex as (typeof SERIES_LIGHT)[number])
  if (i === -1) return hex
  return dark ? SERIES_DARK[i] : SERIES_LIGHT[i]
}

/** True when the page is currently painting the dark token set. */
export function useIsDark(): boolean {
  const [dark, setDark] = useState(() => resolveDark())
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const update = () => setDark(resolveDark())
    mq.addEventListener('change', update)
    const obs = new MutationObserver(update)
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => {
      mq.removeEventListener('change', update)
      obs.disconnect()
    }
  }, [])
  return dark
}

function resolveDark(): boolean {
  const attr = document.documentElement.getAttribute('data-theme')
  if (attr === 'dark') return true
  if (attr === 'light') return false
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}
