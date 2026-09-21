# DCMOD-D frontend handoff

Original branch: `dcmod/d-hub`, based on stale baseline
`30b75cbe32ba02ddf0eca18740964c603eed5960`.

Reconciled branch: `dcmod/d-hub-rfx`, based exactly on DCMOD-E's baseline
`a9a7b45af78039306f09b568204389fc5c9a9a2f`. The approved D commit
`1230eb8b63e9ad0aeee1babb14de85420d339d5e` was cherry-picked onto that
baseline. Git reported no conflicts; it auto-merged the RFX versions of
`RankedLobbyHero.tsx` and `Quiz.tsx`, preserving their current behavior while
adding only the availability hook/prop wiring.

The `/quiz` host reads `GET /api/ranked/availability`. Loading, network errors,
and contract errors resolve closed. Closed PLAY calls the existing Daily
Challenge callback directly and never mounts the play record. Open PLAY shows
a small `Ranked available` badge and opens the unchanged record, where Ranked,
Daily Challenge, and Invite retain their existing implementations.

The seal remains a real button with accessible name `Play`; the visual badge
is excluded from the accessibility name. Existing Enter/Space and focus-return
behavior is unchanged.

## Integration note

Invite & Play currently exists only inside the play record. While live Ranked
is closed, the requested direct-to-Daily PLAY behavior makes that record
unreachable from the seal. The Invite implementation was preserved, but a
separate Invite entry needs an explicit product/IA decision; this workstream
did not invent one.

## Verification

- The reconciled run includes the focused availability/hub/play-record tests
  plus current RFX Ranked Hub, seal, role, lobby-preview, workspace, and Daily
  entry tests. The role-page suite is explicitly pinned to an open server
  decision; without that mock its old popup expectations correctly take the
  new fail-closed Daily path instead.
- Focused D coverage passed: availability hook 2/2, Hub PLAY behavior 12/12,
  and play record 150/150. Current RFX coverage also passed for the PLAY seal
  (16/16), Ranked Hub identity (3/3), Ranked hero (63/63), Daily entry (15/15),
  owned questions (21/21), and workspace (34/34).
- The current `Quiz.rankedRole` suite passed 60/61 after its server decision
  was pinned open. Its existing Practice case still fails after Practice
  intentionally starts an empty mocked set and the page leaves the Hub for
  its `No questions available` error state; this does not involve D's
  availability branch. Lobby-preview's two repository-wide source scans also
  fail in this multi-worktree checkout because they scan outside the isolated
  source tree; its 15 behavioral cases pass.
- Repository-wide TypeScript checking reaches existing errors in admin,
  broadcast, workspace tests, arena tests, GIF export, community, feedback,
  identity, and team-sim code. No error names a DCMOD-D implementation file.
