# Quiz Screenshot Content Factory

**Content-first:** the default run produces post-ready social images — states
`question,correct` in the `mobile-social` format (1080×1350 portrait, suited
to X / Instagram / Facebook / Reddit; use `vertical` for TikTok/Shorts 9:16).
QA/audit formats remain available but are opt-in.

```powershell
# Default content run — question + correct reveal, mobile-social:
npm run quiz:screenshots -- --question-id 123
```

Content formats include: a fit-to-frame mobile card (measured and zoomed at
readiness time so nothing clips or collides), **item-build recipe visuals**
covering the whole build-question family (see table below), and a **CTA
footer** with the Mogsy
wordmark, "Play more LoL quizzes at mogsy.app", and a deterministic QR code
encoding `https://mogsy.app/quiz` (compact strip on `question`, full QR block
on reveals; never in the answer area). The spoiler fields of recipe metadata
are only read after reveal — the unanswered state cannot leak the answer.

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

## Content posts (carousels)

`--post <type>` expands each question into an ordered carousel of slides
(one PNG per slide, named `<format>_slide-NN_<slug>.png`). It replaces
`--states` (they are mutually exclusive). Every slide uses the same premium
phone composition; only the card contents change.

| Post type | Slides |
|---|---|
| `single-question` | `slide-01` question (engagement) → `slide-02` app-CTA (“Think you know League? Prove it.” → “Challenge others to test your knowledge at” → dominant “mogsy.app” + socials + QR) |
| `answer-reveal` | `slide-01` recap (question re-shown, **no answer**, “Swipe right →”) → `slide-02` answer (jade correct reveal) → `slide-03` community (“See how your answers stack up” + socials) |

The question slide's engagement CTA is **“Comment A, B, C, or D”**.

End slides (app-cta/community) are brand-led: the top strip drops the small
“Play more LoL quizzes at mogsy.app” line in favor of a larger Mogsy wordmark
(`QuizCtaTop variant="brand"`), lead with the real hero art
(`public/content/blitz-thinking.png`), and close with the neutral socials row
(“Follow Mogsy on TikTok · Instagram · YouTube · Twitch” — no invented
handles). The app-CTA slide's play CTA is text-led (no button box). Post
frame-parity gates the CTA geometry within each slide family (quiz-style vs
end-style); phone/screen/island/QR/scan stay identical across all slides.

```powershell
# Single-question post (2 slides)
npm run quiz:screenshots -- --question-id 123 --post single-question

# Answer-reveal post (3 slides)
npm run quiz:screenshots -- --question-id 123 --post answer-reveal
```

## Difficulty / rank badge

`--difficulty <iron|gold|diamond>` renders the League rank **emblem only** (no
words, no border) on the quiz + recap + answer slides — Iron = Easy, Gold =
Medium, Diamond = Hard. It sits in its own fixed-height lane (deterministic,
64px, left-aligned) between the recipe/visual area and answer A, so it never
overlaps or shifts the question text and parity holds across states. Precedence: `--difficulty` (run-level) → per-question
`metadata.content_difficulty` → none. Emblems are the real rank PNGs served by
the combat backend at `assets/ranks/large/<tier>.png` (same origin as item
icons — no copying).

```powershell
npm run quiz:screenshots -- --question-id 123 --post single-question --difficulty gold
```

There is no implicit/random difficulty — a tier is only shown when deliberately
chosen (flag or metadata).

## Item-build recipe visuals

`deriveRecipe()` (src/lib/quiz-screenshot/recipe.ts) normalizes the item-build
question family into one visual model, selected by metadata shape only:

| Family / metadata shape | Visual (question → reveal) |
|---|---|
| `item_build_path` + `missing_component` (Item Build Paths) | `[final]` above `[c1] + [c2] + [c3] + [?]` → slot fills with the component |
| untyped `item_*` + `component_item_*` (Item Components) | `[completed item]` above a bare `[?]` → slot fills with the component |
| untyped `component_item_*` + `parent_item_*` (Item Builds Into) | `[source] → [?]` → arrow slot fills with the completed item |
| `item_final_from_components` (Item Builds Into subset) | `[c1] + [c2] → [?]` (only the subject component has an icon; others are name chips) → slot fills with the final item |

Guarantees: the answer-bearing metadata fields (`missing_component_*`,
`component_item_name` for Components, `parent_item_*`, `final_item_*`) are
read only to validate that they match the question's actual correct choice
(fail-closed against stale/miscategorized data) and are never emitted before
reveal — the question-state model contains no spoiler name, id, or icon.
Anything malformed, contradictory, or unrecognized (including all other
question types) falls back to the plain item-icon layout. Icons for revealed
items derive from the backend's `assets/items/{id}.png` convention.
Recipe visuals apply to content (social) formats only; audit formats keep the
production-page layout.

## Formats

Content composition (fit-to-frame mobile card + CTA footer):
`mobile-social` 1080×1350 (default) · `vertical` 1080×1920 ·
`portrait` 1080×1350 · `square` 1080×1080 · `landscape` 1200×675 ·
`broadcast` 1920×1080

Responsive audit (real page flow at a device viewport, no CTA, no recipe
composition — QA only, opt-in):
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

## Interruption recovery / report-only finalize

Run-level reports are written **before** teardown, and the managed Vite tree
is killed by tracked PID on success, failure, Ctrl+C, SIGTERM, and uncaught
exceptions — the runner always returns control to the shell. If a run is ever
interrupted anyway (crash, kill, power loss), the PNGs and per-question
metadata are intact; rebuild the run-level reports without recapturing:

```powershell
npx tsx scripts/quiz-screenshots/index.ts --finalize-run <run-id> [--overwrite]
```

- No capture, no Vite server, no backend, no admin key.
- Refuses run ids containing path separators/traversal, and refuses to
  replace existing report files without `--overwrite`. PNGs are never touched.
- **Partial-run honesty:** question directories with missing/unreadable
  metadata are reported as `partial-question` failures, and screenshots
  listed in metadata but missing on disk as `missing-screenshot` — never
  counted as successful, never fabricated.
- Idempotent: rerunning produces identical reports (modulo the
  `finalized_at` timestamp).

Verify no managed server is left behind:

```powershell
Get-NetTCPConnection -LocalPort 5199 -State Listen -ErrorAction SilentlyContinue
```

(no output = port free).

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
- `--question-id(s)` uses the direct read-only endpoint
  `GET /api/quiz/admin/review/questions/{id}`; unknown ids are reported as
  skipped with the backend's reason.
- Pack/approved batch modes require the admin key; if unavailable, use
  `--fixture` with an exported dump (`prepare-quiz-video.ts --in`-style JSON
  works).
- Audit captures exclude site navigation (harness mounts outside Layout), so
  nav-overlap QA is not covered in this phase.
