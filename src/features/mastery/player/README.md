# Mastery player prototype (G5.2B)

A read-only, fixture-driven prototype of the six-question Ahri E vs Syndra E
Mastery Set. It consumes only the parsed G5.2A player-question and reveal
fixtures — no live backend, no routing, no persistence, no formula logic.

## How G1 can render/inspect it

It is intentionally **not** wired into `App.tsx`, navigation, or the sitemap.
There are two non-production ways to view it:

1. **Vitest render (default, no server):** the component is exercised end-to-end
   in `MasteryPlayerPrototype.test.tsx`. Run:

   ```
   npx vitest run src/features/mastery/player
   ```

2. **Temporary local mount:** in a throwaway dev page (do not commit), render:

   ```tsx
   import { MasteryPlayerPrototype } from "@/features/mastery/player";
   export default function Dev() { return <MasteryPlayerPrototype />; }
   ```

   Point a scratch dev route at it locally. Do not add it to production routing,
   navigation, or the sitemap.

## Authority boundary

- The reviewer artifact fixture is never imported here.
- Reveal data (correct answer, explanation, calculation, after-state) is exposed
  to rendering only after the local submit; pre-submission render paths receive
  `reveal === null`.
- Correctness is taken from the reveal's `authoritativeCorrectness`; answers are
  never judged locally. Numeric input validation is input-shape only.
- No cooldown/haste/damage/health formulas, no expression evaluation, no
  `fetch`/Supabase calls, no ID generation.
