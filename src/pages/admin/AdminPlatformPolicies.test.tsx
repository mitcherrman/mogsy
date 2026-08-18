/**
 * Admin · Platform Policies panel.
 *
 * Covers the states the task requires: loading, success, failure, and — most
 * importantly — that the panel is never optimistic, so a switch can't display a
 * value the server did not accept. Authorization itself is enforced by Postgres
 * RLS (has_role admin) on app_settings; here we assert the panel surfaces a
 * denial as a failure and leaves the displayed value untouched.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
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
  /** Optional latch: hold the write open to observe the in-flight state. */
  upsertGate: null as Promise<void> | null,
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
        if (mocks.upsertGate) await mocks.upsertGate;
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
      row(POLICY_KEYS.globalNavbarVisible, true),
    ],
    error: null,
  };
  mocks.upsertResult = { error: null };
  mocks.upsertCalls = [];
  mocks.singleRow = null;
  mocks.upsertGate = null;
});
afterEach(cleanup);

describe("loading and rendering", () => {
  it("shows a loading state, then all four switches", async () => {
    renderPanel();
    expect(screen.getByTestId("policies-loading")).toBeTruthy();
    // While loading, nothing is interactive yet — no switch exists to click.
    expect(screen.queryByRole("switch")).toBeNull();

    await waitFor(() => expect(screen.getByTestId("policy-combatSimTokens")).toBeTruthy());
    expect(screen.getByTestId("policy-tutorialAutoPopup")).toBeTruthy();
    expect(screen.getByTestId("policy-tutorialCompletionRequired")).toBeTruthy();
    expect(screen.getByTestId("policy-globalNavbar")).toBeTruthy();
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

  it("changing one setting never rewrites the others", async () => {
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
    expect(
      screen.getByRole("switch", { name: /Show global navbar/i }).getAttribute("aria-checked"),
    ).toBe("true");
  });
});

// ---------------------------------------------------------------------------
// Phase 1 · Show global navbar
//
// The switch persists and audits like the other three. It is deliberately inert:
// nothing renders off it yet, which is asserted by the boundary test at the end
// of this file.
// ---------------------------------------------------------------------------
describe("show global navbar", () => {
  const navbarSwitch = () => screen.getByRole("switch", { name: /Show global navbar/i });

  it("renders the control with its supporting copy", async () => {
    renderPanel();
    await waitFor(() => expect(screen.getByTestId("policy-globalNavbar")).toBeTruthy());

    expect(screen.getByText("Show global navbar")).toBeTruthy();
    expect(
      screen.getByText(
        "Display the standard Mogzy navigation bar across public and authenticated pages.",
      ),
    ).toBeTruthy();
  });

  it("shows the stored ON value, with no warning while the navbar is shown", async () => {
    renderPanel();
    await waitFor(() => expect(screen.getByTestId("policy-globalNavbar")).toBeTruthy());

    expect(navbarSwitch().getAttribute("aria-checked")).toBe("true");
    expect(screen.queryByTestId("policy-warning-globalNavbar")).toBeNull();
  });

  it("shows the stored OFF value, and warns that Phase 1 hides nothing", async () => {
    mocks.selectResult.data = [row(POLICY_KEYS.globalNavbarVisible, false)];
    renderPanel();
    await waitFor(() => expect(screen.getByTestId("policy-globalNavbar")).toBeTruthy());

    expect(navbarSwitch().getAttribute("aria-checked")).toBe("false");
    expect(screen.getByTestId("policy-warning-globalNavbar").textContent).toMatch(
      /not yet connected to navbar visibility/i,
    );
  });

  it("defaults to ON when no row has been saved yet", async () => {
    mocks.selectResult.data = [
      row(POLICY_KEYS.combatSimTokensRequiredForNonPro, true),
      row(POLICY_KEYS.tutorialAutoPopupEnabled, true),
      row(POLICY_KEYS.tutorialCompletionRequiredForNewUsers, true),
    ];
    renderPanel();
    await waitFor(() => expect(screen.getByTestId("policy-globalNavbar")).toBeTruthy());

    expect(navbarSwitch().getAttribute("aria-checked")).toBe("true");
  });

  it("writes only global_navbar_visible, with an { enabled } body", async () => {
    mocks.singleRow = row(POLICY_KEYS.globalNavbarVisible, false);
    renderPanel();
    await waitFor(() => expect(screen.getByTestId("policy-globalNavbar")).toBeTruthy());

    fireEvent.click(navbarSwitch());

    await waitFor(() => expect(mocks.upsertCalls).toHaveLength(1));
    expect(mocks.upsertCalls[0]).toEqual({
      key: POLICY_KEYS.globalNavbarVisible,
      value: { enabled: false },
    });
    expect(mocks.upsertCalls[0].key).toBe("global_navbar_visible");
  });

  it("reflects the value only after re-reading it from the server", async () => {
    mocks.singleRow = row(POLICY_KEYS.globalNavbarVisible, false);
    renderPanel();
    await waitFor(() => expect(screen.getByTestId("policy-globalNavbar")).toBeTruthy());

    fireEvent.click(navbarSwitch());
    await waitFor(() => expect(screen.getByTestId("policy-saved-globalNavbar")).toBeTruthy());
    expect(navbarSwitch().getAttribute("aria-checked")).toBe("false");
  });

  it("shows the last-changed audit stamp from the confirmed row", async () => {
    mocks.singleRow = row(POLICY_KEYS.globalNavbarVisible, false);
    renderPanel();
    await waitFor(() => expect(screen.getByTestId("policy-globalNavbar")).toBeTruthy());
    // Present from the initial load, since the fixture row carries updated_at.
    expect(screen.getByTestId("policy-globalNavbar").textContent).toMatch(/Last changed/);

    fireEvent.click(navbarSwitch());
    await waitFor(() => expect(screen.getByTestId("policy-saved-globalNavbar")).toBeTruthy());
    expect(screen.getByTestId("policy-globalNavbar").textContent).toMatch(/Last changed/);
  });

  it("is not optimistic: a rejected write leaves the switch ON", async () => {
    mocks.upsertResult = { error: { code: "42501", message: "row-level security" } };
    renderPanel();
    await waitFor(() => expect(screen.getByTestId("policy-globalNavbar")).toBeTruthy());
    expect(navbarSwitch().getAttribute("aria-checked")).toBe("true");

    fireEvent.click(navbarSwitch());
    await waitFor(() => expect(screen.getByTestId("policy-error-globalNavbar")).toBeTruthy());

    expect(navbarSwitch().getAttribute("aria-checked")).toBe("true");
    expect(screen.queryByTestId("policy-warning-globalNavbar")).toBeNull();
  });

  it("names authorization explicitly when RLS rejects the write", async () => {
    mocks.upsertResult = { error: { code: "42501", message: "row-level security" } };
    renderPanel();
    await waitFor(() => expect(screen.getByTestId("policy-globalNavbar")).toBeTruthy());

    fireEvent.click(navbarSwitch());
    await waitFor(() =>
      expect(screen.getByTestId("policy-error-globalNavbar").textContent).toMatch(
        /not authorized to change global settings/i,
      ),
    );
  });

  it("guards every switch while the navbar write is in flight", async () => {
    let release!: () => void;
    mocks.upsertGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    mocks.singleRow = row(POLICY_KEYS.globalNavbarVisible, false);
    renderPanel();
    await waitFor(() => expect(screen.getByTestId("policy-globalNavbar")).toBeTruthy());

    fireEvent.click(navbarSwitch());
    await waitFor(() => expect(mocks.upsertCalls).toHaveLength(1));

    // All four controls are disabled until the server answers, so a second
    // click cannot start a competing write.
    for (const control of screen.getAllByRole("switch")) {
      expect(control.hasAttribute("disabled")).toBe(true);
    }
    fireEvent.click(screen.getByRole("switch", { name: /Combat Sim Token Requirement/i }));
    expect(mocks.upsertCalls).toHaveLength(1);

    release();
    await waitFor(() => expect(screen.getByTestId("policy-saved-globalNavbar")).toBeTruthy());
    expect(mocks.upsertCalls).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Phase 1 boundary.
//
// The setting exists but must not be consumed anywhere yet — the navbar renders
// exactly as it does today whatever the switch says. Asserted against the source
// (same approach as App.routing-contract.test.ts) because the regression worth
// catching is a renderer quietly starting to read the policy before Phase 2's
// replacement navigation exists.
// ---------------------------------------------------------------------------
describe("Phase 1 boundary: the navbar policy is stored, not consumed", () => {
  const read = (relative: string) =>
    readFileSync(resolve(__dirname, "../../", relative), "utf8");

  it.each([
    "components/hud/GlobalHud.tsx",
    "components/Layout.tsx",
    "App.tsx",
  ])("%s does not read the navbar policy", (file) => {
    const source = read(file);
    expect(source).not.toContain("globalNavbarVisible");
    expect(source).not.toContain("global_navbar_visible");
  });

  it("no file outside the policy module and admin panel mentions the key", () => {
    // The contract module is the only definition and the admin panel is the
    // only writer. Any other file means Phase 2 started early.
    const srcRoot = resolve(__dirname, "../../");
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) return walk(full);
        return /\.tsx?$/.test(entry.name) ? [full] : [];
      });

    const hits = walk(srcRoot)
      .filter((file) => /globalNavbarVisible|global_navbar_visible/.test(readFileSync(file, "utf8")))
      .map((file) => relative(srcRoot, file))
      .sort();

    expect(hits).toEqual([
      "lib/platform-policy/policy.test.ts",
      "lib/platform-policy/policy.ts",
      "pages/admin/AdminPlatformPolicies.test.tsx",
      "pages/admin/AdminPlatformPolicies.tsx",
    ]);
  });
});
