import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
await mkdir('shots', { recursive: true })
let failed = false
const BASE = 'http://localhost:4173'

const ROUTES = [
  ['', 'today'], ['#/timetable', 'timetable'], ['#/attendance', 'attendance'],
  ['#/tasks', 'tasks'], ['#/grades', 'grades'], ['#/planner', 'planner'],
  ['#/review', 'review'], ['#/coach', 'coach'], ['#/tutor', 'tutor'], ['#/notes', 'notes'],
  ['#/focus', 'focus'], ['#/courses', 'courses'], ['#/applications', 'applications'],
  ['#/resume', 'resume'], ['#/money', 'money'], ['#/install', 'install'], ['#/settings', 'settings'],
]

const b = await chromium.launch({
  args: ['--no-sandbox'],
})

for (const width of [360, 390]) {
  const c = await b.newContext({
    viewport: { width, height: 800 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Mobile Safari/537.36',
  })
  const p = await c.newPage()
  const errors = []
  p.on('pageerror', (e) => errors.push(`${e.message}`))
  p.on('console', (m) => {
    if (m.type() === 'error' && !/ERR_|Failed to load resource/.test(m.text())) errors.push(m.text())
  })

  await p.goto(`${BASE}/`, { waitUntil: 'networkidle' })
  await p.waitForTimeout(1500)
  await p.locator('[role="dialog"] button:has-text("Skip")').click().catch(() => {})
  await p.waitForTimeout(600)

  console.log(`\n===== ${width}px =====`)
  const problems = []

  for (const [hash, name] of ROUTES) {
    await p.goto(`${BASE}/${hash}`, { waitUntil: 'networkidle' })
    await p.waitForTimeout(650)

    const audit = await p.evaluate(() => {
      const doc = document.documentElement
      const overflow = doc.scrollWidth - doc.clientWidth
      // anything that sticks out past the viewport
      const wide = [...document.querySelectorAll('body *')]
        .filter((el) => {
          const r = el.getBoundingClientRect()
          if (!(r.width > 0 && r.right > window.innerWidth + 1)) return false
          // an element that scrolls its own content is doing its job
          const s = getComputedStyle(el)
          return !(s.overflowX === 'auto' || s.overflowX === 'scroll')
        })
        .slice(0, 4)
        .map((el) => {
          const r = el.getBoundingClientRect()
          return `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 34)}@${Math.round(r.right)}`
        })
      // Interactive things too small for a thumb. A 16px checkbox inside a
      // 44px <label> row is fine — the label is the target — so measure the
      // effective hit area: the element, or the label/row that forwards its
      // clicks to it.
      const effective = (el) => {
        const own = el.getBoundingClientRect()
        const host =
          el.closest('label') ??
          (el.tagName === 'INPUT' && el.id ? document.querySelector(`label[for="${el.id}"]`) : null)
        if (!host || host === el) return own
        const r = host.getBoundingClientRect()
        return { width: Math.max(own.width, r.width), height: Math.max(own.height, r.height) }
      }
      const small = [...document.querySelectorAll('main button, main a, main input, main select')]
        .filter((el) => {
          const own = el.getBoundingClientRect()
          if (own.width === 0 || own.height === 0) return false
          if (el.closest('nav')) return false
          const r = effective(el)
          return r.height < 32 || r.width < 24
        })
        .slice(0, 4)
        .map((el) => {
          const r = effective(el)
          return `${el.tagName.toLowerCase()}[${Math.round(r.width)}x${Math.round(r.height)}] "${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 22)}"`
        })
      const h1 = document.querySelector('h1')?.textContent ?? null
      return { overflow, wide, small, h1 }
    })

    const flags = []
    if (audit.overflow > 0) flags.push(`OVERFLOW ${audit.overflow}px ${audit.wide.join(' | ')}`)
    if (audit.small.length) flags.push(`SMALL ${audit.small.join(' | ')}`)
    if (flags.length) problems.push(`  ${name}: ${flags.join(' ;; ')}`)
    console.log(`${name.padEnd(13)} ${audit.overflow === 0 ? 'ok' : 'OVERFLOW'}  h1=${JSON.stringify(audit.h1)}`)
  }

  // every route must be reachable from the phone chrome alone
  await p.goto(`${BASE}/`, { waitUntil: 'networkidle' })
  await p.waitForTimeout(500)
  const tabs = await p.locator('nav.fixed[aria-label="Main"] a, nav.fixed[aria-label="Main"] button').count()
  await p.locator('nav.fixed[aria-label="Main"] button:has-text("More")').click()
  await p.waitForTimeout(500)
  const sheetLinks = await p.locator('[role="dialog"] a[href^="#/"], [role="dialog"] a[href="#/"]').evaluateAll(
    (els) => els.map((e) => e.getAttribute('href')),
  )
  const reachable = new Set([...sheetLinks])
  const missing = ROUTES.filter(([h]) => h && !reachable.has(h)).map(([h]) => h)
  console.log(`tabs=${tabs} sheet routes=${sheetLinks.length} unreachable=${missing.length ? missing.join(',') : 'none'}`)
  await p.screenshot({ path: `shots/m-${width}-more.png` })
  await p.keyboard.press('Escape')

  if (problems.length) {
    console.log('PROBLEMS:')
    problems.forEach((x) => console.log(x))
  } else {
    console.log('no layout or target problems')
  }
  console.log(errors.length ? `ERRORS: ${[...new Set(errors)].join(' | ')}` : 'no page errors')
  if (problems.length || errors.length || missing.length) failed = true

  if (width === 390) {
    for (const [hash, name] of [['', 'today'], ['#/attendance', 'attendance'], ['#/grades', 'grades'], ['#/coach', 'coach'], ['#/money', 'money']]) {
      await p.goto(`${BASE}/${hash}`, { waitUntil: 'networkidle' })
      await p.waitForTimeout(700)
      await p.screenshot({ path: `shots/m-${name}.png`, fullPage: true })
    }
    // a sheet, to check it opens from the bottom
    await p.goto(`${BASE}/#/tasks`, { waitUntil: 'networkidle' })
    await p.waitForTimeout(600)
    await p.getByRole('button', { name: /Add deadline/ }).click()
    await p.waitForTimeout(500)
    await p.screenshot({ path: 'shots/m-sheet.png' })
  }
  await c.close()
}

await b.close()
if (failed) process.exitCode = 1
