import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminUsers from "./AdminUsers";

/**
 * COM1-2 added a `?user=<profileId>` deep link so the Community drawer's admin
 * Users tab can hand a selected account to THIS page instead of growing its own
 * notes / roles / account-actions implementation. Reading a search param needs
 * a router in scope. The component only ever mounts inside one in production
 * (`/admin` and `/admin/people`), so this wrapper matches reality rather than
 * papering over a new requirement.
 */
const mount = (ui: React.ReactElement, path = "/admin/people?section=users") =>
  render(<MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>);

const profile = {
  id: "11111111-1111-4111-8111-111111111111",
  user_id: "22222222-2222-4222-8222-222222222222",
  display_name: "Mogzy Owner",
  avatar_url: null, age: null, location: null, status_message: null,
  is_pro: true, is_bot: false, is_anonymous: false,
  diamonds: 10, elo_shields: 1, reveals: 2, rewinds: 3, boost_credits: 4,
  active_boost_until: null, profile_frame: "default", admin_notes: null,
  is_flagged_underage: false, created_at: "2026-08-01T00:00:00Z",
  last_seen_at: "2026-08-19T00:00:00Z", ads_enabled: true,
};

const { deleteProfile, invoke, supabase } = vi.hoisted(() => {
  const deleteProfile = vi.fn();
  const invoke = vi.fn();
  const query = (result: { data: any; error: any }) => {
    const value: any = {
      select: () => value, eq: () => value, in: () => value, or: () => value,
      order: () => value, limit: () => value, single: () => Promise.resolve(result),
      insert: () => value, update: () => value, upsert: () => value,
      delete: () => { deleteProfile(); return value; },
      then: (resolve: any) => Promise.resolve(result).then(resolve),
    };
    return value;
  };
  const testProfileId = "11111111-1111-4111-8111-111111111111";
  const testUserId = "22222222-2222-4222-8222-222222222222";
  const supabase = {
    rpc: vi.fn((name: string) => name === "admin_list_profiles"
      ? Promise.resolve({ data: [{
        id: testProfileId, user_id: testUserId, display_name: "Mogzy Owner",
        avatar_url: null, age: null, location: null, status_message: null,
        is_pro: true, is_bot: false, is_anonymous: false, diamonds: 10,
        elo_shields: 1, reveals: 2, rewinds: 3, boost_credits: 4,
        active_boost_until: null, profile_frame: "default", admin_notes: null,
        is_flagged_underage: false, created_at: "2026-08-01T00:00:00Z",
        last_seen_at: "2026-08-19T00:00:00Z", ads_enabled: true,
      }], error: null })
      : Promise.resolve({ data: [{ id: "f1", profile_id: testProfileId, title: "Great idea", category: "General", status: "open", created_at: "2026-08-18T00:00:00Z" }], error: null })),
    from: vi.fn((table: string) => query({
      data: table === "user_roles"
        ? [{ user_id: testUserId, role: "admin" }]
        : table === "feedback"
          ? [{ id: "f1", title: "Great idea", category: "General", status: "open", created_at: "2026-08-18T00:00:00Z" }]
          : [],
      error: null,
    })),
    functions: { invoke },
  };
  return { deleteProfile, invoke, supabase };
});

