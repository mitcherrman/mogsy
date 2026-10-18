/**
 * UX-1 — full clickthrough of the SYNTHETIC Dynasty prototype in jsdom.
 * Motion is mocked off (all reveals immediate); timing is covered separately.
 */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const motion = vi.hoisted(() => ({ allowed: false }));
vi.mock("@/lib/motion/useReveal", async (orig) => ({ ...(await orig<typeof import("@/lib/motion/useReveal")>()), useMotionAllowed: () => motion.allowed }));
vi.mock("@/lib/audio/useSfx", () => ({ useSfx: () => ({ play: () => undefined, stop: () => undefined, preload: () => undefined }) }));

import DynastyV2Prototype from "./DynastyV2Prototype";

const click = (id: string) => fireEvent.click(screen.getByTestId(id));
const has = (id: string) => screen.queryByTestId(id) !== null;
const screenId = () => screen.getByTestId("dynasty-v2").getAttribute("data-screen");

function mount(url = "/dev/dynasty-v2?seed=ux-test") {
  return render(<MemoryRouter initialEntries={[url]}><DynastyV2Prototype /></MemoryRouter>);
}

function setup(orgId = "ember") {
  click("home-new");
  click(`org-choose-${orgId}`);
  const stars = screen.getAllByTestId(/^star-/);
  fireEvent.click(stars[0]); fireEvent.click(stars[1]);
  click("stars-confirm");
  click("roster-continue");
}

function enterSeries() {
  click("season-begin");
  if (screenId() === "recruit") {
    fireEvent.click(screen.getAllByTestId(/^offer-/)[0]);
    click("recruit-sign");
  }
  click("prep-toggle-rest");
  click("prep-confirm");
  click("scout-continue");
}

function draftAndLock() {
  for (const r of ["top", "jng", "mid", "bot", "sup"]) {
    const radios = within(screen.getByTestId(`draft-row-${r}`)).getAllByRole("radio") as HTMLInputElement[];
    fireEvent.click(radios.find((x) => !x.disabled)!);
  }
  click("draft-lock");
}

type Answer = (kind: string, qIndex: number) => boolean;

/** Plays the open game to its result screen. Returns the path taken. */
function playGame(answer: Answer) {
  const path: string[] = [];
  let guard = 0;
  while (screenId() === "game" && guard++ < 80) {
    const v = screen.getByTestId("game-view");
    const step = v.getAttribute("data-step")!;
    path.push(`${v.getAttribute("data-stage")}:${step}`);
    if (has("objective-panel")) {
      const kind = screen.getByTestId("objective-panel").getAttribute("data-kind")!;
      click("objective-start");
      let q = 0;
      while (screen.getByTestId("objective-panel").getAttribute("data-phase") === "ask") {
        const want = answer(kind, q);
        const opts = screen.getAllByTestId(/^objective-opt-/);
        const target = opts.find((o) => (o.getAttribute("data-synthetic-correct") === "true") === want)!;
        fireEvent.click(target);
        click("objective-next");
        q++;
      }
      click("objective-continue");
    } else if (step === "events") click("events-continue");
    else if (has("teamfight-resolve")) click("teamfight-resolve");
    else if (step === "score") click("score-stage");
    else if (step === "after") click("stage-continue");
    else if (step === "closed") click("closeout-continue");
    else throw new Error(`stuck at ${step}`);
  }
  return path;
}

beforeAll(() => { window.scrollTo = vi.fn() as unknown as typeof window.scrollTo; });
afterEach(() => { cleanup(); motion.allowed = false; });

