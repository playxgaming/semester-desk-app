import { chromium } from 'playwright'
import assert from 'node:assert/strict'

const browser = await chromium.launch()
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 800 } })
  await page.goto('http://127.0.0.1:4173')
  await page.getByRole('button', { name: 'Skip', exact: true }).click()
  await page.getByRole('dialog', { name: 'Set up Semester Desk' }).waitFor({ state: 'hidden' })
  // A controlled browser event verifies capture before navigating to Install.
  // This does not claim that an OS installation happened in headless Chromium.
  await page.evaluate(() => {
    const event = new Event('beforeinstallprompt', { cancelable: true })
    event.prompt = async () => { window.__installPrompted = true }
    event.userChoice = Promise.resolve({ outcome: 'accepted' })
    window.dispatchEvent(event)
  })
  await page.getByRole('button', { name: 'More', exact: true }).click()
  await page.getByRole('dialog').getByRole('link', { name: 'Install app' }).click()
  await page.getByRole('heading', { name: 'Take your semester with you.' }).waitFor()
  await page.getByRole('button', { name: 'Install Semester Desk', exact: true }).click()
  await page.getByRole('status').filter({ hasText: 'Installation started' }).waitFor()
  assert.equal(await page.evaluate(() => window.__installPrompted), true)
  await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')))
  await page.getByRole('button', { name: 'Installed on this device' }).waitFor()
  assert.equal(await page.getByRole('link', { name: /Downloads & release notes/ }).getAttribute('href'), 'https://github.com/playxgaming/semester-desk-app/releases/latest')
  console.log('PASS install route is reachable on mobile; prompt capture, accepted state, installed state, and release link work')
} finally { await browser.close() }
