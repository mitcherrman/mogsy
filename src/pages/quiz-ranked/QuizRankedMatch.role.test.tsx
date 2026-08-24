/**
 * RG1 — THE LEAGUE ROLE, from the wire into the duelist column.
 *
 * The reported defect was that a player who entered Ranked as TOP was shown as
 * ADC inside the match. Tracing it end to end found the persisted chain
 * correct at every layer, but it also found that nothing anywhere asserted the
 * whole chain for more than ONE role: the backend's own coverage pinned the
 * service layer, `CombatantPanel.phase11` pinned the panel for Jungle, and no
 * test in either repo followed all five canonical roles from a public-round
 * payload into the label the arena actually prints.
 *
 * That is what this file is. Its backend twin is `test_rg1_role_end_to_end.py`,
 * which drives the same five roles from `PUT /api/ranked/role` through a
 * `match_with_bot` join into `players[].role`. Between them the two cover the
 * invariant the brief states:
 *
 *   the role a player enters Ranked as is the role that player IS for the
 *   whole match, whether the opponent is a human or a bot.
 *
 * The bot's own `role: null` is covered here too, and covered as a POSITIVE:
 * a bot has no League identity, none is invented for it, and — the part that
 * actually broke once — its neutrality must not reach across into the human's
 * column.
 */
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/backend-auth", () => ({
  getBackendAuthHeaders: async () => ({ Authorization: "Bearer jwt" }),
}));

import { QuizRankedMatch } from "./QuizRankedMatch";
import { privatePlayerV2, publicRoundV2 } from "@/lib/ranked-public/fixtures";
import { RANKED_ROLES, RANKED_ROLE_LABELS } from "@/lib/ranked-public/roles";

let roles: Record<string, string | null>;
let resumes: number;

const json = (body: unknown) => new Response(JSON.stringify(body), {
  status: 200, headers: { "Content-Type": "application/json" },
});

/** An R1 match: no progression layer, and a role frozen per participant. */
function apply(payload: Record<string, unknown>) {
  payload.progression_enabled = false;
  for (const p of payload.players as Record<string, unknown>[]) {
    p.role = roles[p.player_id as string] ?? null;
  }
  return payload;
}
const publicBody = () => {
  const b = publicRoundV2();
  apply(b.payload as Record<string, unknown>);
  return b;
};
const privateBody = () => {
  const b = privatePlayerV2("userA");
  apply(b.payload as Record<string, unknown>);
  return b;
};

beforeEach(() => {
  roles = { userA: "top", userB: null };
  resumes = 0;
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const u = String(url);
    if (u.endsWith("/resume")) {
      resumes += 1;
      return json({
        schema_version: "ranked_duel.resume.v1", projection_type: "resume",
        match_id: "m1", round_number: 1, server_time: "2026-07-18T12:00:00+00:00",
        payload: {
          match_status: "active", match_over: false, progression_enabled: false,
          public: publicBody(), private: privateBody(),
          progression_pending_players: [], latest_resolved_round: null, result: null,
        },
      });
    }
    if (u.endsWith("/private")) return json(privateBody());
    if (u.includes("/presence")) return json({ status: "active", match_id: "m1", active: true });
    if (/\/matches\/m1$/.test(u)) return json(publicBody());
    return json({});
  }) as unknown as typeof fetch);
});
afterEach(() => { vi.unstubAllGlobals(); });

async function mount() {
  const view = render(<QuizRankedMatch matchId="m1" viewerUserId="userA" />);
  await screen.findByTestId("ranked-match");
  return view;
}

describe("the role a player entered as is the role their column shows", () => {
  it.each(RANKED_ROLES)("renders %s, beside a null-role bot", async (role) => {
    roles = { userA: role, userB: null };
    await mount();
    await waitFor(() =>
      expect(screen.getByTestId("identity-tag-userA"))
        .toHaveTextContent(RANKED_ROLE_LABELS[role]));
    // The crest reads the ROLE ID, not the label, so this catches a label that
    // is right beside art that is wrong.
    const crests = screen.getAllByTestId("role-crest");
    expect(crests[0].getAttribute("data-role")).toBe(role);
  });

  it("never lets the bot's neutrality reach the human's column", async () => {
    roles = { userA: "top", userB: null };
    await mount();
    await waitFor(() =>
      expect(screen.getByTestId("identity-tag-userA")).toHaveTextContent("Top"));
    // The opponent is neutral — never a guessed role, and never the combat
    // class printed in the role slot (the TANK defect).
    expect(screen.getByTestId("identity-tag-userB")).toHaveTextContent("Duelist");
    expect(screen.getByTestId("identity-tag-userB")).not.toHaveTextContent(/tank|mage|marksman/i);
  });

  it("shows no role rather than a guessed one when the match has none", async () => {
    roles = { userA: null, userB: null };
    await mount();
    await waitFor(() =>
      expect(screen.getByTestId("identity-tag-userA")).toHaveTextContent("Duelist"));
    // Specifically NOT the head of the canonical order, which is what a
    // silent default would produce.
    expect(screen.getByTestId("identity-tag-userA")).not.toHaveTextContent("Top");
  });

  it("survives a reload — the resume payload carries the same role", async () => {
    roles = { userA: "adc", userB: null };
    const first = await mount();
    await waitFor(() =>
      expect(screen.getByTestId("identity-tag-userA")).toHaveTextContent("ADC"));
    first.unmount();
    await mount();
    await waitFor(() =>
      expect(screen.getByTestId("identity-tag-userA")).toHaveTextContent("ADC"));
    expect(resumes).toBeGreaterThanOrEqual(2);
  });

  it("is read per PARTICIPANT, so two real roles never cross over", async () => {
    // The PvP shape. If identity were keyed by list position rather than by
    // player id, this is the case that would swap them.
    roles = { userA: "support", userB: "mid" };
    await mount();
    await waitFor(() =>
      expect(screen.getByTestId("identity-tag-userA")).toHaveTextContent("Support"));
    expect(screen.getByTestId("identity-tag-userB")).toHaveTextContent("Mid");
  });
});