vi.mock("@/integrations/supabase/client", () => ({ supabase }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe("COM1-2 · the ?user deep link", () => {
  beforeEach(() => {
    invoke.mockReset();
    invoke.mockResolvedValue({ data: { auth_info: {
      email: "owner@example.com", email_confirmed: true, email_confirmed_at: "2026-08-01T00:00:00Z",
      created_at: "2026-08-01T00:00:00Z", last_sign_in_at: "2026-08-19T00:00:00Z",
      is_anonymous: false, banned_until: null, provider: "email",
    } }, error: null });
  });

  it("preselects the profile the Community drawer handed over", async () => {
    mount(
      <AdminUsers isMasterAdmin />,
      `/admin/people?section=users&user=${profile.id}`,
    );
    // No click: the detail view opens because the URL named this account. This
    // is what lets the drawer's Users tab be an entry point rather than a
    // second implementation of notes, roles and account actions.
    await screen.findByText("Profile UUID:");
    expect(screen.getByText(profile.id)).toBeInTheDocument();
  });

  it("ignores a profile id that is not in the directory", async () => {
    mount(
      <AdminUsers isMasterAdmin />,
      "/admin/people?section=users&user=99999999-9999-4999-8999-999999999999",
    );
    await screen.findByText("Mogzy Owner");
    // The list renders; nothing is selected, and nothing throws.
    expect(screen.queryByText("Profile UUID:")).not.toBeInTheDocument();
  });

  it("opens nothing when no user is named", async () => {
    mount(<AdminUsers isMasterAdmin />);
    await screen.findByText("Mogzy Owner");
    expect(screen.queryByText("Profile UUID:")).not.toBeInTheDocument();
  });
});

describe("AdminUsers Phase 1 safety", () => {
  beforeEach(() => {
    deleteProfile.mockClear();
    invoke.mockReset();
    invoke.mockResolvedValue({ data: { auth_info: {
      email: "owner@example.com", email_confirmed: true, email_confirmed_at: "2026-08-01T00:00:00Z",
      created_at: "2026-08-01T00:00:00Z", last_sign_in_at: "2026-08-19T00:00:00Z",
      is_anonymous: false, banned_until: null, provider: "email",
    } }, error: null });
  });

  async function openUser() {
    mount(<AdminUsers isMasterAdmin />);
    fireEvent.click(await screen.findByText("Mogzy Owner"));
    await screen.findByText("Profile UUID:");
  }

  it("loads existing identity information and keeps mutations closed", async () => {
    await openUser();
    expect(screen.getByText(profile.id)).toBeInTheDocument();
    expect(screen.queryByText("Save Profile Changes")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /account/i }));
    expect(await screen.findByRole("button", { name: /account actions/i })).toBeInTheDocument();
    expect(deleteProfile).not.toHaveBeenCalled();
  });

  it("uses accurate generated-link labels and opening actions performs nothing", async () => {
    await openUser();
    fireEvent.click(screen.getByRole("button", { name: /^account$/i }));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("admin-user-actions", expect.anything()));
    const callsBeforeOpening = invoke.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: /account actions/i }));
    expect(await screen.findByText("Generate Password Recovery Link")).toBeInTheDocument();
    expect(screen.getByText(/not emailed automatically/i)).toBeInTheDocument();
    expect(invoke).toHaveBeenCalledTimes(callsBeforeOpening);
  });

  it("renders selected-user feedback", async () => {
    await openUser();
    fireEvent.click(screen.getByRole("button", { name: /feedback/i }));
    expect(await screen.findByText("Great idea")).toBeInTheDocument();
    expect(screen.getByText(/General/)).toBeInTheDocument();
  });

  it("requires confirmation, cancel is inert, and confirm deletes once", async () => {
    await openUser();
    fireEvent.click(screen.getByRole("button", { name: /^account$/i }));
    fireEvent.click(await screen.findByRole("button", { name: /account actions/i }));
    fireEvent.click(await screen.findByRole("button", { name: /delete user profile/i }));
    expect(screen.getByText(/does not delete the Supabase Auth user/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(deleteProfile).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /delete user profile/i }));
    fireEvent.click(screen.getByRole("button", { name: "Delete User Profile" }));
    await waitFor(() => expect(deleteProfile).toHaveBeenCalledTimes(1));
  });

  it("distinguishes a failed users query from an empty result", async () => {
    const normalRpc = supabase.rpc.getMockImplementation();
    supabase.rpc.mockImplementationOnce(() => Promise.resolve({ data: null, error: { message: "denied" } }));
    mount(<AdminUsers isMasterAdmin />);
    expect(await screen.findByRole("alert")).toHaveTextContent("admin users query failed");
    expect(screen.queryByText("No users found")).not.toBeInTheDocument();
    if (normalRpc) supabase.rpc.mockImplementation(normalRpc);
  });
});
