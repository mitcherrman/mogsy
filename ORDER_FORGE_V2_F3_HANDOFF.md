# OF3-F3 handoff — Order Forge V2 capture fixture + compatibility proof

Branch `of3/f3-v2-capture-compat`, from `origin/main` `6231bfb604d68004e7067f10e3c08489511980d3`. Frontend tests and fixtures only. No source behaviour changed (the only non-test source edit is a comment in `fixtures.ts`). Not merged, not published to Lovable, V2 not enabled, admin preset untouched.

## Capture source / hash
- Source: backend branch `of3/b3-durable-refs` tip `1c38b96cc930beafc545494410e2f34c8cfe14f2`, file `fixtures/order_forge_v2_wire_capture.json`, written by `test_order_forge_v2_wire_capture.py` through the real HTTP routes.
- Copied verbatim (git blob content, LF) to `src/lib/ranked-public/__fixtures__/orderForgeServerCapture.json`.
- git blob `811125b6b79c83600ec7fcf3c78b72e491b467e6`; sha256 `c924338c31a373f13ea68ac7de96498207e19533d3e0f72ad5ff89437fd95048`. Both equal the values in the B3 handoff.
- The B3 handoff says the capture is not in a merged backend branch; this is the pushed B3 tip, which the handoff names as final.

## Layout change (to keep V1)
| File | Now |
|---|---|
| `__fixtures__/orderForgeServerCapture.json` | **V2** capture (canonical, as the plan's F3 row says) |
| `__fixtures__/orderForgeV1ServerCapture.json` | the previous V1 capture, byte-identical (blob `ae7c5fd3…`, same as origin/main) via `git mv` |
| `contracts.orderForge.v1ServerCapture.test.tsx` | the old test, renamed; only the fixture import and header comment changed; all 23 assertions untouched |
| `contracts.orderForge.v2ServerCapture.test.tsx` | new, 16 tests |

## V2 fields exercised
- `module_version: 2` read by `readPrivatePlayer`, routed by `rendererForSegment` to the existing `orderForgeModule`.
- `challenges.family` for `champion_stat:hp@lvl18` (segment 1) and `champion_stat:ad@lvl18` (segment 3, via `private_after_bot_settled`); `item_cost` covered through the resolved reveal and the review.
- Server-authored prompts and metric labels (`Order these champions by Health at level 18`, `Health (lvl 18)`, `Highest`/`Lowest`).
- Server value strings in the own reveal, all three settlements and the review: `2,878 HP`, `3,200 gold`, `131 AD`, `1,982 HP`, `850 gold`, `114 AD`.
- Transcript renders for the item and AD settlements.
- `meta.module_version` and `meta.families` (the only key-path additions over V1; asserted).
- Pre-reveal public payloads carry no `order:` ref, `replay_target` or value string.
- No reader or renderer change was needed: the existing server-driven readers accept the capture as is.

## Champion media proof
- Capture serves `assets/champions/<Name>/icon.png`, in the same repo-relative form as `assets/items/<id>.png`.
- `resolveQuizAssetUrl` (the only resolver; `orderForgeModule.toOrderForgePublic` already calls it) puts champion and item paths on the same API base, with no double slash.
- Rendered check: every open-segment card (HP and AD) has an `<img>` whose `src` equals `resolveQuizAssetUrl(served path)` and contains `/assets/champions/<label>/icon.png`.
- `media: null` renders the monogram, no `<img>`.
- The review reader keeps each entry's media path, which resolves. Note: `QuestionReviewCard` renders no entry art for Order Forge, in V1 or V2. That is existing behaviour; I did not change it.
- No second asset loader was added.
- Limit: this proves the URL the browser is asked for. It does not prove the backend serves those files; that is the plan's `?q=orderforge` production probe under B4.

## V1 compatibility
- The V1 capture and its full test (23 tests) pass unchanged against the renamed fixture.
- `contracts.orderForge.test.ts`, `orderForgeModule.test.tsx` and `OrderForge.test.tsx` (hand-written V1 fixtures) pass unchanged.
- A V2 test asserts the V2 capture adds exactly `.meta.families[]` and `.meta.module_version` over the V1 capture's leaf key paths.

## Tests / checks
| Check | Result |
|---|---|
| Focused: `contracts.orderForge*`, `orderForgeModule.test`, `OrderForge.test` | 5 files, 86/86 pass |
| Wider vitest: `src/lib/ranked-public`, `ranked-core`, `components/interaction-grammar`, `lib/quiz` | 122/124 files, 1624 pass; 7 fail in `quiz-screenshot/command.parser.test.ts` and `command.reviewKey.test.ts`: they spawn `/bin/sh` and fail on this Windows host. Untouched files, unrelated. |
| eslint on the 3 touched ts/tsx files | clean |
| `tsc --noEmit -p tsconfig.app.json` | 6 errors, all in untouched `src/lib/quiz/practiceLeaveContract.test.ts` (react-router type drift); 0 in touched files |
| `npm run build` | exit 0 (build rewrote `public/sitemap.xml`; reverted, not committed) |

Not run: Playwright (no UI or behaviour change). `node_modules` is a junction to the main checkout's install.

## Commit
See the pushed branch head `of3/f3-v2-capture-compat`; exact SHA recorded in the final report (a file cannot contain its own commit SHA).
