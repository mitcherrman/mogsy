import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { AdminAuthContextValue, AdminAuthStatus } from "@/lib/admin-auth/types";

// Reuse the established admin-auth mock recipe (see AdminAuthGate.test.tsx):
// the real AdminAuthGate renders against a controlled useAdminAuth context.
let ctx: AdminAuthContextValue;
vi.mock("@/lib/admin-auth/AdminAuthProvider", () => ({
  useAdminAuth: () => ctx,
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ signOut: vi.fn() }) }));

import AdminDirectory from "./AdminDirectory";
import {
  groupedAdminDirectoryItems,
  visibleAdminDirectoryItems,
} from "@/lib/admin/admin-directory";

const baseCtx = (status: AdminAuthStatus): AdminAuthContextValue => ({
  status,
  principal:
    status === "authorized"
      ? { authMethod: "supabase_user", userId: "u1", email: "admin@mogzy.lol" }
      : null,
  isAuthorized: status === "authorized" || status === "authorized_via_fallback",
  fallbackActive: status === "authorized_via_fallback",
  recheck: vi.fn(),
  applyFallbackKey: vi.fn(),
  clearFallback: vi.fn(),
  invalidate: vi.fn(),
});

const renderDirectory = (includeDevelopment = false) =>
  render(
    <MemoryRouter>
      <AdminDirectory includeDevelopment={includeDevelopment} />
    </MemoryRouter>,
  );

const directoryHeading = () => screen.queryByRole("heading", { level: 1, name: /mogzy admin/i });

let fetchSpy: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchSpy = vi.fn(() => Promise.reject(new Error("no network in directory tests")));
  vi.stubGlobal("fetch", fetchSpy);
});
afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

describe("AdminDirectory authorization", () => {
  it("renders the directory for an authorized admin", () => {
    ctx = baseCtx("authorized");
    renderDirectory();
    expect(directoryHeading()).toBeTruthy();
    expect(screen.getByText("Private administration directory.")).toBeTruthy();
  });

  it("does not render protected content for a guest", () => {
    ctx = baseCtx("signed_out");
    renderDirectory();
    expect(directoryHeading()).toBeNull();
  });

  it("does not render protected content for an authenticated non-admin", () => {
    ctx = baseCtx("signed_in_non_admin");
    renderDirectory();
    expect(directoryHeading()).toBeNull();
  });

  it("does not flash content while authorization is loading or checking", () => {
    for (const status of ["loading", "checking"] as const) {
      ctx = baseCtx(status);
      renderDirectory();
      expect(directoryHeading()).toBeNull();
      cleanup();
    }
  });

  it("defaults to denial on backend failure states", () => {
    for (const status of ["backend_unavailable", "malformed_response", "expired_session"] as const) {
      ctx = baseCtx(status);
      renderDirectory();
      expect(directoryHeading()).toBeNull();
      cleanup();
    }
  });

  it("performs no network or mutation request when rendering", () => {
    ctx = baseCtx("authorized");
    renderDirectory();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("shows the already-held principal identity without another request", () => {
    ctx = baseCtx("authorized");
    renderDirectory();
    expect(screen.getByTestId("admin-directory-identity").textContent).toContain(
      "admin@mogzy.lol",
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("AdminDirectory navigation", () => {
  beforeEach(() => {
    ctx = baseCtx("authorized");
  });

  it("renders one open link per visible canonical registry item (production mode)", () => {
    renderDirectory(false);
    const hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    for (const item of visibleAdminDirectoryItems(false)) {
      expect(hrefs, item.id).toContain(item.path);
    }
  });

  it("preserves the Quiz Content child-action tab query strings", () => {
    renderDirectory();
    const hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("/admin/quiz-content?tab=builder");
    expect(hrefs).toContain("/admin/quiz-content?tab=review");
    expect(hrefs).toContain("/admin/quiz-content?tab=ranked-duel");
  });

  it("links Back to Mogzy to /lol", () => {
    renderDirectory();
    const back = screen.getByRole("link", { name: /back to mogzy/i }) as HTMLAnchorElement;
    expect(back.getAttribute("href")).toBe("/lol");
  });

  it("links broadcast child surfaces correctly with safe new-tab attributes", () => {
    renderDirectory();
    const live = screen.getByRole("link", { name: /live view \(public obs viewer surface\)/i });
    expect(live.getAttribute("href")).toBe("/broadcast/live-view");
    expect(live.getAttribute("target")).toBe("_blank");
    expect(live.getAttribute("rel")).toBe("noopener noreferrer");
    const capture = screen.getByRole("link", { name: /window-capture view/i });
    expect(capture.getAttribute("href")).toBe("/admin/quiz-broadcast/view");
    expect(capture.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("shows legacy aliases only as metadata, never as links", () => {
    renderDirectory();
    const hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    for (const alias of ["/admin/quiz-builder", "/admin/quiz-review", "/admin/workspace"]) {
      expect(hrefs).not.toContain(alias);
    }
    expect(screen.getByText(/legacy aliases/i).textContent).toContain("/admin/quiz-builder");
  });

  it("hides development entries in production mode and shows them in development", () => {
    renderDirectory(false);
    let hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs.some((h) => h?.startsWith("/dev/"))).toBe(false);
    expect(screen.queryByRole("heading", { name: "Development & QA" })).toBeNull();
    cleanup();

    renderDirectory(true);
    hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("/dev/ranked-duel");
    expect(screen.getByRole("heading", { name: "Development & QA" })).toBeTruthy();
  });
});

describe("AdminDirectory accessibility", () => {
  beforeEach(() => {
    ctx = baseCtx("authorized");
  });

  it("has exactly one page-level heading and one section heading per category", () => {
    renderDirectory(false);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    const h2s = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(h2s).toEqual(groupedAdminDirectoryItems(false).map((g) => g.category));
  });

  it("exposes card titles as headings and links with descriptive names", () => {
    renderDirectory(false);
    for (const item of visibleAdminDirectoryItems(false)) {
      expect(screen.getByRole("heading", { level: 3, name: item.title })).toBeTruthy();
      expect(
        screen.getByRole("link", { name: new RegExp(`open ${item.title}`, "i") }),
      ).toBeTruthy();
    }
  });

  it("exposes status text to assistive technology", () => {
    renderDirectory(false);
    // Status badges are plain text nodes, discoverable by content.
    expect(screen.getAllByText("Internal").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Production").length).toBeGreaterThan(0);
  });
});
