# Atlas cross-section — ATL-CS-UX-001 handoff

Status: owner-only prototype on a DEMO fixture adapter. Not wired to any backend. Baseline `/admin/atlas-p1c` untouched.

> **Updated by ATL-CS-INT-001:** the view model, fixture and a typed wire boundary now follow the implemented backend contract. See [ATL_CS_INT_001_HANDOFF.md](ATL_CS_INT_001_HANDOFF.md) for the mapping; rows below that mention `related_results`, `relation`, rank 1–5 or `facetMatch` are superseded by it.

## Where

- Routes: `/admin/atlas-cross-section` (child of the AdminRoute-protected `/admin` shell) and `/lol/dev/atlas-cross-section` (DEV-only twin; absent from production builds).
- Model: `src/lib/atlas-cross-section/`
  - `types.ts` — `SubjectRef`, `CrossSectionQuery`, `Relationship`, `CrossSectionResponse` and `CrossSectionAdapter`, written against Contract V0 (`atlas_questions.v0`).
  - `query.ts` — reducer for A / B / B.1, collection, facets, view; `relationshipOf`, `availableViews`, `appliedFilters`.
  - `fixtureAdapter.ts` — `createFixtureAdapter()`, `searchFixtures()`, `accessFor()`, `pairSupported()`.
  - `fixtures.ts` — DEMO subjects (Ahri, Syndra, Lux, Jinx; six legendary items), DEMO ability/stat sheets, DEMO question corpus with families, edges, facets, discoveries and attempts.
- UI: `src/pages/dev/atlas-cross-section/`
  - `AtlasCrossSectionPage.tsx` — table shell, URL mirror, adapter calls, live region, persona preview.
  - `SubjectRail.tsx` — A (vertical) / B (horizontal) rails with the B.1 socket.
  - `Views.tsx` — Overview, Abilities & stats, Questions, Compare.
  - `icons.tsx` — champion / ability / item icons via the existing asset-store helpers with monogram fallbacks.
  - `atlas-cross-section.css` — scoped `.acs` styles, phone and landscape compositions, reduced motion.
- Tests: `src/lib/atlas-cross-section/crossSection.test.ts`, `src/pages/dev/atlas-cross-section/AtlasCrossSectionPage.test.tsx`, `src/App.atlasCrossSectionSecurity.test.tsx`.
- CI: `.github/workflows/atlas-cross-section.yml`.

## Semantics the owner fixed (and where they are enforced)

| Rule | Enforced in |
|---|---|
| A and B are independent; either stands alone | `query.ts` `relationshipOf` |
| B.1 is one item attached to B, only while B is a champion; B change / clear / item → B.1 cleared with a spoken reason | `query.ts` `setB`, `setB1`, `swap`, `lastInvalidation` |
| Champion level (1–18) and ability rank (1–6 or `max`) are separate facets | `query.ts` `setLevel`, `setRank`, `clampRank` |
| Topics OR, other facets AND; level/rank touch only scoped questions | `fixtureAdapter.ts` `facetMatch`, `applies` |
| A × B needs two certified premise-safe edges; no relation at all → `unsupported` | `fixtureAdapter.ts` `publicEdgeFor`, `searchFixtures` |
| B.1 questions are `related_results`, never mixed into the intersection | `fixtureAdapter.ts` |
| `answer_subject` / `unverified` edges and uncertified families never surface publicly | `fixtureAdapter.ts` `publicEdgeFor` (admin inventory only) |
| Collections access-checked from the session, not the family; `premium_exclusive` → `not_configured` | `fixtureAdapter.ts` `accessFor` |
| Facets and counts cover the full authorized population, not the page | `fixtureAdapter.ts` |
| No raw refs, answers, options or explanations in any result | `crossSection.test.ts` last case |

## Swapping in the real adapter

Done as a boundary only (ATL-CS-INT-001): `createServerWireAdapter(transport)` encodes, calls an injected transport and validates the reply, but nothing constructs it. Writing a transport and switching the page over is a separate, owner-gated change; see [ATL_CS_INT_001_HANDOFF.md](ATL_CS_INT_001_HANDOFF.md#gates-before-any-live-wiring).

## Open design choices for the owner

1. Collection default: `All relevant` opens account-only (contract's safest first step). A public catalog needs an explicit exposure policy.
2. Pagination UI: the contract's cursor is implemented in the adapter; the UI shows the first page and a count. A "load more" control is a one-line addition once the server shape is confirmed.
3. Item catalog: subjects are a fixed DEMO list. Real item identity resolution (aliases, ambiguity) is a backend concern per the contract.
4. Phone: the four view tabs sit in a fixed bottom bar; the A rail stays a left column. If the Admin shell's own bottom navigation ever overlaps it, raise `--bottom-nav-clearance`.
5. Persona preview control: owner-only convenience for reviewing states; remove before any non-owner exposure.

## Verification recipe

```
npx vitest run src/lib/atlas-cross-section src/pages/dev/atlas-cross-section src/App.atlasCrossSectionSecurity.test.tsx
npx vite build --outDir dist-atlas-cs-ci --emptyOutDir
grep -rl 'path:"/lol/dev/atlas-cross-section"' dist-atlas-cs-ci/assets   # must print nothing
```

Local preview (DEV twin): `/lol/dev/atlas-cross-section?a=champion:Ahri&b=champion:Syndra&b1=3157&view=questions&topic=mana&persona=account` and `&motion=reduce`.
