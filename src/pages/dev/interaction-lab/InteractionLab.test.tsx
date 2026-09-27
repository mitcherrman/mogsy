import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ZERO ANALYTICS — spy on every emitter the audit found, and on the network.
const analytics = vi.hoisted(() => ({ track: vi.fn(), trackAsync: vi.fn() }));
vi.mock("@/lib/analytics/track", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/analytics/track")>()),
  track: analytics.track,
  trackAsync: analytics.trackAsync,
}));

import { InteractionLab } from "./InteractionLab";
import { labFixture } from "./labFixtures";
import { LAB_DATA_DUEL_RENDERER, LAB_STAT_DROP_RENDERER, labRendererFor } from "./labRenderers";
import { getModuleRenderer, registeredModuleIds, rendererForSegment } from "@/lib/ranked-core/modules/registry";

let fetchSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  window.history.replaceState(null, "", "/dev/interaction-lab");
  fetchSpy = vi.spyOn(globalThis, "fetch");
});
afterEach(() => {
  fetchSpy.mockRestore();
  analytics.track.mockClear();
  analytics.trackAsync.mockClear();
});

const lab = () => screen.getByTestId("interaction-lab");
const stage = () => screen.getByTestId("ranked-question");

async function lockAndReveal(lockTestId: string) {
  fireEvent.click(screen.getByTestId(lockTestId));
  expect(lab()).toHaveAttribute("data-phase", "locked");
  await act(async () => { await new Promise((r) => setTimeout(r, 5)); });
  expect(lab()).toHaveAttribute("data-phase", "revealed");
}

