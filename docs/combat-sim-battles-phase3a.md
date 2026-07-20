# Combat Sim Battles — Frontend Phase 3A

Public prediction loop + minimal admin operations for Combat Sim Battles, built on
the frozen/immutable backend (Phases 1/2A/2B). **No leaderboards, broadcast,
wagering, currency, or full combat animation.** The frontend never derives a
winner, outcome, score, or lifecycle transition — every authoritative value comes
from the server.

## Routes

- `/lol/combat-battles` — public battle index (ungated, under `Layout`).
- `/lol/combat-battles/:slug` — public battle detail (ungated).
- `/admin/combat-battles` — admin operations (wrapped in `<AdminRoute>`; also
  registered in the admin directory as a `mutates-production` Site Operations tool).

## Reused systems (no forks)

| Need | Reused |
|---|---|
| Authed backend calls | `getBackendAuthHeaders()` (`src/lib/backend-auth.ts`), pattern from `combat-lab/api.ts` |
| Admin backend calls | `buildAdminHeaders()` (`src/lib/admin-auth/adminCredentials.ts`) |
| Identity (account/anon/guest) | `useAuth()` (`src/hooks/useAuth.tsx`) |
| Admin route guard | `<AdminRoute>` (`src/components/AdminRoute.tsx`) |
| Champion art | `useChampionAssets` + `getChampionIcon/getChampionSplash` |
| Countdown/skew | Daily Score Attack timer pattern (server-reconciled, refetch on boundary) |
| UI primitives | shadcn `Card/Badge/Button/Progress/Accordion/AlertDialog/Textarea/Skeleton/Separator` |
| Toast | `@/hooks/use-toast` (matches Combat Lab) |
| Data fetching | TanStack Query (single shared `QueryClient`) |

## API client (`src/lib/combat-battles/`)

- `types.ts` — typed backend contract (list/detail/result/prediction/settlement/
  arena-score + admin). Mirrors reveal-safe projections.
- `api.ts` — `battlesApi` (public) + `battlesAdminApi` (admin). `BattlesApiError`
  carries `status` + backend `{code, message}` for precise 401/403/404/409 handling
  (incl. `isWindowClosed` for the lock race). The client cannot send a
  winner/outcome/score/user id — those aren't parameters anywhere.
- `lifecycle.ts` — presentation-only status labels, `nextBoundary`, the honest
  `FORMAT_EXPLANATION`, and the exact `decisionReasonCopy`/`outcomeCopy` maps.
- `hooks/useCombatBattles.ts` — query hooks + `useSubmitPrediction` (invalidates
  detail; refetches on a lock-race 409) + `useCountdown` (fires `onBoundary` at the
  server target so the caller refetches; never unlocks/reveals/settles locally).

## Components (`src/components/combat-battles/`)

`BattleCard`, `StatusBadge`, `Countdown`, `ChampionPortrait` (text fallback for
missing art), `CommunitySplit` (backend aggregates only, clean zero state),
`SideConfig` (champion splash + build + ordered actions; labels basic/ability),
`PredictionPanel` (all lifecycle states, guest gate to `/auth`, `aria-pressed`
choices, backend-authoritative), `RevealedResult` (frozen `applied_hp_damage` /
healing numbers only — never legacy `total_damage`; decision-reason copy;
per-action log; technical section), `PersonalResult` (own settled outcome; never
computes correctness; `pending` before settlement), `ArenaScoreCard` (own score;
no rank/comparison; guest benefit note).

## Result-withholding & correctness

- Detail renders `RevealedResult` only when `status === "revealed" && result`.
- `my_prediction_result` is shown only when the backend returns a settlement row;
  before that, a neutral "Pending settlement" — correctness is never inferred.
- The result endpoint/detail return no result pre-reveal (backend-enforced); the
  UI additionally never fabricates one.

## Lifecycle & countdown

Server `status` is authoritative. The client countdown is display-only and, on
reaching a server timestamp, calls `refetch()` to reconcile — it does not locally
transition state, and no public GET performs a write.

## Admin operations (`/admin/combat-battles`)

Event list (status/timing/winner/prediction count) + a structured JSON editor
(seeded with the valid Annie-vs-Brand template) + lifecycle-gated actions: create
draft, validate (+ report), publish (with `AlertDialog` confirm), reproduce, void
(reason + confirm), settle (confirm), and a settlement audit view. Actions are
enabled/disabled by effective status; backend errors are surfaced verbatim. The UI
exposes **no** set-winner / edit-result / edit-published / override-prediction /
supply-score control.

## Accessibility & responsive

Prediction choices use `aria-pressed`; submission/lifecycle changes announce via
`aria-live`; countdowns are `aria-live polite`; champion images have `alt`/text
fallbacks; cards are keyboard-focusable links; layouts stack on mobile
(`grid` → single column).

## Tests

Vitest + testing-library (`npm test`). Covers: lifecycle/copy mapping, API client
(no winner/score sent; structured 409), community split (aggregate + zero),
prediction panel (guest gate, `aria-pressed`, locked/scheduled), revealed result
(winner/draw, frozen numbers, decision reason), personal result
(correct/incorrect/push/void/pending/none — no client derivation), index
(lifecycle grouping, empty/error, no winner on cards). Verified live end-to-end
against the Phase 2B backend (index grouping, open detail with no result leak,
revealed detail with frozen numbers + draw copy).

## Not added in Phase 3A

Leaderboards (global/friends), seasons UI, prediction-history page, spendable
points/wagering/stakes/currency/transfers/cash value, broadcast/OBS,
notifications, automated settlement scheduler, full graphical combat animation,
community-created battles, full visual battle builder, real-money mechanics.
