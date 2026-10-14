# Interaction Mode Prototype Labs — Rangefinder + Glyph Press / Word Puzzle

Status: **BLOCKED (both candidates) — original source exists only on the owner's
Windows machine and is not reachable from the cloud agent.** See §5 for recovery.
NOT certified, NOT release-ready, no lab built. Base
`7be45341e59bc047c69b95ff95e8c331a202c893` (frontend), backend
`League_Combat_Simulator@f12a7432d1e9a613e0eaee0c3e6e1151a395834e`.

Owner brief (unchanged): fast admin-only visual playtests; bot/versus and
speed/scoring balance deferred; no public exposure, no invented game data, no
fabricated correctness, no shared Ranked Arena redesign; draft PR + browser
evidence before command-center merge.

## 1. Verdicts

| Candidate | Verdict | Why |
|---|---|---|
| Rangefinder (GM-R1, "PLACE a target on a field", `{ stop }` transport) | **BLOCKED** | No source on any branch/tag of either repo; transport not in production `SegmentChoice`; no backend module. |
| Glyph Press / Word Puzzle | **BLOCKED** | No source, no handoff, no backend module, no content set anywhere. Nothing to inspect for answer leak / input validation / grading. |

Neither was downgraded to PROTOTYPE-ONLY by writing a fresh lab: both mechanics
already exist in an unpushed worktree (see §2), and re-deriving them from a
one-line description would fork the owner's design and, for Glyph Press, require
inventing the word content and its answer key — both explicitly out of bounds.

## 2. Discovery evidence (2026-10-14)

Searched all 212 `mitcherrman/mogsy` and 171 `mitcherrman/league_combat_simulator`
remote branches, tags, full history (`git log --all -S/-G`, commit messages),
file trees of every branch, and GitHub PR search, for
`rangefinder | range finder | GM-R1 | glyph press | glyphpress | word puzzle`.

Only hits (mogsy), all *references*, never source:

- `16592c20` `PRO_PLAY_ASSEMBLY_PAV1_HANDOFF.md` (branch `reconstruct/r3c-frontend`):
  - §2 grammar table: `Rangefinder | PLACE a target on a field | discrete labelled slots, not a geometry`
  - §3: "`{ assignment }` is a new transport shape for the production seam to widen
    (as Rangefinder did with `{ stop }`)"
  - §9 file list: `useStageRoom.ts` "ported from Rangefinder (GM-R1), unchanged";
    Viewport "mounts the primitive (Rangefinder's pattern)"
  - §9: "Untouched: Rangefinder, Glyph Press, Scrub, …, the PA1 worktree."
- this handoff (`ce5182f8`).

Negative evidence:

- `src/lib/ranked-public/client.ts:555` `SegmentChoice` on base has
  `itemId | cardId | selected | order | placement | assignments` — **no `{ stop }`**.
  The Rangefinder seam widening was never pushed.
- `League_Combat_Simulator/ranked_modules/` has `item_cost_duel, mastery_slice,
  mastery_state_slice, match, meta_reflex, order_forge, quiz, reconstruct` —
  **no rangefinder or glyph/word module**, no grader, no content table.
- No `src/components/interaction-grammar/Rangefinder*`, `GlyphPress*`, no
  `src/pages/dev/*rangefinder*` / `*glyph*` on any ref.
- No open/closed PR in either repo mentions either name.
- Container has no extra worktrees, stashes or local refs.

Conclusion: GM-R1 Rangefinder and Glyph Press live only in a local worktree on
the owner's machine (the same place PAV1 ported `useStageRoom.ts` from).

## 3. What unblocks each

### Rangefinder
1. Owner pushes the GM-R1 worktree branch (frontend; and backend if one exists)
   with its handoff, or names the commit/worktree path.
2. Then, in order: verify primitive + lab compile on current base; confirm the
   `{ stop }` `SegmentChoice` branch and whether a server grader exists.
3. If no backend grader: ship as **PROTOTYPE-ONLY** admin lab, banner
   "Visual lab — not authoritatively graded", DEV/admin-gated route only.
4. Authoritative range/position grading needs a **separately scoped backend
   branch** (`ranked_modules/rangefinder.py` + public/reveal contract split +
   server capture fixture), proposed with evidence, not bundled here.
   Domain semantics still to be settled by the owner: what the "field" and
   "slots" are, which source table is the range/position authority, and
   tolerance rules (PAV1 says discrete labelled slots, not geometry).

### Glyph Press / Word Puzzle
1. Owner pushes the worktree (or confirms it was never built — then this is a
   new-module design task, not a playtest).
2. Required before "WORKING ADMIN PLAYTEST": public payload carries no answer
   (letters/tiles only, no solution, no hash of a short solution); input
   validated client- and server-side (charset, length, rate); server-side grading
   against a content source the owner certifies (no invented word list); reveal
   contract separate from public contract; keyboard + touch + responsive matrix.

