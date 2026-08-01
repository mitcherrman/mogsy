/**
 * League profile isolation.
 *
 * The legacy Mogsy profile was a dating profile. Its fields still exist in
 * storage and stay editable by their owner, but a League-facing profile must
 * not read them, render them, or publish them as metadata. This pins all three
 * at once: the query projection, the rendered page, and the SEO/JSON-LD.
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import UserProfile from "./UserProfile";

/** Every column name a League profile must never ask for or expose. */
const LEGACY_DATING_FIELDS = ["age", "location", "status_message", "socials", "custom_theme"];

type JsonLdPerson = { name?: string; description?: string; address?: string };
type CapturedSeoProps = { description: string; jsonLd: { mainEntity: JsonLdPerson } };

const seo = vi.hoisted(() => ({ props: null as CapturedSeoProps | null }));
const db = vi.hoisted(() => ({
  /** Records every `.from(table).select(cols)` the page issues. */
  selects: [] as { table: string; cols: string }[],
  /** Records every `.rpc(fn, args)` the page issues. */
  rpcs: [] as { fn: string; args: Record<string, unknown> }[],
  /** The VIEWER's own `profiles` row. null => they are viewing someone else. */
  myProfileRow: null as Record<string, unknown> | null,
  profile: {
    id: "profile-1",
    user_id: "auth-1",
    display_name: "Ashe",
    avatar_url: null,
    profile_frame: null,
    is_pro: false,
    is_anonymous: false,
    created_at: "2026-01-15T00:00:00Z",
    // Deliberately present in the fixture: if the component ever widens its
    // projection back to `*`, these would flow straight through to the UI.
    age: 29,
    location: "Freljord",
    status_message: "looking for a duo",
    socials: { instagram: "https://instagram.com/ashe" },
    custom_theme: null,
  } as Record<string, unknown>,
}));

vi.mock("@/components/SEOHead", () => ({
  default: (props: CapturedSeoProps) => {
    seo.props = props;
    return null;
  },
}));

// Child surfaces run their own queries; they are covered by their own tests.
vi.mock("@/components/profile/LeaguePublicProfile", () => ({
  default: () => <div data-testid="league-public-profile" />,
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "viewer-1" }, loading: false }),
}));

const quiz = vi.hoisted(() => ({
  getProgress: vi.fn(async () => ({ total_attempts: 0 })),
}));

vi.mock("@/lib/quiz/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/quiz/api")>();
  return {
    ...actual,
    quizApi: { ...actual.quizApi, getProgress: quiz.getProgress },
  };
});

vi.mock("@/integrations/supabase/client", () => {
  const rowsFor = (table: string) => {
    if (table === "app_settings") return { value: { enabled: true, tiers: [] } };
    if (table === "public_profiles") return db.profile;
    if (table === "profiles") return db.myProfileRow;
    return null;
  };
  type Result = { data: unknown; error: null };
  const builder = (table: string) => {
    const b: Record<string, unknown> = {};
    const passthrough = ["eq", "in", "order", "limit", "gt", "not", "neq", "is", "or"];
    b.select = (cols = "*") => {
      db.selects.push({ table, cols });
      return b;
    };
    passthrough.forEach((m) => (b[m] = () => b));
    b.single = async (): Promise<Result> => ({ data: rowsFor(table), error: null });
    b.maybeSingle = async (): Promise<Result> => ({ data: rowsFor(table), error: null });
    // Some call sites await the builder directly instead of .single().
    b.then = (resolve: (value: Result) => unknown) =>
      Promise.resolve<Result>({
        data: table === "public_profiles" ? [rowsFor(table)] : [],
        error: null,
      }).then(resolve);
    return b;
  };
  const rpc = async (fn: string, args: Record<string, unknown>) => {
    db.rpcs.push({ fn, args });
    // get_league_profiles is the SECURITY DEFINER RPC that replaced the
    // public_profiles read. The fixture row deliberately still carries the
    // legacy dating columns: the live function cannot return them, and these
    // tests prove the page would not surface them even if it could.
    if (fn === "get_league_profiles") return { data: [db.profile], error: null };
    return { data: [], error: null };
  };
  return { supabase: { from: (table: string) => builder(table), rpc } };
});

function renderProfile() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/user/profile-1"]}>
        <Routes>
          <Route path="/user/:profileId" element={<UserProfile />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  db.selects = [];
  db.rpcs = [];
  db.myProfileRow = null;
  seo.props = null;
  quiz.getProgress.mockClear();
});

afterEach(cleanup);

describe("League profile isolation", () => {
  it("reads the League contract through get_league_profiles, never the public_profiles view", async () => {
    renderProfile();
    await waitFor(() => expect(db.rpcs.length).toBeGreaterThan(0));

    // The projection is no longer chosen here — get_league_profiles returns a
    // fixed RETURNS TABLE contract that a caller cannot widen, so the legacy
    // columns are unreachable by construction rather than by omission.
    const call = db.rpcs.find((r) => r.fn === "get_league_profiles");
    expect(call).toBeTruthy();
    expect(call!.args).toEqual({ _profile_ids: ["profile-1"] });
    // The request carries no column list and no user id of any kind.
    expect(Object.keys(call!.args)).toEqual(["_profile_ids"]);

    // The security_invoker view is no longer read on a League surface at all.
    expect(db.selects.some((s) => s.table === "public_profiles")).toBe(false);
  });

  it("requests no quiz stats when viewing another user", async () => {
    // db.myProfileRow stays null => the viewer owns no profile matching the
    // route, so this is someone else's page.
    renderProfile();
    await waitFor(() => expect(screen.getByText("Ashe")).toBeTruthy());

    // /api/quiz/* resolves a verified caller to their OWN subject regardless of
    // the id passed, so asking here returned the VIEWER's rank, category
    // progress and achievements rendered as the profile owner's. Hidden now.
    expect(quiz.getProgress).not.toHaveBeenCalled();
  });

  it("requests quiz stats with the viewer's own session id on their own profile", async () => {
    db.myProfileRow = { id: "profile-1" };
    renderProfile();

    await waitFor(() => expect(quiz.getProgress).toHaveBeenCalled());
    // Sourced from the session, never from the fetched profile row — the
    // contract carries no user_id to source it from.
    expect(quiz.getProgress).toHaveBeenCalledWith("viewer-1");
  });

  it("never queries profile_photos", async () => {
    renderProfile();
    await waitFor(() => expect(db.selects.length).toBeGreaterThan(0));
    expect(db.selects.some((s) => s.table === "profile_photos")).toBe(false);
  });

  it("keeps legacy values out of the rendered page even if the row carries them", async () => {
    renderProfile();
    await waitFor(() => expect(screen.getByText("Ashe")).toBeTruthy());

    expect(screen.queryByText(/29 years old/i)).toBeNull();
    expect(screen.queryByText(/Freljord/)).toBeNull();
    expect(screen.queryByText(/looking for a duo/)).toBeNull();
    expect(screen.queryByText(/Socials/)).toBeNull();
  });

  it("publishes no location or bio in metadata, JSON-LD or social preview", async () => {
    renderProfile();
    await waitFor(() => expect(seo.props).not.toBeNull());

    const captured = seo.props!;
    const person = captured.jsonLd.mainEntity;
    expect(person.address).toBeUndefined();
    expect(person.description).toBeUndefined();
    expect(person.name).toBe("Ashe");

    expect(captured.description).not.toContain("looking for a duo");
    expect(captured.description).not.toContain("Freljord");
  });
});
