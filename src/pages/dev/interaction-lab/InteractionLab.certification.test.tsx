/**
 * MIG1.2 — certification tests: every fixture in the matrix, the margin and
 * tie reveals, Stat Drop's under/over/exact states, fixture switching, sound
 * cues through the existing SFX engine, and reduced motion.
 *
 * The MIG1.1 suites (DataDuel.test, StatDrop.test, InteractionLab.test) are
 * untouched in intent and still run.
 */
import { useState } from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sfx = vi.hoisted(() => ({ play: vi.fn(), muted: false }));
vi.mock("@/lib/audio/useSfx", () => ({
  useSfx: () => ({ play: sfx.play, stop: vi.fn(), preload: vi.fn() }),
  useSfxSnapshot: () => ({ muted: sfx.muted, configReady: true, contextState: "running" }),
}));
const motion = vi.hoisted(() => ({ reduced: false }));
vi.mock("@/hooks/useReducedMotionPreference", () => ({
  useReducedMotionPreference: () => motion.reduced,
}));
const analytics = vi.hoisted(() => ({ track: vi.fn(), trackAsync: vi.fn() }));
vi.mock("@/lib/analytics/track", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/analytics/track")>()),
  track: analytics.track,
  trackAsync: analytics.trackAsync,
}));

import { DataDuel } from "@/components/interaction-grammar/DataDuel";
import { dropOutcome, StatDrop } from "@/components/interaction-grammar/StatDrop";
import { InteractionLab } from "./InteractionLab";
import { LAB_CUES_STORAGE_KEY } from "./labCues";
import {
  allLabFixtures, labFixtureById, labFixturesFor, LAB_SCALES,
  type DropFixture, type DuelFixture,
} from "./labFixtures";

const DUELS = labFixturesFor("data-duel") as DuelFixture[];
const DROPS = labFixturesFor("stat-drop") as DropFixture[];

let fetchSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  window.history.replaceState(null, "", "/dev/interaction-lab");
  window.localStorage.removeItem(LAB_CUES_STORAGE_KEY);
  fetchSpy = vi.spyOn(globalThis, "fetch");
  sfx.play.mockClear();
  sfx.muted = false;
  motion.reduced = false;
});
afterEach(() => {
  fetchSpy.mockRestore();
  analytics.track.mockClear();
  analytics.trackAsync.mockClear();
});

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ------------------------------------------------------------ the matrix

