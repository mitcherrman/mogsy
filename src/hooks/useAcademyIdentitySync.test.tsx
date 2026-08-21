/**
 * The identity bridge (HI1-C5B).
 *
 * What it has to get right is narrow and entirely about restraint: adopt when
 * an account appears, do it once per identity, retry only what is retryable,
 * and never fire on a signed-out app — which is the state most of this app's
 * visitors are in for the whole of their session.
 */
import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  onAuthStateChange: vi.fn(),
  unsubscribe: vi.fn(),
  adopt: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { onAuthStateChange: hoisted.onAuthStateChange } },
}));
vi.mock("@/lib/welcome/provisional-identity", () => ({
  adoptAcademyIdentity: hoisted.adopt,
}));

import { useAcademyIdentitySync } from "./useAcademyIdentitySync";

type Handler = (event: string, session: { user: { id: string } } | null) => void;
let emit: Handler;

function Harness() {
  useAcademyIdentitySync();
  return null;
}

/** Let the adoption promise and its `.then` settle. */
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  vi.clearAllMocks();
  hoisted.adopt.mockResolvedValue({ written: [], settled: true });
  hoisted.onAuthStateChange.mockImplementation((handler: Handler) => {
    emit = handler;
    return { data: { subscription: { unsubscribe: hoisted.unsubscribe } } };
  });
});

describe("the identity bridge", () => {
  it("adopts when an account appears", async () => {
    render(<Harness />);
    emit("SIGNED_IN", { user: { id: "u1" } });
    await flush();
    expect(hoisted.adopt).toHaveBeenCalledWith("u1");
  });

  it("does nothing at all while nobody is signed in", async () => {
    render(<Harness />);
    emit("INITIAL_SESSION", null);
    await flush();
    expect(hoisted.adopt).not.toHaveBeenCalled();
  });

  it("adopts once per identity, however many events Supabase emits", async () => {
    render(<Harness />);
    emit("INITIAL_SESSION", { user: { id: "u1" } });
    await flush();
    emit("TOKEN_REFRESHED", { user: { id: "u1" } });
    emit("USER_UPDATED", { user: { id: "u1" } });
    await flush();
    expect(hoisted.adopt).toHaveBeenCalledTimes(1);
  });

  it("tries again for the same account after a retryable outcome", async () => {
    // A profile row can lag its auth user — handle_new_user runs on the auth
    // trigger — so "not settled" has to mean "ask again", not "give up".
    hoisted.adopt.mockResolvedValueOnce({ written: [], settled: false, reason: "no-profile" });
    render(<Harness />);
    emit("INITIAL_SESSION", { user: { id: "u1" } });
    await flush();
    emit("TOKEN_REFRESHED", { user: { id: "u1" } });
    await flush();
    expect(hoisted.adopt).toHaveBeenCalledTimes(2);
  });

  it("treats a different account as a different identity", async () => {
    render(<Harness />);
    emit("SIGNED_IN", { user: { id: "u1" } });
    await flush();
    emit("SIGNED_IN", { user: { id: "u2" } });
    await flush();
    expect(hoisted.adopt).toHaveBeenNthCalledWith(1, "u1");
    expect(hoisted.adopt).toHaveBeenNthCalledWith(2, "u2");
  });

  it("re-arms after a sign-out, so signing back in is considered again", async () => {
    render(<Harness />);
    emit("SIGNED_IN", { user: { id: "u1" } });
    await flush();
    emit("SIGNED_OUT", null);
    emit("SIGNED_IN", { user: { id: "u1" } });
    await flush();
    expect(hoisted.adopt).toHaveBeenCalledTimes(2);
  });

  it("unsubscribes when it goes away", () => {
    const view = render(<Harness />);
    view.unmount();
    expect(hoisted.unsubscribe).toHaveBeenCalled();
  });

  it("renders nothing and never throws when the adoption rejects", async () => {
    hoisted.adopt.mockRejectedValue(new Error("network"));
    const view = render(<Harness />);
    emit("SIGNED_IN", { user: { id: "u1" } });
    await flush();
    expect(view.container.innerHTML).toBe("");
  });
});
