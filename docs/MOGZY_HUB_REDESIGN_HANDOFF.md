# Mogzy Hub Redesign — Post-LIVE1 IA + Layout Design Prep

<!-- Revision 27 (Step 4 — the Bulletin carousel) is at the top of this file.
     Revision 26 was the visual QA pass and the guest 403 fix, Revision 25
     shipped Step 3, Revision 24 was the recomposition, Revision 23 the
     specification, Revision 22 the preservation audit.
     Revision 21 was WHATSNEW2 — Academy Updates become admin-managed.
     Revision 20 was WHATSNEW1, which built the surface;
     19 the Commons visual polish; 18 the painted Commons; 17 the two-screen
     Academy; 16 the Mogzy Premium promotion module; 15 the below-the-fold
     rework. -->

## Revision 2026-09-07 — STEP 4: THE ACADEMY BULLETIN CAROUSEL — **SHIPPED**

**Commit:** `f275ed62` — `feat(hub): the Academy Bulletin rotates over four production-backed families`
**Pushed:** `bb35a24f..f275ed62`, clean fast-forward, no force.
**Mount geometry:** unchanged. The board is still `.5840 / .2520 / .2440 /
.2440`, no other Commons mount moved, and the plinth and Screen 1 have no diff.

### 1. Implemented families

Every one reads a source that already serves production. No new backend, no
CMS, no feed, no fixture.

| Family | Source | What it claims |
|---|---|---|
| **personal** | `useRankedMatchHistory(5, { enabled: isIdentified })` | the outcome, rating delta, opponent and date **the row itself carries** |
| **quiz** | `quizApi.categoryQuestions("Champion Ability Cooldowns", 1)` | the live question, verbatim |
| **mechanics** | `fetchTablesIndex()` — the Mechanics Explorer's own index, on the **same React Query key**, so the two share one cache | a published study table's title, subtitle, patch and row count |
| **proplay** | none needed | nothing — it is an invitation to `/lol/pro-play` |

**No answer can reach the board.** `GET /api/quiz/questions` returns
`question_text` and shuffled `choices` and *no* correct answer — the answer
exists only in the response to `submitAnswer` — so a prompt card physically
cannot leak one. The choices are dropped in the hook as well: the board asks,
the quiz answers. A test walks every notice and asserts no choice string is
ever printed.

**No manufactured significance.** The personal family renders only on a real
completed Ranked match. A null `ratingDelta` prints nothing rather than a zero;
a bot opponent is called a bot rather than implied to be a person; a loss is
reported as a loss. A guest, an anonymous session, an identified account with
no matches, and a backend that will not answer all produce **no personal
notice at all**.

### 2. Deferred families, and why

| Family | Why not |
|---|---|
| **Patch** | Screen 1's Broadcast already renders the Patch Brief from `usePatchBriefFeed`. The same transmission twice on one page is not a bulletin. The mechanics notice names the patch its tables are verified through, which is patch-adjacent and is not that transmission. Revisit only with a genuinely distinct projection. |
| **Pro Play statistics** | Confirmed again: `src/lib/pro-play/api.ts` exposes only `startProPlayQuiz` and `answerProPlayQuestion`. Questions are generated at request time and there is no read-only stats endpoint, so a stats card would have to invent its numbers. The invitation ships instead. |
| **Aggregate / community activity** | No activity-feed table and no aggregate endpoint exist. Needs backend; out of scope. |
| **General League / esports news** | LIVE1 serves match data, not editorial. No news source exists and none is proposed. |

### 3. Geometry — solved before any content was wired

The painted board is about **339 x 191 CSS pixels at 1024x781**. Navigation had
to cost no height, so:

* **Prev/next sit on the paper's own left and right margins**, vertically
  centred, outside the text column. They take horizontal space the copy was
  not using.
* **The position dots share the CTA's row**, in the space beside it.
* **Title and body are clamped**, which is what lets any family be pinned to
  this board without measuring each one first.

There is deliberately **no navigation row**. A row would have cost ~30px of a
191px board — a line of body copy on every card, forever.

**Two corrections came from looking at it, not from the numbers:**

1. The clamp split went **3 lines of title / 2 of body**, not 2/3. At 2/3 a real
   question truncated mid-word — *"cooldown of Malphite R…"* — and a question
   you cannot finish reading is not a question. The headline IS the card for
   that family. The stack is one line shorter overall, not longer, and the
   board's title is set at 20u rather than 24u to hold three lines.
2. The text inset grew from 22u to 27u and the chevrons shrank. At 22u they sat
   hard against the body's first line and read as part of the sentence.

A third, smaller one came from the measurements: the foot's padding dropped
from 11u to 7u after the densest real card — a two-line question plus a meta
line plus the CTA at 1024x781 — put the CTA **one pixel** past the board's
bottom edge.

### 4. Behaviour

* **One item at a time**, crossfade only. Paper pinned to a board does not
  slide sideways.
* **Twelve seconds.** Long enough to read a short notice, far too slow to read
  as a slideshow.
* **Stops** on hover, on focus within the board, while the tab is hidden, while
  the Commons is not the room on screen, and **permanently** once the reader
  presses prev or next. Taking manual control is a statement that they are
  reading, so autoplay does not take it back.
* The in-view check reuses `hub-commons-in-view`, which `LolHub`'s existing
  settle observer already sets — no second observer.
* **Reduced motion** — the OS query *or* the app's own `html.reduce-motion` —
  disables autoplay entirely and drops the crossfade. Manual navigation still
  works: the reader loses the movement, never the capability.
* **A board is never empty.** The Pro Play invitation needs no data and is
  always last. On a single-notice board the arrows and dots are **absent**
  rather than present-and-disabled.

**Accessibility.** Both controls carry real labels ("Previous notice", "Next
notice"), are in the tab order, keep focus while the notice changes under them,
and have explicit focus rings. The board is **deliberately not a live region** —
an auto-advancing region announces itself over a screen-reader user every
twelve seconds, which is the standard failure of an announced carousel. That
also preserves the hub's existing "no live region anywhere" assertion.

### 5. Deterministic selection

Two component props, no product surface, no URL parameter, no demo mode:

* `initialNoticeId` pins the board to one notice.
* `autoRotate={false}` holds it still without pinning it.

The pin is **derived on every render, never latched into state** — the board
grows as its families answer, so an index captured once points at the wrong
notice a tick later. That bug was caught by the tests. An id the board does not
carry resolves to -1 and the board behaves normally, so a stale marketing
script cannot blank it.

### 6. Ordering

`personal → quiz → mechanics → proplay`. What the reader did, then what they
can do, then what is true in general, then an invitation. A family that is
still loading is absent rather than a skeleton — the board grows as answers
arrive, and a reader never sees a placeholder pinned to a noticeboard.

### 7. Verification

| Check | Result |
|---|---|
| lol / hub / community / quiz-ranked | **688 passed**, 49 files (was 374/21 — +29 Bulletin tests) |
| Lint | **0 errors**; 2 warnings, both in `AcademyBroadcastSurface.tsx`, untouched |
| Build | green |
| Typecheck | **11 errors, none in changed files** — the standing baseline |
| Pre-existing failures | `Quiz.rankedRole.test.tsx` (`ranked-class-champion`) and `LeaguecraftWorkspace.test.tsx` (`'3w ago'`) — **both confirmed identical at clean HEAD** by stashing and re-running |

**Playwright geometry sweep** — 1024x781, 1280x800, 1440x900, flow (390x844)
and large text, for each of the three impersonal families, driven through the
real next control:

* CTA inside the board: **true everywhere**. Title inside: true everywhere.
* Arrows and dots: inside the board, overlapping **nothing** — not the title,
  not the CTA.
* No horizontal clipping anywhere; no page overflow in flow or large text.
* Slack below the CTA after the fixes: **+14px** at the tightest case
  (1024x781, quiz), up to +42px.
* Large text correctly abandons stage mode and stacks in flow.

A note on the environment: `.env.local` points the dev server at
`127.0.0.1:8010`, which is not running, so a plain local run shows **only the
Pro Play notice** — the fallback working exactly as designed. The sweep used a
throwaway server pointed at the production API to see the real families.

### 8. Next task

**Recommendation: enrich the Bulletin from sources Mogzy already has, before
the wood gutters.**

The reasons are concrete rather than aesthetic. The board is now a shape with
four occupants and three of them are one-notice-deep: the quiz family always
draws from a single hard-coded category, the mechanics family always shows the
first study table of the first category, and the personal family reads one row.
Rotation therefore looks repetitive on a second visit even though the machinery
is right. Widening it is cheap and needs no new backend:

* rotate the quiz prompt across the six real subjects in
  `PRACTICE_CATEGORY_SOURCES` instead of one;
* pick a study table from anywhere in the mechanics index, not `[0][0]`;
* add a second personal projection — a streak or an Academy tier change — from
  `deriveProfileStats`, which the Record already reads.

The gutters are a self-contained visual pass that neither blocks nor is blocked
by this, and they will look better against a board that is finished. Timmy/demo
population stays last, after the real experience is complete — and the
`initialNoticeId` prop this revision added is the hook it will use.

---

## Revision 2026-09-07 — VISUAL QA PASS + GUEST 403 FIX — **SHIPPED**

**Commit:** `155c3a89` — `fix(hub): stop the guest Ranked 403, and three defects visual QA found`
**Pushed:** `c52182e8..155c3a89`, clean fast-forward, no force.
**Production:** deployed and verified — bundle `index-BDRSQ9we.js`. See §4b.
**Screenshot capture finally worked** — Playwright, driven directly against the
dev server, produced real images of the room. The Browser pane still returns a
black frame; that limitation is the pane's, not the site's.

Four corrections. One was the known 403; **three were defects nobody could
have found without looking at the room**, which is the whole argument for
doing this pass before the carousel.

### 1. The guest Ranked 403 — fixed

`useRankedProgression` gains an `enabled` option. `enabled: false` resolves
straight to `unavailable` — the same outcome the 403 produced — without making
the request. `AcademyRecord` passes `enabled: isIdentified`.

What is deliberately preserved:

- **Authenticated behaviour is untouched.** A real account still fetches, and a
  real 401/403/429/500 still travels the normal path to `unavailable`. The
  switch only covers the case the caller can prove in advance.
- **Fail-closed is unchanged** — a disabled read is `unavailable`, never a
  permanent `loading`, and never a guessed rank.
- **Real errors are not hidden.** Nothing is swallowed; one question that could
  not have an answer simply stops being asked.
- **Every existing caller is unchanged** — the option defaults to `true`, so
  `Quiz.tsx` behaves exactly as before.

Coverage: 4 new hook tests (no request when disabled; never parks in loading;
fetches on becoming enabled without a remount; omitting the option keeps the
old behaviour) and 2 new Record tests (guest and anonymous both pass
`enabled: false`; an identified account passes `true`, so the fix cannot
silence real users).

### 2. Three defects the pictures found

| # | Defect | Cause | Fix |
|---|---|---|---|
| 2 | **The supporting slips had no padding in stage mode.** Both sheets rendered flush to their box edges; the Community eyebrow sat on the painted wooden frame rather than on the paper. | The shared mount rule sets `padding: 0` at three classes of specificity, which silently beat the two-class `.academy-commons-support` declaration. A specificity accident, invisible to every test. | The inset moved onto the mount rules themselves. Measured after: 10–11px on every edge of both sheets at the tightest gate. |
| 3 | **A ~150px void in the empty Record.** | `mt-auto` pinned the actions to the foot of the frame. That reads correctly only once the register fills the middle — and the empty state is what every guest and logged-out visitor sees, i.e. the most common view of the page. | `mt-auto` dropped; the body centres as one group in both states. |
| 4 | **The Record's title repeated its own band.** With no display name the title read "The Academy Record" directly beneath a band engraved ACADEMY RECORD. | The fallback was written for the panel, not for the reader. | The title is the person. A nameless reader is now addressed the way Screen 1 already addresses them. |

### 3. Visual QA findings, against Revision 24 §7

| Risk | Verdict |
|---|---|
| 1. Utility strip on bare counter top | **Resolved.** It reads as four inscriptions on the wooden counter, under the frame and clear of the rail. The most-doubted decision in the pass is the one that came out best. |
| 2. Record register density | **Resolved by measurement.** The fully-populated register — six lines, tier bar, both actions — fits the painted frame with **zero overflow** at 1024×781 (body scrollHeight 324 = clientHeight 324), clearing the CTA by 26px. The real density problem was the opposite of the one predicted: emptiness, not crowding. Fixed as defect 3. |
| 3. Seal with a real avatar | **Still unverified.** Geometry is exact — rendered centre y=244 against the artwork's medallion centre y=244, zero drift, and the fallback mark sits correctly in the laurel ring — but no session here has a profile avatar, so a real image clipped into that ring has never been seen. |
| 4. Slips at the smallest gate | **Acceptable, after the padding fix.** At 1024×781 "Academy Membership" and "Discord — opening soon" each wrap to two lines. Nothing is clipped and nothing touches a pin. Tight, honest, readable. |
| 5. Premium's quiet ink CTA | **Reads correctly.** It is clearly an action and clearly subordinate to the two gilt CTAs above it. Hierarchy holds. |
| 6. Bulletin balance | **Fine.** The board carries eyebrow, headline, three lines and one gilt CTA, and does not read as under-filled. |
| — | **The room is not a dashboard.** It reads as a room: a credential in the gilt frame, a notice on the board, two slips pinned below, inscriptions on the counter, the rail at the foot. |

Viewports verified: **1440×900, 1280×800, 1024×781** (one pixel above the stage
gate), **390×844 flow**, and **large-text**, which correctly abandons stage mode
(`position: relative`, `scroll-snap-type: none`), stacks in flow order and
restores every utility link to the full 44px. No overlaps at any size. No
horizontal overflow at any size.

### 4. Verification

| Check | Result |
|---|---|
| lol / hub / community / progression tests | **374 passed**, 21 files (was 360/20 — +14 new) |
| Lint | clean |
| Build | green, 53s |
| Typecheck | **11 errors, none in changed files** — the standing baseline |
| `Quiz.rankedRole.test.tsx` | 1 failure, **`ranked-class-champion` on `/quiz`** — confirmed **identical at clean HEAD** by stashing and re-running. Pre-existing, unrelated to the Commons, part of the repo's known baseline. Failure sets compared, not totals. |

Screen 1, the artwork and the legal plinth: **no diff at all**.

### 4b. Production — deployed and smoke-checked

Deploy fired: `index-CebjhgD1.js` → **`index-BDRSQ9we.js`**. Re-checked live at
1440x900.

| Check | Live result |
|---|---|
| Screen 1 loads | ✅ |
| Scroll to Screen 2 | ✅ settles at 0; snap `y mandatory` |
| Hall ↔ Commons controls | ✅ both hints reveal (opacity 1) and both controls navigate; "Back to the Hall" is focusable |
| Academy Record | ✅ `empty`, title now reads **"Summoner"** — the duplication fix is live |
| Academy Bulletin | ✅ CTA → `/lol/mechanics` |
| Premium mount | ✅ `promo`, CTA → `/lol/premium`, **12px inset** — the padding fix is live |
| Community mount | ✅ Discord pending, **11px inset** |
| Utility strip | ✅ all four routes; clears the rail by 30px |
| Legal set | ✅ `/privacy` `/terms` `/security`, "© 2026 Mogzy.", disclaimer **297 chars — unchanged** |
| Seal | ✅ centre y=244 against medallion y=244, **zero drift** |
| Horizontal overflow | ✅ none |
| **`/api/ranked/progression`** | ✅ **not requested at all** for an anonymous visitor |
| Console | only the two pre-existing errors (`403 /api/stat-check/invites`, `404 /rest/v1/funnel_events`). **The guest 403 is gone.** |

**A testing-environment note worth keeping.** The Browser pane cannot perform
`scrollIntoView({behavior: "smooth"})` — `behavior: "auto"` scrolls fine, but
smooth is a no-op. Since `hubScrollTo` uses smooth, *both* navigation controls
appear dead in the pane, including the Hall's descend control, which no part of
this workstream has ever touched. Real Chromium via Playwright shows both
working correctly against production. Do not diagnose hub navigation in the
Browser pane; it will report a failure that is not there. This is the second
pane limitation this workstream has hit, after the black screenshots.

### 5. Outstanding

- **The avatar in the seal** (risk 3) — the one thing still unseen. It needs a
  session with a profile picture; it is a clipping/`object-fit` question, not a
  layout one.
- Two pre-existing production console errors (`403 /api/stat-check/invites`,
  `404 …/funnel_events`) predate this workstream and remain.
- The gap between the band's eyebrow and the Record's title is a little open at
  the top of the frame. Judged aesthetic preference, not a defect, and
  deliberately not changed — this pass corrected only what the pictures proved.

### 6. Next task, and the carousel question

**Yes — the physical composition is stable enough to begin the Academy
Bulletin carousel.**

The grounds, rather than the assertion: every mount is verified at four
viewports plus large text with no overlaps and no overflow; the seal tracks the
painted medallion exactly; the largest content the Record can ever hold already
fits its frame; flow mode and stage mode both hold; and the four defects this
pass found were all in *content and inset*, none in the mount geometry. The
fractions are the expensive part and they are proven.

Two conditions for Step 4:

1. **The Bulletin's mount is the constraint to design to.** Its box is fixed by
   the painting (.5840/.2520/.2440/.2440). Every card family must fit an
   eyebrow, a headline, ~3 lines and one CTA in that box at 1024×781 — the
   Record's density check is the precedent, and it should be run per family
   before the family ships.
2. **Prev/next controls need a home inside that box**, and the box has no spare
   room at the smallest gate. Settle that geometry first; it is the one open
   layout question the carousel introduces.

Timmy/demo population and the gutter wood framing both remain after Step 4.

---

## Revision 2026-09-07 — STEP 3 **COMMITTED, PUSHED, DEPLOYED AND LIVE-VERIFIED ON mogzy.lol**

**Commit:** `640bb0b3` — `feat(hub): redesign the Academy Commons around the Academy Record`
**Branch:** `main` → pushed `046116b7..640bb0b3`, clean fast-forward, no force.
**Production:** **LIVE and verified** on mogzy.lol, bundle
`index-CHF93u9d.js` → `index-BTLe2UvJ.js`. See §5 and §6.

### 1. Pre-commit scope check

Twelve files, all intended, nothing unrelated in the worktree:

```
M docs/MOGZY_HUB_REDESIGN_HANDOFF.md      A src/components/lol/AcademyBulletin.test.tsx
M src/components/lol/AcademyCommons.tsx   A src/components/lol/AcademyBulletin.tsx
M src/components/lol/HubCommunitySection.tsx  A src/components/lol/AcademyRecord.test.tsx
M src/components/lol/HubPremiumPanel.test.tsx A src/components/lol/AcademyRecord.tsx
M src/components/lol/HubPremiumPanel.tsx
M src/components/lol/HubUtilitySection.tsx
M src/index.css
M src/pages/LolHub.test.tsx
```

Verified before staging:

- **Screen 1 untouched** — `src/pages/LolHub.tsx` has no diff at all. Nor does
  `src/components/Footer.tsx`, nor anything under `src/academy/`.
- **Legal plinth unchanged** — no diff line in `AcademyCommons.tsx` touches
  `LEGAL_LINKS`, Privacy/Terms/Security, the copyright line, the Riot
  disclaimer or `.academy-commons-plinth`; no diff line in `index.css`
  mentions `plinth`.
- **`index.css` diff is confined to lines 9024–9368**, the stage-mode mount
  block only. The plinth's own rules sit after it, untouched.
- Files were staged by explicit path, never `git add -A`.

One comment correction was made before committing: `AcademyCommons.tsx`'s
mount table still described the utility strip as "cut into the panelling above
the rail", which Revision 24 §5 had already superseded. It now says the counter
top, matching `index.css`. Comment only — no behaviour, no design change.

### 2. A concurrent advance, and why it was safe

Local `main` had moved from `3d914096` (Revision 24's base) to `046116b7`
while this work was in the tree — **19 commits** from the pro-play, CON1 and
PT1.9 workstreams, in the shared checkout. Checked before committing:

- **Zero overlap.** None of those 19 commits touches any of the 12 files here.
- They *did* touch `src/lib/quiz/api.ts`, which `AcademyRecord` imports from.
  The full verification below was re-run **after** the tree was already at
  `046116b7`, so it validates this work against the merged state, not the old
  base.
- `git status --short` showed only this workstream's files, so no other
  session had uncommitted work in the shared checkout at commit time.

### 3. Verification (re-run on the new base, at commit)

| Check | Result | Rev 24 baseline |
|---|---|---|
| lol / hub / community tests | **360 passed**, 20 files | 360 passed |
| Profile-side tests | **45 passed**, 4 files | 45 passed |
| Lint (all 10 changed/added files) | **clean**, exit 0 | clean |
| Build (`vite build --mode development`) | **green**, 18s | green |
| Typecheck | **11 errors, none in changed files** | 11, pre-existing |

The 11 typecheck errors are the repo's standing pre-existing set (AdminBots,
LeaguecraftWorkspace, admin-users, team-sim, social-result, diagnostics,
ComboPlanner). Not regressions.

### 4. Push

```
git fetch origin           → 1 ahead, 0 behind
git merge-base --is-ancestor origin/main HEAD → YES (clean fast-forward)
git push origin main       → 046116b7..640bb0b3  main -> main
```

`origin/main` re-fetched and confirmed at `640bb0b3`. No force, no
force-with-lease, no rebase needed.

### 5. Deployment — FIRED AND CONFIRMED

The push does not itself deploy: this repo has no `.github/workflows`, no
`vercel.json`, no `netlify.toml` and no CI, and mogzy.lol publishes from
Lovable. Immediately after the push, production still served the old bundle
`index-CHF93u9d.js` and the pre-redesign Screen 2, so this was recorded as
blocked on the owner's Publish.

**A deploy then fired.** A watcher polling the production bundle hash caught
the change: `index-CHF93u9d.js` → **`index-BTLe2UvJ.js`**, now serving this
commit. The gate is real and still owner-owned — it simply resolved within the
session.

### 6. Production smoke check — POST-DEPLOY, PASSED

Read-only against the live build at 1440×900. Nothing on the site was changed.

| Check | Result |
|---|---|
| Screen 1 loads | ✅ `[data-hub-screen="hall"]` present |
| Scroll to Screen 2 | ✅ settles at `top: 0`; snap armed (`y mandatory`) |
| Academy Record | ✅ present, `data-record-state="empty"` (guest — correct) |
| Academy Bulletin | ✅ present, CTA → `/lol/mechanics` |
| Premium supporting mount | ✅ present, `data-premium-state="promo"`, CTA → `/lol/premium` |
| Community supporting mount | ✅ present, Discord renders the pending state |
| Feedback / Bug / About / Contact | ✅ `/feedback`, `/feedback?intent=bug`, `/about`, `/contact` |
| Privacy / Terms / Security | ✅ unchanged |
| © line and Riot disclaimer | ✅ "© 2026 Mogzy."; disclaimer 297 characters — **byte-identical to the pre-deploy baseline** |
| Fatal layout / runtime errors | ✅ none |

Live stage-mode geometry, measured in production:

- **The seal lands exactly on the painted medallion**: rendered centre y=244,
  the artwork's medallion centre y=244. Zero drift.
- Utility strip clears the walnut rail by **30px** and the Premium sheet by
  **64px**.
- No horizontal overflow. The Commons artwork loaded 200.
- Mounts: Record 342×464 at (352,194); Bulletin 397×231 at (851,221); Premium
  165×144; Community 182×144.

**Console — one new entry, by design, and one to tidy.** Three failing
requests on the live hub:

| Request | Verdict |
|---|---|
| `403 /api/stat-check/invites` | pre-existing, unrelated |
| `404 supabase …/funnel_events` | pre-existing, unrelated |
| `403 /api/ranked/progression` | **new, from this commit** |

The Ranked 403 is `useRankedProgression` firing for a guest, and it is the
documented fail-closed path — 401/403 means "no Ranked standing to show", the
hook resolves to `unavailable`, and the Record correctly omits the Ranked line.
The panel renders properly. But it puts a 403 in the console on **every guest
visit to the hub**, which is avoidable noise: the hook has no `enabled` switch,
so gating the call behind an identified (non-anonymous) account is a one-line
change for the next pass. Not fixed here — deployment verification is not the
place for design or behaviour changes.

### 7. Visual QA still outstanding

Unchanged from Revision 24 §7 and still the gate on Step 4. Screenshot capture
returns a black frame for this room in the Browser pane, so everything verified
so far is geometric, not visual. Carried forward:

1. The utility strip resting on bare counter top — the one mount with no
   painted surface of its own, and the likeliest to read wrong.
2. Record register density inside a frame that cannot grow.
3. The seal with a real avatar clipped into the painted laurel ring.
4. Premium and Community at the smallest gate (143px / 158px wide, `nowrap`
   titles).
5. Premium's deliberately quiet ink CTA — does it still read as an action.
6. Bulletin balance now that the board carries less than the community section
   did.

Plus, newly noted:
7. **The guest Ranked 403** (§6) — gate `useRankedProgression` behind an
   identified account so the hub stops logging a 403 for every visitor.
8. The two pre-existing production console errors (stat-check invites 403,
   funnel_events 404), which predate this work but are worth a look.

Screenshot capture still returns a black frame for this room in the Browser
pane even against production, with the artwork confirmed loading 200 — so it is
a capture limitation, not a site fault. Playwright remains the tool for the
visual pass.

### 8. Next task

**Visual review and correction — before any carousel work.** A Playwright pass
(not the Browser pane) over the six risks above, on the deployed build, then
whatever corrections it turns up. Step 4's Bulletin rotation and card families
stay parked until that pass is signed off. No Step 4 work was started here.

---

## Revision 2026-09-07 — SCREEN 2 RECOMPOSITION, STEP 3 **IMPLEMENTED AND LOCALLY VERIFIED** (not committed)

**Status:** implemented on `main` @ `3d914096`, working tree, **uncommitted and
unpushed**. Revisions 22 (preservation) and 23 (specification) remain
authoritative for intent; this revision records what actually shipped into the
working tree and what changed against the plan.

### 1. Files changed

| File | Change |
|---|---|
| `src/components/lol/AcademyRecord.tsx` | **new** — the large left mount |
| `src/components/lol/AcademyBulletin.tsx` | **new** — the large right board, one static notice |
| `src/components/lol/AcademyRecord.test.tsx` | **new** — 7 tests, all state paths |
| `src/components/lol/AcademyBulletin.test.tsx` | **new** — 5 tests |
| `src/components/lol/AcademyCommons.tsx` | recomposed: new DOM order, new support row |
| `src/components/lol/HubPremiumPanel.tsx` | plaque → compact parchment slip; **logic untouched** |
| `src/components/lol/HubCommunitySection.tsx` | board → compact parchment slip; **logic untouched** |
| `src/components/lol/HubUtilitySection.tsx` | two slips → one four-link strip |
| `src/index.css` | stage-mode mount block rewritten (271 lines → 348) |
| `src/pages/LolHub.test.tsx` | 3 intentional updates |
| `src/components/lol/HubPremiumPanel.test.tsx` | 1 intentional update |

Screen 1, the plinth, the artwork, `LolHub.tsx` and `Footer.tsx` are **not
touched**.

### 2. Layout and component changes

DOM order is now **Record → Bulletin → Premium → Community → Utilities →
plinth**, identical in both modes.

Stage-mode fractions, all re-measured (see §5 for the one that had to be
measured twice):

| Mount | mx | my | mw | mh |
|---|---|---|---|---|
| Crest (unchanged) | .3000 | .0850 | .1800 | .0930 |
| **Academy Record** (gilt frame) | .2700 | .2150 | .2140 | .5150 |
| **Academy Bulletin** (board) | .5840 | .2520 | .2440 | .2440 |
| **Premium** (left sheet) | .5540 | .5970 | .1029 | .1600 |
| **Community** (right sheet) | .6898 | .5970 | .1137 | .1600 |
| **Utility strip** (counter top) | .2320 | .7560 | .3120 | .0360 |
| Plinth (frozen) | .2320 | .8120 | .5540 | .1080 |

The Record and Bulletin boxes describe the same painted frame and board the
previous occupants sat in — the surfaces did not move, only who is on them.
The two sheets were **derived**, not inherited: the retired combined utility
mount (mx .5540, mw .2495, internal 172fr/190fr grid, 55u gutter) was solved
into two absolute boxes so each lands on its own painted parchment.

**The seal.** The Record's seal — the reader's avatar, or a fallback mark —
drops into the painted laurel medallion using `(0.2715 − --my) / --mh`, written
out against the Record's own box rather than copied from the plaque. Verified
in the browser at 1024×780: medallion centre 211.8px, rendered seal centre
212px.

Flow mode: the two large mounts share a `lg:grid-cols-[1fr_1.05fr]` row, the
two sheets a `sm:grid-cols-2` row, the strip its own row. All coded chrome
(navy plaque, planked board, parchment, pins) is restored outside the gate.

### 3. Academy Record — data sources reused

Every value is an existing authority. Nothing new was fetched, derived or
invented, and there is no backend work in this slice.

| Line | Source |
|---|---|
| Name, avatar | `useProfileIdentity` (canonical `profiles` read); `null` for guests and anonymous sessions |
| Standing | `parseAcademyProgression(progress)` → `academyTierLabel`; falls back to `deriveProfileStats().rankName` when the wire block is incoherent |
| To next tier, tier bar | `AcademyProgression.xpToNext` / `.progressPercent` — omitted entirely at Challenger and whenever the block fails validation |
| Answered, Accuracy, Streak | `deriveProfileStats` — the same view model the profile page renders |
| Strongest | `pickBestCategory` over `quizApi.getCategories` |
| Ranked | `useRankedProgression`, rendered **only** when `loadState === "ready" && rated` |
| Member mark | `useSitewideTheme().proStatus` |

React Query keys are `["quiz-progress", userId]` and `["quiz-categories",
userId]` — the **same keys** `LeagueProfileStats` uses, so the cache is shared
with the profile page.

**States.** `data-record-state` is `empty` for a guest, an anonymous session,
or any signed-in account with `activityState === "none"`; `open` otherwise. The
empty state prints no zeroes, no "Unranked" and no bar — it says "No record
opened" and offers "Begin Studying". A member gets "Academy Record · Member" in
the band and **no upsell in this panel at all**.

**Excluded as specified:** mastery/champion progression, Combat Lab stats,
achievements, history rows, per-role records. No fixture or demo data exists in
this slice.

### 4. Academy Bulletin V1

One `NOTICE` object — not an array, not an index, no rotation state, no
carousel framework. Eyebrow / headline / body / one CTA is the shape every
future family must fit.

The notice points at **`/lol/mechanics`** (the Mechanics Explorer). It was
originally written against `/quiz` and changed during implementation: the
Record's own primary action already goes there, and a board that repeats the
panel beside it is not a bulletin. It also avoids Screen 1's Patch Brief and
claims no live statistic — tests assert all three.

### 5. Preservation verification

| Behaviour | Verified how |
|---|---|
| Premium promo state, member state, `/lol/premium` | `HubPremiumPanel.test.tsx`, 6 tests green; still the page's only `/lol/premium` link |
| Discord configured / unconfigured | `LolHub.test.tsx` — pending state renders, no link to nowhere |
| YouTube, TikTok, Instagram, X | per-channel `if (!channel.url) return null` intact; collapsed footnote intact; `links.ts` untouched (5 tests green) |
| `/feedback`, `/feedback?intent=bug`, `/about`, `/contact` | all four in the strip, asserted with exact hrefs plus a count of 4 |
| Legal plinth | copy, routes, layout and role unchanged; `LolHub.test.tsx` wording test passes untouched; still the section's last element child |
| Hall ↔ Commons, snap, settle, reduced motion | `data-hub-screen="commons"` untouched, `LolHub.tsx` untouched, hint tests green |
| Stage/flow duality | measured live at 1440×900, 1024×780 and 375×812 |

Live geometry at the tightest gated viewport (1024×780): utility strip clears
the walnut rail by 23px, clears the Premium sheet by 41px, sits 21px below the
Record; no horizontal overflow. Flow mode at 375×812: `position: relative`
(stage off), correct stacking order, all four utility links at the full 44px,
legal nav intact.

**The measurement that was wrong first.** The strip was originally placed on
the panelling at .7790–.8260, which looked clear in the file. In the browser
that band is 30px of moulded panel face with the legal rail's top edge at
.8244 — a 3px gap, with the links across the wainscot's lit nosing. It was
moved to the broad wooden **counter top** that runs below the frame
(.750–.790), taking the left run only, because the two small parchments hang
into that band on the right. "Measured, not guessed" has to mean measured in
the page.

### 6. Tests, typecheck, build

- **Tests:** `src/components/lol`, `src/pages/LolHub.test.tsx`,
  `src/pages/Quiz.hub.test.tsx`, `src/lib/community` — **360 passed, 0 failed**
  (20 files). Profile-side regression sweep — **45 passed** (4 files).
- **Typecheck:** `tsc --noEmit -p tsconfig.app.json` — **11 errors before, 11
  after, byte-identical**, none in any changed file. All pre-existing.
- **Lint:** clean on all eight changed/added files.
- **Build:** `vite build --mode development` — green, 48s.
- The full repo suite was not run; per the standing note it has a ~42-test
  baseline failure set on clean `main` and must be compared serially.

**Four intentional test updates** (the old assertions encoded the old
hierarchy; the behaviour each guarded is preserved):

1. `LolHub.test.tsx` "mobile panel list is untouched" — scoped to
   `[data-hub-screen="hall"]`. The Record's primary action is also a `/quiz`
   link and is not a book; scoping keeps the twice-exactly guarantee exact.
2. `LolHub.test.tsx` painted-mount class hooks — renamed with their occupants
   (`-record`, `-record-seal`, `-support-premium`, `-support-community`).
3. `LolHub.test.tsx` utility destinations — reads the strip instead of the
   retired `hub-about-block`, and now also asserts there are exactly 4 links.
4. `HubPremiumPanel.test.tsx` feature-claim check — case-insensitive, because
   the compact slip names both live features in prose rather than as a
   three-item register. The rule under test (both named, no coming-soon
   feature, no price) is unchanged.

The Premium → Community → Utility → legal order assertion in
`LolHub.test.tsx:301` **did not need changing**: Record and Bulletin were
inserted above that run, so the relative order it guards still holds.

### 7. Visual risks still needing browser review

Screenshot capture returns a black frame for this room in the Browser pane, so
everything above is **geometric verification, not a visual sign-off**. Per the
standing note, Playwright is the tool for a real visual pass. Open risks:

1. **The utility strip on bare counter top.** It is the one mount with no
   painted surface of its own. Four inscription links resting on wood, 30px
   above the legal rail — this is the single most likely thing to read wrong.
2. **Record register density.** Up to six label/value lines plus a bar inside
   the painted frame. A long display name or a wide category label may crowd
   it; the frame cannot grow.
3. **The seal with a real avatar.** Verified as a box; never seen with an
   actual image clipped into the painted laurel ring.
4. **Compact slips at the smallest gate.** Premium and Community are 143px and
   158px wide at 1024×780, with `white-space: nowrap` titles.
5. **Premium's quiet CTA.** Deliberately ink-on-parchment rather than gold, so
   the room has exactly two bright objects. Needs eyes to confirm it still
   reads as a call to action.
6. **Bulletin balance.** The board is 2.44:2.44 of the artwork and now carries
   less content than the community section did.

### 8. What remains for Step 4

Rotation for the Bulletin — the card families from Revision 23 §3 (quiz prompt,
mechanics fact, patch projection, personal activity, Pro Play invitation), slow
rotation, prev/next, pause rules, deterministic first item. Then the Record's
later fields (achievements, history rows, per-role records), the gutter wood
framing, and — only after real implementation — Timmy/demo population.

A Playwright visual pass over the six risks in §7 should come **before** Step 4
adds content to either mount.

---

## Revision 2026-09-07 — SCREEN 2 REDESIGN SPECIFICATION (design only, no code changed)

**Status:** specification. Read on `main` @ `3d914096`. No source file was
modified; this document is the only file touched. Builds directly on
Revision 22's preservation table — every row there still binds.

Screen 1 is out of scope and unchanged. Academy Updates / "What's New" stays
owner-authored **Mogzy product news** on Screen 1
(`src/lib/lol/academy-updates.ts` + `public.academy_updates`, admin-managed,
currently OFF). The Bulletin defined below is **League content**, not product
news, and the two must never share a source.

### 1. LOCKED SCREEN 2 MOUNT MAP

Room, artwork, Mogzy, the desk occlusion, the crest band and the plinth are
unchanged in kind. Only the occupants of the painted mounts change.

| Painted mount | Today | **Locked new occupant** | Hierarchy |
|---|---|---|---|
| Large gilt-framed navy panel (left) | Mogzy Premium plaque | **Academy Record** | 1 — Me |
| Large parchment noticeboard (right) | Join the Academy | **Academy Bulletin** | 2 — League right now |
| Small pinned slip, lower left | Feedback ("Help improve Mogzy") | **Mogzy Premium**, compact | 3 — Membership |
| Small pinned slip, lower right | About / Contact | **Community**, compact | 4 — Community |
| *(new)* narrow utility strip under the two slips | — | **Feedback · Bug · About · Contact**, one row of four ink-on-parchment links | 5 — Utilities |
| Walnut rail, bottom | Legal plinth | **unchanged, frozen** | 5 |
| Left/right raw gutters | raw | **reserved only** — dark wood framing later; sparse pinned papers a later possibility | — |

Rationale for the smallest structural change: the two large mounts swap
occupants, the two existing small slips swap occupants, and exactly **one** new
mount is introduced (the utility strip) because four links no longer fit inside
a slip that now carries Premium or Community. Nothing else in the room moves.

Deliberate non-fills: the gutters stay empty in V1; no mount is added above the
crest; the Bulletin shows **one** item at a time rather than a grid. The room
must not become a dashboard — the Record and the Bulletin are the only two
things a reader is meant to look at.

DOM order (flow mode reading order, and therefore the new test contract):
**Academy Record → Academy Bulletin → Premium → Community → Utilities → legal
plinth.**

### 2. ACADEMY RECORD V1 DATA CONTRACT

Not an embedded Profile page. It reads the **same authorities Profile already
reads** and renders a compact standing, never a full breakdown.

#### Field availability — verified against source

| Candidate | Verdict | Authority |
|---|---|---|
| Display name + avatar | **available now** | `useProfileIdentity(userId)` → `profiles.display_name/avatar_url`; null for guests by design |
| Academy tier (five-tier) + interval progress | **available now** | `quizApi.getProgress` `academy_*` block → `parseAcademyProgression` (`src/lib/progression/academy.ts`); returns null unless the whole set is coherent |
| Legacy 11-tier rank name + icon | **available now** | `deriveProfileStats().rankName / rankIconUrl` |
| Total XP | **available now** | `QuizProgress.total_xp` |
| Questions answered | **available now** | `deriveProfileStats().totalQuestionsAnswered` (already reconciles a stale progress row against category totals) |
| Quiz accuracy | **available now** | `deriveProfileStats().accuracy` |
| Current / best streak | **available now** | `deriveProfileStats().currentStreak / bestStreak` |
| Strongest category | **available now** | `pickBestCategory(getCategories(userId).categories)` — deterministic, and never picks a 0-attempt category |
| Recent quiz activity | **available now** | `quizApi.getHistory()` (JWT-scoped, best-effort; `null` means "no detailed history", never "no activity") |
| Achievements | **available now** | `quizApi.getAchievements(userId)` → `unlocked_count` / `total` |
| Ranked rating + Ranked tier | **available now** | `useRankedProgression()` → `RankedProgressionView.rating / tier / rated / matchesRated`; `unavailable` is a first-class state |
| Recent Ranked result | **available now** | `useRankedMatchHistory(limit)` → `viewerOutcome`, `ratingDelta`, `ratingAfter`, `completedAt` |
| Per-role Ranked record | **derivable** | `src/lib/ranked-public/roleRecords.ts` over the same history rows |
| Activity state (none / aggregate-only / detailed) | **derivable** | `deriveProfileStats().activityState` — already the empty-state authority |
| Champion / mastery progression | **requires new backend** | `mastery` on the frontend exists only as Ranked *question* modules (`ranked-core/modules/masterySlice*`). There is no per-user champion mastery read. |
| Combat Lab / Team Sim usage stats | **requires new backend** | no per-user aggregate endpoint |
| Friends / social standing | **should not be used** | `useFriends` is a relationship list, not progression |
| Last-seen / session time | **should not be used** | `useTrackActivity` writes `last_seen_at`; surfacing it is presence, not achievement |

#### V1 view model — the smallest strong version

Five facts and one action. Everything is already fetched by hooks that exist.

```
AcademyRecordV1
  identity     displayName | null, avatarUrl | null        (useProfileIdentity)
  standing     academyTier + progressPercent               (parseAcademyProgression)
               fallback: rankName + rankIconUrl            (deriveProfileStats)
  answered     totalQuestionsAnswered                      (deriveProfileStats)
  accuracy     accuracy                                    (deriveProfileStats)
  streak       currentStreak (bestStreak as the subtitle)  (deriveProfileStats)
  strength     pickBestCategory(...) | null                (getCategories)
  ranked       rating + tier, ONLY when loadState==="ready" && rated
                                                           (useRankedProgression)
  action       one primary link, state-dependent (below)
```

Deliberately **excluded from V1**: achievements (a count with no icons reads as
filler), recent-history rows (the Bulletin already carries a personal-activity
card family), per-role records, mastery. All are Later.

#### UI states

| State | Detection | Render |
|---|---|---|
| Signed-out / guest | no `user`, or anonymous session | The frame is an **empty register**: room-consistent copy inviting the reader to begin, one CTA to `/quiz`. No zeroed statistics, no fabricated tier. The hub already signs anonymous users in, so this is mostly the *anonymous* case. |
| New / sparse Free | `activityState === "none"` | Same empty register plus the identity line if a display name exists. Never "0% accuracy". |
| Mature Free | `activityState !== "none"` | Full V1 view model. Ranked block appears only if `rated`. Primary action = "Continue" → `/quiz`. |
| Mature Premium | as above, `proStatus === "pro"` | Identical facts plus a quiet member mark on the frame. **No upsell.** The Premium mount goes quiet for this user (§4). |
| Loading | any query in flight | Skeleton **within the existing frame** — the mount never collapses, because stage mode positions it absolutely and a height change would tear the composition. |
| Partial failure | any single query rejects | That fact is omitted; the Record still renders. Consistent with `deriveProfileStats`' existing tolerance and with `useRankedProgression`'s `unavailable`. |

No demo/fixture data in V1. Timmy-style population is explicitly later (§6).

### 3. ACADEMY BULLETIN V1 CONTENT CONTRACT

A physical noticeboard, not a slider: **one** primary notice pinned at a time,
slow rotation, manual prev/next, and a deterministic first item.

| # | Card family | Existing source | Production-ready today | CTA / deep link | Fallback | V1? |
|---|---|---|---|---|---|---|
| 1 | Pro Play / Worlds feature | `src/lib/pro-play/api.ts` exposes only `startProPlayQuiz` / `answerProPlayQuestion` — questions are generated **at request time** (LIVE1: bulk pro banks are legacy). No read-only stats endpoint. | **No** for a stats card; **yes** for a static invitation card | `/lol/pro-play` | drop the card | V1 as an invitation only; stats card = Later |
| 2 | Quiz question prompt | `quizApi.categoryQuestions(category, limit)` / `quizApi.questions(set, limit)`. (`getPlaylist` is admin-only — do not call it here.) | **Yes** | `/quiz` (optionally `?category=`) | drop the card | **V1** |
| 3 | Trivia / mechanics fact | `src/lib/mechanics-tables/api.ts` → `fetchTablesIndex()` / `fetchStudyTable(id)`; 23 live tables, `/lol/mechanics` is a real public route | **Yes**, but there is no "fact of the day" selector — that is client-side derivation over an existing table | `/lol/mechanics` | drop the card | **V1** |
| 4 | Patch-related League content | `usePatchBriefFeed()` / `fetchPatchReports` + `fetchPatchReport`, shared query keys | **Yes** | `/lol/patch-reports` | its own placeholder transmission already exists | **V1**, with the dedupe caveat below |
| 5 | Personal recent activity | `quizApi.getHistory()` and `useRankedMatchHistory()` | **Yes** | `/lol/history` or the Ranked lobby | omit for guests and for `activityState === "none"` | **V1** |
| 6 | Aggregate / community activity | **none exists.** No activity-feed table, no aggregate endpoint. | No | — | — | Later (needs backend; out of scope) |
| 7 | General League / esports news | LIVE1 gives **match data** (`fetchLiveGames`, `fetchArchive`, `fetchGameInsights`), not editorial news | Match data yes; news no | `/esports/live` archive | drop the card | LIVE-match card Later; a news feed is **not** proposed |

**Dedupe caveat (family 4):** Screen 1's Academy Broadcast already renders the
Patch Brief from the same feed. A patch card on Screen 2 must present a
*different* projection (e.g. a single champion change) or it will read as the
same notice twice on one page. This is a content decision to settle during
implementation, not a data problem.

**Composition contract**

- Exactly one card visible; the rest are pinned "behind" it conceptually.
- **Rotation: slow**, on the order of tens of seconds, not a carousel autoplay.
- Manual **prev / next** controls are the primary affordance and are always in
  the tab order.
- **Pause** on hover, on focus within the board, when `document.hidden`, and
  permanently once the reader presses prev/next. Rotation is fully suppressed
  under `prefers-reduced-motion` **and** `html.reduce-motion` (both, per the
  precedent set by `prefersReducedMotion()` in `LolHub.tsx`).
- **Deterministic first item** for screenshots/video: the card order is a
  declared list, index 0 shows first, and rotation never starts before first
  paint. No `Math.random()` at render — the hub's existing academy-line pattern
  (a lazy `useState` initializer) is the precedent if randomness is ever wanted.
- Every family **fails to absence**: a card whose source is unavailable is
  removed from the rotation. If the rotation empties, the board shows one
  neutral standing notice rather than an error.
- No new CMS, no new feed, no new table is proposed for V1.

### 4. EXISTING FUNCTIONALITY RELOCATION MAP

Nothing disappears. Every row below is a Revision 22 row with a destination.

| Current feature | Destination | Requirement |
|---|---|---|
| Premium **member** state | Compact Premium slip, lower left | Keep `data-premium-state="member"`. Quietest form: a member mark and "View Premium" — no pillars, no promotional blurb. This is the "less dominant for an existing member" requirement. |
| Premium **nonmember** state | Same slip | Keep `data-premium-state="promo"`. Retain a short line and the CTA; the three pillars may compress to one line or drop — that is a copy decision. Still fails open to promo on `unknown`. |
| `/lol/premium` CTA | Same slip | `hub-premium-cta`, still the **only** `a[href="/lol/premium"]` on the page. Keep the ≥52px tap target and the explicit focus ring. |
| Discord **configured** | Compact Community slip, lower right | `hub-community-discord`, `target="_blank" rel="noopener noreferrer"` |
| Discord **unconfigured** | Same slip | `hub-community-discord-pending`, "opening soon". Must survive — it is the live state today. |
| YouTube / TikTok / Instagram / X | Same slip, as a chip row | `hub-community-<id>`; each renders only when `channel.url` is non-null; the "on the way" footnote remains the all-absent fallback. |
| `/feedback` | Utility strip | `hub-feedback-give` |
| `/feedback?intent=bug` | Utility strip | `hub-feedback-bug` — **the query param is the feature**; preserve verbatim |
| `/about` | Utility strip | link, accessible name matching `/About Mogzy/` |
| `/contact` | Utility strip | link, accessible name matching `/Contact/` |
| Back to the Hall | Crest band, unmoved | `commons-back-to-hall`, `data-hub-hint="commons"`, `academy-hub-hint` |
| Legal plinth | Unmoved, frozen | last element child of the section; `scroll-snap-align: end` |
| `AdSlot lol_hub_mid` | Stays mounted in the room | still renders `null` with no reserved space when suppressed |

Community explicitly loses the large mount: five links do not earn one of the
two biggest surfaces in the room. It keeps every action.

### 5. RESPONSIVE / TEST IMPACT

**Stage mode — must be remeasured (not done here).**

- New `--mx/--my/--mw/--mh` fractions for: Academy Record (gilt frame),
  Academy Bulletin (noticeboard), Premium slip, Community slip, and the new
  utility strip. All fractions are of the **artwork**, derived from
  `--commons-img-x/y/w/h`; the `--u` unit scales internal type and spacing.
- `.academy-commons-plaque-seal`'s absolute position is currently computed from
  the plaque's own painted fractions (`(0.2715 - 0.2150) / 0.5150`). Moving
  Premium invalidates that expression — it must be re-derived, not copied.
- The frame-suppression overrides (walnut mount, brass band, planking,
  parchment switched OFF inside the gate) must be re-pointed at whichever
  component now sits on each painted surface.
- The Record and the Bulletin are the two mounts most at risk of **content
  overflow** inside a fixed painted frame. Both need an internal scroll-free
  budget — a fixed number of facts, a single notice — rather than a scrollbar.
- Mogzy's aspect gate and the `-desk` occlusion clip are unaffected: they are
  keyed to the artwork, not to the panels.

**Flow mode — a separate, mandatory pass.** Flow is DOM order plus each
component's own coded chrome. The new order (Record → Bulletin → Premium →
Community → Utilities → plinth) must read correctly on a phone with all coded
frames restored. Shipping stage-only leaves phones with the old room.

