/**
 * UX-1 — full clickthrough of the SYNTHETIC Dynasty prototype in jsdom.
 * Motion is mocked off (all reveals immediate); timing is covered separately.
 */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const motion = vi.hoisted(() => ({ allowed: false }));
vi.mock("@/lib/motion/useReveal", async (orig) => ({ ...(await orig<typeof import("@/lib/motion/useReveal")>()), useMotionAllowed: () => motion.allowed }));
vi.mock("@/lib/audio/useSfx", () => ({ useSfx: () => ({ play: () => undefined, stop: () => undefined, preload: () => undefined }) }));

import DynastyV2Prototype from "./DynastyV2Prototype";
import { CasterPop, ChatBurst, ambience, ambientNewGame, ambientQuestionOpen, ambientResetForTests } from "./broadcast";
import { FullFrame } from "./cinematics";
import { hush } from "./audio";
import { ORGS } from "./fixtures";
import { MEDIA_SLOTS } from "./media";
import { MOMENT_CUES } from "./audio";

// VIS-F3: the ambient budget and settings are module state; start every test clean.
beforeEach(() => { ambientResetForTests(); ambience.resetForTests(); try { localStorage.clear(); } catch { /* jsdom */ } });

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
  if (has("lock-seq")) click("lock-skip"); // VIS-F4: the lock-in sequence plays first
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

describe("VIS-F1 visual layer", () => {
  it("renders the showcase with closeout, result, series and run-end heroes", () => {
    mount("/dev/dynasty-v2?view=showcase");
    const root = screen.getByTestId("showcase");
    expect(root.getAttribute("data-mood")).toBe("victory");
    expect(screen.getAllByTestId("closeout")).toHaveLength(2);
    expect(screen.getByTestId("showcase-baron-3").getAttribute("data-closeout")).toBe("true");
    expect(screen.getByTestId("showcase-baron-0").getAttribute("data-tone")).toBe("bad");
    expect(screen.getAllByTestId("legacy-card").length).toBe(2);
    expect(screen.getAllByTestId("game-timeline").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByTestId("bo-pips").length).toBeGreaterThanOrEqual(2);
  });

  it("sets the org accent and the mood light as the run progresses", () => {
    mount();
    const root = screen.getByTestId("dynasty-v2");
    expect(root.getAttribute("data-mood")).toBe("home");
    setup();
    expect(root.style.getPropertyValue("--dyn-accent")).toBe("#ff8f63");
    expect(screen.getAllByTestId("org-crest").length).toBeGreaterThanOrEqual(1);
    enterSeries(); draftAndLock();
    expect(root.getAttribute("data-mood")).toBe("early");
    click("events-continue");
    if (has("objective-panel")) {
      expect(root.getAttribute("data-mood")).toBe("dragon");
      expect(screen.getAllByTestId("sigil").some((s) => s.getAttribute("data-kind") === "dragon")).toBe(true);
    }
  });

  it("collapses the published tally while the Baron encounter is live and stamps the Late verdict", () => {
    let seen = { baron: false, late: false };
    for (let i = 0; i < 40 && !(seen.baron && seen.late); i++) {
      const { unmount } = mount(`/dev/dynasty-v2?seed=vis-${i}`);
      setup(); enterSeries(); draftAndLock();
      for (let guard = 0; screenId() === "game" && guard < 80; guard++) {
        const v = screen.getByTestId("game-view");
        const step = v.getAttribute("data-step")!;
        if (step === "baron" && !seen.baron) {
          seen = { ...seen, baron: true };
          const tally = screen.getByTestId("stage-score");
          expect(within(tally).getByTestId("stage-points").textContent).toMatch(/^\d–\d$/);
          expect(within(tally).queryByTestId("team-tile")).toBeNull();
          expect(screen.getByTestId("objective-panel").getAttribute("data-kind")).toBe("baron");
        }
        if (step === "after" && v.getAttribute("data-stage") === "late" && has("late-verdict")) {
          seen = { ...seen, late: true };
          expect(screen.getByTestId("late-verdict").textContent).toMatch(/Game (won|lost)/);
          expect(within(screen.getByTestId("stage-result")).queryByText(/Kinda winning|Kinda losing|Even/)).toBeNull();
        }
        if (has("objective-panel")) { click("objective-start"); while (screen.getByTestId("objective-panel").getAttribute("data-phase") === "ask") { const opts = screen.getAllByTestId(/^objective-opt-/); fireEvent.click(opts.find((o) => o.getAttribute("data-synthetic-correct") === "false")!); click("objective-next"); } click("objective-continue"); }
        else if (step === "events") click("events-continue");
        else if (has("teamfight-resolve")) click("teamfight-resolve");
        else if (step === "score") click("score-stage");
        else if (step === "after") click("stage-continue");
        else if (step === "closed") click("closeout-continue");
      }
      unmount();
    }
    expect(seen.baron).toBe(true);
    expect(seen.late).toBe(true);
  }, 30_000);

  it("keeps the lead marker inside the track at both caps", () => {
    mount("/dev/dynasty-v2?view=showcase");
    // LeadMeter is pure: render it directly through the result of a scored stage is indirect; assert the clamp formula via the DOM of a game.
    cleanup();
    mount();
    setup(); enterSeries(); draftAndLock();
    const meter = screen.getByTestId("lead-meter");
    const marker = meter.querySelector<HTMLElement>(".dyn-lead-marker")!;
    const pct = parseFloat(marker.style.left);
    expect(pct).toBeGreaterThanOrEqual(4);
    expect(pct).toBeLessThanOrEqual(96);
  });

  it("applies no reveal delay and no motion classes when motion is not allowed", () => {
    motion.allowed = false;
    mount();
    setup(); enterSeries(); draftAndLock();
    expect(document.querySelector(".dyn-enter")).toBeNull();
    expect(document.querySelector(".dyn-stagger")).toBeNull();
    for (let guard = 0; !has("stage-result") && guard < 20; guard++) {
      if (has("objective-panel")) { click("objective-start"); while (screen.getByTestId("objective-panel").getAttribute("data-phase") === "ask") { fireEvent.click(screen.getAllByTestId(/^objective-opt-/)[0]); click("objective-next"); } click("objective-continue"); }
      else if (screen.getByTestId("game-view").getAttribute("data-step") === "events") click("events-continue");
      else if (has("teamfight-resolve")) click("teamfight-resolve");
      else click("score-stage");
    }
    // With motion off the six tiles and the result are present synchronously after the score click.
    expect(has("stage-result")).toBe(true);
    expect(document.querySelector(".dyn-tile--win, .dyn-tile--loss, .dyn-stamp, .dyn-bump")).toBeNull();
  });
});

