import type { Profile, ResumeItem, ResumeVersion } from '@/db/db'
import { utf8, zip } from './zip'

/**
 * The resume, built from a structured record rather than from memory — which
 * is the whole point of the project log. One set of items, several versions,
 * each version a selection tuned to a target role.
 */

export const ITEM_KINDS: ResumeItem['kind'][] = ['experience', 'project', 'education', 'award']

const KIND_HEADING: Record<ResumeItem['kind'], string> = {
  experience: 'Experience',
  project: 'Projects',
  education: 'Education',
  award: 'Awards',
}

export interface ResumeDoc {
  name: string
  targetRole: string
  sections: { heading: string; items: ResumeItem[] }[]
  items: ResumeItem[]
}

export function buildResume(
  version: ResumeVersion,
  allItems: ResumeItem[],
): ResumeDoc {
  const chosen = [...new Set(version.item_ids)]
    .map((id) => allItems.find((i) => i.id === id))
    .filter((i): i is ResumeItem => Boolean(i) && !i!.deleted_at)

  const sections = ITEM_KINDS.map((kind) => ({
    heading: KIND_HEADING[kind],
    items: chosen.filter((i) => i.kind === kind),
  })).filter((s) => s.items.length > 0)

  return { name: version.name, targetRole: version.target_role, sections, items: chosen }
}

export function dateRange(item: ResumeItem): string {
  const fmt = (d: string | null) =>
    d ? new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : ''
  const start = fmt(item.start)
  const end = item.end ? fmt(item.end) : item.start ? 'Present' : ''
  if (!start && !end) return ''
  if (!start) return end
  return end ? `${start} – ${end}` : start
}

/* ── DOCX ──────────────────────────────────────────────────────────────── */

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'

function run(text: string, opts: { bold?: boolean; italic?: boolean; size?: number } = {}) {
  const props = [
    opts.bold ? '<w:b/>' : '',
    opts.italic ? '<w:i/>' : '',
    opts.size ? `<w:sz w:val="${opts.size * 2}"/>` : '',
  ].join('')
  return `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ''}<w:t xml:space="preserve">${esc(text)}</w:t></w:r>`
}

function para(inner: string, opts: { style?: string; spaceAfter?: number; numbered?: boolean } = {}) {
  const props = [
    opts.style ? `<w:pStyle w:val="${opts.style}"/>` : '',
    opts.numbered ? '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>' : '',
    opts.spaceAfter !== undefined ? `<w:spacing w:after="${opts.spaceAfter}"/>` : '',
  ].join('')
  return `<w:p>${props ? `<w:pPr>${props}</w:pPr>` : ''}${inner}</w:p>`
}

function documentXml(doc: ResumeDoc, profile: Profile): string {
  const body: string[] = []

  body.push(para(run(profile.name || 'Your name', { bold: true, size: 20 }), { spaceAfter: 0 }))
  const contact = [profile.institution, doc.targetRole].filter(Boolean).join(' · ')
  if (contact) body.push(para(run(contact, { size: 10 }), { spaceAfter: 220 }))

  for (const section of doc.sections) {
    body.push(para(run(section.heading.toUpperCase(), { bold: true, size: 11 }), { spaceAfter: 60 }))
    for (const item of section.items) {
      const head = [
        run(item.title, { bold: true, size: 11 }),
        item.org ? run(` — ${item.org}`, { size: 11 }) : '',
        dateRange(item) ? run(`   ${dateRange(item)}`, { italic: true, size: 9 }) : '',
      ].join('')
      body.push(para(head, { spaceAfter: 40 }))
      for (const bullet of item.bullets.filter(Boolean)) {
        body.push(
          para(run(bullet, { size: 10 }), { style: 'ListParagraph', numbered: true, spaceAfter: 20 }),
        )
      }
    }
  }

  body.push(
    '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>',
  )

  return `${XML}<w:document xmlns:w="${W}"><w:body>${body.join('')}</w:body></w:document>`
}

const CONTENT_TYPES = `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
</Types>`

const ROOT_RELS = `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`

const DOC_RELS = `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
</Relationships>`

const STYLES = `${XML}<w:styles xmlns:w="${W}">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="20"/></w:rPr></w:rPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:pPr><w:spacing w:after="80" w:line="252" w:lineRule="auto"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="360"/><w:contextualSpacing/></w:pPr></w:style>
</w:styles>`

const NUMBERING = `${XML}<w:numbering xmlns:w="${W}">
<w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/>
<w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/>
<w:pPr><w:ind w:left="360" w:hanging="200"/></w:pPr></w:lvl></w:abstractNum>
<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
</w:numbering>`

/** A real OOXML package — not an HTML file wearing a .docx extension. */
export function resumeDocx(doc: ResumeDoc, profile: Profile, now: Date = new Date()): Uint8Array {
  return zip(
    [
      { name: '[Content_Types].xml', data: utf8(CONTENT_TYPES) },
      { name: '_rels/.rels', data: utf8(ROOT_RELS) },
      { name: 'word/_rels/document.xml.rels', data: utf8(DOC_RELS) },
      { name: 'word/document.xml', data: utf8(documentXml(doc, profile)) },
      { name: 'word/styles.xml', data: utf8(STYLES) },
      { name: 'word/numbering.xml', data: utf8(NUMBERING) },
    ],
    now,
  )
}

/** Plain markdown, for pasting into a form that wants text. */
export function resumeMarkdown(doc: ResumeDoc, profile: Profile): string {
  const out: string[] = [`# ${profile.name || 'Your name'}`]
  const sub = [profile.institution, doc.targetRole].filter(Boolean).join(' · ')
  if (sub) out.push(`*${sub}*`)
  for (const section of doc.sections) {
    out.push(`\n## ${section.heading}`)
    for (const item of section.items) {
      const range = dateRange(item)
      out.push(`\n**${item.title}**${item.org ? ` — ${item.org}` : ''}${range ? `  \n*${range}*` : ''}`)
      for (const b of item.bullets.filter(Boolean)) out.push(`- ${b}`)
    }
  }
  return out.join('\n')
}
