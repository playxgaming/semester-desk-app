# Website and Android deployment

- Repository: [playxgaming/semester-desk-app](https://github.com/playxgaming/semester-desk-app)
- Website: [Semester Desk](https://playxgaming.github.io/semester-desk-app/)
- Android: [latest release](https://github.com/playxgaming/semester-desk-app/releases/latest), with a [direct APK link](https://github.com/playxgaming/semester-desk-app/releases/latest/download/semester-desk.apk) after the first successful Android build.

## Website

GitHub Pages serves the static frontend. In repository **Settings → Pages**, set the build source to **GitHub Actions**. The `Deploy website` workflow installs with `npm ci`, runs `npm run check`, builds `dist/`, and deploys it using the `github-pages` environment on a successful `main` build. It can also be run manually from Actions.

The site works without an API key for its local planner, attendance, notes, deadlines, and backups. Users can install it through a supported browser and use it offline after its first online load. GitHub Pages cannot run the Node AI server.

## Optional AI backend

No additional API is required for the offline app, GitHub Pages hosting, or APK builds. To enable **AI Tutor and Scanner** publicly, deploy the included `server/` directory to an HTTPS Node web service and provide a replacement Gemini key there.

Use Node.js 22.9 or newer. Set the service root directory to `server`, the install command to `npm ci`, and the start command to `npm start`. The service must provide a `PORT` environment variable, or it listens on port 3001 by default.

Set these variables on that server:

```dotenv
GEMINI_API_KEY=your-replacement-key
GEMINI_MODEL=gemini-flash-latest
ALLOWED_ORIGINS=https://playxgaming.github.io,https://localhost
```

`https://playxgaming.github.io` is the website's origin; do not include `/semester-desk-app/` in the CORS allowlist. Capacitor Android uses the separate `https://localhost` origin. If using another domain, add that exact origin too. Keep the key in the hosting provider's server environment settings, and revoke the key exposed in the original project before enabling the backend.

Then open repository **Settings → Secrets and variables → Actions → Variables**, and set the repository variable **`VITE_AI_API_URL`** to the backend's HTTPS origin, such as `https://your-backend.example`. This public URL is embedded into website and Android builds. **Never put an API key in a `VITE_` variable.**

Run both **Deploy website** and **Android APK** again on `main` so both builds receive the URL. Changing a repository variable does not update existing builds automatically.

Verify the deployed service's `/api/health` returns `aiConfigured: true`, then test a real Tutor question and timetable image from the website and Android app. A healthy endpoint alone does not prove model access or quota. Current automated AI tests use an injected provider or mocked network responses.

The included in-memory rate limit supports a small demo. For unrestricted public AI use, add authentication and shared quota enforcement before sharing a paid API endpoint broadly; CORS does not provide authentication.

## Android downloads

The **Android APK** workflow publishes a debug-signed demo only after a successful `main` build. The APK is bundled with the frontend; it uses the optional backend solely for AI. Download and installation details, backup advice, and local build commands are in [ANDROID.md](ANDROID.md).

A GitHub Release artifact proves the APK was assembled. Verify installation, launch, and reminders on a physical phone before claiming device testing or Play Store readiness.
