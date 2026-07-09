# Mogsy Quiz Video Export (Remotion)

Code-based MP4 export of quiz videos — no OBS, no screen capture.
1920x1080, 60 fps, H.264, deterministic frame-driven animation.

This module is fully isolated from the Vite app: nothing under `src/video/`
is imported by app code, and the Remotion CLI bundles its own entry
(`src/video/index.ts`, configured in `remotion.config.ts` at the repo root).
The existing Broadcast Studio / BroadcastRenderer are untouched.

## Commands

```bash
# Build a video input JSON from REAL quiz questions (Quiz Review Console API)
export ADMIN_KEY=<KNOWLEDGE_ADMIN_KEY>          # or pass --admin-key
npm run video:prepare -- --favorites --limit 5
npm run video:prepare -- --category item_exact_stats --difficulty-max 2
npm run video:prepare -- --pack <pack_key> --title "Item Quiz #1"
npm run video:prepare -- --in exported.json      # offline: adapt a local dump
# → out/quiz-video-input.json, then:
npm run video:render -- --props out/quiz-video-input.json

# Render the sample video + timestamps into out/
npm run video:render

# Render your own quiz JSON
npm run video:render -- --props path/to/quiz.json --out out/my-quiz.mp4

# Only regenerate the timestamp/metadata files (no render)
npm run video:timestamps

# Interactive preview / scrubbing while designing
npm run video:studio
```

Outputs:

```
out/quiz-video.mp4              # the video
out/quiz-video-timestamps.txt   # paste into the YouTube description
out/quiz-video-metadata.json    # per-question start/reveal/end timing
```

(`out/` and `.remotion/` are gitignored.)

## Input JSON

See [sample-quiz-video.json](./sample-quiz-video.json). Shape (`QuizVideoData`
in [types.ts](./types.ts)):

```jsonc
{
  "title": "Mogsy League Quiz",
  "subtitle": "optional",
  "website": "mogsy.net/quiz",
  "patch": "14.20",
  "intro_seconds": 4,
  "outro_seconds": 4,
  "default_durations": { "question": 4, "countdown": 8, "reveal": 3, "explanation": 5, "transition": 1 },
  "questions": [
    {
      "id": "q1",
      "question": "…?",
      "choices": ["A", "B", "C", "D"],
      "correct_index": 1,            // or "correct_answer": "B"
      "explanation": "optional — card is skipped when absent",
      "category": "item_exact_stats",
      "difficulty": 2,
      "champion_name": "Ahri",
      "item_name": "…",
      "ability_name": "…",
      "durations": { "countdown": 12 }  // optional per-question overrides (seconds)
    }
  ]
}
```

## Per-question sequence

intro card → for each question: question in → choices in → countdown bar →
correct-answer reveal (wrong choices dim, correct pops) → explanation card →
slide-out transition → outro card.

## Architecture

- `timing.ts` — single source of truth for all timing. Both the Remotion
  composition and the timestamp exporter consume `buildTimeline`, so
  exported chapters always match the rendered frames exactly.
- `QuizVideo.tsx` / `QuizQuestionScene.tsx` — frame-driven components
  (`useCurrentFrame` + `interpolate`/`spring`). Inline styles only, so no
  Tailwind/webpack config is needed inside Remotion and rendering is
  deterministic. The wall-clock/RAF/three.js BroadcastRenderer is
  intentionally NOT reused — it cannot render deterministically per frame.
- `scripts/render-quiz-video.ts` — one-command render + timestamp export.
- `adapter.ts` + `scripts/prepare-quiz-video.ts` — convert real quiz
  questions (ReviewQuestion shape from the Quiz Review Console API, the
  only quiz read that ships correct answers inline) into `QuizVideoData`.
  Unusable rows (wrong format, missing answer, answer not among choices)
  are skipped with per-question reasons, never silently dropped.
  Read-only against the backend; supports `--in <file>` for offline dumps.

## Future (not v1)

- 9:16 (1080x1920) Shorts composition: add a second `<Composition>` in
  `Root.tsx` with a vertical scene layout; same data + timing model.
- Champion/item artwork: add image paths to the JSON and render with
  Remotion's `<Img>` (assets must be local or fetchable at render time).
