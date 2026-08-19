/**
 * R1 — the conditional legacy-progression hide, and the compatibility that
 * must survive it.
 *
 * The governing rule under test: the ONLY signal that hides ability /
 * progression UI is the match's own `progression_enabled`. Never the role,
 * never the class, never the XP, never the feature flag, and never "is a
 * choice pending right now". A legacy match — including one a player is
 * reconnecting into while it waits on a Level 2 choice — keeps every control
 * it has always had.
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/backend-auth", () => ({
  getBackendAuthHeaders: async () => ({ Authorization: "Bearer jwt" }),
}));

import { QuizRankedMatch } from "./QuizRankedMatch";
import { privatePlayerV2, publicRoundV2 } from "@/lib/ranked-public/fixtures";

interface Backend {
  /** null = the field is ABSENT, i.e. a pre-R1 backend. */
  progressionEnabled: boolean | null;
  progressionPending: string[];
  roles: Record<string, string | null>;
  progressionChoices: unknown[];
}
let backend: Backend;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { "Content-Type": "application/json" },
  });

function applyR1(payload: Record<string, unknown>) {
  if (backend.progressionEnabled !== null) {
    payload.progression_enabled = backend.progressionEnabled;
  }
  payload.progression_pending_players = backend.progressionPending;
  for (const p of payload.players as Record<string, unknown>[]) {
    const role = backend.roles[p.player_id as string];
    if (role !== undefined) p.role = role;
  }
  return payload;
}

const publicBody = () => {
  const body = publicRoundV2();
  applyR1(body.payload as Record<string, unknown>);
  return body;
};
const privateBody = () => {
  const body = privatePlayerV2("userA");
  applyR1(body.payload as Record<string, unknown>);
  return body;
};

beforeEach(() => {
  backend = {
    progressionEnabled: false,
    progressionPending: [],
    roles: { userA: "jungle", userB: "support" },
    progressionChoices: [],
  };
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit = {}) => {
    const u = String(url);
    if (u.endsWith("/resume")) {
      const payload: Record<string, unknown> = {
        match_status: "active", match_over: false,
        public: publicBody(), private: privateBody(),
        progression_pending_players: backend.progressionPending,
        latest_resolved_round: null, result: null,
      };
      if (backend.progressionEnabled !== null) {
        payload.progression_enabled = backend.progressionEnabled;
      }
      return json({
        schema_version: "ranked_duel.resume.v1", projection_type: "resume",
        match_id: "m1", round_number: 1, server_time: "2026-07-18T12:00:00+00:00",
        payload,
      });
    }
    if (u.endsWith("/private")) return json(privateBody());
    if (u.includes("/presence")) {
      return json({ status: "active", match_id: "m1", active: true });
    }
    if (u.includes("/level-two-choice")) {
      backend.progressionChoices.push(JSON.parse(init.body as string));
      backend.progressionPending = [];
      return json({ status: "confirmed" });
    }
    if (/\/matches\/m1$/.test(u) && (init.method ?? "GET") === "GET") {
      return json(publicBody());
    }
    return json({}, 200);
  }) as unknown as typeof fetch);
});
afterEach(() => { vi.unstubAllGlobals(); });

async function mount() {
  const view = render(<QuizRankedMatch matchId="m1" viewerUserId="userA" />);
  await screen.findByTestId("ranked-match");
  return view;
}

