# AUTH1 — Signup / Sign-in Friction, Routing, and Account UI

Audit of the auth system as it stood on `origin/main` (`9f01af0e`), and what
AUTH1 changed.

---

## A. Audit findings

### A1. Password rules — what was ACTUALLY required

Four surfaces could establish a new password. Each carried its own inline
check, and **they disagreed**:

| Surface | File | Rule before AUTH1 |
| --- | --- | --- |
| Signup | `src/pages/Auth.tsx` | `password.length < 6` + confirm match |
| Password reset | `src/pages/ResetPassword.tsx` | `password.length < 6` + confirm match |
| Guest conversion | `src/pages/AuthCallback.tsx` | `password.length < 6` + confirm match |
| **Change password** | **`src/pages/Settings.tsx`** | **`newPassword.length < 8`** |

Findings:

1. **There was no composition rule anywhere in the frontend.** No symbol,
   uppercase, lowercase, or digit requirement; no strength meter; no scoring
   library. A repo-wide search for character-class checks against password
   fields (`[A-Z]`, `[0-9]`, `zxcvbn`, `strength`, `complex`) returned nothing.
2. **The layer enforcing each rule was the component itself** — an inline `if`
   inside each submit handler, plus a `minLength` attribute on the input. There
   was no shared schema, no helper, and no server-side frontend validation.
3. **The surfaces disagreed.** Settings demanded 8. A password created at
   signup (6 or 7 characters) was rejected when the same user later tried to
   change it — the one genuine "this is harder than we want" defect in the
   frontend.

So the perceived difficulty was **not** coming from frontend composition rules,
because there weren't any. It comes from two places:

- the Settings/signup disagreement above (fixed here), and
- **Supabase project Auth settings**, which are not represented in this repo
  (`supabase/config.toml` carries only `project_id` and per-function
  `verify_jwt` flags). Supabase enforces its own minimum length and an optional
  "required characters" set server-side. See §H.

### A2. Verification architecture

No route guard, hook, or product gate read `email_confirmed_at` anywhere. The
only reads are in `AdminUsers.tsx`, for display in the admin console.

Verification blocked users **structurally**, not through a gate:

1. **Signup dead end** — `Auth.tsx` called `signUp()` and then unconditionally
   set `mode = "confirm-sent"`, rendering a "Confirm your email" screen whose
   only exits were "Resend" and "Back to sign in". `useAuth.signUp` discarded
   Supabase's `data`, so the code could not tell whether a session had come
   back. Even with confirmations disabled the user was parked on that screen.
2. **Guest conversion required leaving the site** — the biggest one. The
   email-first flow (`account-upgrade.ts` → `useAccountUpgrade` →
   `AccountUpgradePanel`) collected **email only**, called
   `updateUser({ email })`, and showed "Check your email to finish creating
   your account". The password was deliberately deferred to `/auth/callback`,
   reachable only by clicking the emailed link. A guest literally could not
   finish creating an account in one sitting.
3. **`/auth/callback` assumed the confirmation round-trip had happened** —
   `isConvertedPermanentUser()` had to be true or the page rendered an error.

### A3. Signup / sign-in routing architecture

`Auth.tsx` reads `?returnTo`, validates it with `safeReturnPath()`
(`src/lib/auth/safe-return.ts` — a correct open-redirect guard: rejects
absolute, protocol-relative, backslash and control-character targets), and
falls back to `LEAGUE_HOME_ROUTE` = `/lol`.

**That fallback is why the weird redirects happened.** The Auth page was doing
exactly what it was asked; the *senders* never asked for anything. These
navigated to a bare `/auth` with no `returnTo` at all:

