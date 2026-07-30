/**
 * Admin · Platform Policies panel.
 *
 * Covers the states the task requires: loading, success, failure, and — most
 * importantly — that the panel is never optimistic, so a switch can't display a
 * value the server did not accept. Authorization itself is enforced by Postgres
 * RLS (has_role admin) on app_settings; here we assert the panel surfaces a
 * denial as a failure and leaves the displayed value untouched.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AdminPlatformPolicies from "./AdminPlatformPolicies";
import { POLICY_KEYS } from "@/lib/platform-policy/policy";

const mocks = vi.hoisted(() => ({
  selectResult: {
    data: [] as unknown[],
    error: null as { code?: string; message?: string } | null,
  },
  upsertResult: { error: null as { code?: string; message?: string } | null },
  upsertCalls: [] as { key: string; value: unknown }[],
  singleRow: null as unknown,
}));

// Minimal supabase-js query-builder stand-in covering only what this page uses.
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => {
        const result = {
          ...mocks.selectResult,
          eq: () => ({
            maybeSingle: async () =>
              mocks.singleRow
                ? { data: mocks.singleRow, error: null }
                : { data: null, error: { message: "not found" } },
          }),
          then: (resolve: (v: unknown) => void) => resolve(mocks.selectResult),
        };
        return result;
      },
      upsert: async (row: { key: string; value: unknown }) => {
        mocks.upsertCalls.push(row);
        return mocks.upsertResult;
      },
    }),
  },
}));

// The admin session gate is exercised by its own tests; render its children.
vi.mock("@/components/admin/AdminAuthGate", () => ({
  AdminAuthGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/SEOHead", () => ({ default: () => null }));

const renderPanel = () =>
  render(
    <MemoryRouter>
      <AdminPlatformPolicies />
    </MemoryRouter>,
  );

const row = (key: string, enabled: boolean) => ({
  key,
  value: { enabled },
  updated_at: "2026-07-30T12:00:00Z",
});

beforeEach(() => {
  mocks.selectResult = {
    data: [
      row(POLICY_KEYS.combatSimTokensRequiredForNonPro, true),
      row(POLICY_KEYS.tutorialAutoPopupEnabled, true),
      row(POLICY_KEYS.tutorialCompletionRequiredForNewUsers, true),
    ],
    error: null,
  };
  mocks.upsertResult = { error: null };
  mocks.upsertCalls = [];
  mocks.singleRow = null;
});
afterEach(cleanup);

describe("loading and rendering", () => {
  it("shows a loading state, then all three switches", async () => {
    renderPanel();
    expect(screen.getByTestId("policies-loading")).toBeTruthy();

    await waitFor(() => expect(screen.getByTestId("policy-combatSimTokens")).toBeTruthy());
    expect(screen.getByTestId("policy-tutorialAutoPopup")).toBeTruthy();
    expect(screen.getByTestId("policy-tutorialCompletionRequired")).toBeTruthy();
  });

  it("shows the warning copy only for a switch that is OFF", async () => {
    mocks.selectResult.data = [
      row(POLICY_KEYS.combatSimTokensRequiredForNonPro, false),
      row(POLICY_KEYS.tutorialAutoPopupEnabled, true),
      row(POLICY_KEYS.tutorialCompletionRequiredForNewUsers, true),
    ];
    renderPanel();
    await waitFor(() =>
      expect(screen.getByTestId("policy-warning-combatSimTokens")).toBeTruthy(),
    );
    expect(screen.queryByTestId("policy-warning-tutorialAutoPopup")).toBeNull();
  });

  it("reports a failed read instead of presenting defaults as stored values", async () => {
    mocks.selectResult = { data: [], error: { message: "boom" } };
    renderPanel();
    await waitFor(() => expect(screen.getByTestId("policies-load-error")).toBeTruthy());
  });
});

describe("writes", () => {
  it("sends only the known key with a server-shaped value", async () => {
    mocks.singleRow = row(POLICY_KEYS.tutorialAutoPopupEnabled, false);
    renderPanel();
    await waitFor(() => expect(screen.getByTestId("policy-tutorialAutoPopup")).toBeTruthy());

    fireEvent.click(screen.getByRole("switch", { name: /Automatic Tutorial Popup/i }));

    await waitFor(() => expect(mocks.upsertCalls).toHaveLength(1));
    expect(mocks.upsertCalls[0]).toEqual({
      key: POLICY_KEYS.tutorialAutoPopupEnabled,
      value: { enabled: false },
    });
  });

  it("confirms success only after re-reading the server value", async () => {
    mocks.singleRow = row(POLICY_KEYS.tutorialAutoPopupEnabled, false);
    renderPanel();
    await waitFor(() => expect(screen.getByTestId("policy-tutorialAutoPopup")).toBeTruthy());

    fireEvent.click(screen.getByRole("switch", { name: /Automatic Tutorial Popup/i }));
    await waitFor(() =>
      expect(screen.getByTestId("policy-saved-tutorialAutoPopup")).toBeTruthy(),
    );
    expect(
      screen.getByRole("switch", { name: /Automatic Tutorial Popup/i }).getAttribute("aria-checked"),
    ).toBe("false");
  });

  it("is not optimistic: a rejected write leaves the switch on its old value", async () => {
    mocks.upsertResult = { error: { code: "42501", message: "row-level security" } };
    renderPanel();
    await waitFor(() => expect(screen.getByTestId("policy-combatSimTokens")).toBeTruthy());

    const control = screen.getByRole("switch", { name: /Combat Sim Token Requirement/i });
    expect(control.getAttribute("aria-checked")).toBe("true");

    fireEvent.click(control);
    await waitFor(() =>
      expect(screen.getByTestId("policy-error-combatSimTokens")).toBeTruthy(),
    );
    // Still ON — the panel never claimed a value the server refused.
    expect(
      screen.getByRole("switch", { name: /Combat Sim Token Requirement/i }).getAttribute("aria-checked"),
    ).toBe("true");
  });

  it("names authorization explicitly when the RLS policy rejects the write", async () => {
    mocks.upsertResult = { error: { code: "42501", message: "row-level security" } };
    renderPanel();
    await waitFor(() => expect(screen.getByTestId("policy-combatSimTokens")).toBeTruthy());

    fireEvent.click(screen.getByRole("switch", { name: /Combat Sim Token Requirement/i }));
    await waitFor(() =>
      expect(screen.getByTestId("policy-error-combatSimTokens").textContent).toMatch(
        /not authorized/i,
      ),
    );
  });

  it("changing one setting never rewrites the other two", async () => {
    mocks.singleRow = row(POLICY_KEYS.tutorialAutoPopupEnabled, false);
    renderPanel();
    await waitFor(() => expect(screen.getByTestId("policy-tutorialAutoPopup")).toBeTruthy());

    fireEvent.click(screen.getByRole("switch", { name: /Automatic Tutorial Popup/i }));
    await waitFor(() =>
      expect(screen.getByTestId("policy-saved-tutorialAutoPopup")).toBeTruthy(),
    );

    expect(mocks.upsertCalls.map((c) => c.key)).toEqual([
      POLICY_KEYS.tutorialAutoPopupEnabled,
    ]);
    // The untouched switches keep their loaded values.
    expect(
      screen.getByRole("switch", { name: /Combat Sim Token Requirement/i }).getAttribute("aria-checked"),
    ).toBe("true");
    expect(
      screen.getByRole("switch", { name: /Required New-User Tutorial/i }).getAttribute("aria-checked"),
    ).toBe("true");
  });
});
