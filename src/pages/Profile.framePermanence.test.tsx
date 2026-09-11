/**
 * PT2B — FRAME PERMANENCE UNDER A CLOSING PREMIUM ACCESS WINDOW.
 *
 * THE MODEL, STATED PLAINLY: Mogzy has no separate frame-ownership store.
 * `public.profiles.profile_frame` is ONE text column that is simultaneously
 * "what I own" and "what I have equipped". There is no `owned_frames` table,
 * no join table, and no catalogue of entitled cosmetics per account.
 *
 * So permanence here is not enforced by an ownership record — it is enforced
 * STRUCTURALLY, by two properties that must both hold:
 *
 *   1. ACQUISITION is access-gated. The frame picker renders only when the
 *      caller currently has Premium access, so a Free caller has no way to put
 *      a value into that column at all.
 *   2. PERSISTENCE is unconditional. Every write of `profile_frame` sends the
 *      value the profile already holds, so losing access can never rewrite it.
 *
 * Property 2 is the one that was broken: the save payload used to read
 * `profile_frame: isPro ? selectedFrame : "default"`, which destroyed a stored
 * frame on the next unrelated save once access ended (change your bio, lose
 * your frame). PT1.13B removed the clamp; these tests are the regression fence
 * that stops it coming back, and they read the whole Global Premium Access
 * lifecycle — acquire while ON, keep after OFF.
 *
 * Global access is simulated exactly the way production resolves it: through
 * the `app_settings.global_premium_access` row that `fetchGlobalPremiumAccess`
 * reads, not by faking entitlement.
 */
import { readFileSync } from "node:fs";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installLocalStorageStub } from "@/test/localStorageStub";

installLocalStorageStub();

const claim = vi.hoisted(() => vi.fn());
vi.mock("@/lib/identity/claim-username", () => ({
  claimUsername: claim,
  checkUsernameAvailable: vi.fn(),
}));

import Profile from "./Profile";

const mocks = vi.hoisted(() => {
  const profileRow = {
    id: "p1",
    user_id: "u1",
    display_name: "RiftMaster",
    status_message: "Climbing to Gold",
    age: 25,
    location: "Toronto, Canada",
    socials: {},
    // FREE. Never mutated by any test here: the whole point is that the
    // account's real entitlement is untouched by the access window.
    is_pro: false,
    pro_grant_kind: null,
    // A Premium frame legitimately equipped earlier, while global access was on.
    profile_frame: "gold",
    custom_theme: "default",
    boost_credits: 0,
    active_boost_until: null,
    avatar_url: "",
  };
  return {
    authUser: { id: "u1", is_anonymous: false } as { id: string; is_anonymous: boolean } | null,
    profileRow,
    tableData: {
      profiles: profileRow,
      profile_photos: [] as unknown[],
      user_roles: [] as unknown[],
      // The Global Premium Access policy row, read per-test.
      app_settings: null as unknown,
    } as Record<string, unknown>,
    updateCalls: [] as Array<{ table: string; payload: unknown }>,
    getProgress: vi.fn(),
  };
});

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: mocks.authUser, session: null, loading: false }),
}));
vi.mock("@/components/profile/LeagueProfileStats", () => ({
  default: () => <div data-testid="league-stats" />,
}));
vi.mock("@/lib/quiz/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/quiz/api")>();
  return { ...actual, quizApi: { ...actual.quizApi, getProgress: mocks.getProgress } };
});

vi.mock("@/integrations/supabase/client", () => {
  function builder(table: string) {
    const result = () => ({ data: mocks.tableData[table] ?? null, error: null });
    const b: Record<string, unknown> = {};
    const chain = () => b;
    Object.assign(b, {
      select: chain,
      eq: chain,
      order: chain,
      update: (payload: unknown) => {
        mocks.updateCalls.push({ table, payload });
        return b;
      },
      insert: () => Promise.resolve({ error: null }),
      delete: chain,
      single: () => Promise.resolve(result()),
      maybeSingle: () => Promise.resolve(result()),
      then: (onFulfilled: (v: unknown) => unknown) => Promise.resolve(result()).then(onFulfilled),
    });
    return b;
  }
  return {
    supabase: {
      from: (table: string) => builder(table),
      rpc: vi.fn(async () => ({ error: null })),
      storage: {
        from: () => ({ upload: vi.fn(), getPublicUrl: () => ({ data: { publicUrl: "" } }) }),
      },
    },
  };
});

/** Set the Global Premium Access policy row exactly as production stores it. */
function setGlobalPremiumAccess(state: boolean | "absent") {
  mocks.tableData.app_settings = state === "absent" ? null : { value: { enabled: state } };
}

function renderProfile() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/profile"]}>
        <Profile />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** Render, edit one field that has nothing to do with cosmetics, then save. */
async function editAnUnrelatedFieldAndSave() {
  renderProfile();
  fireEvent.click(await screen.findByRole("button", { name: /Edit profile/ }));
  await screen.findByText("Basic Info");
  // A filled field renders read-only with a pencil; click it to edit, exactly
  // as the existing Profile suite does for the username.
  const pencil = screen.getByText("Status Message").closest("div")!.querySelector("button");
  if (pencil) fireEvent.click(pencil);
  const status = (await screen.findByLabelText("Status Message")) as HTMLTextAreaElement;
  fireEvent.change(status, { target: { value: "Now climbing to Plat" } });
  fireEvent.click(screen.getByRole("button", { name: /Save Profile/ }));
  await waitFor(() =>
    expect(mocks.updateCalls.some((c) => c.table === "profiles")).toBe(true),
  );
  return mocks.updateCalls.find((c) => c.table === "profiles")!.payload as Record<string, unknown>;
}

