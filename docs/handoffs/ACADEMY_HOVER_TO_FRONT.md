# Academy — Hover-to-Front orbit interaction

Branch **`academy-core/hover-to-front`**, cut from `main` **`edc96f7d`**. Frontend only: no backend, data, analytics, audio-registry,
flag or env change. RC2.2 Academy startup (veil, readiness gate, font warm) is untouched.

**Status: built and unit-tested locally; the PR's browser suites run on GitHub Actions. Not merged, not deployed: this new feature
needs the owner's explicit go.**

## Behaviour

On the desktop orbit (`/lol`, ≥ 1024 px, motion allowed):

1. **Hover selects.** Moving the pointer onto any of the four books emphasises it at once, as before (crystal projection, tether,
   needle, Mogzy, the focus cue). If the pointer **rests on it for 180 ms** (`HOVER_INTENT_MS`), the hover becomes a selection.
2. **The whole orbit brings it forward.** The orbit turns, by the shorter way round, until that book is front-centre under the
   crystal. This is the arrows' own controller: the same `SpinModel`, one cubic Hermite turn from the orbit's current position *and*
   speed, the same `steerDuration` (~0.75 s plus 0.45 s per quarter turn, at most 2.2 s), the same 4 % held emphasis. There is no new loop and no
   new timer apart from the 180 ms dwell.
3. **It holds.** Phase `held`: the orbit is still until something intentional happens. The stage shows `data-hover="<book>"` and
   `data-spin="held"`.
4. **Moving books are not intent.** As the orbit turns, the chosen book leaves a still cursor and other books slide under it. The
   browser reports that as `pointerleave` / `pointerenter`. Only **real pointer movement** counts as intent: an event whose
   coordinates match the pointer's last position is ignored. While a hover is held:
   - its own leave events are ignored;
   - a switch to another book needs the hand to have travelled **6 px** (`HOLD_SLOP_PX`) since the hold, so a nudge is not a choice;
   - moving across open space keeps the hold, so the visitor can follow the book to the front.
5. **Real intent is deterministic:**

   | What the visitor does | Result |
   |---|---|
   | Moves onto another book and rests 180 ms | That book is brought forward. A turn already under way is re-planned smoothly. |
   | Passes over a book in under 180 ms | Temporary emphasis only, then the current selection comes back. |
   | Leaves the orrery (the stage) | The hover ends: emphasis off, Lux closes. The book stays held at the front, as an arrow selection does. |
   | Clicks an arrow | The arrow wins and continues one book on from the hovered one. |
   | Clicks the crystal | The hover ends and the crystal's cycle continues from the hovered room; the orbit is released. |
   | Presses or drags open space | The hover ends and the orbit is the pointer's (the existing drag, fling and snap). No book is chosen during a drag. |
   | Clicks a book | Unchanged one-click navigation with the 240 ms activation. A click inside the dwell cancels the pending turn. |
6. **Lux.** The Leaguecraft iris opens on `data-intent="book"`. That intent now survives the turn, so the 1.8 s reveal completes and
   stays open while held, with no restart or flicker. A real leave closes it (after the existing 400 ms wait).
7. **CSS `:hover` on passing books.** A book sliding under a still cursor gets the browser's `:hover`. In the Orrery only the chosen
   book (`data-active`) now responds; a passing book keeps its resting cover, light and art. This needed two class hooks on the
   shared `AcademyHubBook` (`academy-hub-book-art`, `academy-hub-book-rim`). The Hall's styling is unchanged.

Unchanged:
- **Keyboard:** Tab and arrow keys bring a book beside the crystal; Enter opens it.
- **Touch and phones:** composed layout, one-tap open, no hover hold.
- **Sound:** the focus cue now plays once per *real* reach. It no longer plays for books sliding under a still pointer.
- **Analytics and prefetch:** prefetch still fires on enter; analytics are untouched.

**Reduced motion (a decision; flagged for the owner):** hover emphasises **in place** and never turns the orbit. Otherwise the whole
scene would jump under the cursor. The arrows still place their selection at once, as before.

## Changed files

- `src/pages/academy-core/orrery/orrery-motion.ts`: `SpinModel.steerToBook(index)` (shorter way; a tie turns the way the orbit is
  going; repeating the same book never re-plans). It shares a private `plan()` with `steer()`.
