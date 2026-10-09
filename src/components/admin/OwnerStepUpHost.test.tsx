// OWN1.1 — per-action MFA prompt: renders over the page (nothing unmounts),
// resolves true only after a verified code, false when dismissed.
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const verify = vi.hoisted(() => ({ ok: true }));
const refresh = vi.hoisted(() => vi.fn(async () => ({})));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      mfa: {
        listFactors: async () => ({ data: { totp: [{ id: "f1", status: "verified" }] }, error: null }),
        challengeAndVerify: async () => ({ error: verify.ok ? null : { message: "bad" } }),
      },
    },
  },
}));
vi.mock("@/lib/admin-auth/ownerDevice", () => ({ enrollThisDevice: vi.fn(async () => true) }));
vi.mock("@/lib/admin-auth/ownerSession", () => ({ refreshOwnerSession: refresh }));

import { OwnerStepUpHost } from "./OwnerStepUpHost";
import { requestOwnerStepUp } from "@/lib/admin-auth/ownerStepUpRequest";

afterEach(() => {
  cleanup();
  verify.ok = true;
  refresh.mockClear();
});

function Page() {
  return <div data-testid="admin-page">admin page</div>;
}

describe("OwnerStepUpHost", () => {
  it("without a mounted host a request resolves false (nothing runs, nothing hangs)", async () => {
    expect(await requestOwnerStepUp("Ban this account")).toBe(false);
  });

  it("verifies for one action while the admin page stays mounted", async () => {
    render(<><Page /><OwnerStepUpHost /></>);
    let result: Promise<boolean>;
    act(() => {
      result = requestOwnerStepUp("Banning this account");
    });
    expect(await screen.findByTestId("owner-step-up-dialog")).toBeTruthy();
    expect(screen.getByText(/Banning this account needs a fresh check/)).toBeTruthy();
    expect(screen.getByTestId("admin-page")).toBeTruthy();
    // No "trust this browser" offer for a per-action check.
    expect(screen.queryByText(/Trust this browser/)).toBeNull();

    fireEvent.change(screen.getByTestId("owner-step-up-code"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify" }));
    await expect(result!).resolves.toBe(true);
    expect(refresh).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByTestId("owner-step-up-dialog")).toBeNull());
    expect(screen.getByTestId("admin-page")).toBeTruthy();
  });

  it("a wrong code keeps the prompt open and resolves nothing", async () => {
    verify.ok = false;
    render(<OwnerStepUpHost />);
    let settled = false;
    act(() => {
      void requestOwnerStepUp("Purging anonymous users").then(() => { settled = true; });
    });
    fireEvent.change(await screen.findByTestId("owner-step-up-code"), { target: { value: "000000" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(settled).toBe(false);
  });

  it("dismissing the prompt resolves false", async () => {
    render(<OwnerStepUpHost />);
    let result: Promise<boolean>;
    act(() => {
      result = requestOwnerStepUp("Granting Premium");
    });
    await screen.findByTestId("owner-step-up-dialog");
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    await expect(result!).resolves.toBe(false);
  });

  it("concurrent requests share one prompt", async () => {
    render(<OwnerStepUpHost />);
    let a: Promise<boolean>, b: Promise<boolean>;
    act(() => {
      a = requestOwnerStepUp("A");
      b = requestOwnerStepUp("B");
    });
    expect(await screen.findAllByTestId("owner-step-up-dialog")).toHaveLength(1);
    fireEvent.change(screen.getByTestId("owner-step-up-code"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify" }));
    await expect(Promise.all([a!, b!])).resolves.toEqual([true, true]);
  });
});
