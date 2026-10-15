/**
 * PA2B — owner playtest launchers for the admin-only Pro Play Assembly presets
 * (`admin.roster_lock`, `admin.draft_memory`). The server refuses both for any
 * non-admin account (`RANKED_PRESET_NOT_AUTHORIZED`); these buttons are a
 * convenience, never the gate.
 */
import { PresetLaunch, type HubLaunchProps } from "./PresetLaunch";

export const ROSTER_LOCK_PRESET = "admin.roster_lock";
export const DRAFT_MEMORY_PRESET = "admin.draft_memory";

export function RosterLockLaunch(hub: HubLaunchProps = {}) {
  return (
    <PresetLaunch
      {...hub}
      preset={ROSTER_LOCK_PRESET}
      testId="roster-lock-launch"
      buttonLabel="Play Roster Lock"
      failureMessage="Roster Lock could not be started. Try again shortly."
    >
      Seat three historical Worlds starting lineups by position in an unrated Ranked Bot playtest.
    </PresetLaunch>
  );
}

export function DraftMemoryLaunch(hub: HubLaunchProps = {}) {
  return (
    <PresetLaunch
      {...hub}
      preset={DRAFT_MEMORY_PRESET}
      testId="draft-memory-launch"
      buttonLabel="Play Draft Memory"
      failureMessage="Draft Memory could not be started. Try again shortly."
    >
      Seat three historical Worlds team compositions by position in an unrated Ranked Bot playtest.
    </PresetLaunch>
  );
}