- `src/pages/academy-core/orrery/OrreryEngine.ts`: `steerTo(id)`.
- `src/pages/academy-core/orrery/useCoreNavigator.ts`: real-movement detection, dwell, held hover (`hoverHold`), `onStagePointerMove`,
  `onStagePointerLeave`, `endHover`; leave falls back to the held book; arrows, crystal and click cancel or replace the hold.
- `src/pages/academy-core/AcademyCorePage.tsx`: wires the commit to `engine.steerTo` (orbit only, not reduced, not dragging); stage
  `onPointerLeave`, `data-hover`; open-space press ends the hover.
- `src/pages/academy-core/orrery/academy-core-v35.css`: `:hover` responds only on the chosen book.
- `src/components/lol/AcademyHubBook.tsx`: two class names (no visual change).
- `.github/workflows/academy-core-orrery.yml` (new): unit tests, `vite build`, then both Orrery Playwright specs in bundled headless
  Chromium on GitHub's runner.
- Tests: `orrery-motion.test.ts`, `OrreryEngine.test.ts`, `AcademyCorePage.test.tsx`, `e2e/academy-core-v35.spec.ts`.

## Tests

Local (no browser, per AGENTS.md; vitest through the esbuild + wasm-rollup workaround):
- **Motion (`orrery-motion.test.ts`), +7:**
  - every book, from 40 orbit phases and four starting speeds, ends exactly front-centre by the shorter way, with the spacing kept;
  - monotone, no overshoot, then still for 10 s;
  - a tie turns with the orbit;
  - repeating the same book does not re-plan;
  - a switch mid-turn has no jump;
  - a grab refuses or drops it; reduced motion places it at once;
  - the arrows continue from a hover selection.
- **Engine (`OrreryEngine.test.ts`), +2:** `steerTo` sets `data-spin` at once and holds; a repeat is ignored; the arrows take over;
  refused during a drag; placed at once under reduced motion; absent in the composed layout.
- **Page (`AcademyCorePage.test.tsx`), +16 new, 2 rewritten.** The two old hover tests assumed a hovered book stays where it is; they
  now assert the approved behaviour. New coverage:
  - all four books from different orbit positions, front-centre and stable;
  - a still pointer with synthetic leaves and enters (no chasing);
  - a nudge versus a real move;
  - open-space travel keeps the hold, and a stage leave ends it;
  - quick switching;
  - a pass under 180 ms keeps the arrow selection, and a pass across open space too;
  - arrow precedence;
  - the crystal;
  - drag interruption;
  - a click on the held book navigates after 240 ms; a click inside the dwell does not turn;
  - keyboard unchanged;
  - reduced motion in place;
  - phones and touch;
  - the focus cue only on a real reach.
- Results:
  - Academy Core, startup lib and `components/lol`: **448 / 448**.
  - Funnel, entry and routing: **87 / 87**.
  - `tsc`: the 2 known baseline errors only. `eslint` on the changed files: 0.
- **Build:** `npm run build` exit 0; the Orrery chunk `AcademyCorePage` is 68.8 kB JS (21.9 kB gzip).

GitHub Actions (`academy-core-orrery`), `e2e/academy-core-v35.spec.ts` and `e2e/academy-core.spec.ts`:
- **Fixed:** three existing tests clicked a hovered book at stale coordinates. They now wait for `data-spin=held` and aim where the
  book is.
- **Rewritten:** two hover tests.
- **New `hover-to-front` suite, 12 tests:**
  - all four books from arbitrary positions;
  - a still mouse (a MutationObserver proves focus, hover and intent never change; a passing book's cover stays at rest);
  - real departure;
  - quick switching;
  - arrow precedence, and a quick pass;
  - the crystal;
  - drag interruption;
  - Lux opens monotonically through the turn and stays open, then a real leave closes it;
  - keyboard;
  - reduced motion;
  - phones;
  - direct `/lol` startup (the veil lifts, `data-startup` ready, no hover, orbit free).

## Integration status

See the PR. The CI result and the build are recorded in the PR description and in the session's final report.

## Next action

The owner's hands-on review at 60 fps on a real GPU: is the 180 ms dwell right, and should the reduced-motion hover stay in place?
Then merge and publish on the owner's explicit go. Rollback: revert the merge; nothing else depends on it.
