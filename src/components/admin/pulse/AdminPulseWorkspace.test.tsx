// PULSE-2B — the owner workflow end to end on the prototype repository:
// author → publish → it plays; categories and cadence; partner records;
// emergency disable; the real Pulse device in preview.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { MotionGlobalConfig } from "framer-motion";

vi.mock("@/hooks/useReducedMotionPreference", () => ({
  useReducedMotionPreference: () => true,
  readReducedMotionPreference: () => true,
}));
vi.mock("@/hooks/useChampionAssets", () => ({
  useChampionAssets: () => ({ data: undefined }),
  getChampionIcon: () => null,
  getChampionSplash: () => null,
}));
vi.mock("@/lib/audio/academy-radio", () => ({ setRadioSuppressedByMode: () => {} }));

import { createMemoryPulseRepository } from "@/lib/admin/pulse/memoryRepository";
import { prototypeSeed } from "@/lib/admin/pulse/prototypeSeed";

import { AdminPulseWorkspace } from "./AdminPulseWorkspace";

const NOW = new Date("2026-10-24T12:00:00Z");

function mount() {
  const repository = createMemoryPulseRepository(prototypeSeed(NOW), { now: () => NOW });
  render(
    <MemoryRouter>
      <AdminPulseWorkspace repository={repository} now={() => NOW} />
    </MemoryRouter>,
  );
  return repository;
}

/** Radix Tabs switch on mousedown. */
function openTab(name: string) {
  const tab = screen.getByTestId(`pulse-tab-${name}`);
  fireEvent.mouseDown(tab, { button: 0 });
  fireEvent.click(tab);
}

const liveCount = () => Number(screen.getByTestId("pulse-live-count").textContent);
const type = (testId: string, value: string) => fireEvent.change(screen.getByTestId(testId), { target: { value } });

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
  globalThis.IntersectionObserver ??= class {
    observe() {} unobserve() {} disconnect() {} takeRecords() { return []; }
  } as unknown as typeof IntersectionObserver;
});
afterAll(() => { MotionGlobalConfig.skipAnimations = false; });
afterEach(cleanup);

