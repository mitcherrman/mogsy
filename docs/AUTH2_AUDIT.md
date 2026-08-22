# AUTH2 — Signup Friction Adversarial Audit

Branch `auth2/signup-friction`, worktree `/Users/macmoney/mogsy-worktrees/auth2-signup`,
based on `origin/main` `ad603131`.

Successor to `docs/AUTH1_AUDIT.md`. AUTH1's routing, password-policy and
verification work is intact and largely correct; this pass starts from a
production failure AUTH1 introduced, then re-audits the account system around
it.

---

## 0. Method: measured, not reasoned about

Every claim below about what the auth server does was produced by running it
against the live project (`kewgjwrzpzpeltwidvuc`) with the app's own anon key
and client version, not inferred from documentation.

That distinction is the whole reason this audit exists. AUTH1's conversion code
carried the note *"verified against auth-js 2.97.0"* — but the rule it got wrong
lives in the GoTrue **server**, so no amount of checking the JS client could
have caught it. A client-version check is not a behaviour check.

### Probe results (verbatim)

| # | Call | Result |
|---|------|--------|
| A | `updateUser({password})` on an anonymous user | **422 `validation_failed`** — `"Updating password of an anonymous user without an email or phone is not allowed"` |
| B | `updateUser({email, password})` in ONE call | **OK** — same uid, `is_anonymous:false`, `email_confirmed_at` set, `identities:["email"]`, session live, fresh `signInWithPassword` works and returns the same uid |
| C | `updateUser({email})` then `updateUser({password})` | OK — same uid |
| D | `signUp({email,password})` with an anonymous session active | OK but **a DIFFERENT uid** — the guest is orphaned |
| E | `signUp()` signed out | session returned ⇒ **Confirm email is OFF / auto-confirm ON** |
| F | `signUp()` with an existing email | 422 `user_already_exists` — `"User already registered"` |
| G | 5-char password | 422 `weak_password` — `"Password should be at least 6 characters."` |
| G | 6-char all-lowercase | **accepted** — no composition rules server-side |
| H | `signInWithPassword` over a LIVE anonymous session | OK, session swaps cleanly — **no `signOut()` needed** |
| I | WRONG password over a live anonymous session | 400 `invalid_credentials`, **anonymous session survives intact** |
| K | upgrade to an email that already exists | 422 `email_exists`, **anonymous user left untouched** — retry is safe |
| L | fresh anonymous user | `handle_new_user` creates a profile named `Anonymous<n>` immediately |
| M | reset for an unknown email | silent OK — no user enumeration |

The Supabase dashboard settings AUTH1 flagged as "still required, and impossible
from this repo" are all **confirmed correctly set** in production: minimum 6,
no required characters (G), confirm-email off (E).

---

## A. Confirmed friction findings

### P0 — Guest signup could not succeed at all

**What it was.** A guest who entered an email and password saw
`Updating password of an anonymous user without an email or phone is not allowed`
and got no account.

**Why it existed.** AUTH1 deliberately ordered the conversion password-first:

```
1. updateUser({ password })   // on the still-anonymous user  ← rejected, always
2. updateUser({ email })
```

The intent was sound — *"the credential exists no matter which branch step 2
takes, so the user never has to come back to a form"*. The intent was
unreachable, because step 1 is exactly the call the server refuses. The
reasoning was about the client; the rule is in the server.

**Required?** No. Not required by anything — a plain bug.

**Severity.** P0.

**What changed.** One call carries both fields:
`updateUser({ email, password }, { emailRedirectTo })`. The email in the same
request is what makes the password legal. A narrow fallback — keyed to that one
error sentence so it cannot swallow anything else — retries as email-then-password
if a future server tightens the rule.

---

### P1 — One mistyped password permanently destroyed a guest's progress

**What it was.** `/auth` sign-in ran `supabase.auth.signOut()` *before*
attempting the sign-in whenever the visitor was a guest. Sign-in fails (typo,
wrong account, autofill) → the guest is now signed out. An anonymous session has
**no credential to get back in with**, so that guest's profile, XP, streak,
tutorial stamp and history became permanently unreachable — and, being still
flagged `is_anonymous`, eligible for the admin purge that hard-deletes them.

The cost was paid on the *failure* path, which is the path a typo takes.

**Why it existed.** The comment says switching accounts "requires ending the
guest session first". Measured (probe H): it does not. `signInWithPassword`
replaces the session by itself.

**Required?** No — ACCIDENTAL COMPLEXITY resting on an untested assumption.

**Severity.** P1 (user can lose data).

