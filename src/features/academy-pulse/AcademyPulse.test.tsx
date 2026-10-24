/**
 * Academy Pulse shell (jsdom): controls, holds, scene interactions, the
 * expanded view and the radio hand-off. Animations are skipped
 * (MotionGlobalConfig) so scene changes settle at once.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { MotionGlobalConfig } from "framer-motion";

const reduced = vi.hoisted(() => ({ current: false }));
vi.mock("@/hooks/useReducedMotionPreference", () => ({
  useReducedMotionPreference: () => reduced.current,
  readReducedMotionPreference: () => reduced.current,
}));
vi.mock("@/hooks/useChampionAssets", () => ({
  useChampionAssets: () => ({ data: undefined }),
  getChampionIcon: () => null,
  getChampionSplash: () => null,
}));
const radio = vi.hoisted(() => ({ suppressed: [] as boolean[] }));
vi.mock("@/lib/audio/academy-radio", () => ({
  setRadioSuppressedByMode: (on: boolean) => radio.suppressed.push(on),
}));

import AcademyPulse from "./AcademyPulse";
import { fixturePulseCatalogue } from "./content/pulse-provider";
import { DEFAULT_PULSE_CADENCE } from "./model/pulse-cadence";
import type { PulseCatalogue, PulseContentProvider } from "./model/pulse-types";

/** The fixtures, with an optional short dwell so the clock can be observed. */
function provider(dwellMs?: number): PulseContentProvider {
  const base = fixturePulseCatalogue();
  const cat: PulseCatalogue = {};
  for (const [k, items] of Object.entries(base)) cat[k as keyof PulseCatalogue] = (items ?? []).map((i) => (dwellMs ? { ...i, dwellMs } : i));
  return { id: `test-${dwellMs ?? "default"}`, load: async () => cat, peek: () => cat };
}

function mount(props: Partial<Parameters<typeof AcademyPulse>[0]> = {}) {
  return render(
    <MemoryRouter>
      <div style={{ height: 260 }}>
        <AcademyPulse provider={provider()} cadence={DEFAULT_PULSE_CADENCE} {...props} />
      </div>
    </MemoryRouter>,
  );
}
const scene = () => screen.getByTestId("academy-pulse-scene");

beforeAll(() => { MotionGlobalConfig.skipAnimations = true; });
afterAll(() => { MotionGlobalConfig.skipAnimations = false; });
beforeEach(() => {
  reduced.current = false;
  radio.suppressed = [];
  // jsdom has no PointerEvent: give React's pointer events their pointerType
  class PE extends MouseEvent {
    pointerType: string;
    constructor(type: string, init: MouseEventInit & { pointerType?: string } = {}) { super(type, init); this.pointerType = init.pointerType ?? "mouse"; }
  }
  (window as unknown as { PointerEvent: unknown }).PointerEvent = PE;
});
afterEach(() => { vi.useRealTimers(); });

