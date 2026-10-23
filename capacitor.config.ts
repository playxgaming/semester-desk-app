import type { CapacitorConfig } from '@capacitor/cli'

/**
 * The Android wrapper. Everything the app needs is bundled into the APK —
 * the academic core runs from local assets, so `server.url` stays absent.
 * Optional AI requests use the HTTPS VITE_AI_API_URL supplied at build time.
 */
const config: CapacitorConfig = {
  appId: 'app.semesterdesk',
  appName: 'Semester Desk',
  webDir: 'dist',
  android: {
    backgroundColor: '#DAFBE9',
    // the app is entirely local; nothing should ever be loaded over http
    allowMixedContent: false,
  },
  plugins: {
    LocalNotifications: {
      smallIcon: 'ic_stat_semester_desk',
      iconColor: '#2794DD',
    },
  },
}

export default config
