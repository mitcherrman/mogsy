/**
 * Viewport and scroll ownership — RA1 Phase 1.1, as revised by RG1.
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
 *   * the live arena declares exactly one internal vertical scroll region — the
 *     question card's — and the round HUD (timer strip, duelist rails, ability
 *     tray, status line, timeline) is pinned OUTSIDE it.
 *
 * RG1 restored the pinned stage this file once forbade. The nested-scrollbar
 * failure that removed it came from pinning the centre column while the PAGE
 * was still free to grow; the stage is now sized so the page does not scroll,
 * so the question's scrollbar is the only one on screen. The measurements that
 * justify the change are in `QuizRankedMatch.geometry`'s revised block.
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

  it("declares NO internal scroll region, anywhere in the arena", async () => {
    const { container } = await mountArena();
    // Twice now this has been tried and twice it has been wrong. RA1 1.1 gave
    // the centre column a scrollbar while the page was also free to grow, so
    // both scrolled and read as nested bars. RG1's first draft pinned the
    // stage and moved the scrollbar into the parchment, which held the anchors
    // but put a document-reader control on a game screen.
    //
    // The content audit settled it: the longest question the bank can serve is
    // a 108-character prompt with 63-character options, and the stage seats
    // that whole at every supported viewport with room to spare. So there is
    // no scroll region at all.
    const scrollers = Array.from(container.querySelectorAll<HTMLElement>("*"))
      .filter((el) => /overflow-y-auto|overflow-auto|overflow-y-scroll|overflow-y-hidden/
        .test(el.className || ""));
    expect(scrollers.map((el) => el.className)).toEqual([]);
    // And no residue of the retired wrapper's name.
    expect(screen.queryByTestId("ranked-question-scroll")).toBeNull();
  });

  it("gives the stage a FLOOR and lets exactly one band flex", async () => {
    await mountArena();
    const root = screen.getByTestId("ranked-match");
    // The four bands: strip, arena, HUD row, timeline. Only the arena flexes,
    // which is what stops a taller question moving the other three.
    expect(root.className).toContain("lg:flex-1");
    const grid = root.querySelector<HTMLElement>(".grid")!;
    expect(grid.className).toContain("lg:flex-1");
    // `min-h-0` must NOT be here. It is the switch that lets a flex child be
    // shorter than its content — i.e. the switch that clips a question — and
    // removing it is what lets oversized content grow the page instead.
    expect(root.className).not.toContain("min-h-0");
    expect(grid.className).not.toContain("min-h-0");
    // Every stage class is breakpoint-scoped: below lg the arena stacks into
    // one column that legitimately exceeds a narrow viewport.
    for (const el of [root, grid, screen.getByTestId("ranked-question-body")]) {
      for (const cls of (el.className || "").split(/\s+/)) {
        if (/^(h-full|min-h-0|flex-1|overflow-y-auto|shrink-0)$/.test(cls)) {
          throw new Error(`unscoped stage class "${cls}" on ${el.dataset.testid ?? el.className}`);
        }
      }
    }
  });

  it("keeps the arena's own chrome out of the flex distribution", async () => {
    await mountArena();
    const root = screen.getByTestId("ranked-match");
    const kids = Array.from(root.children) as HTMLElement[];
    const flexing = kids.filter((el) => /lg:flex-1/.test(el.className || ""));
    // Exactly one band may take the leftover height. If a second one could,
    // the two would negotiate and the timeline's Y would depend on content.
    expect(flexing).toHaveLength(1);
    expect(flexing[0].className).toContain("grid");
  });

  it("orders the HUD after the question, with only the timeline below it", async () => {
    await mountArena();
    const root = screen.getByTestId("ranked-match");
    const kids = Array.from(root.children);
    const hudIndex = kids.findIndex((el) => el.querySelector('[data-testid="submission-status"]'));
    expect(hudIndex).toBeGreaterThanOrEqual(0);
    // RG took the bottom: the round timeline is the arena's last child, and it
    // is the ONLY thing after the HUD row. The original property survives —
    // anything appearing this low can only extend the page downwards, and the
    // timeline itself is a fixed-height strip that never changes size.
    expect(kids[kids.length - 1]).toBe(screen.getByTestId("ranked-round-timeline"));
    expect(hudIndex).toBe(kids.length - 2);
    const focus = screen.getByTestId("ranked-focus-column");
    for (const hud of ["ranked-abilities", "submission-status"]) {
      expect(focus.contains(screen.getByTestId(hud))).toBe(false);
    }
  });
});