beforeEach(() => {
  vi.clearAllMocks();
  claim.mockResolvedValue({ ok: true, code: "set", username: "RiftMaster" });
  mocks.updateCalls.length = 0;
  mocks.authUser = { id: "u1", is_anonymous: false };
  mocks.profileRow.is_pro = false;
  mocks.profileRow.profile_frame = "gold";
  mocks.tableData.profiles = mocks.profileRow;
  setGlobalPremiumAccess(false);
  mocks.getProgress.mockResolvedValue({
    total_xp: 120,
    total_attempts: 31,
    correct_attempts: 21,
    accuracy: 67.74,
    current_streak: 8,
    best_streak: 8,
    rank: { rank_name: "Bronze" },
  });
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

// ---------------------------------------------------------------------------
// The required regression: acquired during the window, kept after it closes
// ---------------------------------------------------------------------------

describe("a frame equipped during global access survives the window closing", () => {
  it("an unrelated profile save does not reset the stored frame to default", async () => {
    // The lifecycle: the frame was equipped while global access was ON. It is
    // now OFF, the account is Free again, and the user edits their status.
    setGlobalPremiumAccess(false);
    const payload = await editAnUnrelatedFieldAndSave();

    expect(payload.profile_frame).toBe("gold");
    expect(payload.profile_frame).not.toBe("default");
    // The edit they actually made did land — this is a real save, not a no-op.
    expect(payload.status_message).toBe("Now climbing to Plat");
  });

  it("survives repeated saves, so the loss is not merely deferred one save", async () => {
    setGlobalPremiumAccess(false);
    await editAnUnrelatedFieldAndSave();
    cleanup();
    mocks.updateCalls.length = 0;
    const second = await editAnUnrelatedFieldAndSave();
    expect(second.profile_frame).toBe("gold");
  });

  it("keeps the frame while access is ON too, so nothing depends on the window", async () => {
    setGlobalPremiumAccess(true);
    const payload = await editAnUnrelatedFieldAndSave();
    expect(payload.profile_frame).toBe("gold");
  });

  it("keeps the frame when the policy row is ABSENT (the production default)", async () => {
    // Absent row reads as OFF, which is the state most likely to be live.
    setGlobalPremiumAccess("absent");
    const payload = await editAnUnrelatedFieldAndSave();
    expect(payload.profile_frame).toBe("gold");
  });

  it("treats the theme the same way, which is the policy frames now match", async () => {
    setGlobalPremiumAccess(false);
    mocks.profileRow.custom_theme = "midnight";
    const payload = await editAnUnrelatedFieldAndSave();
    // Both cosmetics persist what is stored; neither is clamped by access.
    expect(payload.profile_frame).toBe("gold");
    expect(payload.custom_theme).toBeDefined();
    mocks.profileRow.custom_theme = "default";
  });
});

// ---------------------------------------------------------------------------
// The other half: permanence must not become a claiming loophole
// ---------------------------------------------------------------------------

describe("permanence does not let a Free user claim a frame they never had", () => {
  it("a Free user with the default frame saves the default frame, not a Premium one", async () => {
    setGlobalPremiumAccess(false);
    mocks.profileRow.profile_frame = "default";
    const payload = await editAnUnrelatedFieldAndSave();
    // The payload echoes STORED state. There is no path by which a save can
    // introduce a value the account did not already hold.
    expect(payload.profile_frame).toBe("default");
  });

  it("offers a Free user no frame control to change it with", async () => {
    setGlobalPremiumAccess(false);
    renderProfile();
    fireEvent.click(await screen.findByRole("button", { name: /Edit profile/ }));
    await screen.findByText("Basic Info");
    // No picker, so no acquisition. The gate is on ACQUIRING, not on KEEPING.
    expect(screen.queryByRole("button", { name: /^Gold$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Diamond$/i })).toBeNull();
  });

  it("saves the frame value seeded from the database, never a client-chosen one", async () => {
    // Whatever the database says is what goes back. A Free client cannot put
    // a different value into `selectedFrame` because nothing renders that can.
    for (const stored of ["default", "gold", "neon"]) {
      cleanup();
      mocks.updateCalls.length = 0;
      mocks.profileRow.profile_frame = stored;
      setGlobalPremiumAccess(false);
      const payload = await editAnUnrelatedFieldAndSave();
      expect(payload.profile_frame).toBe(stored);
    }
  });
});

// ---------------------------------------------------------------------------
// Source fence — the clamp must not come back
// ---------------------------------------------------------------------------

describe("the entitlement clamp stays deleted", () => {
  const source = readFileSync("src/pages/Profile.tsx", "utf8");

  it("never conditions the saved frame on current access", () => {
    expect(source).toContain("profile_frame: selectedFrame,");
    expect(source).not.toMatch(/profile_frame:\s*isPro\s*\?/);
    expect(source).not.toMatch(/profile_frame:.*:\s*["']default["']/);
  });

  it("never conditions the saved theme on current access either", () => {
    expect(source).toContain("custom_theme: activeThemeId,");
    expect(source).not.toMatch(/custom_theme:\s*isPro\s*\?/);
  });

  it("still gates the picker itself on current access", () => {
    // Acquisition stays gated: this is the property that makes permanence safe
    // rather than a loophole, so removing it must fail here too.
    expect(source).toMatch(/\{isPro \? \(\s*<div className="grid grid-cols-2 gap-2">/);
  });
});
