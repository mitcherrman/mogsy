/**
 * ADMIN1A — Premium provenance and the grant control.
 *
 * Two defects are pinned here.
 *
 * 1. Provenance. The Admin UI mapped `is_pro === true` to "Stripe subscription",
 *    which `profiles` records nothing to justify. A bare flag now reads as
 *    Legacy Premium, and a grant reads as its own kind.
 *
 * 2. Confirmation. The grant used to patch local state with what it had ASKED
 *    for. On an account that was already legacy `is_pro = true` the screen
 *    therefore looked Premium whether or not `pro_grant_kind` was written —
 *    exactly the ambiguity that stalled the COMBAT1 playtest bridge. Success is
 *    now proved by a canonical re-read.
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminUsers from "./AdminUsers";

const PROFILE_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const future = new Date(Date.now() + 90 * 86400000).toISOString();

const { state, setGrant, toastError, toastSuccess, supabase } = vi.hoisted(() => {
  const state = {
    /** The canonical server row. Mutated only by what the "server" accepts. */
    row: {} as Record<string, unknown>,
    /** When false, admin_set_pro_grant reports success but writes nothing. */
    writeTakesEffect: true,
    /** When set, the RPC fails with this message. */
    rpcError: null as string | null,
  };
  const setGrant = vi.fn();
  const toastError = vi.fn();
  const toastSuccess = vi.fn();
  const query = (data: unknown) => {
    const value: any = {
      select: () => value, eq: () => value, in: () => value, or: () => value,
      order: () => value, limit: () => value, single: () => Promise.resolve({ data, error: null }),
      insert: () => value, update: () => value, upsert: () => value, delete: () => value,
      then: (resolve: any) => Promise.resolve({ data, error: null }).then(resolve),
    };
    return value;
  };
  const supabase = {
    rpc: vi.fn((name: string, args?: Record<string, unknown>) => {
      if (name === "admin_list_profiles") {
        return Promise.resolve({ data: [{ ...state.row }], error: null });
      }
      if (name === "admin_set_pro_grant") {
        setGrant(args);
        if (state.rpcError) return Promise.resolve({ data: null, error: { message: state.rpcError } });
        if (state.writeTakesEffect) {
          state.row.pro_grant_kind = args?._kind ?? null;
          state.row.pro_grant_expires_at = args?._expires_at ?? null;
          state.row.pro_grant_reason = args?._reason ?? null;
          state.row.pro_grant_granted_by = args?._kind == null ? null : "master-admin";
          state.row.pro_grant_granted_at = args?._kind == null ? null : new Date().toISOString();
        }
        return Promise.resolve({ data: null, error: null });
      }
      // admin_list_feedback is chained (.eq().order().limit()), so it needs a
      // builder rather than a bare promise.
      return query([]);
    }),
    from: vi.fn((table: string) =>
      query(table === "user_roles" ? [{ user_id: USER_ID, role: "master_admin" }] : []),
    ),
    functions: {
      invoke: vi.fn(() => Promise.resolve({ data: { auth_info: {
        email: "owner@example.com", email_confirmed: true, created_at: "2026-08-01T00:00:00Z",
        last_sign_in_at: null, is_anonymous: false, banned_until: null, provider: "email",
      } }, error: null })),
    },
  };
  return { state, setGrant, toastError, toastSuccess, supabase };
});

vi.mock("@/integrations/supabase/client", () => ({ supabase }));
vi.mock("sonner", () => ({ toast: { success: toastSuccess, error: toastError } }));

const baseRow = (over: Record<string, unknown> = {}) => ({
  id: PROFILE_ID, user_id: USER_ID, display_name: "Mogzy Owner",
  avatar_url: null, age: null, location: null, status_message: null,
  is_pro: false, pro_grant_kind: null, pro_grant_expires_at: null,
  pro_grant_reason: null, pro_grant_granted_at: null, pro_grant_granted_by: null,
  is_bot: false, is_anonymous: false, diamonds: 0, elo_shields: 0, reveals: 0,
  rewinds: 0, boost_credits: 0, active_boost_until: null, profile_frame: "default",
  admin_notes: null, is_flagged_underage: false, created_at: "2026-08-01T00:00:00Z",
  last_seen_at: "2026-08-19T00:00:00Z", ads_enabled: true, ...over,
});

