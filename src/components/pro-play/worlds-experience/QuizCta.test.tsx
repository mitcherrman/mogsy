/**
 * W26Q — the Worlds 2026 Quiz entry in the Worlds experience's command bar.
 *
 * One fixed-size control in the bar's existing right cluster, in all three
 * bar layouts (desktop, portrait phone, landscape phone). It must not add a
 * row, a scroll container or motion: jsdom has no layout, so these tests pin
 * the structure that guarantees that; real-browser fit is a CI / approved-run
 * check (docs/handoffs/WORLDS_2026_QUIZ_HANDOFF.md §8).
 */
import { cleanup, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionGlobalConfig } from "framer-motion";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { __resetProPlayMediaCache } from "@/components/pro-play/media/ProPlayMediaProvider";
import { WORLDS_PRE, knockoutMid, playInDay1, swissThrough, worldsComplete } from "@/lib/pro-play/__fixtures__/worldsScenarios";
import { PRO_PLAY_WORLDS_QUIZ_ROUTE } from "@/lib/pro-play/routes";

import WorldsExperience from "./WorldsExperience";

const BASE = "/lol/dev/worlds-experience";
const NOW = Date.parse("2026-10-13T00:10:00Z");

type Layout = { desktop: boolean; landscape: boolean };
const LAYOUTS: Array<[string, Layout, string]> = [
  ["desktop", { desktop: true, landscape: false }, "wide"],
  ["portrait phone", { desktop: false, landscape: false }, "compact"],
  ["landscape phone", { desktop: false, landscape: true }, "compact"],
];

function renderAt(layout: Layout, path = BASE, data = WORLDS_PRE) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path={`${BASE}/*`} element={<WorldsExperience data={data} now={NOW} base={BASE} desktop={layout.desktop} landscape={layout.landscape} />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeAll(() => { MotionGlobalConfig.skipAnimations = true; });
afterAll(() => { MotionGlobalConfig.skipAnimations = false; });
beforeEach(() => {
  __resetProPlayMediaCache();
  window.sessionStorage.clear();
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ ok: true, identity_available: true, results: [] }) })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Worlds 2026 Quiz CTA (W26Q)", () => {
  it.each(LAYOUTS)("%s: exactly one quiz link, in the command bar, to the Worlds quiz", (_name, layout, kind) => {
    renderAt(layout);
    const bar = screen.getByTestId("command-bar");
    const ctas = screen.getAllByTestId("worlds-quiz-cta");
    expect(ctas).toHaveLength(1);
    const cta = ctas[0];
    expect(bar.contains(cta)).toBe(true);
    expect(cta.getAttribute("href")).toBe(PRO_PLAY_WORLDS_QUIZ_ROUTE);
    expect(cta).toHaveAccessibleName("Worlds 2026 Quiz");
    expect(cta).toHaveAttribute("data-layout", kind);
    // Fixed size, never a second bar row: it sits in the same parent as the
    // phase chip, and its box classes are fixed heights the bar already uses.
    expect(cta.parentElement).toBe(within(bar).getByTestId("phase-chip").parentElement);
    expect(cta.className).toMatch(kind === "wide" ? /\bh-7\b/ : /\bh-11\b/);
    expect(cta.className).not.toMatch(/animate-|overflow-(auto|scroll)/);
  });

  it("phones show the icon only; the desktop chip says Quiz", () => {
    renderAt({ desktop: false, landscape: false });
    expect(screen.getByTestId("worlds-quiz-cta").textContent).toBe("");
    cleanup();
    renderAt({ desktop: true, landscape: false });
    expect(screen.getByTestId("worlds-quiz-cta")).toHaveTextContent("Quiz");
  });

  it("is present on every screen, in every phase, without adding a scroll container", () => {
    const states = [playInDay1(), swissThrough(3), knockoutMid(), worldsComplete()];
    const paths = [BASE, `${BASE}/stages/play-in`, `${BASE}/teams`, `${BASE}/schedule`];
    for (const [i, path] of paths.entries()) {
      renderAt({ desktop: false, landscape: i % 2 === 1 }, path, states[i]);
      expect(screen.getAllByTestId("worlds-quiz-cta")).toHaveLength(1);
      const frame = screen.getByTestId("worlds-experience");
      const scrollers = [...frame.querySelectorAll<HTMLElement>("*")].filter((el) => /overflow-(y-)?(auto|scroll)/.test(el.className));
      expect(scrollers).toEqual([]);
      cleanup();
    }
  });
});
