/**
 * A short buzz on the actions that commit something.
 *
 * On a phone this is most of what "feels native" actually is: the tap that
 * logs attendance or grades a card should be confirmed by the device, not
 * only by a toast the thumb is covering. Silent no-op everywhere else.
 */

function native(): boolean {
  const c = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
  return Boolean(c?.isNativePlatform?.())
}

type Weight = 'light' | 'medium' | 'heavy'

async function impact(weight: Weight) {
  if (native()) {
    try {
      const { Haptics, ImpactStyle } = await import('@capacitor/haptics')
      await Haptics.impact({
        style:
          weight === 'heavy'
            ? ImpactStyle.Heavy
            : weight === 'medium'
              ? ImpactStyle.Medium
              : ImpactStyle.Light,
      })
      return
    } catch {
      /* fall through to the web API */
    }
  }
  try {
    navigator.vibrate?.(weight === 'heavy' ? 24 : weight === 'medium' ? 14 : 8)
  } catch {
    /* a device with no vibrator is not an error */
  }
}

/** A committed tap: attendance logged, card graded, expense added. */
export const tap = () => impact('light')

/** Something finished: a pomodoro ended, a plan was written. */
export const thud = () => impact('medium')

/** Something went wrong, or a destructive action landed. */
export async function buzz() {
  if (native()) {
    try {
      const { Haptics, NotificationType } = await import('@capacitor/haptics')
      await Haptics.notification({ type: NotificationType.Warning })
      return
    } catch {
      /* fall through */
    }
  }
  try {
    navigator.vibrate?.([12, 40, 12])
  } catch {
    /* ignore */
  }
}
