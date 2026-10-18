/**
 * EMAIL1 — the owner-only Newsletter workspace: authorization failures are
 * shown not swallowed, approval needs fresh MFA, the send panel is blocked by
 * configuration and by a typed confirmation that names the audience size, and
 * the preview is an inert sandboxed document.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  rpc: vi.fn(),
  invoke: vi.fn(),
  gate: { fresh: true, stepUp: vi.fn(async (_r: string) => true) },
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: h.rpc, functions: { invoke: h.invoke } } }));
vi.mock("@/lib/admin-auth/ownerSession", () => ({
  refreshOwnerSession: async () => ({ freshAal2: h.gate.fresh }),
  ensureOwnerAuthorized: async () => true,
}));
vi.mock("@/lib/admin-auth/ownerStepUpRequest", () => ({ requestOwnerStepUp: (r: string) => h.gate.stepUp(r) }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

import AdminNewsletter from "./AdminNewsletter";
import { toast } from "sonner";

const CAMPAIGN_ID = "50000000-0000-4000-8000-000000000001";
const campaign = (over: Record<string, unknown> = {}) => ({
  id: CAMPAIGN_ID, name: "Oct news", subject: "Big news", preheader: null, body_markdown: "Hello", topic: "product_news",
  status: "draft", approved_recipient_count: null, approved_at: null, send_started_at: null, send_completed_at: null,
  updated_at: "2026-10-18T00:00:00Z", ...over,
});
const stats = { by_status: { subscribed: 3, pending: 1 }, eligible_by_topic: { product_news: 3 }, suppressed: 0, opt_ins_30d: 2, unsubscribes_30d: 0 };
const ready: Record<string, unknown> = { send_blocker: null, provider: "resend", provider_ready: true, sending_enabled: true, postal_address_set: true, from_set: true };

let campaigns: unknown[] = [];
let config: Record<string, unknown> = { ...ready, send_blocker: "sending_disabled", sending_enabled: false };

beforeEach(() => {
  h.gate.fresh = true;
  h.gate.stepUp.mockClear();
  campaigns = [];
  config = { ...ready, send_blocker: "sending_disabled", sending_enabled: false };
  h.rpc.mockReset().mockImplementation(async (fn: string, args: any) => {
    if (fn === "admin_email_stats") return { data: stats, error: null };
    if (fn === "admin_newsletter_list_campaigns") return { data: campaigns, error: null };
    if (fn === "admin_newsletter_audience") return { data: 3, error: null };
    if (fn === "admin_newsletter_save_campaign") return { data: CAMPAIGN_ID, error: null };
    if (fn === "admin_newsletter_set_status") return { data: { result: "ok", status: args._status, audience: 3 }, error: null };
    if (fn === "admin_email_list_subscribers") return { data: [{ subscription_id: "s1", email: "a@example.com", status: "subscribed", topics: ["events"] }], error: null };
    return { data: null, error: { message: `unexpected ${fn}` } };
  });
  h.invoke.mockReset().mockImplementation(async (_fn: string, { body }: any) => {
    if (body.action === "config_status") return { data: config, error: null };
    if (body.action === "preview") return { data: { html: "<p>hi</p><script>alert(1)</script>", text: "hi" }, error: null };
    if (body.action === "send_start") return { data: { started: true, processed: 3, progress: { queued: 0, sending: 0, sent: 3, failed: 0, skipped: 0 } }, error: null };
    if (body.action === "test_send") return { data: { result: "sent" }, error: null };
    return { data: { error: "unknown_action" }, error: null };
  });
});
afterEach(cleanup);

const open = async () => {
  render(<AdminNewsletter />);
  await screen.findByTestId("newsletter-overview");
  await waitFor(() => expect(h.invoke).toHaveBeenCalled());
};

describe("Admin Newsletter · authorization and honesty", () => {
  it("shows an owner-only refusal instead of an empty screen", async () => {
    h.rpc.mockImplementation(async () => ({ data: null, error: { message: "owner_required" } }));
    await open();
    expect((await screen.findByTestId("newsletter-load-error")).textContent).toMatch(/owner required/i);
  });

  it("says plainly when the SQL has not been applied", async () => {
    h.rpc.mockImplementation(async () => ({ data: null, error: { message: "Could not find the function public.admin_newsletter_list_campaigns in the schema cache" } }));
    await open();
    expect((await screen.findByTestId("newsletter-load-error")).textContent).toMatch(/not installed yet/i);
  });

  it("states that sending is blocked, and why, by default", async () => {
    await open();
    await waitFor(() => expect(screen.getByTestId("newsletter-config").textContent).toMatch(/Blocked/));
    expect(screen.getByTestId("newsletter-config").textContent).toMatch(/switched off/i);
  });

  it("the subscriber list is loaded only on request", async () => {
    await open();
    expect(h.rpc).not.toHaveBeenCalledWith("admin_email_list_subscribers", expect.anything());
    await act(async () => { fireEvent.click(screen.getByTestId("newsletter-load-subscribers")); });
    expect(await screen.findByText("a@example.com")).toBeInTheDocument();
    expect(h.rpc).toHaveBeenCalledWith("admin_email_list_subscribers", { _status: null, _limit: 25, _offset: 0 });
  });
});

describe("Admin Newsletter · drafting and preview", () => {
  const fill = async () => {
    await act(async () => { fireEvent.click(screen.getByTestId("newsletter-new")); });
    fireEvent.change(screen.getByLabelText("Internal name"), { target: { value: "Oct news" } });
    fireEvent.change(screen.getByLabelText("Subject"), { target: { value: "Big news" } });
    fireEvent.change(screen.getByLabelText(/^Body/), { target: { value: "Hello **world**" } });
  };

  it("saves a draft through the owner RPC", async () => {
    await open();
    await fill();
    await act(async () => { fireEvent.click(screen.getByTestId("newsletter-save")); });
    expect(h.rpc).toHaveBeenCalledWith("admin_newsletter_save_campaign", expect.objectContaining({
      _id: null, _name: "Oct news", _subject: "Big news", _topic: "product_news", _body_markdown: "Hello **world**",
    }));
  });

  it("previews inside a fully sandboxed iframe — scripts, forms and same-origin are all disabled", async () => {
    await open();
    await fill();
    await act(async () => { fireEvent.click(screen.getByTestId("newsletter-preview")); });
    const frame = (await screen.findByTitle("Email preview")) as HTMLIFrameElement;
    expect(frame.getAttribute("sandbox")).toBe(""); // empty value = every restriction on
    expect(frame.getAttribute("srcdoc")).toContain("<p>hi</p>");
  });

  it("cannot save or preview an empty draft", async () => {
    await open();
    await act(async () => { fireEvent.click(screen.getByTestId("newsletter-new")); });
    expect((screen.getByTestId("newsletter-save") as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId("newsletter-preview") as HTMLButtonElement).disabled).toBe(true);
  });

  it("an approved campaign is read-only", async () => {
    campaigns = [campaign({ status: "ready", approved_recipient_count: 3 })];
    await open();
    await act(async () => { fireEvent.click(await screen.findByRole("button", { name: /Oct news/ })); });
    expect((screen.getByLabelText("Subject") as HTMLInputElement).disabled).toBe(true);
    expect(screen.queryByTestId("newsletter-save")).toBeNull();
  });

  it("counts the mailable audience for the chosen topic", async () => {
    await open();
    await act(async () => { fireEvent.click(screen.getByTestId("newsletter-new")); });
    await act(async () => { fireEvent.click(screen.getByTestId("newsletter-audience")); });
    expect(h.rpc).toHaveBeenCalledWith("admin_newsletter_audience", { _topic: "product_news" });
    expect((await screen.findByTestId("newsletter-audience-count")).textContent).toMatch(/3 mailable recipients/);
  });
});

describe("Admin Newsletter · approval and sending", () => {
  it("approval requires a FRESH owner session — it prompts for MFA when the session is stale", async () => {
    h.gate.fresh = false;
    campaigns = [campaign()];
    await open();
    await act(async () => { fireEvent.click(await screen.findByRole("button", { name: /Oct news/ })); });
    await act(async () => { fireEvent.click(screen.getByTestId("newsletter-approve")); });
    expect(h.gate.stepUp).toHaveBeenCalledWith(expect.stringMatching(/approving/i));
    expect(h.rpc).toHaveBeenCalledWith("admin_newsletter_set_status", { _id: CAMPAIGN_ID, _status: "ready" });
  });

  it("a cancelled MFA prompt approves nothing", async () => {
    h.gate.fresh = false;
    h.gate.stepUp.mockResolvedValueOnce(false);
    campaigns = [campaign()];
    await open();
    await act(async () => { fireEvent.click(await screen.findByRole("button", { name: /Oct news/ })); });
    await act(async () => { fireEvent.click(screen.getByTestId("newsletter-approve")); });
    expect(h.rpc).not.toHaveBeenCalledWith("admin_newsletter_set_status", expect.anything());
    expect((toast as unknown as { error: ReturnType<typeof vi.fn> }).error).toHaveBeenCalled();
  });

  const selectReady = async () => {
    campaigns = [campaign({ status: "ready", approved_recipient_count: 3 })];
    await open();
    await act(async () => { fireEvent.click(await screen.findByRole("button", { name: /Oct news/ })); });
  };

  it("with sending blocked by configuration there is no way to send", async () => {
    await selectReady();
    await waitFor(() => expect(screen.getByTestId("newsletter-send-blocked")).toBeInTheDocument());
    expect(screen.queryByTestId("newsletter-send")).toBeNull();
    expect(screen.getByTestId("newsletter-send-blocked").textContent).toMatch(/switched off/i);
  });

  it("when fully configured the send button stays disabled until the exact phrase is typed", async () => {
    config = { ...ready };
    await selectReady();
    const send = (await screen.findByTestId("newsletter-send")) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    const input = screen.getByTestId("newsletter-confirm-input");
    for (const wrong of ["SEND", "send 3", "SEND 2", "SEND 3 "]) {
      fireEvent.change(input, { target: { value: wrong } });
      expect(send.disabled, wrong).toBe(true);
    }
    fireEvent.change(input, { target: { value: "SEND 3" } });
    expect(send.disabled).toBe(false);
  });

  it("starting a send names the approved audience size and the confirmation to the server", async () => {
    config = { ...ready };
    await selectReady();
    fireEvent.change(await screen.findByTestId("newsletter-confirm-input"), { target: { value: "SEND 3" } });
    await act(async () => { fireEvent.click(screen.getByTestId("newsletter-send")); });
    expect(h.invoke).toHaveBeenCalledWith("newsletter-admin", {
      body: { action: "send_start", campaign_id: CAMPAIGN_ID, expected_count: 3, confirm: "SEND 3" },
    });
  });

  it("surfaces a server-side refusal (e.g. the audience changed) and stays unsent", async () => {
    config = { ...ready };
    h.invoke.mockImplementation(async (_f: string, { body }: any) =>
      body.action === "config_status" ? { data: config, error: null }
        : { data: { error: "count_changed", current: 5 }, error: null });
    await selectReady();
    fireEvent.change(await screen.findByTestId("newsletter-confirm-input"), { target: { value: "SEND 3" } });
    await act(async () => { fireEvent.click(screen.getByTestId("newsletter-send")); });
    expect((toast as unknown as { error: ReturnType<typeof vi.fn> }).error).toHaveBeenCalledWith("count changed");
    expect(screen.queryByTestId("newsletter-progress")).toBeNull();
  });

  it("a test send goes through the Edge Function and never needs the kill-switch", async () => {
    campaigns = [campaign()];
    await open();
    await act(async () => { fireEvent.click(await screen.findByRole("button", { name: /Oct news/ })); });
    await act(async () => { fireEvent.click(screen.getByTestId("newsletter-test")); });
    expect(h.invoke).toHaveBeenCalledWith("newsletter-admin", { body: { action: "test_send", campaign_id: CAMPAIGN_ID } });
  });
});
