/**
 * EMAIL1 — /email/confirm and /email/unsubscribe. The property that matters:
 * LOADING a link changes nothing (mail scanners GET every URL); only a person
 * pressing the button does.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const client = vi.hoisted(() => ({
  confirmEmailToken: vi.fn(),
  previewUnsubscribe: vi.fn(),
  unsubscribeWithToken: vi.fn(),
}));
vi.mock("@/lib/email/subscription-client", () => client);
vi.mock("@/components/SEOHead", () => ({ default: () => null }));

import EmailConfirm from "./EmailConfirm";
import EmailUnsubscribe from "./EmailUnsubscribe";

const at = (ui: React.ReactElement, url: string) => render(<MemoryRouter initialEntries={[url]}>{ui}</MemoryRouter>);

beforeEach(() => {
  Object.values(client).forEach((f) => f.mockReset());
  client.confirmEmailToken.mockResolvedValue({ ok: true, result: "confirmed", emailMasked: "m***@example.com", topics: ["daily_reminder"] });
  client.previewUnsubscribe.mockResolvedValue({ ok: true, result: "ok", emailMasked: "m***@example.com" });
  client.unsubscribeWithToken.mockResolvedValue({ ok: true, result: "unsubscribed", emailMasked: "m***@example.com" });
});
afterEach(cleanup);

describe("/email/confirm", () => {
  it("does NOT confirm on load", async () => {
    at(<EmailConfirm />, "/email/confirm?t=abc");
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(client.confirmEmailToken).not.toHaveBeenCalled();
    expect(screen.getByTestId("email-confirm-button")).toBeTruthy();
  });

  it("confirms when the person presses the button, and says what they subscribed to", async () => {
    at(<EmailConfirm />, "/email/confirm?t=abc");
    await act(async () => { fireEvent.click(screen.getByTestId("email-confirm-button")); });
    expect(client.confirmEmailToken).toHaveBeenCalledWith("abc");
    const done = await screen.findByTestId("email-confirm-done");
    expect(done.textContent).toContain("m***@example.com");
    expect(done.textContent).toContain("Daily Challenge reminders");
  });

  it.each([
    ["expired", /expired/i],
    ["invalid", /isn't valid/i],
    ["suppressed", /can't email/i],
    ["already_confirmed", /already confirmed/i],
  ])("renders the %s outcome", async (result, text) => {
    client.confirmEmailToken.mockResolvedValue({ ok: true, result });
    at(<EmailConfirm />, "/email/confirm?t=abc");
    await act(async () => { fireEvent.click(screen.getByTestId("email-confirm-button")); });
    await waitFor(() => expect(document.body.textContent).toMatch(text));
  });

  it("a link with no token is simply invalid and calls nothing", () => {
    at(<EmailConfirm />, "/email/confirm");
    expect(document.body.textContent).toMatch(/isn't valid/i);
    expect(screen.queryByTestId("email-confirm-button")).toBeNull();
    expect(client.confirmEmailToken).not.toHaveBeenCalled();
  });

  it("recovers from a network error", async () => {
    client.confirmEmailToken.mockResolvedValue({ ok: false });
    at(<EmailConfirm />, "/email/confirm?t=abc");
    await act(async () => { fireEvent.click(screen.getByTestId("email-confirm-button")); });
    expect(await screen.findByText(/something went wrong/i)).toBeTruthy();
  });
});

describe("/email/unsubscribe", () => {
  it("only PREVIEWS on load — it never unsubscribes without the button", async () => {
    at(<EmailUnsubscribe />, "/email/unsubscribe?t=tok");
    expect(await screen.findByTestId("email-unsubscribe-button")).toBeTruthy();
    expect(client.previewUnsubscribe).toHaveBeenCalledWith("tok");
    expect(client.unsubscribeWithToken).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("m***@example.com");
  });

  it("works with no session at all (nothing here reads auth)", async () => {
    at(<EmailUnsubscribe />, "/email/unsubscribe?t=tok");
    const btn = await screen.findByTestId("email-unsubscribe-button");
    await act(async () => { fireEvent.click(btn); });
    expect(client.unsubscribeWithToken).toHaveBeenCalledWith("tok");
    expect((await screen.findByTestId("email-unsubscribe-done")).textContent).toMatch(/won't get any more/i);
  });

  it("an invalid or missing token explains the alternative", async () => {
    client.previewUnsubscribe.mockResolvedValue({ ok: true, result: "invalid" });
    at(<EmailUnsubscribe />, "/email/unsubscribe?t=bad");
    expect(await screen.findByText(/isn't valid/i)).toBeTruthy();
    cleanup();
    at(<EmailUnsubscribe />, "/email/unsubscribe");
    expect(screen.getByText(/isn't valid/i)).toBeTruthy();
    expect(client.previewUnsubscribe).toHaveBeenCalledTimes(1);
  });

  it("reports an already-unsubscribed address plainly", async () => {
    client.unsubscribeWithToken.mockResolvedValue({ ok: true, result: "already_unsubscribed", emailMasked: "m***@example.com" });
    at(<EmailUnsubscribe />, "/email/unsubscribe?t=tok");
    const btn = await screen.findByTestId("email-unsubscribe-button");
    await act(async () => { fireEvent.click(btn); });
    expect(await screen.findByText(/already unsubscribed/i)).toBeTruthy();
  });
});
