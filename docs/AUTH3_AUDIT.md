# AUTH3 — Username / Public Identity Audit

Companion to `docs/AUTH2_AUDIT.md`. What Mogzy already had, what was actually
wrong with it, and what changed.

---

## A. Identity map

There is **one** public-name column. Everything below reads or writes it.

| Concept | Storage | Written by | Read by | Visible where |
| --- | --- | --- | --- | --- |
| **Public name** | `profiles.display_name` (text, NOT NULL, CHECK ≤ 50) | `handle_new_user()`; Welcome adoption; profile editor; onboarding step; `admin_create_bot_profile` | `useProfileIdentity`, `public_profiles`, `admin_list_profiles`, `get_league_profiles`, friends, invites | Ranked lobby, leaderboard, profile, friends, invites, admin directory |
| Welcome "username" | `localStorage["mogsy.academyRegistration.v1"].username` | `saveAcademyRegistration` (page 2 of `/welcome`) | `adoptAcademyIdentity`, and now the signup prefill | The register itself |
| Anonymous placeholder | `profiles.display_name` — same column | `handle_new_user()` when `is_anonymous` | everything above | anywhere a guest is shown |
| Auth UID | `auth.users.id` | Supabase | everything, as a key | never |
| Self-reported rank | `profiles.league_rank` | Welcome adoption | profile | profile |
| Ranked participant name | `ranked_match_participants.display_name` (backend SQLite, separate repo) | only `create_test_match` | `opponent_display_name` in match history | Ranked match history |
| Social handles | `profiles.socials` | profile editor | profile | profile |

**Non-findings, checked and dismissed.** There is no `username`, `user_name`,
`profile_name` or `onboarding_name` column anywhere. `src/lib/social-validators
.ts` and `Profile.tsx`'s "Usernames and @ handles won't be accepted" are about
pasted social-media links. `src/components/ui/*`'s `displayName` is React's
component-name convention. `graph1`/`mastery`/`pro-roster` `display_name` fields
are champion, entity and esports-player names — not user identity.

## B. The journey as it was

**New user through Welcome.** `/welcome` page 2 asks for a name and a rank →
`saveAcademyRegistration` writes them to localStorage → `useAcademyIdentitySync`
(mounted app-wide) watches auth and calls `adoptAcademyIdentity` on the first
session that appears → first-write-wins onto `profiles.display_name`. Signup
itself asked for **email and password only** and never mentioned the name;
`signUp()` sent no metadata, so `handle_new_user()` wrote `''` and the account
was nameless until the bridge happened to run.

**Guest who never did Welcome.** `handle_new_user()` minted
`'Anonymous' || (count of anonymous profiles + 1)`. The guest-upgrade panel
collected email + password and converted **in place** (same uid), so the
placeholder survived into the permanent account — and, because
`isPlaceholderDisplayName` correctly stops forgiving a generated name once the
row is no longer anonymous, it then stuck until the user found the profile
editor.

**Returning user / rename.** Sign-in was email + password (correct, unchanged).
Rename was `Profile.tsx` → `profiles.update({ display_name })`, profanity check
only.

## C. Problems found

1. **No uniqueness at all.** No unique index, no client check, nothing. Two
   accounts could hold one public identity on the leaderboard.
2. **Three validation regimes on one column.** 2–24 + charset at `/welcome`;
   profanity-only in the profile editor (`maxLength={30}`); profanity-only in
   onboarding; `≤ 60` in the admin bot RPC; `≤ 50` in the table CHECK.
3. **Signup asked for nothing and then depended on an async bridge.** A guest
   whose local record was already `adoptedBy` an earlier uid — sign out, sign up
   fresh — got an account with `display_name = ''`.
4. **The anonymous generator was not unique.** `count(*)+1` goes *down* when
   `purge-anonymous-users` runs, so it reissues names, and two concurrent
   sign-ins read the same count.
5. **Three names for one field.** "Name" at `/welcome`, "Display Name" in the
   profile editor and onboarding (placeholder: "Choose a username"), nothing at
   signup.
6. **`Profile.test.tsx` was 12/12 red** on `localStorage.clear is not a
   function`, so the rename path had no working coverage.

## D. Canonical model

`profiles.display_name` **is** the canonical public Mogzy identity, and AUTH3
makes it authoritative rather than replacing it. Adding a second column would
have created exactly the duplicate-identity problem this workstream exists to
close, and would have orphaned every read listed in §A.

