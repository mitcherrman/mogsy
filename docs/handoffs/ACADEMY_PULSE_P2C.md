# Academy Pulse — PULSE-2C: creators, videos and sponsor content

Lane 4 (PARTNERS) of the Academy Pulse command center, mitcherrman/mogsy#151. Branch `pulse/p2c-partner-content`, base `origin/main` a0f426d4. Draft PR only: nothing is merged, deployed, or wired into the public feed.

## 1. What this adds

There is one new folder, `src/features/academy-pulse/content/partners/`. It contains pure adapters that turn **owner-editable partner records** into the `CreatorItem` and `SponsorItem` that the PULSE-1 scenes already draw. When a record is unsupported, the adapter **omits it and says why**. It never substitutes other content.

```
owner records (PULSE-2B workspace) ─┐
trusted live evidence (none yet) ───┼─► adaptPartnerContent(input, {now}) ─► partnerCatalogue() ─► existing cadence ─► PULSE-1 scenes
                                    └─► omitted[] (record id, item|field, reason, detail)
```

| File | Role |
|---|---|
| `partner-contract.ts` | Owner-editable record types: the contract for PULSE-2B (§4) |
| `partner-validate.ts` | Shared checks: exact-host https URLs, image sources, display text, ISO instants |
| `youtube.ts` | Video and Short URL parsing, watch URL, still, duration label |
| `twitch.ts` | Channel URL parsing, and the LIVE decision from trusted, fresh evidence |
| `creator-challenge.ts` | Registry of Mogzy challenge sources, plus challenge validation |
| `creator.ts` | `CreatorRecord` → `CreatorItem` |
| `sponsor.ts` | `SponsorCampaignRecord` → `SponsorItem`, plus the concurrent-campaign limit |
| `partner-adapter.ts` | Entry point, `PARTNER_CONTENT_ENABLED = false`, `PARTNER_CAPABILITIES` |
| `partner-examples.ts` | Labelled fixture records (§5) |
| `*.test.ts` | 89 tests |
| `.github/workflows/academy-pulse-partners.yml` | CI: the tests, a typecheck scoped to this folder, and eslint |

Nothing outside the folder imports it. A test enforces that by scanning `src/features/academy-pulse`. No shared file was edited: not `pulse-types`, `pulse-cadence`, `pulse-provider`, `AcademyPulse.tsx`, the scenes or the viewer.

## 2. Verified capabilities and limits

| Capability | Status | Detail |
|---|---|---|
| YouTube URL → id | **verified** (offline) | Accepts `watch?v=`, `/shorts/`, `/embed/`, `/live/`, `youtu.be/` and `youtube-nocookie.com/embed/`. The URL must be https on an exact host, with no credentials or port, and the id must be exactly 11 characters from `[A-Za-z0-9_-]`. The owner's URL is never used as a link; the watch link is rebuilt from the id. |
| YouTube still | **verified** | `i.ytimg.com/vi/<id>/hqdefault.jpg` exists for every id. `maxresdefault` does not always exist, so it isn't used. Shorts get a letterboxed 4:3 still. |
| YouTube player | **verified** (PULSE-1) | The existing `PulseVideoViewer`: privacy-enhanced embed loaded only on Play, with Academy Radio yielding while it plays. |
| YouTube title and duration | **owner-entered** | Reading them needs the YouTube Data API v3, which needs an API key and must run server-side. If the owner gives no duration, the label reads "Video"; Shorts read "Short". No length is invented. |
| YouTube availability | **absent** | Private, deleted, age-restricted or non-embeddable videos aren't detected. The player shows YouTube's own error. Detecting them needs the Data API, or oEmbed called server-side. |
| Twitch channel | **verified** (offline) | `twitch.tv/<login>` reduces to a lowercase login of 4–25 characters, with reserved paths refused. The PULSE-1 viewer embeds it with `parent=<host>`. |
| Twitch LIVE | **disabled** | Taken only from `TwitchLiveEvidence` that comes from a source the caller **explicitly trusts**, matches the channel, was observed no more than 90 s ago (configurable) and is not past its own `expiresAt`. The newest observation wins. The default trusts nothing, and no server-side reader exists, so **no channel is ever shown LIVE**. A channel without evidence shows no pill. The adapter doesn't claim "offline" either. |
| Twitch viewers | **disabled** | Taken only from the same trusted evidence's `viewer_count`, rounded **down** ("1.2K watching"). Without a count the pill reads "Live · now". Viewers are never owner-entered. |
| Creator challenge | **absent** | No public Mogzy challenge is both reproducible and score-authoritative (§3). Challenges are omitted and the creator is still shown. |
| Sponsor campaign | **owner-entered** | Checks approval, flight window, Pulse placement, approved hosts, the "Sponsored" disclosure, artwork with alt text, and text limits (§4). |
| Sponsor frequency | **cadence + 1 concurrent** | The existing cadence caps promotions at 2 per cycle, at least 3 apart. The adapter adds `maxConcurrentCampaigns` (default 1, earliest approval first). |
| Per-viewer impression caps | **absent** | They would need impression storage, which Pulse doesn't have. |

