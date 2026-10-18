/**
 * EMAIL1 — Admin › Users shows newsletter status per account without changing
 * anything else about the list, and degrades to nothing when the owner RPC is
 * unavailable (not the owner, or the staged SQL not applied).
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminUsers from "./AdminUsers";

const OWNER_PROFILE = "11111111-1111-4111-8111-111111111111";
const OWNER_USER = "22222222-2222-4222-8222-222222222222";
const OTHER_PROFILE = "33333333-3333-4333-8333-333333333333";
const OTHER_USER = "44444444-4444-4444-8444-444444444444";

const row = (id: string, user_id: string, name: string) => ({
  id, user_id, display_name: name, avatar_url: null, age: null, location: null, status_message: null,
  is_pro: false, is_bot: false, is_anonymous: false, diamonds: 0, elo_shields: 0, reveals: 0, rewinds: 0,
  boost_credits: 0, active_boost_until: null, profile_frame: "default", admin_notes: null,
  is_flagged_underage: false, created_at: "2026-08-01T00:00:00Z", last_seen_at: "2026-08-19T00:00:00Z", ads_enabled: true,
});

const h = vi.hoisted(() => {
  const emailRpc = vi.fn();
  const invoke = vi.fn();
  const query = (result: { data: any; error: any }) => {
    const v: any = {
      select: () => v, eq: () => v, in: () => v, or: () => v, order: () => v, limit: () => v,
      single: () => Promise.resolve(result), insert: () => v, update: () => v, upsert: () => v, delete: () => v,
      then: (resolve: any) => Promise.resolve(result).then(resolve),
    };
    return v;
  };
  return { emailRpc, invoke, query };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: vi.fn((name: string, args?: unknown) => {
      if (name === "admin_list_profiles") return Promise.resolve({ data: [
        row(OWNER_PROFILE, OWNER_USER, "Ada Subscribed"), row(OTHER_PROFILE, OTHER_USER, "Bo Plain"),
      ], error: null });
      if (name === "admin_list_identity_links") return Promise.resolve({ data: [], error: null });
      if (name === "admin_email_subscription_status") return h.emailRpc(args);
      return h.query({ data: [], error: null });
    }),
    from: vi.fn(() => h.query({ data: [], error: null })),
    functions: { invoke: h.invoke },
  },
}));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock("@/lib/admin-auth/ownerSession", () => ({
  refreshOwnerSession: async () => ({ freshAal2: true }),
  ensureOwnerAuthorized: async () => true,
}));
vi.mock("@/lib/admin-auth/ownerStepUpRequest", () => ({ requestOwnerStepUp: async () => true }));
vi.mock("@/components/admin/AdminNewsletter", () => ({ default: () => <div data-testid="newsletter-workspace" /> }));

const mount = () => render(<MemoryRouter initialEntries={["/admin/users?section=accounts"]}><AdminUsers isMasterAdmin /></MemoryRouter>);

beforeEach(() => {
  h.emailRpc.mockReset();
  h.invoke.mockReset();
  h.invoke.mockResolvedValue({ data: { emails: { [OWNER_USER]: "ada@example.com", [OTHER_USER]: "bo@example.com" } }, error: null });
});

describe("Admin Users · newsletter status", () => {
  it("tags a reachable subscriber and leaves everyone else untagged", async () => {
    h.emailRpc.mockResolvedValue({ data: [{
      user_id: OWNER_USER, status: "subscribed", topics: ["daily_reminder"], pending_topics: [], confirmed_at: "2026-09-01T00:00:00Z",
      suppressed: false, address_current: true,
    }], error: null });
    mount();
    await screen.findByText("Ada Subscribed");
    await waitFor(() => expect(screen.getByText("Newsletter", { selector: "span" })).toBeInTheDocument());
    expect(screen.getAllByText("Newsletter", { selector: "span" })).toHaveLength(1);
    expect(h.emailRpc).toHaveBeenCalledWith({ _user_ids: expect.arrayContaining([OWNER_USER, OTHER_USER]) });
  });

  it("the Newsletter filter lists only accounts that would actually be mailed", async () => {
    h.emailRpc.mockResolvedValue({ data: [
      { user_id: OWNER_USER, status: "subscribed", topics: ["events"], pending_topics: [], confirmed_at: null, suppressed: false, address_current: true },
      { user_id: OTHER_USER, status: "subscribed", topics: ["events"], pending_topics: [], confirmed_at: null, suppressed: false, address_current: false },
    ], error: null });
    mount();
    await screen.findByText("Ada Subscribed");
    await waitFor(() => expect(screen.getAllByText(/Newsletter/, { selector: "span" }).length).toBeGreaterThan(0));
    fireEvent.click(screen.getByTestId("accounts-filter-newsletter"));
    expect(screen.getByText("Ada Subscribed")).toBeInTheDocument();
    expect(screen.queryByText("Bo Plain")).not.toBeInTheDocument(); // consent was for an old address
  });

  it("flags a suppressed or old-address row instead of calling it a subscriber", async () => {
    h.emailRpc.mockResolvedValue({ data: [
      { user_id: OWNER_USER, status: "suppressed", topics: [], pending_topics: [], confirmed_at: null, suppressed: true, address_current: true },
      { user_id: OTHER_USER, status: "subscribed", topics: ["events"], pending_topics: [], confirmed_at: null, suppressed: false, address_current: false },
    ], error: null });
    mount();
    await screen.findByText("Ada Subscribed");
    expect(await screen.findByText("Email suppressed")).toBeInTheDocument();
    expect(screen.getByText("Newsletter · old address")).toBeInTheDocument();
  });

  it("degrades silently: an RPC failure leaves the list intact and raises no error banner", async () => {
    h.emailRpc.mockResolvedValue({ data: null, error: { message: "owner_required" } });
    mount();
    await screen.findByText("Ada Subscribed");
    await screen.findByText("Bo Plain");
    await waitFor(() => expect(h.emailRpc).toHaveBeenCalled());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText("Email pending")).not.toBeInTheDocument();
  });

  it("degrades silently when the RPC throws or returns junk", async () => {
    h.emailRpc.mockRejectedValue(new Error("network"));
    mount();
    await screen.findByText("Ada Subscribed");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("the Newsletter workspace is a page-level action that opens only when asked", async () => {
    h.emailRpc.mockResolvedValue({ data: [], error: null });
    mount();
    await screen.findByText("Ada Subscribed");
    expect(screen.queryByTestId("newsletter-workspace")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("accounts-newsletter"));
    expect(await screen.findByTestId("newsletter-workspace")).toBeInTheDocument();
  });
});
