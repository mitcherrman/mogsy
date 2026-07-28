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

vi.mock("@/lib/quiz/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/quiz/api")>();
  return {
    ...actual,
    quizApi: { ...actual.quizApi, getProgress: vi.fn(async () => ({ total_attempts: 0 })) },
  };
});

vi.mock("@/integrations/supabase/client", () => {
  const rowsFor = (table: string) => {
    if (table === "app_settings") return { value: { enabled: true, tiers: [] } };
    if (table === "public_profiles") return db.profile;
    return null;
  };
  type Result = { data: unknown; error: null };
  const builder = (table: string) => {
    const b: Record<string, unknown> = {};
    const passthrough = ["eq", "in", "order", "limit", "gt", "not", "neq", "is"];
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
  return { supabase: { from: (table: string) => builder(table) } };
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
  seo.props = null;
});

afterEach(cleanup);

describe("League profile isolation", () => {
  it("never selects legacy dating columns from public_profiles", async () => {
    renderProfile();
    await waitFor(() => expect(db.selects.some((s) => s.table === "public_profiles")).toBe(true));

    const projection = db.selects.find((s) => s.table === "public_profiles")!.cols;
    expect(projection).not.toBe("*");
    for (const field of LEGACY_DATING_FIELDS) {
      expect(projection).not.toContain(field);
    }
    // The approved contract is still fully present.
    for (const field of ["id", "user_id", "display_name", "avatar_url", "created_at"]) {
      expect(projection).toContain(field);
    }
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
