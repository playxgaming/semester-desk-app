# Enable AI Tutor and Smart Scanner

The app's academic tools work locally. Live AI needs one provider key and one server; GitHub Pages serves static files and cannot hold an API secret.

## What you need to fill

| Setting | Where it goes | Required for |
| --- | --- | --- |
| `GEMINI_API_KEY` | Render server environment; never in GitHub source or browser fields | Tutor and image Scanner |
| `VITE_AI_API_URL` | GitHub repository Actions variable, or the public server address in app Settings → AI connection | Connecting the app to that server; this is a URL, not a secret |
| `ALLOWED_ORIGINS` | Server environment; the Blueprint supplies the website and Android defaults | Allowing browser / Android requests |
| `GEMINI_MODEL` | Server environment; default supplied | Optional model override |
| `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` | Frontend build variables | Optional cross-device sync only; not needed for AI or local tools |

No OpenAI, OCR, Maps, payment, or notification API key is required. The same Gemini key handles Tutor and image extraction. Browser reminders work while open; native Android reminders use the device's notification permission.

If you enable optional Supabase sync, run all three migrations in `supabase/migrations/` in order, including `0003_tutor_sequence.sql`, before signing in. This preserves conversation turn order across devices.

## 1. Create a replacement Gemini key

Open [Google AI Studio API keys](https://aistudio.google.com/apikey), sign in, and create a key for a project allowed to use the Gemini API. Follow [Google's API key guide](https://ai.google.dev/gemini-api/docs/api-key). Revoke the key that was exposed in the original version of this project. Keep the new key in your password manager until entering it in the server's environment screen. Do not send it in chat or enter it in the app.

Check your project's model availability and quota in AI Studio. Model access and usage costs depend on the account and selected model; a configured key alone does not prove access.

## 2. Deploy the included server

Use [Deploy to Render](https://render.com/deploy?repo=https://github.com/playxgaming/semester-desk-app) or create a Render Blueprint connected to `playxgaming/semester-desk-app`. The repository's `render.yaml` supplies Node 22, server commands, health check, model, and allowed origins.

1. Sign in to Render and connect the GitHub repository.
2. Review the Blueprint's proposed service and plan before creating it.
3. When prompted for `GEMINI_API_KEY`, enter your new key in Render's secret environment field.
4. Deploy, then copy the service's HTTPS address, for example `https://semester-desk-ai-xxxx.onrender.com`.
5. Open that address followed by `/api/health`. It should return `{"status":"ok","aiConfigured":true}`. This checks configuration, not model quota.

If you prefer another Node host, use root directory `server`, install command `npm ci`, start command `npm start`, and Node 22.9+. Set the variables listed above. Origins contain no path: use `https://playxgaming.github.io`, not `/semester-desk-app/`. Android uses `https://localhost`. Set `TRUST_PROXY_HOPS` to match the host's proxy chain (the Render Blueprint uses 1).

## 3. Connect the app

For an immediate test on one device, open app **Settings → AI connection**, paste the HTTPS server origin without `/api`, and press **Save & test connection**. This stores only the server address on that device, never the Gemini key.

To bundle the address for everyone:

1. Open repository **Settings → Secrets and variables → Actions → Variables**.
2. Add repository variable `VITE_AI_API_URL` with your server's HTTPS origin.
3. Run **Deploy website** and **Android APK** from GitHub Actions on `main`.
4. Reload the published website. Install the new APK to update its bundled address; back up local data first.

## 4. Verify real AI

Open Tutor, choose **Hint first**, and ask “Help me solve x² − 5x + 6 = 0 without giving the answer yet.” Verify the hint, then ask a follow-up. Try **Practice with me** and answer its first question. Finally, scan a small non-private timetable image and review the extracted records before importing.

The automated tests use injected/mocked provider responses to verify application wiring. Live model answers and image extraction cannot be certified until your key and backend are configured. A free service may take time to wake after inactivity; if a request times out, wait briefly and retry. See [Render's free-service limits](https://render.com/docs/free).

This backend has demo-scale in-memory rate limiting. For a broadly shared paid endpoint, add authentication and shared quotas. CORS is not authentication. The app sends only the current Tutor conversation and selected course label, or the image explicitly selected for scanning; it does not automatically send your notes, grades, or attendance.