**What changed.** The pre-emptive `signOut()` is gone. A failed attempt now
leaves the guest exactly as it found them (verified live: guest uid unchanged
after a wrong password). A successful one swaps the session cleanly.

---

### P1 — A half-converted account was purge-eligible and could not be repaired

**What it was.** Conversion is two writes to two systems: auth flips
`is_anonymous` server-side, then the client writes `profiles.is_anonymous =
false`. If the second failed (dropped connection, closed tab, transient RLS),
the old code:

1. returned `ok:false` — telling the user signup failed when their credential
   already worked;
2. left the profile flagged anonymous, and `supabase/functions/purge-anonymous-users`
   selects by **`profiles.is_anonymous`** and calls `auth.admin.deleteUser`,
   which cascades. A real account was on a hard-delete path;
3. dead-ended the retry: pressing the button again hit the
   `user.is_anonymous !== true` guard and returned *"This account is already
   registered."* — a form the user could never satisfy.

**Required?** No. The reporting was actively false.

**Severity.** P1.

**What changed.** Three things, smallest first:

- `syncProfilePermanent` retries once itself.
- A profile-flag failure no longer fails the conversion. The account **is**
  permanent by then; saying otherwise is untrue and traps the user.
- `ensureProfilePermanent(userId)` reconciles the two flags on every load of a
  permanent session (one indexed read, no-op in the normal case). This repairs
  accounts **already stuck** in that state, not just future ones.
- The retry guard now finishes the half-done job instead of refusing.

---

### P2 — The existing-email case dead-ended with a raw server string

**What it was.** `/auth` signup tested `error.message?.includes("already been
registered")`. The signup endpoint actually returns **`"User already
registered"`** (probe F) — which does not contain that substring. So the one
error with an obvious next step fell through to the generic branch, printed the
raw Supabase text, and did **not** switch to sign-in.

The guest-upgrade path matched a different substring and worked. Two surfaces,
two hand-rolled matchers, one of them wrong.

**Required?** No — LEGACY BEHAVIOR plus a copy/paste divergence.

**Severity.** P2 (dead end) / P4 (raw error).

**What changed.** New `src/lib/auth/auth-errors.ts` is the single mapper for
both surfaces. It matches on the **stable `error.code`** first and only falls
back to prose, because prose is what drifted. `/auth` now switches to sign-in,
keeps the typed email and the `returnTo`, and clears only the password.

---

### P2 — A signup entry point that dropped the user's destination

`components/combat-battles/PredictionPanel.tsx` linked to a bare
`/auth?mode=signup` with no `returnTo`, so creating an account from a battle
page landed the user at the hub. Its sibling call site in the same file already
carried the destination. Both now go through `authHref`.

Every other entry point audited (§10 below) already preserved the destination —
AUTH1's `authHref` work holds up.

---

### P3 — "Confirm password" removed on the two account-creation surfaces

**Evaluated, not assumed.** The field exists to catch a typo. Under this
product's philosophy it does not earn its place at *account creation*:

- It only catches anything for people **typing** twice. A password manager fills
  both fields identically, so for those users it is a pure extra field.
- The failure is fully recoverable in one click — "Forgot password?" is on the
  same page and the account has a confirmed email.
- The guard was already inconsistent: the **email** is typed once with no
  confirmation, and a typo'd email is the case that actually strands someone.
  Doubling only the password protected the recoverable half.

**Replaced, not just deleted.** `components/auth/PasswordField.tsx` adds a
reveal toggle. Letting someone *see what they typed* is strictly more
information than typing it twice and being told two rows of dots disagree, and
it works for password-manager users too.

**Kept where it earns its place.** Settings → change password and
`/reset-password` both re-establish a credential for an account the user is
**already holding**, where a silent typo locks out a live session.
`validateNewPassword`'s optional `confirm` argument is unchanged for them.

---

### P4/P5 — Dead code removed at `/auth`

The `showLinkFlow` branches inside the main form (a "Claim your account"
header, a preserved-progress banner, a confirm field, a "Link your account"
hint) were **unreachable**: the `AccountUpgradePanel` branch returns before them
for exactly the state that would render them. Removed, and the guest is now told
what signing in costs them (below) instead of being offered a second vocabulary
("link") for the same action.

---

## B. Guest conversion architecture

### Old behaviour

```
updateUser({ password })                 ← 422, every time. Flow ends here.
updateUser({ email }, { redirect })
getUser() → permanent? sync profile : write pending record
```

### Why the anonymous-update path failed

