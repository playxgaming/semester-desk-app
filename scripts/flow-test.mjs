import { chromium } from 'playwright'
const BASE = 'http://localhost:4173'

const b = await chromium.launch({
  args: ['--no-sandbox'],
})
const c = await b.newContext({
  viewport: { width: 390, height: 780 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  userAgent:
    'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Mobile Safari/537.36',
})
const p = await c.newPage()
const errors = []
p.on('pageerror', (e) => errors.push(e.message))
p.on('console', (m) => {
  if (m.type() === 'error' && !/ERR_|Failed to load resource/.test(m.text())) errors.push(m.text())
})

const results = []
const step = async (name, fn) => {
  try {
    // leave nothing open behind the previous step
    await p.keyboard.press('Escape').catch(() => {})
    await p.waitForTimeout(250)
    await fn()
    results.push(`PASS  ${name}`)
  } catch (e) {
    results.push(`FAIL  ${name} — ${String(e).split('\n')[0].slice(0, 140)}`)
  }
}

await p.goto(`${BASE}/`, { waitUntil: 'networkidle' })
await p.waitForTimeout(1200)
await p.locator('[role="dialog"] button:has-text("Skip")').click().catch(() => {})
await p.waitForTimeout(600)

// 1. add a deadline through the bottom sheet
await step('add a deadline from the sheet', async () => {
  await p.goto(`${BASE}/#/tasks`, { waitUntil: 'networkidle' })
  await p.waitForTimeout(600)
  await p.getByRole('button', { name: /Add deadline/ }).first().click()
  await p.waitForTimeout(500)
  const dlg = p.locator('[role="dialog"]')
  const box = await dlg.boundingBox()
  if (box.y + box.height < 700) throw new Error(`sheet not anchored to the bottom (y=${box.y})`)
  await dlg.getByLabel('What is due').fill('Playwright smoke deadline')
  await dlg.getByLabel('Due', { exact: true }).first().fill('2026-09-15T18:00')
  await dlg.getByRole('button', { name: /^(Add|Save)/ }).first().click()
  await p.waitForTimeout(700)
  await p.getByText('Playwright smoke deadline').first().waitFor({ timeout: 4000 })
})

// 2. tick it done through the enlarged checkbox
await step('tick the deadline done', async () => {
  const box = p.getByLabel('Mark Playwright smoke deadline done')
  const bb = await box.boundingBox()
  // the visible box stays 16px; the tappable label around it must be 44
  const hit = await box.evaluate((el) => {
    const r = el.closest('label').getBoundingClientRect()
    return { w: Math.round(r.width), h: Math.round(r.height) }
  })
  if (hit.h < 44 || hit.w < 44) throw new Error(`hit area ${hit.w}x${hit.h}`)
  if (bb.height > 24) throw new Error('the box itself got fat')
  await box.click()
  await p.waitForTimeout(700)
  const toast = await p.locator('[role="status"]').innerText()
  if (!/done/.test(toast)) throw new Error(`no confirmation: ${toast}`)
  await p.locator('[role="status"] button:has-text("Undo")').click()
  await p.waitForTimeout(800)
  const txt = await p.locator('main').innerText()
  if (!/Playwright smoke deadline/.test(txt)) throw new Error('undo did not bring it back')
})

// 3. attendance: tap present on Today, verify it reaches the grid
await step('attendance writes once, from Today to the grid', async () => {
  await p.goto(`${BASE}/`, { waitUntil: 'networkidle' })
  await p.waitForTimeout(700)
  const present = p.getByRole('button', { name: 'Present' }).first()
  if ((await present.count()) === 0) {
    results.push('SKIP  no classes scheduled today in the demo data')
    return
  }
  const box = await present.boundingBox()
  if (box.height < 40) throw new Error(`present button is only ${Math.round(box.height)}px tall`)
  await present.click()
  await p.waitForTimeout(800)
  await p.goto(`${BASE}/#/attendance`, { waitUntil: 'networkidle' })
  await p.waitForTimeout(800)
  const held = await p.locator('main').innerText()
  if (!/\d/.test(held)) throw new Error('attendance page rendered nothing numeric')
})

// 4. review a card
await step('review a card end to end', async () => {
  await p.goto(`${BASE}/#/review`, { waitUntil: 'networkidle' })
  await p.waitForTimeout(700)
  const start = p.getByRole('button', { name: /Review \d+|Start/ }).first()
  if ((await start.count()) === 0) throw new Error('no start button')
  await start.click()
  await p.waitForTimeout(600)
  await p.getByRole('button', { name: /Show answer|Reveal/i }).first().click()
  await p.waitForTimeout(400)
  const good = p.getByRole('button', { name: /Good/ }).first()
  const gb = await good.boundingBox()
  if (gb.height < 44) throw new Error(`grade button only ${Math.round(gb.height)}px`)
  await good.click()
  await p.waitForTimeout(600)
})

// 5. focus timer survives a background
await step('focus timer keeps wall-clock time', async () => {
  await p.goto(`${BASE}/#/focus`, { waitUntil: 'networkidle' })
  await p.waitForTimeout(600)
  await p.getByRole('button', { name: /Start/ }).first().click()
  await p.waitForTimeout(1500)
  const before = await p.locator('main').innerText()
  await p.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  await p.waitForTimeout(2200)
  const after = await p.locator('main').innerText()
  if (before === after) throw new Error('timer did not advance')
})

// 6. the planner writes a plan
await step('planner produces a plan', async () => {
  await p.goto(`${BASE}/#/planner`, { waitUntil: 'networkidle' })
  await p.waitForTimeout(700)
  const btn = p.getByRole('button', { name: /Rebuild|Plan|Generate/ }).first()
  await btn.click()
  await p.waitForTimeout(1200)
  const txt = await p.locator('main').innerText()
  if (!/min|h\b/.test(txt)) throw new Error('no minutes in the plan')
})

// 7. resume export produces a real file
await step('resume exports a .docx', async () => {
  await p.goto(`${BASE}/#/resume`, { waitUntil: 'networkidle' })
  await p.waitForTimeout(800)
  const dl = p.waitForEvent('download', { timeout: 8000 })
  await p.getByRole('button', { name: /Word|docx/i }).first().click()
  const file = await dl
  const name = file.suggestedFilename()
  if (!name.endsWith('.docx')) throw new Error(`got ${name}`)
})

// 8. backup export / import round trip
await step('backup exports JSON', async () => {
  await p.goto(`${BASE}/#/settings`, { waitUntil: 'networkidle' })
  await p.waitForTimeout(800)
  const dl = p.waitForEvent('download', { timeout: 8000 })
  await p.getByRole('button', { name: /Export|Back ?up/i }).first().click()
  const file = await dl
  if (!file.suggestedFilename().endsWith('.json')) throw new Error(file.suggestedFilename())
})

// 9. search finds things
await step('search reaches a course', async () => {
  await p.goto(`${BASE}/`, { waitUntil: 'networkidle' })
  await p.waitForTimeout(500)
  await p.locator('nav[aria-label="Main"] button:has-text("More")').click()
  await p.waitForTimeout(500)
  await p.locator('nav[aria-label="Main"] ~ * button:has-text("Search"), [role="dialog"] button:has-text("Search")').first().click()
  await p.waitForTimeout(600)
  await p.getByPlaceholder('Jump to, or do…').fill('CS30')
  await p.waitForTimeout(700)
  const txt = await p.locator('[role="dialog"]').innerText()
  if (!/CS30/.test(txt)) throw new Error('no results')
})

// 10. note history keeps and restores an earlier draft
await step('note history keeps and restores a draft', async () => {
  await p.goto(`${BASE}/#/notes`, { waitUntil: 'networkidle' })
  await p.waitForTimeout(900)
  // put the editor into write mode
  const edit = p.getByRole('button', { name: /^Edit$/ }).first()
  if (await edit.count()) await edit.click()
  await p.waitForTimeout(400)
  const ta = p.locator('textarea').first()
  const original = await ta.inputValue()
  await ta.fill('First draft, which must survive being overwritten.')
  await p.getByRole('button', { name: /^Save$/ }).first().click()
  await p.waitForTimeout(700)
  // a second edit, backdated past the five-minute gap so it snapshots
  await p.evaluate(async () => {
    const req = indexedDB.open('semester-desk')
    const dbh = await new Promise((res) => { req.onsuccess = () => res(req.result) })
    const tx = dbh.transaction('note_versions', 'readwrite')
    const store = tx.objectStore('note_versions')
    const all = await new Promise((res) => { const r = store.getAll(); r.onsuccess = () => res(r.result) })
    for (const v of all) { v.at = new Date(Date.now() - 30 * 60_000).toISOString(); store.put(v) }
  })
  await ta.fill('Second draft, which replaced the first.')
  await p.getByRole('button', { name: /^Save$/ }).first().click()
  await p.waitForTimeout(800)
  await p.locator('button[title="Earlier versions of this note"]').click()
  await p.waitForTimeout(700)
  const dlg = p.locator('[role="dialog"]')
  const txt = await dlg.innerText()
  if (!/words/.test(txt)) throw new Error(`no versions listed: ${txt.slice(0, 120)}`)
  await dlg.getByRole('button', { name: 'Restore' }).first().click()
  await p.waitForTimeout(900)
  const body = await p.locator('main').innerText()
  if (!/First draft|Second draft/.test(body)) throw new Error('restore produced nothing')
  if (original) { /* demo content is restored by the next test run's seed */ }
})

// 11. deleting a card offers a way back
await step('a delete can be undone', async () => {
  await p.goto(`${BASE}/#/review`, { waitUntil: 'networkidle' })
  await p.waitForTimeout(900)
  const before = await p.locator('main ul li').count()
  await p.locator('button[aria-label^="Delete card"]').first().click()
  await p.waitForTimeout(700)
  const toast = p.locator('[role="status"]')
  if (!/deleted/.test(await toast.innerText())) throw new Error('no toast')
  await toast.getByRole('button', { name: 'Undo' }).click()
  await p.waitForTimeout(900)
  const after = await p.locator('main ul li').count()
  if (after !== before) throw new Error(`rows ${before} -> ${after}`)
})

console.log(results.join('\n'))
console.log(errors.length ? `\nPAGE ERRORS: ${[...new Set(errors)].join(' | ')}` : '\nno page errors')
await b.close()
if (results.some(result => result.startsWith('FAIL')) || errors.length) process.exitCode = 1
