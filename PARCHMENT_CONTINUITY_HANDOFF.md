# Parchment Continuity — Quiz Hub centre sheet (Daily · Role · Ranked)

_Branch `claude/hopeful-bell-s1yr72`, based on `origin/main` `d72841a`. Frontend only. Not merged; owner approval required._

## Verdict

**READY FOR REVIEW.** The centre parchment keeps identical outer bounds across all three modes at all five
acceptance viewports (asserted in a real browser), the flank sheets don't move, and Daily now has a full
game-mode composition. No backend, database, or gameplay changes.

## The problem (measured on `main`)

| Viewport | Centre sheet height, Daily → Ranked | Role |
|---|---|---|
| 360×640 | 405 → 731 px | taller than Ranked (champion grid) |
| 390×844 | 417 → 743 px | 〃 |
| 768×1024 | 597 → 956 px | 〃 |
| 1440×900 | 646 → 794 px (the whole three-sheet rack resized) | 〃 |
| 1920×1080 | 652 → 801 px | 〃 |

Each mode was rendered on its own, and the sheet took the height of whichever mode was showing.

## Shared sizing approach (the layout contract)

`src/components/quiz/centre-stage/CentreModePane.tsx` (contract in its header) + `.lc-centre-stage` /
`.lc-centre-pane*` in `src/index.css`.

- **Shared top navigation:** the mode tablist stays where it was, above the stage.
- **Stage:** a `flex: 1` box under the tabs, inside the scroll's content column. The column's
  width-relative padding is the parchment's existing safe area, so nothing can reach the rollers.
- **Sizer = Ranked.** The Ranked composition (the visual benchmark) is always laid out in normal flow and
  is the *only* thing that sizes the stage. When another mode shows, Ranked stays in the layout but is
  hidden (`visibility: hidden` inline, `inert`, `aria-hidden`). The sheet is always the box Ranked has
  always had, so Ranked's composition and the desktop rack heights are unchanged.
- **Fill = Daily and Role.** These are absolutely positioned at `inset: 0` inside the stage and never
  contribute to its size. Each owns one flexible region that absorbs the available space (the Daily
  mascot, the Role champion grid). Headers and the bottom CTA are `shrink-0`, which protects them. The
  fill pane has `overflow-y: auto`, but only as a last resort (e.g. an extreme text zoom). At every tested
  viewport nothing scrolls except the champion grid.
- **Labels follow the sheet's width, not the viewport's.** I added `.lc-cq-wide` / `.lc-cq-narrow`
  (`@container lc-scroll (min-width: 21rem)`). This fixes a bug that also exists on `main`: at 768 px the
  long tab names ("Daily Challenge · Role Challenge") overlapped and "Support" clipped, because the
  `sm:` breakpoint picked the long forms for a ~300 px sheet.
- **Switching:** Role mounts on its first visit and is then **kept**, so its role, search, champion, and
  catalog survive switching (one catalog read per page load, asserted). Panes fade up for 200 ms only
  after a switch, never on first paint, and not at all under `prefers-reduced-motion`.

## Daily Challenge redesign

`src/components/quiz/centre-stage/DailyModePanel.tsx`

- **Reading order:** display title ("Today's Challenge") + one status line → Mogzy → today's record →
  wax seal.
- **Mascot (reused art):** `MogzyMascot` pose `holdingBook` (the "knowledge / quizzes" pose); `cheering`
  once the day is complete. It sits in a warm paper aura with a plinth shadow, the parchment language
  used by the Ranked stage, and breathes slowly (off under reduced motion). I added two **derivative
  encodes of existing art** (same drawing, crop, and alpha): `public/mascot/mogzy-holding-book-transparent-576.webp`
  (25 KB) and `mogzy-cheering-transparent-512.webp` (24 KB). They are registered in
  `MOGZY_MASCOT_ASSETS_MEDIUM` and replace the ~1 MB PNGs.
- **Play seal (reused component):** `RankedPlayGem` with a new optional `testId` prop (default unchanged,
  `ranked-play-gem`). Daily's seal is `daily-play-seal`, with the action as its accessible name and as a
  visible caption.
  - Available → **Play Daily**
  - In progress → **Continue Daily**
  - Main done with More Challenges / Review open → **Continue / Review** (still play)
  - Finished day → a plain **View Today's Results** button, *not* the seal, because the seal's art bakes
    in the word PLAY
  - Every action calls the same existing `onPlayDailyChallenge` → `/quiz/daily-challenge`.
- **Statistics (real data only):** Today (Ready / In progress / Complete, or "—" when unknown), Score
  (the server's `main_score`), Correct (Standard's settled `correct/answered`). These come from the
  `today` run the lobby already reads; I added optional `score/correct/answered` fields to
  `DailyStatusView` (`src/lib/daily-challenge/status.ts`), so there is **no new request**. Anything
  unsettled is "—". **No streak is shown:** the Daily run keeps none, and the Academy answer streak is a
  different fact.

