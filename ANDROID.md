# Install Semester Desk

## Android APK

After a successful **Android APK** workflow, the newest APK is available from [GitHub Releases](https://github.com/playxgaming/semester-desk-app/releases/latest) or the [direct APK download](https://github.com/playxgaming/semester-desk-app/releases/latest/download/semester-desk.apk). A download link becomes usable only after the first successful build publishes its release.

1. Download `semester-desk.apk` on an Android phone and open it.
2. Allow installation from the browser or file manager when Android prompts.
3. Open Semester Desk. Core planning, attendance, notes, and data storage work offline.

This APK is a sideload build, not a Play Store release. AI Tutor and Scanner require internet access and a separately configured AI backend; the API key is kept on that server. Public-holiday import also uses the internet.

Every build is signed with the same release key and has a higher version code, so a new APK installs over the old one and keeps your data. Builds published before stable signing used temporary keys: if Android refuses an update, export a JSON backup in Settings, uninstall the old app once, install the new APK, and restore the backup. Uninstalling or clearing app storage deletes local data.

## Install the website

Open the [hosted app](https://playxgaming.github.io/semester-desk-app/) in Chrome or Edge and choose **Install app** from the browser menu when available. On iPhone, use Safari → Share → Add to Home Screen. Load the app online once before using it offline.

Web reminders are limited to when the app is open. The Android wrapper schedules native reminders after you grant notification permission.

## Build through GitHub

The **Android APK** workflow runs on code pushes to `main`. You can also choose **Actions → Android APK → Run workflow** and select `main`.

It installs dependencies with Node.js 22, checks planner calculations, builds the frontend, syncs Capacitor, and assembles a release APK with JDK 17, signed with the key in the repository secrets (see [Release signing](#release-signing)) and with `versionCode` set to the workflow run number. The job fails if the signing secrets are missing. On success it uploads a run artifact and publishes a GitHub Release containing `semester-desk.apk`. Each release has its own tag, and the newest release is marked latest. Failed builds do not publish an APK.

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

## Release signing

Android installs an update only when it is signed with the same certificate as the installed app and its `versionCode` is higher. The workflow takes the key from four repository secrets and the version code from `github.run_number`.

Create the key once and keep the `.jks` file and its password somewhere safe outside Git (a password manager). **If the key is lost, installed apps can never be updated again without uninstalling.**

1. Create the keystore with `keytool` from JDK 17 (Android Studio ships one at `C:\Program Files\Android\Android Studio\jbr\bin\keytool.exe`). It asks for a password and your name; use one strong password:

   ```bash
   keytool -genkeypair -v -keystore semester-desk-release.jks -alias semesterdesk -keyalg RSA -keysize 2048 -validity 10000
   ```

2. Add the secrets with the GitHub CLI from the folder that holds the `.jks` file (Git Bash; each `gh secret set` without `--body` prompts for the value):

   ```bash
   base64 -w0 semester-desk-release.jks | gh secret set ANDROID_KEYSTORE_BASE64 --repo playxgaming/semester-desk-app
   gh secret set ANDROID_KEYSTORE_PASSWORD --repo playxgaming/semester-desk-app
   gh secret set ANDROID_KEY_PASSWORD --repo playxgaming/semester-desk-app
   gh secret set ANDROID_KEY_ALIAS --body semesterdesk --repo playxgaming/semester-desk-app
   ```

   Enter the keystore password for both password secrets (`keytool` uses the same password for the key). Without the CLI, use **Settings → Secrets and variables → Actions → New repository secret** and paste the output of `[Convert]::ToBase64String([IO.File]::ReadAllBytes("semester-desk-release.jks"))` (PowerShell) as `ANDROID_KEYSTORE_BASE64`.

3. Run **Actions → Android APK → Run workflow** on `main`. The **Verify the signature** step prints the certificate's SHA-256 digest; it must be the same on every later run.

Local `npm run android:apk` builds stay debug-signed and are not meant to replace a phone's installed CI build.

iOS native builds require a Mac and Apple's signing setup; this repository currently provides the installable website and Android project.
