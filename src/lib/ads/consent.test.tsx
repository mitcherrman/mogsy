import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import {
  connectCmpAdapter,
  getConsentState,
  resetConsentForTests,
  setConsentStateFromCmp,
  subscribeConsent,
  useConsentState,
  type CmpAdapter,
} from "./consent";

afterEach(() => resetConsentForTests());

describe("consent store", () => {
  it("defaults to unknown (safe default, no persistence)", () => {
    expect(getConsentState()).toBe("unknown");
    expect(localStorage.getItem("consent")).toBeNull();
  });

  it("notifies subscribers on every transition", () => {
    const seen: string[] = [];
    const unsub = subscribeConsent(() => seen.push(getConsentState()));
    setConsentStateFromCmp("granted");
    setConsentStateFromCmp("granted"); // no-op, no duplicate notification
    setConsentStateFromCmp("denied");
    setConsentStateFromCmp("unknown");
    unsub();
    setConsentStateFromCmp("granted");
    expect(seen).toEqual(["granted", "denied", "unknown"]);
  });

  it("ignores invalid values", () => {
    setConsentStateFromCmp("yes-please" as never);
    expect(getConsentState()).toBe("unknown");
  });

  it("react hook re-renders through grant, denial, and withdrawal", () => {
    const { result } = renderHook(() => useConsentState());
    expect(result.current).toBe("unknown");
    act(() => setConsentStateFromCmp("granted"));
    expect(result.current).toBe("granted");
    act(() => setConsentStateFromCmp("denied")); // withdrawal
    expect(result.current).toBe("denied");
  });

  it("resetConsentForTests restores the safe default", () => {
    setConsentStateFromCmp("granted");
    resetConsentForTests();
    expect(getConsentState()).toBe("unknown");
  });

  it("connectCmpAdapter wires a trusted adapter and supports cleanup", () => {
    let push: ((s: "granted" | "denied" | "unknown") => void) | null = null;
    const stop = vi.fn();
    const adapter: CmpAdapter = {
      start(onChange) {
        push = onChange;
        return stop;
      },
    };
    const disconnect = connectCmpAdapter(adapter);
    push!("granted");
    expect(getConsentState()).toBe("granted");
    disconnect();
    expect(stop).toHaveBeenCalledTimes(1);
  });
});
