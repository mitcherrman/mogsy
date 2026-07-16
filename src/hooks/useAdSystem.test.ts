import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useAdSystem } from "./useAdSystem";

type SettingsResult = { data: unknown; error: unknown };

const mocks = vi.hoisted(() => ({
  settingsResult: { data: null, error: null } as SettingsResult,
  creativesResult: { data: [] as unknown[] },
  /** When set, the settings promise never resolves (loading state). */
  settingsPending: false,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      if (table === "app_settings") {
        const single = () =>
          mocks.settingsPending
            ? new Promise(() => {})
            : Promise.resolve(mocks.settingsResult);
        return { select: () => ({ eq: () => ({ single }) }) };
      }
      // ad_creatives: .select().eq().eq() → thenable
      const thenable = {
        eq: () => thenable,
        then: (cb: (r: { data: unknown[] }) => void) =>
          Promise.resolve(mocks.creativesResult).then(cb),
      };
      return { select: () => thenable };
    },
  },
}));

describe("useAdSystem fail-closed remote configuration", () => {
  beforeEach(() => {
    mocks.settingsResult = { data: null, error: null };
    mocks.creativesResult = { data: [] };
    mocks.settingsPending = false;
  });

  it("is disabled while settings are loading", () => {
    mocks.settingsPending = true;
    const { result } = renderHook(() => useAdSystem("swipe"));
    expect(result.current.adMode).toBe("off");
    expect(result.current.shouldShowAd(10, false)).toBe(false);
  });

  it("stays disabled when the settings row is missing", async () => {
    mocks.settingsResult = { data: null, error: { code: "PGRST116" } };
    const { result } = renderHook(() => useAdSystem("swipe"));
    await waitFor(() => expect(result.current.adMode).toBe("off"));
    expect(result.current.shouldShowAd(10, false)).toBe(false);
  });

  it("stays disabled when the settings query fails", async () => {
    mocks.settingsResult = { data: null, error: new Error("network") };
    const { result } = renderHook(() => useAdSystem("swipe"));
    await waitFor(() => expect(result.current.adMode).toBe("off"));
  });

  it("stays disabled when the settings value is malformed", async () => {
    mocks.settingsResult = { data: { key: "global_ads_enabled", value: "yes" }, error: null };
    const { result } = renderHook(() => useAdSystem("swipe"));
    await waitFor(() => expect(result.current.adMode).toBe("off"));
  });

  it("stays disabled when enabled flags are absent (no implicit default-on)", async () => {
    mocks.settingsResult = { data: { key: "global_ads_enabled", value: {} }, error: null };
    const { result } = renderHook(() => useAdSystem("swipe"));
    await waitFor(() => expect(result.current.adMode).toBe("off"));
  });

  it("explicit valid configuration preserves legacy mode/frequency/source", async () => {
    mocks.settingsResult = {
      data: {
        key: "global_ads_enabled",
        value: {
          global_enabled: true,
          adsense_client_id: "ca-pub-9823769047605421",
          placements: {
            swipe: {
              enabled: true,
              ad_mode: "both",
              ad_source: "hybrid",
              frequency: 25,
              adsense_slot: "1234567890",
            },
          },
        },
      },
      error: null,
    };
    const { result } = renderHook(() => useAdSystem("swipe"));
    await waitFor(() => expect(result.current.adMode).toBe("both"));
    expect(result.current.adSource).toBe("hybrid");
    expect(result.current.frequency).toBe(25);
    expect(result.current.adsenseSlot).toBe("1234567890");
    expect(result.current.adsenseClientId).toBe("ca-pub-9823769047605421");
    // Frequency logic unchanged: fires only on exact multiples, never for Pro.
    expect(result.current.shouldShowAd(24, false)).toBe(false);
    expect(result.current.shouldShowAd(25, false)).not.toBe(false);
    expect(result.current.shouldShowAd(25, true)).toBe(false);
  });

  it("per-placement disabled stays off even when globally enabled", async () => {
    mocks.settingsResult = {
      data: {
        key: "global_ads_enabled",
        value: {
          global_enabled: true,
          placements: { swipe: { enabled: false, ad_mode: "popup", frequency: 10 } },
        },
      },
      error: null,
    };
    const { result } = renderHook(() => useAdSystem("swipe"));
    // Effect settles; mode must remain off.
    await waitFor(() => expect(result.current.frequency).toBe(10));
    expect(result.current.adMode).toBe("off");
  });
});