describe("UX-1 clickthrough", () => {
  it("covers home → org → stars → roster → season → recruit → prep → scout → draft → game → result → tactic", () => {
    mount();
    expect(has("proto-banner") || screen.getByText(/synthetic prototype/i)).toBeTruthy();
    setup();
    expect(screenId()).toBe("season");
    expect(screen.getAllByTestId(/^node-\d$/)).toHaveLength(8);
    click("roster-open");
    expect(screen.getAllByText(/Academy stand-in/).length).toBe(3);
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    enterSeries();
    expect(screenId()).toBe("draft");
    expect(has("comp-readout")).toBe(true);
    expect(screen.getByTestId("draft-lock")).toBeDisabled();
    draftAndLock();
    expect(screenId()).toBe("game");
    playGame((_k, q) => q !== 1);
    expect(screenId()).toBe("result");
    expect(screen.getAllByTestId(/^delta-/)).toHaveLength(5);
    expect(within(screen.getByTestId("screen-result")).getByTestId("bo-pips")).toBeInTheDocument();
    click("result-continue");
    expect(screenId()).toBe("tactic");
    click("tactic-pick-scale");
    expect(screenId()).toBe("draft");
    // Fearless: game 1's champions are now disabled.
    const disabled = screen.getAllByRole("radio").filter((r) => (r as HTMLInputElement).disabled);
    expect(disabled.length).toBe(5);
  });

  it("plays a whole eight-node run to the end screen", () => {
    mount("/dev/dynasty-v2?seed=full-run");
    setup("tide");
    let guard = 0;
    while (screenId() !== "end" && guard++ < 400) {
      const id = screenId();
      if (id === "season") enterSeries();
      else if (id === "draft") draftAndLock();
      else if (id === "game") playGame(() => true);
      else if (id === "result") click("result-continue");
      else if (id === "tactic") click("tactic-skip");
      else if (id === "series") click("series-continue");
      else throw new Error(`unexpected screen ${id}`);
    }
    expect(screenId()).toBe("end");
    expect(has("legacy-card")).toBe(true);
  }, 30_000);

  it("shows the Early+Mid / Baron closeout flow with no Late stage or Late events", () => {
    let closed = 0;
    for (let i = 0; i < 40 && closed < 2; i++) {
      const { unmount } = mount(`/dev/dynasty-v2?seed=co-${i}`);
      setup();
      enterSeries();
      draftAndLock();
      const path = playGame(() => true);
      const timeline = screen.getByTestId("game-timeline");
      if (timeline.getAttribute("data-ended") === "mid") {
        closed++;
        expect(path.some((p) => p.startsWith("late:"))).toBe(false);
        expect(screen.getByTestId("game-reason").textContent).toMatch(/No Late stage/);
        expect(timeline.textContent).not.toMatch(/Late\s*\d/);
      }
      unmount();
    }
    expect(closed).toBeGreaterThan(0);
  }, 30_000);

  it("shows the reached-Late flow, where Late states that it decides and a winner exists", () => {
    let late = 0;
    for (let i = 0; i < 40 && late < 2; i++) {
      const { unmount } = mount(`/dev/dynasty-v2?seed=lt-${i}`);
      setup();
      enterSeries();
      draftAndLock();
      const path = playGame((k, q) => !(k === "baron" && q === 0));
      const timeline = screen.getByTestId("game-timeline");
      if (timeline.getAttribute("data-ended") === "late") {
        late++;
        expect(path.some((p) => p.startsWith("late:"))).toBe(true);
        expect(timeline.textContent).toMatch(/Late/);
        expect(screen.getByRole("heading", { level: 2 }).textContent).toMatch(/Game (won|lost)/);
      }
      unmount();
    }
    expect(late).toBeGreaterThan(0);
  }, 30_000);

  it("never renders a tied or sub-7 stage score; Late states that it decides", () => {
    mount("/dev/dynasty-v2?seed=late-check");
    setup(); enterSeries(); draftAndLock();
    for (let guard = 0; screenId() === "game" && guard < 80; guard++) {
      const v = screen.getByTestId("game-view");
      const step = v.getAttribute("data-step");
      if (has("stage-points")) {
        const [a, b] = screen.getByTestId("stage-points").textContent!.split("–").map(Number);
        expect(a + b).toBe(7);
        expect(a).not.toBe(b);
      }
      if (has("late-final")) expect(screen.getByTestId("late-final").textContent).toMatch(/Late always decides/);
      if (has("objective-panel")) { click("objective-start"); while (screen.getByTestId("objective-panel").getAttribute("data-phase") === "ask") { fireEvent.click(screen.getAllByTestId(/^objective-opt-/)[0]); click("objective-next"); } click("objective-continue"); }
      else if (step === "events") click("events-continue");
      else if (has("teamfight-resolve")) click("teamfight-resolve");
      else if (step === "score") click("score-stage");
      else if (step === "after") click("stage-continue");
      else if (step === "closed") click("closeout-continue");
    }
  });

  it("opens the explanation sheet with both tabs and labels synthetic baselines", () => {
    mount();
    setup(); enterSeries(); draftAndLock();
    for (let guard = 0; !has("stage-result") && guard < 20; guard++) {
      if (has("objective-panel")) { click("objective-start"); while (screen.getByTestId("objective-panel").getAttribute("data-phase") === "ask") { fireEvent.click(screen.getAllByTestId(/^objective-opt-/)[0]); click("objective-next"); } click("objective-continue"); }
      else if (screen.getByTestId("game-view").getAttribute("data-step") === "events") click("events-continue");
      else if (has("teamfight-resolve")) click("teamfight-resolve");
      else click("score-stage");
    }
    fireEvent.click(screen.getByLabelText("Why: Top lane"));
    const sheet = screen.getByTestId("explain-sheet");
    expect(within(sheet).getByTestId("explain-parts").textContent).toMatch(/Player phase skill/);
    expect(within(sheet).getByTestId("roll-strip")).toBeInTheDocument();
    fireEvent.mouseDown(within(sheet).getByRole("tab", { name: "Baseline" }), { button: 0 });
    fireEvent.click(within(sheet).getByRole("tab", { name: "Baseline" }));
    expect(within(sheet).getByTestId("explain-baseline").textContent).toMatch(/invented/);
  });
});

