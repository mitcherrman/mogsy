/** EMAIL1 — Settings › Email preferences. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const auth = vi.hoisted(() => ({ user: null as null | { id: string; email?: string | null; is_anonymous?: boolean } }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: auth.user }) }));

const client = vi.hoisted(() => ({
  fetchOwnSubscription: vi.fn(),
  requestEmailSubscription: vi.fn(),
  setEmailTopics: vi.fn(),
  unsubscribeSelf: vi.fn(),
}));
vi.mock("@/lib/email/subscription-client", () => client);
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), message: vi.fn() }) }));

import EmailPreferences from "./EmailPreferences";
import { toast } from "sonner";

const user = { id: "u-1", email: "me@example.com", is_anonymous: false };
const sub = (over: Record<string, unknown>) => ({ status: "none", topics: [], pendingTopics: [], emailNormalized: "me@example.com", ...over });

beforeEach(() => {
  vi.stubEnv("VITE_EMAIL_SUBSCRIPTIONS_ENABLED", "true");
  auth.user = user;
  Object.values(client).forEach((f) => f.mockReset());
  client.fetchOwnSubscription.mockResolvedValue(null);
  client.requestEmailSubscription.mockResolvedValue({ ok: true, result: "confirmation_required", emailSent: true });
  client.setEmailTopics.mockResolvedValue({ ok: true, result: "updated" });
  client.unsubscribeSelf.mockResolvedValue({ ok: true, result: "unsubscribed" });
});
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe("EmailPreferences", () => {
  it("renders nothing and fetches nothing while the feature is off", async () => {
    vi.stubEnv("VITE_EMAIL_SUBSCRIPTIONS_ENABLED", "");
    const { container } = render(<EmailPreferences />);
    expect(container.innerHTML).toBe("");
    expect(client.fetchOwnSubscription).not.toHaveBeenCalled();
  });

  it("asks guests to create an account, and fetches nothing", () => {
    auth.user = { id: "g", email: null, is_anonymous: true };
    render(<EmailPreferences />);
    expect(screen.getByTestId("email-prefs-needs-account")).toBeTruthy();
    expect(client.fetchOwnSubscription).not.toHaveBeenCalled();
  });

  it("starts with every topic unchecked and the request button disabled", async () => {
    render(<EmailPreferences />);
    await screen.findByTestId("email-prefs-request");
    for (const t of ["daily_reminder", "product_news", "events", "promotions"]) {
      expect(screen.getByTestId(`email-topic-${t}`).getAttribute("aria-checked")).toBe("false");
    }
    expect((screen.getByTestId("email-prefs-request") as HTMLButtonElement).disabled).toBe(true);
    expect(client.fetchOwnSubscription).toHaveBeenCalledWith("u-1", "me@example.com");
  });

  it("requesting asks for a confirmation link — it does not claim to subscribe", async () => {
    render(<EmailPreferences />);
    await screen.findByTestId("email-prefs-request");
    await act(async () => { fireEvent.click(screen.getByTestId("email-topic-events")); });
    await act(async () => { fireEvent.click(screen.getByTestId("email-prefs-request")); });
    expect(client.requestEmailSubscription).toHaveBeenCalledWith(["events"]);
    expect((toast as unknown as { success: ReturnType<typeof vi.fn> }).success).toHaveBeenCalledWith(expect.stringMatching(/confirm/i));
    expect(screen.getByTestId("email-prefs-request").textContent).toMatch(/confirmation link/i);
  });

  it("tells the truth when the confirmation email could not be sent", async () => {
    client.requestEmailSubscription.mockResolvedValue({ ok: true, result: "confirmation_required", emailSent: false });
    render(<EmailPreferences />);
    await screen.findByTestId("email-prefs-request");
    await act(async () => { fireEvent.click(screen.getByTestId("email-topic-events")); });
    await act(async () => { fireEvent.click(screen.getByTestId("email-prefs-request")); });
    expect((toast as unknown as { error: ReturnType<typeof vi.fn> }).error).toHaveBeenCalledWith(expect.stringMatching(/couldn't send/i));
  });

  it("shows pending state with the requested topics pre-selected, resend and cancel", async () => {
    client.fetchOwnSubscription.mockResolvedValue(sub({ status: "pending", pendingTopics: ["daily_reminder"] }));
    render(<EmailPreferences />);
    expect(await screen.findByTestId("email-prefs-pending")).toBeTruthy();
    expect(screen.getByTestId("email-topic-daily_reminder").getAttribute("aria-checked")).toBe("true");
    expect(screen.getByTestId("email-prefs-request").textContent).toMatch(/resend/i);
    await act(async () => { fireEvent.click(screen.getByTestId("email-prefs-cancel")); });
    expect(client.unsubscribeSelf).toHaveBeenCalledOnce();
  });

  it("a subscribed user can change topics, and unsubscribe from all in one click", async () => {
    client.fetchOwnSubscription.mockResolvedValue(sub({ status: "subscribed", topics: ["daily_reminder", "events"] }));
    render(<EmailPreferences />);
    expect(await screen.findByTestId("email-prefs-subscribed")).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByTestId("email-topic-events")); }); // uncheck
    await act(async () => { fireEvent.click(screen.getByTestId("email-prefs-save")); });
    expect(client.setEmailTopics).toHaveBeenCalledWith(["daily_reminder"]);
    await act(async () => { fireEvent.click(screen.getByTestId("email-prefs-unsubscribe")); });
    expect(client.unsubscribeSelf).toHaveBeenCalledOnce();
  });

  it("an unsubscribed user must re-confirm by email to come back", async () => {
    client.fetchOwnSubscription.mockResolvedValue(sub({ status: "unsubscribed" }));
    render(<EmailPreferences />);
    expect(await screen.findByTestId("email-prefs-unsubscribed")).toBeTruthy();
    expect(screen.getByTestId("email-prefs-request").textContent).toMatch(/confirmation link/i);
    expect(screen.queryByTestId("email-prefs-save")).toBeNull();
  });

  it("a suppressed address shows no controls at all", async () => {
    client.fetchOwnSubscription.mockResolvedValue(sub({ status: "suppressed" }));
    render(<EmailPreferences />);
    expect(await screen.findByTestId("email-prefs-suppressed")).toBeTruthy();
    expect(screen.queryByTestId("email-prefs-request")).toBeNull();
    expect(screen.queryByTestId("email-topic-events")).toBeNull();
  });

  it("surfaces a failed save without changing state", async () => {
    client.requestEmailSubscription.mockResolvedValue({ ok: false, error: "x" });
    render(<EmailPreferences />);
    await screen.findByTestId("email-prefs-request");
    await act(async () => { fireEvent.click(screen.getByTestId("email-topic-events")); });
    await act(async () => { fireEvent.click(screen.getByTestId("email-prefs-request")); });
    await waitFor(() => expect((toast as unknown as { error: ReturnType<typeof vi.fn> }).error).toHaveBeenCalled());
  });
});
