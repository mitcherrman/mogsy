# Mastery reviewer inspector (G5.2C)

A read-only reviewer workbench for the audited first Mastery artifact. It renders
the complete immutable artifact and its mutable review record **without changing
either** — an inspection tool, not an editor.

## How G1 can render/inspect it

Not wired into `App.tsx`, navigation, or the sitemap. Two non-production ways:

1. **Vitest render (no server):**

   ```
   npx vitest run src/features/mastery/reviewer
   ```

2. **Temporary local mount** (do not commit):

   ```tsx
   import { MasteryReviewerFixtureHarness } from "@/features/mastery/reviewer";
   export default function Dev() { return <MasteryReviewerFixtureHarness />; }
   ```

`MasteryReviewerInspector` is prop-driven (`artifact`, `reviewRecord`,
`rawArtifact`), so it can later consume a real backend response with no
architectural change; `MasteryReviewerFixtureHarness` supplies the parsed audited
fixture.

## Authority boundary

- The **reviewer fixture** (`reviewArtifactEnvelope`) is the sole data source; the
  player fixtures are never used as reviewer authority.
- No mutation is possible — review actions are disabled and clearly labeled.
- No `fetch`/Supabase, no game formulas, no expression evaluation, no ID
  generation or re-hashing. Copy-to-clipboard is non-canonical and guarded.
- Calculation expressions are shown as text; recomputation pass/fail is displayed
  from backend evidence, never recomputed.