describe("the device", () => {
  it("is an accessible carousel that labels its content as development samples", () => {
    mount();
    const root = screen.getByTestId("academy-pulse");
    expect(root).toHaveAttribute("aria-roledescription", "carousel");
    expect(root).toHaveAccessibleName("Academy Pulse");
    expect(root).toHaveAttribute("data-provenance", "fixture");
    expect(within(root).getByText("Sample")).toBeInTheDocument();
    expect(screen.getByTestId("academy-pulse-viewport")).toHaveAttribute("aria-roledescription", "slide");
    expect(screen.getByTestId("academy-pulse-viewport")).toHaveAccessibleName(/^1 of 12: Player activity\./);
    for (const name of ["Previous scene", "Pause Academy Pulse", "Next scene", "Expand this scene"]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
    expect(screen.getAllByRole("button", { name: /^Scene \d+:/ })).toHaveLength(12);
  });

  it("Next, Previous and the pips move between scenes; arrow keys work on the rail", async () => {
    mount();
    expect(scene()).toHaveAttribute("data-category", "player-activity");
    fireEvent.click(screen.getByTestId("academy-pulse-next"));
    await waitFor(() => expect(scene()).toHaveAttribute("data-category", "mini-game"));
    fireEvent.click(screen.getByTestId("academy-pulse-prev"));
    await waitFor(() => expect(scene()).toHaveAttribute("data-category", "player-activity"));
    fireEvent.click(screen.getByRole("button", { name: "Scene 4: Leaderboard" }));
    await waitFor(() => expect(scene()).toHaveAttribute("data-category", "leaderboard"));
    fireEvent.keyDown(screen.getByTestId("academy-pulse-next"), { key: "ArrowRight" });
    await waitFor(() => expect(scene()).toHaveAttribute("data-category", "news"));
  });

  it("rotates on its own after the dwell", async () => {
    mount({ provider: provider(60) });
    await waitFor(() => expect(scene()).toHaveAttribute("data-category", "mini-game"), { timeout: 2000 });
  });

  it("Pause stops the rotation and says so; Play resumes it", async () => {
    mount({ provider: provider(60) });
    fireEvent.click(screen.getByTestId("academy-pulse-toggle"));
    expect(screen.getByTestId("academy-pulse-toggle")).toHaveAccessibleName("Play Academy Pulse");
    expect(screen.getByTestId("academy-pulse-toggle")).toHaveAttribute("aria-pressed", "true");
    await new Promise((r) => setTimeout(r, 250));
    expect(scene()).toHaveAttribute("data-category", "player-activity");
    fireEvent.click(screen.getByTestId("academy-pulse-toggle"));
    await waitFor(() => expect(scene()).toHaveAttribute("data-category", "mini-game"), { timeout: 2000 });
  });

  it("holds while the pointer rests on it and while keyboard focus is inside it", async () => {
    mount({ provider: provider(60) });
    const root = screen.getByTestId("academy-pulse");
    // React derives enter/leave from over/out with a relatedTarget outside the element
    fireEvent.pointerOver(root, { pointerType: "mouse", relatedTarget: document.body });
    await new Promise((r) => setTimeout(r, 250));
    expect(scene()).toHaveAttribute("data-category", "player-activity");
    expect(root).toHaveAttribute("data-playing", "false");
    fireEvent.pointerOut(root, { pointerType: "mouse", relatedTarget: document.body });
    const expand = screen.getByTestId("academy-pulse-expand");
    // Keyboard focus has the :focus-visible indicator. Generic scripted focus
    // (or a mouse click) does not represent keyboard intent anymore.
    const matches = vi.spyOn(expand, "matches");
    matches.mockImplementation((selector) => selector === ":focus-visible" ? true : HTMLElement.prototype.matches.call(expand, selector));
    fireEvent.focus(expand);
    expect(root).toHaveAttribute("data-playing", "false");
    await new Promise((r) => setTimeout(r, 250));
    expect(scene()).toHaveAttribute("data-category", "player-activity");
    matches.mockRestore();
  });

  it("a parked mouse releases its hover hold after a finite grace period", () => {
    vi.useFakeTimers();
    mount({ provider: provider(30_000) });
    const root = screen.getByTestId("academy-pulse");
    fireEvent.pointerOver(root, { pointerType: "mouse", relatedTarget: document.body });
    expect(root).toHaveAttribute("data-playing", "false");
    act(() => { vi.advanceTimersByTime(5_900); });
    expect(root).toHaveAttribute("data-playing", "false");
    act(() => { vi.advanceTimersByTime(200); });
    expect(root).toHaveAttribute("data-playing", "true");
  });

  it("new genuine mouse movement starts another brief reading grace", () => {
    vi.useFakeTimers();
    mount({ provider: provider(30_000) });
    const root = screen.getByTestId("academy-pulse");
    fireEvent.pointerOver(root, { pointerType: "mouse", clientX: 20, clientY: 20, relatedTarget: document.body });
    act(() => { vi.advanceTimersByTime(6_100); });
    expect(root).toHaveAttribute("data-playing", "true");
    fireEvent.pointerMove(root, { pointerType: "mouse", clientX: 60, clientY: 28 });
    expect(root).toHaveAttribute("data-playing", "false");
    act(() => { vi.advanceTimersByTime(6_100); });
    expect(root).toHaveAttribute("data-playing", "true");
  });

  it("Play overrides a transient hover hold and updates its true playing state", () => {
    mount({ provider: provider(30_000) });
    const root = screen.getByTestId("academy-pulse");
    const toggle = screen.getByTestId("academy-pulse-toggle");
    fireEvent.pointerOver(root, { pointerType: "mouse", relatedTarget: document.body });
    expect(root).toHaveAttribute("data-playing", "false");
    expect(toggle).toHaveAccessibleName("Play Academy Pulse");
    fireEvent.click(toggle);
    expect(root).toHaveAttribute("data-playing", "true");
    expect(toggle).toHaveAccessibleName("Pause Academy Pulse");
  });

  it("mouse focus on a scene control does not persist as keyboard focus after pointer departure", () => {
    mount({ provider: provider(30_000) });
    const root = screen.getByTestId("academy-pulse");
    const next = screen.getByTestId("academy-pulse-next");
    const matches = vi.spyOn(next, "matches");
    matches.mockImplementation((selector) => selector === ":focus-visible" ? false : HTMLElement.prototype.matches.call(next, selector));
    fireEvent.pointerOver(root, { pointerType: "mouse", relatedTarget: document.body });
    fireEvent.focus(next);
    fireEvent.click(next);
    fireEvent.pointerOut(root, { pointerType: "mouse", relatedTarget: document.body });
    expect(root).toHaveAttribute("data-playing", "true");
    matches.mockRestore();
  });

  it("reduced motion starts paused", () => {
    reduced.current = true;
    mount();
    expect(screen.getByTestId("academy-pulse-toggle")).toHaveAccessibleName("Play Academy Pulse");
    expect(screen.getByTestId("academy-pulse")).toHaveAttribute("data-reduced", "true");
  });
});

describe("scenes are interactive, and nothing they do leaves the browser", () => {
  it("the practice question reveals the answer and its explanation, scoring nothing", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    mount({ startAt: "fx-question-fox", provider: provider(60) });
    expect(scene()).toHaveAttribute("data-scene", "question");
    expect(within(scene()).getByText("Practice only: nothing is scored.")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("pulse-question-option-lux"));
    expect(screen.getByTestId("pulse-question-option-lux")).toHaveAttribute("data-state", "wrong");
    expect(screen.getByTestId("pulse-question-option-ahri")).toHaveAttribute("data-state", "right");
    expect(within(scene()).getByText(/Ahri is the Nine-Tailed Fox/)).toBeInTheDocument();
    // the answer holds the scene: the short dwell passes and it stays
    await new Promise((r) => setTimeout(r, 250));
    expect(scene()).toHaveAttribute("data-scene", "question");
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("an answered practice question releases its interaction hold after ten quiet seconds", () => {
    vi.useFakeTimers();
    mount({ startAt: "fx-question-fox", provider: provider(30_000) });
    const pulse = screen.getByTestId("academy-pulse");
    fireEvent.click(screen.getByTestId("pulse-question-option-lux"));
    expect(pulse).toHaveAttribute("data-playing", "false");
    act(() => { vi.advanceTimersByTime(9_900); });
    expect(pulse).toHaveAttribute("data-playing", "false");
    act(() => { vi.advanceTimersByTime(200); });
    expect(pulse).toHaveAttribute("data-playing", "true");
  });

  it("a leaderboard row opens an inspect card; closing it returns focus to the row", async () => {
    mount({ startAt: "fx-leaderboard-daily" });
    const row = screen.getByTestId("pulse-board-row-1");
    row.focus();
    fireEvent.click(row);
    const card = await screen.findByRole("dialog", { name: "HextechOwl details" });
    expect(within(card).getByText("Accuracy")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("pulse-board-inspect-close"));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "HextechOwl details" })).toBeNull());
    expect(document.activeElement).toBe(screen.getByTestId("pulse-board-row-1"));
  });

  it("the achievement medallion turns over to its criteria", async () => {
    mount();
    fireEvent.click(screen.getByTestId("pulse-activity-explore"));
    expect(screen.getByTestId("pulse-activity-explore")).toHaveAttribute("aria-expanded", "true");
    expect(await within(scene()).findByText("No timeouts")).toBeInTheDocument();
  });

  it("the mini-game stops the needle and reports the result without sending anything", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    mount({ startAt: "fx-minigame-dial" });
    fireEvent.click(screen.getByTestId("pulse-minigame-stop"));
    expect(within(scene()).getByText(/Inside the gold|Missed by \d+ ms/)).toBeInTheDocument();
    expect(screen.getByTestId("pulse-minigame-stop")).toHaveTextContent("Again");
    expect(screen.getByTestId("pulse-minigame-play")).toHaveAttribute("href", "/quiz/more-challenges");
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("the sponsor is labelled Sponsored and a placeholder campaign's action is inert", () => {
    mount({ startAt: "fx-sponsor-placeholder" });
    expect(within(scene()).getByText("Sponsored")).toBeInTheDocument();
    expect(screen.getByTestId("pulse-sponsor-cta")).toBeDisabled();
    expect(within(scene()).getByText("No sponsor connected")).toBeInTheDocument();
  });

  it("Premium shows matrix benefits and links to the Premium page", () => {
    mount({ startAt: "fx-premium-lead" });
    expect(within(scene()).getByText("Performance trends")).toBeInTheDocument();
    expect(screen.getByTestId("pulse-premium-cta")).toHaveAttribute("href", "/lol/premium");
  });
});