Every adapted item carries `validUntil`. That is the earliest of a flight's end, a feature window's end, or live evidence expiring. A provider must re-adapt by then; the adapter never extends anything.

## 3. Creator challenges: why none are enabled

A challenge is honest only if a viewer gets **exactly** the creator's content, and the creator's score is a **server-recorded attempt** on that content, looked up by id. Here is what the code and backend audits show for each source today (`CHALLENGE_SOURCES`):

| Source | Reproducible | Score authority | Why |
|---|---|---|---|
| `daily-challenge` | no | no | Only the Daily's shape/Journey is shared per day. Per the DREP1 backend audit, each child match draws its questions with its own random order seed, and DREP1's per-player avoidance varies them further. Per-user Daily run history is an owner-only backend route. The owner-only Creator Replay (`/quiz/daily-challenge/creator/:runId`) is a filming tool, not a public replay. |
| `more-challenges` | no | no | Bonus sessions are drawn per session; the route carries no seed or set id. |
| `tournament-arena` | no | no | Admin beta, not deployed. Rooms are short-lived and their scores aren't publicly readable. |
| `card-duel-room` | no | no | Live head-to-head rooms, not a replayable fixed set. |

Enabling one needs backend work: a public fixed-set or seeded challenge id that serves identical content, plus a public read of one attempt's score by id. After that, its registry entry is changed in review, with the evidence. The validator already requires that the score's source matches the challenge's source, a non-empty attempt id, a key matching the source's pattern, and a verification time.

## 4. Owner-editable metadata contract (for PULSE-2B)

The types are in `partner-contract.ts`. No PULSE-2B branch or contract existed when this was written, so this is a **proposal**. PULSE-2B can import these types from `@/features/academy-pulse/content/partners/partner-contract`, or mirror them. Either way, changes should be agreed on #151.

- **`CreatorRecord`** holds `id`, `creatorName` (≤ 40), `creatorTag` (≤ 32), `media` (below), an optional `challenge`, `status`, `approval`, an optional `activeFrom`/`activeUntil`, and `provenance`.
  - `media` for YouTube: `{ platform: "youtube", url, title ≤ 100, durationSeconds?, thumbnailUrl? }`.
  - `media` for Twitch: `{ platform: "twitch", channelUrl, title ≤ 100, thumbnailUrl?, artChampion? }`. The title describes the channel; it is not the current stream title.
- **`SponsorCampaignRecord`** holds:
  - `id`, `sponsorName` (≤ 40), `campaignTitle` (≤ 100), `tagline` (≤ 140), `ctaLabel` (≤ 24);
  - `artwork { url, alt }`, which is required;
  - `destinationUrl` and `approvedHosts[]`, matched as exact hostnames;
  - `disclosure { label: "Sponsored", advertiser }`, where `advertiser` must equal `sponsorName`;
  - `window { startsAt, endsAt }`: end exclusive, at most 92 days;
  - `placement { surfaces: ["academy-pulse"] }`;
  - `status`, `approval` and `provenance`.
