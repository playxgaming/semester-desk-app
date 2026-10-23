import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'

const browser = await chromium.launch()
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 800 }, timezoneId: 'Asia/Kolkata', serviceWorkers: 'block' })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  await page.goto('http://127.0.0.1:4173')
  await page.getByRole('button', { name: /Skip/ }).click()
  await page.goto('http://127.0.0.1:4173/#/tutor')
  await page.route('**/api/solve-problem', route => route.fulfill({ json: { result: 'A verified test response: $2+2=4$.' } }))
  await page.getByLabel("What's the problem?").fill('2+2')
  await page.getByRole('button', { name: 'Solve', exact: true }).click()
  await page.getByText('A verified test response:', { exact: false }).waitFor()
  console.log('PASS tutor renders mocked solution with mathematics')
  await page.unroute('**/api/solve-problem')
  await page.route('**/api/solve-problem', route => route.fulfill({ status: 503, json: { error: 'AI is not configured. Set GEMINI_API_KEY on the server.' } }))
  await page.getByRole('button', { name: 'Solve', exact: true }).click()
  await page.getByRole('alert').filter({ hasText: 'GEMINI_API_KEY' }).waitFor()
  console.log('PASS tutor shows server setup error')
  const rows = [
    { title: 'CS301 imported lecture', type: 'class', dayOfWeek: 1, startTime: '08:00', endTime: '09:00', location: 'Demo room' },
    { title: 'Imported assignment', type: 'deadline', date: '2026-11-10', startTime: '18:00' },
    { title: 'Imported exam', type: 'exam', date: '2026-11-12', startTime: '10:00' },
    { title: 'Imported holiday', type: 'holiday', date: '2026-11-15' },
    { title: 'Unselected task', type: 'deadline', date: '2026-11-17' },
  ]
  await page.route('**/api/scan-document', route => route.fulfill({ json: { result: rows } }))
  await page.goto('http://127.0.0.1:4173/#/timetable')
  await page.getByRole('button', { name: 'Scan Document' }).click()
  await page.getByLabel('Choose document image').setInputFiles({ name: 'test.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=', 'base64') })
  await page.getByRole('button', { name: 'Scan image', exact: true }).click()
  await page.getByLabel('Include item 5').uncheck()
  await page.getByLabel('Title 2', { exact: true }).fill('Corrected imported assignment')
  await page.getByLabel('End time 1', { exact: true }).fill('07:00')
  await page.getByRole('button', { name: 'Import 4 items' }).click()
  await page.getByRole('alert').filter({ hasText: 'end time after' }).waitFor()
  await page.getByLabel('End time 1', { exact: true }).fill('09:00')
  await page.getByRole('button', { name: 'Import 4 items' }).click()
  await page.getByRole('dialog', { name: 'Smart Scanner' }).waitFor({ state: 'hidden' })
  const records = await page.evaluate(async () => {
    const database = await new Promise((resolve, reject) => { const request = indexedDB.open('semester-desk'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) })
    const read = name => new Promise(resolve => { const request = database.transaction(name).objectStore(name).getAll(); request.onsuccess = () => resolve(request.result) })
    const result = { tasks: await read('tasks'), slots: await read('timetable_slots'), exceptions: await read('timetable_exceptions') }; database.close(); return result
  })
  assert(records.slots.some(s => s.room === 'Demo room' && s.weekday === 1 && s.start === '08:00'))
  assert(records.exceptions.some(e => e.note === 'Imported holiday' && e.kind === 'holiday'))
  assert(records.tasks.some(t => t.title === 'Imported exam' && t.type === 'exam'))
  assert(records.tasks.some(t => t.title === 'Corrected imported assignment' && t.due_at === '2026-11-10T12:30:00.000Z'))
  assert(!records.tasks.some(t => t.title === 'Unselected task'))
  console.log('PASS scanner validates edits, respects selection, and stores all four event types with local-time conversion')
  await page.goto('http://127.0.0.1:4173/#/tasks')
  await page.getByText('Corrected imported assignment', { exact: true }).waitFor()
  await page.reload()
  await page.getByText('Corrected imported assignment', { exact: true }).waitFor()
  console.log('PASS imported task survives reload and appears in Deadlines')
  await mkdir('shots', { recursive: true })
  await page.screenshot({ path: 'shots/hackathon-deadlines.png', fullPage: true })
  assert.deepEqual(errors, [])
  await context.close()
} finally { await browser.close() }
