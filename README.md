# Semester Desk

[Open the app](https://playxgaming.github.io/semester-desk-app/) · [Install / download](https://playxgaming.github.io/semester-desk-app/#/install) · [Android releases](https://github.com/playxgaming/semester-desk-app/releases/latest)

[Enable AI Tutor and Scanner](AI_SETUP.md): one Gemini key on the backend, plus its public HTTPS address in Settings. Tutor supports saved conversations, follow-up questions, hints, and practice mode.

An offline-first PWA for the whole semester — courses, timetable, attendance, deadlines, grades, a syllabus tracker, spaced repetition and a study planner that refuses to write a day you cannot execute.

**The academic core works without a backend.** Courses, attendance, planning, notes, revision, and deterministic coaching run on your device. The optional AI Tutor and Smart Scanner use the Node server in `server/` and require your own server-side Gemini API key and internet access. See [AI_SETUP.md](AI_SETUP.md) to set up the AI server.

All seven phases of the v2 plan are built, two of them rebuilt to need no server: the AI layer became a deterministic coach, and push notifications became on-device alarms. There is an Android app, and it is a real APK rather than a bookmark.

---

## Run it

```bash
npm install
npm run dev
```

For the **Android app**, see [ANDROID.md](ANDROID.md) — push to GitHub and a workflow builds the APK for you, so you never install Android Studio.

Open the URL Vite prints. This starts the offline core without an account or API key. Data is stored in IndexedDB on your device. To enable Tutor and Scanner, configure and start the optional server using [AI_SETUP.md](AI_SETUP.md).

A worked demo semester is written on first launch so no screen is ever empty: five courses, a timetable, four weeks of attendance, graded assessments, topics, deadlines, a deck of cards, seven applications across the pipeline, a resume record, and two months of expenses with budgets and habits. **Settings → Reset and start empty** clears it when you want to enter your own.

Other scripts:

```bash
npm run build      # typecheck + production build into dist/
npm run preview    # serve the built app
npm run check      # arithmetic checks for every calculator (136 assertions)
npm run typecheck  # tsc --noEmit

# with the app served by `npm run preview`, and playwright installed:
npm run audit:mobile  # every route at 360px and 390px: overflow, target sizes, reachability
npm run audit:flows   # eleven real journeys on a Pixel-sized viewport
```

Playwright is included as a development dependency. Download Chromium with `npx playwright install chromium` before running browser audits. `node scripts/ai-flow-test.mjs` covers mocked Tutor and Scanner journeys; `node scripts/offline-test.mjs` verifies offline creation and persistence.

---

## What is in it

### Academic core

- **Courses** — code, credits, instructor, colour, target mark, per-course attendance threshold.
- **Timetable** — weekly grid of lectures, labs and tutorials with rooms; holidays and one-off cancellations are exceptions, so the recurrence stays intact.
- **Attendance** — one tap from today's classes, plus the two numbers that matter:
  - *how many more you can miss*: the largest `k` where `attended ÷ (held + k) ≥ threshold`
  - *how many in a row you must now attend*: the smallest `m` where `(attended + m) ÷ (held + m) ≥ threshold`
  - cancelled classes are not held, so they move neither number.
- **Deadlines** — type, weight toward the final grade, effort estimate, subtasks. Sorted by **impact × urgency**, not by date, so a 40% report on Friday outranks a 2% quiz tomorrow.
- **Grades** — weighted assessment breakdown, live mark, ceiling, and the **what-do-I-need** calculator:

  ```
  required = (target − earned) ÷ remaining_weight × 100
  ```

  It reports *locked-in*, *reachable* or *impossible* rather than printing a number above 100.
- **GPA** — credit-weighted SGPA on a 10-point scale by default; 4.0 and straight-percentage schemes ship too, and every grade band is editable in Settings.
- **Syllabus tracker** — topics per course with a confidence rating you set (0 untouched → 3 could teach it) and a coverage bar that is honest rather than flattering.

### Study engine

- **Load-aware planner** — starts from a daily capacity you set, drops to 60% on days with more than five hours of class, deals work out round-robin in 45-minute blocks capped at 90 minutes per topic per day, and never schedules anything past its deadline. If the work does not fit it says so, with the hours that have nowhere to go: `comfortable / tight / overloaded`. This is the fix for the v1 scheduler that wrote days nobody could execute.
- **Catch-up** — missed blocks move forward into the first days that still have room, oldest first, still inside the cap. Whatever does not fit is reported, not dropped silently.
- **Spaced repetition** — SM-2 intervals with Anki's gentler ease deltas (a single lapse costs 0.20, not 0.80), four-button grading, lapse tracking, cloze deletion (`{{c1::…}}` → one card per marker), and real KaTeX. **Bury** pushes a card to tomorrow without touching its ease; **suspend** takes a wrong or off-syllabus card out of rotation until you bring it back. Space reveals, 1–4 grade, `-` buries, `!` suspends, Esc exits.
- **Review analytics** — retention, a 30-day activity chart and heatmap, and a ranked list of the cards you keep failing.
- **Focus timer** — pomodoro that logs to a course, counts interruptions, and credits its minutes back to the day's planned block.
- **Notes** — markdown with LaTeX, tables and code, attached to a course and topic, full-text search. Math is lifted out of the string before anything else parses it, so `$a_1$` stays a subscript instead of turning into italics.
- **Note history** — the one place a careless paste can destroy an hour's work, so every save more than five minutes after the last one keeps the previous body. **History** lists them, shows each rendered, and restores one — keeping what it replaced, so restoring is itself undoable.
- **Files** — past papers, slide decks, problem sheets attached to a course or a deadline. The bytes live in the app's own storage, so a PDF saved in September still opens in December whether or not the portal it came from still exists.

### Coach — the AI layer, without a model

The original plan had a language model write the retrospective, critique the plan and generate quizzes. Almost none of that needed one:

- **Weekly review** — findings computed from your own rows: which course is under its attendance threshold and by how many classes, which target has become arithmetically unreachable, whether you did the study you planned, whether retention has slipped. Every finding carries what to do about it. Nothing is generated, so nothing can be invented.
- **Plan critique** — "are the next three weeks survivable?", and when they are not, the cheapest things to drop, ranked by marks at stake per hour freed.
- **Quiz mode** — questions drawn toward the cards you keep failing, with distractors taken from the backs of other cards in the same course. A real wrong answer is more plausible than an invented one and costs nothing to produce.
- **Notes → cards** — a heuristic extractor that finds the shapes people actually write definitions in (a bolded term and a dash, a two-column table, a labelled formula) and proposes candidates. You accept or reject each one, which is why a heuristic is good enough: you were going to read every card anyway.

### Reminders — phase 4, with no push service

- **Morning brief**, deadline escalation, attendance nudges and the Sunday review are computed on the device and handed to Android's alarm clock. They fire with the app closed, offline, with nothing behind them.
- **Weighted escalation** — 7 days, 3 days, 1 day, overdue, and a 2% quiz never gets the week-out warning.
- **Quiet hours** are enforced before anything is scheduled, and every type is a toggle. Defaults are deliberately conservative: attendance nudges start off, because six notifications a day gets an app muted inside a week.
- In a browser these only fire while the tab is open — no page can schedule anything for when it is closed. That limitation is the reason the Android build exists.

### Career

- **Pipeline board** — sourced → applied → test → interview → offer or reject, the same board for internships, scholarships, universities and competitions. Moving a card logs an event, so the history writes itself.
- **One queue, not two.** Application deadlines merge into the main deadline list and are scored the same way. Remaining effort is derived from where the application actually stands: an untouched one is ~6h of work; one where the SOP is sent and the recommendation has landed is 45 minutes.
- **Documents per application** — which CV version you sent, whether the SOP is drafted or sent, whether the recommendation has arrived.
- **Contacts and follow-ups** — who you spoke to, when, and when to nudge. "Touched" stamps today and schedules the next nudge in two weeks.
- **Gone quiet** — anything past *sourced* with nothing logged for three weeks is named on the page. A follow-up costs one email.
- **Resume builder** — one structured record of experience, projects, education and awards; each version is a selection from it plus a target role. Exports to **print/PDF**, **Markdown**, and a **real .docx**.

### Money and daily life

- **Two-tap expenses** — amount and category, in INR, with UPI / cash / card.
- **Budgets with an honest burn-down** — the page compares the share of the budget spent against the share of the month elapsed, so it can say *"68% spent, day 12 of 30 — ₹71 a day left if the rest of the month is to hold"* instead of a bar that only turns red once it is too late.
- **Recurring** — mess fees, rent, subscriptions. Marking one paid logs the expense and rolls the date forward.
- **Insights** — spend by category against last month, and the categories that quietly grew (up more than 25%, and big enough to matter).
- **Habits** — daily targets with streaks and a 30-day strip. Today being unlogged does not break a streak; the day is not over.

### Everywhere

- Works fully offline; installable as an Android app or to the home screen; the service worker precaches the shell in browsers.
- **First-run onboarding** replaces the demo semester with your real courses, grading scheme and capacity.
- **Command palette** on `Ctrl/Cmd + K` — jump anywhere, rebuild the plan, reschedule reminders, export a backup.
- Light and dark, both from the same token layer as the original artifact.
- Keyboard: `Ctrl/Cmd+S` saves a note, `Ctrl/Cmd+E` toggles the editor, review is entirely keyboard-driven.
- One-click JSON and CSV export of every table, any time, no account needed to read it back.
- **Undo on destructive taps.** Deleting a card, a habit, an expense, a file, a note — or ticking a deadline done, which makes it leave the list — puts an **Undo** on the toast for six seconds. Deletes are soft, so Undo restores the same row rather than re-creating a lookalike.

### Built for a thumb

The phone layout is not the desktop one at a smaller size:

- **Four tabs and a More sheet** — every one of the fifteen routes is reachable from the phone alone. A five-slot bar with no overflow would strand ten of them.
- **Modals are bottom sheets** below `sm`, with the actions pinned outside the scroll area, so *Continue* is never below the fold on an 800px screen.
- **Thumb-friendly controls.** Main controls target 44px on phones. `mobile-audit.mjs` walks every route at 360px and 390px and checks overflow, navigation reachability, and effective hit areas. Its small-control failure threshold is 32px high or 24px wide; it is not a complete 44px accessibility certification.
- **16px inputs**, because Android zooms into anything smaller, with `inputMode`, `enterKeyHint` and `autoCapitalize` set per field: a decimal pad for money and credits, a search key for search, `CS301` typed in caps without autocorrect fighting you.
- **Attendance in words on a phone** — *Here / Missed / Off* on 44px buttons rather than three unlabelled icons.
- Safe-area insets top and bottom, haptics on every logging tap, status-bar theming, and the Android back button closing a sheet before it leaves the screen.

---

## How it is put together

```
React 18 + TypeScript + Vite     app shell
Capacitor                        the Android wrapper and its alarm clock
React Router (hash routing)      lazy-loaded routes
Tailwind + CSS custom properties one token layer, light and dark
Dexie (IndexedDB)                the source of truth — every read and write
Zustand                          UI state only
Supabase                         optional: Postgres + RLS + auth
vite-plugin-pwa (Workbox)        installable, offline shell
KaTeX / Recharts                 maths and charts, lazy-loaded per route
```

Two decisions shape everything else.

**The core is self-contained.** The data layer, scheduler, and deterministic coach run on-device. Optional network features include holiday import, Gemini-powered Tutor and Scanner, and Supabase sync. Scanner uploads the selected image only when you press Scan; you review and edit extracted records before importing them locally. Tutor sends the entered problem and subject to the configured AI server. Sync code is dormant unless its environment variables are set.

**Writes never wait for the network.** Every mutation goes through `src/db/mutate.ts`, which writes to IndexedDB, stamps `updated_at`, and queues the change in an outbox. The UI updates synchronously. Deletes are soft (`deleted_at`) so a delete on your phone propagates instead of being resurrected by your laptop — and so an **Undo** can clear the tombstone and give you back the identical row. Sync pushes the outbox, then pulls `updated_at > cursor` per table. Conflicts are last-write-wins — except notes, where a differing body is kept in `note_versions` rather than overwriting a paragraph you typed on the bus. Attached files are the one exception to soft deletion having no cost: the metadata row is tombstoned immediately but the bytes are kept for a day, so Undo is real, and `purgeOrphanBlobs()` collects them at the next launch after that.

**Nothing analytical is generated.** Every number the coach shows you traces to a row you entered. That rules out a whole class of failure — a model confidently telling you your attendance is fine when it is not — for a tool you are going to make real decisions on.

```
src/
  db/        Dexie schema (29 tables), write helpers, demo seed
  lib/       the pure logic — grades, attendance, srs, planner, pipeline,
             money, resume, zip, markdown, palette, insights, quiz,
             extract, notify, scheduler, holidays, undoable
  sync/      Supabase client (dynamically imported) and the sync engine
  hooks/     live queries; every read filters tombstones
  routes/    one file per screen
  components/ui.tsx, charts.tsx, Markdown.tsx, Layout.tsx
android/                     the Capacitor project — icons, manifest, gradle
.github/workflows/android.yml builds the APK on push, no local toolchain
supabase/                    optional and dormant: schema, RLS, migrations
scripts/check.ts             arithmetic checks
```

### The .docx export

`src/lib/zip.ts` is a ~120-line store-only ZIP writer, and `src/lib/resume.ts` writes the OOXML parts on top of it — an .docx is a zip of XML, so the export is a genuine Word package with real bullet numbering, not an HTML file wearing a `.docx` extension. That is worth the 120 lines: the alternative was a ~100 KB zip library inside a bundle with a 150 KB budget. `npm run check` asserts the zip headers and the CRC32 against its known check value, and the build was verified by opening the generated file with `python-docx`.

### Bundle

First load is **~63 KB gzipped** of JavaScript (app + Dexie + router) plus 14 KB of CSS. Recharts, KaTeX and the Supabase client are separate chunks pulled only by the routes that need them — a local-only install never downloads the Supabase client at all.

---

## Turning on sync (entirely optional, and probably unnecessary)

The app is complete without this, and the Android build makes it largely moot. If you ever want the same data on a phone *and* a laptop:

1. Create a free project at [supabase.com](https://supabase.com).
2. Run the SQL migrations in order: `0001_init.sql`, `0002_phase5.sql`, and `0003_tutor_sequence.sql`. Row-level security is enabled on every table in the same migration that creates it.
3. `cp .env.example .env` and paste in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
4. Restart `npm run dev`, then **Settings → Sync** and sign in with a magic link.

The anon key is safe in the browser; RLS is what protects your rows. The Anthropic key is **not** safe there and never goes in `.env` — it belongs in Supabase secrets, used only by the Edge Function.

## Deploying

```bash
npm run build      # → dist/
```

`dist/` is a static site. Routing is hash-based, so no server rewrite rules are needed. For Tutor and Scanner, deploy `server/` separately and set `VITE_AI_API_URL` before building the frontend; details are in [AI_SETUP.md](AI_SETUP.md). Browser reminders run while the tab is open; Android uses native scheduled notifications.

---

## Colour

Course colours are a validated categorical palette (`src/lib/palette.ts`): OKLCH lightness band, chroma floor, adjacent-pair separation under protan/deutan/tritan simulation, and contrast against the chart surface. Dark mode has its own steps rather than a flipped copy. A colour never carries meaning alone — every dot sits beside a course code and every chart mark is direct-labelled.

## What is next

| Phase | Status |
| --- | --- |
| 0 Foundations | done |
| 1 Academic core | done |
| 2 Study engine | done |
| 3 AI layer | rebuilt as a deterministic coach — no model, no key |
| 4 Notifications | rebuilt as on-device alarms — no push service |
| 5 Career and money | done |
| 6 Hardening | onboarding, command palette, print styles, note history, undo everywhere |
| Phone UI | audited at 360/390px: no overflow, no target under 44px, every route reachable |
| Android | Capacitor project + CI that builds the APK |