| Sender | File | Effect |
| --- | --- | --- |
| **Ranked account gate** | `pages/quiz-ranked/QuizRankedPage.tsx:101` | **Ranked → auth → League hub. The reported bug.** |
| **Every protected route** | `components/ProtectedRoute.tsx:16` | Any deep link (invite, room, profile) → hub |
| Quiz history card | `components/quiz/QuizRecentResultsCard.tsx:80` | → hub |
| Arena score card | `components/combat-battles/ArenaScoreCard.tsx:20` | → hub |
| Admin gate (×3) | `components/admin/AdminAuthGate.tsx` | Operator → public hub |
| Admin pages (×7) | `pages/Admin*.tsx`, `Moderator.tsx`, `admin/AdminBlog.tsx` | → hub |
| Premium checkout | `pages/LolPremium.tsx` | → hub |
| Invite / custom link | `pages/CustomLink.tsx:145` | → hub |

A second, subtler override: `computePostConversionDestination()` returned the
**tutorial route whenever the tutorial was owed**, unconditionally outranking
`returnTo`. So even a correctly-preserved destination could be discarded after
a guest conversion.

Surfaces that already did it right — `QuizSignUpGate`, `QuizSignUpNudge`,
`PredictionPanel`, `Profile`, `Settings`, and `lib/hud/identity.ts` — proved
the pattern existed; it just wasn't applied consistently or centrally.

### A4. Notification / profile badge architecture

`components/hud/MogzyIdentityMenu.tsx` renders one compound control: a portrait
linking to `/profile`, a divider, and a chevron opening the notifications
panel. The unread badge (`badgeCount` = unread notifications + admin
notifications + live Stat Check invites) was rendered **inside the portrait
link**, welded to the mascot's shoulder. It was already decorative
(`aria-hidden`, `pointer-events-none`, absolutely positioned) with the count
spoken through the chevron's accessible name.

Sign-out did not exist in this menu at all — the only sign-out in the product
was on `/settings` (plus one in `AdminAuthGate`).

### A5. Signup CTA architecture

`components/hud/GlobalHud.tsx` renders a guest chip inside the top-right
cluster: a pill reading `Save progress ·` (hidden below `lg`) + `Sign up`, with
`aria-label="Sign up free — save your progress"`. It links through
`signupHrefFor(pathname)`, which already preserved `returnTo` correctly.

---

## B. Changes made

### Password (§2)

- **New** `src/lib/auth/password-policy.ts` — the one policy.
  `PASSWORD_MIN_LENGTH = 6`, `validateNewPassword(password, confirm?)`, and a
  **passive** `describePasswordStrength()` that never participates in
  validation. No composition rule, no strength threshold.
- All five surfaces now call it: signup, reset, callback, Settings, and the
  onboarding profile step. **Settings' 8-character outlier is gone.**
- Input `minLength` attributes and the helper copy are driven from the constant.

### Verification (§3) — non-blocking, infrastructure retained

- `useAuth.signUp` now returns `{ error, session }`. `Auth.tsx` routes the user
  onward the moment a session exists; the confirm-sent screen is retained for
  the branch where Supabase genuinely withholds one — and now offers a
  **"Continue to Mogzy"** button rather than only "Back to sign in".
- **Guest conversion is one step.** `initiateAnonymousEmailUpgrade` now takes a
  password and runs *password first, then email*, then re-reads the
  authoritative user. If the account is already permanent it syncs the profile
  and reports `converted: true`, and `AccountUpgradePanel` navigates straight
  back to the destination. If a confirmation is required it falls back to the
  existing pending flow.
- The pending record gained `passwordSet`, so `/auth/callback` **skips its
  password step** for AUTH1 records. Legacy pre-AUTH1 records (no flag) still
  get the password screen, so records already in real browsers keep working.
- Nothing verification-related was deleted: the pending record, resend,
  callback, confirmation screens and `isConvertedPermanentUser` all remain.

### Routing (§4/§5)

- **New** `src/lib/auth/auth-destination.ts` — `resolveReturnTo()` (adds an
  `explicit` flag), `resolvePostAuthDestination()` (the precedence), and
  `authHref()` (the one sender-side builder).
- Every returnTo-less sender in §A3 fixed, including `ProtectedRoute` (now
  carries `pathname + search + hash`) and the Ranked gate.
- `computePostConversionDestination` now takes a `ResolvedReturnTo`: an
  explicit destination outranks the owed tutorial. The tutorial still applies
  when nothing was preserved, and `RequireRankedTutorial` remains the single
  forced-onboarding authority.
