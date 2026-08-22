/**
 * Profile page auth-state behavior: guests get an account-value panel with no
 * editing UI; signed-in users get an identity dashboard with an explicit
 * edit mode (save/cancel) that preserves the existing form + theme selector.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installLocalStorageStub } from "@/test/localStorageStub";

// AUTH3: this suite has been red on `localStorage.clear is not a function`
// since jsdom 20 + vitest 3 (which ship no working Storage) — the same reason
// account-upgrade.test.ts opts into the shared stub. Opting in here is what
// makes the profile rename testable at all.
installLocalStorageStub();

/**
 * AUTH3 — the username is no longer part of the profile's update payload. It
 * is claimed through set_display_name(), the one write path that can see
 * whether another account already holds the name; RLS shows this client only
 * its own row, so a plain profiles.update() could never have refused a
 * duplicate. See lib/identity/claim-username.
 */
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
    socials: { instagram: "https://instagram.com/riftmaster" },
    is_pro: false,
    profile_frame: "default",
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
      profile_photos: [] as Array<{ id: string; url: string; sort_order: number }>,
      user_roles: [] as Array<{ role: string }>,
      app_settings: null,
    } as Record<string, unknown>,
    updateCalls: [] as Array<{ table: string; payload: unknown }>,
    getProgress: vi.fn(),
  };
});

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: mocks.authUser, session: null, loading: false }),
}));

vi.mock("@/hooks/useSitewideTheme", () => ({
  useSitewideTheme: () => ({ themeId: "default", setActiveTheme: vi.fn(), chosenFreeTheme: null }),
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
      storage: { from: () => ({ upload: vi.fn(), getPublicUrl: () => ({ data: { publicUrl: "" } }) }) },
    },
  };
});

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

