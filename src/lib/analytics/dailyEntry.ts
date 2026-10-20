/**
 * Which button actually opened the Daily Challenge.
 *
 * The Daily page is reachable from several doors, and "the visitor reached
 * /quiz/daily-challenge" does not say which one they used (a direct URL,
 * refresh, bookmark or the Back button reach it with no click at all). This is
 * the BROWSER-SIDE fact "this control was pressed", emitted at the control.
 * It is a click observation only: it never says a run started, which is the
 * server's `ranked_started` with host `daily_challenge`.
 *
 * Closed vocabulary on purpose: a new door must be added here, so an unknown
 * control cannot leak free text into the warehouse, and a reader of a timeline
 * can trust the label.
 */
import { track } from "@/lib/analytics";

export const DAILY_ENTRY_CLICKED = "daily_challenge_entry_clicked" as const;

/** Where the pressed control lives. `other` is a Daily door we have not named. */
export type DailyEntrySurface = "home_hub" | "leaguecraft" | "other";

export type DailyEntryControl =
  /** Academy Core (Home Hub) "Play / Resume Daily Challenge" link. */
  | "academy_core_daily_button"
  /** Leaguecraft PLAY seal, which opens Daily directly while Ranked is not open. */
  | "play_seal_ranked_closed"
  /** Daily Challenge clause on the Leaguecraft match-entry record. */
  | "play_scroll_daily_clause"
  /** "Continue optional stages" on the record for a main-complete Daily. */
  | "play_scroll_resume_optional"
  /** Daily panel in the Leaguecraft lobby's centre stage. */
  | "centre_stage_daily_panel";

export const DAILY_ENTRY_CONTROLS: Readonly<Record<DailyEntryControl, DailyEntrySurface>> = {
  academy_core_daily_button: "home_hub",
  play_seal_ranked_closed: "leaguecraft",
  play_scroll_daily_clause: "leaguecraft",
  play_scroll_resume_optional: "leaguecraft",
  centre_stage_daily_panel: "leaguecraft",
};

export function dailyEntryMetadata(control: DailyEntryControl): {
  entry_surface: DailyEntrySurface;
  control: DailyEntryControl;
} {
  return { entry_surface: DAILY_ENTRY_CONTROLS[control] ?? "other", control };
}

/** Fire-and-forget; never throws and never blocks the navigation it precedes. */
export function trackDailyEntry(control: DailyEntryControl): void {
  track(DAILY_ENTRY_CLICKED, { metadata: dailyEntryMetadata(control) });
}
