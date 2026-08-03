import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AdminPushNotifications from "./AdminPushNotifications";

/**
 * The console must not claim delivery it cannot perform.
 *
 * League / category / Pro targeting wrote cohort columns that no policy and no
 * client ever read, so those sends reached nobody while reporting success.
 * Scheduling and recurrence had no consumer at all and were delivered
 * immediately. Both are gone; these tests keep them gone.
 */

const authState = vi.hoisted(() => ({ user: { id: "admin-uid" } as { id: string } | null }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => authState }));

const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), toasts) }));

const db = vi.hoisted(() => ({
  insertError: null as any,
  insertPayloads: [] as any[],
}));

vi.mock("@/integrations/supabase/client", () => {
  const makeBuilder = () => {
    const b: Record<string, unknown> = {};
    const chain = () => b;
    Object.assign(b, {
      select: chain, eq: chain, in: chain, ilike: chain, order: chain, delete: chain,
      limit: () => Promise.resolve({ data: [], error: null }),
      insert: (payload: unknown) => {
        db.insertPayloads.push(payload);
        return Promise.resolve({ data: null, error: db.insertError });
      },
      then: (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null }),
    });
    return b;
  };
  return { supabase: { from: () => makeBuilder() } };
});

beforeEach(() => {
  authState.user = { id: "admin-uid" };
  db.insertError = null;
  db.insertPayloads = [];
});
afterEach(() => vi.clearAllMocks());

async function renderComposer() {
  render(<AdminPushNotifications />);
  // Composer is behind the loading gate.
  await waitFor(() => expect(screen.queryByText("Loading...")).toBeNull());
}

describe("AdminPushNotifications — only real delivery capabilities", () => {
  it("offers no targeting mode other than all users", async () => {
    await renderComposer();
    expect(screen.getByTestId("target-audience-all")).toBeTruthy();
    expect(screen.queryByText("Specific Leagues")).toBeNull();
    expect(screen.queryByText("By Category")).toBeNull();
    expect(screen.queryByText("Pro Only")).toBeNull();
  });

  it("offers no scheduling or recurrence controls", async () => {
    await renderComposer();
    expect(screen.queryByText("Schedule for later")).toBeNull();
    expect(screen.queryByText("Recurring")).toBeNull();
    expect(screen.queryByText("Schedule Notification")).toBeNull();
    expect(screen.getByText("Send Now")).toBeTruthy();
  });

  it("always sends an immediate broadcast, and records it as one", async () => {
    await renderComposer();
    fireEvent.change(screen.getByPlaceholderText(/title/i), { target: { value: "Server maintenance" } });
    fireEvent.click(screen.getByText("Send Now"));

    await waitFor(() => expect(db.insertPayloads.length).toBe(1));
    expect(db.insertPayloads[0]).toMatchObject({
      title: "Server maintenance",
      target_type: "all",
      target_league_ids: [],
      target_categories: [],
      is_sent: true,
      scheduled_at: null,
      is_recurring: false,
      recurrence_rule: null,
    });
    expect(toasts.success).toHaveBeenCalledWith("Notification sent!");
  });
});

describe("AdminPushNotifications — honest send result", () => {
  it("reports failure, not success, when the insert is rejected", async () => {
    db.insertError = { message: "new row violates row-level security policy" };
    await renderComposer();
    fireEvent.change(screen.getByPlaceholderText(/title/i), { target: { value: "Should not claim success" } });
    fireEvent.click(screen.getByText("Send Now"));

    await waitFor(() => expect(toasts.error).toHaveBeenCalled());
    expect(toasts.success).not.toHaveBeenCalled();
    expect(toasts.error).toHaveBeenCalledWith("new row violates row-level security policy");
  });

  it("keeps the composed message so a failed send can be retried", async () => {
    db.insertError = { message: "network error" };
    await renderComposer();
    const titleInput = screen.getByPlaceholderText(/title/i) as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: "Draft worth keeping" } });
    fireEvent.click(screen.getByText("Send Now"));

    await waitFor(() => expect(toasts.error).toHaveBeenCalled());
    expect(titleInput.value).toBe("Draft worth keeping");
  });
});