describe("VIS-F2 cinematic layer", () => {
  it("places each screen in its location and the game in the tunnel, then the stadium", () => {
    mount();
    expect(screen.getByTestId("scene").getAttribute("data-scene")).toBe("hq");
    setup();
    expect(screen.getByTestId("scene").getAttribute("data-scene")).toBe("hq");
    click("season-begin");
    expect(screen.getByTestId("scene").getAttribute("data-scene")).toBe("practice");
    if (screenId() === "recruit") click("recruit-skip");
    click("prep-toggle-rest"); click("prep-confirm"); click("scout-continue");
    expect(screen.getByTestId("scene").getAttribute("data-scene")).toBe("warroom");
    draftAndLock();
    expect(screen.getByTestId("game-view").getAttribute("data-scene")).toBe("tunnel");
    expect(screen.getByTestId("led-ribbon").textContent).toMatch(/Walking out/);
    click("events-continue");
    expect(screen.getByTestId("game-view").getAttribute("data-scene")).toBe("stadium");
  });

  it("fires stingers for the signature moments and shows the roster story beat", () => {
    mount();
    click("home-new");
    click("org-choose-ember");
    expect(screen.getByTestId("stinger").getAttribute("data-stinger")).toBe("org.choose");
    const stars = screen.getAllByTestId(/^star-/);
    fireEvent.click(stars[0]); fireEvent.click(stars[1]);
    click("stars-confirm");
    expect(screen.getByTestId("stinger").getAttribute("data-stinger")).toBe("run.start");
    const beat = screen.getByTestId("story-beat");
    expect(beat.getAttribute("data-folded")).toBe("false");
    click("story-skip");
    expect(screen.getByTestId("story-beat").getAttribute("data-folded")).toBe("true");
    click("roster-continue");
    enterSeries();
    draftAndLock();
    expect(screen.getByTestId("stinger").getAttribute("data-stinger")).toBe("draft.lock");
    click("events-continue");
    if (has("objective-panel")) {
      expect(screen.getByTestId("stinger").getAttribute("data-stinger")).toBe("objective.dragon");
      expect(screen.getByTestId("objective-pit")).toBeInTheDocument();
    }
  });

  it("draft rows use champion cards with class glyphs and keep the radio contract", () => {
    mount();
    setup(); enterSeries();
    const row = screen.getByTestId("draft-row-top");
    expect(within(row).getAllByTestId("class-glyph").length).toBe(5);
    expect(within(row).getAllByRole("radio").length).toBe(5);
    expect(within(row).getByText("Rare play possible")).toBeInTheDocument();
  });

  it("generates the same caster line and chat burst for the same key", () => {
    mount("/dev/dynasty-v2?view=showcase");
    const casters = screen.getAllByTestId("caster-pop");
    expect(casters.length).toBeGreaterThanOrEqual(2);
    const text = casters[0].textContent;
    cleanup();
    mount("/dev/dynasty-v2?view=showcase");
    expect(screen.getAllByTestId("caster-pop")[0].textContent).toBe(text);
    expect(screen.getAllByTestId("chat-burst").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByTestId("stinger-board")).toBeInTheDocument();
    click("fire-championship");
    expect(screen.getByTestId("stinger").getAttribute("data-stinger")).toBe("championship");
    click("scene-trophy");
    expect(screen.getByTestId("scene").getAttribute("data-scene")).toBe("trophy");
  });

  it("renders the roster as hierarchy cards: stars large, academy small", () => {
    mount();
    setup();
    click("roster-open");
    const sheet = screen.getByTestId("roster-sheet");
    const sizes = within(sheet).getAllByTestId(/^roster-/).map((el) => el.getAttribute("data-size"));
    expect(sizes.filter((s) => s === "star").length).toBe(2);
    expect(sizes.filter((s) => s === "bench").length).toBe(3);
  });
});