**Load-bearing, must not change:** `data-hub-screen="commons"` (snap anchor,
settle observer, ambience toggle), `.academy-hub-hint`, the plinth as last
child, `pt-[calc(var(--app-header-h)+1rem)]` HUD clearance, the plinth's `pb-16`
flow-mode clearance for the bottom-left friends control.

**Tests requiring intentional update**

| Test | Why |
|---|---|
| `LolHub.test.tsx:301` "ends the Commons at the legal plinth…" | Asserts DOM order `hub-premium-panel → hub-community-section → hub-utility-section → commons-legal-nav`. The new order puts Record and Bulletin first and Premium fourth. **This encodes a hierarchy decision and must be rewritten, not deleted.** |
| `LolHub.test.tsx:260` "opens the lower page with the Mogzy Premium module, above Community" | Same reason — the premise ("opens with Premium") is being deliberately reversed. |
| `LolHub.test.tsx:357` "opens the lower page with the Academy community section" | Premise changes; the Discord pending assertions inside it must be **kept**. |
| `LolHub.test.tsx:277` "keeps Premium out of the four primary destination books" | Should still pass — verify the single-`/lol/premium`-link invariant survives. |
| `LolHub.test.tsx:327` legal-plinth wording | Must continue to pass untouched. It is the regression alarm on the frozen region. |
| `HubPremiumPanel.test.tsx` | Both `data-premium-state` variants and the ≥44px/focus-ring assertions must survive the compact form. Copy assertions ("claims only features Premium actually ships") may need updating if pillars are dropped. |
| New | Order test for Record → Bulletin → Premium → Community → Utilities → legal; Bulletin determinism (index 0 first, no rotation before paint); Record guest/sparse states render no zeroed statistics. |

### 6. DEFERRED ITEMS

**V1 implementation (this workstream's next slices)**
Mount re-allocation; Academy Record V1 (five facts + Ranked when rated);
Academy Bulletin with families 2, 3, 4, 5 and the Pro Play invitation card;
compact Premium and Community slips; the utility strip; stage remeasure; flow
pass; test updates.

**Later enhancements**
Achievements and recent-history rows in the Record; per-role Ranked records;
Pro Play *stats* cards (needs a read endpoint); LIVE1 match cards; aggregate
community activity (family 6, needs backend); a real League news feed (family 7
— not currently proposed); wood gutter framing; pinned papers/art in the
gutters; champion mastery progression (needs backend).

**Timmy / demo population**
Explicitly after real implementation. No fixture, no seeded Record, no fake
Bulletin card in V1. The precedent to follow when it happens is
`/dev/lobby-preview`, which keeps demo data out of the production path entirely.

**Never (decided)**
Champion mastery in the Record before a backend exists; a fifth navigation
book; Screen 1 Academy Updates content appearing in the Bulletin; any price in
the Commons; filling the gutters because space exists.

### 7. RECOMMENDED STEP 3 — smallest coherent slice

**Re-allocate the mounts with the components that already exist, and add the
Academy Record with quiz-only data. No Bulletin yet.**

Concretely: swap Premium and Community into the two small slips, add the
utility strip, put the Record in the large left frame reading only
`useProfileIdentity` + `deriveProfileStats` + `parseAcademyProgression`, and
leave the noticeboard rendering a single static standing notice as the
Bulletin's placeholder. Remeasure stage mode and fix flow mode in the same
slice; update the four order-dependent tests.

Why this is the right cut: it forces the expensive, risky work (the stage
remeasure and the flow-mode pass, per Revision 22's R1/R2) to happen once,
against components whose behaviour is already proven, and it proves the new
hierarchy on screen before any new content system is built. The Ranked block,
and then the Bulletin's card families, land as Step 4 and Step 5 against a room
that is already correctly composed.

---

## Revision 2026-09-07 — SCREEN 2 PRESERVATION AUDIT (read-only, no code changed)

**Status:** audit only. No source file was modified; this document is the only
file touched. Read on `main` @ `3d914096`, worktree clean.

Purpose: a preservation map of every Screen 2 / Academy Commons behaviour, so
the next pass can recompose the room (large left frame = Academy Record, large
right board = rotating Bulletin) without silently dropping an action.

### A. Files that own Screen 2

| File | Owns |
|---|---|
| `src/pages/LolHub.tsx` | both screens, the snap class, `hubScrollTo`, the settle/hint observer, the ambience class |
| `src/components/lol/AcademyCommons.tsx` | the room shell, art layers, Mogzy/desk, crest + Back to the Hall, the mount grid, the plinth |
| `src/components/lol/HubPremiumPanel.tsx` | membership plaque |
| `src/components/lol/HubCommunitySection.tsx` | notice board |
| `src/components/lol/HubUtilitySection.tsx` | the two pinned slips |
| `src/index.css` ~8340–9490 | the entire stage/flow duality; every mount coordinate |
| `src/components/Footer.tsx` | self-hides on `/lol` (exact match) |
| `src/lib/community/links.ts` | community channel resolution, fail-closed |
| `src/lib/premium-routes.ts`, `src/hooks/useSitewideTheme.tsx` | Premium route + entitlement |

### B. Preservation table

| Current feature | Component/file | Data/state dependency | Interaction/route | Responsive/state behaviour | Redesign preservation requirement |
|---|---|---|---|---|---|
| Premium plaque, promo variant | `HubPremiumPanel.tsx` | `useSitewideTheme().proStatus` (`unknown`/`free`/`pro`); `unknown` renders promo | `<Link to={PREMIUM_ROUTE}>` = `/lol/premium`; label "Explore Premium" | `data-premium-state="promo"`; stage mode strips the walnut mount + brass band | Keep exactly one `a[href="/lol/premium"]` on the page, inside `[data-testid="hub-premium-panel"]`; keep `hub-premium-cta` |
| Premium plaque, member variant | same | `proStatus === "pro"` | same route, label "View Premium"; band reads "Member in good standing" + Check | `data-premium-state="member"` | Both variants must survive the smaller mount; the state attribute is asserted by tests |
| Premium loading/failure | `useSitewideTheme.tsx:104–129` | `fetchProEntitlement()`; a **null** entitlement stays `unknown` | no spinner, no error UI | fails **open to promo**, never to a gate | Do not add a loading skeleton or a gate — a promo module must not block on entitlement |
| Premium pillars (3) + no price | `HubPremiumPanel.tsx` `PILLARS` | static; bounded by `LolPremium.tsx` `PREMIUM_FEATURES` | none | wraps to a row ≥sm | Price stays off the client (PT1.5); do not name a `comingSoon` feature |
| Discord CTA | `HubCommunitySection.tsx` | `COMMUNITY_CHANNELS` ← `VITE_COMMUNITY_DISCORD_URL`, `https:`-only | `<a target="_blank" rel="noopener noreferrer">`, testid `hub-community-discord` | **unset today** → renders `hub-community-discord-pending` "Discord — opening soon" | Both branches must survive; never render a link when `url` is null |
| YouTube / TikTok / Instagram / X | same | `secondaryCommunityChannels()` filtered by `url` | `hub-community-<id>` new-tab anchors | all four unset → the whole row is replaced by the footnote "…are on the way." | Preserve the per-channel `if (!channel.url) return null` and the footnote fallback |
| Community config source | `src/lib/community/links.ts` | `import.meta.env`, deploy-time | n/a | `normalizeUrl` refuses non-`https:` (incl. `javascript:`) | Fail-closed resolver must remain the only source; no hard-coded URLs |
| Give Feedback | `HubUtilitySection.tsx` | none | `<Link to="/feedback">`, testid `hub-feedback-give` | — | Route is a `ProtectedRoute`; see risk R3 |
| Report a Bug | same | none | `<Link to="/feedback?intent=bug">`, testid `hub-feedback-bug` | — | The **query param is the feature** (`Feedback.tsx:87` opens that door directly); preserve it verbatim |
| About Mogzy | same, `UTILITIES` | none | `<Link to="/about">` | inside `hub-about-block`, `nav aria-label="About and help"` | Must remain a link with accessible name matching `/About Mogzy/` |
| Contact | same | none | `<Link to="/contact">` | same nav | Must remain, accessible name `/Contact/` |
| (Help/FAQ) | — | — | **deliberately absent** — no such route exists | — | Do not add one to "balance" the new layout |
| Back to the Hall | `AcademyCommons.tsx` crest | `navHintRevealed` prop ← `settledHint === "commons"` | `onBackToHall` → `hubScrollTo("hall")` (`scrollIntoView`) | inside the snap gate the control fades in after settle; **outside the gate CSS never hides it**; `:focus-visible` also reveals it | Always in the DOM and in tab order; testid `commons-back-to-hall`, `data-hub-hint="commons"` |
| Hall → Commons descend | `LolHub.tsx:944` | same hint machinery, `data-hub-hint="hall"` | `hubScrollTo("commons")` | chevron drift stops under reduced motion | Screen 1 control — untouched by this redesign |
| Two-screen scroll snap | `index.css:8360–8375` + `HUB_SNAP_CLASS` | `html.hub-two-screen`, added on mount / removed on unmount | `scroll-snap-type: y mandatory` on `html` | gate = `(min-width:1024px) and (min-height:780px)` **and** `:not(.large-text)` | `[data-hub-screen="commons"]` attribute is the snap anchor — the new root element must keep it |
| Plinth snap safety | `index.css:8372` | — | `scroll-snap-align: end` on `.academy-commons-plinth` | belt-and-braces if the room outgrows the viewport | Keep the plinth as the section's **last element child** (asserted in tests) |
| Settle/hint observer | `LolHub.tsx:367–447` | scroll + resize listeners, `matchMedia(HUB_SNAP_MEDIA)` | idle 140ms → settled if `|rect.top| ≤ 18px` → reveal after 1700ms | disarmed under `large-text` and outside the gate | Depends only on `[data-hub-screen]` and `.academy-hub-hint` classes — layout-agnostic |
| Ambience override | `LolHub.tsx` `syncAmbience` | `html.hub-commons-in-view` toggled when commons top < 50vh | quiets sitewide Hextech ambience | rAF-throttled; class removed on unmount | Queries `[data-hub-screen="commons"]` — preserve that attribute |
| Reduced motion | `prefersReducedMotion()` | OS media query **or** `html.reduce-motion` | `scrollIntoView` drops to `auto` | snapping itself is kept by design | Both sources must keep being honoured |
| Stage mode (painted room) | `index.css:8716+` | `--commons-art`, `--commons-img-w/h/x/y`, unit `--u` | panels absolutely positioned by `--mx/--my/--mw/--mh` **fractions of the artwork** | only inside the gate | Any new mount needs its own measured fractions from the same custom properties (see risk R1) |
| Flow mode | default | — | ordinary scrolling document, panels keep coded chrome | phones, short laptops, deep zoom, large text | The redesign must ship **both** modes or flow-mode readers lose the room |
| Mogzy + desk occlusion | `AcademyCommons.tsx` | `MOGZY_MASCOT_ASSETS.base` as a CSS background | aria-hidden, no interaction, stage-only, aspect-gated | never contributes layout height (deliberately not an `<img>`) | Keep as backgrounds; DOM paint order art → Mogzy → desk → panels |
| Room title / crest rule | `AcademyCommons.tsx` | none | decorative, `aria-hidden`, **not** an `<h*>` | `lg:` only | Must not become a heading — the section's `aria-label="Academy Commons"` already names the room |
| Ad slot | `AdSlot placement="lol_hub_mid"` | ads policy + consent + `proStatus` | renders `null` with **no reserved space** when suppressed | dev/test renders a placeholder (`ad-lol_hub_mid`, asserted in tests) | Keep the mount inside the commons; a filled slot would land over the painting |
| **Legal plinth (FROZEN)** | `AcademyCommons.tsx` `LEGAL_LINKS` + disclaimer | `SITE_NAME`, `new Date().getFullYear()` | `/privacy`, `/terms`, `/security` (all real routes, `App.tsx:597–599`); `nav aria-label="Legal"`, testid `commons-legal-nav` | flow mode keeps wide side returns + `pb-16` to clear the bottom-left friends control; stage mode draws a walnut rail | **Byte-for-byte unchanged.** Footer self-hides on `/lol`, so these three destinations exist nowhere else on this page |
| © line + Riot disclaimer | same | `SITE_NAME` | text only | `max-w-5xl`, opacity .8 | Frozen; wording is asserted in `LolHub.test.tsx` |
| Global footer suppression | `Footer.tsx:36` | `pathname === "/lol"` (exact) | returns `null` | — | Intentional and verified. If the redesign moves the plinth, the footer does **not** come back — the links would simply vanish |

Verified vs assumed: everything above is read from source. **Assumption, not verified:** that
`lol_hub_mid` renders `null` in production (the policy layer decides it; only the
test-environment placeholder was observed).

### C. Behaviour not in the brief that could be lost in re-layout

1. Reading order is contractual. `LolHub.test.tsx:301` asserts DOM order
   `hub-premium-panel → hub-community-section → hub-utility-section →
   commons-legal-nav`, and that the plinth is the section's last element child
   and the section the page's last element child.
2. `data-hub-screen="commons"` is load-bearing for three separate mechanisms
   (snap anchor, settle observer, ambience toggle).
3. Every `data-testid` in the table is asserted somewhere in
   `LolHub.test.tsx`, `HubPremiumPanel.test.tsx` or `Quiz.hub.test.tsx`.
4. Tap targets: `min-h-[44px]` on every slip/secondary action, `min-h-[52px]`
   on both primary CTAs. Explicit focus rings exist because gold-on-black hides
   the UA default.
5. `pt-[calc(var(--app-header-h)+1rem)]` on `.academy-commons-room` is the HUD
   clearance the shell does not supply to this full-bleed screen; without it
   "Back to the Hall" lands under the floating HUD on a phone.
6. The plaque's `:focus-within` gilt sweep (`index.css:8538`) is keyboard
   feedback, not decoration.
7. No `Pro` wording may appear anywhere in the commons — asserted by two tests
   (`docs/naming-premium-vs-pro-play.md`).

## PROPOSED RELOCATION MAP

Target: large left frame = Academy Record (personalised progression); large
right board = rotating League Bulletin/Carousel; Premium and Community survive
in smaller supporting mounts; Feedback/Bug/About/Contact all survive; plinth
untouched.

| Current occupant | Proposed home | Everything that must come with it |
|---|---|---|
| Premium plaque (large left frame today) | **smaller supporting mount** | `hub-premium-panel`, `data-premium-state`, `hub-premium-cta` → `/lol/premium`, both copy variants, the crown seal, ≥52px CTA. The three pillars and the blurb are the only compressible parts — dropping a pillar is a copy decision, dropping the member variant is a regression. |
| Notice board / Join the Academy (large right board today) | **smaller supporting mount** | `hub-community-section`, the Discord CTA **and** its pending state, the four secondary channel slots, the "on the way" footnote. The mount must be able to render either a 5-chip row (if channels are ever configured) or a single pending pill. |
| Feedback + About slips | **unchanged in kind, re-placed** | all four links with exact hrefs, including `?intent=bug`. They may merge into one slip only if all four remain individually clickable links. |
| Back to the Hall | stays in the crest band | centre of the band is the only region never under a fixed corner control at any width; `academy-hub-hint` class + `data-hub-hint="commons"` |
| Legal plinth | **frozen, unmoved** | last element child of the section; `scroll-snap-align: end` |
| — (new) | **Academy Record**, large left frame | no existing component; consumes existing progression state only. No backend work is proposed here. |
| — (new) | **Bulletin/Carousel**, large right board | note the adjacency to `src/lib/lol/academy-updates.ts` (Revision 21) — it is admin-managed, currently OFF with zero announcements, and today renders on **Screen 1**. Reusing it for the Bulletin is a decision for the redesign pass, not an assumption of this audit. |
| Side gutters | left raw | wood framing is explicitly deferred |

Nothing is removed or consolidated in this map: every action listed in the
preservation table has a named destination.

### D. Hidden coupling and regression risks

- **R1 — the mount coordinates are measured against one painting.** Stage mode
  positions every panel by fractions of `academy-commons-desktop.png`. Moving
  Premium to a small mount and putting a new Record frame in the large gilt
  frame means the painting no longer matches its occupants. Either new
  fractions are measured for the existing artwork, or new artwork is produced.
  This is the single largest cost in the redesign and it is a CSS/art cost, not
  a component cost.
- **R2 — flow mode is a second, independent composition.** The stage layout is
  entirely CSS overrides; flow mode is the DOM's own order. A relocation done
  only in the stage gate leaves phones with the old room.
- **R3 — `/feedback` is a `ProtectedRoute`.** With `require_auth` on and no
  user it redirects to auth. The hub signs anonymous users in (`LolHub.tsx:340`),
  so in practice the link works, but the two feedback actions are the only
  Screen 2 destinations that are not unconditionally public. Not a new risk —
  recorded so it is not "discovered" later as a redesign regression.
- **R4 — the ad slot.** If a provider ever fills `lol_hub_mid`, it renders
  inside the painted room. The composition would have to be revisited; the
  redesign should not make that harder by removing the mount.
- **R5 — plinth clearance.** `pb-16` in flow mode exists because a shell-level
  friends control floats bottom-left. Tightening the plinth's padding in a
  layout pass would put that control on top of the Privacy link.
- **R6 — test coupling.** The order assertion in `LolHub.test.tsx:301` will
  fail the moment Premium stops preceding Community in the DOM. That test
  encodes a *hierarchy* decision, so the redesign must consciously update it
  rather than treat the failure as noise.

### E. Unclear ownership

- **The Bulletin's content authority.** `academy-updates.ts` exists, is
  admin-managed, is OFF, and belongs to Screen 1. Whether the Bulletin reuses
  it, or is a separate rotating surface, is undecided and is not settled by
  this audit.
- **The Academy Record's data.** No component today reads user progression on
  `/lol`. Which existing hook supplies it was not established here.
- **Ambience.** `hub-commons-in-view` is set by `LolHub` but consumed by
  sitewide ambience CSS; neither file is obviously the owner.

### F. Can the redesign proceed as composition/layout only?

**Yes for the React layer.** Every Screen 2 behaviour is either a pure link, a
prop, or a single already-resolved context read (`proStatus`). The three panel
components can be re-parented into different mounts with no logic change, and
the two new large surfaces are additive. No foundational refactoring is needed.

**No for the CSS/art layer.** The stage-mode composition is welded to the
painting by measured fractions (R1), and it is a genuinely separate layout from
flow mode (R2). Budget the redesign as *component composition (cheap) + a full
re-measure or re-paint of the stage (the real work)*, and land both modes in the
same pass.

---

## Revision 2026-09-06 — WHATSNEW2 / ACADEMY UPDATES, ADMIN-MANAGED — **MIGRATION APPLIED, LIVE-VERIFIED, STILL OFF**

**Status:** complete on branch `whatsnew2`, worktree
`/Users/macmoney/mogsy-wt-whatsnew2`, based on `origin/main` @ `d979bf47`.
**The migration is APPLIED to the production database (2026-09-06) and every
RLS rule has been exercised against it. The feature is still OFF and there are
zero announcements.** The live run found and fixed one real defect — see §13.

> **OWNERSHIP, from 2026-09-06.** All further **Lovable, Supabase dashboard, SQL
> editor, live-database, migration-application, live-RLS and deployment work for
> WHATSNEW2 is owned by ChatGPT.** This document's live sections (§13, and the
> live state in §15) are a record of work already completed and independently
> re-verified by the owner — they are not a standing licence for anyone else to
> operate the database. Anything left to do against live infrastructure belongs
> to that owner, not to this branch. What
changed is only *where the switch and the notices live*. Nothing in Revisions
15–20 was touched: the four books, Patch Report, the radio, the Hall shelves,
the background crop, the entrance choreography, Mogzy's position and size, the
Commons, scroll snap, the scroll hints, Premium, Pro Play, community links and
the global footer are all unchanged, and the mark, the parchment notice and the
seen-state behaviour are byte-identical to what WHATSNEW1 approved.

### 1. Objective

WHATSNEW1 made `src/lib/lol/academy-updates.ts` the authority: the master
switch was a constant and the announcements were an array, both compiled into
the build. Publishing an announcement therefore meant editing source, and
turning the feature on meant a deploy.

WHATSNEW2 moves both into the database, so the owner's whole workflow is:

> Admin → Studio → Academy Updates → write → publish → turn the switch on

Every one of those takes effect on a visitor's **next page load**. No commit,
no deploy, no Lovable publish.

### 2. Storage authority

Two stores, both of which already existed. **No new settings system, no new
admin gate, no backend API, no CMS framework.**

| What | Where | Why there |
|---|---|---|
| Master switch | one row in `public.app_settings`, key `academy_updates_enabled`, value `{"enabled": bool}` | Mogzy's one global-settings store. It is parsed by the existing pure contract `src/lib/platform-policy/policy.ts`, which means `LolHub` gets the switch out of the `useAppSettings()` call it was **already making** — no extra request, no loading flash. |
| The announcements | new table `public.academy_updates` | Modelled column-for-column on the conventions `public.blog_posts` established: published-rows-are-public RLS, an admin FOR ALL policy, and the shared `update_updated_at_column()` trigger. |

```sql
CREATE TABLE public.academy_updates (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title        text NOT NULL DEFAULT '',
  body         text NOT NULL DEFAULT '',
  publish_date date NOT NULL DEFAULT CURRENT_DATE,
  published    boolean NOT NULL DEFAULT false,
  cta_label    text,
  cta_href     text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
```

Three deliberate choices worth recording:

- **`published` is a boolean, not a status enum.** It maps 1:1 onto the
  `published` field WHATSNEW1's selectors already read, so those selectors and
  their tests survive untouched — and it leaves no room for the `scheduled`
  state that was explicitly out of scope.
- **`publish_date` is a `date`, not a `timestamptz`.** It is written by hand,
  sorted on, and rendered as "5 September 2026". It is a calendar date, not an
  instant, and a timestamptz would drag a timezone into a value that has none.
- **`id` is a server-generated uuid that is never rewritten.** See §7 — this is
  the whole reason a correction is not an announcement.

Nothing else was added. No slug, no author, no tags, no view counter.

### 3. Security model

`supabase/migrations/20260906120000_whatsnew2_academy_updates.sql`:

```sql
-- a visitor: published rows, and nothing else
CREATE POLICY ... FOR SELECT USING (published = true);
-- an admin: every row, drafts included
CREATE POLICY ... FOR SELECT USING (public.has_role(auth.uid(),'admin'::app_role));
-- an admin: create / edit / publish / unpublish / delete
CREATE POLICY ... FOR ALL
  USING      (public.has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));
```

**The draft guarantee is Postgres's, not the client's.** A draft's title and
body are never sent to a non-admin session, so the promise does not depend on
the frontend remembering to filter. `listPublishedUpdates()` does add
`.eq("published", true)`, but that narrows a permission the caller already
lacks — delete the line and a visitor still sees only published rows.

`has_role(uid,'admin')` already returns true for `master_admin` (migration
`20260223120918`), so this one predicate covers both roles and the owner cannot
be locked out by holding the higher role and not the lower one.

**Both admin policies are scoped `TO authenticated`, and that is load-bearing.**
EXECUTE on `public.has_role` is granted to `authenticated` but **not** to
`anon`. An admin policy left at the default `TO PUBLIC` lands in the anon role's
policy set, so an anonymous visitor's read of *published* rows fails with
`42501 permission denied for function has_role` — the public surface breaks on a
policy that was only ever meant for admins. `public.blog_posts` already does
this live (its policies are `TO authenticated` even though its migration file
does not say so), which is why the shape could not be copied from source and had
to be measured. Two tests pin it, in both directions: the admin policies must
carry `TO authenticated`, and the public read policy must **not**. `AdminRoute`
and `AdminAuthGate` remain client-side chrome; they stop the UI advertising a
destination the viewer cannot use, and they are not the boundary.

The switch rides the `app_settings` policies that were already there: public
SELECT, admin-only INSERT/UPDATE, with `updated_by` stamped by the existing
`stamp_app_settings_audit` trigger from the verified session rather than the
client. **No service-role key anywhere in the frontend** — asserted by a test.

Only two rows' worth of information is exposed to the public: published
announcements, and the one boolean saying whether the surface is on. The
existing public read of `app_settings` is unchanged; no unrelated setting was
widened.

### 4. Admin route and IA

`/admin/academy-updates` — a child of the `/admin` layout route, so it inherits
that route's gate and carries **no `AdminRoute` of its own** (per the Admin
reorganization: re-adding one inside the shell is the pattern that was removed).

