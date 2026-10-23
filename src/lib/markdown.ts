import katex from 'katex'

/**
 * A small, dependency-light markdown renderer with real LaTeX.
 *
 * Math is pulled out before anything else touches the string, so `$a_1$`
 * never gets mangled into italics — the bug that made v1's notes unusable
 * for anything with subscripts.
 */

const ESC: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESC[c])
}

export function renderMath(tex: string, display: boolean): string {
  try {
    return katex.renderToString(tex, {
      displayMode: display,
      throwOnError: false,
      strict: false,
      output: 'html',
    })
  } catch {
    return `<code>${escapeHtml(tex)}</code>`
  }
}

function inline(s: string): string {
  return s
    .replace(/`([^`]+)`/g, (_m, c: string) => `<code>${c}</code>`)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|\W)\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/(^|\W)_([^_\n]+)_/g, '$1<em>$2</em>')
    .replace(/~~([^~]+)~~/g, '<del>$1</del>')
    .replace(
      /\[([^\]]+)\]\((https?:[^)\s]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
    )
}

export function renderMarkdown(src: string): string {
  if (!src) return ''

  // 1. lift math out
  const math: { tex: string; display: boolean }[] = []
  let text = src
    .replace(/\$\$([\s\S]+?)\$\$/g, (_m, tex: string) => {
      math.push({ tex: tex.trim(), display: true })
      return `@@M${math.length - 1}@@`
    })
    .replace(/(?<!\\)\$([^$\n]+?)(?<!\\)\$/g, (_m, tex: string) => {
      math.push({ tex: tex.trim(), display: false })
      return `@@M${math.length - 1}@@`
    })

  // 2. lift fenced code out too
  const code: string[] = []
  text = text.replace(/```[a-z]*\n([\s\S]*?)```/g, (_m, body: string) => {
    code.push(body)
    return `@@C${code.length - 1}@@`
  })

  // 3. escape, then build blocks
  text = escapeHtml(text)
  const lines = text.split('\n')
  const out: string[] = []
  let list: 'ul' | 'ol' | null = null
  let para: string[] = []

  const flushPara = () => {
    if (para.length) {
      out.push(`<p>${inline(para.join(' '))}</p>`)
      para = []
    }
  }
  const closeList = () => {
    if (list) {
      out.push(`</${list}>`)
      list = null
    }
  }

  for (let li = 0; li < lines.length; li++) {
    const raw = lines[li]
    const line = raw.trimEnd()

    // pipe tables: a header row, a |---|---| rule, then body rows
    if (/^\s*\|.*\|\s*$/.test(line) && /^\s*\|[\s:|-]+\|\s*$/.test(lines[li + 1] ?? '')) {
      flushPara()
      closeList()
      const cells = (r: string) =>
        r.trim().replace(/^\||\|$/g, '').split('|').map((c) => inline(c.trim()))
      const head = cells(line)
      const body: string[][] = []
      li += 2
      while (li < lines.length && /^\s*\|.*\|\s*$/.test(lines[li])) {
        body.push(cells(lines[li]))
        li++
      }
      li--
      out.push(
        `<div class="md-scroll"><table class="md-table"><thead><tr>${head.map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>${body
          .map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`)
          .join('')}</tbody></table></div>`,
      )
      continue
    }

    if (!line.trim()) {
      flushPara()
      closeList()
      continue
    }
    const codeToken = line.match(/^@@C(\d+)@@$/)
    if (codeToken) {
      flushPara()
      closeList()
      out.push(`<pre><code>${escapeHtml(code[Number(codeToken[1])])}</code></pre>`)
      continue
    }
    const h = line.match(/^(#{1,4})\s+(.*)$/)
    if (h) {
      flushPara()
      closeList()
      out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`)
      continue
    }
    if (/^(-{3,}|\*{3,})$/.test(line.trim())) {
      flushPara()
      closeList()
      out.push('<hr />')
      continue
    }
    const quote = line.match(/^&gt;\s?(.*)$/)
    if (quote) {
      flushPara()
      closeList()
      out.push(`<blockquote>${inline(quote[1])}</blockquote>`)
      continue
    }
    const ul = line.match(/^\s*[-*+]\s+(.*)$/)
    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/)
    if (ul || ol) {
      flushPara()
      const want = ul ? 'ul' : 'ol'
      if (list !== want) {
        closeList()
        out.push(`<${want}>`)
        list = want
      }
      out.push(`<li>${inline((ul ?? ol)![1])}</li>`)
      continue
    }
    closeList()
    para.push(line.trim())
  }
  flushPara()
  closeList()

  // 4. put the math back, rendered
  return out
    .join('\n')
    .replace(/@@M(\d+)@@/g, (_m, i: string) => renderMath(math[Number(i)].tex, math[Number(i)].display))
}

/** First ~n characters of the prose, for list previews. */
export function plainPreview(md: string, n = 140): string {
  const s = md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#>*_`~]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return s.length > n ? `${s.slice(0, n)}…` : s
}