beforeEach(() => {
  state.row = baseRow();
  state.writeTakesEffect = true;
  state.rpcError = null;
  setGrant.mockClear();
  toastError.mockClear();
  toastSuccess.mockClear();
});

/** Open the selected user's Account tab. Nothing is expanded. */
async function openAccountTab() {
  render(
    <MemoryRouter initialEntries={[`/admin/people?section=users&user=${PROFILE_ID}`]}>
      <AdminUsers isMasterAdmin />
    </MemoryRouter>,
  );
  await screen.findByText("Profile UUID:");
  fireEvent.click(screen.getByRole("button", { name: /^account$/i }));
  return await screen.findByTestId("premium-entitlement-section");
}

const sourceOf = () => screen.getByTestId("premium-source").getAttribute("data-premium-source");

describe("the entitlement section is a first-class part of the user detail view", () => {
  it("is visible in the Account tab without expanding Account Actions", async () => {
    const section = await openAccountTab();
    expect(section).toBeInTheDocument();
    // The legacy economy panel is still closed — its fields are not rendered.
    expect(screen.queryByText("Save Profile Changes")).not.toBeInTheDocument();
    expect(within(section).getByTestId("premium-grant-submit")).toBeInTheDocument();
  });

  it("does not live inside the legacy Account Actions container", async () => {
    await openAccountTab();
    fireEvent.click(screen.getByRole("button", { name: /account actions/i }));
    const legacy = await screen.findByTestId("account-actions-content");
    // The legacy panel still holds the economy editor it always did...
    expect(within(legacy).getByText("Save Profile Changes")).toBeInTheDocument();
    // ...and no longer holds the Premium grant.
    expect(within(legacy).queryByTestId("premium-grant-submit")).toBeNull();
  });

  it("renders the two sources as independent rows, so an empty grant reads as empty", async () => {
    state.row = baseRow({ is_pro: true });
    const section = await openAccountTab();
    expect(within(section).getByTestId("premium-stripe-row").textContent).not.toMatch(/Active subscription/);
    expect(within(section).getByTestId("premium-grant-row").textContent).toMatch(/None/);
  });
});

describe("provenance", () => {
  it("calls a bare legacy is_pro Legacy Premium, never a Stripe subscription", async () => {
    state.row = baseRow({ is_pro: true });
    const section = await openAccountTab();
    expect(screen.getByTestId("effective-premium").textContent).toBe("YES");
    expect(sourceOf()).toBe("legacy");
    expect(within(section).getByTestId("premium-source").textContent).toBe("Legacy Premium");
    expect(within(section).getByTestId("premium-legacy-caution")).toBeInTheDocument();
  });

  it("names a playtest grant, its expiry and its reason", async () => {
    state.row = baseRow({
      pro_grant_kind: "playtest", pro_grant_expires_at: future,
      pro_grant_reason: "Combat / TeamSim internal playtest",
      pro_grant_granted_by: "master-admin", pro_grant_granted_at: "2026-09-04T00:00:00Z",
    });
    const section = await openAccountTab();
    expect(sourceOf()).toBe("playtest-grant");
    const grantRow = within(section).getByTestId("premium-grant-row");
    expect(grantRow.textContent).toContain("playtest");
    expect(grantRow.textContent).toContain("expires");
    expect(grantRow.textContent).toContain("Combat / TeamSim internal playtest");
    expect(grantRow.textContent).toContain("master-admin");
    expect(screen.queryByTestId("premium-legacy-caution")).toBeNull();
  });

  it("reports Free when there is no entitlement at all", async () => {
    await openAccountTab();
    expect(screen.getByTestId("effective-premium").textContent).toBe("NO");
    expect(sourceOf()).toBe("free");
  });
});