Listed in `src/lib/admin/admin-registry.ts` as tool `academy-updates` under
**Studio**, in a new `academy-updates` section beside Blog. Registered
`dangerLevel: "mutates-production"`, because publishing changes what every
visitor sees. `admin-registry.routes.test.ts` parses `App.tsx` and fails if the
registry and the router ever disagree.

### 5. Authoring workflow

The page is one screen. Top to bottom:

1. **Status band.** `Status: ON|OFF`, then a sentence stating the *conclusion* —
   what a visitor can see right now — then the published and draft counts. The
   conclusion is separate from the switch on purpose: **"on with nothing
   published" shows exactly as much as "off"**, and an owner reading only the
   switch would draw the wrong inference. Both of those states print their own
   sentence.
2. **The switch**, labelled "Show on /lol".
3. **New update** → an inline editor: title, date, body, optional button label
   and link, a Save button, and a live preview.
4. **The list** — `Status | Date | Title | Actions`, newest first, drafts and
   published visually distinct (a filled green chip vs a dashed outline).
   Actions are edit, publish/unpublish, delete.

**No rich text**, by decision: the Hall renders the body as plain text, so
anything richer would be a promise the surface does not keep.

**The preview mounts the real `AcademyUpdates` component**, not a copy of it —
so there is nothing to keep in step and it cannot drift. It uses the `mobile`
variant, because that one is an ordinary block in the flow while the `hall`
variant positions itself against Mogzy, who is not on an admin page. That is
the *only* reason the component gained a prop: `mobileWrapperClassName`, which
exists to drop the `md:hidden` the Hall needs and the admin page does not. The
Hall passes nothing and is unaffected.

Writing rules the page enforces:

- Title and body are required. A blank notice cannot be saved, and cannot be
  published even if a row somehow already exists blank — a draft is allowed to
  be empty, a published notice is not.
- Creating always produces a **draft**. Publishing is a separate act on a row
  that already exists and can be read back, so nothing reaches the Hall on the
  same click that created it.
- Editing never touches `published`, and publishing never touches content.
- The CTA is validated against the *same rule the renderer applies*, by asking
  `resolveUpdateCta` about a probe entry — one rule, so the form and the
  renderer cannot drift. An in-app route (`/…`) or an absolute `https://` URL
  is accepted; anything else, `javascript:` and bare `http:` included, is
  refused. Both fields blank is valid and means "no button"; one filled and the
  other blank is refused.

### 6. Master-switch workflow

Turning **ON** is confirmed, and the confirmation states the real consequence,
including the awkward case: *"Nothing is published yet, so visitors will still
see nothing until you publish an update."* Turning **OFF** is not confirmed —
it withdraws a surface, which is always the safe direction and is instantly
reversible.

Ordinary editing is never confirmed. Only deletion is, being permanent.

Neither the switch nor any row write is **optimistic**: the page re-reads and
displays the server's answer, never its own assumption. A refused write leaves
the displayed state exactly as it was and prints the refusal, so the status
line can never claim a feature is live when Postgres said no.

### 7. Seen state — audited, and deliberately unchanged

Still `lol:academy-updates:seen_id` in localStorage, still one id, still
browser-local. **Not migrated to Supabase or to account state.**

The audit the brief asked for, and its conclusion:

- **Editing an old notice does NOT re-announce it.** The `id` is a uuid
  generated once by the database and never rewritten, and the seen check is
  `stored !== newestPublishedId`. A correction to a title, body, date or CTA
  leaves the id alone, so a browser that had read it still has. Moving from
  hand-written `YYYY-MM-DD-slug` ids to uuids preserves this exactly.
- **Publishing something new DOES re-announce.** New row, new id, newest id
  changes, the mark lights up. Intended.
- **Two pre-existing quirks are preserved rather than "fixed".** Unpublishing
  the newest notice makes an older one newest, which re-nudges everyone; and
  back-dating an old notice above the current newest does the same. Both were
  WHATSNEW1's semantics — flipping `published` in the array did the same thing —
  both need a deliberate admin action, and changing either would be a
  redesign of an approved surface. They are recorded here, not altered.

### 8. Public read behaviour

`LolHub` passes the switch down; `AcademyUpdates` fetches only when it reads
true. So **with the feature off the Hall makes no query on this feature's
behalf at all** — off is free, not merely invisible.

The Hall mounts the feature twice (the desktop mark and the mobile row), which
initially produced two identical requests per enabled load. `listPublishedUpdates`
now coalesces concurrent callers onto one in-flight promise, cleared the moment
it settles. That is request coalescing, **not caching**: a later visit still
reads fresh rows, and a failed read is never remembered as an answer.

Rows are validated, not trusted. A row without a string `id`, or whose
`published` is not a boolean, is dropped — the id is the seen-state key and
`published` is the draft guarantee restated, so a row that cannot answer either
question is not a row to render. A half-written CTA (one field only) is dropped
rather than rendered as a dead button.

### 9. Failure behaviour

**Fail closed, in every direction, onto the same nothing.** The switch off, the
published list empty, the query rejected by RLS, the network down, the
migration not yet applied, the payload malformed — all render identically: no
mark, no panel, no empty wrapper, no layout shift, no spinner. The Hall is
never blocked waiting: the read is fired from an effect and the surface simply
stays absent until there is genuinely something to say.

An unreadable `app_settings` leaves the policy on its fail-closed default of
`false`, so an outage can never make an announcement surface appear.

The admin page is the one place that *does* report failure, because an admin
looking at an empty list needs to know whether it means "nothing written yet"
or "the read failed" — those demand opposite responses.

### 10. Migration from WHATSNEW1

The migration inserts **zero announcements** and seeds the switch **off**.

WHATSNEW1's two entries were labelled in their own source comment as "clearly
marked examples for development and tests — not production copy", so they were
not carried over even as drafts: throwaway text one click from being published
is not a state worth creating. They survive as fixtures inside the test files,
which is where they belonged.

`ON CONFLICT (key) DO NOTHING` makes a re-run a no-op and, critically, never
resets a value the owner has already changed in Admin.

`src/lib/lol/academy-updates.ts` keeps the type, the ordering rule, the
fail-closed activation rule and the CTA validators. It **no longer exports
`ACADEMY_UPDATES` or `ACADEMY_UPDATES_ENABLED`**, and a test asserts their
absence. Two production authorities is the failure this workstream existed to
remove: an owner editing an array in source while the database said something
else would have had no way to tell which one visitors were reading.

### 11. Files

| File | Change |
|---|---|
| `supabase/migrations/20260906120000_whatsnew2_academy_updates.sql` | **New.** The table, its RLS, its trigger, and the switch's seed row. |
| `src/lib/lol/academy-updates-store.ts` | **New.** Every Supabase call this feature makes, in one file. |
| `src/pages/admin/AdminAcademyUpdates.tsx` | **New.** The owner's desk. |
| `src/lib/lol/academy-updates.ts` | Lost the update list and the enabled constant; kept types and selectors; gained `validateCtaHref` and `NO_ACADEMY_UPDATES`. |
| `src/lib/platform-policy/policy.ts` | Added `POLICY_KEYS.academyUpdatesEnabled` and `policy.academy.updatesEnabled`, default `false`. |
| `src/components/lol/AcademyUpdates.tsx` | Fetches published rows when enabled; `enabled` is now passed in; added `mobileWrapperClassName` for the admin preview. **No presentation change.** |
| `src/pages/LolHub.tsx` | Two lines: each mount now passes `enabled={settings.policy.academy.updatesEnabled}`. |
| `src/App.tsx` | One lazy import and one route, `academy-updates`, inside the `/admin` layout route. |
| `src/lib/admin/admin-registry.ts` | One Studio section and one tool entry. |
| `src/lib/lol/academy-updates-seen.ts` | **Untouched.** |
| `src/index.css` | **Untouched.** |

### 12. Tests — 475 passing across 19 files

New: `academy-updates-store.test.ts` (28), `AdminAcademyUpdates.test.tsx` (38),
`AdminAcademyUpdates.route.test.tsx` (9), `src/test/security/whatsnew2AcademyUpdates.test.ts` (19).
Extended: `AcademyUpdates.test.tsx` 24 → 30, `LolHub.test.tsx` 81 → 85,
`policy.test.ts` 36 → 48.

Coverage by the brief's checklist: feature off → nothing; on with nothing
published → nothing; drafts never render; published render; newest first; a
failed fetch → nothing and the Hall unaffected; seen/unseen lifecycle
preserved; internal, external and rejected CTAs. Admin: non-admin refused
(signed-out, and signed-in without a role), admin and master_admin admitted, no
flash while the check is in flight, create/edit/publish/unpublish/delete,
validation, malformed CTA rejected, and the status line accurate in all four
switch × content combinations. Database: the migration's policies parsed and
asserted — one public SELECT that is `published = true` and carries no `OR`,
every write policy admin-gated, the FOR ALL policy carrying both `USING` and
`WITH CHECK`, the switch seeded off with `ON CONFLICT DO NOTHING`, and no
announcement seeded at all.

> The RLS tests are contract tests over the migration SQL. They are no longer
> the only evidence: §13 records the same rules executed against the real
> database with a real anonymous context and the real owner admin account.

`tsc` reports 11 errors, all in the documented pre-existing baseline and none
in a file this work touched. `eslint` is clean on every touched file.
`vite build` succeeds.

### 13. Live Supabase verification — migration applied 2026-09-06

**Applied by hand in the Lovable Cloud SQL editor**, connected as `postgres`,
wrapped in `BEGIN; … COMMIT;`, per `docs/fb1-feedback-rollout.md` and
`docs/community-m2-m3-rollout.md`. The CLI was **not** used and the project was
**not** linked: repo and remote ledger have ~117 drifted versions and a
`db push` would replay them. Recorded afterwards as
`supabase_migrations.schema_migrations` version `20260906120000`, name
`whatsnew2_academy_updates`, created_by `sql-editor@whatsnew2`.

Read-only preflight first, which confirmed every dependency the migration
assumes actually exists live: `has_role(uuid,app_role)`,
`update_updated_at_column()`, `stamp_app_settings_audit()`, `app_settings`,
pgcrypto, PostgreSQL 17.6, connected as `postgres`, `academy_updates` absent and
the switch row absent.

#### 13.1 The defect the live run found

The migration as first written created its two admin policies at the default
`TO PUBLIC`. Against the real database that broke the **public** read:

```
anon (apikey only) → GET /academy_updates?published=eq.true
  → 401 {"code":"42501","message":"permission denied for function has_role"}
```

The cause and the fix are in §3. Two details are worth keeping:

* **`blog_posts` — the pattern this feature was modelled on — does not have the
  bug, and its migration file cannot tell you why.** Live, its admin policies
  carry `polroles = {16481}` (`authenticated`); mine carried `{0}` (PUBLIC).
  That divergence exists only in the database, so no amount of reading the repo
  would have surfaced it.
* **An in-session `SET LOCAL ROLE anon` is NOT a faithful simulation** of a
  PostgREST anon request. `blog_posts` fails that way too while succeeding over
  REST, so it produces false positives. Only REST results were trusted here.

The **existing** migration file was corrected rather than a second migration
being added, so one file continues to describe the live database; the two
corrective `DROP POLICY` / `CREATE POLICY` statements were then re-run live
(idempotent by construction). Final live `polroles`: admin policies
`authenticated`, public read `PUBLIC`.

#### 13.2 Live RLS results

Anonymous context (publishable key, no session), against a **real draft row and
a real published row** created by the owner account — not against an empty
table, which made the first UPDATE/DELETE attempts vacuous:

| Check | Result |
|---|---|
| SELECT published rows | `[] → 200`, and the published row once it existed |
| SELECT the draft (unfiltered) | `[]` — invisible |
| SELECT the draft **by its exact id** | `[]` — invisible |
| INSERT | `401` — `new row violates row-level security policy` |
| UPDATE the real row | 0 rows affected; row verified **unchanged** afterwards |
| DELETE the real row | 0 rows deleted; row verified **still present** afterwards |
| PATCH the switch | `401` |
| Unrelated `app_settings` reads | `200` — the existing public contract is untouched |

Owner admin context (`mlmitchaman@gmail.com`, admin confirmed through the same
`has_role` RPC `AdminRoute` uses), driven **in-page on mogzy.lol so the session
token never left the browser**: create draft (`201`, `published:false` on
create), read all including drafts, edit title/body/date/CTA (`200`,
`updated_at` trigger fired), publish, unpublish, delete, and toggle the switch
both ways (`updated_by` stamped by the trigger from the verified session).

#### 13.3 Public end-to-end, against the live database

Local WHATSNEW2 build, real production Supabase, ordinary **anonymous** visitor
session — which is what a real visitor is, since `require_auth` is
`{"enabled": false}` and the app signs everyone in anonymously.

*Desktop, 1440×900:* the red `!` appears; disc **28×28**; hit target **44×44**;
glyph `rgb(182, 58, 53)` at **17px**; the panel opens carrying the **database**
row (entry `data-update-id` is the row's uuid); the CTA renders as an in-app
link to `/lol/ranked`; seen-state flips on open — `aria-label` goes
"Academy Updates — new" → "Academy Updates", the glyph drops to `rgb(58,44,18)`,
and `lol:academy-updates:seen_id` stores **the database uuid**, which is the
seen-state contract working on real ids. No horizontal overflow.

*Mobile, 390×844:* the labelled row appears with a 44px hit height and opens the
same database content. No horizontal overflow.

*Request count:* **exactly one** `academy_updates` request despite both mounts —
coalescing confirmed live.

*Geometry:* the mark's measured centre is `793.1, 634.9` where WHATSNEW1
recorded `800.6, 634.9`. **Not a regression.** This environment renders a 15px
classic scrollbar, so the content centre is 712.5 rather than 720; Mogzy's own
centre measures 712.5 and the mark sits **80.6px to his right** — the identical
offset WHATSNEW1 recorded. The y coordinate is unchanged to the decimal.

*Admin route gate, live:* an anonymous session navigating to
`/admin/academy-updates` is refused and redirected to `/`; the page never
mounts, no status band, no editor.

#### 13.4 Fail-closed states, all three on the real database

| State | Result |
|---|---|
| A — switch **OFF** + a published update | zero Academy Updates DOM nodes; central lane child count 2; all 35 book links intact |
| B — switch **ON** + zero published updates | zero Academy Updates DOM nodes; lane child count 2 |
| C — switch **ON** + a published update | mark, panel and CTA render from the database |

#### 13.5 What was NOT verified, and why

**The admin page was not driven through `AdminAuthGate` while authenticated.**
The gate needs an admin Supabase session on the origin serving the WHATSNEW2
build, which is `localhost`; that origin holds only an anonymous session, and
signing in requires entering a password, which I will not do. Production cannot
substitute, because `/admin/academy-updates` is not deployed there yet.

What *is* covered instead: the gate provably refuses a non-admin live (§13.2);
every database operation the page performs was executed against the real
database with the real owner admin account and behaved exactly as the page
expects; and the page's own 38 tests cover its states. The remaining gap is
purely "a human clicking the real buttons behind the real gate", and it is
cheapest to close after deploy, on mogzy.lol, where the owner is already signed
in.

#### 13.6 Two incidental findings

* The Lovable Cloud SQL editor had a **leftover "MOGZY USER RESET" script** in
  its buffer, building `doomed_users` / `doomed_profiles` from `auth.users` and
  keeping only the owner's id. It was cleared, **not run**. Anyone opening that
  editor and pressing Run would have executed it.
* Lovable's own project view currently reports **"Build unsuccessful / Preview
  is out of date"**, unrelated to this work.

#### 13.7 Structural proof from the earlier pass, still valid

Dormancy was proved structurally rather than by pixel diffing (two captures of
`origin/main` against itself differ by 0.5–5.6% of pixels, because grain and
gradients rasterise nondeterministically and champion art loads off the
network): full rendered markup plus the measured box of all 422 elements plus
`scrollHeight`, compared against `origin/main` at 1440×900, 1920×1080, 1440×768
and 390×844 — identical at every viewport.

### 14. Deployment requirements

1. ~~**Apply the migration.**~~ **DONE 2026-09-06**, and recorded in the ledger.
   The live database is the corrected `TO authenticated` shape.
2. **Merge and publish** the frontend. Until then production is inert: the
   deployed WHATSNEW1 build reads a compiled-in `false`, so the database switch
   has no effect there whatsoever — which is exactly why the switch could safely
   be toggled on and off during this verification.
3. **Regenerate `src/integrations/supabase/types.ts`** — the table now exists, so
   this is the first moment regeneration produces correct output. The single
   documented cast in `academy-updates-store.ts` then becomes redundant and can
   be deleted without touching a caller.
4. **Deployed-admin smoke check — the one verification still outstanding.** After
   merge and publish, sign in as an admin on mogzy.lol and walk
   `/admin/academy-updates` once behind the real `AdminAuthGate`: confirm it
   appears under Studio in the admin navigation, that STATUS reads **OFF** with
   0 published, then create a draft, edit it, confirm the preview renders the
   real notice, publish it, confirm the Published chip, and delete it again.
   This is the gap §13.5 records and the only WHATSNEW2 check that a local
   environment cannot close.
5. **The owner turns it on.** A product decision, not a deployment step, and
   nothing here presumes it.

Steps 2 and 3 are ordinary frontend release work. Steps 1 and 4 touch live
infrastructure and are **ChatGPT's**, per the ownership note at the top.

### 15. Current final state

**Production database, verified after cleanup — and independently re-verified by
the owner on 2026-09-06, who confirmed every line below:**

* `public.academy_updates` — exists, RLS enabled, **0 rows**
* `academy_updates_enabled` — **`{"enabled": false}`**
* policies — admin ×2 `TO authenticated`, public read `TO PUBLIC`
* ledger — `20260906120000 / whatsnew2_academy_updates` recorded
* anonymous read — `[] 200`; the public Hall renders **zero** Academy Updates UI

The temporary verification announcement was deleted; no test copy remains and
the feature is off. Frontend: 475 tests passing across 19 files, eslint clean on
every touched file, `vite build` succeeds, `tsc` unchanged at the documented
11-error baseline with nothing in a touched file. The migration file matches the
live database.

### 16. Next task

None claimed. WHATSNEW2 is closed. The stop conditions hold: no analytics, no
scheduled publishing, no notifications, no image uploads, no rich text, no
generated announcements, no git integration, no WHATSNEW1 redesign, no other
hub feature touched.

---

## Revision 2026-09-05 — WHATSNEW1 / ACADEMY UPDATES — **BUILT, SHIPPED DORMANT**

**Status:** complete and merged-ready on branch `whatsnew1`, worktree
`/Users/macmoney/mogsy-wt-whatsnew1`, based on `origin/main` @ `c65bbe17`.
**The feature is DISABLED and must stay disabled until the owner decides
otherwise.** Nothing in Revisions 15–19 was touched: the four books, Patch
Report, the radio, the Hall shelves, the background crop, the entrance
choreography, the Hall sounds, Mogzy's position and size, the Commons, scroll
snap, the scroll hints, Premium, Pro Play naming, community links and the
global footer are all byte-identical.

### 1. Purpose

A small owner-authored news channel on the /lol Hall — "Academy Updates" —
for telling players what changed. It exists so that when real users arrive in
a few weeks there is a finished surface waiting, rather than a feature built
under time pressure.

It is **manually written**. It does not read git history, changelogs, deploys,
the database, or `src/lib/lol-changelog.ts` (which is the *internal developer*
log behind `/lol/dev-changelog` — a different artefact for a different reader,
deliberately not wired in).

### 2. Files

| File | Role |
|---|---|
| `src/lib/lol/academy-updates.ts` | **The authority.** Master switch, the entries, and the selectors. This is the only file the owner edits. |
| `src/lib/lol/academy-updates-seen.ts` | One localStorage key holding one id: the newest update this browser has opened. |
| `src/components/lol/AcademyUpdates.tsx` | The mark and the parchment notice. Both the Hall and the mobile presentations. |
| `src/pages/LolHub.tsx` | Two mount points, 2 lines of JSX. |
| `src/index.css` | `academy-updates-pulse` keyframes + its reduced-motion cancel. |

No Supabase, no table, no API, no CMS, no admin screen, no route, no
notification infrastructure, no account-level read tracking.

### 3. Activation

Three edits, all in `src/lib/lol/academy-updates.ts`:

1. **Add** — prepend an entry to `ACADEMY_UPDATES` with `published: false`. A
   draft is invisible to visitors, so a half-written entry is safe to commit
   and deploy.
2. **Publish** — flip that entry's `published` to `true`. Authored order does
   not matter; the surface sorts by `date`, newest first.
3. **Enable** — set `ACADEMY_UPDATES_ENABLED = true`. This is the master
   switch and it currently ships `false`.

An entry is `{ id, date, title, body, published, cta? }`. The `id` is what the
browser remembers as seen, so it must be stable and never reused — convention
`YYYY-MM-DD-short-slug`. A `cta.href` is either an in-app route (starts with
`/`) or an absolute `https://` URL; anything else is dropped rather than
rendered, so a typo cannot become a `javascript:` anchor.

The file carries this same guide as a comment block at the top, so it is
readable without this document.

### 4. Current state — dormant, and what dormant means

`ACADEMY_UPDATES_ENABLED` is `false` and both authored entries are drafts, so
the feature is inert twice over. The two entries are **clearly marked examples
for development and tests** — not production copy. Delete or overwrite them
when the first real announcement is written.

Dormant means the component returns `null` before rendering anything: no mark,
no panel, no hidden clickable region, no empty wrapper, no layout shift.

> The first cut got this wrong in a way worth recording. The positioning layer
> was a `<div>` in `LolHub.tsx` wrapping `<AcademyUpdates />`, and it kept
> rendering after the component returned null — an invisible layer sitting over
> Mogzy. Tests keyed on `data-testid` all passed, because the wrapper had none.
> A DOM-and-geometry diff against `origin/main` is what caught it. The layer now
> lives **inside** the component, and `LolHub.test.tsx` pins the central lane's
> child count at 2 so it cannot come back.

### 5. Activated UX

A "!" in **Academy red** (`#b63a35`, the `ACADEMY_RED` constant in
`AcademyUpdates.tsx`) on a 28px parchment disc, just off Hall Mogzy's right
shoulder (`--mogzy-w * 0.42`,
`--mogzy-h * 0.58` from his float anchor) — a 22px mark inside a 44×44 hit
target. Clicking it opens a compact parchment notice **centred on Mogzy**, not
on the mark: hung off the mark it drifted right and leaned over the Patch
Report volume. It uses the guide speech bubble's own parchment gradient and
Cinzel/navy ink, so the two read as the same material. Newest three entries,
then it scrolls; each is date, title, body, optional CTA, with older entries at
80% opacity.

The red is a rubricator's vermilion — the pigment a scribe reserved for the
line that matters — so on parchment it reads as an accent, not an error state
or a notification dot. **Only the glyph takes it**: the circle keeps its
parchment fill, brass border and shadow, which is what stops the mark becoming
a filled badge.

> Sized twice. The first cut was a 22px disc with 13px ink in a dark oxblood
> (`#7a2226`). It was legible up close and invisible at full Hall scale — which
> is the only scale that matters — so it went to **28px with 17px ink** in the
> brighter red. The glyph grew with the circle so the character still fills it.
> The button stays 44×44 and the glyph stays centred in it, so the mark's
> measured centre is `800.6, 634.9` before and after: the disc grew
> symmetrically and needed no compensating offset. It is the **unseen** treatment only; a
read notice returns to the ordinary ink `#3a2c12` at 70% **at the same size**,
so the colour carries "new" and nothing moves when a notice is read. Colour is never the sole carrier of the state: the accessible
name still says "Academy Updates — new". The mobile row is unchanged, on the
ordinary ink in both states.

**Why it is not part of `MogzyHubGuide`.** The guide renders inside a wrapper
the Hall marks `aria-hidden` and `pointer-events-none`, because the speech
bubble is decoration. A focusable, labelled button cannot live in an
`aria-hidden` subtree. So `AcademyUpdates` mounts as a **sibling** that repeats
the guide's geometry (`top-[3.25rem] -bottom-[3.25rem]`, `bottom-[16%]`,
centred, the same `clamp(97px, 9.7vw, 167px)` width term) and lands on Mogzy
without either component importing the other. `MogzyHubGuide` is unmodified:
its hover glide, facing and click reaction are untouched.

The two geometry constants are copied, not shared — if Mogzy's size or anchor
changes in `MogzyHubGuide`, change them here too. Both carry a comment saying so.

**Mobile.** The mobile Hall has no Mogzy — it is a list of Hextech panels — so
the desktop treatment is not forced onto it. The mark becomes a compact
labelled row placed after the four destinations, so primary navigation keeps
the top of the list, and the panel opens inline beneath it.

### 6. Seen state