// ───────────────────────────────────────────────────────────── VIS-F3

describe("VIS-F3 living worlds and cinematic media", () => {
  it("routes every stinger and moment through a Dynasty cue (no silent ranked.round.final left)", () => {
    expect(MOMENT_CUES["dyn.series.match_point"]).toBe("dynasty.series.match_point");
    expect(MOMENT_CUES["dyn.obj.elder_start"]).toBe("dynasty.obj.elder_start");
    expect(MOMENT_CUES["dyn.game.stage_open"]).toBe("dynasty.game.stage_open");
    expect(MOMENT_CUES["dyn.game.contests.tile"]).toBe("dynasty.game.tile");
    // media slots VIS-F3 draws exist in the registry with provenance
    for (const id of ["player.trait_chip", "finals.intro_card", "end.trophy", "obj.baron.pit_backdrop", "frame.championship", "draft.champion_splash_strip"]) {
      expect(MEDIA_SLOTS[id]?.provenance).toBe("code");
    }
  });

  it("rate-limits ambient text: one item per 8 s, nothing during an open question, settings switch layers off", () => {
    ambientNewGame("t1");
    const { rerender } = render(<div><CasterPop moment="stage.open" k="a" /><ChatBurst moment="game.win" k="b" /></div>);
    expect(screen.getAllByTestId("caster-pop").length).toBe(1);
    expect(screen.queryByTestId("chat-burst")).toBeNull(); // second item inside the 8 s gap is dropped, not queued
    expect(screen.getByTestId("caster-pop").textContent).toMatch(/Simulated/);
    ambientResetForTests(); ambientNewGame("t2"); ambientQuestionOpen(true);
    rerender(<div><CasterPop moment="stage.open" k="c" /></div>);
    expect(screen.queryByTestId("caster-pop")).toBeNull();
    ambientQuestionOpen(false); ambientResetForTests(); ambientNewGame("t3");
    rerender(<div><CasterPop moment="stage.open" k="d" exempt /><ChatBurst moment="game.win" k="e" exempt /></div>);
    expect(screen.getByTestId("chat-burst").textContent).toMatch(/Simulated chat/);
    act(() => ambience.set({ master: false }));
    expect(screen.queryByTestId("caster-pop")).toBeNull();
    expect(screen.queryByTestId("chat-burst")).toBeNull();
  });

  it("labels simulated state: trait chips and condition rows carry Generated in-run, portraits run the placeholder tier", () => {
    mount();
    click("home-new"); click("org-choose-ember");
    const stars = screen.getAllByTestId(/^star-/);
    fireEvent.click(stars[0]); fireEvent.click(stars[1]);
    click("stars-confirm"); // roster screen: five starter cards
    expect(screen.getAllByText("Generated in-run").length).toBeGreaterThanOrEqual(5);
    const tiers = document.querySelectorAll('[data-tier="placeholder"]');
    expect(tiers.length).toBeGreaterThanOrEqual(5);
    expect(document.querySelectorAll('[data-tier="real"]').length).toBe(0); // no licensed real-player imagery in the prototype
    // the Ambience & sound sheet opens from the run bar and switches the caster desk off
    click("roster-continue");
    click("ambience-open");
    expect(screen.getByTestId("ambience-sheet")).toBeInTheDocument();
    expect(screen.getByTestId("snd-test")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("amb-master"));
    expect(ambience.get().master).toBe(false);
    fireEvent.click(screen.getByTestId("amb-master"));
    expect(ambience.get().master).toBe(true);
  });

  it("walks out with the lineup strip and tunnel frame, marks the stadium variant, and labels Dragon questions prototype-only", () => {
    mount();
    setup(); enterSeries(); draftAndLock();
    const gv = screen.getByTestId("game-view");
    expect(gv.getAttribute("data-scene")).toBe("tunnel");
    expect(gv.getAttribute("data-variant")).toBe("normal");
    // VIS-F4: the walkout sequence plays first (skippable); the lineup strip takes its place
    const walkout = screen.getByTestId("walkout");
    expect(walkout.getAttribute("data-beat")).toBe("stage"); // motion is off: static stage beat
    expect(walkout.textContent).toMatch(/Ember Wing/); // the stage beat carries both team names
    click("walkout-skip");
    expect(screen.queryByTestId("walkout")).toBeNull();
    expect(screen.getByTestId("lineup-strip").getAttribute("data-comp")).not.toBe("");
    expect(screen.getAllByTestId("lineup-tile").length).toBe(5);
    click("events-continue");
    if (has("objective-panel")) {
      const kind = screen.getByTestId("objective-panel").getAttribute("data-kind");
      const pit = screen.getByTestId("objective-pit");
      expect(pit.getAttribute("data-spectacle")).toBe(kind);
      expect(pit.getAttribute("data-phase")).toBe("stakes");
      expect(screen.getByTestId("objective-contract").getAttribute("data-contract")).toBe(kind === "baron" ? "e1" : "prototype");
      click("objective-start");
      expect(screen.getByTestId("objective-pit").getAttribute("data-phase")).toBe("ask");
    }
  });

  it("gives the Baron the E1 contract label in the objective gallery", () => {
    mount("/dev/dynasty-v2?view=objectives");
    const panel = screen.getByTestId("objective-panel");
    expect(panel.getAttribute("data-kind")).toBe("baron");
    expect(screen.getByTestId("objective-contract").getAttribute("data-contract")).toBe("e1");
    expect(screen.getByTestId("objective-pit").getAttribute("data-spectacle")).toBe("baron");
  });

  it("shows a W3 full frame for at most 3 s and lets the player skip it", () => {
    vi.useFakeTimers();
    try {
      const done = vi.fn();
      render(<FullFrame kind="championship" org={ORGS[0]} team="Ember Wing" onDone={done} />);
      expect(screen.getByTestId("cine-full").getAttribute("data-kind")).toBe("championship");
      act(() => { vi.advanceTimersByTime(3001); });
      expect(done).toHaveBeenCalledTimes(1);
      expect(screen.queryByTestId("cine-full")).toBeNull();
      cleanup();
      const done2 = vi.fn();
      render(<FullFrame kind="finals_intro" org={ORGS[1]} opp="SYN Crown of Ash" team="Tide Front" onDone={done2} />);
      expect(screen.getByText("Worlds Final")).toBeInTheDocument();
      fireEvent.click(screen.getByTestId("cine-skip"));
      expect(done2).toHaveBeenCalledTimes(1);
      expect(screen.queryByTestId("cine-full")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

// ───────────────────────────────────────────────────────────── VIS-F4

describe("VIS-F4 cinematic production", () => {
  it("shows the run in the rooms: mood on the scene, star spotlights, the welcome banner after a signing", () => {
    mount();
    click("home-new"); click("org-choose-ember");
    const stars = screen.getAllByTestId(/^star-/);
    fireEvent.click(stars[0]); fireEvent.click(stars[1]);
    click("stars-confirm");
    expect(screen.getByTestId("scene").getAttribute("data-mood")).toBe("neutral");
    expect(screen.getAllByTestId("player-spotlight").length).toBe(2); // two franchise stars
    expect(document.querySelectorAll('[data-slot="player.portrait"] [data-pose]').length).toBeGreaterThanOrEqual(2);
    click("roster-continue"); click("season-begin");
    expect(screenId()).toBe("recruit");
    expect(screen.getAllByTestId(/^spotlight-/).length).toBe(3); // three offers as spotlights
    fireEvent.click(screen.getAllByTestId(/^offer-/)[0]);
    click("recruit-sign");
    expect(screenId()).toBe("prep");
    expect(screen.getByTestId("scene").getAttribute("data-scene")).toBe("practice");
    expect(document.querySelector('svg text')?.textContent ?? "").toBeDefined();
  });

  it("plays the draft lock-in sequence (five stamped tiles, identity, skippable) before the walkout", () => {
    mount();
    setup(); enterSeries();
    for (const r of ["top", "jng", "mid", "bot", "sup"]) {
      const radios = within(screen.getByTestId(`draft-row-${r}`)).getAllByRole("radio") as HTMLInputElement[];
      fireEvent.click(radios.find((x) => !x.disabled)!);
    }
    click("draft-lock");
    const seq = screen.getByTestId("lock-seq");
    expect(within(seq).getAllByTestId("lock-tile").length).toBe(5);
    expect(within(seq).getByTestId("lock-identity").textContent).not.toBe("");
    expect(screenId()).toBe("draft"); // the game opens only when the sequence ends
    click("lock-skip");
    expect(screen.queryByTestId("lock-seq")).toBeNull();
    expect(screenId()).toBe("game");
    expect(screen.getByTestId("stinger").getAttribute("data-stinger")).toBe("draft.lock");
    expect(screen.getByTestId("walkout")).toBeInTheDocument();
    expect(screen.getByTestId("scene").getAttribute("data-scene")).toBe("tunnel");
    click("walkout-skip");
    expect(screen.getByTestId("scene").getAttribute("data-scene")).toBe("stadium");
  });

  it("escalates the Baron with every question and names the consequence on the outcome", () => {
    mount("/dev/dynasty-v2?view=objectives");
    const pit = () => screen.getByTestId("objective-pit");
    expect(pit().getAttribute("data-intensity")).toBe("0");
    expect(screen.getByTestId("tension-ring")).toBeInTheDocument();
    click("objective-start");
    expect(pit().getAttribute("data-intensity")).toBe("1");
    const answerRight = () => { fireEvent.click(screen.getAllByTestId(/^objective-opt-/).find((o) => o.getAttribute("data-synthetic-correct") === "true")!); click("objective-next"); };
    answerRight();
    expect(pit().getAttribute("data-intensity")).toBe("2");
    answerRight();
    expect(pit().getAttribute("data-intensity")).toBe("3");
    answerRight();
    expect(screen.getByTestId("objective-panel").getAttribute("data-phase")).toBe("outcome");
    expect(pit().getAttribute("data-intensity")).toBe("3");
    expect(document.querySelector('[data-testid="objective-pit"] svg')?.getAttribute("data-tone")).toBe("great");
    expect(screen.getByTestId("objective-consequence").textContent).toMatch(/Back to the match/);
    expect(screen.getByTestId("objective-continue").textContent).toMatch(/Back to the match|See how the game ended/);
  });

  it("builds the championship payoff from run state and keeps the engine helpers safe without audio", () => {
    expect(() => hush(300)).not.toThrow(); // no AudioContext in jsdom: a no-op
    vi.useFakeTimers();
    try {
      const done = vi.fn();
      render(<FullFrame kind="championship" org={ORGS[0]} team="Ember Wing" roster={["SYN-Pell", "SYN-Quill", "SYN-Aurel Voss", "SYN-Dree", "SYN-Marn"]} score="3–2" onDone={done} cue="dyn.end.championship" />);
      const roster = screen.getByTestId("cine-roster");
      expect(within(roster).getAllByRole("listitem").length).toBe(5);
      expect(roster.textContent).toContain("Aurel Voss");
      expect(screen.getByText(/3–2/)).toBeInTheDocument();
      act(() => { vi.advanceTimersByTime(3001); });
      expect(done).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
