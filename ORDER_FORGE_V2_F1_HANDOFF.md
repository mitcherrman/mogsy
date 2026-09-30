# OF3-F1 handoff: Order Forge visual pass

Branch `of3/f1-order-forge-visual`, from origin/main `838628f9`. Not integrated; Lovable not published.

## Scope
Module-local visual pass only. No change to `CanonicalArena`, `ArenaShell`, `QuizRankedMatch`, global stage dimensions, grading, order state, submission, reveal authority, v1/v2 contract reading, or audio (F2 owns SFX). All wording still comes from the server (prompt, metric label, direction labels, names, media); nothing item-specific is hard-coded.

## Asset
`src/assets/ranked/base-shop.jpg`, copied byte-for-byte from the primary checkout's untracked file
(SHA-256 `7fbe6b2ada4ae437c807881d62962f1775cf9189f43b60f289081ac4da2f4410`, identical in both). Not regenerated or substituted.

## Backdrop (`orderForgeModule.tsx`, `OrderForgeViewport`)
- Root is now `relative isolate`; one `aria-hidden`, `pointer-events-none`, `absolute inset-0 -z-10` layer scoped to the module box (arena chrome is not tinted).
- `<img alt="" object-cover>` with `opacity 0.25`, `filter: blur(3px) saturate(0.8)`, no animation/transition.
- Parchment scrim gradient over it (`#f4e9cc` 55% / 20% / 60%; `bg-background` in dark) so card contrast stays strong. Cards keep their own opaque surface.

## Layout changes (`OrderForge.tsx`)
Phone (<md) is unchanged except the rank numeral alignment: same sizes, grip-only drag, up/down, page scroll.
- Playable stack: `max-w-[34rem]` -> `md:max-w-[44rem]` -> `xl:max-w-[52rem]`. Lock In and prompt widen to match; reveal grid `xl:max-w-[60rem]`.
- Rank: new `RankBadge`, a filled circular 1-5 badge at md+ (h-9/w-9, xl text-xl; h-8 on short lg).
- Spacing: card gap `md:gap-4`, card padding `md:px-3`, control cluster `md:gap-1.5`, list gap `md:gap-2.5`. Name text `md:text-lg`.
- Art: `md:h-12 w-12`; `lg:h-10`.
- Rails: slightly larger at md, with a fading rule line extending the Start/End label.
- **Height-gated tier** `lg:[@media(min-height:860px)]:` (literal class, Tailwind cannot see interpolated variants): rows `min-h-[76px]`, art 56px, list gap 10px, Lock In `min-h-[56px]`. Short desktops (<860px tall: 1366x768, 1280x720, 1920x800...) keep compact rows and only gain width, because the arena locks the stage to the viewport height there.
- Locked/revealed `StaticRow`: same badge, larger art only on tall desktops; `lg` gap/padding deliberately kept at baseline. Widening them (first attempt) wrapped names to two lines in the half-width reveal columns and overflowed the 1280x720 stage by 29px; corrected and covered by the existing fit test.

## Tests
- `OrderForge.test.tsx`: layout-class assertions (wider stack, tall tier, rank badge).
- `orderForgeModule.test.tsx`: backdrop is aria-hidden, inert, non-animated, blur/saturate filter, no focusable children, isolated root.
- `e2e/ranked-arena-fit.spec.ts`: new "F1 backdrop + input" at 1600x900, 1280x720, 360x800 (uses `&lead=1500` so the challenge opens): computed `pointer-events:none`, no animation, backdrop never hit-tests over a card, no horizontal overflow, up/down button, keyboard grip ArrowDown, pointer grip drag all reorder.

## Results
- Order Forge Playwright (`playwright.arena.config.ts -g "Order Forge"`): 25/25 pass. That is 10 desktop sizes x open+revealed, 360x740 and 360x800 phone (scroll, 44px controls, grip touch-action none, no h-overflow, Lock In reachable), and the 3 new tests.
- Vitest: interaction-grammar, ranked-core/modules (incl. `orderForgeModule`, registry), `CanonicalArena.boundary`, `sharedLayer.boundary`: pass.
- Wider sweep (interaction-grammar, ranked-core, ranked-public, ranked-arena): 8 failures in 4 files, none touching Order Forge: `AnswerGrid.elimination`, `DailyOnCanonicalArena.boundary` (Daily source-scan: `dailyLeaveContract.ts`, `entry.ts` files), `QuestionStageGeometry`, `masterySliceModule.stageGrammar`. They are source-scanning tests reporting Daily/mastery files my diff does not touch, so they appear to be pre-existing on origin/main (not re-verified on a clean checkout). Flagging for owner.
- `npm run build`: exit 0 (build rewrites `public/sitemap.xml`; reverted, not committed).
- ESLint on touched dirs: 0 errors (existing fast-refresh warnings). `tsc` shows no errors in touched files; unrelated pre-existing errors exist elsewhere (`practiceLeaveContract.test.ts`).
- Reduced motion: no motion was added (backdrop static; card layout animation logic untouched).

## Screenshots
`docs/of3-f1/desktop-1600x900.png`, `desktop-1280x720.png`, `phone-360x800.png` (probe fixture, open state).

## Owner review
1. The arena stage is ~725px wide at 1600 and ~590px at 1280, so the stack is wider than before but bounded by the canonical stage, not the full screen (changing that would require an arena change, out of scope).
2. The backdrop reads as a faint warm texture on the parchment; raise opacity toward 0.30 if you want it stronger (asset is 637x358, soft at 1920 by nature).
3. Short desktops (<860px tall) get a wider but not much taller layout by design.
4. Test-harness note: `playwright.arena.config.ts` webServer command fails under Windows cmd (`node_modules/.bin/vite`); I started vite manually on :8123 (config reuses it).
