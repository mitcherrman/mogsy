/**
 * useRankedTutorialStatus — anonymous completion path.
 *
 * Verifies that an anonymous user's completion stamps THEIR OWN profile row with
 * version 1 + a timestamp (first-write-wins), and that success is confirmed by an
 * authoritative re-read before the caller navigates.
 */
import { renderHook, waitFor, act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useRankedTutorialStatus } from "./useRankedTutorialStatus";
import { RANKED_TUTORIAL_VERSION } from "@/lib/ranked-tutorial/onboarding";

type Row = {
  is_anonymous: boolean | null;
  onboarding_completed: boolean | null;
  ranked_tutorial_completed_at: string | null;
  ranked_tutorial_version: number | null;
};

const mocks = vi.hoisted(() => ({
  user: { id: "anon-1", is_anonymous: true } as { id: string; is_anonymous: boolean } | null,
  authLoading: false,
  row: null as Row | null,
  readError: null as unknown,
  updateArg: null as Record<string, unknown> | null,
  updateCalls: 0,
  readCalls: 0,
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: mocks.user, loading: mocks.authLoading }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      // Read chain: .select(cols).eq("user_id", id).maybeSingle()
      select: () => ({
        eq: () => ({
          maybeSingle: () => {
            mocks.readCalls += 1;
            return Promise.resolve({ data: mocks.row, error: mocks.readError });
          },
        }),
      }),
      // Write chain: .update(payload).eq("user_id", id).is("ranked_tutorial_completed_at", null)
      update: (payload: Record<string, unknown>) => {
        mocks.updateCalls += 1;
        mocks.updateArg = payload;
        return {
          eq: () => ({
            is: () => {
              // Simulate the `.is(..., null)` guard: only apply when unstamped.
              if (mocks.row && mocks.row.ranked_tutorial_completed_at == null) {
                mocks.row = { ...mocks.row, ...(payload as Partial<Row>) };
              }
              return Promise.resolve({ error: null });
            },
          }),
        };
      },
    }),
  },
}));

beforeEach(() => {
  mocks.user = { id: "anon-1", is_anonymous: true };
  mocks.authLoading = false;
  mocks.readError = null;
  mocks.updateArg = null;
  mocks.updateCalls = 0;
  mocks.readCalls = 0;
  mocks.row = {
    is_anonymous: true,
    onboarding_completed: false,
    ranked_tutorial_completed_at: null,
    ranked_tutorial_version: null,
  };
});

describe("useRankedTutorialStatus — anonymous completion", () => {
  it("marks an anonymous incomplete profile as tutorial-required", async () => {
    const { result } = renderHook(() => useRankedTutorialStatus());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.completed).toBe(false);
    expect(result.current.required).toBe(true);
  });

  it("stamps version 1 + a timestamp to the same row and confirms via re-read", async () => {
    const { result } = renderHook(() => useRankedTutorialStatus());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let ok = false;
    await act(async () => {
      ok = await result.current.completeTutorial();
    });

    // Success is returned only after the authoritative re-read confirms a stamp.
    expect(ok).toBe(true);
    expect(mocks.updateCalls).toBe(1);
    expect(mocks.updateArg?.ranked_tutorial_version).toBe(RANKED_TUTORIAL_VERSION);
    expect(mocks.updateArg?.ranked_tutorial_version).toBe(1);
    expect(typeof mocks.updateArg?.ranked_tutorial_completed_at).toBe("string");
    // Only the two completion fields are ever written — no Training Match result
    // details (HP, XP, answers, abilities, charges, damage, duration) are saved.
    expect(Object.keys(mocks.updateArg ?? {}).sort()).toEqual([
      "ranked_tutorial_completed_at",
      "ranked_tutorial_version",
    ]);

    // Same row now reads back completed → no longer required.
    await waitFor(() => expect(result.current.completed).toBe(true));
    expect(result.current.required).toBe(false);
  });

  it("exempts an already-completed anonymous profile (version 1)", async () => {
    mocks.row = {
      is_anonymous: true,
      onboarding_completed: false,
      ranked_tutorial_completed_at: "2026-07-18T00:00:00Z",
      ranked_tutorial_version: 1,
    };
    const { result } = renderHook(() => useRankedTutorialStatus());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.completed).toBe(true);
    expect(result.current.required).toBe(false);
  });

  it("fails open on a genuine profile-read error (error, not loading)", async () => {
    mocks.readError = { message: "boom" };
    const { result } = renderHook(() => useRankedTutorialStatus());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe(true);
    expect(result.current.required).toBe(false);
  });
});

describe("useRankedTutorialStatus — focus/refresh stability (no reset)", () => {
  it("a same-id auth refresh (new User object) does not reload or re-block", async () => {
    const { result, rerender } = renderHook(() => useRankedTutorialStatus());
    await waitFor(() => expect(result.current.loading).toBe(false));
    const readsAfterInitial = mocks.readCalls;
    expect(readsAfterInitial).toBe(1);

    // Simulate Supabase re-emitting TOKEN_REFRESHED on tab refocus: a NEW User
    // object reference for the SAME identity flows through useAuth.
    let sawLoadingTrue = false;
    for (let i = 0; i < 3; i++) {
      mocks.user = { id: "anon-1", is_anonymous: true }; // new object, same id
      rerender();
      if (result.current.loading) sawLoadingTrue = true;
    }
    // Give any (unwanted) async load a chance to run.
    await act(async () => {
      await Promise.resolve();
    });

    // Keyed on user.id, so no new load ran and loading never flipped back to true.
    expect(sawLoadingTrue).toBe(false);
    expect(result.current.loading).toBe(false);
    expect(mocks.readCalls).toBe(readsAfterInitial); // no extra reads
    expect(result.current.required).toBe(true); // state preserved
  });

  it("an explicit background refresh() does not return to the blocking loading state", async () => {
    const { result } = renderHook(() => useRankedTutorialStatus());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let sawLoadingTrue = false;
    await act(async () => {
      const p = result.current.refresh();
      if (result.current.loading) sawLoadingTrue = true;
      await p;
    });

    expect(sawLoadingTrue).toBe(false);
    expect(result.current.loading).toBe(false);
    expect(mocks.readCalls).toBeGreaterThan(1); // it DID refetch in the background
  });

  it("a genuine identity change (null → user) still shows the initial loading gate", async () => {
    mocks.user = null;
    const { result, rerender } = renderHook(() => useRankedTutorialStatus());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.required).toBe(false); // no user yet

    // Anonymous sign-in completes: a brand-new identity appears.
    mocks.user = { id: "anon-1", is_anonymous: true };
    rerender();
    // First load for this new id enters the blocking loading state.
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.required).toBe(true);
  });
});
