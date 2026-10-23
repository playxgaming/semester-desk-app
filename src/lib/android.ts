import type { Profile } from '@/db/db'

/**
 * The handful of things that make a wrapped web app behave like an Android
 * app rather than a browser in a costume: the hardware back button doing what
 * every other app does with it, a status bar that matches the theme instead of
 * sitting on top of it, and topping the reminder queue back up whenever the
 * app comes to the foreground.
 */

function native(): boolean {
  const c = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
  return Boolean(c?.isNativePlatform?.())
}

let backHandlerAttached = false

export async function initAndroid(): Promise<void> {
  if (!native()) return

  try {
    const { App } = await import('@capacitor/app')

    if (!backHandlerAttached) {
      backHandlerAttached = true
      await App.addListener('backButton', ({ canGoBack }) => {
        // an open sheet or palette is what back should close first
        const dialog = document.querySelector('[role="dialog"]')
        if (dialog) {
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
          return
        }
        const atRoot = !location.hash || location.hash === '#/' || location.hash === '#'
        if (canGoBack && !atRoot) {
          history.back()
          return
        }
        // at the root with nowhere to go back to, back means leave — which is
        // what Android users expect, and what not doing it makes infuriating
        void App.exitApp()
      })
    }

    await App.addListener('resume', () => {
      void (async () => {
        try {
          const { reschedule, overnightRebalance } = await import('./scheduler')
          await overnightRebalance()
          await reschedule()
        } catch {
          /* reminders are best-effort */
        }
      })()
    })
  } catch {
    /* the app works without any of this */
  }
}

/** Paint the status bar to match the theme rather than fighting it. */
export async function syncStatusBar(theme: Profile['theme']): Promise<void> {
  if (!native()) return
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar')
    const dark =
      theme === 'dark' ||
      (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
    await StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light })
    await StatusBar.setBackgroundColor({ color: dark ? '#0D1915' : '#F3FBF6' })
  } catch {
    /* older Android, or the plugin is unavailable */
  }
}
