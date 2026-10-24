import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

const BASE = process.env.BASE_URL || 'http://127.0.0.1:5173'
const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Kolkata' })
const page = await context.newPage()
page.setDefaultTimeout(8000)
const errors = []
const results = []
page.on('pageerror', (error) => errors.push(error.message))
const rows = (table) => page.evaluate(async (name) => {
  const { db } = await import('/src/db/db.ts')
  return (await db.table(name).toArray()).filter((row) => !row.deleted_at)
}, table)
const navigate = async (route) => {
  await page.goto(`${BASE}/#/${route}`)
  await page.waitForSelector('main')
}
const check = async (name, run) => {
  try {
    await run()
    results.push(`PASS ${name}`)
    console.log(results.at(-1))
  } catch (error) {
    results.push(`FAIL ${name}: ${error.message.split('\n')[0]}`)
    console.log(results.at(-1), error.stack)
    await page.keyboard.press('Escape').catch(() => {})
  }
}
const dialog = () => page.getByRole('dialog')
const waitRows = async (table, predicate) => {
  await page.waitForFunction(async ({ table, predicate }) => {
    const { db } = await import('/src/db/db.ts')
    const rows = (await db.table(table).toArray()).filter((row) => !row.deleted_at)
    return new Function('rows', `return (${predicate})(rows)`)(rows)
  }, { table, predicate: predicate.toString() })
}
try {
  await page.goto(BASE)
  await page.getByRole('button', { name: 'Skip', exact: true }).click()
  await dialog().waitFor({ state: 'hidden' })

  await check('Settings name and grade letter retain focus and all typed characters', async () => {
    await navigate('settings')
    const name = page.getByLabel('Name', { exact: true })
    await name.fill('')
    await name.pressSequentially('Ada Lovelace', { delay: 12 })
    assert.equal(await name.inputValue(), 'Ada Lovelace')
    assert.equal(await name.evaluate((el) => el === document.activeElement), true)
    await page.getByLabel('Institution', { exact: true }).fill('Test Institute')
    const grade = page.getByLabel('Grade 1 letter', { exact: true })
    await grade.fill('')
    await grade.pressSequentially('HONOURS', { delay: 35 })
    assert.equal(await grade.inputValue(), 'HONOURS')
    assert.equal(await grade.evaluate((el) => el === document.activeElement), true)
    await waitRows('profiles', (rows) => rows[0].name === 'Ada Lovelace' && rows[0].grade_bands[0].letter === 'HONOURS')
    const points = page.getByLabel('Grade 1 points', { exact: true })
    await points.fill('')
    await points.pressSequentially('9.5', { delay: 35 })
    assert.equal(await points.inputValue(), '9.5')
    assert.equal(await points.evaluate((el) => el === document.activeElement), true)
    await waitRows('profiles', (rows) => rows[0].grade_bands[0].points === 9.5)
    await page.locator('input[type="range"]').fill('240')
    await waitRows('profiles', (rows) => rows[0].daily_capacity_min === 240)
    await page.getByRole('button', { name: '4.0 GPA', exact: true }).click()
    await waitRows('profiles', (rows) => rows[0].grading_scheme === 'gpa4' && Math.max(...rows[0].grade_bands.map((b) => b.points)) === 4)
    await page.getByRole('button', { name: '10-point CGPA', exact: true }).click()
    await page.getByLabel('Theme', { exact: true }).selectOption('dark')
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark')
    await page.getByLabel('Theme', { exact: true }).selectOption('light')
  })

  await check('Money expense accepts decimals; delete and Undo restore exactly one row', async () => {
    await navigate('money')
    await page.getByLabel('Amount (₹)', { exact: true }).fill('0.50')
    await page.getByLabel('Note', { exact: true }).fill('Audit expense')
    await page.getByRole('button', { name: 'Add', exact: true }).first().click({ clickCount: 2 })
    await waitRows('transactions', (rows) => rows.some((row) => row.note === 'Audit expense' && row.amount === 0.5))
    assert.equal((await rows('transactions')).filter((row) => row.note === 'Audit expense').length, 1)
    const row = page.getByText('Audit expense', { exact: true }).locator('..')
    await row.getByRole('button', { name: 'Delete expense' }).click()
    await waitRows('transactions', (rows) => !rows.some((row) => row.note === 'Audit expense'))
    await page.getByRole('status').getByRole('button', { name: 'Undo' }).click()
    await waitRows('transactions', (rows) => rows.filter((row) => row.note === 'Audit expense').length === 1)
  })

  await check('Money budgets replace a category limit, edit and delete without duplicate totals', async () => {
    await page.getByRole('button', { name: 'Budget', exact: true }).click()
    await dialog().getByLabel('Category', { exact: true }).selectOption('Books')
    await dialog().getByLabel(/Monthly limit/).fill('1234.50')
    await dialog().getByRole('button', { name: 'Set budget' }).click()
    await dialog().waitFor({ state: 'hidden' })
    await page.getByRole('button', { name: 'Budget', exact: true }).click()
    await dialog().getByLabel('Category', { exact: true }).selectOption('Books')
    await dialog().getByLabel(/Monthly limit/).fill('2000')
    await dialog().getByRole('button', { name: 'Set budget' }).click()
    await dialog().waitFor({ state: 'hidden' })
    await waitRows('budgets', (rows) => rows.filter((row) => row.category === 'Books').length === 1 && rows.some((row) => row.category === 'Books' && row.limit_amount === 2000))
    await page.getByRole('button', { name: 'Edit Books budget' }).click()
    await dialog().getByLabel(/Monthly limit/).fill('2500')
    await dialog().getByRole('button', { name: 'Set budget' }).click()
    await waitRows('budgets', (rows) => rows.some((row) => row.category === 'Books' && row.limit_amount === 2500))
    await page.getByRole('button', { name: 'Delete Books budget' }).click()
    await waitRows('budgets', (rows) => !rows.some((row) => row.category === 'Books'))
    await page.getByRole('status').getByRole('button', { name: 'Undo' }).click()
    await waitRows('budgets', (rows) => rows.some((row) => row.category === 'Books' && row.limit_amount === 2500))
  })

  await check('Recurring create/date clear/edit/early Paid logs once and advances the calendar', async () => {
    const recurringPanel = page.getByRole('heading', { name: 'Recurring', exact: true }).locator('../..')
    await recurringPanel.getByRole('button', { name: 'Add', exact: true }).click()
    await dialog().getByLabel('What', { exact: true }).fill('Audit rent')
    await dialog().getByLabel('Amount (₹)', { exact: true }).fill('1250.50')
    await dialog().getByLabel('Next due', { exact: true }).fill('')
    await dialog().getByLabel('Next due', { exact: true }).fill('2030-01-31')
    await dialog().getByRole('button', { name: 'Save', exact: true }).click()
    await page.getByRole('button', { name: 'Edit Audit rent', exact: true }).click()
    await dialog().getByLabel('Amount (₹)', { exact: true }).fill('1300.50')
    await dialog().getByRole('button', { name: 'Save', exact: true }).click()
    const rent = page.getByRole('button', { name: 'Edit Audit rent', exact: true }).locator('..')
    await rent.getByRole('button', { name: 'Paid', exact: true }).click({ clickCount: 2 })
    await waitRows('recurring', (rows) => rows.some((row) => row.name === 'Audit rent' && row.next_at.startsWith('2030-02-28')))
    assert.equal((await rows('transactions')).filter((row) => row.note === 'Audit rent').length, 1)
    assert.equal((await rows('transactions')).find((row) => row.note === 'Audit rent').amount, 1300.5)
    const calendar = await page.evaluate(async () => {
      const { advanceRecurring } = await import('/src/lib/money.ts')
      return [
        advanceRecurring({ next_at: '2030-01-31T09:00:00+05:30', cadence: 'monthly' }, new Date('2029-12-01')),
        advanceRecurring({ next_at: '2028-02-29T09:00:00+05:30', cadence: 'yearly' }, new Date('2028-01-01')),
        advanceRecurring({ next_at: '2030-01-31T09:00:00+05:30', cadence: 'monthly' }, new Date('2030-03-01')),
      ]
    })
    assert.ok(calendar[0].startsWith('2030-02-28'))
    assert.ok(calendar[1].startsWith('2029-02-28'))
    assert.ok(calendar[2].startsWith('2030-03-31'))
    await page.getByRole('button', { name: 'Delete Audit rent' }).click()
    await waitRows('recurring', (rows) => !rows.some((row) => row.name === 'Audit rent'))
    await page.getByRole('status').getByRole('button', { name: 'Undo' }).click()
  })

  await check('Habit create, log, unlog, delete and Undo have one daily result', async () => {
    await page.getByRole('textbox', { name: 'New habit' }).fill('Audit walk')
    await page.getByRole('button', { name: 'Add habit' }).click({ clickCount: 2 })
    await waitRows('habits', (rows) => rows.filter((row) => row.name === 'Audit walk').length === 1)
    const toggle = page.getByRole('button', { name: 'Log Audit walk for today' })
    await toggle.click()
    await page.waitForFunction(async () => {
      const { db } = await import('/src/db/db.ts')
      const h = (await db.habits.toArray()).find((h) => h.name === 'Audit walk')
      return (await db.habit_logs.toArray()).filter((l) => !l.deleted_at && l.habit_id === h.id).length === 1
    })
    assert.equal(await toggle.getAttribute('aria-pressed'), 'true')
    await toggle.click()
    await page.waitForFunction(async () => {
      const { db } = await import('/src/db/db.ts')
      const h = (await db.habits.toArray()).find((h) => h.name === 'Audit walk')
      return !(await db.habit_logs.toArray()).some((l) => !l.deleted_at && l.habit_id === h.id)
    })
    await page.getByRole('button', { name: 'Delete Audit walk' }).click()
    await waitRows('habits', (rows) => !rows.some((row) => row.name === 'Audit walk'))
    await page.getByRole('status').getByRole('button', { name: 'Undo' }).click()
    await waitRows('habits', (rows) => rows.some((row) => row.name === 'Audit walk'))
  })

  await check('Applications create/edit, stages and timeline add/delete/Undo persist', async () => {
    await navigate('applications')
    await page.getByRole('button', { name: 'Add application', exact: true }).click()
    await dialog().getByLabel('Organisation', { exact: true }).pressSequentially('Audit Labs', { delay: 15 })
    await dialog().getByLabel('Role or programme', { exact: true }).fill('Research intern')
    await dialog().getByLabel('Link', { exact: true }).fill('https://example.com/internship')
    await dialog().getByRole('button', { name: 'Save', exact: true }).click()
    await waitRows('applications', (rows) => rows.some((row) => row.org === 'Audit Labs'))
    let card = page.getByRole('button', { name: 'Audit Labs Research intern' }).locator('..')
    assert.equal(await card.getByRole('button', { name: 'Move back a stage' }).isDisabled(), true)
    await card.getByRole('button', { name: 'Move forward a stage' }).click()
    await waitRows('applications', (rows) => rows.some((row) => row.org === 'Audit Labs' && row.stage === 'applied'))
    await page.getByRole('button', { name: 'Audit Labs Research intern' }).click()
    assert.equal(await dialog().getByRole('link', { name: 'Open posting' }).getAttribute('href'), 'https://example.com/internship')
    await dialog().getByRole('textbox', { name: 'Timeline event note' }).fill('Audit interview confirmed')
    await dialog().getByRole('button', { name: 'Add timeline event' }).click()
    await waitRows('application_events', (rows) => rows.some((row) => row.note === 'Audit interview confirmed'))
    const event = dialog().getByText('Audit interview confirmed', { exact: true }).locator('..')
    await event.getByRole('button', { name: 'Delete event' }).click()
    await page.getByRole('status').getByRole('button', { name: 'Undo' }).click()
    await waitRows('application_events', (rows) => rows.some((row) => row.note === 'Audit interview confirmed'))
    await dialog().getByRole('button', { name: 'Edit', exact: true }).click()
    await dialog().getByLabel('Stage', { exact: true }).selectOption('interview')
    await dialog().getByLabel('Notes', { exact: true }).fill('Audit notes persisted')
    await dialog().getByRole('button', { name: 'Save', exact: true }).click()
    await waitRows('application_events', (rows) => rows.some((row) => row.note === 'Moved to Interview'))
    await page.getByRole('button', { name: 'Audit Labs Research intern' }).click()
    await dialog().getByText('Audit notes persisted').waitFor()
    await dialog().getByRole('button', { name: 'Edit', exact: true }).click()
    await dialog().getByRole('button', { name: 'Delete', exact: true }).click()
    await waitRows('applications', (rows) => !rows.some((row) => row.org === 'Audit Labs'))
  })

  await check('Contacts create/edit/follow-up/Touched and delete work in local time', async () => {
    const contacts = page.getByRole('heading', { name: 'Contacts and follow-ups' }).locator('../..')
    await contacts.getByRole('button', { name: 'Add', exact: true }).click()
    await dialog().getByLabel('Name', { exact: true }).fill('Audit Mentor')
    await dialog().getByLabel('Email', { exact: true }).fill('mentor@example.com')
    await dialog().getByLabel('Follow up on', { exact: true }).fill('2026-01-01')
    await dialog().getByRole('button', { name: 'Save', exact: true }).click()
    await page.getByRole('button', { name: 'Audit Mentor', exact: true }).click()
    assert.equal(await dialog().getByLabel('Follow up on').inputValue(), '2026-01-01')
    await dialog().getByLabel('Context', { exact: true }).fill('Audit context')
    await dialog().getByRole('button', { name: 'Save', exact: true }).click()
    await page.getByRole('button', { name: 'Audit Mentor', exact: true }).locator('..').getByRole('button', { name: 'Touched', exact: true }).click()
    await waitRows('contacts', (rows) => rows.some((row) => row.name === 'Audit Mentor' && row.last_touch && row.follow_up_at > new Date().toISOString()))
    await page.getByRole('button', { name: 'Audit Mentor', exact: true }).click()
    await dialog().getByRole('button', { name: 'Delete contact', exact: true }).click()
    await waitRows('contacts', (rows) => !rows.some((row) => row.name === 'Audit Mentor'))
  })

  await check('Resume item/bullets/version/toggle, DOCX/Markdown/Copy/Print and deletion', async () => {
    await navigate('resume')
    await page.getByRole('button', { name: 'Add item', exact: true }).click()
    await dialog().getByLabel('Title', { exact: true }).fill('Audit project')
    await dialog().getByLabel('Organisation or stack', { exact: true }).fill('React')
    await dialog().getByPlaceholder('Cut cold-start time from 4s to 900ms by…').fill('Built a reliable student workspace.')
    await dialog().getByRole('button', { name: 'Add bullet' }).click()
    await dialog().getByPlaceholder('Cut cold-start time from 4s to 900ms by…').last().fill('Extra bullet to remove')
    await dialog().getByRole('button', { name: 'Remove bullet' }).last().click()
    await dialog().getByRole('button', { name: 'Save', exact: true }).click()
    await page.getByRole('button', { name: 'New version', exact: true }).click()
    await page.getByLabel('Version', { exact: true }).selectOption({ label: 'Version 2' })
    await page.getByLabel('Name', { exact: true }).fill('Audit CV')
    await page.getByLabel('Target role').fill('Engineer')
    const include = page.getByLabel('Include Audit project', { exact: true })
    await include.click()
    await page.locator('.print-root').getByText('Audit project', { exact: true }).waitFor({ state: 'hidden' })
    await include.click()
    await page.locator('.print-root').getByText('Audit project', { exact: true }).waitFor()
    for (const [label, extension] of [['DOCX', '.docx'], ['Markdown', '.md']]) {
      const downloaded = page.waitForEvent('download')
      await page.getByRole('button', { name: label, exact: true }).click()
      const file = await downloaded
      assert.ok(file.suggestedFilename().endsWith(extension))
      const bytes = await fs.readFile(await file.path())
      assert.ok(bytes.includes(Buffer.from('Audit project')))
      if (extension === '.docx') assert.equal(bytes.subarray(0, 2).toString(), 'PK')
    }
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (value) => { window.__copied = value } } })
      window.print = () => { window.__printed = true }
    })
    await page.getByRole('button', { name: 'Copy', exact: true }).click()
    assert.ok((await page.evaluate(() => window.__copied)).includes('Audit project'))
    await page.getByRole('button', { name: 'Print / PDF', exact: true }).click()
    assert.equal(await page.evaluate(() => window.__printed), true)
    await page.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined }) })
    await page.getByRole('button', { name: 'Copy', exact: true }).click()
    await page.getByRole('status').filter({ hasText: 'Clipboard access is unavailable' }).waitFor()
    await page.getByRole('button', { name: 'Audit project project · React · 1 bullet', exact: true }).click()
    await dialog().getByLabel('Title', { exact: true }).fill('Audit project edited')
    await dialog().getByRole('button', { name: 'Save', exact: true }).click()
    await page.getByRole('button', { name: 'Audit project edited project · React · 1 bullet', exact: true }).click()
    await dialog().getByRole('button', { name: 'Delete', exact: true }).click()
    await page.getByRole('button', { name: 'Delete version', exact: true }).click()
    await waitRows('resume_versions', (rows) => !rows.some((row) => row.name === 'Audit CV'))
  })

  let backup
  await check('Holiday import adds actual exceptions, avoids duplicates and disables invalid year', async () => {
    await navigate('settings')
    await page.route('**/api/v3/PublicHolidays/**', (route) => route.fulfill({ json: [
      { date: '2030-01-01', localName: 'Audit New Year' },
      { date: '2030-01-26', localName: 'Audit Republic Day' },
    ] }))
    await page.getByLabel('Year', { exact: true }).fill('2030')
    await page.getByRole('button', { name: 'Import holidays', exact: true }).click()
    await page.getByRole('status').filter({ hasText: '2 holidays added for 2030' }).waitFor()
    await page.getByRole('button', { name: 'Import holidays', exact: true }).click()
    await page.getByRole('status').filter({ hasText: 'Already had every 2030 holiday' }).waitFor()
    assert.equal((await rows('timetable_exceptions')).filter((row) => row.note.startsWith('Audit')).length, 2)
    await page.getByLabel('Year', { exact: true }).fill('0')
    assert.equal(await page.getByRole('button', { name: 'Import holidays', exact: true }).isDisabled(), true)
    await page.unroute('**/api/v3/PublicHolidays/**')
  })

  await check('Settings JSON and CSV downloads contain real current records', async () => {
    await navigate('settings')
    const jsonDownload = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export JSON', exact: true }).click()
    const file = await jsonDownload
    backup = JSON.parse(await fs.readFile(await file.path(), 'utf8'))
    assert.equal(backup.app, 'semester-desk')
    assert.equal(backup.tables.profiles[0].name, 'Ada Lovelace')
    const csvDownload = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export CSV', exact: true }).click()
    const csv = await fs.readFile(await (await csvDownload).path(), 'utf8')
    assert.ok(csv.includes('# transactions') && csv.includes('Audit expense'))
  })

  await check('Backup rejects invalid later rows and internal tables without partial writes', async () => {
    const before = (await rows('courses')).length
    const course = { ...backup.tables.courses[0], id: 'audit-import-course', name: 'Should never be imported' }
    const broken = { app: 'semester-desk', version: 2, tables: { courses: [course], tasks: [{ id: 'bad-task' }] } }
    await page.locator('input[type=file]').setInputFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(broken)) })
    await page.getByRole('status').filter({ hasText: 'Invalid or duplicate row in tasks' }).waitFor()
    assert.equal((await rows('courses')).length, before)
    const invalidStore = { app: 'semester-desk', version: 2, tables: { outbox: [] } }
    await page.locator('input[type=file]').setInputFiles({ name: 'invalid-store.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(invalidStore)) })
    await page.getByRole('status').filter({ hasText: 'Unknown backup table: outbox' }).waitFor()
    const atomic = await page.evaluate(async (course) => {
      const { db } = await import('/src/db/db.ts')
      const { importJson } = await import('/src/lib/backup.ts')
      const source = (await db.tasks.toArray())[0]
      const originalPut = IDBObjectStore.prototype.put
      IDBObjectStore.prototype.put = function (...args) {
        if (this.name === 'tasks') throw new Error('Simulated storage failure')
        return originalPut.apply(this, args)
      }
      let message = ''
      try { await importJson(JSON.stringify({ app: 'semester-desk', version: 2, tables: { courses: [course], tasks: [{ ...source, id: 'audit-rollback-task' }] } })) }
      catch (error) { message = error.message }
      finally { IDBObjectStore.prototype.put = originalPut }
      return { message, courseExists: Boolean(await db.courses.get(course.id)), taskExists: Boolean(await db.tasks.get('audit-rollback-task')) }
    }, course)
    assert.match(atomic.message, /Simulated storage failure/)
    assert.equal(atomic.courseExists, false)
    assert.equal(atomic.taskExists, false)
    for (const [field, value] of [['quiet_hours', ['25:99', '07:00']], ['notify', { morning: 'yes' }], ['grade_bands', [{ min_pct: 90, letter: 'A', points: 'ten' }]], ['term_end', '2026-02-31']]) {
      const malformed = { app: 'semester-desk', version: 2, tables: { profiles: [{ ...backup.tables.profiles[0], [field]: value }] } }
      await page.locator('input[type=file]').setInputFiles({ name: 'malformed-profile.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(malformed)) })
      await page.getByRole('status').filter({ hasText: 'Invalid or duplicate row in profiles' }).waitFor()
    }
  })

  await check('Backup UI import merges by ID and restores profile with no duplicate rows', async () => {
    await page.getByLabel('Name', { exact: true }).fill('Changed name')
    await waitRows('profiles', (rows) => rows[0].name === 'Changed name')
    const before = (await rows('courses')).length
    await page.locator('input[type=file]').setInputFiles({ name: 'roundtrip.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) })
    await page.getByRole('status').filter({ hasText: /Imported \d+ rows across \d+ tables/ }).waitFor()
    await waitRows('profiles', (rows) => rows[0].name === 'Ada Lovelace')
    assert.equal((await rows('courses')).length, before)
    await page.getByLabel('Institution', { exact: true }).click()
    assert.equal(await page.getByLabel('Name', { exact: true }).inputValue(), 'Ada Lovelace')
  })

  await check('Install fallback, prompt dismissed/accepted and installed state are accurate', async () => {
    await navigate('install')
    await page.getByRole('button', { name: 'How to install', exact: true }).click()
    await page.getByRole('heading', { name: 'On your phone' }).waitFor()
    assert.equal(await page.getByRole('link', { name: 'Downloads & release notes' }).getAttribute('href'), 'https://github.com/playxgaming/semester-desk-app/releases/latest')
    await page.evaluate(() => {
      const event = new Event('beforeinstallprompt', { cancelable: true })
      event.prompt = async () => { window.__installPrompt = true }
      event.userChoice = Promise.resolve({ outcome: 'dismissed' })
      window.dispatchEvent(event)
    })
    await page.getByRole('button', { name: 'Install Semester Desk', exact: true }).click()
    await page.getByRole('status').filter({ hasText: 'You can install later' }).waitFor()
    assert.equal(await page.evaluate(() => window.__installPrompt), true)
    await page.evaluate(() => {
      const event = new Event('beforeinstallprompt', { cancelable: true })
      event.prompt = async () => {}
      event.userChoice = Promise.resolve({ outcome: 'accepted' })
      window.dispatchEvent(event)
    })
    await page.getByRole('button', { name: 'Install Semester Desk', exact: true }).click()
    await page.getByRole('status').filter({ hasText: 'Installation started' }).waitFor()
    await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')))
    await page.getByRole('button', { name: 'Installed on this device' }).waitFor()
  })

  await check('Reset clears tables, file bytes and saved focus state; no demo reappears', async () => {
    await navigate('settings')
    await page.evaluate(async () => {
      const { db } = await import('/src/db/db.ts')
      await db.blobs.put({ id: 'audit-file', data: new Blob(['audit']) })
      localStorage.setItem('semester-desk:focus-run', JSON.stringify({ test: true }))
    })
    page.once('dialog', (prompt) => prompt.accept())
    await page.getByRole('button', { name: 'Reset and start empty', exact: true }).click()
    await page.waitForEvent('load')
    await page.getByRole('dialog', { name: 'Set up Semester Desk' }).waitFor()
    const state = await page.evaluate(async () => {
      const { db } = await import('/src/db/db.ts')
      const counts = Object.fromEntries(await Promise.all(db.tables.map(async (table) => [table.name, await table.count()])))
      return { counts, focus: localStorage.getItem('semester-desk:focus-run'), seeded: localStorage.getItem('semester-desk:seeded') }
    })
    assert.equal(state.focus, null)
    assert.equal(state.seeded, '1')
    assert.equal(state.counts.profiles, 1)
    for (const [table, count] of Object.entries(state.counts)) if (table !== 'profiles') assert.equal(count, 0, table)
  })
} finally {
  console.log(`${results.filter((result) => result.startsWith('PASS')).length}/${results.length} life-flow checks passed`)
  console.log(errors.length ? `PAGE ERRORS: ${errors.join(' | ')}` : 'No page errors')
  await browser.close()
}
if (results.some((result) => result.startsWith('FAIL')) || errors.length) process.exitCode = 1