beforeEach(() => {
  vi.clearAllMocks();
  claim.mockResolvedValue({ ok: true, code: "set", username: "RiftMaster" });
  mocks.updateCalls.length = 0;
  mocks.authUser = { id: "u1", is_anonymous: false };
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

describe("Profile — signed out (guest / anonymous session)", () => {
  beforeEach(() => {
    mocks.authUser = { id: "anon1", is_anonymous: true };
  });

  it("shows no editable profile controls", async () => {
    renderProfile();
    await screen.findByText(/Sign in to build your League profile/);
    expect(screen.queryByText("Basic Info")).toBeNull();
    expect(screen.queryByText("Social Links")).toBeNull();
    expect(screen.queryByText("Photos")).toBeNull();
    expect(screen.queryByText("Theme")).toBeNull();
    expect(screen.queryByRole("button", { name: /Save Profile/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Edit profile/ })).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("offers sign-in and create-account actions on the existing auth route", async () => {
    renderProfile();
    const signIn = await screen.findByRole("link", { name: /Sign in/ });
    expect(signIn.getAttribute("href")).toContain("/auth");
    const signUp = screen.getByRole("link", { name: /Create account/ });
    expect(signUp.getAttribute("href")).toContain("mode=signup");
    expect(screen.getByRole("link", { name: /Continue exploring as a guest/ })).toBeTruthy();
  });

  it("does not imply guest progress is a stored profile", async () => {
    renderProfile();
    expect(await screen.findByText(/Progress on this device is temporary/)).toBeTruthy();
    // Guest stats section carries an explicit device-local label.
    expect(screen.getByText(/Temporary guest progress/i)).toBeTruthy();
  });

  it("shows exactly three account benefits", async () => {
    renderProfile();
    await screen.findByText(/Sign in to build your League profile/);
    const list = screen.getByRole("list");
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items.map((li) => li.textContent)).toEqual([
      "Save XP, rank, and progress",
      "Track streaks and category mastery",
      "Customize your League profile",
    ]);
  });
});

describe("Profile — signed in", () => {
  it("shows the identity dashboard with name, status, rank, and consistent metrics", async () => {
    renderProfile();
    expect(await screen.findByText("RiftMaster")).toBeTruthy();
    expect(screen.getByText(/Climbing to Gold/)).toBeTruthy();
    await waitFor(() => expect(screen.getByText("Bronze")).toBeTruthy());
    expect(screen.getByText(/67\.74% accuracy/)).toBeTruthy();
    expect(screen.getByText(/8 best streak/)).toBeTruthy();
    // Answered derives from total_attempts — never 0 while accuracy is real.
    expect(screen.getByText(/31 answered/)).toBeTruthy();
  });

  it("shows exactly one profile-edit entry control — no Customize Profile on the dashboard", async () => {
    renderProfile();
    await screen.findByText("RiftMaster");
    expect(screen.queryByText("Customize Profile")).toBeNull();
    const editEntries = screen.getAllByRole("button", { name: /Edit profile/i });
    expect(editEntries).toHaveLength(1);
  });

  it("keeps the Customize Profile section controls available inside edit mode", async () => {
    renderProfile();
    fireEvent.click(await screen.findByRole("button", { name: /Edit profile/ }));
    expect(await screen.findByText("Customize Profile")).toBeTruthy();
  });

  it("hides the edit form by default", async () => {
    renderProfile();
    await screen.findByText("RiftMaster");
    expect(screen.queryByText("Basic Info")).toBeNull();
    expect(screen.queryByText("Theme")).toBeNull();
    expect(screen.queryByRole("button", { name: /Save Profile/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Edit profile/ })).toBeTruthy();
  });

  it("reveals Photos, Theme, Basic Info, Social Links, and save controls in edit mode", async () => {
    renderProfile();
    const editBtn = await screen.findByRole("button", { name: /Edit profile/ });
    fireEvent.click(editBtn);
    expect(await screen.findByText("Basic Info")).toBeTruthy();
    expect(screen.getByText("Photos")).toBeTruthy();
    expect(screen.getByText("Social Links")).toBeTruthy();
    expect(screen.getByText("Theme")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Save Profile/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
    // The edit toggle exposes expanded state.
    expect(screen.getByRole("button", { name: /Close editor/ }).getAttribute("aria-expanded")).toBe("true");
  });

  it("cancel exits edit mode and restores persisted values", async () => {
    renderProfile();
    fireEvent.click(await screen.findByRole("button", { name: /Edit profile/ }));
    await screen.findByText("Basic Info");

    // Enter field-edit mode for display name and type a new value.
    const nameSection = screen.getByText("Username *").closest("div")!.parentElement!;
    const pencil = nameSection.querySelector("button");
    if (pencil) fireEvent.click(pencil);
    const input = (await screen.findByLabelText(/Username/)) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "SomebodyElse" } });
    expect(screen.getByText("SomebodyElse")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByText("Basic Info")).toBeNull());
    // Header shows the persisted name again, unsaved edit discarded.
    await waitFor(() => expect(screen.getByText("RiftMaster")).toBeTruthy());
    expect(screen.queryByText("SomebodyElse")).toBeNull();
    expect(mocks.updateCalls.filter((c) => c.table === "profiles")).toHaveLength(0);
  });

  it("saving persists and returns to view mode", async () => {
    renderProfile();
    fireEvent.click(await screen.findByRole("button", { name: /Edit profile/ }));
    await screen.findByText("Basic Info");
    fireEvent.click(screen.getByRole("button", { name: /Save Profile/ }));
    await waitFor(() =>
      expect(mocks.updateCalls.some((c) => c.table === "profiles")).toBe(true),
    );
    await waitFor(() => expect(screen.queryByText("Basic Info")).toBeNull());
    const payload = mocks.updateCalls.find((c) => c.table === "profiles")!.payload as Record<string, unknown>;
    // AUTH3: the name went through the claim, not the payload.
    expect(claim).toHaveBeenCalledWith("RiftMaster");
    expect(payload.display_name).toBeUndefined();
    expect(payload.custom_theme).toBe("default");
  });

  it("renaming is free — no cooldown, no charge, no premium gate (AUTH3 §10, §16)", async () => {
    renderProfile();
    fireEvent.click(await screen.findByRole("button", { name: /Edit profile/ }));
    await screen.findByText("Basic Info");
    fireEvent.click(screen.getByTestId("profile-username-edit"));
    fireEvent.change(screen.getByTestId("profile-username-input"), {
      target: { value: "MogzyKing" },
    });
    claim.mockResolvedValue({ ok: true, code: "set", username: "MogzyKing" });
    fireEvent.click(screen.getByRole("button", { name: /Save Profile/ }));

    await waitFor(() => expect(claim).toHaveBeenCalledWith("MogzyKing"));
    // Nothing in the way: no confirmation step, no cost, no is_pro check.
    expect(screen.queryByText(/upgrade|pro only|cooldown|wait/i)).toBeNull();
  });

  it("refuses a taken name in plain language, and saves nothing else either", async () => {
    claim.mockResolvedValue({
      ok: false,
      code: "taken",
      taken: true,
      error: "That username is already taken.",
    });
    renderProfile();
    fireEvent.click(await screen.findByRole("button", { name: /Edit profile/ }));
    await screen.findByText("Basic Info");
    fireEvent.click(screen.getByTestId("profile-username-edit"));
    fireEvent.change(screen.getByTestId("profile-username-input"), {
      target: { value: "SomebodyElsesName" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Save Profile/ }));

    await waitFor(() =>
      expect(screen.getAllByText("That username is already taken.").length).toBeGreaterThan(0),
    );
    // The name goes first precisely so a refusal leaves the stored profile
    // exactly as it was — the form still reflects reality and a retry is one
    // corrected field, not a half-saved profile.
    expect(mocks.updateCalls.filter((c) => c.table === "profiles")).toHaveLength(0);
    expect(screen.queryByText("Basic Info")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/constraint|duplicate key|23505/i);
  });

  it("refuses a name that fails the shared rules without any round trip", async () => {
    renderProfile();
    fireEvent.click(await screen.findByRole("button", { name: /Edit profile/ }));
    await screen.findByText("Basic Info");
    fireEvent.click(screen.getByTestId("profile-username-edit"));
    fireEvent.change(screen.getByTestId("profile-username-input"), { target: { value: "A" } });
    fireEvent.click(screen.getByRole("button", { name: /Save Profile/ }));

    await waitFor(() =>
      expect(screen.getAllByText(/between 2 and 24 characters/i).length).toBeGreaterThan(0),
    );
    expect(claim).not.toHaveBeenCalled();
    expect(mocks.updateCalls.filter((c) => c.table === "profiles")).toHaveLength(0);
  });

  it("keeps the theme selector intact inside edit mode (options + lock state)", async () => {
    renderProfile();
    fireEvent.click(await screen.findByRole("button", { name: /Edit profile/ }));
    await screen.findByText("Theme");
    // Default theme option is always present and usable.
    const defaultBtn = screen.getByRole("button", { name: /Default/ });
    expect(defaultBtn).toBeTruthy();
    expect((defaultBtn as HTMLButtonElement).disabled).toBe(false);
  });
});
