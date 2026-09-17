# RQ1 — Question role emblems (first pass)

## Objective
Show which League role(s) a **question** applies to, as a small emblem, using
the five shipped SVGs in `public/assets/ranked/mogzy-role-icons/`. This is
separate from the player's role (mascots) and from question-family art (not
started).

## Decisions
- **Authority is the backend.** Ranked's `topic` block gains `roles: string[]`
  (canonical wire ids, `adc` not `bot`). The frontend reads it and never
  derives a role from the player's role, the prompt or the category.
- **Champion → role comes from the existing authority.**
  `ranked_public/champion_roles.py` (`champion_primary_roles.csv`, 173
  champions, one primary role each) through its own `classify_question`
  family gate (`SINGLE_CHAMPION_FAMILIES`). No new table.
- **Disclosure-safe:** the champion is taken only from `topic.icon_hint`, which
  names a champion the round already shows before the reveal. If the champion
  is the answer, the sanitizer has already stripped that subject, so no role
  is published.
- **Multi-role:** it is a list end to end. The current authority has one
  primary role per champion, so today every list is `[]` or one role.
- **No authored role metadata exists** for environment, lane or jungle
  generators. `minion_xp_level_breakpoint` has a `lane`, but a lane is not a
  role (bot lane is both ADC and Support), so it is not mapped.
- `adc` → `bot.svg` lives only in `RoleEmblem.ROLE_EMBLEM_SRC`.
- On the parchment folio, card emblems sit on a 17px navy tile with a −1px
  block margin. The art is gold on a faint white map and needs a dark ground.
  The row stays 15px tall.
- The reserved scalar `TimelineNode.tag` is superseded by `topic.roles` and
  stays `null`.
- `Sigil` in `roleIdentity.tsx` is reduced to the neutral crossed-blades mark.
  Its per-role branches could never run.

## Relevant files
Backend (`League_Combat_Simulator`):
- `ranked_public/topic.py` (`roles_for_round`)
- tests: `test_rg2_public_category.py`, `test_ranked_question_library.py`, `test_rg2_daily_timeline.py`

Frontend (`mogsy`):
- `src/components/ranked-arena/RoleEmblem.tsx` (`RoleEmblem`, `QuestionRoleEmblems`)
- `src/components/quiz/timeline/timelineNodeModel.ts` (`TimelineTopic.roles`, `readQuestionRoles`)
- `src/lib/ranked-core/viewTypes.ts`, `adapters/adaptToViews.ts` (`QuestionView.roles`)
- `src/components/question-surface/InteractiveScenarioSurface.tsx`, `CompactScenarioBand.tsx` (live card)
- `src/components/ranked-arena/RoundTimeline.tsx` (corner marker + label)
- `src/components/quiz/RankedClassCarousel.tsx` (lobby role stage; the champion medallion is replaced)
- `src/lib/ranked-public/roleChampions.ts` (deleted; it had no remaining consumer)
- `src/pages/dev/ranked-shell-probe/RankedShellProbe.tsx` (`?qroles=` probe param)
- `src/components/ranked-arena/RoleEmblem.rq1.test.tsx`

## Placement reconciliation
The brief described "role-picker tiles with a champion icon top-right". On
current main, the only champion icon in any role picker was the
`ranked-class-champion` medallion on the lobby carousel stage. It showed one
medallion for the role on stage, at the top-right of the stage. It is now
`ranked-class-role-emblem`, in the same slot and at the same size. The R1
`RankedRolePicker` tiles (name + blurb) have no icon and are not mounted
anywhere, so they are unchanged.

## State: complete (first pass)
- Backend `topic.roles` added (live projection and match review share it).
- Lobby stage emblem, live card emblem(s) left of the category (cinematic
  header and compact band), and timeline corner marker are all in place.
- Tests:
  - backend: 48 focused tests pass.
  - frontend: RQ1 suite has 14 tests; the focused Ranked, lobby and timeline
    suites are green, except one `Quiz.rankedRole` Practice test that also
    fails on clean main.
- Browser, via `/dev/ranked-shell-probe?qroles=` and `/dev/lobby-preview`:
  - `e2e/ranked-arena-fit.spec.ts` passed, and so did a copy serving two role
    emblems on every question shape, 346/346 total.
  - With emblems the metadata row is still 15px, the prompt did not move, and
    the page does not scroll.

## Next task
- **Post-match review:** role data already reaches `ReviewRound.topic.roles`.
  The review UI renders through the shared `components/game-results` model
  (`ResultTimelineEntry`), which needs an optional roles field before an
  emblem can sit beside each module title. This was left out to keep the pass
  narrow.
- **Coverage:** only `combat_cooldown` rounds currently freeze a champion
  subject, so only they publish roles. `ability_cooldown_rank` and
  `ability_cost_rank` (served by Ranked) have no presentation subject. Once
  they freeze one, their roles appear with no further code.
- Mastery slices (`mastery:` refs) publish no role; they would need their own
  authored champion subject.
