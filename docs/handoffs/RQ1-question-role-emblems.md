# RQ1 — Question role emblems

## Objective
Show which League role(s) a **question** applies to, as a small emblem, using
the five shipped SVGs in `public/assets/ranked/mogzy-role-icons/`. This is
separate from the player's role (mascots) and from question-family art (not
started).

## Semantics (final)
- **`roles`** — the champion is legitimately relevant to players of these
  roles, and may contribute champion-centric questions to those role-aware
  pools. This is the only eligibility and relevance fact. Broad sets are
  intentional: Brand has all five roles; Sylas, Gragas, Pantheon, Swain and
  Heimerdinger have four.
- **`primary_role`** — the champion's current strongest role. It's
  informational only (admin display, sorting, analytics, possible future
  weighting) and never gates eligibility.
- **Player role, question family, lane, play rate and portrait** are separate
  concepts. None of them feeds a question's roles.

## Authority (backend)
`ranked_public/data/champion_roles.csv` (it replaces
`champion_primary_roles.csv`), read by `ranked_public/champion_roles.py`:

```csv
champion,primary_role,roles
Diana,Mid,Jungle|Mid
Senna,Support,Bot|Support
```

- **Coverage:** 173 champions, each once.
- **`roles`:** allowed labels `Top`, `Jungle`, `Mid`, `Bot`, `Support`. There
  are no duplicates, roles are listed in that order, and `primary_role` is
  always one of them. The loader refuses anything else.
- **Role-set sizes:** 66 single, 72 dual, 29 triple, 5 four-role, 1 five-role.
- **API:**
  - `champion_roles(name)` returns the full frozenset.
  - `primary_role(name)` returns the informational role.
  - `canonical_champion`, the aliases (`Dr Mundo`, `Nunu`, `Renata`) and
    `queue_role_label` are unchanged.
- **The scalar `QuestionClassification.role` is removed.** Its only consumers
  were the RQ1 topic (now reads the full set) and the review export, whose
  `primary_role` column now takes the champion's informational primary role;
  a new `question_roles` column was added beside it.
- Backend doc: `docs/champion_roles_authority.md`.

