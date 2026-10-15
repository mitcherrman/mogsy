/**
 * RC8 — the Role Challenge picker: server-authoritative gating, Free/Premium
 * wording, active-run resume, and the idempotent start key.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  RoleChallengeCatalog, RoleChallengeRun, RoleChallengeStatus,
} from "@/lib/role-challenge/contracts";

const api = vi.hoisted(() => ({
  catalog: vi.fn(),
  status: vi.fn(),
  start: vi.fn(),
}));
const premium = vi.hoisted(() => ({ value: { isPro: false, proStatus: "free" as "free" | "pro" | "unknown" } }));

vi.mock("@/lib/role-challenge/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/role-challenge/client")>(
    "@/lib/role-challenge/client");
  return {
    ...actual,
    getRoleChallengeCatalog: api.catalog,
    getRoleChallengeStatus: api.status,
    startRoleChallenge: api.start,
  };
});
vi.mock("@/hooks/usePremiumSession", () => ({ usePremiumSession: () => premium.value }));

import RoleChallengePicker from "./RoleChallengePicker";
import { RoleChallengeApiError } from "@/lib/role-challenge/client";

const ROLES = ["top", "jungle", "mid", "adc", "support"] as const;
const NOW = () => new Date("2026-10-14T18:48:00Z");

function catalog(): RoleChallengeCatalog {
  const champs = (role: string) => [
    { id: "aatrox", name: "Aatrox", riotId: "Aatrox", conventionalRoles: ["top"] as never,
      conventional: role === "top" },
    { id: "monkeyking", name: "Wukong", riotId: "MonkeyKing", conventionalRoles: ["top", "jungle"] as never,
      conventional: role === "top" || role === "jungle" },
  ];
  return {
    answerCount: 12, formatId: "role_challenge_v1", formatVersion: 1, composerVersion: "v2",
    roles: ROLES.map((role) => ({ role, label: role, champions: champs(role) })),
  };
}
function run(over: Partial<RoleChallengeRun> = {}): RoleChallengeRun {
  return {
    runId: "rcr_1", matchId: "match-1", challengeDate: "2026-10-14", slotKind: "daily",
    role: "mid", champion: "aatrox", championName: "Aatrox", answerCount: 12,
    composerVersion: "v2", createdAt: "2026-10-14T10:00:00Z", matchStatus: "active", outline: [],
    ...over,
  };
}
function status(over: Partial<RoleChallengeStatus> = {}): RoleChallengeStatus {
  return {
    serverNow: "2026-10-14T18:48:00Z", challengeDate: "2026-10-14",
    resetsAt: "2026-10-15T00:00:00+00:00", answerCount: 12,
    dailySlot: { used: false, run: null }, activeRun: null, otherActiveMatch: false,
    nextStart: { slotKind: "daily", allowed: true, reason: null },
    ...over,
  };
}

function renderPicker(props: Partial<React.ComponentProps<typeof RoleChallengePicker>> = {}) {
  const onEnterMatch = vi.fn();
  const onRequireAccount = vi.fn();
  render(
    <MemoryRouter>
      <RoleChallengePicker enabled hasAccount onEnterMatch={onEnterMatch}
        onRequireAccount={onRequireAccount} now={NOW} {...props} />
    </MemoryRouter>,
  );
  return { onEnterMatch, onRequireAccount };
}

async function pickAatroxMid() {
  await screen.findAllByTestId("rc-champion-option");
  fireEvent.click(screen.getByRole("radio", { name: "Mid" }));
  fireEvent.click(screen.getByRole("radio", { name: /Aatrox/ }));
}

beforeEach(() => {
  api.catalog.mockReset().mockResolvedValue(catalog());
  api.status.mockReset().mockResolvedValue(status());
  api.start.mockReset();
  premium.value = { isPro: false, proStatus: "free" };
});
afterEach(cleanup);

describe("RC8 Role Challenge picker", () => {
  it("offers every champion in every role without off-meta labels, with Data Dragon portraits", async () => {
    renderPicker();
    await pickAatroxMid();
    expect(screen.getByRole("radio", { name: "Aatrox" })
      .getAttribute("aria-checked")).toBe("true");
    const srcs = screen.getAllByTestId("rc-champion-portrait").map((img) => img.getAttribute("src"));
    expect(srcs.some((s) => s?.endsWith("assets/champions/MonkeyKing/icon.png"))).toBe(true);
    expect(srcs.some((s) => s?.includes("/monkeyking/"))).toBe(false);
    expect(screen.getByTestId("rc-selection").textContent).toContain("Aatrox · Mid");
    expect(screen.getByTestId("role-challenge-picker").textContent).not.toMatch(/off.meta/i);
  });

  it("starts with one key and enters the server's match", async () => {
    api.start.mockResolvedValue({ matchId: "match-9" });
    const { onEnterMatch } = renderPicker();
    await pickAatroxMid();
    fireEvent.click(screen.getByTestId("rc-play"));
    await waitFor(() => expect(onEnterMatch).toHaveBeenCalledWith("match-9"));
    expect(api.start).toHaveBeenCalledWith("mid", "aatrox", expect.any(String));
  });

  it("retries a lost start with the SAME key, and a new pick mints a new one", async () => {
    api.start
      .mockRejectedValueOnce(new RoleChallengeApiError("network", 0, "lost"))
      .mockResolvedValueOnce({ matchId: "match-1" });
    const { onEnterMatch } = renderPicker();
    await pickAatroxMid();
    fireEvent.click(screen.getByTestId("rc-play"));
    await screen.findByText(/retry safely/i);
    fireEvent.click(screen.getByTestId("rc-play"));
    await waitFor(() => expect(onEnterMatch).toHaveBeenCalledWith("match-1"));
    const [first, second] = api.start.mock.calls.map((call) => call[2]);
    expect(second).toBe(first);

    api.start.mockRejectedValueOnce(new RoleChallengeApiError("network", 0, "lost"))
      .mockResolvedValueOnce({ matchId: "match-2" });
    fireEvent.click(screen.getByTestId("rc-play"));
    await screen.findByText(/retry safely/i);
    fireEvent.click(screen.getByRole("radio", { name: /Wukong/ }));
    fireEvent.click(screen.getByTestId("rc-play"));
    await waitFor(() => expect(onEnterMatch).toHaveBeenCalledWith("match-2"));
    const keys = api.start.mock.calls.map((call) => call[2]);
    expect(keys[3]).not.toBe(keys[2]);
  });

  it("resumes the active run instead of starting another", async () => {
    api.status.mockResolvedValue(status({
      activeRun: run(), dailySlot: { used: true, run: run() },
      nextStart: { slotKind: null, allowed: false, reason: "active_match" },
    }));
    const { onEnterMatch } = renderPicker();
    const card = await screen.findByTestId("role-active-run");
    expect(card.textContent).toContain("Aatrox · Mid");
    fireEvent.click(screen.getByRole("button", { name: "Resume" }));
    expect(onEnterMatch).toHaveBeenCalledWith("match-1");
    await pickAatroxMid();
    expect((screen.getByTestId("rc-play") as HTMLButtonElement).disabled).toBe(true);
  });

  it("Free with today's slot used: refused, shows reset time and the Premium offer", async () => {
    api.status.mockResolvedValue(status({
      dailySlot: { used: true, run: run({ matchStatus: "complete" }) },
      nextStart: { slotKind: "premium", allowed: false, reason: "daily_limit_reached" },
    }));
    renderPicker();
    await pickAatroxMid();
    expect((await screen.findByTestId("rc-eligibility")).textContent).toContain("Resets in 5h 12m");
    expect(screen.getByRole("link", { name: /Go Premium/ }).getAttribute("href")).toBe("/lol/premium");
    expect(screen.getByTestId("role-today-run").textContent).toContain("complete");
    expect((screen.getByTestId("rc-play") as HTMLButtonElement).disabled).toBe(true);
  });

  it("Premium beyond the free slot may start again", async () => {
    premium.value = { isPro: true, proStatus: "pro" };
    api.status.mockResolvedValue(status({
      dailySlot: { used: true, run: run({ matchStatus: "complete" }) },
      nextStart: { slotKind: "premium", allowed: true, reason: null },
    }));
    renderPicker();
    await pickAatroxMid();
    expect(screen.getByTestId("rc-plan-chip").textContent).toContain("Unlimited");
    expect((screen.getByTestId("rc-play") as HTMLButtonElement).disabled).toBe(false);
  });

  it("guests can browse but Play asks for an account and never calls status/start", async () => {
    const { onRequireAccount } = renderPicker({ hasAccount: false });
    await pickAatroxMid();
    fireEvent.click(screen.getByRole("button", { name: "Sign in to play" }));
    expect(onRequireAccount).toHaveBeenCalledTimes(1);
    expect(api.status).not.toHaveBeenCalled();
    expect(api.start).not.toHaveBeenCalled();
  });

  it("a catalog failure shows Retry and recovers", async () => {
    api.catalog.mockRejectedValueOnce(new Error("down"));
    renderPicker();
    await screen.findByTestId("rc-catalog-error");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Retry" })); });
    expect(await screen.findAllByTestId("rc-champion-option")).toHaveLength(2);
  });

  it("a daily-limit refusal at start re-reads status", async () => {
    api.start.mockRejectedValue(new RoleChallengeApiError(
      "backend", 403, "used", "ROLE_CHALLENGE_DAILY_LIMIT_REACHED"));
    renderPicker();
    await pickAatroxMid();
    fireEvent.click(screen.getByTestId("rc-play"));
    await screen.findByText(/already used/i);
    expect(api.status).toHaveBeenCalledTimes(2);
  });
});