describe("Interaction Lab — inside the real CanonicalArena", () => {
  it("renders the primitive inside the arena's question stage", () => {
    render(<InteractionLab suspenseMs={0} />);
    expect(screen.getByTestId("ranked-match")).toBeInTheDocument();
    expect(within(stage()).getByTestId("mig-data-duel")).toBeInTheDocument();
    // The lab controls are chrome OUTSIDE the arena body.
    expect(within(screen.getByTestId("ranked-match")).queryByTestId("lab-controls")).toBeNull();
    // Lab rails occupy the arena's `panel` flank seam.
    expect(screen.getByTestId("lab-rail-left")).toBeInTheDocument();
    expect(screen.getByTestId("lab-rail-right")).toBeInTheDocument();
  });

  it("switching DOMAIN changes content only — same renderer, same primitive", () => {
    render(<InteractionLab suspenseMs={0} />);
    const before = {
      renderer: screen.getByTestId("lab-renderer").textContent,
      primitive: stage().querySelector("[data-mig-primitive]")!.getAttribute("data-mig-primitive"),
      prompt: screen.getByTestId("duel-prompt").textContent,
    };
    fireEvent.click(screen.getByTestId("lab-domain-leaguecraft"));
    expect(lab()).toHaveAttribute("data-domain", "leaguecraft");
    expect(screen.getByTestId("lab-renderer").textContent).toBe(before.renderer);
    expect(stage().querySelector("[data-mig-primitive]")!.getAttribute("data-mig-primitive")).toBe(before.primitive);
    expect(screen.getByTestId("duel-prompt").textContent).not.toBe(before.prompt);
    expect(screen.getByTestId("duel-prompt")).toHaveTextContent(labFixture("data-duel", "leaguecraft").content.prompt);
    // Structurally: the renderer is chosen by mechanic and takes no domain.
    expect(labRendererFor.length).toBe(1);
    expect(labRendererFor("data-duel")).toBe(LAB_DATA_DUEL_RENDERER);
  });

  it("Data Duel: full open → lock → reveal loop through the arena, emitting a SegmentChoice", async () => {
    render(<InteractionLab suspenseMs={0} />);
    const f = labFixture("data-duel", "pro-play");
    expect(stage().innerHTML).not.toContain(f.hidden.values[f.content.left.token]);
    fireEvent.click(screen.getByTestId("duel-side-right"));
    await lockAndReveal("duel-lock");
    expect(screen.getByTestId("lab-response")).toHaveTextContent(JSON.stringify({ selected: f.content.right.token }));
    expect(screen.getByTestId("duel-value-left")).toHaveTextContent(f.hidden.values[f.content.left.token]);
    expect(screen.getByTestId("duel-value-right")).toHaveTextContent(f.hidden.values[f.content.right.token]);
    // The arena's own result overlay carries the lab-scoped verdict.
    const expected = f.hidden.canonicalToken === f.content.right.token ? "CORRECT" : "INCORRECT";
    expect(screen.getByTestId("lab-verdict")).toHaveTextContent(expected);
    expect(stage()).toHaveTextContent(expected);
  });

  it("Stat Drop: numeric SegmentChoice, then the canonical value arrives", async () => {
    render(<InteractionLab suspenseMs={0} />);
    fireEvent.click(screen.getByTestId("lab-mechanic-stat-drop"));
    const f = labFixture("stat-drop", "pro-play");
    expect(stage().innerHTML).not.toContain(f.hidden.canonicalDisplay);
    fireEvent.keyDown(screen.getByTestId("drop-range"), { key: "End" });
    await lockAndReveal("drop-lock");
    expect(screen.getByTestId("lab-response")).toHaveTextContent(JSON.stringify({ selected: f.content.scale.max }));
    expect(screen.getByTestId("drop-true-value")).toHaveTextContent(f.hidden.canonicalDisplay);
    // Stat Drop is not graded: no verdict anywhere.
    expect(screen.queryByTestId("lab-verdict")).toBeNull();
  });

  it("Reset returns to an unanswered OPEN round with no reveal", async () => {
    render(<InteractionLab suspenseMs={0} />);
    fireEvent.click(screen.getByTestId("duel-side-left"));
    await lockAndReveal("duel-lock");
    fireEvent.click(screen.getByTestId("lab-reset"));
    expect(lab()).toHaveAttribute("data-phase", "open");
    expect(screen.getByTestId("lab-response")).toHaveTextContent("not locked");
    expect(screen.getByTestId("duel-side-left")).toHaveAttribute("aria-checked", "false");
    expect(stage().querySelector("[data-canonical]")).toBeNull();
    expect(screen.getByTestId("duel-lock")).toBeDisabled();
  });

  it("changing content mid-reveal also resets", async () => {
    render(<InteractionLab suspenseMs={0} />);
    fireEvent.click(screen.getByTestId("duel-side-left"));
    await lockAndReveal("duel-lock");
    fireEvent.click(screen.getByTestId("lab-domain-leaguecraft"));
    expect(lab()).toHaveAttribute("data-phase", "open");
    expect(stage().querySelector("[data-canonical]")).toBeNull();
  });

  it("emits ZERO analytics and makes no network request across a full session", async () => {
    render(<InteractionLab suspenseMs={0} />);
    fireEvent.click(screen.getByTestId("duel-side-left"));
    await lockAndReveal("duel-lock");
    fireEvent.click(screen.getByTestId("lab-mechanic-stat-drop"));
    fireEvent.click(screen.getByTestId("lab-domain-leaguecraft"));
    fireEvent.click(screen.getByTestId("drop-nudge-up"));
    await lockAndReveal("drop-lock");
    fireEvent.click(screen.getByTestId("lab-replay"));
    await act(async () => { await new Promise((r) => setTimeout(r, 5)); });
    fireEvent.click(screen.getByTestId("lab-reset"));
    expect(analytics.track).not.toHaveBeenCalled();
    expect(analytics.trackAsync).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("Interaction Lab — isolation from production", () => {
  it("leaves the production module registry untouched", () => {
    expect(registeredModuleIds()).toEqual(["item_cost_duel", "mastery_slice", "quiz"]);
    for (const r of [LAB_DATA_DUEL_RENDERER, LAB_STAT_DROP_RENDERER]) {
      expect(getModuleRenderer(r.moduleId, 1)).toBeNull();
      expect(rendererForSegment({ moduleId: r.moduleId, moduleVersion: 1 } as never)).toBeNull();
    }
    const registry = readFileSync(resolve(process.cwd(), "src/lib/ranked-core/modules/registry.ts"), "utf8");
    expect(registry).not.toMatch(/interaction-lab|interaction-grammar|mig_lab/);
  });

  it("imports no controller, client, analytics, audio or production hook", () => {
    const dir = __dirname;
    const files = readdirSync(dir).filter((f) => /\.tsx?$/.test(f) && !f.includes(".test."));
    const primitives = ["DataDuel.tsx", "StatDrop.tsx", "shared.tsx"]
      .map((f) => resolve(process.cwd(), "src/components/interaction-grammar", f));
    for (const file of [...files.map((f) => resolve(dir, f)), ...primitives]) {
      // RUNTIME imports only: `import type` is erased at build and can carry no
      // side effect — it is how the lab names the production `SegmentChoice`.
      const imports = readFileSync(file, "utf8").split("\n")
        .filter((l) => /^\s*import\b|from "/.test(l) && !/^\s*import type\b/.test(l)).join("\n");
      for (const forbidden of [
        "@/lib/analytics", "useSurfaceEvent", "useActivity", "ranked-public/client\"",
        "useRankedMatch", "useRankedMatchSfx", "useRankedAudioBoundary", "@/lib/audio",
        "pro-play/statsApi", "pro-play/api\"", "pro-play/mediaApi", "supabase",
        "quiz-ranked/", "quiz-daily-challenge/",
      ]) {
        expect(imports, `${file} imports ${forbidden}`).not.toContain(forbidden);
      }
    }
  });

  it("has no production entry point: nothing outside the lab links to or imports it", () => {
    const hits: string[] = [];
    const walk = (d: string) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const p = resolve(d, e.name);
        if (e.isDirectory()) { if (!p.includes("interaction-lab") && !p.includes("interaction-grammar")) walk(p); }
        else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\./.test(e.name)) {
          if (/interaction-lab/.test(readFileSync(p, "utf8"))) hits.push(p.replace(process.cwd(), ""));
        }
      }
    };
    walk(resolve(process.cwd(), "src"));
    // App.tsx is the one (gated) registration site.
    expect(hits.map((h) => h.replace(/\\/g, "/"))).toEqual(["/src/App.tsx"]);
  });
});
