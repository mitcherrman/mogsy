# UX1-A — Global HUD narrow-phone / large-text reflow

Date: 2026-09-30. Branch `codex/ux1a-hud-reflow`, from fetched `origin/main` `9abc62448308930bb0c553cfc41f486e9f1dcbd7`.

## Reproduction and cause

Playwright/Edge loaded `/lol` in E2E auth mode at 320, 375, and 390 CSS px, as guest and signed-in, with normal root text and the HUB7-equivalent `html { font-size: 32px !important; }`. Measurements included `clientWidth`, `scrollWidth`, and every HUD control's bounding box.

Current Chromium did not reproduce HUB7's historical document-width delta: `scrollWidth === clientWidth` in every before case because the HUD is fixed. The underlying defect did reproduce as visual-viewport clipping. Phone-only target geometry was expressed in `rem`, so 200% root text doubled 32px controls to 64px and the 24px notification half to 48px. At 320px guest, profile ended at 343.25px and notifications at 392.25px; signed-in notifications ended at 326px. The same guest notification ended at 392.25px at 375 and 390px.

## Runtime change

`src/index.css` keeps the existing phone HUD composition and converts only its fixed visual/interaction geometry from equivalent `rem` values to CSS pixels. The collapsed Home Hub launcher receives the same treatment. Labels, DOM, routes, control order, pointer-event model, collapse state, and `inert`/`aria-hidden` behavior are unchanged. Invisible pseudo-element extensions still make each effective target at least 44px tall.

## Measurements

| State | View / text | Before viewport / scroll / document overflow | Before farthest control | After viewport / scroll / overflow | After farthest control |
|---|---|---|---:|---|---:|
| Guest | 320 / normal | 320 / 320 / 0 | 311 | 320 / 320 / 0 | 311 |
| Guest | 320 / 200% | 320 / 320 / 0 | 392.25 | 320 / 320 / 0 | 311 |
| Guest | 375 / normal | 375 / 375 / 0 | 366 | 375 / 375 / 0 | 366 |
| Guest | 375 / 200% | 375 / 375 / 0 | 392.25 | 375 / 375 / 0 | 366 |
| Guest | 390 / normal | 390 / 390 / 0 | 381 | 390 / 390 / 0 | 381 |
| Guest | 390 / 200% | 390 / 390 / 0 | 392.25 | 390 / 390 / 0 | 381 |
| Signed-in | 320 / normal | 320 / 320 / 0 | 311 | 320 / 320 / 0 | 311 |
| Signed-in | 320 / 200% | 320 / 320 / 0 | 326 | 320 / 320 / 0 | 311 |
| Signed-in | 375 / normal | 375 / 375 / 0 | 366 | 375 / 375 / 0 | 366 |
| Signed-in | 375 / 200% | 375 / 375 / 0 | 358 | 375 / 375 / 0 | 366 |
| Signed-in | 390 / normal | 390 / 390 / 0 | 381 | 390 / 390 / 0 | 381 |
| Signed-in | 390 / 200% | 390 / 390 / 0 | 373 | 390 / 390 / 0 | 381 |

All after controls are inside the visual viewport. Sign Up remains readable and available to guests. Profile, notifications, radio, and report remain reachable. DOM order equals focus order; each control accepted programmatic keyboard focus; focus rings remained viewport-bounded. Effective targets measured at 44px or more. Collapsed, expanded, and outside-click close passed at 320px/200%.

## Verification

- Focused Playwright: 14/14 (matrix, target geometry, focus/order, Home Hub collapse, `/lol`, `/quiz`, `/profile`, `/quiz/ranked` smoke).
- Focused Vitest: 193/193 (`GlobalHud`, identity/notifications, radio, report, `LolHub`).
- Targeted ESLint and `git diff --check`: pass.
- `tsc -p tsconfig.app.json --noEmit`: the UX1-A files add no errors; the command retains current-main errors in `OnboardingProfile.tsx`, `identity/connections.ts`, and four `practiceLeaveContract.test.ts` assertions.

No route, navigation, auth, signup, queue, or gameplay semantics changed. No remaining UX1-A issue is known.