describe("objective gallery", () => {
  it("renders every Baron outcome 0–3, with the closeout only when offered", () => {
    mount("/dev/dynasty-v2?view=objectives");
    const out = screen.getByTestId("gallery-outcomes");
    for (const c of [0, 1, 2, 3]) expect(within(out).getByTestId(`gallery-outcome-${c}`).getAttribute("data-correct")).toBe(String(c));
    expect(within(out).getByTestId("gallery-outcome-3").getAttribute("data-closeout")).toBe("true");
    expect(within(out).getByTestId("gallery-outcome-1").getAttribute("data-tone")).toBe("mixed");
    fireEvent.click(screen.getByTestId("gallery-closeout"));
    expect(within(screen.getByTestId("gallery-outcomes")).getByTestId("gallery-outcome-3").getAttribute("data-closeout")).toBe("false");
  });
  it("shows the Dragon and Elder examples and never closes on them", () => {
    mount("/dev/dynasty-v2?view=objectives");
    fireEvent.click(screen.getByTestId("gallery-kind-dragon"));
    expect(screen.getByTestId("gallery-outcomes").children).toHaveLength(2);
    fireEvent.click(screen.getByTestId("gallery-kind-elder"));
    const out = screen.getByTestId("gallery-outcomes");
    expect(out.children).toHaveLength(4);
    for (const c of [0, 1, 2, 3]) expect(within(out).getByTestId(`gallery-outcome-${c}`).getAttribute("data-closeout")).toBe("false");
  });
  it.each([0, 1, 2, 3])("the live Baron panel with %i correct reaches the matching outcome", (k) => {
    mount("/dev/dynasty-v2?view=objectives");
    click("objective-start");
    for (let q = 0; q < 3; q++) {
      const opts = screen.getAllByTestId(/^objective-opt-/);
      const want = q < k;
      fireEvent.click(opts.find((o) => (o.getAttribute("data-synthetic-correct") === "true") === want)!);
      click("objective-next");
    }
    expect(screen.getByTestId("objective-outcome").getAttribute("data-correct")).toBe(String(k));
  });
});

describe("reveal timing", () => {
  it("auto-reveals six tiles in about two seconds when motion is allowed, and Skip is instant", () => {
    vi.useFakeTimers();
    motion.allowed = true;
    try {
      mount();
      setup(); enterSeries(); draftAndLock();
      click("events-continue");
      if (has("objective-panel")) {
        click("objective-start");
        while (screen.getByTestId("objective-panel").getAttribute("data-phase") === "ask") { fireEvent.click(screen.getAllByTestId(/^objective-opt-/)[0]); click("objective-next"); }
        click("objective-continue");
      }
      click("score-stage");
      expect(has("stage-result")).toBe(false);
      for (let n = 0; n < 5; n++) act(() => { vi.advanceTimersByTime(335); });
      expect(has("stage-result")).toBe(false);
      act(() => { vi.advanceTimersByTime(335); });
      expect(has("stage-result")).toBe(true);
    } finally { vi.useRealTimers(); }
  });
});