Not because updating an anonymous user in place is wrong — it is exactly right,
and it is what the new flow still does. It failed because of **ordering**. The
server permits a password on an anonymous user only when the same request also
carries the email that de-anonymises them. AUTH1 split those two facts across
two requests and put the dependent one first.

### New behaviour

```
updateUser({ email, password }, { emailRedirectTo })     ← one call
  └─ on the anonymous-password rejection only: updateUser({email}) → updateUser({password})
getUser()                                                ← authoritative
  ├─ permanent  → sync profile flag (non-blocking, self-repairing) → route onward
  └─ anonymous  → write pending record → retained verification screen
```

### How data is preserved

**By not moving it.** The auth user id is unchanged, so every row keyed to that
id is preserved by construction — there is no copy step, therefore no copy step
that can fail, partially succeed, or duplicate. Verified live: guest
`b9122fc1-11d2-427d-978f-786ad1dcb4b6` created an account and came back with the
same uid and the same profile row `d0c6c62c-…` (`display_name` still
`Anonymous5472`), now `is_anonymous:false`.

The alternative — mint a new user and transfer — was measured (probe D:
`signUp()` while anonymous returns a *different* uid) and rejected. It would
require a transfer for every table below, each a chance to lose something.

The brief said preserving the internal anonymous UID is not sacred. It turns out
preserving it is also the **simplest** option, so the trade-off never had to be
made.

---

## C. Remaining unnecessary friction (found, NOT changed)

1. **Invite codes are stored and never redeemed.** `Auth.tsx` writes
   `mogsy-invite-code` to localStorage and defines `redeemInvite()` — which is
   **never called**. Anyone arriving through an invite link gets no reward.
   Deliberately not wired: `redeem_invite_link` writes to `user_roles` (it is a
   real role-assignment path), and switching on an unexercised role-granting RPC
   is not a friction fix. Needs an owner decision.

2. **A converted account is still called `Anonymous5472`.** Someone creates an
   account and keeps the placeholder name. Deliberately *not* fixed by deriving
   a name from the email local part: `public_profiles` is public, so
   `john.smith@gmail.com` → "john.smith" on a leaderboard is a privacy leak
   introduced in the name of polish. The right vehicle already exists — the
   Academy registration adoption path (HI1-C5B). Recommendation: an optional,
   dismissible "pick a name" prompt *after* signup, never a field on the form.

3. **Adoption ordering can strand a chosen Academy name.**
   `isPlaceholderDisplayName` treats `Anonymous<n>` as a placeholder only while
   `is_anonymous === true`. If conversion lands before the identity bridge
   adopts the registration, the visitor's chosen username is never written and
   they keep the placeholder forever. Narrow race; belongs to HI1-C5's owner.

4. **`/auth` shows a signup form to an already-signed-in permanent account.**
   Harmless, mildly confusing. Pre-existing.

5. **Guest → existing account does not merge.** Now *disclosed* (below) rather
   than silent. No merge system was invented: the brief says not to unless
   necessary, and merging two XP/streak/history sets has no obviously correct
   answer.

6. **`purge-anonymous-users` trusts the profile flag, not auth.** The self-repair
   added here closes the window from the client side. The durable fix is for the
   function to check `auth.users.is_anonymous` too. Server-side, out of scope.

---

## D. Data-risk review

| Data | Keyed to | Risk during auth transitions | Protection |
|------|----------|------------------------------|------------|
| profile row (XP, diamonds, streak, prefs, tutorial stamp, rank) | `profiles.user_id` = auth uid | Lost if conversion mints a new uid | Conversion never changes the uid; `signUp()`-while-anonymous is never called and there is a test asserting it |
| quiz / Ranked / swipe history, matches, leagues, friendships, notifications | same auth uid | same | same — nothing is copied, so nothing can be lost in copying |
| everything above, for a guest who signs in to another account | anonymous uid | **Stranded** (not deleted). Was silently stranded *and* the guest session was destroyed on a failed attempt | Failed attempts no longer end the guest session; the outcome is disclosed before the user commits |
| a permanent account whose profile flag never synced | `profiles.is_anonymous` | **Hard-deleted** by the admin purge (cascades) | retry in `syncProfilePermanent`; conversion no longer aborts on it; `ensureProfilePermanent` reconciles on every load |
| the password | — | never persisted: not in the pending record, not in storage, not in a redirect URL | unchanged from AUTH1; asserted by test |
| local gate/nudge counters | localStorage | reset on signup by design | `resetGateState()` |

---

## E. Tests

```
npx vitest run          # full suite
npx tsc --noEmit -p tsconfig.app.json
```

