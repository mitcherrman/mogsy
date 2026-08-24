/**
 * RG1 — THE RANKED STAGE: the reclaimed HUD band, and the stable region.
 *
 * jsdom lays nothing out, so these pin the STRUCTURE that produces the
 * measured behaviour. The pixels were measured in a real browser against the
 * shipped arena, at 1440x900, 1440x720 and 1024x800, and the numbers those
 * measurements produced are what these assertions exist to protect:
 *
 *   BEFORE                          AFTER (all three viewports)
 *   round timeline Y varied by      timeline Y identical in all six question
 *     416px (1440x900) and 548px      states, to the pixel
 *     (1024x800) across question    duelist rails: one height per match kind,
 *     states                          unchanged by question content
 *   duelist rails resized 376→663   document scroll: 0 in every state
 *   document scrolled in 5 of 6     question overflow absorbed inside the card
 *     states at 1440x720              (long: 145px at 900, 301px at 720)
 *   arena started 108px down;       arena starts 68px down; 40px reclaimed
 *     56px of that was a band the     from a strip the HUD paints two corner
 *     retired navbar left behind      chips into and nothing else
 */
import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/backend-auth", () => ({
  getBackendAuthHeaders: async () => ({ Authorization: "Bearer jwt" }),
}));
// The frame is imported from the ROUTE module, which pulls the auth hook in.
// Stubbed so this file measures layout and not a Supabase session.
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: null, loading: false }) }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: null } }) } },
}));

import { Frame } from "./QuizRankedPage";

const css = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");
const hudSource = readFileSync(
  resolve(process.cwd(), "src/components/hud/GlobalHud.tsx"), "utf8");

function renderFrame() {
  const view = render(
    <MemoryRouter><Frame size="wide"><div data-testid="child" /></Frame></MemoryRouter>);
  return { ...view, frame: screen.getByTestId("quiz-ranked") };
}

describe("the reclaimed HUD band", () => {
  it("is reclaimed at the PAGE, leaving the shell's reservation alone", () => {
    const { frame } = renderFrame();
    // /lol and /quiz already do exactly this. Doing it in Layout instead would
    // move every route and would undo the RA1 1.1 route-loading overflow fix.
    expect(frame.className).toContain("lg:-mt-[var(--app-header-h)]");
    const layout = readFileSync(
      resolve(process.cwd(), "src/components/Layout.tsx"), "utf8");
    expect(layout).toContain("pt-[var(--app-header-h)] pb-bottom-nav");
  });

  it("is reclaimed only where the band actually has a free middle", () => {
    const { frame } = renderFrame();
    // The HUD is two corner chips, not a bar — but at narrow widths the two
    // of them span nearly the whole strip (measured: the identity cluster
    // alone runs x 147–371 of a 379px viewport), so there is nothing to
    // reclaim there and the pull is breakpoint-scoped.
    expect(frame.className).not.toMatch(/(^|\s)-mt-\[var\(--app-header-h\)\]/);
  });

  it("keeps the title row clear of BOTH chips at the widths it moves up", () => {
    const header = renderFrame().frame.querySelector("header")!;
    // Left: the hat chip is a 44px target at a 12px gutter → 3.5rem clears it.
    expect(header.className).toContain("lg:pl-14");
    // Right: the identity cluster measured 224px at a 12px gutter → 14rem.
    expect(header.className).toContain("lg:pr-56");
    // And the chips are still what those numbers describe, so a redesigned HUD
    // fails here rather than silently colliding with the title.
    expect(hudSource).toContain("h-[var(--app-header-h)]");
    expect(hudSource).toContain("pointer-events-none fixed inset-x-0 top-0");
  });
});

describe("the stage budget", () => {
  it("gives the frame a FLOOR from lg up, never a cap", () => {
    const { frame } = renderFrame();
    // A CAP is what forced the first draft's scrollbar into the parchment: the
    // stage could not grow, so the question had to shrink. A floor makes the
    // arena as large as the viewport allows and lets the rare oversized round
    // grow the page instead.
    expect(frame.className).toContain("lg:min-h-[var(--ranked-stage-h)]");
    expect(frame.className).not.toMatch(/lg:h-\[var\(--ranked-stage-h\)\]/);
    expect(frame.className).toContain("flex");
    expect(frame.className).toContain("flex-col");
  });

  it("declares the token once, and derives the stage from the viewport", () => {
    expect(css).toMatch(/--ranked-stage-h:\s*calc\(100dvh/);
    expect(css.match(/--ranked-stage-h:/g)).toHaveLength(1);
    // NOT --app-viewport-h: that token subtracts a header band this route no
    // longer sits below, and using it would leave the reclaimed strip unspent.
    const decl = /--ranked-stage-h:[^;]+;/.exec(css)?.[0] ?? "";
    expect(decl).not.toContain("app-header-h");
  });

  it("keeps the title row sized to its text, not to the band it sits in", () => {
    const header = renderFrame().frame.querySelector("header")!;
    // Filling `--app-header-h` here held a full-width strip open for chrome
    // that is `position: fixed` and does not need it. Those 24px are the
    // question's now; the INSETS are what keep this row clear of the chips.
    expect(header.className).toContain("lg:min-h-8");
    expect(header.className).not.toContain("lg:min-h-[var(--app-header-h)]");
  });

  it("compacts only on a SHORT desktop, and never by changing type size", () => {
    // The one adaptive safeguard. Bounded on both axes so it cannot reach a
    // roomy viewport (1440x900 measured: no rule here applies) or a narrow one
    // (below lg the arena stacks and the page scrolls normally).
    const block = /@media \(min-width: 1024px\) and \(max-height: 860px\)[\s\S]*?\n\}/
      .exec(css)?.[0] ?? "";
    expect(block).toContain(".ranked-academy");
    // Every declaration is spacing or a media ceiling. A font-size here would
    // be the one thing the product decision ruled out.
    expect(block).not.toMatch(/font-size|font-weight|letter-spacing/);
    // And it is scoped to Ranked, so Daily Challenge and Practice — which
    // render the same surface — are untouched.
    for (const rule of block.split("\n").filter((l) => l.includes("{") && l.includes("."))) {
      expect(rule).toContain(".ranked-academy");
    }
  });

  it("holds the title row out of the flex distribution", () => {
    const header = renderFrame().frame.querySelector("header")!;
    // The row is chrome. If it could flex, the match's region — and with it
    // every anchor below — would depend on how long the heading wrapped.
    expect(header.className).toContain("shrink-0");
  });

  it("hands the match ONE region that grows, and never one that clips", () => {
    const { frame } = renderFrame();
    const region = screen.getByTestId("child").parentElement!;
    expect(region.parentElement).toBe(frame);
    expect(region.className).toContain("flex-1");
    // `min-h-0` must NOT be here, and its absence is load-bearing: it is the
    // switch that lets a flex child be shorter than its content. With it, an
    // oversized round is clipped or handed a scrollbar; without it, the
    // automatic minimum size holds and the round grows the page instead.
    expect(region.className).not.toContain("min-h-0");
  });
});
