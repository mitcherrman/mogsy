/**
 * HISTORY-D — `useMatchReviews` lifecycle.
 *
 * The loader's contract is "every requested match eventually settles": ready,
 * or unavailable. The bug these tests pin is the one where it did not — a
 * change to the requested id set (or React StrictMode's mount/unmount/mount)
 * aborted the in-flight reads while the ids stayed CLAIMED, so they were never
 * asked for again and their rows sat on placeholder marks forever.
 *
 * `getMatchReview` is replaced by a hand-driven fake: every call records its
 * id and signal and hangs until the test resolves or rejects it, so each case
 * controls exactly which read lands when.
 */
import { StrictMode, type ReactNode } from "react";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MatchReviewView } from "@/lib/ranked-public/contracts";

interface Call {
  id: string;
  signal: AbortSignal | undefined;
  resolve: (review: MatchReviewView) => void;
  reject: (error: unknown) => void;
}

const calls: Call[] = [];

vi.mock("@/lib/ranked-public/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ranked-public/client")>();
  return {
    ...actual,
    getMatchReview: (id: string, signal?: AbortSignal) =>
      new Promise<MatchReviewView>((resolve, reject) => {
        calls.push({ id, signal, resolve, reject });
        signal?.addEventListener("abort", () =>
          reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
        );
      }),
  };
});

import { useMatchReviews } from "@/components/quiz/workspace/useMatchReviews";

const review = (id: string) => ({ matchId: id, rounds: [] }) as unknown as MatchReviewView;

/** Calls still waiting on an answer (not aborted, not already settled). */
const live = () => calls.filter((c) => !c.signal?.aborted && !(c as { done?: boolean }).done);

async function settle(id: string, outcome: "ok" | "fail" = "ok") {
  const call = live().find((c) => c.id === id);
  if (!call) throw new Error(`no live request for ${id}`);
  (call as { done?: boolean }).done = true;
  await act(async () => {
    if (outcome === "ok") call.resolve(review(id));
    else call.reject(new Error("503"));
  });
}

function mount(initial: string[], wrapper?: (p: { children: ReactNode }) => JSX.Element) {
  return renderHook(({ ids }: { ids: string[] }) => useMatchReviews(ids), {
    initialProps: { ids: initial },
    wrapper,
  });
}

const status = (store: ReturnType<typeof useMatchReviews>, id: string) => store.get(id)?.status;

beforeEach(() => {
  calls.length = 0;
});

describe("useMatchReviews", () => {
  it("fetches in display order, two at a time, and settles every id", async () => {
    const { result } = mount(["a", "b", "c"]);
    expect(calls.map((c) => c.id)).toEqual(["a", "b"]);
    expect(status(result.current, "c")).toBe("pending");

    await settle("a");
    expect(calls.map((c) => c.id)).toEqual(["a", "b", "c"]);
    expect(result.current.get("a")).toEqual({ status: "ready", review: review("a") });

    await settle("b");
    await settle("c");
    expect(["a", "b", "c"].map((id) => status(result.current, id))).toEqual(["ready", "ready", "ready"]);
  });

  it("never exceeds the concurrency limit while the id set churns", async () => {
    const { rerender } = mount(["a", "b", "c", "d"]);
    expect(live()).toHaveLength(2);
    rerender({ ids: ["c", "a", "e", "b", "d"] });
    expect(live()).toHaveLength(2);
    rerender({ ids: ["e", "f"] });
    expect(live()).toHaveLength(2);
    expect(live().map((c) => c.id).sort()).toEqual(["e", "f"]);
  });

  it("aborts an id removed while in flight and leaves no stale state for it", async () => {
    const { result, rerender } = mount(["a", "b"]);
    const a = calls.find((c) => c.id === "a")!;
    rerender({ ids: ["b"] });
    expect(a.signal?.aborted).toBe(true);
    expect(result.current.get("a")).toBeUndefined();

    // A late answer to the removed read must not write anything.
    await act(async () => a.resolve(review("a")));
    expect(result.current.get("a")).toBeUndefined();
  });

  it("re-fetches an aborted id when it is requested again (the stranded-placeholder bug)", async () => {
    const { result, rerender } = mount(["a"]);
    rerender({ ids: [] });
    rerender({ ids: ["a"] });

    expect(status(result.current, "a")).toBe("pending");
    expect(live().map((c) => c.id)).toEqual(["a"]);
    await settle("a");
    expect(status(result.current, "a")).toBe("ready");
  });

  it("keeps still-requested reads alive when the list grows, without duplicate requests", async () => {
    const { result, rerender } = mount(["a", "b", "c"]);
    rerender({ ids: ["a", "b", "c", "d"] });

    // a and b were not cancelled and not re-issued.
    expect(calls.map((c) => c.id)).toEqual(["a", "b"]);
    expect(calls.every((c) => !c.signal?.aborted)).toBe(true);

    await settle("a");
    await settle("b");
    await settle("c");
    await settle("d");
    expect(["a", "b", "c", "d"].map((id) => status(result.current, id))).toEqual([
      "ready", "ready", "ready", "ready",
    ]);
    expect(calls.map((c) => c.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("settles every id under StrictMode's mount/unmount/mount", async () => {
    const { result } = mount(["a", "b"], ({ children }) => <StrictMode>{children}</StrictMode>);
    expect(live().map((c) => c.id)).toEqual(["a", "b"]);
    await settle("a");
    await settle("b");
    expect(status(result.current, "a")).toBe("ready");
    expect(status(result.current, "b")).toBe("ready");
  });

  it("reuses a loaded review without refetching when the id comes back", async () => {
    const { result, rerender } = mount(["a"]);
    await settle("a");
    rerender({ ids: [] });
    rerender({ ids: ["a"] });
    expect(calls).toHaveLength(1);
    expect(status(result.current, "a")).toBe("ready");
  });

  it("marks a failed read unavailable and does not retry it (best-effort contract)", async () => {
    const { result, rerender } = mount(["a"]);
    await settle("a", "fail");
    expect(result.current.get("a")).toEqual({ status: "unavailable" });
    rerender({ ids: [] });
    rerender({ ids: ["a"] });
    expect(calls).toHaveLength(1);
    expect(status(result.current, "a")).toBe("unavailable");
  });

  it("aborts everything on unmount and ignores late answers", async () => {
    const { result, unmount } = mount(["a", "b", "c"]);
    const inFlight = [...calls];
    const before = result.current;
    unmount();
    expect(inFlight.every((c) => c.signal?.aborted)).toBe(true);
    await act(async () => inFlight.forEach((c) => c.resolve(review(c.id))));
    // No queued id was started after unmount.
    expect(calls).toHaveLength(2);
    expect(before.get("a")?.status).toBe("pending");
  });

  it("issues no reads for an empty id set (the frozen-preview path)", () => {
    const { result } = mount([]);
    expect(calls).toHaveLength(0);
    expect(result.current.get("a")).toBeUndefined();
  });
});
