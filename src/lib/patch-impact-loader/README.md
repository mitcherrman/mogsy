# Patch Impact loader (PH2-C)

Lazy data substrate that turns PH2-A's immediate Riot-only analysis into a full
projection. No presentation, no new HTTP client, no change to `patch-impact/`.

```ts
const { analysis, state, canRequest, requestProjection } =
  usePatchImpactLoader({ card, change, patchVersion }); // src/hooks/usePatchImpactLoader.ts
```

| `state.status` | Meaning | `analysis` |
|---|---|---|
| `not_required` | Riot's card already projects (compound / same-card) | `projected` |
| `unavailable` + `reason` | The card alone decides; loading cannot help | PH2-A's verdict |
| `idle` | Canonical companion needed; nothing requested, **nothing fetched** | immediate `parameter_only` (`history_incomplete`) |
| `loading` | `requestProjection()` called, evidence in flight | immediate |
| `ready` | Evidence loaded, analyzer ran | enriched (may still be `parameter_only` with a domain reason) |
| `failed` + `error` | Load failed (`request_failed`, `patch_chain_malformed`, `report_malformed`, `canonical_malformed`, `analysis_failed`); `requestProjection()` retries | immediate; never a fabricated projection |

## Rules

- **Nothing loads until `requestProjection()`.** Mount, re-render and slider reads are free.
- Need-detection is PH2-A's own answer: `parameter_only` + `history_incomplete` on a no-evidence run.
- Reads go through `queryClient.fetchQuery` on the existing keys, so cached data is reused and concurrent
  callers share one request: `["patch-reports"]`, `["patch-report", version]`,
  `["league-docs","champion-base-stats"]` (all via the unchanged public accessors).
- Evidence = version list + canonical stats + P's own report (parallel), then every strictly-later report
  (parallel). Ordering is `comparePatchVersions` (numeric), never list order or string sort.
- `reconciliationByVersion` is read from the payloads: a report with no `reconciliation` block gets no
  entry. `RECONCILIATION_FAILED` is passed through; the domain owns the policy.
- Assembled evidence is cached under `["patch-impact","evidence",P]` (champion-independent, shared by every
  entry in P). A consumer sees it only after it asked itself.
- Freshness handed to `fetchQuery`: reports 30 min, canonical 1 h.
