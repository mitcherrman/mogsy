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

  it("seats the way back beside the hat, clear of the chip itself", () => {
    // THE TITLE ROW IS GONE. "Ranked Duel · Competitive Mode" was a heading
    // over a screen that is already, unmistakably, a ranked duel — and it cost
    // a full row at the top of a shell locked to the viewport, which is height
    // taken from the question. What is left is the way back, moved to the
    // corner a player already looks at to leave.
    renderFrame();
    const back = screen.getByRole("link", { name: "Back to Quiz" });
    // Left: the hat chip is a 44px target at a 12px gutter → 3.5rem clears it,
    // so the link sits just beside the hat rather than under it.
    expect(back.className).toContain("lg:left-14");
    expect(back.className).toContain("absolute");
    // Quiet, and still quiet.
    expect(back.className).toContain("text-muted-foreground/70");
    // And the chips are still what that number describes, so a redesigned HUD
    // fails here rather than silently colliding with the link.
    expect(hudSource).toContain("h-[var(--app-header-h)]");
    expect(hudSource).toContain("pointer-events-none fixed inset-x-0 top-0");
  });
});

describe("the stage budget", () => {
  it("LOCKS the frame to the viewport from lg up — a height, not a floor", () => {
    const { frame } = renderFrame();
    // THE INVARIANT REVERSED, deliberately. This used to be a `min-h` floor on
    // the reasoning that a round the viewport cannot seat should grow the page
    // rather than be clipped. In a Ranked match that trade is wrong: a match
    // that scrolls is a match whose Module Rail and banner points are off
    // screen while the player is answering. So the frame takes EXACTLY the
    // viewport and the arena spends it — and the art inside yields instead of
    // the page growing (see the media region in QuestionStageGeometry).
    expect(frame.className).toContain("lg:h-[var(--ranked-stage-h)]");
    expect(frame.className).not.toContain("lg:min-h-[var(--ranked-stage-h)]");
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

  it("collapses the chrome row entirely and gives the height to the arena", () => {
    const { frame } = renderFrame();
    const row = frame.firstElementChild as HTMLElement;
    // `h-0`, not "short": the row used to reserve one 28px text line for a
    // heading, and a shell locked to the viewport spends every one of those
    // pixels on the question instead. The slot still exists — `ArenaShell`
    // renders it — but it contributes no height, and the way back is
    // absolutely positioned inside it so it costs none either.
    expect(row.className).toContain("h-0");
    expect(row.className).toContain("shrink-0");
    expect(row.querySelector("h1")).toBeNull();
    expect(frame.textContent).not.toContain("Competitive Mode");
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

  it("holds the chrome row out of the flex distribution", () => {
    const row = renderFrame().frame.firstElementChild as HTMLElement;
    // The row is chrome. If it could flex, the match's region — and with it
    // every anchor below — would depend on it. It is `h-0 shrink-0`: no
    // height to give, and none to take.
    expect(row.className).toContain("shrink-0");
  });

  it("hands the match ONE region that grows, and that may also yield", () => {
    const { frame } = renderFrame();
    const region = screen.getByTestId("child").parentElement!;
    expect(region.parentElement).toBe(frame);
    expect(region.className).toContain("flex-1");
    // `lg:min-h-0` IS here now, and it is load-bearing in the other direction:
    // it is the switch that lets a flex child be shorter than its content.
    // Without it the automatic minimum size holds, the region refuses to go
    // below what the round contains, and the locked frame is overflowed by a
    // few pixels — which is precisely the residual scroll this pass closed.
    // It is `lg:` only: the narrow layout still stacks and still scrolls.
    expect(region.className).toContain("lg:min-h-0");
  });
});