describe("the expanded view", () => {
  it("opens as a modal over the current scene, holds the rotation and closes with Escape", async () => {
    mount({ provider: provider(60) });
    screen.getByTestId("academy-pulse-expand").focus();
    fireEvent.click(screen.getByTestId("academy-pulse-expand"));
    const dialog = await screen.findByTestId("pulse-expanded");
    expect(dialog).toHaveAttribute("role", "dialog");
    expect(within(dialog).getByText("Preview sample")).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 250));
    expect(scene()).toHaveAttribute("data-category", "player-activity");
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(screen.queryByTestId("pulse-expanded")).toBeNull());
    expect(document.activeElement).toBe(screen.getByTestId("academy-pulse-expand"));
  });

  it("a creator video loads no player until asked, and Academy Radio yields while it plays", async () => {
    mount({ startAt: "fx-creator-video" });
    fireEvent.click(screen.getByTestId("pulse-creator-watch"));
    const viewer = await screen.findByTestId("pulse-viewer");
    expect(viewer.querySelector("iframe")).toBeNull();
    expect(radio.suppressed).toEqual([]);
    fireEvent.click(within(viewer).getByTestId("pulse-viewer-play"));
    expect(radio.suppressed).toEqual([true]);
    expect(within(viewer).getByText(/Sample player · no YouTube video is connected/)).toBeInTheDocument();
    expect(viewer.querySelector("iframe")).toBeNull(); // a sample never embeds anything
    fireEvent.click(screen.getByTestId("pulse-expanded-close"));
    await waitFor(() => expect(screen.queryByTestId("pulse-viewer")).toBeNull());
    expect(radio.suppressed).toEqual([true, false]);
  });

  it("a real video embeds the privacy-enhanced player only after Play", async () => {
    const cat = fixturePulseCatalogue();
    const creator = cat["creator-spotlight"]![0];
    const real = { ...creator, provenance: "live" as const, media: { ...(creator.kind === "creator" ? creator.media : {}), platform: "youtube" as const, videoId: "dQw4w9WgXcQ", title: "t", durationLabel: "1:00", thumbnailUrl: null } };
    const p: PulseContentProvider = { id: "real", load: async () => ({ ...cat, "creator-spotlight": [real] }), peek: () => ({ ...cat, "creator-spotlight": [real] }) };
    mount({ provider: p, startAt: creator.id });
    fireEvent.click(screen.getByTestId("pulse-creator-watch"));
    const viewer = await screen.findByTestId("pulse-viewer");
    expect(viewer.querySelector("iframe")).toBeNull();
    await act(async () => { fireEvent.click(within(viewer).getByTestId("pulse-viewer-play")); });
    expect(viewer.querySelector("iframe")?.getAttribute("src")).toMatch(/^https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ\?/);
    expect(within(viewer).getByRole("link", { name: "Open on YouTube" })).toHaveAttribute("href", "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  });
});
