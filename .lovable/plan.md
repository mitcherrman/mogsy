

## Enhanced Onboarding Flow

### Current Flow
`welcome` → `pick categories` → `choose theme` → done

### New Flow
`welcome` → `profile setup` → `pick categories` → `choose theme` → done

The new **"profile setup"** step sits between welcome and categories. It contains three optional fields:

1. **Username** — text input, saves to `profiles.display_name`
2. **Photo upload** — single photo upload tile using existing profile-photos bucket, saves to `profile_photos` table and sets `profiles.avatar_url`
3. **Email + password** — for anonymous users, links their account via `linkAnonymousAccount` (already in useAuth). For non-anonymous users, this section is hidden.

All fields are **optional** — a "Skip for now" link always visible. A subtle banner reminds: "Sign up to save your progress and unlock full features."

### Additional Onboarding Features Worth Adding
- **Age input** — already validated by the existing `auto_flag_underage` trigger; useful to collect early
- **Location** — city autocomplete (existing cities-data.ts); helps with local leaderboards

These two fields can sit alongside username on the same profile setup step without bloating it.

### Files Changed

| File | Action |
|------|--------|
| `src/components/OnboardingFlow.tsx` | Add "profile" step with username, photo, email/password, age, location fields. Wire up photo upload to storage bucket, profile update, and account linking. |

### Implementation Details

- **Step type** expands: `"welcome" | "profile" | "pick" | "theme"`
- **Photo upload**: reuse existing `profile-photos` bucket logic — upload file, get public URL, insert into `profile_photos`, update `profiles.avatar_url`
- **Account linking**: for anonymous users, show email + password fields. On submit, call `linkAnonymousAccount(email, password)` from useAuth. Show success/error inline.
- **Username**: simple Input with profanity filter (existing `profanity-filter.ts`)
- **Age**: numeric input, min 13
- **Location**: text input with autocomplete from `cities-data.ts`
- **All optional**: continue button always enabled on profile step. Each filled field saves immediately or batched on "Continue".
- **Progress dots**: add a step indicator (4 dots) at bottom of each screen so users know where they are

No database changes needed — all fields already exist on the profiles table.

