# Semester Desk — hackathon handoff

## The pitch

Students juggle timetables, attendance rules, deadlines, and revision in disconnected apps. Semester Desk turns them into one actionable daily plan. Its core works offline; optional AI helps turn a photographed timetable into editable records and explains study problems step by step.

## Run the demo

Use Node.js 22.9 or newer. From the project root:

```powershell
npm.cmd ci
npm.cmd run dev
```

Open the URL printed by Vite. First launch creates a sample semester. Skip onboarding to keep the sample data. Use Settings to export a backup before replacing it with real data.

For the optional AI features, open a second terminal:

```powershell
cd server
npm.cmd ci
Copy-Item .env.example .env
# Edit .env and set your own GEMINI_API_KEY.
npm.cmd start
```

The local frontend proxies `/api` to port 3001. Visit `http://localhost:3001/api/health` to check `aiConfigured`. No key is needed for the planner, attendance, notes, review, or other local features. The tutor and scanner require a configured server and internet access. They never simulate successful AI responses.

## Three-minute presentation

1. **0:00–0:25: Problem.** “My semester lives in five apps. None tells me what I can realistically finish today.” Open Today with the sample semester.
2. **0:25–1:05: Capture.** Open Timetable → Scan Document. Upload a clear timetable photo. Correct a course, weekday, or time, deselect an unwanted row, then import. Show the resulting class. Have a non-sensitive image ready before presenting.
3. **1:05–1:45: Decide.** Show Attendance and its recovery/skip calculation, then Deadlines and the capacity-aware Planner. Explain that overload is reported instead of hidden.
4. **1:45–2:20: Learn.** Open AI Tutor with a short problem, then show Notes or spaced repetition. Verify the tutor's reasoning as part of the demo.
5. **2:20–3:00: Resilience.** After the app has loaded online and its service worker is active, switch the browser offline. Navigate to the planner and log an attendance entry. Reload to show persistence. Return online before demonstrating AI. Close with the optional Android build and JSON backup.

If AI quota or connectivity fails, show the clear error and continue with the working offline planner. Do not present canned output as live AI.

## Deploy

The project repository is [playxgaming/semester-desk-app](https://github.com/playxgaming/semester-desk-app). The `Deploy website` workflow publishes the static app to [GitHub Pages](https://playxgaming.github.io/semester-desk-app/) after a successful `main` build. The `Android APK` workflow publishes a downloadable debug demo to [GitHub Releases](https://github.com/playxgaming/semester-desk-app/releases/latest). Download links are usable after their corresponding first successful workflow; verify both before a presentation.

The offline app, hosting, and APK builds require no additional API. To enable public Tutor and Scanner features, deploy `server/` as an HTTPS Node web service with `npm ci` as its install command and `npm start` as its start command. Configure `GEMINI_API_KEY`, optionally `GEMINI_MODEL`, and `ALLOWED_ORIGINS=https://playxgaming.github.io,https://localhost` for the hosted website and Android wrapper. Add the public backend origin as repository variable `VITE_AI_API_URL`, then rerun both workflows. The server key must never be a `VITE_` variable. Full deployment steps are in [DEPLOYMENT.md](DEPLOYMENT.md).

Before a public deployment, revoke the API key that was previously embedded in the original server source. Use a new key in server environment settings only. The included per-process rate limit is for a small demo; a public service needs authentication and shared quota enforcement. Do not upload classmates' private documents without permission.

## Verification

```powershell
npm.cmd run build
npm.cmd run check
npm.cmd test --prefix server
# Serve the production build in another terminal:
npm.cmd run preview -- --host 127.0.0.1
# Download the browser used by the development test tooling:
npx.cmd playwright install chromium
npm.cmd run audit:flows
npm.cmd run audit:mobile
node scripts/ai-flow-test.mjs
node scripts/offline-test.mjs
```

AI route tests use an injected provider, and browser AI tests use explicitly mocked network responses. They prove wiring and failure handling, not live model quality or credentials. A live tutor answer and a live timetable scan with your own key are required before claiming the AI integration is verified end to end.

Android packaging instructions are in [ANDROID.md](ANDROID.md). The workflow uses Node.js 22 and JDK 17 with the checked-in Gradle wrapper. An APK build needs the Android toolchain or that workflow. A web build alone does not verify an APK; a successful workflow alone does not prove installation or reminder behavior on a physical device.

Compatible dependency fixes were applied. The frontend toolchain still has audit findings that require major-version migrations, including Capacitor CLI's `tar` dependency. Review `npm audit` before exposing development/build services or preparing a public release; the clean server audit does not describe the frontend toolchain.
