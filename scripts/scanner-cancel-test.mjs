import { chromium } from 'playwright'
import assert from 'node:assert/strict'
const base = process.env.BASE_URL || 'http://127.0.0.1:5173'
const browser = await chromium.launch()
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 800 } })
  await page.goto(base)
  await page.getByRole('button', { name: 'Skip', exact: true }).click()
  await page.getByRole('dialog', { name: 'Set up Semester Desk' }).waitFor({ state: 'hidden' })
  await page.route('**/api/scan-document', async route => {
    await new Promise(resolve => setTimeout(resolve, 1500))
    await route.fulfill({ json: { result: [{ type: 'deadline', title: 'Cancelled extraction', date: '2026-12-01' }] } }).catch(() => {})
  })
  await page.goto(`${base}/#/timetable`)
  await page.getByRole('button', { name: 'Scan Document', exact: true }).click()
  await page.getByLabel('Choose document image').setInputFiles({ name: 'sample.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=', 'base64') })
  await page.getByRole('button', { name: 'Scan image', exact: true }).click()
  await page.getByRole('button', { name: 'Cancel scan', exact: true }).click()
  await page.getByRole('dialog', { name: 'Smart Scanner' }).waitFor({ state: 'hidden' })
  await page.getByRole('button', { name: 'Scan Document', exact: true }).click()
  await page.waitForTimeout(1700)
  assert.equal(await page.getByText('Cancelled extraction', { exact: true }).count(), 0)
  assert.equal(await page.getByRole('button', { name: 'Scan image', exact: true }).isDisabled(), true)
  console.log('PASS scanner can cancel in-flight extraction and stale results do not appear in a reopened dialog')
} finally { await browser.close() }
