# JSPACE1 — Mastery Journey Mobile Space Experiment
Updated: 2026-10-15

## Objective
For mobile Mastery Journey specifically, make the interactive two-champion board
and calculation reveal more readable at the 509x709 Shorts recording viewport.
Keep the full timeline behind a small bottom disclosure; shrink tertiary match
HUD, not the score or live timer. No server, scoring, grading or Daily changes.

## Decisions
- Distinguish a real Journey using the canonical module's segmentState.journey,
  not a text search or a generic mastery module identifier.
- MobileBottomBar keeps original Report/Rules hosts and one RoundTimeline in
  the DOM and presents a 20px Timeline disclosure collapsed initially.
- MobileMatchBar keeps both names, champion/role crests, scores and timer,
  while hiding recent-result bubbles and status lines on Journey phones only.
- At short phone heights, reserve ~160px board and ~149px prompt at 509x709.
  For 420-639px short windows only, allow 212px minimum for the answer region;
  long content can grow the page. Narrower widths retain the old 280px floor.
- All changes are responsive UI-only. No production publication without review.

## Relevant files
src/components/ranked-arena/{CanonicalArena,MobileMatchBar,MobileBottomBar}.tsx
src/index.css
e2e/journey-mobile-space.spec.ts
playwright.journey-mobile.config.ts

## Current state
Work-in-progress branch experiment/journey-mobile-space-20261015,
based on main d72841adb886ff412c409b3692a7f8452c811387.
Authentic Olаf/Sett J4 and Volibear JATTN1 captures power browser checks.

## Next
Verify full board containment, long calculation reveal, 509x709 zero scroll,
timelines collapsed/expanded, other modes unchanged and frontend build. Correct
any failures on branch, show owner screenshots, and do not merge before approval.

## First browser findings and repairs
- Initial CI showed MVFIT1's cinematic 100px `max-height: ... !important` was
  still clamping the Journey board despite its new min-height. Removed this cap
  only for the served Journey band; keep art cap everywhere else.
- J4 Olaf capture steps 21–22 are post-stage-finish (segment_state=null):
  test matrix now uses 19–20 for Cloth Armor and JATTN1 for typed reveals.
- The dev harness introduces extra document height beyond the live arena
  (550+px), so do not interpret its document scrollHeight as Daily clipping.
  Assert visible board, complete side objects, answer and bottom bar rects.
- Removed the 780/781px height seam with smooth answer-reserve interpolation.