- **`status`** is one of `draft | pending-review | approved | paused | ended | rejected`. Only `approved` with an `approval { approvedBy, approvedAt ≤ now }` can show.
- **`provenance`** is `{ source: "owner-entry" | "fixture", recordedBy, recordedAt, note? }`. Owner entries become `provenance: "live"` items. Fixtures become `"fixture"` items, which the shell labels "Sample". Their hrefs, video ids and channels are stripped, so the viewer shows its stand-in player.
- **Timestamps** are ISO-8601 with an explicit offset; anything else is invalid.
- **Images** must be a same-origin path (`/…`, no `//`, `..` or `\`) or https on `imageHosts`. The default `imageHosts` is `["i.ytimg.com"]`. Owner-uploaded art in Supabase Storage needs that host added in the provider, which is a PULSE-2A/2B decision.
- **Deliberately absent from the owner contract:** any LIVE state, viewer count or typed-in score.

Omission reasons are listed in the `OmissionReason` type. `scope: "item"` means the record was dropped; `"field"` means the item is shown without that part. These suit an admin "why isn't this showing?" panel.

## 5. Example content

`partner-examples.ts` holds labelled fixture records:

- a video;
- a Short;
- a Twitch channel with a Daily challenge, which is omitted as not reproducible;
- a draft creator, which is omitted;
- an approved sponsor, whose destination is `example.com` (the domain reserved for documentation) and whose art is `/mogsy-logo.png`;
- a paused sponsor, which is omitted;
- one Helix-shaped live observation, which is ignored under the default trust.

**Provenance:** the creators, channel and sponsor are invented. The video ids and the login are only well-formed; they weren't looked up and aren't claimed to exist. The adapted examples contain no `http(s)` link, and that is tested.

## 6. External credentials and approvals actually required

| To turn on | Needs | Where |
|---|---|---|
| Real creator videos and Shorts | Owner-approved records (PULSE-2B) and creator permission to feature them (§7) | Nothing secret: the embed and still need no key |
| YouTube title, duration and availability checks | A YouTube Data API v3 key (free quota) | **Server-side only**, never in the frontend |
| Twitch player for a channel | Nothing: the embed needs only `parent=<host>`, and the viewer already sets it | — |
| Twitch LIVE and viewers | A Twitch app (client id + secret) and an app access token. A Mogzy server reader polls Helix `GET /streams` (or subscribes to EventSub) and serves `TwitchLiveEvidence` through an authenticated or public read. The provider then passes `trustedLiveSources`. | **Server-side only.** No Twitch secret may reach the frontend. |
| Creator challenges | Backend: a reproducible public challenge id, plus a public per-attempt score read | Backend design, not started |
| A sponsor campaign | An owner-approved record, a signed sponsor agreement, and an owner/legal decision on disclosure wording and brand safety | Owner |

No paid service is required. None of these credentials or approvals were created or requested in this lane.

## 7. Owner questions

1. **Creator consent.** Embedding a public YouTube or Twitch player is permitted by those platforms. Is a "spotlight", which implies a relationship, OK without written creator permission? The contract has no consent field yet. It can gain `creatorPermission { kind, recordedAt }` if wanted.
2. **Disclosure wording.** The Sponsor scene prints a fixed **SPONSORED** band plus the sponsor's name, so only `label: "Sponsored"` is accepted. "Paid partnership" or "Ad" would need a scene change (PULSE-2A owns the integration).
3. **Concurrency.** Is one concurrent campaign right, or should sponsors rotate inside the sponsor slot?
4. **Flight cap.** Is 92 days a sensible guard against data-entry mistakes?
5. **Image hosts.** Which host will owner-uploaded art live on (Supabase Storage public bucket)?

## 8. Verification (L2)

- **Unit (local, vitest, esbuild + wasm-rollup workaround):** `src/features/academy-pulse` is 7 files and 144 tests, all passing. That includes the 89 new partner tests.
  - URL forms and hostile URLs (lookalike hosts, credentials, ports, `javascript:`, IP literals);
  - every live-evidence branch, with the default trusting nothing;
  - challenge registry and score binding;
  - all sponsor inactive and invalid states, plus the concurrent limit;
  - compatibility with `isRenderable`, `embedUrl`, `platformUrl` and `buildPulseCycle`;
  - the examples' provenance, and the import isolation.
- **Lint:** eslint on the folder is clean.
- **Typecheck:** **not run locally.** The global resource guard refused it twice, and it was not retried in a loop or bypassed. The first refusal was 4.9 GB free RAM against 5.5 GB required, League open and another session's pytest running. The second (2C.1) was 857 MB free and the disk 99 % busy. It runs in CI instead (`academy-pulse-partners`, scoped to this folder).
- **Browser:** no rendered change; the adapter isn't wired in. `academy-pulse` (GitHub Chromium) still triggers on this path and proves PULSE-1 is unaffected.
- **CI:** see §11 for the PULSE-2C.1 result.

## 9. Next

- PULSE-2B: settle the incompatibilities in §10 on #151 (2C does not edit #155).
- PULSE-2A integration, the sole owner of `pulse-provider.ts`:
  1. Read approved records server-side or under RLS.
  2. Call `adaptPartnerContent` with `now`.
  3. Merge `partnerCatalogue()` into the public catalogue.
  4. Re-adapt at `validUntil`.
  5. Flip `PARTNER_CONTENT_ENABLED` only on the owner's decision.
- Backend, when wanted: the Twitch live reader, and a reproducible challenge id with a score read.

## 10. Compatibility with PULSE-2B (#155, head f337759a)

#155's contract (`src/lib/admin/pulse/contract.ts`, `pulse-admin/1`) is a different shape from §4.

- **#155** stores the **finished scene payload** (`CreatorItem` / `SponsorItem`) inside an editorial envelope (`PulseContentRecord`), and links it to a `PulseCampaign` that holds approval, flight and disclosure.
- **2C** takes **raw records** (pasted URLs, approved hosts, artwork) and *derives* the payload.

The two can coexist, but these points disagree. Neither PR is wrong to merge alone, because 2C is disconnected, but they must be resolved before partner content is enabled:

| # | Topic | #155 | 2C | Risk if left | Proposed resolution |
|---|---|---|---|---|---|
| 1 | Where media ids come from | Owner types `videoId` / `channel` into the payload; publish requires `platformUrl()` ≠ null | Derived from a pasted URL by `parseYouTubeUrl` / `parseTwitchChannelUrl` | Low: both end in the same id regex | #155's editor can call 2C's parsers to fill the payload from a URL. No contract change. |
| 2 | Twitch LIVE / viewers | Save rejects `live: true` by hand; `viewersLabel` stays editable but is only drawn when live | No owner field; only trusted fresh evidence | Low | Compatible. #155 should also blank `viewersLabel`. 2A applies `decideLive` at projection time. |
| 3 | Creator challenge | Owner may type `challenge { title, detail, href }` with an internal href | Omitted unless the source is reproducible and score-authoritative; none is | **High**: a typed "Beat their Daily 9,210" would be an unverifiable score | The public projection drops `challenge` until a `CHALLENGE_SOURCES` entry is verified, or #155 removes the field from the creator form. |
| 4 | Sponsor destination | Any https host (`isHttpsUrl`) | Exact match against the campaign's `approvedHosts` | Medium: a typo or swapped link goes live | Add `approvedHosts: string[]` to `PulseCampaign`, approved with it. 2C validates `href` against them. |
| 5 | Artwork / thumbnail host | Any https URL | Same-origin path or allowlisted image host (default `i.ytimg.com`) | Medium: third-party hotlinks, tracking pixels | Agree on the owner upload host (Supabase Storage public bucket?) and add it to `imageHosts`. |
| 6 | Disclosure | 4 kinds (`sponsored`, `paid-partnership`, `affiliate`, `unpaid-spotlight`) plus `disclosureText`, on the campaign; creators require a campaign | Only "Sponsored" (the scene's fixed band), advertiser = sponsor name; creators carry no disclosure | Medium: wording the scene doesn't show | Either the scenes learn to print `DISCLOSURE_LABEL[kind]` (2A owns the scenes), or sponsor campaigns are limited to `sponsored`. 2C would accept `disclosure.kind`, and `partnerName === sponsorName`. |
| 7 | States | Item `draft/published/unpublished/archived` plus campaign `pending/approved/rejected/ended`, and a `partners` kill switch | One `status` (`draft/pending-review/approved/paused/ended/rejected`) per record | Low | Map: shown ⇔ item effectively `live` **and** campaign `approved`. `paused` ≈ unpublished or kill. The kill switch is checked before the adapter runs. |
| 8 | Approval identity | `decidedAt` (server-set), no approver id | `approval { approvedBy, approvedAt }` | Low | Use #155's server `decidedAt`; the approver comes from the server's audit log. 2C relaxes `approvedBy` when mapping from #155. |
| 9 | Windows | Optional `flightStart` / `flightEnd` on the campaign, plus item `publishAt` / `expiresAt` | Sponsor window required, at most 92 days, end exclusive; creator window optional | Medium: an open-ended sponsor flight | Require both flight bounds for `type: "sponsor"` in #155 (owner decision on the cap, §7.4). The effective window is the intersection of item and flight. |
| 10 | Concurrency | Category `maxPerCycle` | `maxConcurrentCampaigns` (1) | Low | Both apply. They are independent limits. |
| 11 | Provenance | Implicit (owner records → `live`; preview → `fixture`) | Explicit `provenance` | Low | Map #155 records to `source: "owner-entry"`; preview stays `fixture`. |
| 12 | Timestamps | `Date.parse` of any ISO | Explicit offset required | Low | The server emits `timestamptz` with an offset, so 2C's stricter parse accepts it. |

**Integration recommendation (for 2A).** Build the public catalogue from #155's projection, then run 2C's checks on each partner item before it reaches the scheduler: rows 2–6 and 9. That needs a small mapping from `PulseContentRecord + PulseCampaign` to 2C's records, owned by 2A at integration time. That way neither contract is the only gate. 2C did not edit #155.

## 11. PULSE-2C.1 — typecheck fix (2026-10-24)

**Cause.** `tsconfig.app.json` has `strict: false`, so `strictNullChecks` is off. Without it, a truthiness test (`!d.ok`, `!live.live`) does not narrow a discriminated union, so `.omission`, `.reason` and `.detail` were not visible on the false branch. That gave 10 errors (run 40073095905) in `creator.ts`, `sponsor.ts`, `partner-adapter.ts` and `partner-adapter.test.ts`. Vitest passed, because esbuild doesn't typecheck.

**Fix.** Every decision is compared to its literal discriminant (`d.ok === false`, `live.live === false`, `c.ok === true`), and that is commented at the adapter. No type was widened, no cast or `any` was added, and no validation rule changed.

**Results:** local partner and model vitest 124/124, eslint clean, local typecheck refused by the guard (§8). CI: see the PR.
