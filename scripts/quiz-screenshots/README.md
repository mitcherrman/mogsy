# Quiz Screenshot Content Factory

Deterministic, local-first screenshot production and visual QA for Mogsy's
existing League quiz questions. Renders real quiz questions through the REAL
production quiz UI (`QuizAnswerOptions` / `QuizAnswerFeedback`, extracted from
`Quiz.tsx`) into reusable PNGs across controlled quiz states and multiple
aspect ratios — for future TikTok/Shorts/Reels/X/Reddit content and for
mobile/desktop layout audits.

**This tool never publishes, never mutates quiz records, and never writes to
the backend.** All output lands under a gitignored local export root.

## Architecture

- **Render harness route** — `/dev/quiz-render?q=<id>&state=<state>&format=<format>[&answerIndex=<n>]`
  ([src/pages/dev/quiz-render/QuizRenderPage.tsx](../../src/pages/dev/quiz-render/QuizRenderPage.tsx)).
  Mounted outside the site Layout (no chrome in captures), unlinked, absent
  from the sitemap. It reads question data ONLY from
  `window.__MOGSY_QUIZ_RENDER__`, injected locally by the runner via
  Playwright `addInitScript`. With no injected data it shows repo fixtures in
  dev mode and an inert notice in production — the route holds no data, no
  credentials, and no mutations, so it is safe even if reached directly.
- **Pure logic** — `src/lib/quiz-screenshot/` (state/format registries,
  deterministic answer rules, path/metadata/contact-sheet builders, CLI
  parsing, fixtures). Fully unit-tested.
- **Runner** — `scripts/quiz-screenshots/` (this directory): question
  acquisition, dev-server management, Playwright capture + DOM QA, reports.

## Prerequisites

```powershell
npm install                      # includes the playwright dev dependency
npx playwright install chromium  # one-time browser download
```

For remote question sources (`--question-id(s)`, `--pack`, `--approved`) the
backend must be reachable and you need the admin review key:

- API base: `--api <url>`, else `VITE_COMBAT_API_URL` env, else the repo `.env`.
- Admin key: `--admin-key <key>`, else `ADMIN_KEY` / `KNOWLEDGE_ADMIN_KEY` env.

The runner performs **read-only GETs** against
`/api/quiz/admin/review/questions` (the only quiz read that includes correct
answers + explanations — the public API deliberately hides them). The admin
key never reaches the browser context or any output file.

`--fixture` mode is fully offline and needs neither.

## Usage

> PowerShell note: quote comma-separated values (`--states "question,correct"`),
> and prefer `npx tsx scripts/quiz-screenshots/index.ts …` if your npm version
> swallows `--` flags.

```powershell
# One question by id
npm run quiz:screenshots -- --question-id 123

# Multiple explicit ids
npm run quiz:screenshots -- --question-ids "123,456,789"

# One quiz pack (bounded)
npm run quiz:screenshots -- --pack combat-cooldowns-v1 --limit 10

# Bounded batch of active questions
npm run quiz:screenshots -- --approved --limit 20

# Offline fixture (no backend needed)
npm run quiz:screenshots -- --fixture scripts/quiz-screenshots/fixture-sample.json

# Selected states / formats
npm run quiz:screenshots -- --question-id 123 --states "question,correct" --formats "vertical,mobile-audit"

# Named, repeatable run (refuses to overwrite unless --overwrite)
npm run quiz:screenshots -- --question-id 123 --run-id review-1 --overwrite
```

The runner starts its own Vite dev server on port 5199 (bypassing the
network-touching `predev` sitemap hook), or reuses `--base-url` — which must
be localhost unless you deliberately pass `--allow-remote`. It never defaults
to a production host.

## States