describe("certification fixture matrix", () => {
  it("has 3–5+ fixtures per primitive, spanning both domains", () => {
    for (const list of [DUELS, DROPS]) {
      expect(list.length).toBeGreaterThanOrEqual(3);
      expect(new Set(list.map((f) => f.domain))).toEqual(new Set(["pro-play", "leaguecraft"]));
    }
    const ids = allLabFixtures().map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("covers the required Data Duel content shapes", () => {
    const withArt = DUELS.filter((f) => f.content.left.media?.src);
    const noArt = DUELS.filter((f) => !f.content.left.media?.src);
    expect(withArt.length).toBeGreaterThan(0);
    expect(noArt.length).toBeGreaterThan(0);
    expect(DUELS.some((f) => f.content.tie)).toBe(true);
    expect(DUELS.some((f) => f.hidden.canonicalToken === f.content.tie?.token)).toBe(true);
    // Large and close margins, by the authority's own numbers.
    const rel = (f: DuelFixture) => {
      const a = f.hidden.numericValues![f.content.left.token];
      const b = f.hidden.numericValues![f.content.right.token];
      return Math.abs(a - b) / Math.max(a, b);
    };
    expect(Math.max(...DUELS.map(rel))).toBeGreaterThan(0.4);
    expect(Math.min(...DUELS.filter((f) => rel(f) > 0).map(rel))).toBeLessThan(0.05);
    // A long label/scope to stress the layout.
    expect(Math.max(...DUELS.map((f) => f.content.prompt.length))).toBeGreaterThan(110);
  });

  it("covers the required Stat Drop scale shapes", () => {
    expect(DROPS.some((f) => f.content.scale.decimals > 0)).toBe(true);
    expect(DROPS.some((f) => f.content.scale.decimals === 0)).toBe(true);
    const spans = DROPS.map((f) => f.content.scale.max - f.content.scale.min);
    expect(Math.min(...spans)).toBeLessThanOrEqual(40);
    expect(Math.max(...spans)).toBeGreaterThanOrEqual(200);
  });

  it("never centres a scale on its answer (scales come from the metric family)", () => {
    const families = Object.values(LAB_SCALES).map((s) => `${s.min}-${s.max}`);
    for (const f of DROPS) {
      expect(families, f.id).toContain(`${f.content.scale.min}-${f.content.scale.max}`);
    }
  });

  it("each fixture's canonical answer is one of its own options", () => {
    for (const f of DUELS) {
      const tokens = [f.content.left.token, f.content.right.token, f.content.tie?.token].filter(Boolean);
      expect(tokens, f.id).toContain(f.hidden.canonicalToken);
      expect(Object.keys(f.hidden.values).sort()).toEqual([f.content.left.token, f.content.right.token].sort());
    }
  });
});

// ------------------------------------------------------------ Data Duel

function Duel({ f, revealed = false }: { f: DuelFixture; revealed?: boolean }) {
  const [v, setV] = useState<string | null>(null);
  const [locked, setLocked] = useState<string | null>(null);
  return (
    <DataDuel content={f.content} phase={revealed ? "revealed" : locked ? "locked" : "open"}
      value={v} onChange={setV} onLock={(r) => setLocked(r.selected)}
      reveal={revealed ? f.hidden : null} />
  );
}

describe.each(DUELS.map((f) => [f.id, f] as const))("DataDuel · %s", (_id, f) => {
  it("leaks no value, evidence or verdict before reveal", () => {
    const { container } = render(<Duel f={f} />);
    const text = container.textContent ?? "";
    for (const v of Object.values(f.hidden.values)) {
      expect(text).not.toMatch(new RegExp(`(^|[^\\d.])${escape(v)}([^\\d]|$)`));
    }
    if (f.hidden.evidence) expect(text).not.toContain(f.hidden.evidence);
    expect(screen.queryByTestId("duel-margin")).toBeNull();
    expect(container.querySelector("[data-canonical]")).toBeNull();
    expect(container.querySelector('[data-choice-state="correct"]')).toBeNull();
  });

  it("reveals the margin toward the canonical option, in words", () => {
    const { rerender } = render(<Duel f={f} />);
    rerender(<Duel f={f} revealed />);
    const margin = screen.getByTestId("duel-margin");
    const toward = f.hidden.canonicalToken === f.content.left.token ? "left"
      : f.hidden.canonicalToken === f.content.right.token ? "right" : "tie";
    expect(margin).toHaveAttribute("data-margin-toward", toward);
    const text = screen.getByTestId("duel-margin-text").textContent!;
    if (toward === "tie") {
      expect(text).toMatch(/Dead even/);
      expect(screen.getByTestId("duel-margin-even")).toBeInTheDocument();
    } else {
      expect(text).toContain((toward === "left" ? f.content.left : f.content.right).label);
      expect(screen.getByTestId("duel-margin-fill")).toBeInTheDocument();
    }
  });
});

describe("DataDuel tie", () => {
  const f = labFixtureById("duel.lc.olaf-lucian-tie") as DuelFixture;
  const pp = DUELS.filter((d) => d.domain === "pro-play");

  it("offers a neutral third option only when the domain has one", () => {
    render(<Duel f={f} />);
    expect(screen.getByTestId("duel-side-tie")).toHaveTextContent(f.content.tie!.label);
    expect(pp.every((d) => !d.content.tie)).toBe(true);
  });

  it("is reachable by keyboard and emits the tie token", () => {
    const onLock = vi.fn();
    function Kb() {
      const [v, setV] = useState<string | null>(null);
      return <DataDuel content={f.content} phase="open" value={v} onChange={setV} onLock={onLock} />;
    }
    render(<Kb />);
    screen.getByTestId("duel-side-left").focus();
    fireEvent.keyDown(screen.getByTestId("duel-side-left"), { key: "ArrowRight" });
    fireEvent.keyDown(screen.getByTestId("duel-side-right"), { key: "ArrowDown" });
    expect(screen.getByTestId("duel-side-tie")).toHaveAttribute("aria-checked", "true");
    expect(document.activeElement).toBe(screen.getByTestId("duel-side-tie"));
    fireEvent.keyDown(screen.getByTestId("duel-side-tie"), { key: "Enter" });
    expect(onLock).toHaveBeenCalledWith({ selected: "tie" });
  });

  it("reveals the tie as the answer with both values and a centred even mark", () => {
    const { rerender } = render(<Duel f={f} />);
    rerender(<Duel f={f} revealed />);
    expect(screen.getByTestId("duel-side-tie")).toHaveAttribute("data-choice-state", "correct");
    expect(screen.getByTestId("duel-tag-answer-tie")).toHaveTextContent(/answer/i);
    expect(screen.getByTestId("duel-value-left")).toHaveTextContent(f.hidden.values[f.content.left.token]);
    expect(screen.getByTestId("duel-value-right")).toHaveTextContent(f.hidden.values[f.content.right.token]);
    expect(screen.getByTestId("duel-margin-even")).toBeInTheDocument();
  });
});

// ------------------------------------------------------------ Stat Drop

function Drop({ f, revealed = false, value }: { f: DropFixture; revealed?: boolean; value?: number }) {
  const [v, setV] = useState<number | null>(value ?? null);
  return (
    <StatDrop content={f.content} phase={revealed ? "revealed" : "open"}
      value={v} onChange={setV} onLock={() => {}} reveal={revealed ? f.hidden : null} />
  );
}

describe.each(DROPS.map((f) => [f.id, f] as const))("StatDrop · %s", (_id, f) => {
  it("leaks no canonical value or evidence before reveal", () => {
    const { container } = render(<Drop f={f} />);
    const text = container.textContent ?? "";
    expect(text).not.toMatch(new RegExp(`(^|[^\\d.])${escape(f.hidden.canonicalDisplay)}([^\\d]|$)`));
    if (f.hidden.evidence) expect(text).not.toContain(f.hidden.evidence);
    // The RAW value in markup (attributes included) — meaningful only for a
    // long raw value such as 8.1818…; a two-digit integer legitimately
    // appears in a tick label or a class name, and the text check above
    // already covers what the player can read.
    const raw = String(f.hidden.canonicalValue);
    if (raw.length >= 4) expect(container.innerHTML).not.toContain(raw);
    expect(screen.queryByTestId("drop-true-marker")).toBeNull();
    expect(screen.queryByTestId("drop-true-flag")).toBeNull();
  });

  it("reveals a strong ACTUAL callout, the flag, and an under/over state", () => {
    const below = f.content.scale.min;
    render(<Drop f={f} value={below} revealed />);
    expect(screen.getByTestId("drop-true-value")).toHaveTextContent(f.hidden.canonicalDisplay);
    expect(screen.getByTestId("drop-true-flag")).toHaveTextContent(`Actual ${f.hidden.canonicalDisplay}`);
    const expected = dropOutcome(below, f.hidden, f.content.scale).outcome;
    expect(screen.getByTestId("drop-outcome")).toHaveAttribute("data-outcome", expected);
    if (expected !== "exact") {
      expect(screen.getByTestId("drop-outcome")).toHaveTextContent(new RegExp(expected, "i"));
      expect(screen.getByTestId("drop-gap")).toBeInTheDocument();
    }
  });
});

describe("StatDrop outcomes", () => {
  const armor = labFixtureById("drop.lc.ahri-armor-l3") as DropFixture;
  const olaf = labFixtureById("drop.lc.olaf-undertow-haste") as DropFixture;

  it("under / over / exact on an integer scale", () => {
    const v = armor.hidden.canonicalValue;
    expect(dropOutcome(v - 3, armor.hidden, armor.content.scale).outcome).toBe("under");
    expect(dropOutcome(v + 3, armor.hidden, armor.content.scale).outcome).toBe("over");
    expect(dropOutcome(v, armor.hidden, armor.content.scale)).toMatchObject({ outcome: "exact", delta: 0 });
  });

  it("exact means equal AT THE ANSWER'S DISPLAYED PRECISION on a decimal scale", () => {
    // 8.1818… is displayed "8.2"; an estimate of 8.2 agrees at one decimal.
    expect(olaf.hidden.canonicalDisplay).toBe("8.2");
    expect(dropOutcome(8.2, olaf.hidden, olaf.content.scale).outcome).toBe("exact");
    expect(dropOutcome(8.1, olaf.hidden, olaf.content.scale).outcome).toBe("under");
    expect(dropOutcome(8.3, olaf.hidden, olaf.content.scale).outcome).toBe("over");
  });

  it("renders the exact state without a gap, in words", () => {
    render(<Drop f={armor} value={armor.hidden.canonicalValue} revealed />);
    expect(screen.getByTestId("mig-stat-drop")).toHaveAttribute("data-outcome", "exact");
    expect(screen.getByTestId("drop-outcome")).toHaveTextContent(/dead on/i);
    expect(screen.queryByTestId("drop-gap")).toBeNull();
  });
});

// ------------------------------------------------------------ the lab

const lab = () => screen.getByTestId("interaction-lab");
const stage = () => screen.getByTestId("ranked-question");
async function settle() { await act(async () => { await new Promise((r) => setTimeout(r, 5)); }); }

describe("Interaction Lab · fixtures and state", () => {
  it("every fixture renders inside the arena through its mechanic's one renderer", () => {
    render(<InteractionLab suspenseMs={0} />);
    for (const f of allLabFixtures()) {
      if (lab().dataset.mechanic !== f.mechanic) fireEvent.click(screen.getByTestId(`lab-mechanic-${f.mechanic}`));
      if (lab().dataset.domain !== f.domain) fireEvent.click(screen.getByTestId(`lab-domain-${f.domain}`));
      fireEvent.change(screen.getByTestId("lab-fixture-select"), { target: { value: f.id } });
      expect(lab()).toHaveAttribute("data-fixture", f.id);
      expect(within(stage()).getByTestId(f.mechanic === "data-duel" ? "mig-data-duel" : "mig-stat-drop")).toBeInTheDocument();
      expect(screen.getByTestId("lab-renderer")).toHaveTextContent(f.mechanic === "data-duel" ? "mig_lab.data_duel" : "mig_lab.stat_drop");
    }
  });

  it("switching fixture mid-reveal leaks no prior state", async () => {
    render(<InteractionLab suspenseMs={0} />);
    fireEvent.click(screen.getByTestId("duel-side-left"));
    fireEvent.click(screen.getByTestId("duel-lock"));
    await settle();
    expect(lab()).toHaveAttribute("data-phase", "revealed");
    fireEvent.click(screen.getByTestId("lab-fixture-next"));
    expect(lab()).toHaveAttribute("data-phase", "open");
    expect(screen.getByTestId("lab-response")).toHaveTextContent("not locked");
    expect(stage().querySelector("[data-canonical]")).toBeNull();
    expect(screen.queryByTestId("duel-margin")).toBeNull();
    expect(screen.getByTestId("duel-side-left")).toHaveAttribute("aria-checked", "false");
  });

  it("reset is deterministic: the same fixture, open, nothing selected", async () => {
    render(<InteractionLab suspenseMs={0} />);
    fireEvent.click(screen.getByTestId("lab-mechanic-stat-drop"));
    const id = lab().dataset.fixture;
    fireEvent.keyDown(screen.getByTestId("drop-range"), { key: "End" });
    fireEvent.click(screen.getByTestId("drop-lock"));
    await settle();
    fireEvent.click(screen.getByTestId("lab-reset"));
    expect(lab()).toHaveAttribute("data-fixture", id);
    expect(lab()).toHaveAttribute("data-phase", "open");
    const f = labFixtureById(id!) as DropFixture;
    expect(screen.getByTestId("drop-estimate").textContent).toContain(
      ((f.content.scale.min + f.content.scale.max) / 2).toFixed(f.content.scale.decimals));
  });

  it("?fixture= deep-links to a fixture", () => {
    window.history.replaceState(null, "", "/dev/interaction-lab?fixture=drop.lc.zed-shadow-slash");
    render(<InteractionLab suspenseMs={0} />);
    expect(lab()).toHaveAttribute("data-fixture", "drop.lc.zed-shadow-slash");
    expect(screen.getByTestId("drop-prompt").textContent).toMatch(/Zed/);
  });
});

describe("Interaction Lab · sound cues (existing SFX engine only)", () => {
  const events = () => sfx.play.mock.calls.map((c) => c[0]);

  it("select → lock → exactly one verdict cue per reveal", async () => {
    render(<InteractionLab suspenseMs={0} />);
    fireEvent.click(screen.getByTestId("duel-side-left"));
    fireEvent.click(screen.getByTestId("duel-lock"));
    await settle();
    const f = labFixtureById(lab().dataset.fixture!) as DuelFixture;
    const verdict = f.hidden.canonicalToken === f.content.left.token ? "ranked.answer.correct" : "ranked.answer.incorrect";
    expect(events()).toEqual(["leaguecraft.record.selection", "ranked.answer.lock", verdict]);
    // Every play carries a per-round event id, so the engine can dedupe.
    expect(sfx.play.mock.calls.every((c) => typeof c[1]?.eventId === "string")).toBe(true);
  });

  it("Stat Drop: no chatter while dragging, one neutral resolve cue", async () => {
    render(<InteractionLab suspenseMs={0} />);
    fireEvent.click(screen.getByTestId("lab-mechanic-stat-drop"));
    for (let i = 0; i < 5; i++) fireEvent.keyDown(screen.getByTestId("drop-range"), { key: "ArrowRight" });
    fireEvent.click(screen.getByTestId("drop-lock"));
    await settle();
    expect(events()).toEqual(["ranked.answer.lock", "combat.simulation.resolve"]);
  });

  it("the per-viewer switch silences the lab and persists", async () => {
    const { unmount } = render(<InteractionLab suspenseMs={0} />);
    fireEvent.click(screen.getByTestId("lab-cues"));
    expect(window.localStorage.getItem(LAB_CUES_STORAGE_KEY)).toBe("0");
    fireEvent.click(screen.getByTestId("duel-side-left"));
    fireEvent.click(screen.getByTestId("duel-lock"));
    await settle();
    expect(sfx.play).not.toHaveBeenCalled();
    unmount();
    render(<InteractionLab suspenseMs={0} />);
    expect(screen.getByTestId("lab-cues")).toHaveAttribute("aria-pressed", "false");
  });

  it("reports the global mute from the engine", () => {
    sfx.muted = true;
    render(<InteractionLab suspenseMs={0} />);
    expect(screen.getByTestId("lab-sound-state")).toHaveTextContent(/muted globally/i);
  });

  it("emits no analytics and no fetch", async () => {
    render(<InteractionLab suspenseMs={0} />);
    fireEvent.click(screen.getByTestId("duel-side-right"));
    fireEvent.click(screen.getByTestId("duel-lock"));
    await settle();
    expect(analytics.track).not.toHaveBeenCalled();
    expect(analytics.trackAsync).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("reduced motion", () => {
  it("removes decorative animation but keeps every state readable", async () => {
    motion.reduced = true;
    render(<InteractionLab suspenseMs={0} />);
    fireEvent.click(screen.getByTestId("duel-side-left"));
    fireEvent.click(screen.getByTestId("duel-lock"));
    await settle();
    const duel = screen.getByTestId("mig-data-duel");
    expect(duel.querySelectorAll('[class*="animate-"]')).toHaveLength(0);
    // State is still communicated: values, answer tag, margin in words.
    expect(screen.getByTestId("duel-margin-text").textContent).toBeTruthy();
    expect(duel.querySelector("[data-canonical='true']")).not.toBeNull();
  });

  it("Stat Drop's gap is drawn at full size immediately", () => {
    motion.reduced = true;
    const f = labFixtureById("drop.pp.peanut-sejuani") as DropFixture;
    render(<Drop f={f} value={0} revealed />);
    expect(screen.getByTestId("drop-gap").style.width).not.toBe("0%");
    expect(screen.getByTestId("mig-stat-drop").querySelectorAll('[class*="animate-"]')).toHaveLength(0);
  });
});
