# Standalone Mastery Retirement Handoff

## Objective

Retire the legacy standalone Mastery Journey product in favor of the modern
Journey architecture without losing unique curriculum or historical learner
records.

User-facing terminology after migration:

- **Journey** — a guided League learning experience.
- **Journey Library** — the public place to discover Journeys.

Do not maintain "Mastery" and "Journey" as competing user-facing products.

## Verified architecture

### Legacy standalone Mastery

Frontend:

- `/quiz/mastery` — authenticated Mastery catalog.
- `/quiz/mastery/:masterySetId` — dedicated legacy Mastery player.
- Uses `src/features/mastery/live.ts` and the standalone Mastery APIs.

Backend:

- Published artifact registry in `mastery/publication/registry.py`.
- Standalone sessions in `mastery_sessions`.
- Per-step answers in `mastery_session_answers`.
- Own session/player/progress lifecycle.
- Historical/prototype artifacts remain registered for compatibility, but the
  actual public catalog exposes only three curricula:
  1. the default Ahri E vs Syndra E set,
  2. Olaf cooldown/mana,
  3. Summoner Spell Mastery.

### Modern Journey architecture

- Reviewed `JourneyRecipe` curriculum.
- Composed through the canonical Journey composer.
- Served as `mastery_slice`.
- Hosted by canonical Ranked match infrastructure / arena.
- Also used by Daily Challenge.
- `/quiz/journeys` is the public Journey Library.
- The modern Daily Journey recipe catalog currently contains 26 matchup
  curricula across all five roles.
- The separate Library-only approval file currently contains no additional
  recipes/approvals; it is the expansion seam, not a second content authority.

The backend explicitly retired the old static `mastery_set_id` Ranked config
shape because retaining it would preserve a duplicate content authority.

## Product decision

Treat standalone Mastery as **deprecated** and Journey Library as its
successor.

This is an upgrade/architecture migration, not two distinct products.

## Content disposition

### Ahri vs Syndra

Retire the legacy curriculum as a public Mastery destination. The modern
Journey catalog already contains Ahri vs Syndra curricula, including a level-6
variant.

No requirement to reproduce the old six questions byte-for-byte.

### Olaf cooldown/mana

Retire the legacy standalone delivery path. Preserve useful curriculum ideas
only where they belong in modern generated/Journey content.

Do not keep the legacy runtime solely to preserve this set.

### Summoner Spell Mastery

**Preservation requirement.**

This is the one legacy public curriculum without a verified equivalent in the
modern Journey catalog. Do not delete it with the old runtime.

Before final legacy API/player removal, either:

1. re-author/migrate this curriculum into an appropriate modern content
   product, or
2. establish another canonical modern home for non-matchup curricula.

Do not force it into a matchup recipe merely to complete the retirement.

## Historical data

Preserve existing `mastery_sessions` and `mastery_session_answers` as
historical learner records.

Do not rewrite old sessions as Ranked/Journey matches and do not fabricate
cross-system history.

Legacy history can later be projected read-only if product history needs it.

## Migration phases

### Phase 1 — stop competing discovery

- Journey Library becomes the sole public Journey discovery destination.
- Remove legacy Mastery entry points from navigation/discovery where any
  remain.
- Add `noindex` to legacy Mastery catalog/player surfaces.
- Keep existing legacy routes/API operational temporarily for active/historical
  compatibility.
- Do not redirect active player/session URLs until resume behavior is audited.

### Phase 2 — modern progression parity

Inventory which learner-facing concepts are still worth carrying forward:

- resume/recovery,
- attempts,
- completion,
- best/latest score,
- last played,
- recommendations / continue-learning cues.

Implement wanted concepts from canonical Journey/Ranked facts. Do not make the
new Journey Library permanently depend on legacy `mastery_sessions`.

### Phase 3 — preserve unique curriculum

Move Summoner Spell Mastery (and only other genuinely unique content found by
a final audit) onto a canonical modern content product.

### Phase 4 — route retirement

After active-session compatibility and unique-content preservation are green:

- redirect `/quiz/mastery` to `/quiz/journeys`;
- map old detail links only when a deterministic equivalent exists;
- otherwise land safely in Journey Library with clear context;
- stop creation of new standalone Mastery sessions.

### Phase 5 — infrastructure cleanup

Only after dependency search and production verification:

- remove legacy Mastery player code,
- retire unused standalone Mastery write APIs,
- remove obsolete publication/runtime machinery that has no remaining reader,
- retain historical tables/data unless a separately approved retention policy
  says otherwise.

## Explicit non-goals

- Do not change Daily Challenge gameplay.
- Do not change Journey question semantics during retirement.
- Do not delete historical learner data.
- Do not claim old Mastery history is canonical Ranked history.
- Do not keep duplicate content authority for compatibility.
- Do not delete Summoner Spell Mastery without a verified replacement.

## Desktop verification / next task

1. Run a repository-wide dependency search for every legacy Mastery frontend
   route/component/API and backend endpoint.
2. Verify whether any current navigation still links to `/quiz/mastery`.
3. Inspect production usage before disabling new session creation.
4. Determine whether active legacy sessions exist and define a compatibility
   window.
5. Design the modern home for Summoner Spell Mastery.
6. Implement Phase 1 as a small isolated change.
7. Run frontend/backend tests and production smoke checks before progressing to
   later phases.
