import { beforeEach, describe, expect, it, vi } from "vitest";

const track = vi.hoisted(() => vi.fn());
vi.mock("./track", () => ({ track }));

import { DAILY_ENTRY_CLICKED, DAILY_ENTRY_CONTROLS, dailyEntryMetadata, trackDailyEntry } from "./dailyEntry";
import { PRODUCT_EVENTS, isKnownEvent } from "./contract";

beforeEach(() => track.mockClear());

describe("Daily entry click event", () => {
  it("is a registered product event, not a macro funnel event", () => {
    expect(isKnownEvent(DAILY_ENTRY_CLICKED)).toBe(true);
    expect(PRODUCT_EVENTS).toContain(DAILY_ENTRY_CLICKED);
  });

  it("records the pressed control and its surface, bounded to two fields", () => {
    trackDailyEntry("academy_core_daily_button");
    expect(track).toHaveBeenCalledWith(DAILY_ENTRY_CLICKED, {
      metadata: { entry_surface: "home_hub", control: "academy_core_daily_button" },
    });
  });

  it("maps Home Hub to home_hub and every Leaguecraft door to leaguecraft", () => {
    expect(DAILY_ENTRY_CONTROLS.academy_core_daily_button).toBe("home_hub");
    for (const control of ["play_seal_ranked_closed", "play_scroll_daily_clause", "play_scroll_resume_optional", "centre_stage_daily_panel"] as const) {
      expect(dailyEntryMetadata(control).entry_surface).toBe("leaguecraft");
    }
  });
});
