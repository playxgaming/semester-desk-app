import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const BASE = process.env.APP_URL || 'http://127.0.0.1:4173'
const browser = await chromium.launch({ args: ['--no-sandbox'] })
const errors = []

async function openSetup(mobile) {
  const context = await browser.newContext({
    viewport: mobile ? { width: 390, height: 780 } : { width: 1280, height: 900 },
    isMobile: mobile,
    hasTouch: mobile,
    serviceWorkers: 'block',
  })
  const page = await context.newPage()
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.getByRole('dialog', { name: 'Set up Semester Desk' }).waitFor()
  return { context, page, dialog: page.getByRole('dialog', { name: 'Set up Semester Desk' }) }
}

async function typeWithoutRefocusing(page, input, text) {
  await input.click()
  await page.keyboard.type(text, { delay: 25 })
  await page.waitForTimeout(30) // The old Modal effect stole focus after 10 ms.
  assert.equal(await input.inputValue(), text, 'One tap must allow the entire value, including spaces.')
  assert.equal(await input.evaluate((node) => document.activeElement === node), true, 'Typing must retain focus.')
}

async function stored(page) {
  return page.evaluate(async () => {
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open('semester-desk')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    try {
      const names = ['profiles', 'courses', 'attendance', 'subtasks', 'note_versions', 'timetable_exceptions']
      const tx = database.transaction(names, 'readonly')
      const entries = await Promise.all(names.map(async (name) => [name, await new Promise((resolve, reject) => {
        const request = tx.objectStore(name).getAll()
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })]))
      return Object.fromEntries(entries)
    } finally {
      database.close()
    }
  })
}

async function advanceToCourses(dialog) {
  await dialog.getByRole('button', { name: 'Continue', exact: true }).click()
  await dialog.getByRole('combobox', { name: 'Grading scheme', exact: true }).selectOption('gpa4')
  await dialog.getByRole('combobox', { name: 'Attendance requirement', exact: true }).selectOption('0.8')
  await dialog.getByRole('button', { name: 'Continue', exact: true }).click()
}