`lol:academy-updates:seen_id` in localStorage, one id, wrapped in try/catch on
every access (the repo's existing idiom — `src/lib/quiz/onboarding-gate.ts`).
A browser that has stored nothing counts as unseen, so a first-time visitor is
nudged once. Opening the panel stamps the newest id — opening *is* reading, and
a user who opens it and navigates away should not be re-nudged. Once seen, the
mark stays available but drops to 70% opacity and loses its halo.

Every failure degrades to "nothing seen", which over-shows a subtle dot rather
than suppressing a genuine announcement. No account sync, no Supabase, no
notification centre.

The "new" state is carried in the button's **accessible name**
("Academy Updates — new"), never by the halo alone, so cancelling the animation
under `prefers-reduced-motion` loses no information.

### 7. Tests

`src/components/lol/AcademyUpdates.test.tsx` — 24 tests: the shipped default is
off with zero published entries; disabled renders nothing; enabled-with-no-
published-entries fails closed; the affordance appears; open/close by mark, by
close button, by Escape; drafts excluded; ordering independent of authored
order; the three-entry cap and its remainder line; internal vs external vs
rejected CTAs; the red-while-unseen / ordinary-ink-when-seen glyph with its
size, border and shadow asserted unchanged across both states; the mobile row
keeping both the ordinary ink and its smaller size; and the full seen-state
lifecycle across simulated visits.

`src/pages/LolHub.test.tsx` — 3 added (81 total, was 78): no affordance
anywhere in the dormant Hall, the guide's `aria-hidden` lane is untouched, and
the central lane's child count is pinned.

Final verification run: **173/173 pass** across every Hall suite
(`AcademyUpdates`, `LolHub`, `academy-layout`, `HexPanelLink`,
`HubPremiumPanel`, both `LolWelcomeIntro` suites), eslint clean on every
touched file, `vite build` succeeds, `tsc` reports nothing in these files (the
pre-existing repo errors listed in the frontend baseline are unchanged).

**Visual proof.** Pixel diffing the Hall is worthless here: two captures of
`origin/main` against *itself* differ by 0.5–5.6% of pixels, because the grain
and gradient dither rasterise nondeterministically and the champion art loads
off the network. So dormancy was proved structurally instead — full rendered
markup plus the measured box of all 422 elements plus `scrollHeight`, compared
between `origin/main` and this branch at 1440×900, 1920×1080, 1440×768
(short-height desktop) and 390×844 (mobile): **identical at every viewport.**

The activated state was screenshotted at the same four viewports, and verified
in the real build to be keyboard-reachable (25 tabs — after the four books,
which is the right priority), to open on Enter, to move focus into the panel,
to close on Escape with focus returned to the mark, to carry a 44×44 hit
target, and to have its halo cancelled under reduced motion with the accessible
name unchanged.

The colour and sizing passes were re-verified the same way. In the browser,
unseen reads `color: rgb(182, 58, 53)`, `font-size: 17px`, a 28×28 circle on
the parchment gradient with the brass border, a 44×44 hit target, and a glyph
centre of `800.6, 634.9`. Seen reads `rgb(58, 44, 18)` at `opacity: 0.7` with
**every one of those geometric values identical**, so neither the colour nor
the enlargement contributes any layout shift between states. Under reduced
motion the red is retained while `animation-name` resolves to `none`, and the
mark keeps its focus ring, Enter-to-open and Escape-to-close-with-focus-return.

Dormancy was re-proved against a freshly built `origin/main` after each pass —
identical markup, boxes and `scrollHeight` at all four viewports. Note that
`origin/main` advanced to `81bfda5a` ("Deployed 4 Edge Functions") during this
work, and the final dormancy proof above was run against **that** build, not
the older base. Those three upstream commits touch only `public/sitemap.xml`
and the generated `src/integrations/supabase/types.ts` — no overlap with any
WHATSNEW1 surface. `origin/main` moves often; re-fetch before merging.

### 8. Next task

None claimed. WHATSNEW1 is closed. Do not activate the feature in production —
that is the owner's decision, and step 3 of §3 is the whole of it.

---

## Revision 2026-09-05 — COMMONS VISUAL POLISH — **COMPLETE / APPROVED**

**Status:** the Academy Commons visual-polish workstream is finished and signed
off by the owner. Four passes — legal rail, environmental Mogzy, background
treatment, seam audit — each reviewed and approved in turn. Branch
`hub/two-screen-academy`, worktree `/Users/macmoney/mogsy-wt-hub2screen`, based
on `origin/main` @ `e1bec908`. **Pushed, not merged.** What's New, search,
Help/FAQ and community URLs remain untouched and out of scope.

Everything in Revisions 17–18 stands. This revision records what was added on
top and what was deliberately NOT changed.

---

### 1. What shipped in this workstream

| Pass | Result |
|---|---|
| **Legal walnut rail** | The legal set stops being a web footer laid over the paint |
| **Commons Mogzy** | A static environmental character at the reading table, occluded by the desk |
| **Background treatment** | Grade + vignette + grain + four selective de-emphasis masks |
| **Seam audit** | Concluded **NO CHANGE**; the transition ships exactly as it was |

Two files: `src/index.css` (stage block only) and
`src/components/lol/AcademyCommons.tsx` (one import, one custom property, two
`aria-hidden` divs, doc comments). No new component, no new asset, no new
React state, no route, no backend, no Supabase.

---

### 2. The legal rail — the one mount that keeps coded joinery

Every other stage mount sheds its coded frame because the painting already has
one. The panelled band at y 0.812–0.920 has **no board**, so switching the
chrome off there (`background-image: none; box-shadow: none`) is what produced
the floating-footer read.

* `.academy-commons-plinth` keeps the measured mount box **unchanged**
  (`0.2320 / 0.8120 / 0.5540 / 0.1080`) and becomes a flex frame.
* `.academy-commons-plinth-inner` is the board: lit arris → chamfer → walnut
  face → shallow step → dark underside, one gilt hairline, contact shadow, and a
  `::before` top plane. **Sized by its content and centred** — 0.0821 of artwork
  height, not the full 0.108, so the painted panel mouldings still read either
  side of it, and a third disclaimer line grows into the band rather than into
  the carpet.

Two things decided the result, and both were wrong on the first attempt:
**hard vertical ends** are what make a board read as a pasted card, so both ends
now fall away into the panelling over ~27 artwork px (face and top plane
together); and the ramp is pitched far darker than `--shelf-face`, which stood
~4× off paint that averages `rgb(24,14,12)`. The planes are separated by the lit
arris and the dark underside, not by overall brightness.

---

### 3. Mogzy in the Commons — environmental, not a guide

No state, no interaction, no motion, `aria-hidden`, `pointer-events: none`,
nothing in the tab order. `MogzyHubGuide` is **not** reused.

**Placed by his content box, never his canvas.** `mogzy-mascot-base-v1.png` is
1024×1536 but the character occupies only x 41–959, y 103–1216 — the bottom
fifth of the file is empty. The mount is back-solved so the CONTENT lands where
it should. Swap the pose file and these must be re-solved.

| | `--mx` | `--my` | `--mw` | `--mh` |
|---|---|---|---|---|
| `.academy-commons-mogzy` | 0.0639 | 0.5585 | 0.1026 | 0.2735 |

Content lands at x 0.068–0.160, y 0.5769–0.775 — 10.2% of viewport width at
1440×900, clearing the short candle by 0.012 of the artwork and Premium's live
content (x 0.270) by a wide margin.

**The occlusion technique.** `.academy-commons-desk` is a **second copy of
`.academy-commons-art`** — identical `background-size`/`position`/`filter` on an
element with the identical box — clipped with
`clip-path: inset(calc(imgY + imgH * 0.7566) 0 0 0)` and painted at z-index 2
over Mogzy at z-index 1. Because both layers rasterise from the same custom
properties on the same box, **a seam is impossible by construction**. 0.7566 is
the reading table's front arris, measured off a brightness profile of the file
(the lit top plane begins at 0.7481). He is a ghost with no feet, so nothing
grounds him except this occlusion plus one soft ambient pool.

> **Do not** attempt this by positioning a small element at an artwork offset and
> compensating with a negative `background-position`. The element's own box
> rounds to device pixels and the background offset does not, so the copy lands
> up to half a pixel off and ghosts.

**Grade.** `filter: brightness(0.74) saturate(0.82)` on the mount — the asset is
untouched. Product art is lit for a white page; ungraded he pulled ahead of the
noticeboard in the reading order, which is the one thing an environmental
character must not do. 0.64 loses the blue identity; 0.82 is still too hot.

**Aspect gate, not a width gate.** `@media (min-aspect-ratio: 20/13)` (1.538) is
exactly where the side crop reaches his left content edge (0.068); below it he is
withheld rather than sliced. Being a CSS **background** rather than an `<img>`,
the 2.2 MB file is never fetched where he is hidden — a `display:none` `<img>`
still downloads.

---

### 4. Background treatment — where it lives, and why it is declared twice

The treatment rides the `background-image` stack of **both** artwork layers,
written once against both selectors. This is forced, not stylistic: the desk
re-plates raw artwork below y 0.7566, so grading only `.academy-commons-art`
is wiped across the full width with a seam along the clip. The upside is the
z-order it produces for free —

```
wall → art + treatment → Mogzy (z1) → desk + identical treatment (z2) → live mounts (z10)
```

— so Mogzy sits *between* the two treated layers and is never dimmed or grained,
and **no treatment ever lands on live text**.

* **Grade:** `saturate(0.9) contrast(0.99) brightness(0.985)`.
* **Vignette:** `radial-gradient(farthest-corner at 50% 42%, …)`, transparent to
  54%, 0.15 at 78%, 0.50 at the corners. Dark navy, never black.
* **Grain:** inline SVG `feTurbulence`, 180px tile, **screen space**, opaque
  mid-grey composited with `background-blend-mode: overlay`.
* **Masks (artwork space, peak alpha):** side table `11%×13% at 84% 88%` @ 0.52
  · foreground chair `12%×13% at 11% 92%` @ 0.44 · globe shelf `8%×12% at 91%
  71%` @ 0.34 · far-left shelves `5%×14% at 0% 63%` @ 0.25.

Masks take the artwork's own `background-size`/`position`, so a `%` inside each
gradient **is** an artwork fraction and each stays on its prop under any crop.
Grain is the deliberate exception: it is a property of the lens, so it tiles in
screen space; scaling it with the painting would make it a painted texture.

**Three traps, each found by measuring rather than looking:**

1. **SVG filters default to `linearRGB`**, where 0.5 is sRGB 0.74. The "neutral"
   grain blew the room **+29% brighter** under `overlay` (mean screen luma
   47.7 → 61.7). `color-interpolation-filters='sRGB'` on the `<filter>` is
   mandatory. A translucent grey noise blended `normal` is worse still (+117):
   that is a veil, not grain.
2. **`radial-gradient(118% 116% …)` sizes the RADII**, so the real corners landed
   at ~60% of the ramp where the alpha was 0.04 — the vignette measured as a
   0.04-luma change and was, in practice, absent. `farthest-corner` fixes it.
3. **A global dim is the one tool that cannot be spent freely.** The Community
   and utility notices are live text on PAINTED parchment, so every point off the
   painting is off their page — and that paper is *already* under AA for
   `--commons-ink-soft` before any pass touches it. `brightness(0.94)` cost the
   board's darkest paper 6% of its contrast; 0.985 costs ~1%. `contrast(<1)`
   also pulls toward mid grey, which on a room this dark is a **lift**. All the
   quieting is done by the vignette and masks, which are shaped to fall outside
   every parchment (the board sits at r 0.51 of the vignette, inside its
   transparent zone). **If this room ever needs to be darker, spend it there.**

Measured effect at 1440×900 (same to within 0.5% at 1920×1080 and 2560×1080):

| | Δ |
|---|---|
| Side table understructure | **−25.0%** |
| Globe shelf books | −17.9% |
| Bottom-right corner | −15.7% |
| Foreground chair / drape | −10.3% |
| Castle / window | −6.7% |
| Community board | −1.4% |
| Utility slips | −0.9% |
| Candles | −0.8% |
| Premium panel | +1.1% |
| Mogzy body | −0.3% |
| **Legal rail** | **0.00%** |
| Whole screen | **−1.3%** |

---

### 5. Seam audit — concluded NO CHANGE

The Hall → Commons transition was audited and **no code was written**. Preserve
the current ambience timing and transition behaviour.

There is a measurable step at the section boundary — up to −45% luma with a +29
R−B colour-temperature swing — but it is **neither room**. It is the sitewide
Hextech mist (`rgba(92,189,217,0.18)`, fixed, `z-[5]`) showing through the hole
that `.academy-hero-fade` opens in the Hall's last 130px; `main` is `z-20`, so
that hole is the only place the mist is visible, and the opaque Commons cuts it
dead. Hiding the mist collapses the step to **+0.39**. The Commons grading
neither caused nor solved it (−15.32 before, −15.34 after).

It is also **self-limiting**. `syncAmbience` sets `hub-commons-in-view` the
moment the Commons top crosses `innerHeight * 0.5`, and after that the step is
**+4.24** — the Commons is slightly *brighter* than the band above, which reads
continuous. The bad window is the ~135px before the midpoint, traversed in
~150ms of a snapped gesture, and the seam is **off-screen at both resting
positions**.

**No CSS-only intervention exists that does not touch a frozen surface.** A
Commons-side top falloff is visible at rest, because the settled Commons' top
edge *is* viewport 0. An overlap changes section geometry and therefore snap. A
crossfade needs scroll-driven opacity. Dimming the mist changes the Hall at rest.

*Option left on the table, deliberately not taken:* changing `0.5` to `~0.8` in
`syncAmbience` (`LolHub.tsx`) holds the step inside ±4 for the whole travel and
changes nothing at either resting position — but it makes the sitewide ambience
leave while the Hall still fills 80% of the view, which is Screen-1
choreography.

---

### 6. Responsive, snap and fallback — preserved

* Snap unchanged: `y mandatory` on `html`, screens `start`, the plinth `end`,
  gated `(min-width:1024px) and (min-height:780px)` and `:not(.large-text)`.
* Contextual hints unchanged: 560ms rise / 200ms withdrawal, 160ms opacity-only
  under either motion preference, always in the tab order.
* Reduced motion: Mogzy and the rail carry **zero** animation and zero
  transition in both preference states.
* Flow mode (short-height, mobile): Mogzy and the desk are `display: none`; the
  background treatment is stage-gated. Verified **0 pixels changed** at 1280×720
  and 390×844 across the whole workstream.
* Zero horizontal overflow at 1024×780, 1280×720, 1440×900, 1512×982, 1920×1080,
  2560×1080 and 390×844.

---

### 7. Verification performed

| Check | Result |
|---|---|
| Mount fractions (crest/plaque/board/utility/plinth/rail/mogzy) | **identical** at 1024×780, 1440×900, 1512×982, 1920×1080, 2560×1080 |
| Art ↔ desk layer parity (background stack + filter) | **true** in every stage case |
| **Screen 1 unchanged** | every changed pixel is the randomised `ACADEMY_LINES` tagline; **0 elsewhere** at 1440×900, 1920×1080, 1280×720; 0 changed at 390×844 |
| Flow / mobile unchanged | 0 pixels at 1280×720 and 390×844 |
| Horizontal overflow | none at any tested viewport |
| Snap / hints / reduced motion | unchanged, verified without the animation freeze |
| Decorative layers | `aria-hidden`, `pointer-events: none`, 0 focusables inside |
| Legal links | `/privacy`, `/terms`, `/security` present and keyboard-reachable at every viewport, focus ring visible |
| Page errors | 0 across all viewports |
| Tests | `LolHub.test.tsx` + `MogzyMascot.test.tsx` — **86/86** |
| Lint | `eslint src/components/lol/AcademyCommons.tsx` clean |
| Build | `vite build` clean |

---

### 8. Known non-blocking caveats

* **Painted-parchment contrast is below AA for the soft ink, and predates this
  work.** Measured on finished pixels the Community board's paper gives 2.98:1
  for `--commons-ink-soft` *before* any pass in this workstream; the treatment
  moves it to 2.89:1. Worth a separate accessibility pass — do not fix it with a
  global brightness change, which is what section 4 explains.
* **`tsc --noEmit -p tsconfig.app.json` reports errors in 8 files.** All
  pre-existing and unrelated (admin, quiz workspace, combat-lab, community,
  feedback); none in the files this workstream touches.
* **Full frontend vitest has a standing baseline of failures** and
  `--poolOptions.forks.singleFork` dies on `Timeout calling "onTaskUpdate"` after
  ~14 of 574 files. For a CSS-dominant change the honest verification is the
  build plus the tests that name the components.
* **Two measurement contaminants** in any pixel diff of this page: the friends
  FAB renders inconsistently between runs, and `ACADEMY_LINES` randomises the
  Hall tagline per entry. Mask both out.
* **Mogzy is withheld below aspect 1.538**, so the gate-minimum stage viewport
  (1024×780) shows the Commons without him. Deliberate — the alternative is a
  mascot sliced by the frame edge.

---

### 9. Merge state — one known conflict, comment-only

Branch is **3 commits ahead** of the merge-base `e1bec908`; `origin/main` has
moved **16 commits** ahead of it, touching 47 files.

`git merge-tree --write-tree origin/main HEAD` reports **exactly one conflict**:
`src/components/lol/HubPremiumPanel.tsx`. It is confined to the `### No price`
paragraph of that file's header comment — **no code, no class names, no
structure**, so the Commons stage mounting is unaffected either way.

* **Theirs (main):** PT1.5 rewrote it — pricing moved off the client into the
  server offer catalog, purchasability is `fetchOfferAvailability`.
* **Ours:** the paragraph is unchanged from the base except its last sentence,
  where "this panel routes there instead" became "this **plaque** routes there
  instead" when the component was reinterpreted as the Commons plaque.

**Resolution when merging:** take main's PT1.5 wording wholesale and change its
final "this panel" to "this plaque". Nothing else in the file conflicts.

Re-fetch `origin/main` before merging: it moves often.

---

## Revision 2026-09-05 — THE PAINTED COMMONS (approved background integration)

**Status:** complete on branch `hub/two-screen-academy`, worktree
`/Users/macmoney/mogsy-wt-hub2screen`, rebased onto `origin/main` @ `e1bec908`.
Committed, **not pushed and not merged** — stopped for the visual review the
brief asked for. What's New has not been started.

Screen 2 is no longer a stack of coded panels over a CSS wall. The approved
Commons artwork is the room, and every live panel is mounted into a surface the
painting already contains. Screen 1, the snap architecture and every route,
entitlement and interaction below are untouched.

---

### 1. The asset

| | |
|---|---|
| Source | `~/Downloads/Mogzy-classroom-bottom-half.png` (owner's file, **not modified**) |
| Repo path | `src/academy/hub/academy-commons-desktop.png` |
| Verified | byte-identical copy — `sha256 f26c5a4b…ce585e` on both |
| Size | 1672 × 941 (16:9), 2.02 MB PNG |

`src/academy/hub/` rather than `src/assets/`: it is where the hall's own
paintings live (`academy-library-desktop.png`, `-mobile.png`), and 2 MB is the
house size for them. It is **imported**, not referenced by a `/assets/` URL like
the Ranked art — so the bundler content-hashes it and a missing file breaks the
build. `AcademyCommons` hands the resolved URL to CSS as `--commons-art`, which
keeps every rule that consumes it in `index.css`.

---

### 2. Alignment strategy — the one idea

`background-size: cover` plus four hand-tuned percentage boxes drift apart the
moment the window changes shape. Instead, **the mounts and the paint are placed
from the same four custom properties**, so they cannot drift:

```
--commons-img-h : clamp(100svh, 100vw * 941/1672, 100svh * 1.14)
--commons-img-w : --commons-img-h * 1672/941
--commons-img-x : (100vw - --commons-img-w) / 2
--commons-img-y : (100svh - --commons-img-h) / 2
--u             : max(0.86px, --commons-img-w / 1672)   ← one artwork pixel
```

A mount declares `--mx/--my/--mw/--mh` as **fractions of the artwork** and is
placed with `left: calc(var(--commons-img-x) + var(--commons-img-w) * var(--mx))`.
Type is sized in `--u`, so the room scales as one object rather than as
fixed-size widgets on a zooming photograph.

**Measured, not eyeballed.** The mount rectangles were taken off the file by
flood-filling the parchment surfaces and by profiling the plinth's brightness,
not by reading a grid overlay:

| Mount | Painted surface | `--mx` | `--my` | `--mw` | `--mh` |
|---|---|---|---|---|---|
| Room title + "Back to the Hall" | the bare arch above the frame | 0.300 | 0.085 | 0.180 | 0.093 |
| Mogzy Premium | the large gilt-framed navy panel | 0.2700 | 0.2150 | 0.2140 | 0.5150 |
| Join the Academy | the large parchment noticeboard | 0.5840 | 0.2520 | 0.2440 | 0.2440 |
| Feedback + About | the two small pinned slips | 0.5540 | 0.5970 | 0.2495 | 0.1600 |
| Legal inscription | the wooden plinth | 0.2320 | 0.8120 | 0.5540 | 0.1080 |

Verified by probing the live DOM at both target sizes: **every mount reports the
same artwork fractions at 1440×900 and at 1920×1080**, to four decimal places.

Three measurements that a grid overlay got wrong and pixel analysis fixed:

* **The plinth.** The rail's lit capping edge crosses the painting at y 0.799
  and the first guess put the Riot disclaimer straight through it. The dark,
  flat run is y 0.813–0.929; horizontally, furniture bounds it to x 0.208–0.788
  (the reading table on the left, the side table on the right). The band is
  near-black there, so the inscription needs **no scrim of its own**.
* **The noticeboard is in perspective**, not square: its horizontal axis rises
  1.7° to the right. The mount is turned onto that axis so the type lies on the
  paper instead of across it.
* **The seal.** The gilt frame's laurel medallion is an empty ring at
  (0.3765, 0.2715). The Premium panel's existing Crown seal is struck into it —
  it leaves the flow and is placed against the *frame*. This is why
  `.academy-commons-plaque-body` has to give up its `position: relative` in
  stage mode: it would otherwise be the seal's containing block, and the seal
  landed 109px low, on top of the title.

---

### 3. Responsive positioning

Cover is computed by hand precisely so the crop policy is a decision rather
than a side effect:

| Viewport shape | Behaviour |
|---|---|
| Narrower than 16:9 (incl. 1440×900) | fitted to the **height**; the sides crop. What goes is the reading table and the globe — no mount lives outside x 0.208–0.845. |
| 16:9 (1920×1080) | exact; nothing cropped. |
| Up to 2.03:1 | fitted to the **width**; at most 6.1% crops off the top and bottom. Every mount sits inside y 0.085–0.920 and survives it. |
| Wider than 2.03:1 (21:9) | the painting stops growing rather than eating the plinth; the strip either side is filled with an over-scaled blurred copy of itself (`.academy-commons-wall`). |

**The `1.14` cap and the 0.085 / 0.920 mount bounds are one decision.** Moving
either without the other is exactly what puts the room title or the last line of
the legal inscription off a 21:9 screen — it did, at 1.18, before the cap moved.

`--u`'s `0.86px` floor is the other half of the same argument at the small end:
at the smallest gated viewport (1024×780) the honest scale is 0.83, which puts
body copy under 12px. It is clamped, and the panels fill their frames a touch
more tightly instead.

**Below the gate the composition is not forced.** `@media (min-width:1024px) and
(min-height:780px)` on `html.hub-two-screen:not(.large-text)` — character-for-
character the scroll-snap gate. Outside it (phones, short laptops, deep page
zoom, the large-text setting) the artwork drops back to a scrimmed `cover`
backdrop, the panels keep their own coded chrome, and the room is an ordinary
scrolling document. Readability over framing, as the brief asks.

The flow-mode room also gained `padding-top: calc(var(--app-header-h) + 1rem)`.
The Commons opts out of the shell's header padding, and without it the "Back to
the Hall" control — the first thing in that column — sat underneath the floating
HUD on a phone.

---

### 4. No doubled frames

Inside the stage gate the coded chrome the painting already supplies is switched
**off**: the plaque's walnut mount and navy field, the noticeboard's planking,
the parchment of all three notices, their six brass pins, and the plinth's
capping board. Nothing is removed from the DOM — every one is a CSS override, so
flow mode still has all of it.

Everything that carries **meaning** stays live HTML. Nothing is baked into the
image: every heading, both CTAs, all four utility links, the three legal links,
the copyright line and the Riot disclaimer are text. Two pieces of supporting
copy are hidden in stage mode only, because a painted slip holds a heading and
two 44px targets and no more: the Feedback slip's descriptive sentence, and its
"Feedback" eyebrow (its `<h2>` and both link labels already say it). Both are
present in flow mode and in the DOM.

**The 44px tap target is absolute, not proportional.** Every CTA and slip action
is `min-height: max(44px, calc(N * var(--u)))`, so scaling the room down never
scales an interactive target below the floor.

The one deletion: `.academy-commons-lintel` (the coded ceiling beam) and its 38
lines of CSS. The painting has the architecture; a coded wall behind an
illustrated one only fought it. `.academy-commons-wall`'s panelling, sconces and
moulding went with it — the element survives as the navy ground and the
ultrawide blur-fill.

---

### 5. Delayed contextual navigation

Both hints are withheld until the reader has actually settled in a room:

* **Settled** = the scroll has been quiet for 140ms *and* a screen's top edge is
  parked within 18px of the viewport top.
* The hint is then offered after **1700ms**.
* **Any** scroll withdraws both immediately.

No wheel interception and no snap-event listener (there is no cross-browser
one). `LolHub`'s observer reads `getBoundingClientRect()` on `[data-hub-screen]`
and debounces `scroll`/`resize` — the two facts the page already owns.

Timings are asymmetric on purpose, and the **destination** state owns them:
arriving is a 560ms rise, leaving is a 200ms withdrawal. A hint that faded out
as slowly as it faded in stayed on screen through the first half of the gesture,
which is the opposite of "hidden while scrolling".

Three things this deliberately does **not** do:

* It never gates **existence**. Both controls are always rendered and always in
  the tab order; `:focus-visible` reveals them, so a keyboard reader is never
  sent at an invisible control.
* It only hides them **inside the snap gate**. On a phone, a short laptop, deep
  page zoom or large text, the CSS never hides them at all and the observer
  keeps its hands off — verified at 390×844, 1280×720 and with `.large-text`.
* Under either motion preference (the OS media query **and** the app's own
  `html.reduce-motion`) it is appearance with no travel: `transform: none`,
  160ms. Both selectors have to name `.is-revealed` explicitly — it is the state
  carrying the 560ms rise, and a rule that does not out-specify it silently
  leaves the long fade in place for exactly the readers who asked for less.
  That regression happened once during this pass and is the reason the selector
  list looks redundant.

State updates are deduped through a ref: a scroll fires dozens of events per
gesture and each one withdraws the hint, so `setState` is only called when the
value actually changes.

---

### 6. Ambience decision — faded, for the Commons only

`HextechAmbience` is disabled over Screen 2. Drifting runes crossed the painted
frames and its gold corner brackets fought the painted gilt; it reads as litter
over an illustrated room.

It is a **local visual override, not an ambience rewrite**. `LolHub` sets
`html.hub-commons-in-view` when the Commons holds more than half the viewport
and removes it on unmount; `index.css` fades the layer to `opacity: 0` on that
class. The component itself gained one thing — a `hextech-ambience-layer` class
as the CSS hook. Screen 1 and every other `/lol` route are untouched, and the
ambience returns the moment the reader goes back up (verified: `1` → `0` → `1`).

---

### 7. Files changed

| File | Change |
|---|---|
| `src/academy/hub/academy-commons-desktop.png` | **new** — the approved artwork, byte-identical to the owner's file |
| `src/components/lol/AcademyCommons.tsx` | the room rebuilt as a stage; the coded lintel replaced by a crest in the painted arch; asset wired as `--commons-art`; `navHintRevealed` prop |
| `src/pages/LolHub.tsx` | the settle observer (hint delay + ambience class); `is-revealed` on the hall's descend control |
| `src/index.css` | `.academy-commons-art`; wall reduced to ground + blur-fill; the whole stage block; hint transitions; ambience fade; `-lintel` deleted |
| `src/components/lol/HubPremiumPanel.tsx` | stable class hooks only — no logic, no copy, no route |
| `src/components/lol/HubCommunitySection.tsx` | stable class hooks only |
| `src/components/lol/HubUtilitySection.tsx` | stable class hooks only |
| `src/components/HextechAmbience.tsx` | one class as a CSS hook; behaviour unchanged |

**Not touched:** every route, `PREMIUM_ROUTE`, the entitlement read, the
community link resolution and its fail-closed behaviour, `AdSlot`, the four
books, the shelves, the Patch Report centerpiece, Mogzy, the radio, the snap
gate, Pro Play, `Footer`'s `/lol` self-hide.

---

### 8. Verification

Screenshots (outside the repo): `/Users/macmoney/mogzy-hub-commons-shots/`

| File | What it shows |
|---|---|
| `commons-1440x900.png` | Screen 2, primary target |
| `commons-1920x1080.png` | Screen 2, second target — mounts identical to 4 dp |
| `hall-1440x900.png`, `hall-1920x1080.png` | Screen 1, unchanged |
| `hall-1440x900-hint-withheld.png` | Screen 1 shortly after mount — no hint |
| `hall-1440x900-hint-revealed.png` | the same frame after the 1.7s settle |
| `transition-1440x900-mid-scroll.png` | a real mid-gesture frame at `scrollY 116`, both rooms half in view, both hints withdrawn |
| `commons-390x844-mobile.png`, `-bottom.png` | flow mode: top of the room, and the legal band |
| `commons-1280x720-short.png` | below the gate — flow mode, hints not hidden |
| `commons-gate-min-1024x780.png` | the smallest gated viewport |
| `commons-ultrawide-2560x1080.png` | 21:9 — pillarbox blur-fill, title and plinth both intact |
| `commons-1440x900-large-text.png` | `.large-text` — flow mode, hints not hidden |

Behaviour, measured in Chrome via Playwright (the Browser pane renders with
`visibilityState: "hidden"`, which skips mount animations):

| Check | Result |
|---|---|
| Screen 1 unchanged | ✔ |
| Scroll snap unchanged | ✔ `y mandatory` inside the gate, `none` at 390×844 |
| Premium / Community / Feedback+About / legal on their mounts | ✔ at both targets |
| CTA → `/lol/premium`; member and non-member variants | ✔ (6/6 `HubPremiumPanel` tests) |
| Feedback, Report a Bug, About, Contact, Privacy/Terms/Security | ✔ |
| Pro Play | untouched |
| Horizontal overflow | none at 390, 1024, 1280, 1440, 1920, 2560 |
| Hint delay / withdrawal / re-settle | ✔ `0 → 1` after 1.7s; `1 → 0` within ~700ms of a scroll; revealed again on re-settle |
| Hints outside the gate | visible, never hidden — 390×844, 1280×720, `.large-text` |
| Reduced motion | `transform: none`, `transition: 0.16s` |
| Ambience | `1` (hall) → `0` (commons) → `1` (back) |
| New console errors | none, at every viewport |

The seam frame was driven with CDP `Input.synthesizeScrollGesture`, not
`mouse.wheel`: an unphased wheel event makes Chrome re-snap on every tick and
mandatory snapping then measures as a trap it is not.

**Tests.** `npx vitest run`, serially (running two suites at once on this
machine fabricates failures):

| | Baseline (`hub/two-screen-academy` before this pass) | After |
|---|---|---|
| Test files | **12 failed** / 562 passed | **12 failed** / 565 passed |
| Tests | **43 failed** / 8676 passed / 7 skipped | **43 failed** / 8679 passed / 7 skipped |

The failing **set** is byte-identical — same 12 files, same 43 test names — and
is the repo's standing baseline, unrelated to the hub. Three tests were added to
`LolHub.test.tsx` (78 in the file, up from 75): the artwork must reach CSS as
`--commons-art` from a bundled import and never as an `<img>`; the seven class
hooks the painted mounts are positioned by must exist; and both navigation
hints must be a class on an always-rendered, always-focusable button rather
than a conditional render.

Lint: clean on all changed files. Typecheck: no new errors (the repo's
pre-existing `tsc` failures are all in unrelated files).

---

### 9. Known constraints

* **A live ad in `lol_hub_mid` would land over the painted room.** `AdSlot`
  returns null and reserves no space in every environment today; if a provider
  ever fills it, the stage composition has to be revisited with it. This is the
  same caveat the 2026-09-04 room carried, now with a picture behind it.
* **The 1024×780 corner is the tight one.** `--u`'s floor means the panels run
  about 4% larger than their frames there; everything still fits, and it is the
  smallest viewport the gate admits.
* **`--u`, the `1.14` cap and the mount bounds are one system.** Changing any
  one of them without re-checking the other two is how the composition breaks
  quietly at an untested aspect ratio.

---


## Revision 2026-09-04d — THE TWO-SCREEN ACADEMY

**Status:** complete on branch `hub/two-screen-academy`, worktree
`/Users/macmoney/mogsy-wt-hub2screen`, based on `origin/main` @ `e35ecc81`.
Committed, **not pushed and not merged** — this is the visual review the brief
asked to stop at. What's New has not been started.

**The above-the-fold hub is untouched as approved.** The four painted volumes,
the shelves, the Patch Report centerpiece, Mogzy, the radio dock, the book
entrance choreography and the hero composition are all exactly as they shipped.
`LolHub.tsx`'s hero section gained exactly two things: a `data-hub-screen="hall"`
attribute, and a small "Explore the Academy ↓" control absolutely positioned on
the painted floor below Mogzy's pedestal. The hero's measured height is
unchanged at every viewport (900 at 1440×900, 1080 at 1920×1080, 891 at
390×844 — identical to the pre-change run), and the background art was not
altered.

---

### 1. The two-screen architecture

`/lol` is now two deliberate full-viewport rooms that are siblings under the page
root — never nested, so no second scroll container exists anywhere:

| | Screen | Element | Height |
|---|---|---|---|
| 1 | **Academy Hall** | `[data-hub-screen="hall"]` — the existing hero | `md:min-h-[100dvh]` (unchanged) |
| 2 | **Academy Commons** | `[data-hub-screen="commons"]` — new `AcademyCommons` | `min-height: 100svh` inside the snap gate, natural otherwise |

Measured document height: **1800px at 1440×900 and 2160px at 1920×1080** —
exactly two viewports, with no third screen and no residue.

The old lower page was 1092px of cards *plus* a sitewide footer, i.e. 1.2
viewports of stack that clipped mid-footer at the fold.

### 2. Scroll snapping — what was chosen and why

**`scroll-snap-type: y mandatory`, declared on `html`, gated by media query.**

*Why `html`:* `body` carries `overflow-y: auto` while `html` keeps the UA default
`overflow: visible`, so the browser propagates body's overflow to the viewport
(that propagation is load-bearing — it is what stops Radix's scroll-lock nudging
every centred layout sideways). Snap therefore has to be declared on the
propagation root. **No new scroll container was introduced**, and the document is
still the app's only vertical scrollbar.

*Why `mandatory` and not `proximity` — measured, not assumed.* Driving the real
page at 1440×900 with genuine phased scroll gestures via Chrome's
`Input.synthesizeScrollGesture` (Playwright's own `mouse.wheel` sends unphased
events and gives a badly misleading answer — it made `mandatory` look like a
trap that it is not):

| gesture | `mandatory` | `proximity` |
|---|---|---|
| 150px | settles at 0 | settles at 0 |
| 300px | settles at 0 | **strands at 301** |
| 450px | settles at **900** | **strands at 450** |
| 600px | settles at **900** | **strands at 597** |

`proximity` parks the reader half in each room — precisely the half-in-half-out
"ordinary website" feel this redesign exists to remove. `mandatory` never
strands: every gesture resolves to one room or the other, with the threshold
around half a viewport, so a deliberate push crosses and a nudge falls back.
That is the "noticeable soft lock, not a hostile scroll trap" the brief asked
for. `scroll-snap-stop` is left at its default `normal`, so a fast flick or a
Page Down passes straight through.

Keyboard was measured on the same page: **Page Down → 900, End → 900**.
Snapping costs keyboard users nothing.

### 3. Responsive and accessibility fallback

Mandatory snapping becomes hostile the moment a screen outgrows the viewport, so
it is only armed where the Commons is *measured* to fit:

```css
@media (min-width: 1024px) and (min-height: 780px) {
  html.hub-two-screen:not(.large-text) { scroll-snap-type: y mandatory; }
}
```

| condition | snapping | Commons height | verified |
|---|---|---|---|
| 1440×900, 1920×1080 | **on** | exactly 100svh | docH = 2×viewport, no h-overflow |
| 390×844 (phone) | **off** | 1197px, natural | scrolls normally, nothing clipped |
| 1280×620 (short laptop) | **off** | 704px, natural | scrolls normally, nothing clipped |
| page zoom ≥150% | **off** | natural | the CSS viewport falls under 780px, so the height gate catches it with no extra code |
| `html.large-text` setting | **off** | natural | verified live: `y mandatory` → `none` when the class is added |

The Commons is sized with `min-height`, **never `height`**, so it can only grow —
nothing is ever clipped at any size. As belt and braces the plinth carries
`scroll-snap-align: end`, so if the Commons ever did outgrow the viewport inside
the gate (a future ad unit rendering into `lol_hub_mid`, a long translation) the
bottom of the room is still a snap position and the overflow stays reachable.

The class is added on mount and removed on unmount — verified that `/about` has
neither the class nor any snapping, and keeps its full sitewide footer.

**Reduced motion.** Snapping is kept: it is not motion the page starts on its
own, it is the settle of a scroll the reader began, and browsers perform it
instantly rather than smoothly under the preference. What *is* suppressed is the
page's own smooth scrolling — both controls fall back to an instant jump, under
the OS media query **and** under the app's own `html.reduce-motion` setting
(which no media query can see). Verified live: the scroll was complete within
120ms under both, and the chevron's drift animation computes to `none`.

### 4. The seam

The hero's `academy-hero-fade` mask still ramps the painting's alpha to zero over
its last band, but it now dissolves straight into the Commons' own ceiling beam,
which begins at the hero's last pixel. The previous arrangement left ~88px of
empty page background between the two — that dead band is what made the lower
page read as a different website. There is now **no padding between the screens
at all**.

### 5. The Commons — lower-room visual composition

A quieter room in the same building. **No background artwork was created**; the
entire room is CSS gradients, and every wooden surface consumes the `--shelf-*`
walnut ramp already declared for the hall's shelving (that selector now reads
`.academy-hub-shelf, .academy-commons`, so the ramp is still declared exactly
once and the two rooms are literally the same wood).

Structure, top to bottom:

1. **Ceiling beam** (`.academy-commons-lintel`) — walnut with a lit upper plane
   and a gilt hairline where it meets the wall. Carries the "↑ Back to the Hall"
   control, centred because the shell floats the HUD in the top-*right* corner
   and the Mogzy home control in the top-*left*; the centre is the only part of
   that band never under a fixed control at any width.
2. **Navy library wall** (`.academy-commons-wall`) — lit from two high sconces,
   with a moulding under the beam and recessed panels on a 240px rhythm (all
   under 4% contrast: felt, not seen). A first pass at a single hairline every
   112px was too faint to survive the sconce light and the room read as an empty
   navy field with furniture floating in it.
3. **Membership plaque** (Premium, primary) — a walnut mount, a brass title band
   engraved "ACADEMY MEMBERSHIP" / "MEMBER IN GOOD STANDING", a navy field, an
   engraved register and the gold CTA plate. Deliberately not a fifth volume and
   not a pricing card. The navy-and-gilt field is the same pairing the four
   painted volumes use, which is what ties the rooms together.
4. **Noticeboard** (Community) — walnut planking with a parchment bill pinned to
   it by two brass pins, rotated 0.45°. The bill is auto-height and centred, not
   stretched: a sheet that fills its board is just a card with a brown outline.
5. **Two pinned slips** (Feedback, About/Contact) — the same parchment, smaller,
   one pin each, rotated the other way. Visually subordinate to both objects
   above them.
6. **Plinth** (`.academy-commons-plinth`) — the room's skirting, a capping board
   over a darker face with the legal set cut into it. **Not a footer floating
   below the scene.**

The room is capped at `max-w-[76rem]`, leaving ~110px of panelled wall down each
side at 1440 and much more at 1920 — that cap is what makes it read as a room you
are standing in. The furniture row is `flex-1` capped at `21rem`; the surplus
above that goes back to the room as air, which is what a taller room looks like.

Three sizing values were arrived at by looking rather than by arithmetic, and the
rejected states are recorded in the code comments so they are not re-tried: the
full-width room (furniture floated), the 34rem furniture cap (a ~250px void down
the middle of each object), and the bright parchment (the paper out-shouted the
gilt CTA and inverted the hierarchy).

### 6. The legal set moved into the room

`Footer` now **self-hides on `/lol`** entirely. Privacy, Terms, Security, the
copyright line and the Riot disclaimer are inscribed into the plinth at the
footer's own verbatim wording. The route's previous "legal-only" footer variant
is gone with it, and `data-variant` on the sitewide nav is therefore always
`"full"` now.

Verified by clicking each link on the live page: `/privacy` → "Privacy Policy",
`/terms` → "Terms of Service", `/security` → "Security at Mogzy",
`/lol/premium` → "Mogzy Premium". All four resolve, none 404, and all four
*destination* pages still render the sitewide footer — only `/lol` hides it.

### 7. Files changed

| File | Change |
|---|---|
| `src/components/lol/AcademyCommons.tsx` | **new** — the whole Screen 2 room: wall, beam, back-control, chamber grid, plinth |
| `src/pages/LolHub.tsx` | `data-hub-screen` on the hero; `hubScrollTo` + `prefersReducedMotion` helpers; the snap-class effect; the descend affordance; the below-fold block replaced by `<AcademyCommons>` |
| `src/components/lol/HubPremiumPanel.tsx` | re-skinned as the membership plaque. **No logic touched** — same entitlement read, same two states, same copy bounds, same route |
| `src/components/lol/HubCommunitySection.tsx` | re-skinned as the pinned noticeboard. Fail-closed behaviour unchanged; no social URL invented |
| `src/components/lol/HubUtilitySection.tsx` | re-skinned as two pinned slips. Same routes, same actions |
| `src/components/Footer.tsx` | self-hides on `/lol`; the legal-only variant removed |
| `src/index.css` | the snap contract + `.academy-commons-*` + `.academy-hall-descend`; `--shelf-*` ramp shared with `.academy-commons` |
| `src/pages/LolHub.test.tsx` | structural test rewritten for the plinth; new legal-inscription test; new "two-screen Academy" describe (7 tests) |
| `src/components/lol/HubPremiumPanel.test.tsx` | the two eyebrow assertions follow the brass band's wording |

### 8. Tests, lint, typecheck

* **Full vitest suite: 12 files / 43 tests failing — byte-identical to the
  untouched base.** The 12th file (`LobbyPreviewPage.test.tsx`, one test) is
  drift on `main` since the 2026-09-03 baseline of 11/42, and was confirmed
  failing in a pristine `--detach` worktree at `e35ecc81` with no changes
  applied. 8654 passing, 163 unhandled errors — the documented Supabase
  `storage.getItem` noise, unchanged.
* **Hub tests: 110/110 passing**, up from a 103/103 baseline (+7 new).
* **ESLint on all nine changed files: clean, exit 0.**
* **`tsc --noEmit -p tsconfig.app.json`: the same 8 pre-existing error files,
  none of them touched here.**
* **Console: the same 3 messages as the baseline** at every viewport (the
  `fetchPriority` React warning, one 403, one 404). No new runtime errors.
* **No horizontal overflow** at 1440, 1920, 1280×620 or 390×844.
* Every interactive control is ≥44px tall on touch: descend 44 (desktop-only),
  back-to-hall 44, Premium CTA 52, Discord plate 52, slip actions 45.
  *(An intermediate pass shrank three of these below 44 and the tap-target test
  caught it — restored.)*

### 9. Screenshots

Not committed — the repo has no precedent for binaries in `docs/`. Captured with
Playwright at `/Users/macmoney/mogzy-hub-2screen-shots/`:

| File | What it shows |
|---|---|
| `FINAL-1-screen1-1440x900.png` | The Hall, with the new affordance on the painted floor |
| `FINAL-2-screen2-1440x900.png` | The Commons, snapped, at the primary target |
| `FINAL-3-screen2-1920x1080.png` | The Commons at the second target |
| `FINAL-4-mobile-transition.png` | The mobile seam — snap relaxed, natural scroll |
| `v6-seam-1440.png` | The seam with snapping disabled: hall dissolving into the beam |
| `BEFORE-lower-page-1440x900.png` | The old lower page, for comparison |

### 10. Remaining polish (deliberately not done)

* **`HextechAmbience` still drifts particles over the Commons.** It is mounted by
  the shell for the whole `/lol` section, not by this page, so removing or
  scoping it touches every `/lol` route and belongs in its own change. It mildly
  undercuts the "quiet room" reading.
* **The Commons' lower band is emptier than its upper band** at 1080. It reads as
  floor (the wall's floor-shadow gradient lands there), but a second small
  object on that side would balance it if the owner wants one.
* **Community is still fail-closed** — no Discord or social URL exists in this
  repo, so the board renders "opening soon" as before. Out of scope by the brief.
* **The `lol_hub_mid` ad slot renders null today.** If a provider ever fills it,
  the Commons grows past one viewport and the snap gate has to be revisited with
  it; the plinth's `scroll-snap-align: end` keeps it merely imperfect rather than
  broken in the meantime.
* **What's New has not been started**, as instructed.

---

## Revision 2026-09-04c — Mogzy Premium promotion module

**Status:** complete on branch `hub/premium-module` (worktree
`/Users/macmoney/mogsy-wt-hub-premium`). **The above-the-fold hub is
byte-untouched** — no book, shelf, tome, mascot or hero-composition file was
edited; the only `LolHub.tsx` change above the seam is none at all, and the
hero section's own measured height is unchanged at every viewport (900px at
1440×900, 1080 at 1920×1080, 891 at 390×844 — identical to the pre-change run).

### Branch note — this builds on the below-fold rework, not bare `main`

The lower-page structure this task describes (Community → Feedback → About →
legal footer) exists only in Revision 15, which is the single unpushed commit
`5f90d635` on `hub/below-fold`. `origin/main` `92b6d9d7` still carries the OLD
lower page (Meta Reflex + News/Blog + full footer). Revision 15 cherry-picked
onto `origin/main` **cleanly** (both `LolHub.tsx` and this file auto-merged),
so `hub/premium-module` is:

    origin/main 92b6d9d7  →  [rev 15 below-fold]  →  [rev 16 Premium]

Merging Premium therefore lands the below-the-fold rework with it. That is
deliberate: Premium's whole placement contract is "above `HubCommunitySection`",
and Revision 15 §6 reserved exactly that slot.

### Placement

Page flow is now, top to bottom:

1. Academy hero (four volumes + the Patch Report tome) — unchanged
2. the alpha-ramp transition — unchanged
3. **Mogzy Premium**
4. Join the Academy (community)
5. Help improve Mogzy / About the Academy
6. legal-only footer

(The News & Blog grid that sat at position 6 was removed in the same
revision — see *IA cleanup* below.)

Premium is **not** a fifth volume and not inside the four primary destinations.
`LolHub.test.tsx` guards both halves: the guide-bearing book count is still
exactly 4, no `[data-guide-mode]` subtree contains a `/lol/premium` link, and
the page's single `/lol/premium` anchor is inside the panel.

### The transition gap, closed

Revision 15 left the container at `pt-10 md:pt-14` plus an `mt-8` on the
section stack. Measured at 1440×900: the hero ends at y=900 and the first thing
to read began at **y=988 — an 88px empty dark field** between the dissolved
painting and any content, which is the "hero fades → empty field → content"
the review flagged.

| | Before | After |
|---|---|---|
| Container top padding | `pt-10 md:pt-14` (40 / 56px) | `pt-4 md:pt-5` (16 / 20px) |
| Stack top margin | `mt-8` (32px) | `mt-3` (12px) |
| Seam → first content @1440 | **88px** (to Community) | **32px** (to Premium) |
| Seam → first content @390 | 88px | **28px** |

The ad slot's spacing moved onto the ad itself (`className="mb-6"`) rather than
onto the stack, because `AdSlot` returns `null` when the placement is
suppressed — which is the usual case today and *always* the case for a Premium
member. Leaving the margin on the stack would have re-opened the gap for
exactly the users the panel is talking to.

Nothing else moved: the hero composition, the fade band (90/130px) and the
`.academy-hero-fade` mask are all untouched.

### The panel — `src/components/lol/HubPremiumPanel.tsx`

A wide horizontal feature panel, 218px tall at ≥1024 and stacking on mobile.

| Element | Treatment |
|---|---|
| Base | `radial-gradient` warm gold at 14% from the crest's corner over a `#0a1120 → #060a12 → #090b13` near-black navy |
| Border | `#c9a84c/30`, → `/55` on hover (measured `rgba(201,168,76,0.3)` → `rgba(201,168,76,0.55)`) |
| Ornament | one 1px gold hairline along the top edge. That is the whole decorative budget. |
| Crest | 56/64px ring + inner ring + the same lucide `Crown` that marks Premium on `/lol/premium` |
| Heading | `Mogzy Premium`, 24/28px — an `h2`, so it inherits the Academy's Cinzel display face |
| Pillars | three icon+label items, one line each. Not a feature list. |
| CTA | the same gold plate geometry as the Community Discord CTA (52px, `#e0c273 → #b08c30`), 212×52 at every breakpoint |

It is stronger than Community (gold border vs `/20`, a crest, a live gold CTA,
a larger heading and a lit base) while Community keeps its full section, its
heading, its plate and its channel row. Hierarchy reads **Premium → Community →
Feedback/About → Legal**, verified in the 1440 lower-section capture.

### Copy is bounded by what `/lol/premium` actually claims

An audit of `LolPremium.tsx` found **two** Premium features live — Full Quiz
History and the Missed Question Bank. The other six (Advanced Category Stats,
Custom Practice Filters, Unlimited Combat Lab, Unlimited Saves & Exports,
Curated Learning Journeys, Earned Matchup Cards) all carry a **Coming soon**
badge. So the panel names the two that exist and summarises the rest as tools
that "land":

> **Unlock the Full Academy** · **Mogzy Premium**
> Go deeper with the Academy: keep every result you've ever posted, review
> every question you've missed, and unlock the advanced tools as they land.
> ⟲ Your full quiz history · ▤ Every question you've missed · ✦ Advanced tools as they land

A test asserts the six coming-soon feature names never appear here.

### No price on the hub — deliberate, and audited

`LOL_PRO_MONTHLY_PRICE` is **$4.99/month**, but `isLolProCheckoutAvailable()`
returns false wherever `VITE_STRIPE_LOL_PRO_MONTHLY_PRICE_ID` is unset — which
is every environment today, so **the subscription cannot currently be bought**
(consistent with the PT1.6 access audit). Printing "Plans from $X" on the
homepage would advertise a number with no checkout behind it. `/lol/premium`
owns pricing *and* states the coming-soon status in the same view, so the panel
routes there instead. A test asserts no `$`, `/month` or `monthly` string.

Nothing about pricing, Stripe, entitlements or checkout was changed.

### Subscription-state behaviour — implemented, at zero cost

`useSitewideTheme().proStatus` is **already resolved for this page** by the
app-wide `SitewideThemeProvider`; `AdSlot`, mounted in this very section, reads
it. So the member variant needed no new hook, fetch, context or entitlement
plumbing — which is what "keep it generic rather than creating architecture"
asked for.

| `proStatus` | Eyebrow | Body | CTA | `data-premium-state` |
|---|---|---|---|---|
| `"pro"` | ✓ Premium Active | "Your membership is active — …" | **View Premium** | `member` |
| `"free"` | Unlock the Full Academy | promotional | **Explore Premium** | `promo` |
| `"unknown"` | Unlock the Full Academy | promotional | **Explore Premium** | `promo` |

Both variants use identical panel geometry, so the resolve causes no layout
shift. `"unknown"` renders the promotional variant on purpose: `AdSlot` fails
*closed* on unknown because showing an ad to a member is a product error, but
this is a promo module and not a gate — the worst case is a member seeing the
wrong eyebrow for a moment, versus holding the module blank for everyone.
There is no Stripe customer portal in the app, so the member CTA is **View
Premium**, not "Manage Premium" — it points at a page that exists.

**No `Pro` wording for the subscription was introduced.** The only `Pro` in the
rendered `/lol` text is `Pro Play`, the Academy volume. Two tests assert this —
one on the panel, one on the whole hub — against `Mogzy Pro`, `Mogsy Pro`,
`Upgrade to Pro`, `Pro subscription` and `Go Pro`. Pro Play itself is untouched.

### Interaction — restrained, and it opts out

- Panel border `#c9a84c/30 → /55` over 300ms.
- One gold light sweep across the panel on `:hover` / `:focus-within` —
  `linear-gradient(105deg, …, rgba(240,215,140,0.10), …)` swept over 620ms,
  once, at 10% alpha. `.hub-premium-panel::after` in `index.css`.
- CTA lifts 2px and carries an explicit `focus-visible` gold ring (the UA
  default ring is hard to read on a gold-on-near-black plate).
- No particles, no entrance animation, no sound, no autoplay. The hero owns
  this page's theatrical motion.
- **`prefers-reduced-motion: reduce`** — verified in a reduced-motion browser
  context: the sweep's `::after` computes to `display: none` and the CTA's
  `transition-property` to `none`.

### IA cleanup — the legacy News & Blog grid is off the homepage

**What it was.** Exactly the legacy homepage News/Blog block carried over from
the pre-redesign `/lol` lower page, and nothing more: a `useBlogList({ limit:
24, tag: "League of Legends" })` query rendering up to 24 `BlogPostCard`s in a
1→5 column grid under a "News & Blog / Latest LoL Stories" header, plus an
"All posts →" link to `/blog`. Not a Patch Report surface, not a LIVE1 feed,
not a changelog — the same generic blog strip the rest of the site has.

**Why it went.** The Patch Report tome in the centre of the hero already owns
updates and content on this page. A second, weaker content feed two screens
below it was the old lower page talking over the new one, and it sat *after*
the utility band, so the page ended on a low-value grid instead of on the
commons.

**Nothing underneath was deleted.** `/blog` and `/blog/:slug` still route
(verified: `/blog` renders, h1 "Stories from Mogsy", zero page errors), and
`BlogIndex`, `BlogPost`, `BlogPostCard`, `useBlogList` and the site-wide
`HomeBlogStrip` are all untouched. Only `LolHub.tsx` stopped mounting the
block; its five now-unused symbols went with it (`BlogPostCard`, `useBlogList`,
`Newspaper`, `ArrowRight`, `LOL_TAG`) and ESLint is clean.

**No visual delta in this environment** — the block was already conditional on
`isLoading || posts.length > 0`, and no League-tagged posts exist here, so the
document height is unchanged at every viewport (1992 / 2172 / 2658). The change
is structural: it removes the section's ability to reappear on the hub the
moment a League-tagged post is published.

Two tests guard it: no `News & Blog` / `Latest LoL Stories` / `All posts` text
and zero `/blog*` anchors on `/lol`; and the lower stack's children are exactly
`[premium, community, utility]` with the stack as its container's last child.

### Open item for PT1 — the Premium price is inconsistent, and unowned

**Not touched in this task. Recorded here so it is not lost.** Two different
approved monthly prices for the same product exist in the repo right now:

| Source | Price | Status |
|---|---|---|
| `src/lib/pro/checkout.ts` → `LOL_PRO_MONTHLY_PRICE` (on `main`) | **$4.99/mo** | hardcoded in the frontend; rendered verbatim by `/lol/premium` |
| PT1.5 `supabase/functions/_shared/offer-catalog.ts`, `standard_monthly` | **$9.99/mo** — "exactly the approved $9.99/month" | **not on `main`** (commit `07153353`, branch `pt1/phase5-offer-identity`) |

PT1.5's whole point is that the *server* owns the offer→Stripe-Price mapping
and the client only names an offer id, so once it merges the frontend constant
stops being authority — but until then `/lol/premium` is the only thing a
customer reads, and it says $4.99. Neither figure is currently chargeable:
`isLolProCheckoutAvailable()` is false wherever
`VITE_STRIPE_LOL_PRO_MONTHLY_PRICE_ID` is unset, which is every environment.

**Cleanup task (PT1, not hub):** decide the launch price, land PT1.5 so the
catalog is authority, and make `/lol/premium` read the resolved offer rather
than a hardcoded constant. This is an independent reason the hub module prints
no price, on top of the unbuyable-checkout one above.

### Files changed

| File | |
|---|---|
| `src/components/lol/HubPremiumPanel.tsx` | **new** — the panel |
| `src/components/lol/HubPremiumPanel.test.tsx` | **new** — 6 tests |
| `src/pages/LolHub.tsx` | M — import, panel above `HubCommunitySection`, transition spacing, ad-slot margin; legacy News & Blog block + its 5 now-unused symbols removed |
| `src/pages/LolHub.test.tsx` | M — 5 new tests (placement/order, not-a-fifth-book, no subscription `Pro`, News removed, stack ends the page); `useBlogPosts` mock dropped |
| `src/index.css` | M — `.hub-premium-panel` sweep + reduced-motion opt-out |
| `docs/MOGZY_HUB_REDESIGN_HANDOFF.md` | M — this revision |

### Verification

- **Rebased onto `origin/main` `c5facfbb`** (the ARENA1 chain + DC1 Phase 5
  landed upstream mid-task; 8 commits). Clean rebase, no conflicts — the only
  file both sides touched was `src/index.css`, which auto-merged.
- **Full vitest, run SERIALLY on both sides** (a first attempt ran the two
  suites concurrently and produced a 22-file / 62-test "baseline" against a
  21-file / 69-test branch — pure CPU contention in the timing-sensitive
  CombatLab / StatCheck / RankedTutorial / QuizRanked suites, and not
  reproducible either way once run alone). Run one at a time the sets are
  **byte-identical**:

  | | `origin/main` `c5facfbb` | `hub/premium-module` |
  |---|---|---|
  | Test files | **12** failed / 557 passed (569) | **12** failed / 559 passed (571) |
  | Tests | **43** failed / 8612 passed / 7 skipped (8662) | **43** failed / 8630 passed / 7 skipped (8680) |

  Same 12 files, same 43 tests, in the same per-file counts: `AdminUsers.phase1`,
  `AcademyRadioControls`, `LeaguecraftWorkspace`, `adminCredentials`,
  `admin-registry`, `ads/consent`, `e2e/identity`, `quiz-broadcast/engine`,
  `Quiz.rankedRole`, `StructuralReview`, `LobbyPreviewPage`, `onboarding-gate`.
  None is a file this branch touches. The delta is +2 files / +18 tests, all
  passing, and fully accounted for: `HubPremiumPanel.test.tsx` (6) and 5 added
  to `LolHub.test.tsx` from this revision, plus `lib/community/links.test.ts`
  and the section tests from Revision 15.
- **`LolHub.test.tsx` + `HubPremiumPanel.test.tsx`:** 74/74 pass (68 + 6).
- **ESLint:** 0 problems on all four changed/added source files.
- **`tsc --noEmit -p tsconfig.app.json`:** the same 8 pre-existing failing files
  as baseline; none of them is mine.
- **Console:** `/lol` emits the identical three baseline lines at every
  viewport — the React `fetchPriority` casing warning, a Supabase 404 and a
  403. **Zero new errors, zero page errors.**
- **CTA:** clicking it navigates to `/lol/premium`, whose `h1` is
  "Mogzy Premium". No page errors on arrival.
- **Routes after the News removal:** `/blog` (h1 "Stories from Mogsy"),
  `/lol/pro-play` (h1 "Pro Play") and `/lol/premium` (h1 "Mogzy Premium") all
  render with zero page errors. Meta Reflex stays absent; Pro Play still has its
  two hub anchors and the four guide-bearing books are still four.
- **Lower sections:** Community (Discord pending plate + "on the way" note),
  Feedback (Give Feedback / Report a Bug), About (About Mogzy / Contact) and
  the legal-only footer all still render, unmoved and unchanged.
- **Responsive:** 360×740, 390×844, 768×1024, 1024×768, 1366×768, 1440×900,
  1920×1080 — **zero horizontal overflow** at every one; the CTA is 212×52
  (≥44px) at every one; body copy stays at 14px on mobile.

Screenshots (Playwright, per `playwright-not-vite-preview-for-visual-freeze`):
`1440x900-transition-premium`, `1440x900-lower`, `1440x900-full`,
`1920x1080-transition-premium`, `1920x1080-lower`, `1920x1080-full`,
`390x844-transition-premium`, `390x844-lower`, `390x844-full`,
`390-premium-panel`, `1440-premium-hover`, `1440-premium-focus`,
`1440-premium-member`.

### Not done, deliberately (still open hub tasks)

- The Mogzy `!` / What's New interaction — **explicitly out of scope here; do
  not start it automatically**
- Global Search
- Community social URLs (`VITE_COMMUNITY_*`) — still owner action, no code needed
- Help/FAQ page (no route exists)
- Admin Ads editor
- Contextual feedback inside Leaguecraft / Combat Sim
- Persistent glows, floating/bobbing, the mobile book treatment
- `BookModeCard` is still dead code
- A 768×1152 hero frame derivative

---

## Revision 2026-09-04b — below-the-fold rework

**Status:** complete on branch `hub/below-fold` (worktree
`/Users/macmoney/mogsy-wt-below-fold`), branched from `origin/main` `d0917a8d`.
**Above-the-fold hub untouched** apart from the bottom-edge fade described
below — that was the explicit constraint and it is verified by pixel diff.

### What the lower page was, and is now

| | Before | After |
|---|---|---|
| Hero → page | hard horizontal cut at the painting's edge | alpha ramp; the painting dissolves into the page background |
| First section | Meta Reflex — 7 duel cards + Stats / All games | Join the Academy (community) |
| Second | News & Blog | Help improve Mogzy + About the Academy |
| Third | global footer (6 links) | News & Blog, then a legal-only footer |
| Document height @1440×900 | 1558px | 1814px |

### 1. Meta Reflex removed from the homepage — the feature is intact

Deleted from `LolHub.tsx`: `SHOW_SWIPE_GAMES`, `SWIPE_GAME_ICONS`,
`SWIPE_GAME_CARDS`, the `LEAGUE_SWIPE_GAMES` and `META_REFLEX_*` imports, the
four now-unused lucide icons (`Zap`, `Heart`, `Brain`, `Coins`) and the whole
`lol-hub-meta-reflex-section` block — Favorite Champion, Most Annoying
Champion, Base HP / AD / Armor Duel, Stat Duel, Item Cost Duel, plus the Stats
and All games links.

**Nothing under it was touched.** `src/lib/league-swipe/` (branding, api,
catalog) is unchanged and every other consumer still reads it —
`LeagueSwipeHub`, `LeagueSwipeGame`, `LeaguePublicProfile`, `HexTrainingHero`
and the Leaguecraft entry at `Quiz.tsx` §2d. Verified live after the change:
`/league-swipe` (h1 "Meta Reflex"), `/league-swipe/stats` and
`/league-swipe/favorite-champion` all render.

### 2. The transition: an ALPHA ramp, not a fade to a colour

New `.academy-hero-fade` in `index.css`, applied to two elements — the
`<picture>`'s `<img>` **and** the readability scrim. Both, because masking only
the painting leaves the scrim behind as a dark veil over the page below.

The band is 90px on mobile, 130px from `md` up, weighted hard to the bottom
(`1 → 0.85 → 0.55 → 0.22 → 0`), so Mogzy and the four volumes sit entirely
above the ramp and only the empty floor and the pedestal's base dissolve.

**Why alpha and not a gradient down to a colour.** `.theme-lol body` carries
two `background-attachment: fixed` radial gradients, so the colour immediately
below the seam *changes as the page scrolls* — the red bottom radial alone
lifts it to roughly `rgb(28,15,21)` near the viewport floor against
`rgb(6,10,20)` elsewhere. Any opaque fade colour would be correct at one scroll
position and visibly wrong at every other. An alpha ramp cannot mismatch,
because the page's own background is what shows through.

The hero background PNG was **not** modified.

### 3. Community — `HubCommunitySection`, and the URLs that do not exist

New `src/lib/community/links.ts` resolves five channels from the environment
and **fails closed**: a value that is not an absolute `https:` URL (empty,
`TODO`, a bare handle, `http:`, `javascript:`) reads as "not open yet", never
as a link.

**An audit of the whole repository on 2026-09-04 found no Mogzy-owned social
URL of any kind.** Not in `site-config.ts`, not in `.env`/`.env.example`, not
in `index.html`. Every hit for discord/tiktok/instagram/x/youtube in `src/`
belongs to *user* profile socials (`social-validators.ts`, `ProfileCard`,
`Profile`) or to the Discord **OAuth identity** link in
`settings/AccountConnections.tsx` — which is account verification, not a
community invite. So all five are missing:

| Channel | Env var to set | Status |
|---|---|---|
| Discord | `VITE_COMMUNITY_DISCORD_URL` | **missing** — renders as "Discord — opening soon" |
| YouTube | `VITE_COMMUNITY_YOUTUBE_URL` | **missing** — omitted |
| TikTok | `VITE_COMMUNITY_TIKTOK_URL` | **missing** — omitted |
| Instagram | `VITE_COMMUNITY_INSTAGRAM_URL` | **missing** — omitted |
| X | `VITE_COMMUNITY_X_URL` | **missing** — omitted |

**Owner action:** set the vars and redeploy. No code change is needed — the
Discord plate becomes the gold primary CTA and each secondary channel appears
as soon as its var holds an https URL.

Discord keeps the strongest visual weight either way (52px plate, gold gradient
when live, dashed outline when pending); the rest are 44px icon+text pills.

### 4. Feedback + About — `HubUtilitySection`

Every action points at a route that already exists. Nothing new on the backend.

- **Give Feedback** → `/feedback` (the Feedback Center)
- **Report a Bug** → `/feedback?intent=bug`
- **About Mogzy** → `/about`
- **Contact** → `/contact`

`Feedback.tsx` gained a 6-line lazy initializer that reads `?intent=` and opens
that door directly, validated against `FEEDBACK_ENTRY_INTENTS`; anything
unrecognised falls through to the existing chooser. It sets the INITIAL view
only, so it cannot yank the user back after they navigate inside the page.

**Help / FAQ is deliberately absent — no such route exists in the app** (there
is no `/help` or `/faq`, and `/about` carries no FAQ section). It was left out
rather than pointed at a placeholder.

### 5. Legal footer — narrowed on `/lol` only

The global `Footer` is rendered sitewide by `Layout`, so it was **not**
redesigned. On the single path `/lol` it now filters to the trust set —
Privacy Policy, Terms of Service, Security — because the new band directly
above it already carries About, Feedback and Contact, and repeating them would
be the same four links twice within one screen. Copyright and the Riot
disclaimer are unchanged. Every other page renders the full six. No
destination became unreachable.

### 6. Pro promotion left room, not a placeholder

The lower container is a plain flow of siblings with the community section
first. A Pro module drops in above `<HubCommunitySection />` without moving or
re-deriving anything. No blank space is reserved.

### Files changed

| File | |
|---|---|
| `src/pages/LolHub.tsx` | M — Meta Reflex block + imports removed, fade class, lower section rebuilt |
| `src/index.css` | M — `.academy-hero-fade` |
| `src/components/Footer.tsx` | M — legal-only variant on `/lol` |
| `src/pages/Feedback.tsx` | M — `?intent=` deep link |
| `src/pages/LolHub.test.tsx` | M — Meta Reflex tests replaced by removal + new-section tests |
| `src/components/lol/HubCommunitySection.tsx` | **new** |
| `src/components/lol/HubUtilitySection.tsx` | **new** |
| `src/lib/community/links.ts` | **new** |
| `src/lib/community/links.test.ts` | **new** |

### Verification

- **Full vitest:** 12 files / 43 tests failing — **identical to the failure set
  on a clean `origin/main` `d0917a8d`**, confirmed by running the one file not
  in the previously recorded baseline
  (`dev/lobby-preview/LobbyPreviewPage.test.tsx`) in a detached baseline
  worktree, where it fails too. 8224 passed.
- **`LolHub.test.tsx`:** 63/63 pass, including the four new cases.
- **ESLint:** 0 errors on all nine changed files.
- **`tsc --noEmit -p tsconfig.app.json`:** failing-file set identical to
  baseline (the same 8 pre-existing files); none of them are mine.
- **Routes:** `/lol`, `/league-swipe`, `/league-swipe/stats`,
  `/league-swipe/favorite-champion`, `/feedback`, `/feedback?intent=bug`,
  `/about`, `/contact`, `/privacy`, `/terms`, `/security` — all render, no 404s.
  `?intent=bug` verified to skip the chooser and open the bug form.
- **Console:** the `/lol` console output is byte-identical to baseline — one
  React `fetchPriority` casing warning, one Supabase `funnel_events` 404 and
  one `stat-check/invites` 403, all present on `origin/main` too. **Zero new
  errors.**
- **Above-the-fold regression, measured.** A 1440×900 pixel diff against a
  baseline server (`Math.random` pinned so the academy line matches) shows 4,385
  pixels differing above y=770, max channel delta 90, all between y=582–734.
  **A control diff of the current build against ITSELF gives 10,936 differing
  pixels there, max delta 242** — the mascot idle animation and live patch
  content. The change is therefore *below the run-to-run noise floor* above the
  fold. Below y=770 the control differs by 567 pixels and the real diff by
  73,149: the fade band, which is the whole intended change.
- **Responsive:** 390/768/1024/1280/1440/1920 — every hub CTA is ≥44×44px, zero
  horizontal overflow, nothing clipped.

Screenshots captured (Playwright, not the Browser pane, per
`playwright-not-vite-preview-for-visual-freeze`): 1440×900 transition + lower +
full, 1920×1080 same, 390×844 same.

### Not done, deliberately (still open hub tasks)

- Mogzy Pro promotion module
- The Mogzy `!` / What's New interaction
- Global Search
- Contextual feedback inside Leaguecraft / Combat Sim
- Persistent glows, floating/bobbing, the mobile book treatment
- `BookModeCard` is still dead code
- A 768×1152 hero frame derivative

---

<!-- Revision 14 (live-review tuning). Revision 13 recorded the merge to main. -->

## Revision 2026-09-04 — live-review tuning: shelves inward, audio

**Status:** targeted production tuning after the owner reviewed the deployed
hub. Three changes only; no visual redesign.

### 1. Both columns pulled inward on wide screens

The existing `DESKTOP_BOOK_STACK_INSET` saturates at 120px by 1440, so every
wider viewport kept the columns pinned to the outside walls while the free
centre grew without limit. Measured gap from a book's inner edge to the tome:
158px at 1440, **329px at 1920**, **586px at 2560**.

A second term spends that excess, starting at ZERO at 1440:

```
DESKTOP_BOOK_PULL_IN = clamp(0px, (100vw - 1440px) * 0.36, 260px)
```

| Viewport | Books before | Books after | Inward | Gap before → after |
|---|---|---|---|---|
| 1366×768 | 107–300 | 107–300 | **0** | 200 → 200 |
| 1440×900 | 144–381 | 144–381 | **0** | 158 → 158 |
| 1920×1080 | 144–441 | **317–613** | **173px** | 329 → **157** |
| 2560×1440 | 144–504 | **404–764** | **260px** | 586 → 326 |

1366 and 1440 are bit-identical to the deployed build, as the review asked;
1920 now sits at the same 157px gap that 1440 already had, so the whole
desktop range reads with one density. The shelf unit moves whole — backing,
posts, boards, books, contact shadows — and left/right stay mirrored.

**Why a separate term and not a bigger cap on the existing inset.**
`academy-layout`'s `CENTERPIECE_WIDTH_CSS` subtracts twice
`BOOK_STACK_INSET_CSS` when it models the free central zone, so widening the
shared value would have **shrunk the Patch Report from its approved 380px to
271px at 1920**. The centerpiece is approved as it stands, so the pull is a
column-only transform and the tome's width term is untouched. Verified: the
tome measures 770–1150 at 1920 before and after, and 1090–1470 at 2560.

Guide bubbles re-checked at the new geometry: hovering Leaguecraft at 1920
puts the bubble at 781–948 against a book ending at 613 and a board ending at
682 — 99px of clearance. `hub-guide.ts` still needs no recalibration.

### 2. `bookLand` made materially louder

Inaudible on the live site at its original 0.075 peak. Every voice scaled by
**1.6**, per voice so the envelopes keep their shape:

| Voice | Was | Now |
|---|---|---|
| impact knock (noise 340→120Hz) | 0.075 | **0.120** |
| body tone (104→64Hz) | 0.055 | **0.088** |
| board ring (208→150Hz) | 0.028 | **0.045** |
| leather/paper settle | 0.022 | **0.035** |

**Gain-staged, not clipped:** the four peaks sum to 0.288 at worst and are
staggered besides, nowhere near the destination ceiling. This makes `bookLand`
the loudest cue in the set, just past the opponent bell — a deliberate
reordering, recorded in the engine's hierarchy comment, on the grounds that it
is a physical impact rather than a notification and fires exactly four times on
arrival and never again.

### 3. New `bookRuffle` cue on activation

Pages flicking as a volume is opened: three short bright noise bursts in the
paper band with falling peaks and irregular spacing, over the cover's leather.
Peak 0.055, ~230ms. Deliberately the **opposite shape** to the landing — that
is one low event sweeping down into the mids, this is several high ones — so
the two can never be confused despite both being "a book".

Wired on `onDestinationClick`, so it covers all four destinations and both
pointer and keyboard activation. New `play_book_ruffle` setting with an
AdminSounds row; same global mute.

**No navigation delay was needed, and none was added.** The AudioContext is a
module singleton that survives an SPA route change and the scheduled nodes keep
sounding on the next page — measured: navigation reached `/lol/pro-play`
**13ms** after the cue, and the context read `running` afterwards.

### Audio verification (Web Audio voices counted, not listened to)

`bookLand` is 2 buffer sources + 2 oscillators; `bookRuffle` is 4 buffer
sources + 0 oscillators — so the two are distinguishable in the counts.

- Entrance: **8 buffer sources + 8 oscillators = exactly 4 landings**, peaks
  read back as `0.12 / 0.088 / 0.045 / 0.035`.
- Click: **+4 buffer / +0 oscillator** — exactly one ruffle, no landing.
- Keyboard Enter on a focused book: **+4 buffer / +0 oscillator**, navigated
  to `/combat-lab` — identical to pointer.
- Muted: **0 / 0** for both.

**Known limitation, unchanged and pre-existing:** the engine will not sound
before the browser has seen a gesture, and its `once` listener is registered
when the audio module evaluates — so the gesture must land after that. On this
build a click at 500ms and at 700ms produced no landings; at 850ms all four
sounded. A direct cold load of `/lol` therefore still animates silently.

### Verification

311 tests passed (hub, `lol`, audio) · ESLint 0 errors · `tsc` failing-file
set identical to baseline.

---

<!-- Revision 13 (merged to main). Revision 12 was
     the entrance + loading stabilization. -->

## Revision 2026-09-03h — MERGED TO `main`

**Status:** the hub workstream is on `main` for live review.

| | |
|---|---|
| Previous `origin/main` | `d96708ab` — feat(pt1): reveal the questions a Ranked match added to your collection |
| Hub branch tip | `1a2e117c` — feat(hub): entrance choreography and Patch Report loading stabilization |
| Merge base | `fb21f106` |
| Merge commit | `f35d8db1` (first parent `d96708ab`, second `1a2e117c`) |

**`main` had advanced 9 commits** since the branch point — all Ranked, Mastery
and question-library work (43 files). **Zero file overlap** with the hub's 16,
so the merge was conflict-free and nothing needed resolving. No unrelated
working-tree state from any other checkout was included: the merge was made on
a detached HEAD at `origin/main` in the hub worktree, whose tree was clean, and
the only stash present (`auth1-wip-stash-before-cs2`) belongs to another
workstream and was left untouched.

### Verification on the MERGED tree

- 311 tests passed across the hub, `lol`, broadcast and audio suites.
- ESLint 0 errors (the 2 pre-existing `react-refresh` warnings on the
  broadcast surface remain).
- `tsc --noEmit` failing-file set **identical** to the pre-merge baseline.
- `/lol` renders the complete hub: four volumes, both shelves, centerpiece,
  radio and Mogzy.
- All four routes navigate: `/quiz`, `/lol/docs`, `/combat-lab`,
  `/lol/pro-play`.
- **Patch Report stabilization intact** — re-measured with the tome PNG held
  by a route intercept, the surface (362×262), dock and first icon (y=199) are
  byte-identical before and after image load.
- Entrance runs on the first hub visit, paired stagger preserved: Leaguecraft
  and Combat Simulation impact at 943/1010ms, Archives and Pro Play at
  1156/1238ms — 67ms within a pair, 213ms between pairs, 3px overshoot each.
  Absolute times sit ~150ms later than on the branch alone because the merged
  bundle is larger to parse; the offsets are unchanged.
- Repeat SPA navigation skips it: `data-hub-entrance="false"`, identity
  transform.
- Reduced motion: identity transform, opacity 1, `animationName: none`.
- Console errors are the three pre-existing classes only.

### Deployment

**A push to `main` does not by itself publish mogzy.lol** — the frontend is a
Lovable project and the live site updates on a Lovable **publish**, which is a
manual step in that dashboard. Pushing `main` makes the work available to
Lovable and to anyone building from the repo; the owner still has to publish
to see it on the live domain.

---

<!-- Revision 12 (entrance + loading stabilization). Revision 11 was the final shelf polish; 10 shelved both columns and
     went head-on; 9 restored the backing; 8 was the material pass; 7 built the
     shelf; 6 rejected the mirrored shell. -->

## Revision 2026-09-03g — hub entrance + Patch Report loading stabilization

**Status:** BUILT. Static design untouched; this is entrance and load polish.

### 1. The Patch Report jump — measured cause

The tome `<img>` carried a definite CSS width (`w-[130.2%]`) and **no
`width`/`height` attributes and no `aspect-ratio`**, so until the PNG's
intrinsic size arrived its height was **0**. `AcademyBroadcastSurface` is
`flex flex-col`, so the whole centerpiece collapsed with it — while the patch
content, sized in `cqw` (which depends only on WIDTH, known at first paint),
rendered at full size inside a zero-height box.

Measured on a held-image frame (the PNG stalled by a route intercept):

| Box | Before tome load | After |
|---|---|---|
| surface | 362 × **0** | 362 × 262 |
| overlay | 362 × **0** | 362 × 262 |
| tome img | 471 × **0** | 471 × 314 |
| radio dock | y = **127** | y = **389** |
| first patch icon | y = **155** | y = **199** |

So sixteen naked champion icons floated over the library, then the dock jumped
**262px** and the icons **44px**. That is the reported defect, exactly.

### 2. The fix

`width={1536} height={1024}` on the tome img (plus `h-auto`). The UA derives
`aspect-ratio: 3 / 2` from the attributes, the height is known at first paint,
and nothing moves. **Re-measured: every box is now byte-identical before and
after the image loads** — surface 362×262, dock y=389, first icon y=199 in
both frames.

### 3. Reveal gating

`AcademyBroadcastSurface` holds `chromeReady` and fades the whole composed
tome in over 260ms. Readiness is `onLoad` **or** a ref-callback `img.complete`
check (a cached image can be complete before React attaches the handler, which
would otherwise strand the centerpiece invisible), **or** `onError` — a
missing painting shows content over nothing rather than nothing at all. This
is not fighting layout shift (geometry is already reserved); it only stops
live patch content sitting briefly on bare library. No skeleton, no
full-page loading screen.

### 4. Entrance timing (measured, not nominal)

Only the books move. Library, header, shelves, centerpiece and Mogzy are the
room and are simply present — the shelves get no motion at all, since a case
that flew in would read as the UI panel the whole shelf workstream exists to
stop being.

| Book | delay | appears | impact | settled |
|---|---|---|---|---|
| Leaguecraft (UL) | 380ms | 446ms | 793ms | 1046ms |
| Combat Simulation (UR) | 455ms | 526ms | 859ms | 1126ms |
| Mogzy Archives (LL) | 600ms | 672ms | 1006ms | 1259ms |
| Pro Play (LR) | 675ms | 739ms | 1086ms | 1339ms |

Within-pair offset 75ms; **pair-to-pair 213ms measured** (brief asked
150–220ms); total ≈1.4s. `BOOK_ENTRANCE_MS = 660`,
`BOOK_ROW_DELAY_MS = [380, 600]`, `BOOK_PAIR_OFFSET_MS = 75`,
`BOOK_IMPACT_FRACTION = 0.55`.

### 5. Landing motion

`@keyframes academy-hub-book-land`: 0% −26px and invisible → 40% opaque, still
falling (the fade finishes BEFORE contact, so a solid object lands rather than
a ghost resolving on impact) → 55% **+3px, scaleY(0.978)** contact → 72% −3px
rebound → 100% the exact approved resting state. `animation-fill-mode:
backwards` holds frame 0 through the stagger, so a book awaiting its turn is
lifted and invisible rather than sitting in its final place. No rotateY, no
perspective, no opening, no scaling beyond the 2.2% compression. Measured
overshoot exactly 3px, min scaleY 0.978.

### 6. Sound

A **`bookLand` cue added to the existing engine** (`src/lib/audio/play-sfx.ts`)
— no parallel system and no audio asset: that engine synthesises everything
from two primitives. Three parts in the order a real one arrives: a dull knock
sweeping 340→120Hz with a body tone dropping 104→64Hz, a brief mid ring off
the boards, then quiet leather/paper at 1500→700Hz a beat later. Peak 0.075 —
between `modeConfirm` and `queueStart`. `MIN_REPLAY_MS` 40ms so the 75ms
within-pair gap sounds twice.

Gated by the app's ONE sound store: `play_book_land` in `SoundSettings`
(defaults true, gets an AdminSounds row) plus the global `mogsy-sounds-muted`.

**Verified by counting Web Audio voices:** 16 with a gesture (4 books × 4
voices — exactly one impact each), **0 muted**, **0 under reduced motion**,
**0 with no gesture**.

**Honest limitation.** The engine refuses to sound before the browser has seen
a user gesture, which is correct autoplay behaviour and pre-existing. A *direct*
fresh load of `/lol` therefore animates silently. The real path — the entry
screen at `/`, whose CTA navigates to `/lol` — carries a gesture, so it sounds.
A gesture must also land *after* the audio module has evaluated: a click at
150ms produced 0 voices, at 500ms produced 16.

### 7. Repeat-navigation policy

A **module-level `hubEntranceConsumed` flag**, no storage. A page load resets
it, so a fresh visit or a refresh gets the sequence; SPA navigation does not,
so clicking Home from anywhere puts the hub up instantly. A sessionStorage key
would have been slower, more fragile, and would have killed the entrance on a
genuine reload — the one time it is most wanted. Verified: first visit
`data-hub-entrance="true"`, after navigating away and back `"false"` with an
identity transform.

**One real bug fixed here.** The flag was first claimed inside a `useState`
initializer. That is not StrictMode-safe and was measurably wrong: the double
render made the second pass see its own first pass's claim and hand the very
first visitor `false`, killing the entrance exactly when it should run. The
initializer now only READS; an effect does the claim.

### 8. Reduced motion

CSS cancels the animation (`animation: none`) and the impact timers are never
scheduled — four thuds with nothing moving is worse than silence. Verified:
transform identity, opacity 1, `animationName: none` immediately on mount, and
0 voices. Interaction and focus are never delayed.

### 9. Layout shift

`PerformanceObserver` over a fresh load: **CLS 0.0043**, from exactly two
entries. Neither is the hub composition:

- **0.0043 at ~1s** — the two `<h1>` title `<span>`s reflowing when **Cinzel**
  swaps in. A webfont shift in the header, not the books, shelves or
  centerpiece. Fixing it means `font-display` or a preload change that is
  app-wide typography, out of scope for this pass; recorded as the one
  remaining shift.
- **0.00002** — the radio's own dropdown, on interaction.

**The main composition contributes zero measurable shift**, and the
centerpiece's own boxes are provably identical before and after image load.

### Files changed

`src/components/lol/broadcast/AcademyBroadcastSurface.tsx` (reservation +
reveal gate) · `src/pages/LolHub.tsx` (entrance state, delays, impact
scheduling) · `src/index.css` (landing keyframes + reduced-motion) ·
`src/lib/audio/play-sfx.ts` (the cue) · `src/lib/audio/usePlaySfx.ts` (gate
map) · `src/hooks/useSoundSettings.tsx` (setting + label) ·
`src/lib/audio/play-sfx.test.ts` (cue count 9 → 10).

### Verification

311 tests passed across the hub, broadcast and audio suites · ESLint 0 errors
(2 pre-existing `react-refresh` warnings on the surface, which already exported
`briefSpread`/`briefIconSizing` at baseline) · `tsc` failing-file set identical
to baseline · console errors are the three pre-existing classes only. After the
entrance: all four hovers give `translateY(-10px)` with the right Mogzy bubble,
all four routes navigate, Patch Brief and radio both render.

### Remaining loading issue

The Cinzel font swap above. Also unchanged from earlier revisions:
`CENTERPIECE_MAX_PX` caps the tome at 1920, `BookModeCard` is dead code, and
the book frame PNG is 2.42 MB.

### Next

Not started, deliberately: persistent glows, floating/bobbing, Pro promotion,
What's New, below-the-fold redesign.

---

<!-- Revision 11 (final shelf polish).
     Revision 10 shelved both columns and went head-on; 9 restored the backing;
     8 was the material pass; 7 built the shelf; 6 rejected the mirrored
     shell. -->

## Revision 2026-09-03f — final shelf polish · STATIC DESIGN LOCKED

**Status:** LOCKED. CSS-only pass on four named items; no geometry, no
component, no test changed. **No new asset** — `src/index.css` is the entire
diff outside the handoff.

### 1. Uprights — the side plane is now a real element

The beam's side was the tail of one `90deg` gradient, which is why it still
read as a shaded strip. It is now `::after` at `inset: 0 0 0 74%` with its own
`linear-gradient(90deg, #2b1c0d, #1d1309 60%, var(--shelf-dark))` and its own
`inset 1px 0 0 rgba(226,196,140,.12)` arris. An arris is a hard edge between
two differently-lit surfaces, and only a real box can carry one. The post's
own gradient shortened to the front face alone.

`::before` adds the beam's cast shadow onto the backing —
`linear-gradient(90deg, rgba(0,0,0,.44), transparent)` at `left: 100%`, width
70%. It falls right on both posts because the whole scene is lit from the
left, and it is what reads as the post standing PROUD of the backing rather
than inlaid into it.

### 2. Backing — alternating plank tone

Seams strengthened (joint `.42 → .5`, lit arris `rgba(214,178,128,.07) → .085`)
and a second `repeating-linear-gradient` alternates plank value on a TWO-seam
period: `rgba(255,240,214,.022)` against `rgba(0,0,0,.055)`. About ±2%, which
is the whole effect — neighbouring boards differ the way milled stock out of
one tree does, without turning the backing into stripes that compete with the
volumes.

### 3. Board front edges — stepped profile and end joinery

The face gradient gains a shallow step above the underside (`#3d2a19` 72% →
`#2f1f11` 73%) under the existing chamfer break at 23%, so the profile is
milled rather than square-cut. Both boards also gain end shading —
`inset ±7px 0 9px -7px rgba(0,0,0,.62)` (base `±8px 0 11px -8px` at `.65`) —
which darkens each board where it crosses an upright: the ends turning away,
which is the joinery cue.

### 4. Perimeter ambient shadow

On the backing: `0 0 30px 8px rgba(2,5,10,.4)` plus
`0 14px 44px 6px rgba(2,5,10,.42)`. Wide spread, near-zero offset on purpose —
an offset shadow would read as a UI card lifted off the page, which is the
exact opposite of what the shelf is for. It seats the case in the room and
leaves the books' own contact shadows untouched.

### Verification

- **No coordinate moved.** Books 237×355 at (144,118), (144,480), (1059,118),
  (1059,480), computed transform `matrix(1, 0, 0, 1, 0, 0)` — head-on, no
  angling returned. Shelves on those two boxes; backing 298×730 at (113,111);
  posts 17px at x 113/395; upper board 346×15 at (90,467). Boards stay put on
  hover, so the contact shadows still belong to the shelf.
- All four routes navigate. 112 tests passed · ESLint clean · `tsc` failing-file
  set identical to baseline · no new console errors.

### Do the shelves read more dimensional?

Yes, on the uprights especially — the separate side plane with its own arris
is the one change that clearly lands, and the cast shadow onto the backing is
second. The board and backing changes are real but subtle at hub scale; they
are visible in a close crop and near-invisible at 1440 width, which is the
right side of the line for furniture that is meant to be quiet.

### Remaining static visual issues (carried, none introduced)

1. `CENTERPIECE_MAX_PX = 380` caps the tome while the volumes reach 297×445 at
   1920×1080, and the heavier side furniture makes the centre read lighter.
2. The backing is largely occluded by head-on books, so the planking and the
   new alternation mostly read in the strips beside each volume.
3. `BookModeCard` is dead code; the frame PNG is still 2.42 MB.

### Next workstream

**Static shelf/book design is LOCKED.** Next is entrance choreography and
sound — not started.

---

<!-- Revision 10 (both shelves, darker wood, head-on books).
     Revision 9 restored the backing; 8 was the material pass; 7 built the
     shelf; 6 rejected the mirrored shell. -->

## Revision 2026-09-03e — both shelves, darker wood, all four books head-on

**Status:** COMPOSITION LOCKED, AWAITING OWNER REVIEW.

Three approved changes land together, and they are related: once a volume
stands between two uprights on a board, it no longer needs to be turned in
space to explain where it is. The shelves took over that job, so the books
went flat.

### 1. Both columns are shelved

`renderShelvedColumn()` replaces the two hand-written column blocks; both
sides render the SAME `AcademyHubShelf`, **unmirrored**. The case is
symmetrical and lit from the left like every other object in the painting, so
the two sides read as a matching pair with no counter-turn — and the mirroring
mistake of Revision 5 is not repeated on the furniture.

### 2. All four books are head-on

Every rotation is gone: `rotateY`, `rotateYHover` and `rotateZ` are deleted
from `AcademyHubBook`'s props, the `CLOSED_BOOK_ROTATE_*` constants are
deleted from `LolHub`, and `perspective`, `transform-style`, the three
`--hub-book-rotate-*` custom properties and the `<1024px` flattening media
query are all deleted from the CSS. Confirmed in the browser: every volume's
computed transform is `matrix(1, 0, 0, 1, 0, 0)` at rest — exact identity, no
residual angle. A test asserts no rotation custom property and no inline
transform survives on any of the four.

### 3. Hover simplified to a lift

`translateY(-10px)` plus the gold light response, and nothing else. Measured
on all four: `matrix(1, 0, 0, 1, 0, -10)`, gold present, correct Mogzy bubble.
Under `prefers-reduced-motion` the lift is `0` and the light response stays.

### 4. Shelf darkened and refined

| Token | Was | Now |
|---|---|---|
| `--shelf-lit` | `#856140` | `#6b4c30` |
| `--shelf-face` | `#5b422a` | `#452f1d` |
| `--shelf-mid` | `#4a3420` | `#372516` |
| `--shelf-deep` | `#2a1c10` | `#1f1409` |
| `--shelf-dark` | `#1c1209` | `#150d06` |
| Backing body | `96deg #574029→#31210f` | `96deg #402d1c, #372516, #2c1d11, #1e1408` |
| Board top plane | `#967048 → #6a4d2f` | `#7d5b39 → #543b23` |

Roughly one and a half values down — dark walnut, still unmistakably warm, and
nowhere near the near-black panel that failed in Revision 7 (the darkest
member is `#150d06`, used only at arrises).

Refinements, all carpentry rather than ornament:
- **Boards get a chamfer.** The front face is no longer a flat ramp: a lighter
  band to 26%, then a hard step into the face. A square-cut board reads as a
  bar; the chamfer is what makes it read as milled.
- **The base reads as two members.** Height `×1.5 → ×1.7`, plus a plinth
  reveal — an `inset 0 -6px 0 -5px` dark line with an `inset 0 -8px 0 -7px`
  lit arris under it. Cheapest joinery cue there is.
- **Crisper plank seams** on the backing: joint `rgba(0,0,0,.34) → .42`, lit
  arris `rgba(255,234,198,.055) → rgba(214,178,128,.07)`.
- Uprights keep Revision 9's hard corner at 74%, re-valued into the darker ramp.

### One real bug, found and fixed during this pass

Factoring the two columns into `renderShelvedColumn` first collapsed **all
four books to the width of their title text.** The wrapper had an indefinite
width while its children were `w-full` against it — a circular reference that
resolves to max-content. `self-start`/`self-end` did not fix it (align-self
does not make a width definite); `w-full` alongside the `max-width` cap does,
and the auto margin then parks the wrapper at the column's outer edge. Worth
recording because the failure mode is silent and total.

### Verification

- **No coordinate changed.** Books 237×355 at (144,118), (144,480),
  (1059,118), (1059,480); shelves exactly on those two boxes. Identical to
  every revision since the four-book conversion.
- All four routes navigate. All four hovers and the guide bubbles are correct.
  The upper board stays at y=467 at rest and on hover, so the contact shadow
  still belongs to the shelf.
- 112 tests passed · ESLint clean · `tsc` failing-file set identical to
  baseline · no new console errors.
- Centre untouched: Patch Report, radio dock, Mogzy and his pedestal are
  unchanged, as are crops (Ryze 78% · Akali 36% · Viktor 34% · Ahri 56%),
  titles, sizes, routes, guide copy and the mobile panel list.

### Remaining visual issues

1. **`CENTERPIECE_MAX_PX = 380` still caps the tome** while the volumes reach
   297×445 at 1920×1080. Carried forward from Revision 5; now that the sides
   are heavier furniture, the centre reads lighter than before.
2. **The backing is largely occluded.** With head-on books there is less of it
   visible than when the volumes were turned, so the planking mostly reads at
   the strips beside each book. Not wrong, but the material is doing less work
   than it did at ±11°.
3. `BookModeCard` is still dead code, and the frame PNG is still 2.42 MB.

### Next decision

Owner review of the locked composition. Entrance choreography and sound remain
unstarted, as does the mobile book treatment.

---

<!-- Revision 9 (backing restored as planking).
     Revision 8 was the material pass; revision 7 built the shelf; revision 6
     rejected the mirrored shell. -->

## Revision 2026-09-03d — backing restored as walnut planking

**Status:** BUILT, AWAITING OWNER VISUAL APPROVAL. Still LEFT COLUMN ONLY.

Revision 8 deleted the back panel. That was the wrong call for the owner's
preference: the open case read as brown bars around books rather than as
furniture. The backing is restored — but **not** the version that was removed.

### Why the first backing failed, and what changed

The original was `#1b1209 → #0e0904` under `inset 0 0 42px rgba(0,0,0,.62)` —
a near-black rectangle, which read as a hole punched in the painting. The
diagnosis was wrong the first time: the problem was never that a panel
existed, it was that the panel was not made of anything. The fix is **actual
wood**, not less panel.

| | Removed version | Restored version |
|---|---|---|
| Body | `#1b1209 → #0e0904` | `linear-gradient(96deg, #574029, #4c3722 34%, #3f2c1a 68%, #31210f)` |
| Inset | `0 0 42px rgba(0,0,0,.62)` | `0 0 26px rgba(0,0,0,.34)` |
| Structure | none — a flat field | vertical plank seams every `16cqw`: a `rgba(0,0,0,.34)` joint with a `rgba(255,234,198,.055)` lit arris on its near side |
| Grain | none | `0deg` hairlines at 3–3.5%, running with the planks |
| Shading | none | `180deg` falloff to `rgba(0,0,0,.34)` at the head and foot |

It is one value darker than the boards, so the boards still read in front of
it, and it spans post-edge to post-edge so it visually ties the two uprights
together. It paints FIRST, before the uprights and boards, so the boards' own
cast shadows now land on it — which is what actually fuses the three parts
into one built object rather than three overlapping shapes.

### Uprights — side face added

Taken up as optional in the brief, because Revision 8 flagged the uprights as
the weaker half. The smooth `90deg` ramp is replaced by a **hard corner**: the
front face runs to 74%, then a discontinuity into the side face
(`#513a24` → `#2c1d10` at the same stop). A beam needs a visible arris; a
smooth ramp reads as a shaded strip no matter how many stops it has. No caps,
no carving, no ornament — the gradient is the whole change.

### Boards — unchanged

The three-plane read from Revision 8 is preserved exactly: lit top plane
(`::after`, inset `0.7cqw`), front face, ambient crease (`::before`), dark
underside inset, cast shadow. Placement untouched. The contact shadow still
lives on the board's top plane, so a lifting volume does not drag it along.

### Verification

- **No coordinate changed anywhere.** Measured against Revision 8: books
  237×355 at (144,118) and (144,480) left, (1059,·) right; backing 298×730 at
  (113,111); uprights 17px at x 113/395, y 101→851; boards 346×15 at (90,467)
  and 346×23 at (90,828). Identical at rest AND on hover.
- Books still read clearly in front: the backing is darker than the boards and
  far darker than the volumes' navy-and-gold, and it is mostly occluded by
  them — only the strips beside each book show planking.
- Guide, hover, focus and routes unaffected — this is CSS on an `aria-hidden`,
  `pointer-events: none` layer. Leaguecraft hover still speaks its line and
  still navigates to `/quiz`.
- 111 tests passed · ESLint clean · no new console errors.

### Does it read as a shelf?

Yes. The three-way crop makes the progression legible: (1) the dark box reads
as a hole, (2) the open case reads as bars, (3) the planked backing reads as a
wooden display unit holding two ornate books. The plank seams are the specific
thing that does it — they give the eye carpentry to hold on to where a flat
field gave it nothing.

### Next decision

Owner visual approval, then duplicate the case to the right column. Nothing
else from the earlier revisions has moved: no entrance animation, no sound, no
right-side shelf.

---

<!-- Revision 8 (shelf material pass).
     Revision 7 built the shelf; revision 6 rejected the mirrored shell. -->

## Revision 2026-09-03c — left shelf material + depth pass

**Status:** BUILT, AWAITING OWNER VISUAL APPROVAL. Still LEFT COLUMN ONLY —
not duplicated to the right.

Geometry pass approved; this changes only how the wood reads. **No token, no
dimension and no coordinate moved.** `--shelf-post`, `--shelf-slab`,
`--shelf-out`, `--shelf-rise` and `--shelf-lip` are untouched, and both
volumes measure exactly as before: 237×355 at (144,118) and (144,480); boards
346×15 at (90,467) and 346×23 at (90,828); uprights 17px at x 113/395.

### The back panel is gone

Removed, not restored. It read as a flat dark rectangle over the painted
library rather than as a recess. The case is now open — the library shows
between and behind the volumes and the uprights and boards carry the
structure alone.

### Three ideas do all the work

1. **Every board is a solid with three planes**, not a rectangle with a
   gradient. `::after` is the lit TOP PLANE — the surface the volume actually
   stands on — inset `0.7cqw` from the front face on both sides, and that
   inset is what reads as depth rather than as a highlight stripe. The element
   itself is the FRONT FACE. `::before` is a thin ambient-occlusion crease
   where the two planes meet, which is the cheapest possible "these are two
   surfaces". `inset 0 -1px 0 rgba(0,0,0,.6)` is the dark UNDERSIDE, and the
   outer `0 12px 20px` (base `0 18px 26px`) is the cast shadow.
2. **Grain runs along the length of each piece** — `90deg` hairlines on the
   boards, `0deg` on the uprights — as `repeating-linear-gradient` layers at
   4–5% contrast with deliberately irregular stop spacing (even stops read as
   corduroy). Real boards are cut with the grain, and getting that direction
   wrong is most of what makes CSS wood look like plastic.
   **No texture asset was added** — CSS did it cleanly.
3. **The contact shadow lives on the board's top plane**, composited as a
   `radial-gradient` background layer on `::after`, not on the book.

### Uprights

The 90deg body gradient is a cylinder read — lit near arris, face turning
away, shaded far side — and a new 180deg overlay adds ambient falloff, since
a post in a room is dimmer at its ends than at eye height. That alone is most
of what stopped it reading as a flat bar. Two 1px insets give it its arrises:
`inset 1px 0 0 rgba(226,196,140,.14)` lit, `inset -1px 0 0 rgba(0,0,0,.55)`
dark. No caps, no carving, no motifs.

### Palette (new `--shelf-*` ramp)

`--shelf-lit #856140` · `--shelf-face #5b422a` · `--shelf-mid #4a3420` ·
`--shelf-deep #2a1c10` · `--shelf-dark #1c1209`. Top plane
`linear-gradient(180deg, #967048, var(--shelf-lit) 40%, #6a4d2f)` with an
`inset 0 1px 0 rgba(232,205,152,.2)` front arris. No gold accent proved
necessary.

### Verification

- **Contact shadow stays on the shelf.** Measured at rest and on hover: the
  upper board is at y=467 in BOTH states while the Leaguecraft body rises
  117→108. The shadow does not travel with the lifting volume.
- No coordinates changed; no book, upright or board moved by a pixel.
- 111 tests passed · ESLint clean · console errors are the three pre-existing
  classes only, none new.
- Hover, focus, routes and the Mogzy guide are untouched by this pass — it is
  CSS on an `aria-hidden`, `pointer-events: none` layer at `z-0`.

### Honest read

The boards clearly gained thickness — the lit top plane against the darker
face is the biggest single improvement, and the base board now reads as
carrying the case. The uprights improved less: the ambient falloff and the
arrises help, but with no side face they are still closer to flat than the
boards are. If more is wanted there, a real side-face element (a second
narrow div at the post's dark edge) is the next honest step rather than more
gradient stops. Stopping here per the brief — one disciplined pass.

### Next decision

Owner visual approval of the left shelf material before duplicating the case
to the right column.

---

<!-- Revision 7 (left shelf prototype).
     Revision 6 rejected the mirrored shell. -->

## Revision 2026-09-03b — LEFT shelf structure prototype

**Status:** PROTOTYPE BUILT, AWAITING OWNER VISUAL APPROVAL.
**Left column only, deliberately** — the right pair still floats, so the hub
itself is the A/B: grounded left vs floating right.

The problem being solved is that four closed volumes read as UI objects over
the painted library. This gives the left pair furniture to stand on. Coded
geometry, no art asset: CSS gradients and shadows only, so silhouette, scale
and placement can be judged before anyone commits to a wood texture.

### Structure

`src/components/lol/AcademyHubShelf.tsx` — a shadowed back panel, two
uprights, an upper board and a thicker base board.

It has **no coordinates of its own.** It is an absolutely-positioned overlay
on the same box as the two books, and it mirrors the book stack with two
`flex-1` rows under the same gap, each hanging its board at its own bottom
edge. Row heights therefore track the volumes exactly at every viewport with
nothing to keep in sync by hand. Every thickness is in `cqw` against that box
— 1cqw is 1% of the BOOK WIDTH — so the case scales with the volumes through
the fold-driven sizing formula and needs no breakpoints.

| Token | Value | = at 1440×900 |
|---|---|---|
| `--shelf-post` | `7cqw` | 17px upright |
| `--shelf-slab` | `6.5cqw` | 15px board (base ×1.5 = 23px) |
| `--shelf-out` | `13cqw` | 31px clear of each book edge |
| `--shelf-rise` | `7cqw` | 17px of upright above and below the stack |
| `--shelf-lip` | `3cqw` | 7px of board past each upright |

### Measured geometry

| | 1440×900 | 1920×1080 |
|---|---|---|
| Uprights | 17px wide, x 113 and 395, y 101→851 | 21px, x 105 and 458, y 102→1042 |
| Upper board | 346 × 15 at (90, 467) | 433 × 19 at (76, 560) |
| Base board | 346 × 23 at (90, 828) | 433 × 29 at (76, 1012) |
| Back panel | 298 × 730 at (113, 111) | 374 × 915 at (105, 114) |

### Colours

Uprights `linear-gradient(90deg, #2b1c10, #5a4128 26%, #6b4e30 44%, #452f1c
78%, #23160c)` with `0 10px 22px rgba(3,6,12,.55)` — a cylinder read lit from
the left, matching the painting and the book shells. Boards
`linear-gradient(180deg, #7a5a39, #63482c 16%, #4a3420 62%, #2a1c10)` with a
`rgba(214,180,128,.16)` inset top highlight for the lit front edge and
`0 12px 20px` (base `0 18px 26px`) of throw. Back panel
`linear-gradient(180deg, #241809, #1a1207 55%, #130d06)` plus
`inset 0 0 46px rgba(0,0,0,.5)`. A blurred radial contact shadow sits on each
board, painted on the board rather than the book so it stays put while the
volume lifts on hover. No carving, no filigree, no gems, no glow, no gold
accent proved necessary.

### First pass was too tight — one retune, then stopped

The initial values (`--shelf-out: 6.5cqw`, `--shelf-post: 5.5cqw`) tucked the
case against the volumes and it read as "books in a dark box", not furniture:
the books are angled 11°, so the near edge covers a close upright entirely,
and the 7px inter-book gap swallows a thin board. The case has to clear the
volumes by enough that the **uprights and the board ENDS** carry the read
rather than the sliver between the books. One retune fixed it; polishing
stopped there per the brief.

### Verification

- **No book coordinate moved.** Both columns measure exactly as they did
  before the shelf: 237×355 at (144,118) and (144,480) left, (1059,·) right at
  1440×900; 297×445 at 1920×1080.
- **Z-order as specified:** shelf `z-index: 0`, books raised to `z-index: 10`.
  The shelf is `aria-hidden="true"` with `pointer-events: none`, and
  `elementFromPoint` over an upright returns the grid container, never the
  shelf — it cannot take a click, a focus stop or an announcement.
- Hover and focus unaffected: Leaguecraft and Archives both give +5.5°, −10px
  lift and the correct Mogzy bubble; keyboard focus reaches `/lol/docs` and
  clicking it navigates.
- 111 tests passed · ESLint clean · console errors are the three pre-existing
  classes only, none new.

### Layout notes / issues introduced

1. **The back panel is the weakest element.** It reads as a flat dark
   rectangle over the painted library rather than as a recess, most visible in
   the band above Leaguecraft. If the structure is approved this is the first
   thing to fix — most likely by dropping it and letting the uprights and
   boards carry the case alone.
2. **The uprights are flat bars, not posts.** No side face, so no real depth.
   Expected from a geometry-first pass; a side-face gradient or a texture is
   the follow-up.
3. **The base board overhangs the fold by 7px** at 1440×900 (bottom 851 against
   the section's 844 padding edge). It is inside the section's own bottom
   padding, so nothing clips or scrolls, but it is the tightest spot.
4. **The uprights start 6px above the header's baseline** (y 101 vs header
   bottom 107). No visual collision — the header text is centred and the case
   is far left — but there is no slack left there.
5. The volumes' own drop shadows still fall on the library rather than on the
   boards, so the contact is not fully sold. Left alone: fixing it means
   touching the book component, which this pass had no mandate to do.

### Next decision

Owner visual approval of the left shelf before duplicating it to the right.
Not done and deliberately so: no right-side shelf, no wood texture asset, no
entrance animation, no sound.

---

<!-- Revision 6 (mirrored shell rejected).
     Revision 5 is the four-book conversion; revision 4 is the Leaguecraft
     prototype the owner approved; revision 3 is the IA cleanup; revisions 2
     and 1 are the audits that produced it. -->

## Revision 2026-09-03 — mirrored right-column shell REJECTED

**Status:** CORRECTION APPLIED. Owner approved the complete four-book design,
size, crops, positioning and inward perspective, with one defect to fix.

**The experiment.** Revision 5 drew the right column's shell with
`scaleX(-1)`, so both columns' spines sat on the outer edge and the quadrant
read as two bilaterally symmetrical shelves. The window and title panel each
carried a second, mirrored x (`100 − left − width`) to move with it.

**Why it was rejected.** The shell art is not symmetrical: its leather grain,
gold ornament highlights and spine banding are lit from one side. Reflected,
that lighting runs against the painted library behind it and the artwork reads
as *wrong artwork* — which costs more than bilateral binding symmetry buys.

**What is now true.** All four books draw
`src/assets/academy-book-frame.png` in its NATIVE orientation, spine on the
left, including the right column. The books still face inward toward Mogzy —
that comes from the CSS perspective alone, which is unchanged: **left column
`rotateY` +11°, right column −11°, hover/focus ±5.5°.** The right-hand books
therefore have their spine on the inner edge, and that is intentional; the
bindings are deliberately NOT bilaterally symmetrical.

**Removed cleanly, no dead code:** the `mirrored` prop, the shell's inline
`scaleX(-1)`, both `mirroredLeft` coordinates, and the `box()` helper that
selected between them. `ART_WINDOW` and `TITLE_PANEL` are back to one set of
coordinates each, and all four books derive window and title placement from
the same native frame geometry. Verified in the browser: the shell `<img>`
computes `transform: none` on all four. No test existed whose purpose was the
reflected shell, so none was removed — `LolHub.test.tsx`'s "mirrors the inward
turn" case is about the rotateY negation, which stays, and the mascot facing
tests are about Mogzy's own `scaleX(±1)`.

Also corrected here: `AcademyHubBook`'s header docstring still described the
component as the Leaguecraft-only prototype, two revisions after that stopped
being true.

**Nothing else changed.** Sizes, positions, the 2×2 composition, champion art,
crops (Ryze 78% · Akali 36% · Viktor 34% · Ahri 56%), titles and their
placement, ±0.8° row roll, `perspective: 1400px`, the `translateY(-10px)` lift,
the Mogzy guide, the Patch Report, the radio, the centre composition, the
desktop sizing formula and the mobile treatment are all untouched. This was
deliberately a single-variable change so the owner can judge it in isolation.

**Verification.** 111 tests passed · ESLint clean · all four routes navigate ·
computed rest rotations `[+11, +11, −11, −11]` with shell transform `none` ·
Pro Play hover and Combat Simulation keyboard focus both give −5.5°, −10px lift,
the gold response and the correct Mogzy bubble · console errors are the three
pre-existing classes only (the `fetchPriority` warning plus a 403 and a 404),
no new ones · mobile 375×812 differs from the previous capture only by a
164×5px antialiasing band.

**Screenshots.** 1440×900 default · 1920×1080 default · 1440×900 Pro Play
hover · 1440×900 Combat Simulation focus · a cropped before/after of the
Combat Simulation book showing the reflected vs native shell.

**Next decision.** Owner visual approval of the complete four-book hub with
native shells. The remaining visual issues from Revision 5 all still stand
(centerpiece cap at 1920, `BookModeCard` dead code, the 2.42 MB frame,
faces sitting high in the window). Entrance choreography and sound remain
unstarted.

---

## Revision 2026-09-02d — ALL FOUR destinations are closed Academy volumes

**Status:** BUILT AND COMMITTED, AWAITING OWNER VISUAL APPROVAL OF THE
COMPLETE FOUR-BOOK HUB.
Branch `hub/leaguecraft-closed-book`, on top of `a22534af` (the approved
Leaguecraft prototype, Revision 4 below).

The owner approved the prototype direction and its size, and asked for a
slightly stronger inward turn. `/lol` now renders Leaguecraft, Combat
Simulation, Mogzy Archives and Pro Play as one shared closed-volume design.
`BookModeCard` no longer renders anywhere on the hub.

### Final four-book geometry

Sizing moved off the prototype's "fraction of the open book" model, which only
had to spend the single row the 6→4 IA cleanup freed. With four portrait
volumes the binding constraint is simply the fold:

```
2 × (w × 1.5) + gap  ≤  100dvh − headerBottom − bottomPad
→ w ≤ (100dvh − 190px) / 3          capped at 360px
```

`CLOSED_BOOK_FIT_OFFSET_PX = 190` collects the header at its ceiling (118px:
pt 8 + two title lines at 1.12 line-height of the capped 2.4rem title + the
personal line's mt 4 + 20), the section's `pb-14` (56px), one 12px gap and 4px
of slack. Taken at the title's ceiling, so it is conservative at every height
rather than only at the matrix entries. The 360px cap is a composition limit,
not a fit limit.

| Viewport | Volume | Column top | Column bottom | Slack above `pb-14` |
|---|---|---|---|---|
| 1366×768 | 193 × 289 | y 111 | y 696 | 16px |
| 1440×900 | **237 × 355** | y 118 | y 835 | 9px |
| 1920×1080 | **297 × 445** | y 123 | y 1021 | 3px |

**On size.** Four portrait volumes in two rows cannot hold the one-book
prototype's 288px width at 1440×900 — two 431px books plus a gap is 874px
against ~737px of usable lane. 237px is the largest that fits the fold, and it
is still far taller (355px) than any open book the hub has ever shown (229px at
the same viewport). This is geometry, not a stylistic reduction.

The `-50px` column lift (`BOOK_STACK_LIFT_CSS`) is no longer applied: it
existed to open the pedestal under three SHORT open-book rows that left slack
above them. Two portrait volumes spend the fold almost exactly, so any negative
lift now pushes row one into the title band. The constant stays exported and
tested for the open card; the hub passes `0px`. Nothing else in
`academy-layout.ts` was re-derived — the open-book constants and
`CENTERPIECE_WIDTH_CSS` are untouched, and every volume stays narrower than the
open width term so the tome is unmoved.

### Perspective and hover — final values

| Value | Setting |
|---|---|
| `perspective` | `1400px` on the link |
| Resting `rotateY` | **+11°** left column · **−11°** right column (exact negation) |
| Hover/focus `rotateY` | **+5.5° / −5.5°** — half the rest angle, toward the viewer |
| `rotateZ` | **±0.8°**, alternating by row so the shelf is not machine-set: Leaguecraft −0.8, Archives +0.8, Combat Simulation +0.8, Pro Play −0.8 |
| Hover/focus lift | `translateY(-10px)` |
| Hover/focus light | gold rim inside the art window + a gold drop-shadow |
| Transition | `380ms cubic-bezier(.22,.61,.36,1)` transform, 380ms filter |

Up from the prototype's 8°/4°. Verified by computed style: `[11, 11, −11, −11]`
at 1440×900 and 1920×1080, flattened to 2D at 1023×800, and under
`prefers-reduced-motion` the resting ±11° stays while the hover turn, the lift
and every transition are cancelled.

**Shell mirroring — this is what stops it reading as four copies of one card.**
The frame art puts the spine on the LEFT. Drawn unmirrored, all four spines
point the same way and the right column's spines face Mogzy. The right column
now draws the shell with `scaleX(-1)` so its spines sit on the OUTER edge and
the two shelves face each other. Only the SHELL flips: the art window and the
title panel carry a second, mirrored x (`100 − left − width`) and the splash and
title are never mirrored.

### Champion crops (portrait window, 0.88:1 against ≈1.70:1 splashes)

`object-fit: cover` shows each splash's full height and crops horizontally, so
the X value frames the champion and Y is close to inert. Source assets are
untouched.

| Destination | Champion | `object-position` | Why |
|---|---|---|---|
| Leaguecraft | Ryze | **78% center** | unchanged — owner-approved |
| Combat Simulation | Akali | **36% center** | centres her torso and kama; her mask stays in frame |
| Mogzy Archives | Viktor | **34% center** | centres the figure and keeps the glowing blade |
| Pro Play | Ahri | **56% center** | her face and the orb both read |

The registry's single `splashPosition` now means the PORTRAIT window; the open
card's old landscape values are gone with the card.

### Titles

All four are HTML on the leather, split on `"\n"` (never on spaces) so the
registry controls the setting exactly: LEAGUECRAFT / STUDIES, COMBAT /
SIMULATION, MOGZY / ARCHIVES, and PRO PLAY on one line. One shared type ramp,
`clamp(0.68rem, 8cqw, 2rem)` Cinzel at 0.1em tracking — 157px of text in a
166px panel at 1440×900, 197 in 208 at 1920×1080. No cover carries descriptive
copy; a test asserts the registry subtitles never reach a cover.

### Guide offsets — no recalibration was needed

All four `lean`/`bubble` pairs were checked visually at 1440×900 with each book
hovered. Mogzy leans to the correct side every time, each bubble carries the
right destination copy, and no bubble collides with a book, the radio dock or
the tome. `hub-guide.ts` is **unchanged** — the mirrored pairs the IA cleanup
calibrated still land, because the volumes moved outward and the bubbles sit
inboard of them.

### Files changed (on top of `a22534af`)

| File | Change |
|---|---|
| `src/components/lol/AcademyHubBook.tsx` | `mirrored` prop (shell `scaleX(-1)` + mirrored window/panel x); titles split on `"\n"`; title ramp 7.6→8cqw |
| `src/components/lol/academy-layout.ts` | closed-book sizing replaced by the two-portrait-row fold model (`CLOSED_BOOK_FIT_OFFSET_PX`, `CLOSED_BOOK_FIT_DIVISOR`, `CLOSED_BOOK_MAX_PX`); open-book constants untouched |
| `src/components/lol/academy-layout.test.ts` | closed-book block rewritten for the four-book contract |
| `src/pages/LolHub.tsx` | all four registry entries carry `coverTitle` + portrait `splashPosition`; `object` flag and the `BookModeCard` branch removed; rotation constants 8→11 / 4→5.5; `mirrored` and per-row roll; column lift → `0px` |
| `src/pages/LolHub.test.tsx` | prototype block rewritten for four volumes |

### Verification

- `LolHub.test.tsx` + `academy-layout.test.ts`: **111 passed**. ESLint clean on
  all five files. `tsc --noEmit` failing-file set identical to baseline.
- Routes: all four navigate correctly (`/quiz`, `/combat-lab`, `/lol/docs`,
  `/lol/pro-play`). DOM/tab order unchanged: leaguecraft → archives →
  combat-lab → pro-play, each with its registry `aria-label`.
- Keyboard focus on each book: ±5.5° turn, −10px lift, gold response. Hover
  matches.
- Centre intact: Patch Brief renders with its "Read full report" CTA, the radio
  dock is present and unmoved, Mogzy's reaction target still mounts.
- Mobile 375×812: the four `HexPanelLink` panels and the broadcast centerpiece
  are unchanged from the approved prototype capture.
- **Asset cost measured, not assumed.** Four `<img>` elements, ONE URL, and the
  browser transfers the frame **once**: total 2,420,160 bytes across two
  `PerformanceResourceTiming` entries (the 2.42 MB image + a 730-byte Vite
  module request). Four books do NOT mean ~9.7 MB. No optimisation is needed to
  unblock this pass.

### Screenshots

1440×900 default · 1440×900 hover ×4 (Leaguecraft, Combat Simulation, Archives,
Pro Play) · 1440×900 focus · 1920×1080 default · 375×812 mobile.

### Remaining visual issues

1. **The centerpiece now looks small against the volumes at 1920×1080.**
   `CENTERPIECE_MAX_PX = 380` caps the tome while the books grew to 297×445.
   Nothing regressed — the tome is pixel-unmoved — but the balance is worth an
   explicit decision. Deliberately not changed: re-deriving the centerpiece was
   out of scope and it is the one surface the brief said to preserve.
2. **`BookModeCard` now has zero consumers.** The hub was its only caller. Left
   in place rather than deleted, because the mobile book treatment is still an
   open decision and it is the obvious starting point. Flagging it so it does
   not rot unnoticed.
3. **The frame PNG is still 2.42 MB.** Per the measurement above this is one
   download, not four, so it is no longer urgent — but a 768×1152 derivative
   would still cut ~2 MB off the hub's LCP path whenever the look is final.
4. **Every champion's face sits high in the window.** Splash art composes faces
   in the upper third and `object-position`'s Y is inert against a
   full-height crop, so this is uniform across all four rather than a per-book
   flaw. It reads as a consistent house style; changing it means scaling the
   splash inside the window, which the owner declined for Ryze.

### Next decision

Owner visual approval of the complete four-book hub. Not yet started, and
deliberately so: entrance/drop choreography, impact sounds, destination-specific
shell colours or emblems, and the mobile book treatment are all still unbuilt.

---

## Revision 2026-09-02c — Leaguecraft closed-book visual prototype (APPROVED)

**Status:** APPROVED by the owner; superseded by Revision 5 above, which
extends this treatment to all four destinations. Committed as `a22534af`.
Branch `hub/leaguecraft-closed-book` (worktree
`/Users/macmoney/mogsy-wt-hub-book`), on top of `33b5dd5f` — the IA cleanup
described in Revision 3 below.

`/lol` now renders **Leaguecraft only** as a closed Academy volume. Combat
Simulation, Mogzy Archives and Pro Play still render the open-book
`BookModeCard`. **The hub is deliberately a mixed prototype** — that is the
approved scope, not an oversight.

### Files changed

| File | Change |
|---|---|
| `src/assets/academy-book-frame.png` | **NEW** — the owner-supplied shell, copied byte-for-byte from `public/assets/`. 1024×1536 RGBA, 2.42 MB. The original is untouched. |
| `src/components/lol/AcademyHubBook.tsx` | **NEW** (229 lines) — the layered closed volume. |
| `src/components/lol/academy-layout.ts` | **Additive only.** `CLOSED_BOOK_WIDTH_FRACTION`, `CLOSED_BOOK_HEIGHT_RATIO`, `CLOSED_BOOK_MAX_WIDTH_CSS`, `closedBookMaxWidthPx()`. **No existing constant was touched or re-derived.** |
| `src/components/lol/academy-layout.test.ts` | +25 tests for the closed-book geometry contract. |
| `src/pages/LolHub.tsx` | `HubDestination` gains `object` / `coverTitle` / `coverSplashPosition`; Leaguecraft's registry entry sets them; `renderBook` branches on `object`; three rotation constants. |
| `src/pages/LolHub.test.tsx` | +6 tests pinning the prototype's route, accessible name, guide wiring, cover-title split and the mixed state itself. |
| `src/index.css` | `.academy-hub-book` / `.academy-hub-book-body` — the transform, the hover/focus response, the <1024px flattening and the reduced-motion rule. |

### Layering — nothing is baked into the artwork

```
AcademyHubBook (Link — route, aria-label, aria-describedby, focus)
 └─ .academy-hub-book-body   ← ONE transform for the whole volume
     ├─ champion splash       (object-fit: cover into the alpha window)
     ├─ transparent shell PNG (leather, gold, spine, thickness)
     ├─ HTML title            (real text on the leather panel)
     └─ interaction layer     (gold rim + focus ring)
```

### Measured frame geometry — flood-filled from the PNG's own alpha channel

| Region | Fraction of the 1024×1536 canvas |
|---|---|
| Drawn book (alpha ≥ 200) | x 1.07–98.54%, y 1.04–97.27% |
| Transparent art window | x 16.60–90.04%, y 7.88–63.48% |
| Title panel (inside the gold rails) | x 17.5–88.5%, y 67–89% |

The drawn book covers 97.5% × 96.2% of the canvas, so — unlike `BookModeCard`,
which reclaims a large transparent border with negative margins — **the layout
box IS the canvas** and card height = width × 1.5 exactly, with no margin
arithmetic. The art window is 57.8% of the book's height and the leather below
it 35.1%; counting the gold framing around the window as part of the art
region, the cover reads at roughly **65/35 art-to-leather**, the approved
proportion.

The title panel is centred on the **cover** (x ≈ 53%), not on the canvas — the
spine eats the left 13%, so canvas-centring would sit the title visibly left.

### Sizing — why `academy-layout.ts` did not need re-deriving

Both fit slopes were derived for **three** book rows per column. The quadrant
has two, so about one row of height is free. The closed volume is sized as a
pure fraction of the open book's width term
(`CLOSED_BOOK_WIDTH_FRACTION = 0.68`), spending exactly that freed row:

```
1.5·wClosed + gap + 0.542·wOpen  ≤  3·(0.542·wOpen) + 2·gap
→ wClosed ≤ 0.723·wOpen + gap/1.5
```

Because it is a fraction of the existing term, the closed book **inherits the
min() tall/short crossover for free** and models no second regime of its own.

| Viewport | Open book | Closed volume |
|---|---|---|
| 1440×900 | 423 × 229 px | **288 × 431 px** |
| 1920×1080 | 509 × 276 px | **346 × 519 px** |

**The closed volume is NARROWER than an open book, and that is load-bearing.**
`CENTERPIECE_WIDTH_CSS` models the free central zone from the *open* book's
width term, so a narrower object cannot crowd the tome — the centerpiece needs
no re-derivation while the hub is mixed. It also *reduces* the known
centerpiece overlap: at 1440×900 the open Leaguecraft book's right edge sat at
x = 567 against the tome's left edge at x = 540 (27px of overlap); the closed
volume ends at x = 431, clearing it by 109px. Both facts are pinned by tests.

### Perspective and hover — the values as built

| Value | Setting |
|---|---|
| `perspective` | `1400px` on the link |
| Resting `rotateY` | **+8°** (left column; a right-hand book takes −8°) |
| Hover/focus `rotateY` | **+4°** — toward the viewer, never square |
| `rotateZ` | **−0.8°** |
| Hover/focus lift | `translateY(-10px)` |
| Hover/focus light | gold rim inside the art window + a gold drop-shadow |
| Transition | `380ms cubic-bezier(.22,.61,.36,1)` transform, `380ms` filter |

Positive `rotateY` turns a LEFT-hand book's cover toward the centre: its outer
edge comes forward and its inner edge recedes, so the volume faces Mogzy. Both
angles are **zeroed below 1024px**, and the hover turn plus the lift are
**cancelled under `prefers-reduced-motion`** — the resting angle stays, because
a static camera choice is composition, not motion. Verified by probing computed
styles at 1440×900, 1920×1080, 1023×800, 820×1180, reduced-motion and 375×812.

The three custom properties are declared on the **link**, so the media and
reduced-motion rules re-declare them on `.academy-hub-book-body` itself and win
over inheritance with no `!important`.

### Champion art

Ryze, reused unchanged from the existing hub registry.
`coverSplashPosition: "78% center"` — the portrait window (0.88:1) against a
landscape splash (1.70:1) shows the splash's full height and 51.9% of its
width, which puts Ryze's face near the window's centre and keeps the glowing
rune hand in frame. The open-book card's own `"95% center"` is untouched and
still drives the mobile panel and every other surface.

### Verification

- `LolHub.test.tsx` 59 passed · `academy-layout.test.ts` 50 passed. ESLint
  clean on every changed file.
- `tsc --noEmit`: the failing-file set is identical to the pre-change baseline
  (8 pre-existing files, none of them touched here).
- Full `vitest run`: the failing-file set matches `33b5dd5f`'s once
  `VITE_COMBAT_API_URL` is equalised. The baseline worktree carries a
  `.env.local` pointing the combat API at a dead `127.0.0.1:8010`; the five
  champion-asset/combat-API suites that diverged all pass here under that same
  value. **No test regressed.**
- Live: `/lol` renders; the volume navigates to `/quiz`; Combat Simulation,
  Mogzy Archives and Pro Play still navigate; Mogzy leans and speaks the
  Leaguecraft line on hover and on keyboard focus; DOM/tab order is unchanged
  (leaguecraft → archives → combat-lab → pro-play); the Patch Brief centerpiece
  and Mogzy's pedestal are pixel-unchanged against `33b5dd5f`; no new console
  errors (the only recurring warning is the pre-existing `fetchPriority` one on
  the LCP `<picture>`).
- Screenshots: 1440×900 rest/hover/focus, 1920×1080, 820×1180, 375×812.

### Does not match expectations — read before approving

1. **The asset is 2.42 MB and the hub now downloads two book frames.**
   `book-mode-frame.png` (2.48 MB) is still needed by the other three
   destinations, so the prototype hub carries ≈4.9 MB of book art. The repo
   baseline already accepted a 2.48 MB frame, so this is consistent rather than
   novel — but the closed volume renders at most 346px wide, so a 1024px source
   is ~3× oversampled even at 2× DPR. **A downscaled derivative was
   deliberately NOT made**: it would change the pixels under visual review, and
   `academy-welcome`'s own downscale sets the precedent for doing it as a
   separate, deliberate pass. Recommend a 768×1152 derivative (plus WebP) once
   the look is approved. The original stays untouched either way.
2. **The quadrant is now vertically asymmetric.** The left column runs 668px
   against the right column's 470px at 1440×900, and the right column sits
   ~15px higher than before because `items-center` re-centres it in the taller
   row. This is inherent to a mixed prototype and resolves when the other three
   convert. `academy-layout.ts` was deliberately not touched to paper over it.
3. **The art window's top ~15% is dark.** `object-fit: cover` on a landscape
   splash in a portrait window shows the splash's full height, including its
   empty upper third; `object-position`'s Y is inert here, so no per-champion
   value fixes it. If it reads as dead space at approval, the fix is a slight
   scale-up of the splash inside the window — one line, deliberately not made
   before approval.
4. **Mobile does not use the closed volume at all.** Below `md` the hub renders
   `HexPanelLink` panels exactly as before; the volume is desktop/tablet only,
   and nothing on mobile changed. Whether the closed book should reach mobile
   is a separate decision about the mobile hub, not about this treatment.

### The next decision is the owner's, and it is NOT "convert the rest"

**Approve, adjust or reject the Leaguecraft treatment first.** Conversion of
the other three was explicitly held back and should stay held back until the
look is signed off, because each of them inherits these same angles,
proportions and title geometry.

Concrete questions for that review:

1. Is +8° / +4° the right amount of turn, or should it be stronger?
2. Is the 65/35 art-to-leather split right, or should the champion window grow?
3. Is the Ryze crop the intended composition?
4. Should the cover carry a subtitle or an emblem, or is the title alone right
   now that Mogzy narrates the destination?
5. Is `CLOSED_BOOK_WIDTH_FRACTION = 0.68` the composition you want — should the
   volume be larger or smaller relative to the open books?

Once approved, the follow-on work in order: (a) the downscaled asset
derivative; (b) convert the remaining three, with a mirrored −8° on the right
column, which the component and the layout constants already support; (c) only
then revisit `academy-layout.ts`'s fit slopes, since a fully-closed quadrant
changes the binding constraint again.

---

## Revision 2026-09-02 — IA cleanup IMPLEMENTED (four destinations)

**Status:** SHIPPED to the branch. Proposal A (Balanced Quadrant) built.
This was the IA cleanup pass only — **not** the visual redesign.

### Final four-destination structure

| Position | Destination | Route | `guideId` | Object |
|---|---|---|---|---|
| Top-left | Leaguecraft | `/quiz` | `leaguecraft` | `BookModeCard` (Ryze) |
| Top-right | **Combat Simulation** | `/combat-lab` | `combat-lab` | `BookModeCard` (Akali) |
| Bottom-left | Mogzy Archives | `/lol/docs` | `archives` | `BookModeCard` (Viktor) |
| Bottom-right | **Pro Play** | `/lol/pro-play` | `pro-play` | `BookModeCard` (Ahri) |

Centre lane unchanged: `AcademyBroadcastCenterpiece` (tome + radio dock) above,
Mogzy below on his painted pedestal. The centerpiece remains the homepage
Patch Report entry.

### What changed

1. **One registry, one source of truth.** `LEFT_DESTINATIONS` /
   `RIGHT_DESTINATIONS` / `ALL_DESTINATIONS` / `PRO_PLAY_DESTINATION` collapsed
   into a single row-major `HUB_DESTINATIONS` array in `LolHub.tsx`; the
   desktop columns are derived by index parity and the mobile list walks the
   array in order. Every entry carries a `guideId`, so a destination cannot
   exist without Mogzy being able to describe it. No navigation framework, no
   new abstraction layer — three derived constants replaced four hand-synced
   ones.
2. **Pro Play promoted.** It shipped as a standalone gold `HexPanelLink` below
   the grid with **no guide mode at all**. It is now a full peer: a book on
   desktop, a panel on mobile, `guideId: "pro-play"`, a `HUB_GUIDE_MODES` entry
   with calibrated `lean`/`bubble`, an `sr-only` description node and
   `aria-describedby`/`aria-label` like every other destination.
   `renderProPlayPanel()` and both of its call sites were deleted.
   `/lol/pro-play` and `/lol/pro-play/quiz` are untouched; no LIVE1 internals
   were modified.
3. **Combat Lab → "Combat Simulation" (display title only).** The route,
   `guideId`, component names and every other `combat-lab` identifier are
   unchanged, exactly as the audit recommended. The rename lives in the
   registry entry's `title` and in `HUB_GUIDE_MODES["combat-lab"].title`
   (which is also the card's `aria-label`).
4. **Stat Check, Quiz History and Patch Reports removed as primary
   destinations.** Their books, guide modes and `HubGuideModeId` members are
   gone. **Nothing else was deleted**: routes, pages, prefetch rules, sitemap
   entries, feedback labels and every other front door are untouched —
   Stat Check from `Quiz.tsx`, Quiz History from the Leaguecraft workspace
   History pane (`/quiz#history`, default-open) and the profile nav tile,
   Patch Reports from the Broadcast centerpiece's "Read full report" CTA.
   No replacement entry point was invented, per the audit's recommendation.
5. **Mobile accent rule unified.** The old inline
   `d.to === "/combat-lab" ? "gold" : "cyan"` became a `GOLD_ACCENT_ROUTES`
   set so Pro Play keeps the gold it shipped with.

### Files changed

| File | Change |
|---|---|
| `src/pages/LolHub.tsx` | Registry collapse; three destinations removed; Combat Simulation title; Pro Play promoted to a book; `renderProPlayPanel` + both call sites deleted; `GOLD_ACCENT_ROUTES`; unused `HistoryIcon`/`Layers` imports dropped. |
| `src/components/lol/hub-guide.ts` | `HubGuideModeId` → 4 ids (`pro-play` added, three removed); `HUB_GUIDE_MODES` rewritten with the quadrant calibration. |
| `src/components/lol/MogzyHubGuide.tsx` | Comment only — the `yNarrow` doc no longer references the deleted `quiz-history` mode. |
| `src/pages/LolHub.test.tsx` | Fixtures and assertions updated; see below. |
| `src/components/lol/academy-layout.ts` | **Deliberately untouched** — see the calibration decisions. |

### Layout / guide calibration decisions

- **`academy-layout.ts` was not re-derived.** The audit flagged
  `BOOK_FIT_SLOPE`/`BOOK_FIT_OFFSET_PX` (and `BOOK_LIFT_*`) as three-row
  compensations that a 6→4 change invalidates. It invalidates them only in the
  sense that they are now *conservative*: a fit slope sized for three rows
  trivially fits two, so nothing overflows and every tested invariant
  (`BOOK_HEIGHT_RATIO`, the min() crossover, the 200px lane minimum,
  `CENTERPIECE_WIDTH_CSS`'s dependence on the book width term) holds unchanged.
  Re-deriving it would grow the books ~35–45% — a **visual** change, which is
  the next pass's call, not this one's. The freed row currently reads as
  breathing room, which is the composition the brief asked for. `academy-layout.test.ts`
  passes untouched.
- **Guide offsets: mirrored pairs, no `yNarrow` needed.** Two vertically
  centred rows land where the old rows 1 and 2 sat, so the top pair keeps the
  old row-1 values (`lean.x ∓95`, `y −30`; `bubble.x ∓88`, `y 44`) and the
  bottom pair inherits the old row-2 values (`lean.x ∓100`, `y 0`;
  `bubble.x ∓90`, `y 50`). Archives keeps its own numbers and moves to the
  **left** column, so its signs flip. No surviving mode sits in Mogzy's own
  vertical band (that was the retired third row), so `quiz-history`'s
  `yNarrow: −36` vw-interpolation hack is not needed by anything. The
  `yNarrow` **mechanism** is retained in `MogzyHubGuide` (unused) because the
  visual pass moves the cards again; it is documented as such.
- **Reading order = DOM order = tab order:** Leaguecraft → Combat Simulation →
  Mogzy Archives → Pro Play, at both breakpoints.

### Tests and verification

- `npx vitest run src/pages/LolHub.test.tsx` — **53/53 pass.**
- Full suite `npx vitest run` — 12 files / 49 tests fail. **Identical failure
  set on the stashed baseline** (verified by re-running those same 12 files on
  a clean tree): admin, radio, ads-consent, quiz-workspace, e2e-identity,
  structural-review, onboarding-gate. **Zero regressions.**
- `npx tsc --noEmit -p tsconfig.app.json` — 11 errors, **the same 11 on the
  baseline**. No new type errors.
- `npx eslint` on all four changed files — clean.
- Browser verification at 1440×900 and 375×812 against a local dev server:
  - `/lol` renders exactly four primary destinations, in a balanced quadrant
    around Mogzy and the tome. Desktop and mobile both coherent.
  - Hovering Pro Play, Combat Simulation and Mogzy Archives each produces
    Mogzy's lean, facing-turn and speech bubble with the correct copy; no
    bubble collides with a card title.
  - Stat Check, Quiz History and Patch Reports appear nowhere on `/lol`.
  - Routes verified rendering: `/quiz/stat-check`, `/lol/history`,
    `/lol/patch-reports`, `/lol/pro-play`, `/lol/pro-play/quiz`,
    `/combat-lab`, `/lol/docs`.
  - Global HUD, radio dock, Meta Reflex section and footer unaffected.
- Keyboard/focus guide behaviour and `aria-describedby`/`aria-label` per mode
  are covered by the passing test suite (focus-in/out, tab-between-cards, and
  the per-mode description-element assertions).

### Test changes

`src/pages/LolHub.test.tsx`: destination fixture → 4 rows; a new
`RETIRED_PRIMARY_DESTINATIONS` fixture with a guard that none of the three is
linked from the hub; a new "exactly four primary destinations" test asserting
the four `data-guide-mode` ids; a new centerpiece-still-present guard; the
"Pro Play after the six existing destinations" test inverted into "Pro Play is
a peer, not a trailing panel"; the `GUIDE_MODES` fixture and `LEFT_MODES`
membership updated; `stat-check` swapped for `archives`/`combat-lab` in the
focus/tab/click-reaction tests; the mascot facing test now hovers `pro-play`
(Archives moved to the left column, so it no longer mirrors him).

### Known issues / not regressions

- The tome's painted edge clips the right end of the **Leaguecraft** card
  title at 1440×900. **Pre-existing** — verified identical on the stashed
  baseline. It is `CENTERPIECE_OVERLAP_PX = 48` doing what it was written to
  do; the visual pass should resolve it when the objects are redesigned.
- Champion splashes and the Pro Play quiz payload are blank/errored on a local
  dev server with no backend (`ERR_CONNECTION_REFUSED` on the Railway asset and
  data APIs). Environmental, not a code defect.

### Explicitly NOT done (later passes)

New book/object artwork, closed/open-book interactions, Combat Simulation and
Pro Play custom artifacts, drop-in entrance choreography, sound effects, the
What's New `!`, Pro/Premium promotion, community/social and feedback redesign,
below-the-fold redesign, global search, graph changes, LIVE1 feature changes.
`SHOW_SWIPE_GAMES` (Meta Reflex below the fold) was left alone as instructed.

### Next task

**Visual design of the four primary destination objects** — not more IA work.
The structure is now correct and stable; the open question is what
Leaguecraft, Combat Simulation, Mogzy Archives and Pro Play should *look*
like as four differentiated objects (the audit's Proposal A risk: four
identical books can read as "the same hub with two deleted"), and whether
re-deriving `academy-layout.ts`'s two-row fit slope to grow them is part of
that.

---

## Revision 2026-09-02 (design prep) — audit, superseded by the above

**Status:** AUDIT + DESIGN PREP ONLY. No code changed, nothing committed.

**Authority:** `origin/main` @ `fb21f106` ("feat(pro-play): Pro Play hub and
quiz"), read from the clean worktree `/Users/macmoney/mogsy-wt-proplay-final`,
which sits on that exact commit. The primary checkout `/Users/macmoney/mogsy`
is on `cs2/phase2-combo-planner` with other sessions' uncommitted work and was
NOT used as authority and NOT touched.

---

## 1. `main` state verification (Task 1)

**LIVE1 / Pro Play is merged.** `fb21f106` is the tip of `origin/main`; the
prior tip was `3aa44d60`. Every file the 2026-09-01 audit listed as
"uncommitted" is now committed and present:

| File | Status on `main` |
|---|---|
| `src/pages/ProPlayHub.tsx` (85 lines) | committed |
| `src/pages/ProPlayQuiz.tsx` (188 lines) | committed |
| `src/pages/ProPlayHub.test.tsx`, `ProPlayQuiz.test.tsx` | committed |
| `src/lib/pro-play/api.ts` (108 lines) | committed |
| `src/App.tsx` (+6) | committed |
| `src/lib/route-prefetch.ts` (+6) | committed |
| `src/pages/LolHub.tsx` (+48) | committed |
| `src/pages/LolHub.test.tsx` (+21) | committed |

Nine files, +728/−1. Nothing from the LIVE1 frontend workstream remains
uncommitted.

### Routes and components

| Route | Component | Registered |
|---|---|---|
| `/lol/pro-play` | `ProPlayHub` | `src/App.tsx:543` (`src/App.tsx:94` lazy) |
| `/lol/pro-play/quiz` | `ProPlayQuiz` | `src/App.tsx:544` (`src/App.tsx:95` lazy) |

Prefetch registry: `src/lib/route-prefetch.ts:101-102` (lazy components),
`:158-159` (path→prefetch rules). `/lol/premium` is untouched — that is the paid
subscription page and a different meaning of "Pro".

### ⚠️ CORRECTION — Pro Play did NOT ship as a book

The 2026-09-01 audit predicted a 7th left-column book. **That is not what
merged.** The grid stayed **six books**. Pro Play ships as a standalone
`HexPanelLink` panel:

- Definition: `PRO_PLAY_DESTINATION` — `src/pages/LolHub.tsx:146-151`. It is a
  plain object literal, **not** a `HubDestination`: no `championName`, no
  `splashPosition`, and **no `guideId`**.
- Render: `renderProPlayPanel()` — `src/pages/LolHub.tsx:320-331`
  (`accent="gold"`, `compact`), called twice:
  - desktop `src/pages/LolHub.tsx:594` — `<div className="mt-2 hidden md:block">`, directly **under** the six-book grid;
  - mobile `src/pages/LolHub.tsx:614` — `<div className="mt-3 md:hidden">`, **after** the six mobile panels and **before** the mobile broadcast centerpiece.
- Rationale recorded in the commit body and in the comment at
  `src/pages/LolHub.tsx:70-80`: measured at 1440×900, a fourth book in a column
  runs to y=1049 against the other column's 930, because the lane holds three
  230px books by construction.

### Coupling introduced into the three files of interest

| File | Coupling added |
|---|---|
| `src/pages/LolHub.tsx` | `Trophy` icon import; `PRO_PLAY_DESTINATION`; `renderProPlayPanel()`; two breakpoint call sites. `LEFT_DESTINATIONS`/`RIGHT_DESTINATIONS`/`ALL_DESTINATIONS` **unchanged**. |
| `src/components/lol/hub-guide.ts` | **NONE.** `HubGuideModeId` is still the same six ids. There is no `pro-play` mode. |
| `src/components/lol/academy-layout.ts` | **NONE.** No constant changed; the panel sits outside the book-fit model. |

### Guide / hover behaviour — the real finding

**Pro Play has no Mogzy guide description at all.** It carries no `guideId`, so
it gets no `data-guide-mode` wrapper, no `activateGuide` on hover/focus, and no
`aria-describedby` into the `sr-only` description block. The six books do; Pro
Play does not. `src/pages/LolHub.test.tsx:187` actively asserts this:
`expect(container.querySelectorAll("[data-guide-mode]")).toHaveLength(6)`.

This is the single largest post-merge IA defect: Pro Play is being treated as a
primary destination in the product plan while being, in the code, a
second-class panel that Mogzy cannot talk about. **Any four-destination
redesign must promote it to a full guide mode.**

---

## 2. Current primary destination map (Task 2)

Seven destination objects appear on `/lol` today — six books + one gold panel.

| # | Destination | Route | Object today | Defined at | Disposition |
|---|---|---|---|---|---|
| 1 | Leaguecraft | `/quiz` | Book (L, Ryze) | `LolHub.tsx:84-91` | **KEEP PRIMARY** |
| 2 | Stat Check | `/quiz/stat-check` | Book (L, Twisted Fate) | `LolHub.tsx:92-99` | **REMOVE PRIMARY / PRESERVE ROUTE** |
| 3 | Quiz History | `/lol/history` | Book (L, Zilean) | `LolHub.tsx:100-107` | **MOVE / REHOME** |
| 4 | Combat Lab | `/combat-lab` | Book (R, Akali) | `LolHub.tsx:110-117` | **KEEP PRIMARY** (renames to Combat Simulation) |
| 5 | Mogzy Archives | `/lol/docs` | Book (R, Viktor) | `LolHub.tsx:118-125` | **KEEP PRIMARY** |
| 6 | Patch Reports | `/lol/patch-reports` | Book (R, Jayce) | `LolHub.tsx:126-133` | **REMOVE PRIMARY / PRESERVE ROUTE** |
| 7 | Pro Play | `/lol/pro-play` | Gold Hex panel | `LolHub.tsx:146-151` | **PROMOTE → KEEP PRIMARY** |
| — | Academy Broadcast (Patch Brief) | in-place | Centre-lane tome + radio dock | `AcademyBroadcastCenterpiece.tsx` | **SPECIAL EXISTING CENTERPIECE — untouched** |

Net: 7 objects → 4. Three removals (Stat Check, Quiz History, Patch Reports
book), one promotion (Pro Play from panel to first-class destination object).

### Contradictions against the stated plan

1. **Pro Play is not currently equal to the other three.** The plan assumes four
   peers; the code has three-and-a-panel. Promotion is real work, not a no-op:
   it needs a `HubGuideModeId`, a `HUB_GUIDE_MODES` entry with calibrated
   `lean`/`bubble`, an `sr-only` description node, and a test-count update.
2. **"Combat Simulation" does not exist by that name.** The destination is
   `Combat Lab` → `/combat-lab` everywhere (title, `guideId: "combat-lab"`,
   `HUB_GUIDE_MODES["combat-lab"]`, three test files). Renaming the *label* is
   cheap; renaming the `guideId` or route is a cross-file rename and is not
   required by this IA change. **Recommend: change the display title only.**
3. **The 6→4 reduction breaks the layout model, not just the list.** The book
   size formula `BOOK_FIT_SLOPE = 0.615` / `BOOK_FIT_OFFSET_PX = 212`
   (`academy-layout.ts:54-55`) is derived from *three rows per column fitting
   the fold*. Two rows per column changes the binding constraint, so books can
   grow — which is an opportunity, but it invalidates the tested contract.
4. **Meta Reflex still has a below-the-fold homepage section**
   (`SHOW_SWIPE_GAMES = true`, `LolHub.tsx:168`), outside the "everything lives
   inside Leaguecraft" hierarchy. Its comment block records that hiding it once
   left the feature with no front door. **Out of scope here — do not touch it
   as a side effect of the IA cleanup.**
5. **Patch Reports genuinely appears twice** and only one instance is being
   removed. The centre tome (`AcademyBroadcastCenterpiece`) has its own feed and
   its own "Read full report" CTA into `/lol/patch-reports`, so removing the
   *book* does not orphan the route — the centerpiece **is** its front door.

---

## 3. Quiz History re-home (Task 3)

**Recommendation: do nothing but delete the book. Quiz History is already
rehomed, twice, on `main`.**

Every existing path to `/lol/history`:

| Surface | Location | Kind |
|---|---|---|
| Hub book (being removed) | `LolHub.tsx:100-107` | primary destination |
| **Leaguecraft workspace History pane** | `LeaguecraftHub.tsx:718-720` mounts `StudyHistoryLedger` | **in-product, inside Leaguecraft** |
| **Profile stats nav tile** | `LeagueProfileStats.tsx:18` — `{ to: "/lol/history", label: "Quiz History", icon: History }` | account surface |
| Profile "View all" link | `LeagueProfileStats.tsx:245` | account surface |
| Missed-questions back link | `LolMissedQuestions.tsx:31` | in-flow |
| House ad | `lib/ads/houseAds.ts:53` | promo |
| Feedback route label | `lib/feedback/contract.ts:117` | infra |
| Sitemap | `lib/seo/sitemap.test.ts:31` | SEO |

The decisive fact: `StudyHistoryLedger.tsx` is **one component mounted twice** —
by the `/quiz` workspace History pane and by the standalone `/lol/history` page
(its own header comment says so, `StudyHistoryLedger.tsx:6-13`). The two
surfaces cannot drift. And the workspace pane is **addressable and default-open**:
`/quiz#history` (`LeaguecraftHub.tsx:341`), with
`useState<WorkspaceMode>("history")` as the initial mode
(`LeaguecraftHub.tsx:360`).

So a user who lands on Leaguecraft — the destination that replaces the Quiz
History book in the hierarchy — **sees their history ledger immediately, with no
extra click and no request** (the pane is fed from a payload `/quiz` already
holds). Friction after removing the book is effectively zero.

**Therefore:** no new navigation, no new surface, no new system. Delete the book
and the `quiz-history` guide mode; the route, the page, and both existing homes
stay exactly as they are. If the owner wants one belt-and-braces affordance, the
cheapest is a "Quiz History" link in the existing `MogzyIdentityMenu` panel
footer beside Settings — but the Leaguecraft pane already discharges the
requirement and I do not recommend adding it.

---

## 4. Exact IA cleanup change map (Task 4)

Nothing below has been edited. This is the complete list.

### 4.1 `src/pages/LolHub.tsx`

| Line(s) | Change |
|---|---|
| `92-99` | Delete the Stat Check `HubDestination`. |
| `100-107` | Delete the Quiz History `HubDestination`. |
| `126-133` | Delete the Patch Reports `HubDestination`. |
| `84-133` | `LEFT`/`RIGHT_DESTINATIONS` drop to 1 each. **Recommend collapsing both into one `HUB_DESTINATIONS` registry** and deriving side/position from the chosen layout, rather than keeping two one-element arrays. |
| `118-125` | Mogzy Archives moves (right column of 3 no longer exists). |
| `110-117` | Combat Lab → retitle "Combat Simulation". Keep `to`, `guideId`, `championName`. |
| `146-151` | `PRO_PLAY_DESTINATION` gains `guideId: "pro-play"` (+ `championName`/`splashPosition` if it becomes a splash-bearing object) and folds into the registry. |
| `320-331` | `renderProPlayPanel()` is replaced by whatever object type the chosen layout gives Pro Play; the twin desktop/mobile call sites (`594`, `614`) collapse into the normal destination loop. |
| `135` `ALL_DESTINATIONS` | Row-major interleave assumes 2 columns; re-derive from the registry. |
| `~640` `sr-only` block | Regenerate per surviving mode (it iterates `HUB_GUIDE_MODES`). |
| grid `grid-cols-[1fr_minmax(200px,0.34fr)_1fr]` | Only survives in a two-column proposal (A/C); Proposal B replaces it. |
| `DESKTOP_BOOK_STACK_INSET` (`LolHub.tsx:~317`) / `DESKTOP_BOOK_STACK_Y` | Both are 3-row-column compensations. Re-derive or delete. |
| `accent={d.to === "/combat-lab" ? "gold" : "cyan"}` (mobile) | Pro Play is also gold today; unify the accent rule. |
| `168` `SHOW_SWIPE_GAMES` | **Do not touch.** Out of scope. |

### 4.2 `src/components/lol/hub-guide.ts`

| Symbol | Change |
|---|---|
| `HubGuideModeId` union (`:14-20`) | Remove `"stat-check"`, `"quiz-history"`, `"patch-reports"`. **Add `"pro-play"`.** Final set: `leaguecraft`, `combat-lab`, `archives`, `pro-play`. |
| `HUB_GUIDE_MODES` (`:69-…`) | Delete three entries; add `pro-play` with `title`/`description`. |
| `lean` / `bubble` on all four | **Every surviving value must be recalibrated.** They are hand-tuned px offsets against today's card positions. `quiz-history`'s `yNarrow: -36` vw-interpolation disappears with it — but if a *surviving* card lands in that bottom band under the new layout, the same interpolation problem returns and `yNarrow` must be re-derived for it. Nothing fails loudly when these are wrong. |
| `hubGuideDescriptionId`, `GUIDE_CLEAR_DELAY_MS`, `useHubGuideState` | Unchanged. |

### 4.3 `src/components/lol/academy-layout.ts`

| Constant | Fate |
|---|---|
| `BOOK_FIT_SLOPE = 0.615`, `BOOK_FIT_OFFSET_PX = 212` (`:54-55`) | **Must be re-derived.** Both encode "heading + three book rows + padding fit the fold". |
| `BOOK_TALL_SLOPE = 0.308`, `BOOK_TALL_INTERCEPT_PX = 176` (`:52-53`) | Re-derive if books grow. |
| `REGIME_BOUNDARY_VH = 1000` (`:36`) | The min()-crossover *model* survives; the crossover point moves. |
| `BOOK_HEIGHT_RATIO = 0.542` (`:69`) | **Invariant — derived from the frame PNG alpha bbox.** Survives untouched unless new book art ships. |
| `BOOK_LIFT_TALL_PX = -50`, `BOOK_LIFT_EASE = 0.7` (`:80-83`) | 3-row compensation; likely deleted. |
| `BOOK_STACK_INSET_CSS` (`:165`) | Layout-dependent. |
| `CENTERPIECE_*` (`:150-189`) | `CENTERPIECE_WIDTH_CSS` is a function of `BOOK_WIDTH_TERM_CSS` and `BOOK_STACK_INSET_CSS`, so **it moves whenever the books move**, even though the centerpiece itself is "untouched". This is the least obvious coupling in the change map. |
| `TITLE_FONT_SIZE_CSS` / `titleFontSizePx` (`:106-109`) | The HUD-clearance term survives; check the 3-way `min()` still binds. |

### 4.4 Routes and dependencies

**No route is deleted.** `/quiz/stat-check`, `/lol/history`, `/lol/patch-reports`
all keep their `App.tsx` entries, pages, prefetch rules, sitemap entries and
feedback labels. Only hub links are removed. Retained front doors:
Stat Check ← `Quiz.tsx:1466`; Quiz History ← `/quiz#history` + profile;
Patch Reports ← the broadcast centerpiece CTA.

`src/lib/route-prefetch.ts` — the hub currently warms these on hover. Removing
the cards removes the warm path but not the rules; leave the rules alone.

### 4.5 Accessibility / focus

- DOM order **is** tab order. Four objects means a new, shorter tab sequence;
  it must still read in the intended priority order at both breakpoints.
- The `sr-only` description block is the **only** accessible channel for
  Mogzy's copy (the guide lane is `aria-hidden`). One node per surviving mode,
  and Pro Play gains one for the first time.
- Each destination link keeps `aria-describedby={hubGuideDescriptionId(id)}`
  and `aria-label = HUB_GUIDE_MODES[id].title` — both asserted by tests.
- No `aria-live`: hover still announces nothing. Preserve that.
- Mogzy's click-reaction stays a `div`/`img`, not a button — no cosmetic tab stop.
- `prefers-reduced-motion` must cancel lean, bubble offset **and** any new
  entrance choreography.

### 4.6 Tests that will fail and must be updated

| File | Assertion |
|---|---|
| `src/pages/LolHub.test.tsx:133-137` | Destination title/route table (7 rows). |
| `:140` | "renders every hub destination as a link". |
| `:150` | "renders each destination twice: desktop book + mobile panel". |
| `:166-169` | Stat Check mode-selection guard — **delete with the card**. |
| `:180-193` | "offers Pro Play once per breakpoint, after the six existing destinations" — **the premise inverts**; Pro Play becomes a peer, not a trailer. |
| `:187` | `[data-guide-mode]` count `6` → `4`. |
| `:196` | `["/lol/docs","/lol/history","/lol/patch-reports"]` list. |
| `:308-314` | `GUIDE_MODES` fixture (6 → 4, `pro-play` added). |
| `:346-361` | Directional-glide sign test — `LEFT_MODES` membership changes. |
| `:434-444` | `aria-describedby` / `aria-label` per mode. |
| `src/components/lol/academy-layout.test.ts` | Every re-derived constant. |
| `src/App.startupFallbacks.test.ts:75` | **Unaffected** — routes survive. |
| `LeaguecraftRecord.vellum.test.tsx`, `LeagueProfileStats.test.tsx:193` | **Unaffected** — the re-home targets are untouched. |

---

## 5. Three four-destination layout proposals (Task 5)

Shared to all three: Mogzy central and hover-authoritative; the existing
`AcademyBroadcastCenterpiece` (tome + radio dock) in the centre lane, unchanged;
no elaborate per-object open states (Mogzy carries the explanation);
`BOOK_HEIGHT_RATIO = 0.542` respected wherever `BookModeCard` is reused;
reduced-motion parity.

### Proposal A — **The Balanced Quadrant** (2×2, corners)

- **Spatial arrangement.** Keep the existing three-column grid; each side column
  holds **two** objects instead of three. Reading order TL Leaguecraft,
  TR Combat Simulation, BL Mogzy Archives, BR Pro Play. Centre lane keeps
  tome-on-top / Mogzy-below exactly as today. With one row removed, each object
  can grow ~35–45% and the vertical breathing room roughly doubles.
- **Objects.** Leaguecraft = `BookModeCard` (Ryze). Archives = `BookModeCard`
  (Viktor). Combat Simulation = a **non-book apparatus** — an open Hextech
  training rig / armillary on a stand, same footprint ratio, splash reused as a
  backplate. Pro Play = a **broadcast object** — a framed esports monitor /
  banner-stand, gold accent inherited from today's panel.
- **Interaction.** Identical to today: wrapper fires `activateGuide` on
  mouseenter/focus, `deactivateGuide` on leave/blur, 140ms grace. Objects get a
  subtle lift + rim-light on hover, nothing more. Tap = navigate.
- **Mogzy.** Unchanged centre lane, `bottom-[16%]`, over the painted pedestal.
  Only the four `lean`/`bubble` pairs need retuning — and the diagonal geometry
  is *cleaner* than today's, because no mode shares Mogzy's vertical band the
  way `quiz-history`/`patch-reports` do. **The `yNarrow` interpolation hack can
  probably be retired entirely.**
- **Patch centerpiece.** Unchanged, `top-3`, centre lane.
- **Pro promo.** The freed vertical space under the tome / above Mogzy, or a
  slim full-width strip where the Pro Play panel sits today (`mt-2` under the
  grid) — a slot that already exists and is already proven at both breakpoints.
- **Entrance.** Four objects drop into their corners in a short diagonal
  stagger (TL→BR, ~70ms apart), each with a 4–6px settle-compression and one
  impact SFX; tome fades and Mogzy bobs in last. ~600ms total.
- **Mobile.** Trivial — the single-column `HexPanelLink` list shortens from 7 to
  4 and the broadcast centerpiece follows. Best mobile story of the three.
- **`academy-layout.ts` rework.** **Moderate.** Re-derive `BOOK_FIT_*` and
  `BOOK_TALL_*` for 2 rows; delete `BOOK_LIFT_*`; re-check `CENTERPIECE_WIDTH_CSS`
  (it consumes the book width term). The min()-crossover model, the 200px lane
  minimum and `BOOK_HEIGHT_RATIO` all survive. Highest reuse of tested code.
- **Advantage.** Lowest risk, biggest immediate breathing-room win, keeps every
  proven responsive invariant, and the diagonal symmetry finally makes the
  left/right columns equal (today's 3/3-plus-a-panel asymmetry disappears).
- **Risk.** Most conservative — it can read as "the same hub with two books
  deleted". The four objects must be genuinely differentiated in art or the
  redesign will not feel like one.

### Proposal B — **The Lectern Arc** (shallow semicircle around Mogzy)

- **Spatial arrangement.** Abandon columns. The four objects sit on a shallow
  arc across the lower two-thirds of the painting, as if arranged on the library
  floor facing the viewer, with Mogzy at the arc's focus. Outer two sit lower
  and slightly larger (nearer); inner two sit higher and smaller (further) —
  real perspective depth. Tome hangs above the arc's centre.
- **Objects.** Full freedom: Leaguecraft = a book on a lectern; Archives = a
  shelf/cabinet; Combat Simulation = a sparring dummy / arena table; Pro Play =
  a broadcast stage with a banner. The arc is what unifies them, not the form.
- **Interaction.** Hovering an object brings it forward (scale + z), dims the
  other three slightly, and Mogzy **turns to face it** — the existing
  `mogzy-facing-turn` `scaleX(±1)` generalises naturally to a 4-position arc.
  Strongest use of the mascot of the three proposals.
- **Mogzy.** Centre, at the arc's focal point, standing slightly forward of it.
  `lean` becomes genuinely radial rather than hand-tuned per card.
- **Patch centerpiece.** Above/behind the arc's centre, over Mogzy. **This is
  the proposal's biggest tension** — the tome and the mascot compete for the
  same centre column, which is exactly the collision `hub-guide.ts`'s bubble
  offsets were written to avoid.
- **Pro promo.** A banner or standee at one end of the arc — visually part of
  the scene without being a fifth peer.
- **Entrance.** The arc assembles outward-in or left-to-right, objects sliding
  along the arc into place with a settle; Mogzy walks/fades into focus last.
  The most cinematic, and the most expensive.
- **Mobile.** Weakest. An arc cannot survive a 375px column, so mobile falls all
  the way back to the flat `HexPanelLink` list — meaning the desktop and mobile
  hubs share almost no visual language.
- **`academy-layout.ts` rework.** **Heavy / near-rewrite.** Column geometry,
  `BOOK_STACK_INSET`, the lift constants and the 3-column grid all go. Needs a
  new radial model with its own tests. `CENTERPIECE_WIDTH_CSS` must be rebuilt
  from scratch since its inputs vanish.
- **Advantage.** By far the strongest art direction and the most "Academy"
  feeling; makes Mogzy an actor rather than an ornament.
- **Risk.** Highest. Discards the most tested code, re-opens the mascot/tome
  collision that the current bubble calibration exists to solve, and has no
  credible mobile story.

### Proposal C — **Hero Shelf + Instrument Row** (asymmetric hierarchy)

- **Spatial arrangement.** Leaguecraft is a **large hero book** occupying the
  left third at roughly 1.5× today's book size — an honest signal that Ranked,
  Daily and Mastery all live behind it. The right third stacks the other three
  as a vertical row of smaller, equal objects. Centre lane unchanged.
- **Objects.** Leaguecraft = hero `BookModeCard` (same component, larger box —
  `BOOK_HEIGHT_RATIO` unchanged). Archives = small book. Combat Simulation =
  small apparatus. Pro Play = small broadcast object.
- **Interaction.** As today. The three small objects can share one hover
  treatment; the hero gets a slightly stronger one.
- **Mogzy.** Centre lane, but shifted marginally right of true centre to balance
  the hero's visual weight — a change to the `bottom-[16%]` anchor's horizontal
  partner, not to the anchor itself.
- **Patch centerpiece.** Unchanged, centre lane, `top-3`.
- **Pro promo.** Natural: a fourth slot appended under the right-hand row, or the
  space beneath the hero book. The clearest promo home of the three.
- **Entrance.** Hero book lands first with a heavier impact and a deeper
  compression; the three small objects then drop in sequence, lighter and faster.
  Cheap to build and reads as deliberate hierarchy. ~500ms.
- **Mobile.** Good — the hero becomes a full-width feature card and the other
  three stay `HexPanelLink`s beneath it, so mobile *inherits the hierarchy*
  rather than flattening it. Better than A on expressiveness, near-equal on cost.
- **`academy-layout.ts` rework.** **Moderate-low.** The column model survives;
  it needs a second book-size track (hero vs standard) and a re-derived fit
  slope for a 3-row right column against a 1-row left. `CENTERPIECE_WIDTH_CSS`'s
  book-width term becomes asymmetric — the one genuinely fiddly part.
- **Advantage.** The only proposal that makes the **stated hierarchy visible**:
  Leaguecraft is not one of four equals in the product, and this says so.
- **Risk.** Asymmetry can read as unfinished; and it structurally demotes
  Combat Simulation, Archives and Pro Play, which contradicts the owner's
  "four primary destinations" framing.

---

## 6. Recommendation (Task 6)

**Proposal A — The Balanced Quadrant.**

The owner's brief states four *equal* primary destinations. A is the only
proposal whose geometry actually asserts equality (C demotes three of them; B
asserts equality but at the cost of a near-total layout rewrite and a broken
mobile story). A also preserves the maximum amount of tested, hard-won code:
`BOOK_HEIGHT_RATIO`, the min()-crossover regime model, the 200px lane minimum,
the mascot pedestal anchor and the centerpiece all survive, so the rework
concentrates in constants that were *always* going to be re-derived by a 6→4
change.

The breathing-room objection to A is answered by arithmetic, not by layout
novelty: removing a row frees roughly a third of the column height, and the
brief's real complaint — a crowded feature grid — is caused by seven objects,
not by the grid. Four objects in a quadrant is not crowded.

The redesign's *identity* should then come from **art direction inside A**:
Combat Simulation and Pro Play must be genuinely non-book objects, and the
entrance choreography must land. That is where the effort belongs — not in
re-deriving radial geometry.

Proposal B's arc is worth keeping in the backlog as a later evolution once the
4-destination registry exists; A does not foreclose it.

---

## 7. Regression risks (Task 7)

1. **Silent guide mis-calibration.** Every `lean`/`bubble` value is hand-tuned
   px against today's card positions. Moving cards invalidates all of them and
   **nothing fails** — the bubble simply drifts off Mogzy or over a card title.
   There is no test for visual attachment. Requires manual verification at
   1024 / 1280 / 1440 / 1920 and at both height regimes.
2. **`CENTERPIECE_WIDTH_CSS` moves when the books move.** It is defined in terms
   of the book width term and the stack inset. "We didn't touch the centerpiece"
   will be false; the tome will resize.
3. **The `<picture>` + 1×1-GIF pattern is load-bearing.** A real `src` causes a
   documented double download of the LCP painting. Do not "clean it up".
4. **`BOOK_HEIGHT_RATIO = 0.542` comes from the frame PNG's alpha bbox.** New
   book art with different transparent padding breaks every layout formula and
   the `academy-layout.test.ts` contract. New *non-book* objects must either
   match the ratio or get their own measured constant.
5. **The mascot's `bottom-[16%]` anchor and the `top-[3.25rem]/-bottom-[3.25rem]`
   counter-offset** keep Mogzy over the painting's pedestal. Any change to
   section padding slides him off it.
6. **Pro Play's promotion is the riskiest single edit**, because it is the one
   change that *adds* to `HubGuideModeId` — new union member, new
   `HUB_GUIDE_MODES` entry, new `sr-only` node, new `aria-describedby`, and four
   test files that currently assert exactly six guide modes.
7. **Route orphaning.** Stat Check, Quiz History and Patch Reports must keep a
   verified front door after their cards go. All three do today
   (`Quiz.tsx:1466`, `/quiz#history` + profile, broadcast CTA) — but this must
   be re-checked at implementation time, because the `SHOW_SWIPE_GAMES` comment
   records this exact mistake being made before.
8. **Two manually-synced lists.** `LEFT/RIGHT_DESTINATIONS` and
   `HUB_GUIDE_MODES` have no single source of truth. Collapsing them into one
   registry as part of this work is the durable fix; not doing so guarantees the
   next destination change repeats the drift.
9. **Tab order is DOM order.** A 2×2 grid's DOM order and its visual order must
   be reconciled deliberately.
10. **Meta Reflex and the below-the-fold sections are out of scope** and must
    not move as collateral.

---

## 8. Single next task (Task 8)

**Once the owner picks a layout: build the unified destination registry — data
only, no visual change.**

Collapse `LEFT_DESTINATIONS`, `RIGHT_DESTINATIONS` and `HUB_GUIDE_MODES` into
one exported registry of four entries that carries route, title, subtitle,
object type, art reference, guide copy and guide geometry together; add
`"pro-play"` to `HubGuideModeId` and give Pro Play its guide mode and its
`sr-only` description; drive the existing rendering off the registry so the hub
renders **identically to today** except that Pro Play now talks to Mogzy.

Doing this first means the layout change that follows is a geometry change
against a single source of truth, instead of a seven-way edit across two
manually-synced lists, a test fixture and an accessibility block. It is also
independently shippable and independently verifiable.

---
---

# ARCHIVE — original audit, 2026-09-01

*Superseded where it conflicts with the revision above. Its most significant
error: it predicted Pro Play would merge as a seventh left-column book. It
merged as a gold Hextech panel below the grid with no guide mode. Sections
1–10 below otherwise remain accurate against `main`.*

# Mogzy Hub Redesign — Current-State Audit (2026-09-01)

**Status:** AUDIT ONLY. No code changed, nothing committed.
**Authority for this audit:** working tree of `/Users/macmoney/mogsy` on branch
`cs2/phase2-combo-planner` (HEAD `1f9740bf`). Note: `main` is at `3aa44d60`.
The Pro Play book and `ProPlayHub`/`ProPlayQuiz` pages are **uncommitted local
changes**, not yet on `main` — see Risks.

## Objective

Redesign the Mogzy main hub without inventing parallel systems or breaking the
existing mascot, book, broadcast, radio, HUD and welcome interactions.

---

## 1. Homepage architecture

### Routes

| Route | Component | Notes |
|---|---|---|
| `/` | `src/pages/dev/mogzy-entry-v2/MogzyEntryV2.tsx` | `LEAGUE_ONLY_MODE` is on in prod, so the Academy **entry screen** is `/`. Renders OUTSIDE `<Layout />` (no HUD, no footer). CTA navigates to `LEAGUE_HOME_ROUTE`. |
| `/lol` | **`src/pages/LolHub.tsx`** | **This is the hub being redesigned.** `LEAGUE_HOME_ROUTE = "/lol"` (`src/lib/site-config.ts:21`). |
| `/welcome` | `src/pages/welcome/AcademyWelcomePage.tsx` | New-user orientation; real route, survives refresh, replayable. |
| `/dev/legacy-entry` | `src/pages/Index.tsx` | Retired pre-Mogzy landing, inspection only. |
| `/home` | `src/pages/Home.tsx` | Legacy Mogsy home; a `<Navigate>` stub in League-only mode. **Not the hub.** |

Route table: `src/App.tsx:336-362`. `/lol` renders inside `<Layout />` and is
listed in `isFullBleed` (`src/components/Layout.tsx`), which is what lets the
painted library reach the viewport edges.

### Supporting components used by the hub

- `src/components/lol/BookModeCard.tsx` — open-book destination card.
- `src/components/lol/HexPanelLink.tsx` — mobile/below-fold chamfered panel card.
- `src/components/lol/MogzyHubGuide.tsx` — mascot + speech bubble.
- `src/components/lol/hub-guide.ts` — mode metadata + `useHubGuideState`.
- `src/components/lol/academy-layout.ts` — the whole responsive geometry system.
- `src/components/lol/broadcast/AcademyBroadcastCenterpiece.tsx` (+ `AcademyBroadcastSurface.tsx`, `usePatchBriefFeed.ts`, `broadcast-content.ts`).
- `src/components/audio/AcademyRadioDock.tsx`, `AcademyRadioControls.tsx`.
- `src/components/lol/LolWelcomeIntro.tsx` — legacy first-visit tutorial popup (policy-gated, off in prod).
- `src/components/blog/BlogPostCard.tsx`, `src/components/ads/AdSlot.tsx`, `src/components/SEOHead.tsx`.

### How destinations are defined

Two hardcoded arrays inside `LolHub.tsx` (~line 79):
`LEFT_DESTINATIONS` and `RIGHT_DESTINATIONS`, of type `HubDestination`
(`{ to, title, subtitle, Icon, championName, guideId, splashPosition }`).
`ALL_DESTINATIONS` interleaves them row-major for the mobile list.
Each `guideId` must exist in `HUB_GUIDE_MODES` (`hub-guide.ts`) — **the two
files are manually kept in sync; there is no single source of truth.**

### Destinations that currently appear (7)

Left column: **Leaguecraft** `/quiz` · **Stat Check** `/quiz/stat-check` ·
**Quiz History** `/lol/history` · **Pro Play** `/lol/pro-play` *(uncommitted)*
Right column: **Combat Lab** `/combat-lab` · **Mogzy Archives** `/lol/docs` ·
**Patch Reports** `/lol/patch-reports`

Champion splashes per card: Ryze, Twisted Fate, Zilean, Azir / Akali, Viktor, Jayce
(resolved via `useChampionAssets` + `getChampionSplash`).

---

## 2. Current hub visuals

- **Background:** one `<picture>` with two `<source>`s —
  `src/academy/hub/academy-library-desktop.png` and `academy-library-mobile.png`.
  The `<img>` `src` is a **1×1 transparent GIF on purpose** (a real file there
  double-downloads; see the comment block in `LolHub.tsx`). LCP visual:
  `loading="eager" fetchPriority="high"`. A linear-gradient scrim sits over it.
- **Books:** `BookModeCard` layers over one reusable transparent PNG,
  `src/academy/hub/book-mode-frame.png` (1536×1024). Champion splash is clipped
  into the left cover panel (`left 10.4% / top 17.6% / w 33.2% / h 59.8%`);
  title + subtitle are **real HTML** on the right cover. Negative margins
  reclaim the PNG's transparent padding, so **card height = width × 0.542**
  (`BOOK_HEIGHT_RATIO`) — a constant the entire layout system depends on.
- **Title:** `.academy-hub-title`, Cinzel, gradient `background-clip: text`
  with inline `color`/`textShadow` overrides because `.theme-lol h1` would
  otherwise win.
- **Motion/CSS:** `src/index.css` — `academy-mogzy-float` (1779), `mogzy-lean-glide`
  (1798), `mogzy-lean-bubble` (1802), `mogzy-facing-turn` (1819),
  `mogzy-click-react` (1833), `academy-personal-line` (2078),
  `book-title-glimmer` (2148). A `prefers-reduced-motion` block at ~2081 cancels
  each one.

**Reusable vs coupled**

| Reusable | Coupled to the current presentation |
|---|---|
| `BookModeCard` (pure props; frame PNG geometry is self-contained) | The 3-col `grid-cols-[1fr_minmax(200px,0.34fr)_1fr]` lane composition in `LolHub.tsx` |
| `HexPanelLink` | `DESKTOP_BOOK_STACK_INSET` / `BOOK_STACK_LIFT_CSS` translate hacks |
| `academy-layout.ts` formulas (with tests) | Every `bubble.x/y/yNarrow` value in `hub-guide.ts` — hand-calibrated against *today's* card positions |
| Broadcast centerpiece + radio dock | The `top-[3.25rem] -bottom-[3.25rem]` counter-offset wrapper around `MogzyHubGuide` |
| Library background paintings | The `bottom-[16%]` mascot anchor, tuned to the painting's painted pedestal |

---

## 3. Mogzy mascot

Implemented entirely in `src/components/lol/MogzyHubGuide.tsx`, mounted in the
central lane of `LolHub.tsx` inside an `aria-hidden`, `pointer-events-none`
wrapper. Asset: `public/mascot/mogzy-mascot-base-v1.png`, sized
`w-[clamp(97px,9.7vw,167px)]`.

Layer stack (deliberately separate so transforms never compete):
1. `.academy-mogzy-float` — 6s idle bob, `absolute inset-x-0 bottom-[16%]`.
2. `.mogzy-lean-glide` — contextual glide, `--guide-lean-x/y`, 340ms with slight overshoot.
3. Speech bubble (sibling, `z-10`) — `--guide-bubble-x/y`.
4. `.mogzy-facing-turn` — `scaleX(±1)`; base art faces left, so right-side cards mirror.
5. Click-reaction div (`data-testid="mogzy-guide-react"`).

- **Hover behaviour:** each book wrapper in `LolHub.tsx` fires
  `activateGuide(d.guideId)` on `mouseenter`/`focus` and `deactivateGuide` on
  `mouseleave`/`blur`. `useHubGuideState` (`hub-guide.ts`) applies immediately on
  activate and clears after `GUIDE_CLEAR_DELAY_MS = 140` so moving between
  adjacent cards never flashes idle.
- **Dialogue:** `HUB_GUIDE_MODES[id].title` + `.description` render in a
  parchment bubble. `lastModeRef` keeps the text while the bubble fades out.
  Accessibility is handled separately: a `sr-only` block in `LolHub.tsx` renders
  one `<span id={hubGuideDescriptionId(mode.id)}>` per mode, and each card link
  points at it via `aria-describedby`. **No `aria-live`** — hover announces nothing.
- **Click/bounce:** `handleReact` on the mascot `<img>` (`pointer-events-auto`
  scoped to the image only). It removes `.mogzy-click-react`, forces a reflow,
  re-adds it — so rapid repeat clicks always restart the keyframes. Self-clears
  on `animationend`. Skipped outright under `prefers-reduced-motion`. It is a
  plain `div`/`img`, not a button, on purpose (no cosmetic tab stop).
- **Other state:** none. No persistence, no timers, no server reads.

**"What's New" feasibility:** yes, cheaply, without a new system. The bubble is
already a mode-driven view over `activeModeId`. A `whats-new` entry in
`HUB_GUIDE_MODES` plus one extra `activate()` caller (a `!` badge next to the
mascot) reuses the whole pipeline. Two real constraints: (a) `HubGuideMode`
carries `lean`/`bubble` offsets calibrated for *card hover*, so a
mascot-anchored mode needs `lean: {x:0,y:0}` and its own bubble placement; (b)
the guide lives inside an `aria-hidden` subtree, so a *user-triggered*
announcement would need its own accessible node outside that lane (the `sr-only`
block is the existing precedent). **Not implemented.**

---

## 4. Patch Report (the central book) — keep as-is

- **Composition:** `AcademyBroadcastCenterpiece.tsx` = broadcast surface + the
  Academy Radio dock beneath it. Mounted absolutely at `top-3` in the central
  lane (desktop) and again after the destination list on mobile (`variant="mobile"`).
- **Surface:** `AcademyBroadcastSurface.tsx` over the painting
  `public/images/lol-hub/academy-broadcast-book.png`. The painting is pure
  chrome — all copy is live HTML over measured page rectangles.
- **Data flow:** `usePatchBriefFeed()` → `fetchPatchReports()` (`["patch-reports"]`)
  → `patches[0]` → `fetchPatchReport(version)` (`["patch-report", version]`) →
  `projectPatchBrief(detail, championManifest)` → `briefTransmission()` →
  `BroadcastFeed`. Champion icons come from `useChampionAssets`.
  **It shares the Patch Reports page's exact query keys and cache — no second store.**
  Fallback contract: only a genuine in-flight load shows "Receiving transmission…";
  every error/empty case silently returns `INITIAL_BROADCAST_FEED`.
- **It is structurally NOT a hub destination.** It is an absolutely-positioned
  centre-lane object with its own content feed and its own CTA
  ("Read full report" → `brief.fullReportHref`). The separate **Patch Reports**
  *book* (`/lol/patch-reports`) is a different thing and is a destination.

---

## 5. Entrance / initial animations on the hub

There is **no dedicated hub entrance choreography today.** What happens on load:

1. `Layout`'s root has `.animate-page-fade-in` (`src/index.css:528`) — a whole-page fade.
2. `playUiSfx("appEnter")` in a mount effect; `playUiSfx` self-suppresses on a
   cold page load (no user gesture yet), so it only sounds on internal navigation.
3. `trackFunnelEvent("lol_landing_viewed")`; `markHubVisited()`; anonymous
   sign-in if there is no user.
4. `.academy-personal-line` — a 480ms fade-in on the desktop greeting line only.
5. Books, mascot and the tome appear with **no stagger** — the idle bob and the
   title glimmer simply start looping.

Infrastructure available for a future book/object entrance: `framer-motion`
(^12.34.3, already a dependency and used by `AcademyBroadcastSurface`), the
`useRevealSequence`/`cadence.ts` slot controller from the welcome page, and the
existing CSS keyframe + `prefers-reduced-motion` conventions in `index.css`.

---

## 6. Welcome Orientation (`/welcome`)

`src/pages/welcome/` — the richest animation asset in the codebase:

| File | Role |
|---|---|
| `AcademyWelcomePage.tsx` | Page/orchestrator |
| `AcademyTome.tsx` | The book stage; **the page-turn implementation** |
| `useRevealSequence.ts` + `cadence.ts` | Slot/step controller: one `{chapter, step}` position and a timer. Copy blocks land as slots; the illustration is a separate channel keyed off `artRevealed` |
| `ChapterPlate.tsx`, `InkText.tsx`, `FinaleSpread.tsx` | Chapter views, ink-in text, finale |
| `tomeChrome.ts`, `tomeGeometry.test.ts` | Control-row height **reservation** so the tome never moves between chapters |
| `useSceneReady.ts`, `usePrefersReducedMotion.ts`, `tomeAudio.ts`, `sceneAssets.ts` | Readiness gate, motion pref, audio, asset preload |
| `RegistrationForm.tsx` | Inline account creation (HI1-C5) |

**Book-opening / page-turn mechanics:** the turning leaf is a real sheet staged
over the right page. Its **front face carries the outgoing chapter's writing and
its back face is blank parchment**, and both faces are **cut from the spread
painting's own pixels** (`--tome-paper` positioned into the box x 50–92%,
y 13–88% of the tome) — so at rest the leaf is invisible against the page
beneath it. One CSS animation rotates it across the spine under a moving
fold-light with a cast shadow; the page removes it on a timer. Entirely
presentational and `aria-hidden`.

Asset: `src/academy/welcome/academy-book-spread.png` — a **downscaled derivative
of the same `academy-broadcast-book.png` painting the hub already uses** (the
2.6 MB public original was not an acceptable first-visit cost).

**Reuse verdict (do not extract yet):** the leaf technique, `useRevealSequence`,
`cadence.ts` and the `tomeChrome` reservation pattern are all directly
applicable to a hub book-entrance. The tome's own sizing (`--tome-chrome`,
aspect 1.381) is specific to a single centred full-screen book and does not
transfer to a 7-book grid.

---

## 7. Existing global UI — all in the shell, none owned by the hub

Everything below is mounted by `src/components/Layout.tsx`, i.e. **global, not
homepage**. A hub redesign does not need to rebuild any of it.

| Surface | Where |
|---|---|
| Top-left home (Mogzy hat) | `src/components/hud/GlobalHud.tsx` → `Link` to `LEAGUE_HOME_ROUTE`, `data-testid="hud-home"` |
| Guest "Sign up" chip | `GlobalHud.tsx`, `data-testid="hud-signup-chip"`; only when `isGuestUser(user)` |
| Top-right radio/player | `src/components/audio/AcademyRadioControls.tsx` (`variant="hud"`), inside `GlobalHud`'s right chip cluster. Transport: `src/lib/audio/academy-radio.ts`; controller `AcademyRadioController` is mounted in `App.tsx` above the router |
| Profile / notifications / settings / sign out | **One component:** `src/components/hud/MogzyIdentityMenu.tsx` — portrait button opens a panel with the notification inbox (Supabase realtime on `notifications`), plus a pinned footer with Settings (`/settings`) and Sign out |
| Bottom-left Community/Friends | `src/components/FloatingFriendsButton.tsx`, `fixed bottom-6 left-6 z-40`. Suppressed only on Stat Check surfaces (`showFriendsDrawer`); visible at every width. Realtime via `useSocialSync()` in Layout |
| Footer (About/Feedback/Privacy/Terms/Security/Contact) | `src/components/Footer.tsx` — sitewide, self-hides on gameplay routes (`/quiz`, `/admin`, etc.). **It does render on `/lol`.** |
| Other | `HextechAmbience` (LoL section only), `TutorialTipPopup`, `Toaster`/`Sonner` |

HUD order is fixed and DOM order **is** tab order: signup chip → radio → identity menu.

The second, larger radio surface — `AcademyRadioDock` — is *not* global; it is
part of the hub's broadcast centerpiece.

---

## 8. Below the fold (`/lol`)

Inside `<div className="max-w-7xl mx-auto px-4 py-6">` at the end of `LolHub.tsx`:

1. `<AdSlot placement="lol_hub_mid" />`
2. **Meta Reflex** section (`SHOW_SWIPE_GAMES = true`,
   `data-testid="lol-hub-meta-reflex-section"`) — header with `META_REFLEX_NAME`/
   `_TAGLINE`, "Stats" and "All games" links, then 4 compact `HexPanelLink` cards
   built from `LEAGUE_SWIPE_GAMES` (`src/lib/league-swipe/api.ts`) with a local
   slug→icon map. Titles/descriptions come from the shared catalog.
3. **News & Blog** — `useBlogList({ limit: 24, tag: "League of Legends" })`,
   `BlogPostCard` grid, "All posts" → `/blog`. Hidden entirely when empty.
4. Then the global `<Footer />` (About / Feedback / Privacy / Terms / Security / Contact).

**There is no About/help/community/social content on the homepage itself** —
only the global footer's six links.

---

## 9. Responsive / mobile

Two genuinely different layouts, split at Tailwind `md` (768px):

- **Desktop (`md+`):** `section` is `-mt-[var(--app-header-h)] min-h-[100dvh]`,
  full-bleed painting, 3-column grid `[1fr_minmax(200px,0.34fr)_1fr]`. Book
  columns are pushed outward (`mr-auto`/`ml-auto`), translated by
  `DESKTOP_BOOK_STACK_INSET` (`clamp(0px, (100vw-1200px)*0.5, 120px)`) and
  `BOOK_STACK_LIFT_CSS`. Centre lane holds the tome (pinned `top-3`) and Mogzy.
- **Mobile (`<md`):** background swaps to `academy-library-mobile.png`; the books
  are replaced by a single-column `HexPanelLink` list in `ALL_DESTINATIONS` order
  (row-major: Leaguecraft, Combat Lab, Stat Check, Archives, History, Patch,
  Pro Play), with the broadcast centerpiece (`variant="mobile"`) **after** them.
  Extra mobile-only sub-lines ("Welcome back, Summoner"); the randomized
  personal line is desktop-only. **No mascot on mobile at all.**
- **Tablet:** there is no tablet layout. 768px flips straight to the desktop
  composition; `academy-layout.ts` explicitly accepts that below ~860px width
  the title may brush the HUD cluster.

**A redesign must preserve (all covered by `academy-layout.test.ts`):**
`REGIME_BOUNDARY_VH = 1000` min()-crossover model (tall = width-driven,
short = height-fit, no breakpoint snap); `BOOK_HEIGHT_RATIO = 0.542`;
the 200px central-lane minimum; the title's three-way `min()` including the
HUD-clearance term; the `-mt-[var(--app-header-h)]` / padding-transfer trick
that keeps the painted pedestal's crop fixed across regimes.

---

## 10. Reusable design infrastructure

- **Shared components:** `BookModeCard`, `HexPanelLink`, `HexZipperCard`,
  `HexTrainingHero`, `SEOHead`, `AdSlot`, `BlogPostCard`, `AcademyRadioDock`/
  `Controls`, `MogzyIdentityMenu`, the whole `src/components/ui` shadcn set.
- **Animation:** `framer-motion` ^12.34.3; hand-written keyframes in
  `src/index.css` with a matching `prefers-reduced-motion` block;
  `useRevealSequence`/`cadence.ts`; `usePrefersReducedMotion`; `remotion` (video
  export only — not for UI).
- **Audio:** `src/lib/ui-sfx.ts` (`playUiSfx` — `appEnter`, `sectionOpen`,
  `navClick`, `primaryAction`; cold-load gesture guard built in),
  `src/lib/audio/academy-radio.ts`, `play-sfx.ts`, `mode-soundtrack.ts`,
  `audio-studio-runtime.ts`, `src/pages/welcome/tomeAudio.ts`.
- **Book assets:** `src/academy/hub/book-mode-frame.png` (destination card),
  `public/images/lol-hub/academy-broadcast-book.png` (centre tome, 1536×1024,
  2.6 MB), `src/academy/welcome/academy-book-spread.png` (downscaled derivative).
- **Academy visual assets:** `src/academy/hub/academy-library-{desktop,mobile}.png`,
  `academy-skyline.png`, `leaguecraft-studies.png`, `mogzy-archives.png`,
  `meta-reflex.png`, `ranked.png`, `src/academy/welcome/*`,
  `public/mascot/mogzy-mascot-base-v1.png`, `public/mascot/mogzy-hat.png`.
  **Note `mogzy-archives.png` and `leaguecraft-studies.png` already exist and are
  not used by the hub** — they were authored for destination art.
- **Responsive primitives:** `academy-layout.ts` (+ its test), the
  `--app-header-h` / `--app-viewport-h` tokens, `isFullBleed` in `Layout`,
  `[container-type:inline-size]` + `cqw` units inside `BookModeCard`.

---

## Risks & coupling

1. **Uncommitted work is in the audited state.** Pro Play (`ProPlayHub.tsx`,
   `ProPlayQuiz.tsx`, `src/lib/pro-play/`, the `pro-play` guide mode and the
   4th left-column book) exists only in the working tree of
   `cs2/phase2-combo-planner`. A redesign started from `main` will not see it.
2. **`hub-guide.ts` bubble geometry is hand-calibrated to the current grid.**
   Every `lean`/`bubble.x`/`bubble.y`/`yNarrow` value (especially `quiz-history`'s
   vw-interpolated `yNarrow: -36`) was tuned against today's card title positions.
   Moving or resizing cards silently invalidates all of it — nothing fails loudly.
3. **Two manually-synced destination lists.** `LEFT/RIGHT_DESTINATIONS` in
   `LolHub.tsx` and `HUB_GUIDE_MODES` in `hub-guide.ts`. Adding or removing a
   destination requires both.
4. **`BOOK_HEIGHT_RATIO = 0.542` is derived from the frame PNG's alpha bbox.**
   A new book art asset with different padding breaks every layout formula and
   the `academy-layout.test.ts` contract.
5. **The mascot's `bottom-[16%]` anchor and the `3.25rem` counter-offset wrapper**
   exist to keep Mogzy over the painting's pedestal while the stack above him
   moved. Any change to section padding moves him off his pedestal.
6. **The `<picture>` + 1×1-GIF pattern is load-bearing** (a real `src` causes a
   documented double download). Do not "clean it up".
7. **The hub does not own the HUD, radio controls, notifications, settings,
   sign-out, friends drawer or footer.** Adding homepage versions of any of
   these creates the parallel systems this audit exists to prevent.
8. **Column asymmetry is deliberate.** Pro Play was added to the left column
   (4/3) specifically to avoid restructuring the grid.

## Contradictions with the stated product assumptions

- **Stat Check is still a primary hub destination** (`/quiz/stat-check`, left
  column, Twisted Fate splash) — it must be removed from the hub AND from
  `HUB_GUIDE_MODES`. `Quiz.tsx:1466` also links to it, so it keeps a home.
- **Quiz History is a primary destination today** (`/lol/history`), but is not on
  the planned four. It needs a home inside Leaguecraft or it loses its front door
  — exactly the failure documented in the `SHOW_SWIPE_GAMES` comment.
- **LIVE1/Pro Play already exists as a hub book** but as *uncommitted* work.
- **"Graphs under Mogzy Archives" has nothing to place yet** — the only graph
  route is `/dev/graph1`, and `/lol/docs` (Archives) does not link to it.
- **Meta Reflex has a below-the-fold section on the homepage**, which sits
  outside the "Ranked/Daily/Mastery live inside Leaguecraft" hierarchy. Its
  header comment records that hiding it once left the feature with no front door.
- **Patch Reports appears twice**: as the central tome interaction AND as a
  destination book. The plan keeps the central interaction; the book's fate is
  undecided.
- **Mogzy Premium has no hub presence at all** today.
- **The homepage has no community/social/about area** — only the global footer.

## Recommended next design decision (not implemented)

**Decide what the destination set's data model is before touching any pixels.**
Specifically: collapse `LEFT_DESTINATIONS`/`RIGHT_DESTINATIONS`/`HUB_GUIDE_MODES`
into one destination registry, and decide the **4-destination geometry** — four
books cannot inherit the current 4/3 two-column composition, and that single
choice (2×2? a single arc? one hero + three?) determines whether
`academy-layout.ts`'s three-row fit slope, the 200px centre lane, the mascot
anchor and every `hub-guide.ts` offset survive or are recalibrated. Everything
else (entrance animation, "What's New", Pro promotion, below-the-fold community
area) is additive once that is settled.

## Next task

Design (not build) the 4-destination hub geometry and the destination registry
shape. Explicitly answer: where Stat Check, Quiz History, Patch Reports (book)
and Meta Reflex go; whether the centre lane keeps the tome + radio + Mogzy stack;
and what `academy-layout.ts` must be re-derived from.
