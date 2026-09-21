# DCMOD-D frontend handoff

Branch: `dcmod/d-hub`, based on `30b75cbe`.

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

- 163 existing/new focused play-record and hub tests passed (warnings were
  pre-existing React `act` warnings in the large record suite).
- The final focused availability/hub run passed 14/14 tests.
- Repository-wide TypeScript checking reaches unrelated pre-existing errors;
  no error named a DCMOD-D file.
