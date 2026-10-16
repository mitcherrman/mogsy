import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { UNKNOWN_DAILY_STATUS, type DailyStatusView } from "./status";

const read = vi.fn<(signal?: AbortSignal) => Promise<DailyStatusView>>();
vi.mock("./status", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./status")>()),
  readDailyStatus: (signal?: AbortSignal) => read(signal),
}));

import { useDailyChallengeStatus } from "./useDailyChallengeStatus";

const resume: DailyStatusView = { ...UNKNOWN_DAILY_STATUS, known: true, resumable: true };
const done: DailyStatusView = { ...UNKNOWN_DAILY_STATUS, known: true, completed: true };

type Props = { enabled?: boolean; identity?: string | null };
const mountWith = (initial: Props) =>
  renderHook((p: Props) => useDailyChallengeStatus(p), { initialProps: initial });

beforeEach(() => { read.mockReset(); });

describe("useDailyChallengeStatus", () => {
  it("default (/quiz): reads once on mount with no options", async () => {
    read.mockResolvedValue(resume);
    const { result } = renderHook(() => useDailyChallengeStatus());
    expect(result.current).toBe(UNKNOWN_DAILY_STATUS);
    await waitFor(() => expect(result.current).toEqual(resume));
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("guest: unknown and no request at all", () => {
    const { result } = mountWith({ enabled: false, identity: null });
    expect(result.current).toBe(UNKNOWN_DAILY_STATUS);
    expect(read).not.toHaveBeenCalled();
  });

  it("guest -> signed in: reads once for that identity", async () => {
    read.mockResolvedValue(resume);
    const { result, rerender } = mountWith({ enabled: false, identity: null });
    expect(read).not.toHaveBeenCalled();
    rerender({ enabled: true, identity: "a" });
    expect(result.current).toBe(UNKNOWN_DAILY_STATUS);
    await waitFor(() => expect(result.current).toEqual(resume));
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("signed in -> guest: the held status is dropped in the same render, with no new request", async () => {
    read.mockResolvedValue(resume);
    const { result, rerender } = mountWith({ enabled: true, identity: "a" });
    await waitFor(() => expect(result.current).toEqual(resume));
    rerender({ enabled: false, identity: null });
    expect(result.current).toBe(UNKNOWN_DAILY_STATUS); // synchronous, not after an effect
    expect(read).toHaveBeenCalledTimes(1);
    // and signing back in as the same user re-reads rather than resurrecting it
    read.mockResolvedValue(done);
    rerender({ enabled: true, identity: "a" });
    expect(result.current).toBe(UNKNOWN_DAILY_STATUS);
    await waitFor(() => expect(result.current).toEqual(done));
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("account A -> account B without remounting: never shows A's status, reads again for B", async () => {
    read.mockResolvedValueOnce(resume);
    const { result, rerender } = mountWith({ enabled: true, identity: "a" });
    await waitFor(() => expect(result.current).toEqual(resume));

    let resolveB!: (v: DailyStatusView) => void;
    read.mockImplementationOnce(() => new Promise<DailyStatusView>((r) => { resolveB = r; }));
    rerender({ enabled: true, identity: "b" });
    expect(result.current).toBe(UNKNOWN_DAILY_STATUS); // not A's "resume", even before B answers
    expect(read).toHaveBeenCalledTimes(2);
    await act(async () => { resolveB(done); });
    expect(result.current).toEqual(done);
  });

  it("a late answer for the previous identity is discarded", async () => {
    let resolveA!: (v: DailyStatusView) => void;
    read.mockImplementationOnce((signal) => new Promise<DailyStatusView>((r) => {
      resolveA = r; signal?.addEventListener("abort", () => undefined);
    }));
    const { result, rerender } = mountWith({ enabled: true, identity: "a" });
    read.mockResolvedValueOnce(done);
    rerender({ enabled: true, identity: "b" });
    await waitFor(() => expect(result.current).toEqual(done));
    await act(async () => { resolveA(resume); });
    expect(result.current).toEqual(done);
  });
});
