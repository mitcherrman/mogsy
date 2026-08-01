/**
 * RA1 Phase 1.1: viewport and scroll ownership.
 *
 * jsdom performs no layout, so these assert the CONTRACT that produces the
 * measured behaviour rather than the pixels themselves (the pixel checks are
 * done in a real browser and recorded in the phase report):
 *
 *   * `--app-viewport-h` exists and is derived from the shell's own offsets,
 *     so nothing has to re-derive `100dvh - header` by hand;
 *   * nothing rendered INSIDE the shell asks for a full dynamic viewport —
 *     that is the double-count that raised a transient scrollbar during
 *     route-guard loading;
 *   * the live arena declares exactly one internal vertical scroll region, and
 *     the round HUD (timer strip, duelist panels, ability tray, status) is
 *     pinned outside it.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/backend-auth", () => ({
  getBackendAuthHeaders: async () => ({ Authorization: "Bearer jwt" }),
}));

const css = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");
const layoutSource = readFileSync(resolve(process.cwd(), "src/components/Layout.tsx"), "utf8");
const appSource = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");

describe("the app viewport token", () => {
  it("is declared once, from the shell's own header and bottom-nav offsets", () => {
    expect(css).toContain(
      "--app-viewport-h: calc(100dvh - var(--app-header-h) - var(--bottom-nav-clearance))");
    // Both inputs are re-declared for sm+; var() resolves at use time, so the
    // token must NOT be re-declared alongside them (that would freeze it).
    expect(css.match(/--app-viewport-h:/g)).toHaveLength(1);
  });

  it("keeps the ranked shell's decorative glow inside its own box", () => {
    // A 0.5rem vertical bleed here was real scrollable overflow: on a page
    // sized to fit the viewport exactly it raised a scrollbar by itself.
    const shellBefore = /\.ranked-shell::before\s*\{[\s\S]*?\}/.exec(css)?.[0] ?? "";
    expect(shellBefore).toContain("inset: 0 -0.25rem");
    expect(shellBefore).not.toContain("inset: -0.5rem");
  });
});

describe("in-shell loading states never claim a full viewport", () => {
  // The startup direct-render shells (RouteBootShell / NeutralBootShell) are
  // correctly `min-h-dvh` — they render INSTEAD of the shell, with no header
  // painted above them. The regression to guard against is one of them, or any
  // other full-height box, being used for a wait that happens UNDER the header,
  // where it overflows the document for the duration of the load.
  // Anchored on the JSX opening tag, not on prose that happens to say "<main>",
  // and stripped of comments so an explanation of the bug cannot read as the bug.
  const stripComments = (s: string) =>
    s.replace(/\{?\/\*[\s\S]*?\*\/\}?/g, "").replace(/^\s*\/\/.*$/gm, "");
  const mainBlock = stripComments(
    /<main\s+className=\{[\s\S]*?<\/main>/.exec(layoutSource)?.[0] ?? "");

  it("holds a resolving route chunk open with a partial height, inside <main>", () => {
    expect(mainBlock.length).toBeGreaterThan(0);
    expect(mainBlock).toContain('className="min-h-[50vh]"');
    expect(mainBlock).not.toMatch(/min-h-dvh|h-dvh|min-h-screen|h-screen/);
    // The full-viewport boot shells must not appear under the header either.
    expect(mainBlock).not.toContain("RouteLoader");
    expect(mainBlock).not.toContain("BootShell");
  });

  it("keeps RouteLoader on standalone routes only", () => {
    // Everything between <Route element={<Layout />}> and its close renders
    // under the header; RouteLoader (a full-dvh boot shell) must not be there.
    const layoutRoutes = /<Route element=\{<Layout \/>\}>[\s\S]*?\n(\s*)<\/Route>/.exec(appSource)?.[0] ?? "";
    expect(layoutRoutes.length).toBeGreaterThan(0);
    expect(layoutRoutes).not.toContain("RouteLoader");
  });
});

describe("the route guard's loading state", () => {
  it("sizes to the shell viewport rather than the full dynamic viewport", async () => {
    vi.doMock("@/hooks/useAuth", () => ({ useAuth: () => ({ loading: true, user: null }) }));
    vi.doMock("@/hooks/useAppSettings", () => ({
      useAppSettings: () => ({ loading: true, settings: null }),
    }));
    vi.doMock("@/hooks/useRankedTutorialStatus", () => ({
      useRankedTutorialStatus: () => ({ loading: true, required: false, error: null }),
    }));
    const { default: RequireRankedTutorial } = await import("@/components/RequireRankedTutorial");

    render(<RequireRankedTutorial><div>child</div></RequireRankedTutorial>);
    const placeholder = screen.getByTestId("ranked-tutorial-guard-loading");
    expect(placeholder.className).toContain("min-h-[var(--app-viewport-h)]");
    // `min-h-dvh` here is what added header height on top of a box that was
    // already full-height — 56px desktop / 112px mobile of phantom scroll.
    expect(placeholder.className).not.toContain("min-h-dvh");
    vi.doUnmock("@/hooks/useAuth");
    vi.doUnmock("@/hooks/useAppSettings");
    vi.doUnmock("@/hooks/useRankedTutorialStatus");
  });
});

describe("the live arena's scroll ownership", () => {
  let unmount: () => void;

  beforeEach(async () => {
    const { privatePlayerV2, publicRoundV2 } = await import("@/lib/ranked-public/fixtures");
    const json = (body: unknown) => new Response(JSON.stringify(body), {
      status: 200, headers: { "Content-Type": "application/json" } });
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const u = String(url);
      if (u.endsWith("/resume")) {
        return json({
          schema_version: "ranked_duel.resume.v1", projection_type: "resume",
          match_id: "m1", round_number: 1, server_time: "2026-07-18T12:00:00+00:00",
          payload: {
            match_status: "active", match_over: false,
            public: publicRoundV2(), private: privatePlayerV2("userA"),
            progression_pending_players: [], latest_resolved_round: null, result: null,
          },
        });
      }
      if (u.endsWith("/private")) return json(privatePlayerV2("userA"));
      if (u.includes("/presence")) return json({ status: "active", match_id: "m1", active: true });
      if (/\/matches\/m1$/.test(u)) return json(publicRoundV2());
      return json({});
    }) as unknown as typeof fetch);
  });
  afterEach(() => { unmount?.(); vi.unstubAllGlobals(); });

  async function mountArena() {
    const { QuizRankedMatch } = await import("./QuizRankedMatch");
    const view = render(<QuizRankedMatch matchId="m1" viewerUserId="userA" />);
    unmount = view.unmount;
    await screen.findByTestId("ranked-match");
    return view;
  }

  it("declares NO internal vertical scroll region", async () => {
    const { container } = await mountArena();
    // RA1 1.1 gave the centre column its own scrollbar. In a real browser that
    // read as a nested scrollbar next to the browser's own, so the model is
    // gone: Ranked scrolls with the document like every other route.
    const scrollers = Array.from(container.querySelectorAll<HTMLElement>("*"))
      .filter((el) => /overflow-y-auto|overflow-auto|overflow-y-scroll|overflow-y-hidden/
        .test(el.className || ""));
    expect(scrollers.map((el) => el.className)).toEqual([]);
  });

  it("never pins its own height, so nothing inside it can be clipped", async () => {
    const { container } = await mountArena();
    const root = screen.getByTestId("ranked-match");
    // No flex-fill chain and no viewport-derived height anywhere in the arena.
    expect(root.className).not.toMatch(/lg:flex-1|lg:min-h-0/);
    const pinned = Array.from(container.querySelectorAll<HTMLElement>("*"))
      .filter((el) => /(^|\s)(min-h-dvh|h-dvh|min-h-screen|h-screen)(\s|$)/.test(el.className || "")
        || /app-viewport-h/.test(el.className || ""));
    expect(pinned).toHaveLength(0);
  });

  it("orders the reveal after the HUD so its arrival displaces nothing", async () => {
    await mountArena();
    const root = screen.getByTestId("ranked-match");
    const kids = Array.from(root.children);
    const hudIndex = kids.findIndex((el) => el.querySelector('[data-testid="submission-status"]'));
    expect(hudIndex).toBeGreaterThanOrEqual(0);
    // The reveal slot is the LAST child, after the HUD row — anything that
    // appears there can only extend the page downwards.
    expect(hudIndex).toBe(kids.length - 1);
    const focus = screen.getByTestId("ranked-focus-column");
    for (const hud of ["ranked-abilities", "submission-status"]) {
      expect(focus.contains(screen.getByTestId(hud))).toBe(false);
    }
  });
});