try {
  for (const mobile of [true, false]) {
    const { context, page, dialog } = await openSetup(mobile)
    await dialog.getByRole('button', { name: 'Continue', exact: true }).click()
    assert.match(await dialog.getByRole('alert').innerText(), /Enter your name/)
    const name = dialog.getByLabel('Your name', { exact: true })
    await typeWithoutRefocusing(page, name, 'Aarav Kumar')
    await page.keyboard.press('Home')
    for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight')
    await page.keyboard.type(' M.', { delay: 25 })
    assert.equal(await name.inputValue(), 'Aarav M. Kumar', 'Editing in the middle must retain the cursor position.')
    await typeWithoutRefocusing(page, dialog.getByLabel('Institution', { exact: true }), 'Example Institute of Technology')
    await dialog.getByLabel('Term starts').fill('2026-08-01')
    await dialog.getByLabel('Term ends').fill('2026-07-01')
    await dialog.getByRole('button', { name: 'Continue', exact: true }).click()
    assert.match(await dialog.getByRole('alert').innerText(), /term end/)
    await dialog.getByLabel('Term ends').fill('2026-12-15')
    const semester = dialog.getByRole('textbox', { name: 'Which semester is this?', exact: true })
    await semester.fill('Semester 7')
    const hintId = await semester.getAttribute('aria-describedby')
    assert.ok(hintId, 'Helpful field text must be exposed as a description, separately from the label.')
    assert.match(await page.locator(`[id="${hintId}"]`).innerText(), /Courses are grouped/)
    await advanceToCourses(dialog)
    await typeWithoutRefocusing(page, dialog.getByLabel('Course 1 code', { exact: true }), 'cs701')
    await typeWithoutRefocusing(page, dialog.getByLabel('Course 1 name', { exact: true }), 'Machine Learning')
    await dialog.getByLabel('Course 1 credits', { exact: true }).fill('0')
    await dialog.getByRole('button', { name: 'Continue', exact: true }).click()
    assert.match(await dialog.getByRole('alert').innerText(), /greater than zero/)
    await dialog.getByLabel('Course 1 credits', { exact: true }).fill('4')
    await dialog.getByRole('button', { name: 'Another course' }).click()
    await dialog.getByLabel('Course 2 code', { exact: true }).fill('CS701')
    await dialog.getByRole('button', { name: 'Continue', exact: true }).click()
    assert.match(await dialog.getByRole('alert').innerText(), /different code/)
    await dialog.getByRole('button', { name: 'Remove course 2', exact: true }).click()
    await dialog.getByRole('button', { name: 'Another course' }).click()
    await dialog.getByLabel('Course 2 name', { exact: true }).fill('Cloud Computing')
    await dialog.getByRole('button', { name: 'Continue', exact: true }).click()
    assert.match(await dialog.getByRole('alert').innerText(), /Add a code/)
    await dialog.getByLabel('Course 2 code', { exact: true }).fill('CS702')
    await dialog.getByLabel('Course 2 credits', { exact: true }).fill('3')
    const overflows = await dialog.evaluate((node) => node.scrollWidth > node.clientWidth + 1)
    assert.equal(overflows, false, 'Setup course rows must fit the phone viewport.')
    await dialog.getByRole('button', { name: 'Continue', exact: true }).click()
    await dialog.getByRole('button', { name: 'Back', exact: true }).click()
    assert.equal(await dialog.getByLabel('Course 1 name', { exact: true }).inputValue(), 'Machine Learning')
    await dialog.getByRole('button', { name: 'Continue', exact: true }).click()
    await dialog.getByRole('button', { name: 'Without reminders', exact: true }).click()
    await dialog.waitFor({ state: 'hidden' })
    const saved = await stored(page)
    assert.equal(saved.profiles[0].name, 'Aarav M. Kumar')
    assert.equal(saved.profiles[0].institution, 'Example Institute of Technology')
    assert.equal(saved.profiles[0].current_semester, 'Semester 7')
    assert.equal(saved.profiles[0].attendance_threshold, 0.8)
    assert.equal(saved.profiles[0].grading_scheme, 'gpa4')
    assert.equal(Math.max(...saved.profiles[0].grade_bands.map((band) => band.points)), 4)
    assert.deepEqual(saved.courses.map((course) => course.code).sort(), ['CS701', 'CS702'])
    for (const table of ['attendance', 'subtasks', 'note_versions', 'timetable_exceptions']) assert.equal(saved[table].length, 0)
    await page.reload({ waitUntil: 'networkidle' })
    assert.equal(await page.getByRole('dialog', { name: 'Set up Semester Desk' }).count(), 0)
    await page.goto(`${BASE}/#/settings`, { waitUntil: 'networkidle' })
    await page.getByRole('button', { name: 'Run setup again', exact: true }).click()
    await dialog.waitFor()
    assert.equal(await dialog.getByLabel('Your name', { exact: true }).inputValue(), 'Aarav M. Kumar', 'Restart must load saved profile fields.')
    await advanceToCourses(dialog)
    assert.equal(await dialog.getByRole('checkbox', { name: /Start fresh/ }).isChecked(), false, 'Restart must preserve existing personal data by default.')
    await dialog.getByRole('button', { name: 'Continue', exact: true }).click()
    await dialog.getByRole('button', { name: 'Without reminders', exact: true }).click()
    await dialog.waitFor({ state: 'hidden' })
    assert.equal((await stored(page)).courses.length, 2, 'Running setup again must keep the existing courses.')
    await context.close()
    console.log(`PASS ${mobile ? 'mobile' : 'desktop'}: one-tap typing, cursor edits, validation, course controls, GPA scale, save, reload, setup restart`)
  }

  {
    const { context, page, dialog } = await openSetup(true)
    await dialog.getByRole('button', { name: 'Skip', exact: true }).click()
    await dialog.waitFor({ state: 'hidden' })
    await page.goto(`${BASE}/#/settings`, { waitUntil: 'networkidle' })
    await page.getByRole('button', { name: 'Run setup again', exact: true }).click()
    await dialog.waitFor()
    await dialog.getByLabel('Your name', { exact: true }).fill('Previously Unnamed Student')
    await advanceToCourses(dialog)
    assert.equal(await dialog.getByRole('checkbox', { name: /Start fresh/ }).isChecked(), false, 'An unnamed profile must also preserve data when setup restarts.')
    await context.close()
    console.log('PASS skipped setup restart: unnamed profiles keep existing data by default')
  }

  // Force an actual IndexedDB write failure after clear() calls were queued.
  // The entire previous semester must remain available, and retry must work.
  const { context, page, dialog } = await openSetup(true)
  const before = await stored(page)
  await dialog.getByLabel('Your name', { exact: true }).fill('Atomic Save Test')
  await advanceToCourses(dialog)
  await dialog.getByLabel('Course 1 code', { exact: true }).fill('FAIL101')
  await dialog.getByRole('button', { name: 'Continue', exact: true }).click()
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function (value, ...args) {
      if (this.name === 'courses' && value.code === 'FAIL101') throw new DOMException('Simulated full device', 'QuotaExceededError')
      return original.call(this, value, ...args)
    }
    window.__restorePut = () => { IDBObjectStore.prototype.put = original }
  })
  await dialog.getByRole('button', { name: 'Without reminders', exact: true }).click()
  await dialog.getByRole('alert').waitFor()
  assert.match(await dialog.getByRole('alert').innerText(), /not saved/)
  const after = await stored(page)
  assert.deepEqual(after.courses, before.courses, 'A failed setup must roll back deleted courses.')
  assert.deepEqual(after.attendance, before.attendance, 'A failed setup must roll back deleted attendance.')
  assert.equal(after.profiles[0].onboarded, false)
  await page.evaluate(() => window.__restorePut())
  await dialog.getByRole('button', { name: 'Without reminders', exact: true }).click()
  await dialog.waitFor({ state: 'hidden' })
  assert.deepEqual((await stored(page)).courses.map((course) => course.code), ['FAIL101'])
  await context.close()
  console.log('PASS setup write failure: previous data rolls back atomically; retry saves once')
  assert.deepEqual(errors, [], 'No uncaught page errors are allowed.')
} finally {
  await browser.close()
}
