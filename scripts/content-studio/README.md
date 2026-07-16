# Content Post Studio (local)

A local UI + loopback server for generating complete social quiz-content
packages without CLI commands. It drives the **same** generation service as
`npm run quiz:screenshots` (`scripts/quiz-screenshots/generate.ts`) — one
screenshot engine, one set of QA/parity gates.

## Start it

Terminal 1 — backend (question source + rank/item assets):

```powershell
cd C:\Users\bobbu\OneDrive\Desktop\League_Combat_Simulator
$env:KNOWLEDGE_ADMIN_KEY="local-quiz-screenshot-key"
python -m uvicorn api_server:app --host 127.0.0.1 --port 8000
```

Terminal 2 — studio (from this repo):

```powershell
$env:KNOWLEDGE_ADMIN_KEY="local-quiz-screenshot-key"   # same key as the backend
$env:VITE_COMBAT_API_URL="http://127.0.0.1:8000"       # or set in .env
npm run content-studio
```

Then open **http://127.0.0.1:5199/dev/content-studio**.

`npm run content-studio` starts two things: the studio API on
`http://127.0.0.1:8790` (loopback only) and one Vite dev server on port 5199
that serves both the studio UI and the screenshot render harness. Optional
env: `CONTENT_STUDIO_PORT` (API port), `CONTENT_STUDIO_BASE_URL` (reuse an
already-running Vite instead of starting one).

## What it does

- **Question search/selection** — by exact ID, prompt text, or category
  (active questions via the admin review API, proxied server-side). Results
  show prompt, choices, correct answer, category, difficulty metadata, and
  social-render compatibility. Select many, reorder (challenge order = list
  order), set per-question difficulty, mark a ★ featured question.
- **Post modes** — `classic`, `single-question`, `answer-reveal`,
  `multi-question` (challenge), `daily-package`.
- **Difficulty** — run default + per-question overrides. Precedence:
  per-question override → run default → question `metadata.content_difficulty`
  → none. Never random; generation metadata only (canonical questions are
  never mutated).
- **Generate** — one job at a time, with live progress log, then an in-page
  slide preview (ordered, labeled), contact sheet link, per-image download,
  and a run ZIP.
- **Previous runs** — browses `quiz_content_exports/runs/`, manifest-aware
  with graceful fallback for older runs.

## Multi-question challenge

Slide sequence for N questions (2–10; default 5):

1. `opening` — "TEST YOUR LEAGUE KNOWLEDGE / How many can you get right? /
   Keep score. No searching. / Swipe to begin →"
2. N question slides — real quiz composition with **QUESTION i OF n** +
   **LOCK IN YOUR ANSWER** (no comment CTA), rank emblem lane preserved.
   Optional approved copy: repeated-opener lines on Q1 ("Already answered this
   one? …") and one mid-challenge CTA line at the midpoint (off by default).
3. `answers` — purpose-built blueprint ("TODAY'S ANSWERS"): fixed-height rows
   of number · question icon · correct letter · answer icon · answer label.
   More than 6 questions paginate onto `answers-1`, `answers-2`, …
4. `ending` — "HOW DID YOU DO? / Comment your score below. / Challenge other
   players at mogzy.lol" + hero art + socials + QR.

## Daily package

One job → three coordinated runs sharing a prefix:

- `<prefix>-post-1-single-question` (featured question)
- `<prefix>-post-2-answer-reveal` (featured question)
- `<prefix>-post-3-multi-question` (challenge; ★ featured optionally reused
  as Q1 with a repeat-copy variant)

plus `runs/<prefix>-package.json` listing the child runs.

## Output & manifest

Everything lands under `quiz_content_exports/runs/<run-id>/` (gitignored).
Every new run writes `manifest.json` (schema v1): mode, package membership,
ordered question ids + previews, per-slide semantic type/file/dimensions/
difficulty, copy-variant names, counts, generator version/commit, completion
flag. Older runs without manifests still list/browse (summary.json or
directory-scan fallback). Manifests never contain secrets.

## API (loopback only)

`GET  /api/dev/content-studio/health`
`GET  /api/dev/content-studio/questions?search=&category=&pack=&limit=` · `?id=`
`GET  /api/dev/content-studio/questions/:id`
`POST /api/dev/content-studio/jobs` → `GET /jobs/:id`
`GET  /api/dev/content-studio/runs` · `/runs/:runId` · `/runs/:runId/zip`
`GET  /api/dev/content-studio/runs/:runId/files/<png|html|json>`

Security: binds 127.0.0.1; CORS restricted to loopback origins; every enum/
id/run-id validated (`studio-request.ts`); file serving rooted + segment-
validated (`runs.ts`) — no arbitrary path access; admin key stays in the
server process (never sent to the browser, never logged, never in manifests);
generation runs in-process (no shell, no subprocess arguments).

## Troubleshooting

- **"server offline" badge** — start `npm run content-studio`; check port
  8790 isn't taken (`CONTENT_STUDIO_PORT` to change).
- **"backend not configured"** — set `KNOWLEDGE_ADMIN_KEY` (or `ADMIN_KEY`)
  and `VITE_COMBAT_API_URL` in the studio server's environment.
- **Question search 500** — backend not running at the configured URL, or
  wrong admin key.
- **missing-asset failures** — the backend serving `assets/` (items + rank
  emblems) isn't running on the URL in `.env`.
- **Vite port conflict (5199)** — stop the other instance or pass
  `CONTENT_STUDIO_BASE_URL=http://127.0.0.1:<port>` to reuse it.
- **"Run directory already exists"** — pick a new run ID or tick Overwrite.
- **Stale/incomplete runs** — they still list; `manifest.completed=false` or
  a missing manifest marks them. `npm run quiz:screenshots -- --finalize-run
  <id>` rebuilds reports for classic/post runs.

## Future: secure on-the-go use

This tool is deliberately local-only. The prepared path to remote use:
authenticated admin page (existing account-bound admin auth) → backend job
queue (POST creates a queued job row) → a generation worker (Railway service
or self-hosted runner with Playwright/Chromium) consuming the queue via the
same `runGeneration` service → PNGs uploaded to object storage (R2/S3) →
signed download URLs in the job record. Secrets stay in worker env; rate-limit
job creation; the studio UI already talks to a small JSON API, so it ports
directly. Do NOT expose this local server beyond loopback.