| State | Meaning | Deterministic rule |
|---|---|---|
| `question` | Unanswered | Nothing selected, no reveal, no explanation, no leakage |
| `selected` | Picked, not judged | First choice (index 0) unless `--answer-index` |
| `correct` | Correct reveal | The actual correct answer, reveal styling |
| `incorrect` | Wrong reveal | First non-correct choice (override must not equal the correct index); correct answer also revealed, matching live behavior |
| `explanation` | Post-answer + explanation | Correct reveal + explanation text; questions without an explanation are **skipped with a recorded reason**, never fabricated |

Answer order is never reshuffled — backend order is preserved exactly.

## Formats

Social composition (safe-area shell around the real components):
`vertical` 1080×1920 · `portrait` 1080×1350 · `square` 1080×1080 ·
`landscape` 1200×675 · `broadcast` 1920×1080

Responsive audit (real page flow at a device viewport):
`mobile-audit` 390×844 · `desktop-audit` 1440×900

Deliberate difference: social formats capture the composition stage exactly at
platform pixel size; audit formats capture the viewport of the harness page as
a normal responsive page. Audit captures do not include the site navigation
because the harness mounts outside Layout (known limitation).

## Output

```
quiz_content_exports/
  runs/<run-id or timestamp>/
    question_000123/
      vertical_question.png
      vertical_correct.png
      mobile-audit_question.png
      metadata.json          # per-question: captures, QA findings, no secrets
    index.html               # static contact sheet — open directly from disk
    summary.json             # run config + counts + timestamps
    failures.json            # structured failures (empty array on success)
```

- `quiz_content_exports/` is gitignored; never under `public/` or `src/`.
- An existing run directory is refused unless `--overwrite` is passed.
- `--out` must be a plain relative path (traversal, absolute paths, `public/`,
  and `src/` are rejected); cleaning only ever touches the run directory
  inside the export root.

## QA checks (per capture)

Collected into metadata/failures: console errors, uncaught page errors,
failed/4xx/5xx requests, broken images (`naturalWidth === 0` → failure),
horizontal document scroll on audit formats (failure), answer buttons outside
the capture stage (failure), conservative text-clipping via
`scrollWidth/Height` (warning), missing reveal styling in reveal states
(failure), any visible selection/reveal/feedback in the `question` state
(**leakage failure**), render-ready timeout (failure). The process exits
non-zero if any failure was recorded, but continues past per-question errors
and reports everything at the end.

## Determinism

- framer-motion is globally skipped while the harness is mounted
  (`MotionGlobalConfig.skipAnimations` — same mechanism as the Remotion video
  pipeline); browser runs with `reducedMotion: reduce`, locale `en-US`,
  timezone `UTC`, deviceScaleFactor 1.
- No timers/countdowns exist in the harness; ken-burns/hero animations are
  not part of the harness composition.
- Capture waits on `data-quiz-render-ready="true"`, which the page stamps only
  after `document.fonts.ready` and all images settle — no arbitrary sleeps.

## Visual-regression seam (future)

Filenames, format descriptors, and readiness behavior are stable, and fixture
serialization is deterministic, so a future baseline/diff layer can compare
`runs/<id>` against an approved baseline directory. No baseline management is
implemented; current captures can never silently replace anything.

## Known limitations

- Only `multiple_choice` questions are supported; `fill_blank` (and other
  formats) are skipped with a reason.
- Champion-splash card theming from `Quiz.tsx` (ken-burns hero, gold-framed
  champion icon) is not reproduced in the harness composition; the harness
  renders prompt + optional plain question image + the real answer/feedback
  components.
- Question/choice images resolve against `VITE_COMBAT_API_URL`; without the
  backend running, image-bearing questions will record missing-asset failures
  (fixtures are imageless on purpose).
- The admin review endpoint has no id filter, so `--question-id(s)` pages
  through up to 1000 rows client-side; ids beyond that are reported missing.
- Pack/approved batch modes require the admin key; if unavailable, use
  `--fixture` with an exported dump (`prepare-quiz-video.ts --in`-style JSON
  works).
- Audit captures exclude site navigation (harness mounts outside Layout), so
  nav-overlap QA is not covered in this phase.