describe("granting is confirmed by source, not by effective Premium", () => {
  it("shows Playtest grant after a successful write on an already-legacy account", async () => {
    // The COMBAT1 shape: already Premium before the click, so "still Premium"
    // proves nothing. Only the SOURCE changing proves the grant landed.
    state.row = baseRow({ is_pro: true });
    await openAccountTab();
    expect(sourceOf()).toBe("legacy");

    fireEvent.click(screen.getByTestId("premium-grant-submit"));
    await waitFor(() => expect(sourceOf()).toBe("playtest-grant"));
    expect(setGrant).toHaveBeenCalledWith(expect.objectContaining({ _kind: "playtest", _user_id: USER_ID }));
    expect(toastSuccess).toHaveBeenCalled();
    expect(screen.queryByTestId("premium-grant-error")).toBeNull();
  });

  it("does not look successful when the server did not record the grant", async () => {
    // The RPC returns no error, but the row comes back unchanged. Before
    // ADMIN1A this painted as a success because local state was patched.
    state.row = baseRow({ is_pro: true });
    state.writeTakesEffect = false;
    await openAccountTab();
    fireEvent.click(screen.getByTestId("premium-grant-submit"));

    await screen.findByTestId("premium-grant-error");
    expect(sourceOf()).toBe("legacy");
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalled();
  });

  it("surfaces the actual RPC error and changes nothing", async () => {
    state.rpcError = "Forbidden: admin role required to set a Pro grant";
    await openAccountTab();
    fireEvent.click(screen.getByTestId("premium-grant-submit"));

    const alert = await screen.findByTestId("premium-grant-error");
    expect(alert.textContent).toContain("Forbidden: admin role required");
    expect(sourceOf()).toBe("free");
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it("sends the typed expiry and reason, and shows the resolved date", async () => {
    await openAccountTab();
    fireEvent.change(screen.getByPlaceholderText("e.g. 90"), { target: { value: "30" } });
    fireEvent.change(screen.getByPlaceholderText("Founding playtester"), {
      target: { value: "Combat / TeamSim internal playtest" },
    });
    expect(screen.getByTestId("premium-grant-expiry-preview").textContent).toMatch(/^Expires /);

    fireEvent.click(screen.getByTestId("premium-grant-submit"));
    await waitFor(() => expect(sourceOf()).toBe("playtest-grant"));
    const args = setGrant.mock.calls.at(-1)?.[0];
    expect(args._reason).toBe("Combat / TeamSim internal playtest");
    expect(Date.parse(args._expires_at)).toBeGreaterThan(Date.now());
    expect(screen.getByTestId("premium-grant-row").textContent).toContain("Combat / TeamSim internal playtest");
  });
});

describe("revoking", () => {
  it("clears only the grant and leaves Stripe-derived Premium in place", async () => {
    state.row = baseRow({ is_pro: true, pro_grant_kind: "playtest", pro_grant_expires_at: future });
    await openAccountTab();
    expect(sourceOf()).toBe("playtest-grant");

    fireEvent.click(screen.getByTestId("premium-grant-revoke"));
    expect(await screen.findByText(/does not touch Stripe/i)).toBeInTheDocument();
    expect(screen.getByText(/stays Premium after the revoke/i)).toBeInTheDocument();
    fireEvent.click(await screen.findByTestId("premium-grant-revoke-confirm"));

    await waitFor(() => expect(sourceOf()).toBe("legacy"));
    // is_pro was never written by the revoke.
    expect(state.row.is_pro).toBe(true);
    expect(screen.getByTestId("effective-premium").textContent).toBe("YES");
    expect(setGrant).toHaveBeenCalledWith(expect.objectContaining({ _kind: null }));
  });

  it("drops to Free when the grant was the only source", async () => {
    state.row = baseRow({ pro_grant_kind: "manual", pro_grant_expires_at: null });
    await openAccountTab();
    fireEvent.click(screen.getByTestId("premium-grant-revoke"));
    fireEvent.click(await screen.findByTestId("premium-grant-revoke-confirm"));
    await waitFor(() => expect(screen.getByTestId("effective-premium").textContent).toBe("NO"));
    expect(sourceOf()).toBe("free");
  });
});