## Role Challenge refinements

`src/components/quiz/RoleChallengePicker.tsx`

All behaviour is preserved: 5 roles, search, 173-champion catalog, portraits, off-meta labels,
Free/Premium, start / resume / complete, idempotent start keys.

- **Layout:** header / role radios / search are `shrink-0`; the **champion grid** is `flex-1 min-h-0`
  and scrolls internally (floor `6.5rem`). Scroll chaining is left on, so there is no scroll trap.
- **Grid:** `repeat(auto-fill, minmax(3.5rem, 1fr))` gives 3 columns on phones and 5 on desktop and
  tablet.
- **Names:** 11 px, two-line clamp instead of an ellipsis ("Aurelion Sol" reads whole). "Off-meta" no
  longer wraps.
- **Affordances:** clearer selected role (stronger fill and inset), hover and visible focus outlines on
  role and champion options.
- **Footer:** a protected footer (`rc-footer`) holds the selection, eligibility, Play button and note.
  The copy is condensed, and "12 questions" moved into the subtitle.
- The existing Play button is kept rather than the wax seal: Role is the dense mode, and a 9 rem seal
  would cost about two rows of champions.

## Ranked

Unchanged composition and behaviour. The only differences are that it is wrapped in the sizer pane
(`ranked-mode-panel`) and there is a 6 px stage margin under the tabs, shared by all modes so the titles
line up.

## Changed files

- New: `src/components/quiz/centre-stage/{CentreModePane,DailyModePanel}.tsx`,
  `centreStage.test.tsx`, `e2e/parchment-continuity.spec.ts`, 2 mascot WebPs,
  `docs/parchment-continuity/*.webp` (screenshots).
- Modified: `RankedLobbyHero.tsx` (stage, panes, Role keep-alive; old inline Daily panel removed),
  `RoleChallengePicker.tsx`, `RankedPlayGem.tsx` (`testId` prop), `mascot-assets.ts`,
  `daily-challenge/status.ts`, `index.css`. Tests updated: `RankedLobbyHero.test.tsx` (Ranked is now
  hidden rather than unmounted), `dailyV2P2A.hierarchy.test.tsx` (new status fields).

## Tests

- **Browser acceptance** (`npx playwright test -c playwright.frontend.config.ts e2e/parchment-continuity.spec.ts`,
  fixtures only; `PW_CHROMIUM=/path` when Playwright's bundled browser is missing,
  `PARCHMENT_SHOTS=<dir>` writes screenshots): **8/8 pass**.
  - Identical centre, left and right sheet boxes across Daily / Role / Ranked at 360×640, 390×844,
    768×1024, 1440×900, 1920×1080; no horizontal overflow.
  - Daily active / complete states (seal name, real figures, cheering pose).
  - Role state kept across switches with exactly one catalog read; tab keyboard model; hidden panes not
    tabbable.
  - Reduced motion.
  - On `main` the same spec fails at all 5 viewports (the "before" numbers above).
- **Unit:** the new `centreStage.test.tsx` (10) plus the hub, picker, seal and Daily suites all pass.
  Wide affected set (quiz components, Quiz hub / role / guide / playScroll, daily-challenge, role-challenge,
  quiz-daily-challenge, mascot, lobby-preview, quiz-ranked): every failure also fails on `main` `d72841a`
  (Quiz.hub h1 / rail, Quiz.rankedRole Practice, QuizCategoryRail, DailyHistory dv2p2b, RankedMatchRow host,
  syntheticRankedHistory, and the timing-flaky LobbyPreviewPage.premiumAnalytics). There are **no new
  failures**.
- `tsc` (app + node): 0 errors. ESLint on touched files: 0 errors (1 fast-refresh warning for the exported
  `dailyModeCopy` helper). `vite build`: passes.

## Screenshots

`docs/parchment-continuity/` — `<viewport>-before-after.webp`: top row is `main`, bottom row is this
branch; Daily, Role, Ranked from left to right. Also `1440x900-{daily,role,ranked}-full.webp` and
`1440x900-daily-states.webp` (in progress / complete).

## Known limitations / outstanding

- Champion portraits render as initials in the screenshots because the sandbox can't reach the asset
  host; production art is unchanged.
- The Ranked "Start here" Mogzy guide bubble overlaps the "Choose your role" title. This also happens on
  `main` (guide coordinates); it is out of scope and untouched.
- A day where the main Daily is complete but not settled to a score shows "—" for Score by design.
- If a future Role state adds much more fixed chrome (for example a long error *and* an active-run card
  at 360 px), the grid shrinks to its 6.5 rem floor and then the pane scrolls as a whole. The sheet itself
  never grows.
