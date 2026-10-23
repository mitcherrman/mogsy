# ATL-CS-INT-001 — Cross-section frontend ⇄ `atlas_questions.v0` bridge

Status: pure, typed, fail-closed translation boundary + wire-aligned view model. **No live request exists.** The owner preview stays fixture-only.

## Baselines

| | |
|---|---|
| Frontend starting point | `atlas/cs-ux-001-cross-section` @ `3fb2153bc84ea69ab7d462b85f96436358dece43` (draft PR mogsy#129; remote head unchanged at start) |
| Frontend base of `origin/main` at start | `18abac156ba94031069f016175f2a076b71dc707` |
| Wire authority | League_Combat_Simulator draft PR #93 @ `5319bbf7c13d40a8c4d154cf2d72fc1801d3b86e` (`routes/atlas_questions.py`, `atlas_questions/{taxonomy,query}.py`, `docs/atlas/ATL_CS_BE_001_{HANDOFF.md,API_EXAMPLES.json}`) |
| Backend repo | not touched |

## Layers

```
UI (Views / Page)  ──reads──▶  view model  types.ts   (CrossSectionResponse)
                                   ▲        ▲
       fixtureAdapter.ts ──emits───┘        └── wireResponse.ts mapWireResponse()  ◀── injected transport
       (DEMO corpus, no wire)                       ▲                                      (not written)
                                      wireRequest.ts encodeSearchRequest()
                                      serverWireAdapter.ts  createServerWireAdapter(transport)
```

- `wire.ts` — constants, `AtlasWireError`, `WireRequest` / `WireHttpResponse` / `WireTransport` types.
- `wireRequest.ts` — view query → request. Throws `AtlasWireError("encode")` for anything the server would reject or the contract omits. Takes no persona / user input.
- `wireResponse.ts` — the only place the envelope is read. Allow-listed keys (unknown keys reject), closed enums, HTTP-status ⇄ access ⇄ payload consistency, answer-bearing key scan. Also `mapCoverageCatalog` for `GET /coverage` (topics).
- `serverWireAdapter.ts` — composes the above around an injected transport. No `fetch`, URL, token or env access; **nothing imports it** (a test asserts the page, views, fixture adapter and `App.tsx` do not).
- Fixture adapter and fixtures were realigned to the same view model and to server semantics.

## Mapping decisions (backend → view)

| Wire | View | Notes |
|---|---|---|
| `relationship: null\|{state,supporting_families,reason?,b_modifier?}` | `relationship: RelationEvidence\|null` | `null` = one axis. A+B alone is not evidence; `unsupported` keeps `reason`; an unsupported relation with matches is rejected. Replaces `relation: single\|pair\|unsupported`. |
| `related.b_modifier{subject,relationship,label,results,count,count_state,has_more}` | `related: RelatedPanel\|null` | Own panel, rendered even when the relation is `unsupported` (the backend example does exactly that). Replaces `related_results`. |
| `GET /coverage` `topics`; facet `label`s | `DEFAULT_TOPIC_CATALOG` (27, pinned by test) + facet labels | No `damage` / `range` / `scaling` / generic `cost`; `gold` ≠ `ability_cost`. Topic chips are the topics a response reports. |
| `access.state` `allowed\|denied\|unavailable_entitlement\|not_configured` + HTTP 401/403/503 | `Access{state,requires,reason,retryable,message}` | 401 and 403 `ACCOUNT_REQUIRED` → frontend `requires_account`; 403 `OWNER_REQUIRED` stays `denied`; 503 entitlement → `unavailable_entitlement` (retryable); unknown state / code / status fails closed. Non-allowed responses may carry **no** data; counts are `null`, never 0. |
| `coverage{state: partial\|unavailable, index_revision, indexed_at, rules_version, corpus, corpus_label, reason_codes, not_indexed_sources}` | `Coverage` | `full` is unrepresentable (and a wire `full` is rejected). `families_certified/total` removed. UI shows index revision, corpus label and not-indexed sources, plus "not every Mogzy question". |
| `applicability.{ability_rank,champion_level}{state,value}` | `RankApplicability` / `LevelApplicability` | Four states kept. Rank value is a `"1".."6"` string; `interval` ⇒ value `"max"` only; a level has no interval. Unstated / inapplicable carry `null`. No numeric bound is invented. |
| query `ability_rank` | `AbilityRank = 1..6 \| "max"` | Slot no longer narrows the bound (reducer, URL `rank=max`, "Max rank" toggle). |
| `discovery: null\|{state:"unlocked",…}` | `Discovery\|null` | `null` is "not reported", never "locked". Required in `discovered`, rejected elsewhere. |
| `source_status` `current\|inactive\|withheld\|unavailable` | `SourceStatus` | `frozen` removed; unknown value rejected. |
| `review{missed_attempts,last_missed_at}` | `Review\|null` | Distinct-question aggregation; attempt-shaped `{outcome}` rejected. Only in `premium_review`. |
| `family{id,label}`, `modes`, `difficulty`, `subjects`, `patch_context` | same | Subject roles limited to premise / comparison / scenario; an answer role is a leak and is rejected. |
| `admin{question_key,index_state,catalog_exposure}` | `AdminFacts{index_state,catalog_exposure}` | Accepted only in `admin_inventory`; **the raw `question_key` is validated then discarded** so it can never reach props, URLs, logs, analytics or storage. |
| `facets` (topics, ability_slot, ability_rank, champion_level, family, mode, difficulty) + `facet_applicability` | `Facets` / `FacetApplicability` | `ability_slots` → `ability_slot`. |
| `counts{visible_matching,count_state,unit,discoveries_*,missed_attempts_*}` | `Counts` | `unit` `question\|prompt_stem`; outside-index reasons surface as "N … are outside the indexed corpus". |
| `query.b_modifier{kind,id,label,attached_to:"b",intent}` | `BModifierEcho` | Echo is cross-checked against the encoded request (subjects, B.1, filters, patch, collection). |
| `error{code,message,field}` + status | `error: ResponseError\|null` | 400 / 503-source are "request failed", not an empty list. 429 and any undefined status throw `AtlasWireError`. |
| `page{limit,offset,has_more,next_cursor}` | `PageInfo` | Opaque cursor passed through; `has_more` ⇔ cursor. |

Behaviours realigned in the fixture adapter to match the server: B.1 **narrows** the intersection to rows whose scenario-context item is attached to B (the old fixture left results unchanged); a facet filter never matches a question that does not state the value; `patch=current` drops inactive / withheld rows; catalog counts distinct prompt stems; discovery / review / admin exist only in their own collections.

## Request rules

Parameters sent: `collection, a_kind, a_id, b_kind, b_id, b1_item_id, topic (repeated), ability_slot, ability_rank, champion_level, patch=current, cursor, limit`. `family`, `mode`, `difficulty` are valid on the wire but unused. Bounds mirror the backend (`limit` 1–50, level 1–18, rank 1–6/`max`, champion `^[A-Za-z0-9 '.&-]{1,40}$`, item `^[0-9]{1,7}$`). The catalog flag is a **server** setting; the client never enables it.

## What stays fixture-only

Everything the owner can see today: the page constructs only `createFixtureAdapter`; the `Preview as` persona and the "Premium lookup 503" button drive the fixture and are never inputs to the wire adapter. Subject sheets (stats, ability tables, icons) are DEMO data with no wire source. The fixture's coverage is explicitly labelled DEMO.

## Dependency on backend PR #93

The mapper is written against #93's committed examples at `5319bbf7`. It needs #93 merged, the `atlas_question_*` migration applied and the index built (Gate 3) before any live adapter can return data; until then `/api/atlas/questions/*` does not exist in production. No contract renames were requested; if #93 renames a field, `wireResponse.ts` is the single file to change (the strict key lists make a rename fail loudly).

## Gates before any live wiring

1. #93 merged + migration + index build (owner, Gate 3).
2. A transport written and reviewed separately (auth header from the existing session, base URL from existing config, `AbortSignal`, 429 backoff). It must not read `persona`.
3. Remove the `persona` select and the 503 simulator before any non-owner exposure.
4. Decide whether the page may call `createServerWireAdapter` behind an owner-only switch.

## Verification

```
npx vitest run src/lib/atlas-cross-section src/pages/dev/atlas-cross-section src/App.atlasCrossSectionSecurity.test.tsx src/App.atlasP1cSecurity.test.tsx src/App.atlasP1cRoute.test.ts
npx eslint src/lib/atlas-cross-section src/pages/dev/atlas-cross-section
npx tsc -p tsconfig.app.json --noEmit     # only two pre-existing errors elsewhere (OnboardingProfile, identity/connections)
```

Contract fixture: `src/lib/atlas-cross-section/__fixtures__/atlasQuestionsV0Examples.json` — copied from the backend's synthetic examples (see its `_source`); cases the examples lack (owner inventory, `max` rank, other source statuses, hostile bodies) are derived in `wire.test.ts` and labelled DERIVED.
