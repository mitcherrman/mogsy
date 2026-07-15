# Ranked Duel candidate-review — backend HTTP contract (REQUIRED)

**Status: NOT IMPLEMENTED on the backend.** The review logic exists in the
League Combat Simulator repo as a **CLI-only** module (`ranked_candidate_review/`
— `loader.py`, `store.py`, `validator.py`, `canonical.py`, `cli.py`). This
document is the contract the Mogsy frontend boundary
(`src/lib/ranked-duel-review/`) is already written against. **Owner: Claude 1
(backend) / Claude 3 (question system).**

The frontend implements no fallback and fabricates no success: until these
endpoints exist, the workspace's "Ranked Duel Review" tab shows a documented
"not available yet" state (driven by HTTP 404/501 →
`RankedDuelReviewUnavailableError`) with the current blocker (0 / 30 accepted).

**Frontend runtime is READ-ONLY for now.** `src/lib/ranked-duel-review/api.ts`
ships only the two GET probes (`list`, `progress`) so nothing in the browser
can write a decision or trigger the export before the backend API exists. The
write endpoints below (`decision`, `export`) are fully specified and typed
(`./types`), and will be added to the client once the backend ships them.

## Ground rules (must hold)

- **Storage stays separate.** These endpoints wrap the existing review store
  and `reports/ranked_candidates_accepted.json`. Do **not** fold Ranked Duel
  candidates/decisions into `quiz_builder_drafts`, `quiz_questions`, or packs.
- **Auth:** `X-Admin-Key` (the shared `KNOWLEDGE_ADMIN_KEY`), identical to the
  quiz admin surface. 401/403 on missing/invalid.
- **Backend owns all writes.** The frontend never writes review records or the
  accepted-bank file. Every decision and the export are backend commands.
- **Concurrency:** preserve `store.save()`'s concurrent-modification detection.
  Decisions carry `expected_source_hash`; a mismatch returns **409**.
- **Correctness stays private** where relevant, and the derived status
  (`store.derived_status`) is computed by the backend, never by the frontend.
- **Schema:** echo `review_schema_version` ("1.0.0").

## Endpoints

All under base `/api/admin/ranked-duel/review`.

### `GET /candidates`
Query: `status?`, `scope?`, `limit?`, `offset?`.
Returns candidates joined with current derived status:
```json
{
  "ok": true,
  "total": 123,
  "items": [
    {
      "candidate": { "candidate_id": "family:seed:formula", "family": "...",
        "question_text": "...", "options": ["..."],
        "correct_answer": { "type": "text", "value": "..." },
        "seed": "...", "metadata": { } },
      "source_hash": "<sha256 canonical.candidate_hash>",
      "status": "unreviewed|accepted|revised|rejected|stale_source_changed|orphaned",
      "record": null
    }
  ]
}
```

### `GET /progress`
```json
{ "ok": true, "total": 123,
  "counts": { "unreviewed": 0, "accepted": 0, "revised": 0, "rejected": 0,
              "stale_source_changed": 0, "orphaned": 0 } }
```

### `POST /candidates/{candidate_id}/decision`
Body:
```json
{ "decision": "accepted|revised|rejected", "reviewer": "name",
  "notes": "…", "revised_candidate": { }, "expected_source_hash": "<sha256>" }
```
Rules (from `store.apply_decision` / `validator.validate_revision`):
- `reviewer` required and non-empty; `rejected` requires non-empty `notes`.
- `revised` requires `revised_candidate`; backend runs `validate_revision`
  (fail-closed answer-value consistency, `active_for_ranked` stays false) and
  stores its `{ok, errors}` as `validation`.
- `expected_source_hash` ≠ current source hash → **409** (stale).
Returns `{ "ok": true, "record": { …store.record shape… } }`.

### `POST /export`
Validates the accepted set and writes
`reports/ranked_candidates_accepted.json` (backend-owned, atomic).
```json
{ "ok": true, "accepted_count": 42,
  "export_path": "reports/ranked_candidates_accepted.json", "errors": [] }
```
If blocking validation errors exist, return `ok: false` with `errors` and do
not write.

## Errors
`{ "detail": { "error_code": "...", "message": "..." } }` or `{ "detail": "…" }`.
- 401/403 → `RankedDuelReviewAuthError`
- 404/501 → `RankedDuelReviewUnavailableError` (endpoint absent — current state)
- 409 → `RankedDuelReviewConflictError` (stale source hash)
- other non-2xx → `RankedDuelReviewError`