describe("AdminPulseWorkspace", () => {
  it("is labelled as a prototype and starts from the shipped editorial set", async () => {
    mount();
    expect(await screen.findByTestId("pulse-prototype-banner")).toBeTruthy();
    expect(liveCount()).toBe(4);
    expect(within(screen.getByTestId("pulse-row-pc-news-hover")).getByTestId("pulse-row-eligibility").textContent).toBe("Playing");
    expect(within(screen.getByTestId("pulse-row-pc-draft-announcement")).getByTestId("pulse-row-eligibility").textContent).toBe("Not live");
  });

  it("authors an announcement, shows publish blockers, publishes it, and it plays", async () => {
    mount();
    await screen.findByTestId("pulse-content-table");
    fireEvent.click(screen.getByTestId("pulse-new-announcement"));
    type("pulse-field-label", "Halloween quiz week");
    fireEvent.click(screen.getByTestId("pulse-editor-save"));
    await waitFor(() => expect(screen.getByTestId("pulse-action-publish")).toBeTruthy());
    // Blank scene: can't go live yet, and says why.
    expect((screen.getByTestId("pulse-action-publish") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/scene is incomplete/)).toBeTruthy();
    expect(screen.getByTestId("pulse-admin-presentation-incomplete")).toBeTruthy();

    type("pulse-field-headline", "Halloween quiz week");
    type("pulse-field-summary", "A week of spooky questions.");
    type("pulse-field-title", "Halloween quiz week is on");
    type("pulse-field-href", "https://evil.example");
    expect(screen.getByTestId("pulse-issue-href").textContent).toMatch(/stay on Mogzy/);
    type("pulse-field-href", "/quiz");
    fireEvent.click(screen.getByTestId("pulse-editor-save"));
    await waitFor(() => expect(screen.queryByTestId("pulse-editor-dirty")).toBeNull());
    expect(await screen.findByTestId("pulse-admin-presentation")).toBeTruthy();

    fireEvent.click(screen.getByTestId("pulse-action-publish"));
    await waitFor(() => expect(liveCount()).toBe(5));
    expect(screen.getByTestId("pulse-action-unpublish")).toBeTruthy();
  });

  it("a disabled category stops playing and leaves the cadence", async () => {
    mount();
    await screen.findByTestId("pulse-content-table");
    openTab("cadence");
    const news = await screen.findByTestId("pulse-category-enabled-news");
    fireEvent.click(news);
    await waitFor(() => expect(liveCount()).toBe(2));
    const cycle = screen.getByTestId("pulse-cycle-0");
    expect(cycle.textContent).not.toMatch(/News/);
  });

  it("cadence: promotion cap is validated and the resulting cycle comes from the shared scheduler", async () => {
    mount();
    await screen.findByTestId("pulse-content-table");
    openTab("cadence");
    await screen.findByTestId("pulse-cadence-max-promos");
    type("pulse-cadence-max-promos", "9");
    expect((screen.getByTestId("pulse-cadence-save") as HTMLButtonElement).disabled).toBe(true);
    type("pulse-cadence-max-promos", "1");
    expect((screen.getByTestId("pulse-cadence-save") as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByTestId("pulse-cadence-save"));
    expect(await screen.findByText("Cadence saved.")).toBeTruthy();
    expect(screen.getByTestId("pulse-cycle-0").children.length).toBeGreaterThan(0);
  });

  it("partners: a sponsor needs an allowlisted host to be approved, approval is FRESH, and the release gate still holds it", async () => {
    const repo = mount();
    await screen.findByTestId("pulse-content-table");
    openTab("partners");
    fireEvent.click(await screen.findByText(/Placeholder Co · Workflow rehearsal/));
    expect((await screen.findByTestId("pulse-partner-submit") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/not on the sponsor host allowlist/)).toBeTruthy();
    expect(screen.getByTestId("pulse-host-empty")).toBeTruthy();

    type("pulse-host-input", "example.com");
    expect(within(screen.getByTestId("pulse-host-add")).getByTestId("pulse-fresh-badge")).toBeTruthy();
    fireEvent.click(screen.getByTestId("pulse-host-add"));
    await screen.findByTestId("pulse-host-example.com");

    await waitFor(() => expect((screen.getByTestId("pulse-partner-submit") as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByTestId("pulse-partner-submit"));
    const approve = await screen.findByTestId("pulse-partner-approve");
    expect(within(approve).getByTestId("pulse-fresh-badge")).toBeTruthy();
    fireEvent.click(approve);
    await waitFor(() => expect(screen.getByTestId("pulse-partner-status").textContent).toBe("approved"));
    expect(screen.getByTestId("pulse-partner-eligibility").textContent).toMatch(/release gate/);
    expect(screen.getByTestId("pulse-partner-gate")).toBeTruthy();
    expect(screen.getByTestId("pulse-gate-sponsor").textContent).toBe("closed");
    expect(liveCount()).toBe(4);
    expect(repo.assuranceLog.map((e) => `${e.action}:${e.level}`)).toEqual(["host.add:fresh", "partner.submit:trusted", "partner.approve:fresh"]);
  });

  it("partners: forged fields can't be typed — LIVE is not a field, and a bad destination is refused", async () => {
    mount();
    await screen.findByTestId("pulse-content-table");
    openTab("partners");
    fireEvent.click(screen.getByTestId("pulse-new-creator"));
    expect(await screen.findByTestId("pulse-partner-editor")).toBeTruthy();
    expect(screen.queryByLabelText(/live/i)).toBeNull();
    fireEvent.click(screen.getByTestId("pulse-new-sponsor"));
    type("pulse-partner-id", "autumn");
    type("pulse-partner-hosts", "example.com");
    type("pulse-partner-destination", "http://example.com/x");
    expect(screen.getByTestId("pulse-issue-destinationUrl").textContent).toMatch(/https/);
    expect((screen.getByTestId("pulse-partner-save") as HTMLButtonElement).disabled).toBe(true);
  });

  it("emergency disable: needs a reason, no verification to disable; restore is marked fresh", async () => {
    const repo = mount();
    await screen.findByTestId("pulse-content-table");
    const disable = screen.getByTestId("pulse-emergency-disable") as HTMLButtonElement;
    expect(disable.disabled).toBe(true);
    fireEvent.change(screen.getByTestId("pulse-emergency-scope"), { target: { value: "managed" } });
    type("pulse-emergency-reason", "Wrong patch number in headline");
    fireEvent.click(disable);
    await waitFor(() => expect(screen.getByTestId("pulse-emergency").getAttribute("data-active")).toBe("true"));
    expect(liveCount()).toBe(0);
    expect(screen.getByTestId("pulse-emergency-status").textContent).toMatch(/Wrong patch number/);

    openTab("preview");
    expect(await screen.findByTestId("pulse-preview-fallback")).toBeTruthy();

    const restore = screen.getByTestId("pulse-emergency-restore");
    expect(within(restore).getByTestId("pulse-fresh-badge")).toBeTruthy();
    fireEvent.click(restore);
    await waitFor(() => expect(liveCount()).toBe(4));
    expect(repo.assuranceLog.map((e) => `${e.action}:${e.level}`)).toEqual(["kill.on:trusted", "kill.restore:fresh"]);
  });

  it("preview runs the production Pulse device on the public projection", async () => {
    mount();
    await screen.findByTestId("pulse-content-table");
    openTab("preview");
    const frame = await screen.findByTestId("pulse-admin-presentation");
    await waitFor(() => expect(within(frame).getByTestId("academy-pulse-scene")).toBeTruthy());
    expect(screen.getByTestId("pulse-preview-excluded").textContent).toMatch(/placeholder-sponsor/);
    fireEvent.click(screen.getByTestId("pulse-preview-size-short"));
    expect(screen.getByTestId("pulse-admin-presentation").getAttribute("data-size")).toBe("short");
  });
});