- Post-auth navigation uses `{ replace: true }` so Back does not return to a
  completed auth form.
- Password reset now round-trips a `returnTo` through the email link.

### Header CTA (§6)

- The chip is now just `Sign up`, uppercase, fixed `h-7`, no responsive copy
  swap, `aria-label="Sign up"`.
- Styling moved to `.hud-signup-chip` in `index.css`: a brass tint and a
  3.6s glow that breathes. **Only `box-shadow` and `color` animate**, so the
  chip cannot shift the cluster. Hover/focus take over the glow entirely.
  `prefers-reduced-motion` drops the animation and holds a steady glow.

### Notifications / account actions (§7–§9)

- The unread badge moved from the portrait to the **notifications trigger**.
  It stays decorative; the count is still spoken through the trigger's name.
- The panel gained a **separate bordered section** at the very bottom with
  exactly one action: `Sign Out` for an account, `Sign In` for a guest.
- Sign Out clears the query cache **before** ending the session, closes the
  menu, and navigates to `/` with `replace`. Guarded against double activation.
- **New** `src/lib/query-client.ts` — the shared `QueryClient`, extracted from
  `App.tsx` so sign-out can clear the cache without `useQueryClient()`, which
  throws when no provider is above it and would have made the global HUD
  unmountable in every existing HUD test.

---

## C. Resulting routing precedence

1. **Explicit safe `returnTo`** — beats everything, including onboarding.
2. **Contextual continuation** — carried in the same `returnTo`; query and hash
   are preserved, so a room code or invite id survives.
3. **Mandatory account requirement** — none today. Verification is explicitly
   not one; the forced tutorial is enforced by the destination's route guard.
4. **Default hub** — only when nothing meaningful was preserved.

An **unsafe** `returnTo` is not merely rejected — it is also not `explicit`, so
it can never buy precedence over onboarding.

| Path | Result |
| --- | --- |
| `/quiz/ranked` → signup → | `/quiz/ranked` |
| `/quiz/ranked` → signin → | `/quiz/ranked` |
| `/profile` (protected) → auth → | `/profile` |
| `/quiz/stat-check/room/AB12?spectate=1` → auth → | same URL, query intact |
| `/auth?mode=signup` (no intent) → | `/lol` |
| `/auth?returnTo=//evil.com` → | `/lol` |
| guest conversion, tutorial owed, explicit `/quiz/ranked` → | `/quiz/ranked` |
| guest conversion, tutorial owed, no `returnTo` → | `/onboarding/ranked-tutorial` |
| any page → notification menu → Sign In → | back to that page |
| authenticated → Sign Out → | `/` |

---

## H. Remaining risks — what frontend code cannot change

**Supabase project Auth settings are not in this repository.**
`supabase/config.toml` contains only `project_id` and per-function `verify_jwt`
flags. The following must be set in the Supabase dashboard, and no change here
substitutes for them:

1. **Password policy** — Authentication → Providers → Email → *Minimum password
   length* and *Password Requirements*. If the project's minimum is above 6, or
   a required-characters set is enabled, signup still fails **server-side** with
   Supabase's own message, and the eased frontend policy will look broken.
   Set minimum length to **6** and required characters to **"No required
   characters"**.
2. **Email confirmation** — Authentication → Providers → Email → *Confirm
   email*. While this is ON, `signUp()` returns a null session and
   `signInWithPassword()` rejects an unconfirmed account with "Email not
   confirmed". The frontend handles both branches gracefully (§B) but **cannot
   bypass them**. To get the intended one-step signup, turn *Confirm email*
   **OFF**.
3. **Secure email change** — with this ON, attaching an email to an anonymous
   user requires confirmation, so guest conversion takes the retained pending
   branch rather than converting in place.

Everything in AUTH1 is written so that **both** configurations work: with
confirmation off the user never leaves the site; with it on, the retained
verification flow runs and the password is already set, so the round-trip asks
for nothing.
