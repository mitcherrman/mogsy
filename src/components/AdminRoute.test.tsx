import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { useRef } from "react";
import AdminRoute from "./AdminRoute";

// Mutable auth state the mocked hook returns; we swap `user` between renders to
// simulate Supabase emitting onAuthStateChange (token refresh) with a fresh user
// object that has the SAME id.
let authState: { user: { id: string } | null; loading: boolean } = {
  user: { id: "user-1" },
  loading: false,
};
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => authState }));
vi.mock("@/lib/e2e/identity", () => ({ getE2EIdentity: () => null }));
// has_role RPC always authorizes.
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: vi.fn(async () => ({ data: true, error: null })) },
}));

// A child that counts how many times it MOUNTS. If AdminRoute unmounts/remounts
// it on a benign re-auth, the count increments and any local state is lost.
let mountCount = 0;
function Child() {
  const first = useRef(false);
  if (!first.current) {
    first.current = true;
    mountCount += 1;
  }
  return <div data-testid="admin-child">child mounts: {mountCount}</div>;
}

afterEach(() => {
  cleanup();
  mountCount = 0;
  authState = { user: { id: "user-1" }, loading: false };
});

async function flush() {
  // let the has_role effect resolve
  await vi.waitFor(() => expect(screen.queryByTestId("admin-child")).not.toBeNull());
}

describe("AdminRoute — benign re-auth must not remount children (Defect 1)", () => {
  it("keeps the same child instance across a same-id user object change", async () => {
    const { rerender } = render(
      <MemoryRouter><AdminRoute><Child /></AdminRoute></MemoryRouter>,
    );
    await flush();
    expect(mountCount).toBe(1);

    // Simulate a token refresh: NEW user object, SAME id (what Supabase emits on
    // window focus / visibility). AdminRoute must not re-gate and remount.
    authState = { user: { id: "user-1" }, loading: false };
    rerender(<MemoryRouter><AdminRoute><Child /></AdminRoute></MemoryRouter>);
    await flush();

    // If the fix is in place, the child was never remounted.
    expect(mountCount).toBe(1);
  });

  it("still re-gates when the user id actually changes", async () => {
    const { rerender } = render(
      <MemoryRouter><AdminRoute><Child /></AdminRoute></MemoryRouter>,
    );
    await flush();
    expect(mountCount).toBe(1);

    authState = { user: { id: "user-2" }, loading: false };
    rerender(<MemoryRouter><AdminRoute><Child /></AdminRoute></MemoryRouter>);
    await flush();

    // A genuinely different user must trigger a fresh authorization + remount.
    expect(mountCount).toBe(2);
  });

  it("denies (redirects) when there is no user", async () => {
    authState = { user: null, loading: false };
    render(
      <MemoryRouter initialEntries={["/admin/x"]}>
        <AdminRoute><Child /></AdminRoute>
      </MemoryRouter>,
    );
    await vi.waitFor(() => expect(screen.queryByTestId("admin-child")).toBeNull());
  });
});
