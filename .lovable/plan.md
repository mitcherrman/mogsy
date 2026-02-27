

## Analysis

The network requests confirm the problem: every Navbar sub-component (NavBanner, UserNotificationBell, diamond fetch) fires its requests **twice** -- once at :42 and again at :45. Here's the sequence causing the flash:

```text
Time 0: Auth loading=true → Layout shows blank div
Time 1: Auth resolves (loading=false) → Layout renders Navbar immediately
         BUT ProtectedRoute is still loading app_settings
         → User sees: Navbar + empty page body (THE FLASH)
Time 2: App settings load, anonymous sign-in triggers, user state changes
         → Navbar unmounts & remounts (all fetches fire AGAIN)
Time 3: Everything settles → full app visible
```

The root cause: **Layout gates on auth only, but ProtectedRoute gates on auth + settings + anonymous sign-in.** So the Navbar appears before the page content is ready, and then re-mounts when auth state changes.

## Plan

### 1. Gate the entire Layout behind app settings (Layout.tsx)

Add `useAppSettings` to Layout so it shows nothing (not even the Navbar) until both auth AND settings are resolved. This eliminates the "navbar alone" flash.

**File: `src/components/Layout.tsx`**
- Import `useAppSettings`
- Add `const { loading: settingsLoading } = useAppSettings();`
- Change the loading gate from `if (loading)` to `if (loading || settingsLoading)`

### 2. Move anonymous sign-in into AuthProvider (useAuth.tsx)

Currently ProtectedRoute handles anonymous sign-in, which changes the `user` state after Layout has already rendered the Navbar. Moving this into AuthProvider means the auth `loading` state won't resolve until the anonymous session is ready, preventing the double-mount.

**File: `src/hooks/useAuth.tsx`**
- Import `useAppSettings` or fetch `require_auth` setting directly inside the provider
- When auth resolves with no user AND require_auth is false, trigger `signInAnonymously()` before setting `loading=false`
- This ensures `loading` stays true until the user (anonymous or real) is fully established

**File: `src/components/ProtectedRoute.tsx`**
- Remove the anonymous sign-in logic (already handled by AuthProvider)
- Simplify to just check auth + settings loading gates and redirect if needed

### 3. Add fade-in to the full Layout wrapper (Layout.tsx)

Apply `animate-page-fade-in` to the root Layout div instead of just `<main>`, so the Navbar and content appear together smoothly.

**File: `src/components/Layout.tsx`**
- Move `animate-page-fade-in` from the `<main>` tag to the root `<div>`

## Summary of changes

| File | Change |
|------|--------|
| `Layout.tsx` | Add settings loading gate; move fade-in to root div |
| `useAuth.tsx` | Handle anonymous sign-in before resolving `loading` |
| `ProtectedRoute.tsx` | Remove anonymous sign-in logic |