- **Authority:** `public.set_display_name(_name, _only_if_unset)` — SECURITY
  DEFINER, validates, enforces case-insensitive uniqueness in the same
  statement that writes, writes only `auth.uid()`'s own row.
- **Client:** `lib/identity/username.ts` (shape) + `lib/identity/claim-username
  .ts` (the one write path) + `lib/identity/preferred-username.ts` (prefill).
- **Cosmetics stay out of it.** `display_name` remains a plain semantic string.

## E. Username rules (implemented)

2–24 characters · letters, digits, spaces, `.` `_` `'` `-` · leading/trailing
whitespace trimmed · runs of whitespace collapsed · uniqueness case-insensitive
and whitespace-insensitive · chosen capitalisation preserved for display.

Not required: numbers, symbols, uppercase, lowercase, Riot-style tags, complexity.

Reserved (the whole list): `^Anonymous\d+$`, and `admin`, `administrator`,
`moderator`, `system`, `support`, `mogzy`, `mogsy`. Plus the pre-existing
profanity filter (`lib/profanity-filter.ts`), now applied consistently on all
three writing surfaces instead of two.

**2–24, not the suggested 2–20.** The register has been shipping 2–24 since
HI1-C5 and names of 21–24 characters have already been accepted and stored.
Narrowing the ceiling would make Mogzy reject names Mogzy handed out.

## F. Signup integration

- **Name already chosen** → Username (prefilled, editable) · Email · Password ·
  Create Account. The name rides in as `options.data.display_name` so
  `handle_new_user()` writes it on the row it is already creating.
- **Only an `Anonymous####` placeholder** → same three fields, username empty
  and inviting. The guest already holds a session, so the claim happens
  **before** the conversion: a taken name costs a corrected field, not an
  account that needs renaming.
- **Taken, on the brand-new-account path** → the account is created and kept;
  the form becomes a name picker (`awaitingUsername`) and never calls `signUp()`
  twice.
- **Sign in** → Email · Password. Unchanged.
- Email is never an identity source. `preferred-username.test.ts` asserts
  structurally that no branch reads one.

## G. Rename

Free, uncapped, unlimited, and not a premium feature. No cooldown existed and
none was added. The only change is that the rename now goes through
`set_display_name()`, so it can be told "That username is already taken."

## H. Ranked / profile propagation

Unchanged and already correct: the Ranked lobby hero reads `useProfileIdentity`
→ `profiles.display_name`; the leaderboard reads `public_profiles.display_name`.
Verified live — a Welcome-chosen name renders on `/quiz?tab=ranked`.

**Backend gap, reported not fixed (different repo).**
`ranked_public/queue.py` creates real matches without passing `display_names`,
so `ranked_match_participants.display_name` is NULL for every queued match and
`opponent_display_name` renders as "Opponent". Only the admin `create_test_match`
route ever populates it. `RehydratedMatch.display_names()` — which falls back to
the raw user UUID — has **no callers**.

## I. Future customization readiness

The data model is already right for it, and AUTH3 keeps it that way.
`profiles.profile_frame` and `profiles.custom_theme` (both `is_pro`-gated)
are the existing precedent: presentation lives beside the identity, never
inside it. Name colour, glow, title, badge, border, Ranked frame and Founder
treatment should become **unlocks + equipped state in their own table**
(`profile_cosmetics` / `equipped_cosmetics`) rather than more columns on
`profiles`, so a season's rewards can be granted and revoked without touching
identity. Nothing may be encoded into the `display_name` string.

## J. Deploy note — READ BEFORE MERGING

The migration is **not applied** (verified live: `set_display_name` returns
`PGRST202`). Because master auto-deploys ahead of SQL,
`lib/identity/claim-username.ts` detects the missing function and falls back to
the pre-AUTH3 direct write — the same accommodation `provisional-identity.ts`
already makes for `league_rank`. In that window shape rules still apply and
uniqueness does not, which is exactly the status quo. Apply
`20260822120000_auth3_canonical_username.sql` to close it.

If the index reports `blocked:<n>`, existing duplicates are in the way. Inspect
`public.display_name_conflicts` (admin-only), resolve them, then call
`public.enforce_display_name_uniqueness()`. Uniqueness is enforced by the RPC
either way.