## Evidence provenance
- **Source:** U.GG, patch 26.18, Ranked Solo, World, Emerald+.
- **Sample:** 11,859,030 champion picks, retrieved 2026-09-17.
- **Curation:** a static, curated roster. The runtime never queries U.GG, and
  the percentages are evidence rather than runtime logic (they aren't stored).
- **How the roster was built:**
  - The strongest role is always included.
  - Every role at 15% or more is included.
  - Every role from 5% to under 15% was reviewed pair by pair: 57 recommended
    INCLUDE, 16 recommended OMIT and 34 owner decisions, of which the owner
    included 32 and omitted Briar Top and Ivern Top.
  - Roles under 5% are omitted.
- **Primary-role corrections from the old file:**

  | Champion | Before | After |
  |---|---|---|
  | Senna | Bot | Support |
  | Wukong | Top | Jungle |
  | Talon | Mid | Jungle |
  | Corki | Mid | Bot |
  | Qiyana | Mid | Jungle |
  | Trundle | Jungle | Top |
  | Cho'Gath | Top | Jungle |
  | Quinn | Top | Jungle |
  | Taliyah | Jungle | Mid |
  | Diana | Jungle | Mid |
  | Yone | Mid | Top |
  | Sylas | Mid | Jungle |

- **Evidence files** (local, not committed):
  - `~/Desktop/mogzy_champion_role_current_review.{csv,md}`
  - `~/Desktop/mogzy_ugg_16_18_role_matches_raw.json`

## Question roles (how they're derived and published)
- **Single-champion family:** every role of the champion.
- **Matchup:** the union of both champions' role sets.
- **Explicit family (RBOT2 jungle families):** `FAMILY_ROLES`.
- **Global:** no roles.
- **Where the roles are frozen:** at round creation in
  `ranked_rounds.question_roles_json`. This is an additive column in
  `migrate_add_ranked_question_library`, which runs at startup.
- **Where they come from:** the served shared-bank row's `question_key` family
  plus the metadata `champion` / `champion_name`, via
  `publishable_question_roles`. They never come from media, `icon_hint`, the
  prompt, the category or a player's role.
- **Wire form:** `topic.roles` reads the column and publishes ordered wire ids
  `top`, `jungle`, `mid`, `adc`, `support`.
- **Answer safety:** `ANSWER_IS_CHAMPION_FAMILIES` (`ability_recognition`) is
  still classified for relevance, but never publishes roles.
- **Older rounds:** rows created before the column existed publish `[]`.

## Question-family coverage (Ranked-served)
| Family / source | Champion semantic source | Role classified? | Hidden-answer risk | Result |
|---|---|---|---|---|
| `combat_cooldown` | metadata `champion` | Yes, full set | None (prompt names the champion) | Published |
| `ability_cost_rank` | metadata `champion_name` | Yes, full set | None (prompt names the champion) | Published (new; had no media before) |
| Jungle families (`camp_respawn`, `jungle_*`) | the family itself | Yes, Jungle | None | Published |
| Item / objective / summoner-spell / environment families | none (not champion-centric) | Global | n/a | `[]` |
| `ability_recognition` (not in Ranked pools today) | metadata `champion` | Yes, for relevance | **Champion is the answer** | Withheld |
| `ability_cooldown_*`, `casts_before_oom`, `champion_*` (single-champion families, not in Ranked pools today) | metadata `champion`/`champion_name` | Yes | None | Published if a pool admits them |
| Mastery slices (`mastery:`) | admin-fixed slice champion, not a family contract | No | n/a | `[]` (follow-up) |
| Meta Reflex, accepted-candidate `ranked:` bank, placeholder bank | no structured champion field | No | n/a | `[]` |

## Scheduler behaviour (RBOT2, unchanged)
- **Preference, not a silo.** About half of a match's shared-bank quiz slots
  target role-relevant content (`ROLE_RELEVANT_SHARE = 0.5`); the rest target
  global content.
- **Fallback chain:** role → the match's other roles → global → whole pool.
  Nothing disappears.
- **Membership:** a champion question is in the bucket of **every** role in
  its set, so flex champions now reach more role buckets. Global questions
  and the jungle families are unchanged.
- **Unresolved champion questions** (unknown name) sit in no role bucket and
  are reachable only through the whole-pool fallback, the same as before.

## Frontend
- **Unchanged:** lobby role-stage emblem (replaced the champion medallion),
  live card emblems left of the category (cinematic header and compact band),
  timeline corner marker, persistence through the reveal.
- **Multi-role fix:** a timeline cluster tucks harder as roles multiply, so
  it stays inside the 36px plate: 3 roles → 27px, 4 → 32px, 5 → 31px. The
  accessible label lists roles naturally ("Top, Jungle, Mid, ADC and Support
  question").
- **Card:** up to five 17px tiles on the same 15px row. Browser-checked at
  1440×900 with 4 and 5 roles: no page scroll, prompt unmoved.

## Files
- **Backend:**
  - `ranked_public/champion_roles.py`, `data/champion_roles.csv`
  - `topic.py`, `shared_bank.py`, `persistence.py`, `service.py`
  - `ranked_duel_gameplay.py` (`QuestionRecord.question_roles`), `ranked_duel_question_bank.py`
  - `migrate_add_ranked_question_library.py`, `quiz/review_export.py`
  - `docs/champion_roles_authority.md`
  - tests: `test_rq1_multi_role_authority.py`, `test_mogzy_ranked_roles.py`, `test_rbot2_role_aware_ranked.py`, `test_rg2_public_category.py`
- **Frontend:**
  - `src/components/ranked-arena/RoleEmblem.tsx`, `RoundTimeline.tsx`
  - `RoleEmblem.rq1.test.tsx`
  - The first pass also touched `timelineNodeModel.ts`, `viewTypes.ts`,
    `adaptToViews.ts`, `InteractiveScenarioSurface.tsx`,
    `CompactScenarioBand.tsx`, `RankedClassCarousel.tsx` and
    `RankedShellProbe.tsx` (`?qroles=`).

## Tests
- **Backend:**
  - 19 new authority/publication tests; the RBOT2, RG2, library and role
    suites all pass.
  - Across the broad Ranked/QUIZ1 selection (3,044 tests), the failure set is
    identical to clean `master`. The failures that exist in this environment
    are all pre-existing.
- **Frontend:**
  - The RQ1 suite covers 3-, 4- and 5-role card and timeline cases.
  - The focused Ranked card, timeline, geometry and carousel suites pass.

## Next tasks
- **Future weighting (not implemented; no multipliers chosen):**
  selected-role relevance may later increase how often a question is served,
  but non-selected-role and global content must stay non-zero to preserve
  variety. `primary_role` is available as an input if that weighting wants
  it.
- **Post-match review:** role data already reaches `ReviewRound.topic.roles`.
  The shared `components/game-results` model (`ResultTimelineEntry`) needs an
  optional roles field before an emblem can sit beside each module title.
- **Mastery slices:** give slices a semantic champion field so they can
  publish roles.
- **Roster refresh:** re-review the curated roster against a later patch. Use
  the same source and filter, and have the owner review the 5–15% band.
