# Mastery Set captured contract fixtures

These JSON files reproduce the SHAPE of the future backend Mastery projection
responses for the independently audited first artifact. They are generated from
`../fixtures.ts` (the single source of truth) and are asserted byte-for-shape
equal to it in `contractCompat.test.ts`.

- **Backend commit:** `ea527ee`
- **Artifact digest:** `martifact_a91f1584089d0c1d2ef4a14c35ad071bcccf5e473f6d50ebb76206870465fe90`
- **Mastery set id:** `mset_aaf6c0553e4d9339ea3295317275e116f2ef0a8f867a34302675f2dea5abc83c`

| File | Projection | Contents |
| --- | --- | --- |
| `player_questions.json` | `mastery_player_question` | Q1–Q6 safe pre-submission envelopes (no answer keys). |
| `player_reveals.json` | `mastery_player_reveal` | Q1–Q6 reveal envelopes with audited results + transitions. |
| `review_artifact.json` | `mastery_review_artifact` | One full reviewer envelope (artifact + review record). |

No backend/Python code is imported or executed to use these fixtures. When the
real backend projections land, re-capture from a live response and diff the
shape against these files.
