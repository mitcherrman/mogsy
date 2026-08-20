/**
 * QUIZ1 Phase 11 — the ARENA as three columns.
 *
 * R1 already removed the ability hotbar; the owner then reported that the
 * arena still showed "Lv 1", XP bars and "0 xp · Level 1 (max)" on a match
 * that has no progression system. These tests pin the whole side-column
 * contract at the arena level, where the props are actually wired, rather
 * than only at the component level.
 *
 * The fetch harness is deliberately the same one
 * `QuizRankedMatch.progression.test.tsx` uses — one R1 backend fake, not two
 * that could disagree about what a no-progression match looks like.
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


describe("Phase 11 — a no-progression match shows no progression telemetry", () => {
  it("shows no level badge, no XP meter and no max-level wording anywhere", async () => {
    await mount();
    expect(screen.queryByTestId("xp-userA")).toBeNull();
    expect(screen.queryByTestId("xp-userB")).toBeNull();
    // The exact strings the owner saw on the live arena.
    expect(document.body.textContent).not.toMatch(/\bLv\s*\d/);
    expect(document.body.textContent).not.toMatch(/\bxp\b/i);
    expect(document.body.textContent).not.toMatch(/\(max\)/);
  });

  it("leaves no empty placeholder where the meters were", async () => {
    await mount();
    for (const id of ["combatant-userA", "combatant-userB"]) {
      const panel = screen.getByTestId(id);
      expect(panel).toHaveAttribute("data-progression", "false");
      expect(panel.querySelector('[data-testid^="xp-"]')).toBeNull();
    }
  });
});

describe("Phase 11 — mirrored role columns", () => {
  it("gives both duelists a role crest and a role label, not a class label", async () => {
    await mount();
    const player = screen.getByTestId("combatant-userA");
    const opponent = screen.getByTestId("combatant-userB");
    expect(player.querySelector('[data-testid="role-crest"]'))
      .toHaveAttribute("data-role", "jungle");
    expect(opponent.querySelector('[data-testid="role-crest"]'))
      .toHaveAttribute("data-role", "support");
    expect(screen.getByTestId("identity-tag-userA")).toHaveTextContent("Jungle");
    expect(screen.getByTestId("identity-tag-userB")).toHaveTextContent("Support");
    expect(document.body.textContent).not.toMatch(/\bTANK\b|\bMAGE\b|\bMARKSMAN\b/);
  });

  it("mirrors the two columns: identical structure, both with a round ledger", async () => {
    await mount();
    expect(screen.getByTestId("combat-ledger-userA")).toBeInTheDocument();
    expect(screen.getByTestId("combat-ledger-userB")).toBeInTheDocument();
    expect(screen.getByTestId("hp-userA")).toBeInTheDocument();
    expect(screen.getByTestId("hp-userB")).toBeInTheDocument();
  });

  it("gives a BOT opponent the neutral role identity, never its combat class", async () => {
    // THE DEFECT THE OWNER SAW. A bot match: the human queued as a role, the
    // backend refuses to invent one for the bot (`role: null`, and never
    // derived from a class), and the arena printed the bot's `class_id` in the
    // role slot — "TANK", which is not a League role.
    backend.roles = { userA: "jungle", userB: null };
    await mount();
    const player = screen.getByTestId("combatant-userA");
    const bot = screen.getByTestId("combatant-userB");
    expect(player.querySelector('[data-testid="role-crest"]'))
      .toHaveAttribute("data-role", "jungle");
    // The bot keeps a role SLOT of the same kind — it is simply neutral.
    expect(bot.querySelector('[data-testid="role-crest"]'))
      .toHaveAttribute("data-role", "none");
    expect(bot.querySelector('[data-testid="role-crest-neutral"]')).toBeTruthy();
    expect(bot.querySelector('[data-testid="class-portrait"]')).toBeNull();
    expect(screen.getByTestId("identity-tag-userA")).toHaveTextContent("Jungle");
    expect(screen.getByTestId("identity-tag-userB")).toHaveTextContent("Duelist");
    // No combat class reaches the screen, in any casing.
    expect(document.body.textContent).not.toMatch(/tank|mage|marksman/i);
  });

  it("keeps the neutral identity when NEITHER seat has a role on an R1 match", async () => {
    // A role match is a role match whether or not anyone chose. Reading this
    // as pre-R1 and dressing both columns in combat classes would reintroduce
    // the same wrong vocabulary from the other direction.
    backend.roles = { userA: null, userB: null };
    await mount();
    for (const id of ["combatant-userA", "combatant-userB"]) {
      const panel = screen.getByTestId(id);
      expect(panel.querySelector('[data-testid="role-crest"]'))
        .toHaveAttribute("data-role", "none");
      expect(panel.querySelector('[data-testid="class-portrait"]')).toBeNull();
    }
    expect(document.body.textContent).not.toMatch(/tank|mage|marksman/i);
  });

  it("falls back to the class identity ONLY on a genuine pre-R1 match", async () => {
    // No roles on the wire AND no `progression_enabled` — i.e. a backend that
    // predates R1, whose matches have no role layer at all and whose only
    // identity IS the combat class. Deliberately unchanged.
    backend.progressionEnabled = null;
    backend.roles = {};
    await mount();
    expect(screen.queryByTestId("role-crest")).toBeNull();
    expect(screen.getByTestId("combatant-userA")
      .querySelector('[data-testid="class-portrait"]')).toBeTruthy();
  });
});

describe("Phase 11 — three parallel columns", () => {
  it("sizes the arena as proportional LEFT | MIDDLE | RIGHT tracks", async () => {
    await mount();
    const grid = screen.getByTestId("ranked-focus-column").parentElement!;
    // Proportional, not fixed rem rails: the sides grow with the stage.
    expect(grid.className).toContain("23fr");
    expect(grid.className).toContain("54fr");
    // One shared vertical extent rather than rails floating at their own
    // height beside a much taller centre.
    expect(grid.className).toContain("lg:items-stretch");
    expect(grid.className).not.toContain("lg:items-start");
  });
});
