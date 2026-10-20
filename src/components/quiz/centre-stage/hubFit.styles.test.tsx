/**
 * QUIZ HUB MAIN-SCREEN FIT — the stylesheet contract.
 *
 * What the fit actually does to pixels is proven in a real browser
 * (e2e/quiz-hub-main-fit.spec.ts, run in CI). jsdom cannot lay anything out,
 * so these pin the two things it CAN see and that the browser test cannot
 * isolate on its own:
 *
 *   SCOPE     the fit must never reach the desktop three-sheet rack, Role or
 *             Ranked. Everything it declares has to sit inside a below-`lg`
 *             media query and be keyed to the Daily mode, and nothing it adds
 *             may exist outside one except two custom properties.
 *   HOOKS     the Daily pane's markup carries the class names the stylesheet
 *             reads, in every state, so a refactor of the component cannot
 *             silently disconnect the CSS.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { DailyStatusView } from "@/lib/daily-challenge/status";
import DailyModePanel from "./DailyModePanel";

const css = readFileSync(resolve(__dirname, "../../../index.css"), "utf8").replace(/\r\n/g, "\n");

const START = "/* ── QUIZ HUB — THE MAIN SCREEN FITS THE PHONE";
const END = "/* ── The unfurl";
const block = css.slice(css.indexOf(START), css.indexOf(END));

/** Top-level rules of a CSS fragment, with @media bodies parsed out. */
function parse(fragment: string) {
  const stripped = fragment.replace(/\/\*[\s\S]*?\*\//g, "");
  const media: { query: string; body: string }[] = [];
  const containers: { query: string; body: string }[] = [];
  const plain: string[] = [];
  let i = 0;
  while (i < stripped.length) {
    const open = stripped.indexOf("{", i);
    if (open === -1) break;
    const head = stripped.slice(i, open).trim();
    let depth = 1;
    let j = open + 1;
    while (j < stripped.length && depth > 0) {
      if (stripped[j] === "{") depth++;
      else if (stripped[j] === "}") depth--;
      j++;
    }
    const body = stripped.slice(open + 1, j - 1);
    if (head.startsWith("@media")) media.push({ query: head.replace("@media", "").trim(), body });
    else if (head.startsWith("@container")) containers.push({ query: head.replace("@container", "").trim(), body });
    else plain.push(`${head} {${body}}`);
    i = j;
  }
  return { media, containers, plain };
}

const parsed = parse(block);
const DAILY_SHEET = '.lc-scroll[data-order="centre"]:has(.lc-centre-stage[data-mode="daily"])';

describe("the Quiz Hub fit stylesheet", () => {
  it("exists, between the Daily figure and the unfurl", () => {
    expect(block.length).toBeGreaterThan(500);
  });

  it("declares nothing outside a media query except its two custom properties", () => {
    expect(parsed.plain).toHaveLength(1);
    expect(parsed.plain[0]).toMatch(/^:root \{/);
    const names = [...parsed.plain[0].matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]);
    expect(names.sort()).toEqual(["--lc-hub-above", "--lc-hub-below"]);
  });

  it("applies only below the desktop breakpoint", () => {
    expect(parsed.media.length).toBeGreaterThanOrEqual(3);
    for (const m of parsed.media) expect(m.query, m.query).toMatch(/^\(max-width: 1023px\)/);
  });

  it("keeps the narrow-sheet record rule to a container query on Daily's own markup", () => {
    expect(parsed.containers).toHaveLength(2);
    expect(parsed.containers.map((c) => c.query)).toEqual(["lc-scroll (max-width: 17rem)", "lc-scroll (max-width: 13rem)"]);
    for (const c of parsed.containers) expect(c.body).toContain(".lc-daily-panel .lc-daily-panel__stats");
  });

  it("keys every rule to the Daily mode or to Daily's own markup", () => {
    for (const m of [...parsed.media, ...parsed.containers]) {
      const selectors = [...m.body.matchAll(/(?:^|})\s*([^{}]+)\{/g)].map((x) => x[1].trim());
      expect(selectors.length).toBeGreaterThan(0);
      for (const sel of selectors) {
        for (const part of sel.split(",").map((s) => s.trim())) {
          expect(part.startsWith(DAILY_SHEET) || part.startsWith(".lc-daily-panel"), part).toBe(true);
        }
      }
    }
  });

  it("caps the sheet against the small viewport, with a vh fallback declared first", () => {
    const portrait = parsed.media[0].body;
    const vh = portrait.indexOf("100vh");
    const svh = portrait.indexOf("100svh");
    expect(vh).toBeGreaterThan(-1);
    expect(svh).toBeGreaterThan(vh);
    expect(portrait).toContain("max-height: max(26rem,");
  });

  it("budgets the shell header band, the hub padding and the bottom safe area", () => {
    const tokens = parsed.plain[0];
    expect(tokens).toContain("--app-header-h");
    expect(tokens).toContain("0.75rem");
    expect(tokens).toContain("env(safe-area-inset-bottom");
  });

  it("re-slices the rolls from the same artwork in the landscape case", () => {
    const landscape = parsed.media.find((m) => m.query.includes("orientation: landscape"))!;
    expect(landscape).toBeDefined();
    // Head roll = rows 0–145, foot roll = rows 1283–1448 of the 1086×1448 art.
    expect(landscape.body).toContain("* 9.986");
    expect(landscape.body).toContain("* 8.776");
    expect(1448 / 145).toBeCloseTo(9.986, 3);
    expect(1448 / 165).toBeCloseTo(8.776, 3);
    // The writing area keeps clear of the drawn paper edge (13.1% of the sheet).
    expect(landscape.body).toMatch(/padding: calc\(var\(--lc-cap-top-h\) \+ 0\.25rem\) 15\.5%/);
  });

  it("never lowers the seal under the 44px tap target at any step", () => {
    for (const m of block.matchAll(/--lc-seal-size:\s*([\d.]+)rem/g)) {
      expect(parseFloat(m[1]) * 16).toBeGreaterThanOrEqual(44);
    }
  });
});

describe("the Daily pane's layout hooks", () => {
  const day = (over: Partial<DailyStatusView>): DailyStatusView => ({
    known: true, completed: false, resumable: false, optionalOpen: false,
    resolved: null, total: null, streak: null, theme: null, ...over,
  });

  const states: [string, DailyStatusView | null][] = [
    ["unknown", null],
    ["available", day({})],
    ["in progress", day({ resumable: true })],
    ["complete, more open", day({ completed: true, resumable: true, optionalOpen: true, score: 1840, correct: 9, answered: 12 })],
    ["finished", day({ completed: true })],
  ];

  it.each(states)("%s carries every class the stylesheet reads", (_name, daily) => {
    const { container } = render(<DailyModePanel daily={daily} onPlay={() => {}} />);
    const panel = screen.getByTestId("daily-mode-panel");
    expect(panel.classList.contains("lc-daily-panel")).toBe(true);
    for (const cls of [
      "lc-daily-panel__head", "lc-daily-panel__title", "lc-daily-panel__status",
      "lc-daily-panel__stats", "lc-daily-panel__cta", "lc-daily-hero",
    ]) {
      expect(container.querySelector(`.${cls}`), cls).not.toBeNull();
    }
    // The title is the head's child, so `display: contents` frees it as a grid cell.
    expect(container.querySelector(".lc-daily-panel__head > .lc-daily-panel__title")).not.toBeNull();
    expect(container.querySelector(".lc-daily-panel__head > .lc-daily-panel__status")).not.toBeNull();
    // Only a play state has a seal and a caption.
    const seal = screen.queryByTestId("daily-play-seal");
    expect(Boolean(container.querySelector(".lc-daily-panel__caption"))).toBe(seal !== null);
  });

  it("keeps the direct children the landscape grid places", () => {
    const { container } = render(<DailyModePanel daily={day({})} onPlay={() => {}} />);
    const kids = [...screen.getByTestId("daily-mode-panel").children].map((c) => c.className);
    expect(kids).toHaveLength(4);
    expect(kids[0]).toContain("lc-daily-panel__head");
    expect(kids[1]).toContain("lc-daily-hero");
    expect(kids[2]).toContain("lc-daily-panel__stats");
    expect(kids[3]).toContain("lc-daily-panel__cta");
    expect(container).toBeTruthy();
  });
});