describe("R1 match (progression_enabled: false) hides the legacy layer", () => {
  it("renders no ability tray, no hotkeys, no charges, no No-Ability control", async () => {
    await mount();
    expect(screen.queryByTestId("ranked-abilities")).toBeNull();
    expect(screen.queryByTestId("ability-tray")).toBeNull();
    expect(screen.queryByTestId("ability-none")).toBeNull();
    expect(document.body.textContent).not.toMatch(/fortify|brace|barrier/i);
    expect(document.body.textContent).not.toMatch(/charge/i);
    expect(document.body.textContent).not.toMatch(/no ability|clear ability/i);
  });

  it("renders no Level 2 choice overlay even if the server ever said one was due", async () => {
    // Belt and braces: the backend cannot put an R1 player in
    // `progression_pending_players` (a single level threshold makes that
    // structurally impossible), so if it somehow did, the frozen config still
    // wins and no legacy panel appears.
    backend.progressionPending = ["userA"];
    await mount();
    expect(screen.queryByTestId("ranked-progression")).toBeNull();
    expect(screen.queryByTestId("level-up-panel")).toBeNull();
    expect(document.body.textContent).not.toMatch(/level 2|level 3|level up/i);
  });

  it("leaves no reserved empty ability track behind", async () => {
    await mount();
    const match = screen.getByTestId("ranked-match");
    // The tray section is genuinely ABSENT, not present-and-empty: there is
    // no element reserving its height.
    expect(match.querySelector('[data-testid="ranked-abilities"]')).toBeNull();
    // The status line — the one thing the row still carries — is intact, so
    // the HUD keeps its own reserved-height contract.
    expect(screen.getByTestId("submission-status")).toBeTruthy();
  });

  it("still renders the question, the timer and the combatants", async () => {
    await mount();
    expect(screen.getByTestId("ranked-question")).toBeTruthy();
    expect(screen.getByTestId("combatant-userA")).toBeTruthy();
    expect(screen.getByTestId("combatant-userB")).toBeTruthy();
  });

  it("labels the combatants by ROLE, and never by a role mapped from a class", async () => {
    await mount();
    const you = screen.getByTestId("combatant-userA");
    expect(you.textContent).toContain("Jungle");
    expect(you.textContent).not.toMatch(/\bTank\b/);
    expect(screen.getByTestId("combatant-userB").textContent).toContain("Support");
  });
});

describe("legacy match (progression_enabled: true) keeps everything", () => {
  beforeEach(() => { backend.progressionEnabled = true; backend.roles = {}; });

  it("renders the ability tray", async () => {
    await mount();
    expect(await screen.findByTestId("ranked-abilities")).toBeTruthy();
    expect(document.body.textContent).toMatch(/fortify/i);
  });

  it("RECONNECT into a match waiting on a Level 2 choice still shows the choice", async () => {
    // The wedge this whole gate exists to prevent: a player who reloads into
    // an old match that is blocked on a Level 2 choice must be able to make it.
    backend.progressionPending = ["userA"];
    await mount();
    const panel = await screen.findByTestId("ranked-progression");
    expect(panel).toBeTruthy();
    expect(panel.textContent).toMatch(/brace|barrier/i);
  });

  it("the Level 2 choice still applies on click", async () => {
    backend.progressionPending = ["userA"];
    await mount();
    await screen.findByTestId("ranked-progression");
    const option = document.querySelector<HTMLElement>(
      '[data-testid="level-option-tank.brace"], [data-testid*="brace"]');
    expect(option).not.toBeNull();
    fireEvent.click(option!);
    await waitFor(() => expect(backend.progressionChoices).toHaveLength(1));
  });

  it("labels the combatants by CLASS when the match froze no role", async () => {
    await mount();
    expect(screen.getByTestId("combatant-userA").textContent).toMatch(/tank/i);
  });
});

describe("version skew — new frontend, old backend", () => {
  it("an ABSENT progression_enabled keeps the legacy UI (fails safe)", async () => {
    backend.progressionEnabled = null;   // field never sent
    backend.roles = {};
    await mount();
    expect(await screen.findByTestId("ranked-abilities")).toBeTruthy();
  });

  it("an absent field still allows a pending Level 2 choice to render", async () => {
    backend.progressionEnabled = null;
    backend.roles = {};
    backend.progressionPending = ["userA"];
    await mount();
    expect(await screen.findByTestId("ranked-progression")).toBeTruthy();
  });
});
