import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import 'katex/dist/katex.min.css'
import { ensureProfile } from '@/db/mutate'
import { startSync } from '@/sync/engine'
import { seedIfEmpty } from '@/db/seed'
import { overnightRebalance } from '@/lib/scheduler'
import { initAndroid } from '@/lib/android'
import { repairAttendance } from '@/db/attendance'
import { purgeOrphanBlobs } from '@/db/files'

async function boot() {
  await ensureProfile()
  await seedIfEmpty()
  await repairAttendance()
  void purgeOrphanBlobs()
  startSync()
  void initAndroid()

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )

  // The service worker only earns its place in a browser: inside the Android
  // app the assets are already on disk, and a worker under the capacitor://
  // scheme buys nothing but a class of bug.
  const native = Boolean(
    (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.(),
  )
  if (!native && 'serviceWorker' in navigator && import.meta.env.PROD) {
    void navigator.serviceWorker.register('sw.js', { scope: './' }).catch(() => {
      /* offline still works from IndexedDB; the worker is a bonus */
    })
  }

  // after paint: pull yesterday's unfinished work forward, then refresh the
  // device's reminder schedule so the morning brief is already correct
  void (async () => {
    try {
      await overnightRebalance()
      const { reschedule } = await import('@/lib/scheduler')
      await reschedule()
    } catch {
      /* reminders are best-effort; never block the app on them */
    }
  })()
}

void boot()
