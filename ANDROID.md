# Install Semester Desk

## Android APK

After a successful **Android APK** workflow, the newest debug APK is available from [GitHub Releases](https://github.com/playxgaming/semester-desk-app/releases/latest) or the [direct APK download](https://github.com/playxgaming/semester-desk-app/releases/latest/download/semester-desk.apk). A download link becomes usable only after the first successful build publishes its release.

1. Download `semester-desk.apk` on an Android phone and open it.
2. Allow installation from the browser or file manager when Android prompts.
3. Open Semester Desk. Core planning, attendance, notes, and data storage work offline.

This APK is a **debug-signed hackathon demo** for sideloading. It is not a signed Play Store release. AI Tutor and Scanner require internet access and a separately configured AI backend; the API key is kept on that server. Public-holiday import also uses the internet.

Before replacing an existing installation, export a JSON backup in Settings. GitHub runners can generate different debug signing keys. If Android refuses an update, export your data, uninstall the older app, install the new APK, and restore the backup. Uninstalling or clearing app storage deletes local data.

## Install the website

Open the [hosted app](https://playxgaming.github.io/semester-desk-app/) in Chrome or Edge and choose **Install app** from the browser menu when available. On iPhone, use Safari → Share → Add to Home Screen. Load the app online once before using it offline.

Web reminders are limited to when the app is open. The Android wrapper schedules native reminders after you grant notification permission.

## Build through GitHub

The **Android APK** workflow runs on code pushes to `main`. You can also choose **Actions → Android APK → Run workflow** and select `main`.

It installs dependencies with Node.js 22, checks planner calculations, builds the frontend, syncs Capacitor, and assembles the Android project with JDK 17. On success it uploads a run artifact and publishes a GitHub Release containing `semester-desk.apk`. Each release has its own tag, and the newest release is marked latest. Failed builds do not publish an APK.

The repository variable `VITE_AI_API_URL` optionally supplies the HTTPS backend origin to both Android and website builds. Set it before running the workflows, then rebuild both after changing it. See [DEPLOYMENT.md](DEPLOYMENT.md) for backend configuration. No Gemini key belongs in a `VITE_` variable or in an APK.

## Build locally

Use Node.js 22.9 or newer, JDK 17, and the Android SDK from [Android Studio](https://developer.android.com/studio). The checked-in Gradle 8.2.1 wrapper does not run on JDK 21; keep `JAVA_HOME` pointed at JDK 17 for this project.

```bash
npm ci
npm run android:apk
```

On Windows PowerShell, invoke the Gradle batch wrapper explicitly:

```powershell
npm.cmd ci
npm.cmd run android:sync
Push-Location android
.\gradlew.bat assembleDebug --no-daemon
Pop-Location
```

The APK is written to `android/app/build/outputs/apk/debug/app-debug.apk`. `npm run android:open` opens the native project in Android Studio. Run `npm run android:sync` after web changes to copy the new build into Android.

## Reminders and backups

Android reminders use the device's alarm scheduler. The app schedules up to 60 reminders and refreshes them when opened or after writing a plan. Open the app regularly to refill the schedule. Grant notification permission; exact-alarm permission improves timing on supported Android versions.

Data is stored in the app's IndexedDB database. Export it through **Settings → Export JSON** before reinstalling, clearing app storage, or changing devices. Website and Android storage are separate; transfer data using export and import.

## Production signing

For a production Android release, create a private signing keystore, keep it outside Git, and configure release signing through protected CI secrets. Update the workflow to assemble the signed release build and maintain its version code for updates. The current workflow deliberately builds only the debug demo.

iOS native builds require a Mac and Apple's signing setup; this repository currently provides the installable website and Android project.
