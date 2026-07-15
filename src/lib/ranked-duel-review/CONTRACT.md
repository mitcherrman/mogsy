# Ranked Duel candidate-review — frontend integration notes

**Status: LIVE.** The backend admin API is implemented, audited (Claude 4 → GO),
committed, and pushed. The authoritative contract lives in the backend repo at
`ranked_candidate_review/ADMIN_API_CONTRACT.md`; this file is only the frontend
integration summary. `src/lib/ranked-duel-review/api.ts` implements the client
and `RankedDuelReviewPanel.tsx` the workspace.

## Endpoints (all `X-Admin-Key`, base `/api/admin/ranked-duel/questions`)

| Method | Path | Client |
|---|---|---|
| GET  | `/status` | `rankedReviewApi.status()` |
| GET  | `/candidates` (`decision,family,difficulty,stale,exportable,search`) | `listCandidates()` |
| GET  | `/candidates/{id}` | `getCandidate()` — the ONLY response exposing the correct answer/index |
| POST | `/candidates/{id}/accept` | `accept()` |
| POST | `/candidates/{id}/reject` (`reason` required) | `reject()` |
| POST | `/candidates/{id}/revise` (editable-field `patch`) | `revise()` |
| POST | `/validate` | `validate()` — read-only diagnostics |
| POST | `/export` | `export()` — explicit atomic write of `ranked_candidates_accepted.json` |

## Invariants the frontend upholds

- Every mutation carries the candidate's `source_hash` (optimistic concurrency)
  and a non-empty `reviewer`. Staleness is checked server-side **before** the
  overwrite conflict; a `409 stale_candidate` prompts a reload, a
  `409 decision_conflict` surfaces the overwrite toggle.
- Replacing any non-`unreviewed` decision requires explicit `overwrite=true`.
- Revision `patch` may contain ONLY: `question_text`, `options`,
  `correct_answer`, `difficulty_target`, `distractor_derivations`,
  `review_note` (server rejects anything else; a numeric correct-answer change
  is fail-closed).
- Reads never mutate; there is no bulk/auto acceptance; the correct answer/index
  is shown only in candidate detail, never in list summaries.
- Export is an explicit, confirmed action; the frontend never writes files.

## Error mapping (`{detail:{error_code,message}}` → `ReviewApiError.kind`)

`401/403 → auth` · `404 → not_found` · `400 → invalid_request` ·
`409 stale_candidate → stale` · `409 decision_conflict → conflict` ·
`422 invalid_revision → invalid_revision` · `5xx → server` (sanitized).

Note: the shared admin dependency returns the repo-standard **403** on a
missing/invalid key (the backend doc says 401); the client treats both as auth.