## 5. Recovery attempt 2 (2026-10-14, after Command Center comment on #17 / #19)

Command Center recovered the local references:

| | Rangefinder GM-R1 | Glyph Press / Word Puzzle WP1 |
|---|---|---|
| Local branch | `rangefinder/r1-fable` | `word-puzzle/wp1-fable` |
| Reported head | `3ab7c0fb` | `af6507a8` (earlier `8798b2dc`) |
| Worktree | not recovered | `C:\Users\mlmit\mogzy-wt\wp1-fable` |
| Handoff | `RANGEFINDER_R1_HANDOFF.md` | `WORD_PUZZLE_WP1_HANDOFF.md` |
| Lab route | `/dev/rangefinder` | `/dev/word-puzzle` |
| Reported tests | 59/59 unit, 13/13 browser | — |

**Access blocker (verified):** the agent runs in an isolated Linux cloud container
holding a fresh clone of `mitcherrman/mogsy`. In it:
`git cat-file -t 3ab7c0fb` / `af6507a8` → `Not a valid object name`;
`git worktree list` → only `/home/user/mogsy`; `git branch --list` → `main` +
the work branch; `git ls-remote origin` → no `rangefinder/*` or `word-puzzle/*`;
no Windows filesystem, no attached files (`/mnt/attach` empty), no reachable
peer Claude session on the owner's machine. The worktrees therefore cannot be
inspected, verified or pushed from here. Nothing was rebuilt.

### Minimum safe commands for the owner (PowerShell, read-only until step 5)

Run from the main local `mogsy` checkout (the one `mogzy-wt` worktrees hang off).
Nothing below resets, merges, cherry-picks, commits, or force-pushes.

```powershell
# 1. Locate and confirm the refs
git remote -v                                   # must be github.com/mitcherrman/mogsy
git worktree list
git branch --list "rangefinder/*" "word-puzzle/*"
git show -s --oneline 3ab7c0fb af6507a8 8798b2dc
git show -s --oneline rangefinder/r1-fable word-puzzle/wp1-fable   # heads must equal the SHAs above
git merge-base --is-ancestor 7be45341 rangefinder/r1-fable; $LASTEXITCODE   # 0 = based on current main lineage
git merge-base --is-ancestor 7be45341 word-puzzle/wp1-fable; $LASTEXITCODE

# 2. Uncommitted work: must be empty, otherwise STOP and report (do not stash/reset)
git -C C:\Users\mlmit\mogzy-wt\wp1-fable status --short
#    Rangefinder: use the path `git worktree list` printed for rangefinder/r1-fable
git -C <rangefinder-worktree-path> status --short

# 3. Handoffs are committed on the branches
git show rangefinder/r1-fable:RANGEFINDER_R1_HANDOFF.md | Select-Object -First 20
git show word-puzzle/wp1-fable:WORD_PUZZLE_WP1_HANDOFF.md | Select-Object -First 20

# 4. Secret check on everything the branches add over main (expect no output)
git fetch origin main
foreach ($b in "rangefinder/r1-fable","word-puzzle/wp1-fable") {
  git diff --name-only origin/main...$b | Select-String -Pattern '\.env|\.pem|\.key|lol_calc\.db|credentials'
  git log -p origin/main..$b | Select-String -Pattern 'service_role|SUPABASE_SERVICE|PRIVATE KEY|sk-[A-Za-z0-9]{20}|ghp_[A-Za-z0-9]{20}|AKIA[0-9A-Z]{16}|eyJhbGciOi'
}

# 5. Push the exact existing branches as NEW remote branches (no --force)
git push origin rangefinder/r1-fable:refs/heads/rangefinder/r1-fable
git push origin word-puzzle/wp1-fable:refs/heads/word-puzzle/wp1-fable
```

If step 1 shows a head different from the reported SHA, push anyway only if the
extra commits are the owner's own, and note the real SHA on #17. If step 2 is
non-empty or step 4 prints anything, stop and post the output on #17.

### What happens after the push (this workstream)
1. Fetch both branches; verify heads, handoffs, and re-run their unit/browser tests
   on their own base.
2. Bring the original code onto this lab branch unchanged (no rebuild), resolving
   only conflicts with current `main`; keep `/dev/rangefinder` and
   `/dev/word-puzzle` DEV/admin-gated, no public route, no registry/Arena change,
   no bot/versus.
3. Audit WP1 for answer leak (public payload vs reveal), input validation and
   grading authority; audit Rangefinder for range/position source authority.
   Label both "visual lab — not authoritatively graded" unless proven otherwise.
4. Browser screenshots (touch + keyboard, phone/desktop) and test results on PR #19.

## 4. Changed files
- `INTERACTION_MODES_PLAYTEST_HANDOFF.md` (this file). No source, route, backend,
  database, Ranked Arena or other workstream touched.
