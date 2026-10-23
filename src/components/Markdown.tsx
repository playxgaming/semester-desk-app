import { useMemo } from 'react'
import { renderMarkdown, renderMath } from '@/lib/markdown'
import clsx from 'clsx'

export function Markdown({ source, className }: { source: string; className?: string }) {
  const html = useMemo(() => renderMarkdown(source), [source])
  return <div className={clsx('md', className)} dangerouslySetInnerHTML={{ __html: html }} />
}

/** Inline LaTeX for card fronts/backs and the formula sheet. */
export function TeX({ children, display = false }: { children: string; display?: boolean }) {
  const html = useMemo(() => renderMath(children, display), [children, display])
  return <span dangerouslySetInnerHTML={{ __html: html }} />
}