| | Baseline (`ad603131`) | After |
|---|---|---|
| Test files | **10 failed** / 430 passed | **9 failed** / 432 passed |
| Tests | **58 failed** / 6313 passed | **57 failed** / 6338 passed |
| `tsc` errors | 2 (`admin-users.test.ts`) | 2 (same) |

Failing-file set after is a **strict subset** of baseline — no new failures.
`src/lib/welcome/academy-sign-in-return.test.ts` was **fixed**: it asserted the
pre-AUTH1 source shape `safeReturnPath(searchParams.get("returnTo")` while
`/auth` now calls `resolveReturnTo`. Behaviour was never broken; the assertion
had not followed the refactor.

The other 9 failing files are pre-existing and unrelated (localStorage-stub
opt-in and cross-file pollution — see `mogsy-vitest-cross-file-pollution-baseline`).

**New coverage**

- `src/lib/auth/auth-errors.test.ts` — every input is a **verbatim** live error
  shape; asserts the anonymous-password sentence can never reach a user, that
  both duplicate-email shapes map to one outcome, and that codes beat prose.
- `src/lib/auth/account-upgrade.test.ts` — email+password in one call; **no
  password-only update is ever sent**; the narrow fallback fires only for its
  own error; a profile-flag failure does not fail the conversion.
- `src/pages/Auth.authFlow.test.tsx` — existing email switches to Sign In and
  keeps email + destination; a guest is **not** signed out before sign-in;
  the guest notice; the reveal toggle; two fields only; autocomplete attributes.

---

## F. Manual verification (live Supabase, `localhost:5501`)

| Starting state | Action | Result |
|---|---|---|
| Fresh anonymous guest | Create account (`mogzy1`, 6 chars, no symbols) | **Immediate success.** No verification wall, no error |
| Guest with a profile row | Create account | **uid preserved** `b9122fc1…`; same profile row `d0c6c62c…`; `is_anonymous:false`; `identities:["email"]`; no pending record |
| Guest at `?returnTo=/quiz/ranked` | Create account | Returned to `/quiz/ranked`, which forwards to `/quiz` with the match record open — **PLAY1's own design**, not an auth redirect |
| Guest | Signup with an email that already exists | *"That email already has an account."* + inline **Sign in**. Guest session intact, uid unchanged |
| Guest | Sign in, **wrong** password | *"Wrong email or password. Check them and try again."* — **guest session survives**, uid unchanged. (This is the P1 regression test) |
| Guest | Sign in, correct password | Clean switch to the real account, landed on `returnTo` (`/quiz`) |
| — | Guest-progress disclosure | Notice renders above the sign-in form with a "Create an account instead" escape |
| Mobile 375×812 | Signup | Fits without scrolling; reveal toggle reachable; no horizontal overflow |

No unhandled console errors. The 400/422 responses observed are the two
failures deliberately provoked above.

**Test accounts created during this audit** (all `@example.com`, unreachable —
purge at leisure): `auth2-probe-1787378293801-1..7`,
`auth2-probe2-1787378432771-1`, `auth2-playtest-a`, plus ~8 anonymous users.

---

## G. Files changed

| File | Purpose |
|---|---|
| `src/lib/auth/auth-errors.ts` | **new** — the one Supabase→user error mapper; codes first, generic default, raw text logged not shown |
| `src/lib/auth/auth-errors.test.ts` | **new** — pins the mapper against verbatim live error shapes |
| `src/components/auth/PasswordField.tsx` | **new** — one password input with a reveal toggle; carries the written reason the confirm field went |
| `src/lib/auth/account-upgrade.ts` | P0 fix: email+password in one call; non-blocking profile sync; `ensureProfilePermanent`; errors via the shared mapper |
| `src/lib/auth/account-upgrade.test.ts` | Pins the new call shape and the no-password-only-update invariant |
| `src/hooks/useAuth.tsx` | Self-repair on load; retry guard finishes a half-done conversion instead of refusing |
| `src/pages/Auth.tsx` | No pre-emptive `signOut`; mapped errors; existing email → Sign In keeping email+returnTo; single password field; guest disclosure; dead branches removed |
| `src/pages/Auth.authFlow.test.tsx` | Updated for the removed field; new AUTH2 suites |
| `src/components/auth/AccountUpgradePanel.tsx` | Confirm field → reveal toggle |
| `src/components/combat-battles/PredictionPanel.tsx` | Bare `/auth` link → `authHref` with the destination |
| `src/lib/welcome/academy-sign-in-return.test.ts` | Assertion follows AUTH1's `resolveReturnTo` refactor (fixes a baseline failure) |
| `docs/AUTH2_AUDIT.md` | This document |
