## Broadcast Session Persistence Fix

Goal: make the active broadcast session durable. Studio remounts, refreshes, alt-tabs, and auth/layout rechecks must not wipe the active playlist or reset playback. Only explicit Stop / Clear Session does that.

### Ownership (fix first)
- `BroadcastEngine` becomes a module-level singleton in `src/lib/quiz-broadcast/engineSingleton.ts` (`getBroadcastEngine()`).
- `useBroadcastEngine` no longer creates or destroys the engine; it only subscribes + republishes snapshots over `BroadcastChannel`. `engine.destroy()` is removed from the React cleanup path entirely.
- Studio and Broadcast Window attach to the engine/session; neither owns it.

### ActiveBroadcastSession model (`src/lib/quiz-broadcast/session.ts`)
- Storage key `mogsy.quizBroadcast.activeSession.v1`.
- Shape (v1):
  - `schemaVersion: 1`, `sessionId`, `startedAt`, `updatedAt`
  - `playlistId`, `playlistName`, `questions: QuizQuestion[]` (inline for v1)
  - `currentIndex`, `phase`, `playing`, `questionsPlayed`, `repeatsCompleted`, `playedHistory`
  - Timing restore: `phaseStartedAt`, `phaseDurationMs`, `phaseEndsAt`, `lastTickAt`
  - `config` (timing + visuals + playback snapshot)
- Forward-compat: loader normalises on read. v2 will swap `questions` for `questionRefs: { id, snapshot? }[]` resolved against a shared question cache — UI does not change because it only ever sees the in-memory `ActiveBroadcastSession` returned by `loadActiveSession()`.
- Helpers: `loadActiveSession()`, `saveActiveSession()`, `clearActiveSession()`, `emptyActiveSession()`.

### Engine changes (`src/lib/quiz-broadcast/engine.ts`)
- Add `hydrateFromSession(session)`: rebuilds playlist + runtime state. If `playing===true`, compute `remaining = phaseEndsAt - now`. If `remaining > 0`, re-enter the same phase with a custom timeout for `remaining`. Otherwise advance to the next phase normally.
- `emit()` calls a debounced `persistSession()` writing the durable subset. Start/Stop/Pause/Resume/Clear write immediately.
- Expose `playlist` on `EngineSnapshot` so the Studio derives `items` from the engine instead of holding its own copy.
- New `clearSession()`: stops engine, clears playlist, calls `clearActiveSession()`, regenerates `sessionId`.

### Studio (`src/pages/admin/AdminQuizBroadcast.tsx`)
- On first render of the singleton: engine auto-hydrates from `loadActiveSession()` (done inside `engineSingleton.ts`, not in the React tree).
- Remove local `items` state + the `useEffect` that pushes `items` into the engine. `items` is now `snapshot.playlist` (engine is authority).
- Playlist mutations (add/move/remove/shuffle/clear) call engine methods, which persist.
- Loading a saved playlist still calls `engine.setPlaylist(...)` — that triggers persistence automatically.

### Broadcast Window (`src/pages/admin/QuizBroadcastView.tsx`, `src/lib/quiz-broadcast/channel.ts`)
- `createSubscriber` first restores from `LATEST_SNAPSHOT_KEY` (existing fast path). If that's missing, synthesize a minimal snapshot from `loadActiveSession()` so the popup re-renders the current question even after a cold start.
- Window remains passive — no engine.

### Temporary vs durable state
- Durable (session): playlist, currentIndex, phase, playing, questionsPlayed, repeatsCompleted, playedHistory, phase timing fields, config, sessionId, startedAt.
- Temporary (React state only): Question Browser filters, dev-tools event log scroll, last sync timestamps, saved-playlists cache (already persisted separately under `PLAYLISTS_KEY`), React Query pool cache.

### Reset / Stop / Clear semantics (ControlPanel)
- **Pause** — engine.pause(); session persists with `playing=false`. Resuming continues from the same phase/index.
- **Stop** — engine.stop(); session persists with `phase=idle`, `playing=false`, counters reset. Active playlist + config preserved.
- **Clear Session** (new, destructive, with confirm) — engine.clearSession(); wipes `ACTIVE_SESSION_KEY`, drops playlist, regenerates `sessionId`. Only path that loses the active playlist.

### Files touched
- Add: `src/lib/quiz-broadcast/session.ts`, `src/lib/quiz-broadcast/engineSingleton.ts`
- Modify: `src/lib/quiz-broadcast/engine.ts`, `src/lib/quiz-broadcast/useBroadcastEngine.ts`, `src/lib/quiz-broadcast/channel.ts`, `src/lib/quiz-broadcast/types.ts` (add `playlist` to `EngineSnapshot`), `src/pages/admin/AdminQuizBroadcast.tsx`, `src/pages/admin/QuizBroadcastView.tsx`, `src/components/quiz-broadcast/ControlPanel.tsx`

No backend changes, no new dependencies.
