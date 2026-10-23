import { chromium } from 'playwright'
import assert from 'node:assert/strict'

const browser = await chromium.launch()
try {
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.goto('http://127.0.0.1:4173')
  await page.getByRole('button', { name: /Skip/ }).click()
  await page.getByRole('dialog', { name: 'Set up Semester Desk' }).waitFor({ state: 'hidden' })
  await page.evaluate(async () => {
    await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Service worker did not activate within 20 seconds')), 20_000)),
    ])
  })
  await context.setOffline(true)
  await page.reload()
  await page.getByRole('heading', { level: 1 }).waitFor()
  await page.goto('http://127.0.0.1:4173/#/tasks')
  await page.getByRole('button', { name: /Add deadline/ }).first().click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('What is due').fill('Offline persistence proof')
  await dialog.getByLabel('Due', { exact: true }).first().fill('2026-11-20T18:00')
  await dialog.getByRole('button', { name: /^(Add|Save)/ }).first().click()
  await page.getByText('Offline persistence proof', { exact: true }).waitFor()
  await page.reload()
  await page.getByText('Offline persistence proof', { exact: true }).waitFor()
  assert.equal(await context.pages().length, 1)
  console.log('PASS production service worker loads the app offline; a new deadline persists through an offline reload')
  await context.close()
} finally { await browser.close() }
