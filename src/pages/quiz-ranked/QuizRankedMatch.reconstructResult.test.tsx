/**
 * GM1-R2 — THE OWNER'S LIVE "6–6" RECONSTRUCT RESULT, FROM REAL BACKEND BODIES.
 *
 * The owner's live result screen read: rows "+2 +2 +2" (viewer) and
 * "+2 +2 +0" (bot), "Modules Won 3/3", headline "DRAW 6–6". It looked like a
 * scoring bug. It was not: the backend settled 2+2+2 against 3+3+0 — the bot
 * finished first on its two correct builds and took the speed bonus each time.
 * The SCREEN contradicted itself because the bonus was a 6px dot and "Modules
 * won" counted the viewer's correct answers, not the modules they won.
 *
 * `reconstructDrawResultCapture.json` is that exact shape, played through the
 * real Ranked routes by `test_reconstruct_wire_contract.py::
 * test_the_live_draw_result_is_one_consistent_settlement` (written with
 * `RC_RESULT_CAPTURE_PATH`). Here it drives the REAL end screen, and every
 * number on it must come from the same settled result:
 *
 *   headline + scoreline   result row: outcome "draw", final_scores 6–6
 *   module rows            the settlements' base + bonus, legibly
 *   row totals             final_scores (the same two numbers)
 *   modules won            scoring.modules_won (the modules' own verdicts)
 */
import { render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/backend-auth", () => ({
  getBackendAuthHeaders: async () => ({ Authorization: "Bearer jwt" }),
}));

import { QuizRankedMatch } from "./QuizRankedMatch";
import capture from "@/lib/ranked-public/__fixtures__/reconstructDrawResultCapture.json";

/* eslint-disable @typescript-eslint/no-explicit-any */
const C = capture as Record<string, any>;
const VIEWER = C.meta.viewer_user_id as string;
const MID = C.result.match_id as string;
const SCORES = C.result.payload.scoring.final_scores as Record<string, number>;
const BOT = Object.keys(SCORES).find((id) => id !== VIEWER)!;
const T = C.result.server_time as string;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json" } });

let served: (body: any) => any = (b) => b;

beforeEach(() => {
  served = (b) => b;
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const u = String(url);
    if (u.endsWith("/resume")) return json(served(C.resume_final));
    const resolved = /\/rounds\/(\d+)\/resolved$/.exec(u);
    if (resolved) return C.resolved[resolved[1]] ? json(C.resolved[resolved[1]]) : json({}, 404);
    if (u.endsWith("/result")) return json(served(C.result));
    if (u.endsWith("/review")) return json(C.review);
    if (u.includes("/history")) {
      return json({ schema_version: "ranked_duel.match_history.v1", projection_type: "match_history",
        match_id: null, round_number: null, server_time: T, payload: { count: 0, entries: [] } });
    }
    if (u.includes("/presence")) return json({ status: "complete", match_id: MID, active: false });
    if (u.endsWith("/private")) return json(C.private_final);
    if (u.endsWith(`/matches/${MID}`)) return json(C.public_final);
    return json({});
  }) as unknown as typeof fetch);
});
afterEach(() => { vi.unstubAllGlobals(); });

async function endScreen() {
  render(<QuizRankedMatch matchId={MID} viewerUserId={VIEWER} />);
  await screen.findByTestId("ranked-match-over");
  await waitFor(() => {
    for (const side of ["viewer", "opponent"]) {
      expect(screen.getByTestId(`module-duel-${side}-3`).dataset.slotState).toBe("scored");
    }
  }, { timeout: 3000 });
}

const bubble = (side: "viewer" | "opponent", module: number) =>
  screen.getByTestId(`module-duel-bubble-${side}-${module}`);
const speed = (side: "viewer" | "opponent", module: number) =>
  within(bubble(side, module)).queryByTestId("module-bubble-speed")?.textContent ?? null;

describe("GM1-R2 — the live 6–6 Reconstruct result, one settled result everywhere", () => {
  it("the capture IS the owner's shape: base +2 +2 +2 vs +2 +2 +0, draw 6–6", () => {
    const rows = [1, 2, 3].map((n) => C.resolved[String(n)].payload.module_points);
    expect(rows.map((r: any) => r[VIEWER].base_points)).toEqual([2, 2, 2]);
    expect(rows.map((r: any) => r[BOT].base_points)).toEqual([2, 2, 0]);
    expect(rows.map((r: any) => r[BOT].speed_bonus_points)).toEqual([1, 1, 0]);
    expect(C.result.payload.outcome).toBe("draw");
    expect(SCORES).toEqual({ [VIEWER]: 6, [BOT]: 6 });
  });

  it("headline, scoreline, module rows, row totals and modules won all agree", async () => {
    await endScreen();
    // Headline + scoreline: the result row.
    expect(screen.getByTestId("match-over-frame").dataset.result).toBe("draw");
    expect(screen.getByTestId("match-over-heading")).toHaveTextContent(/draw/i);
    expect(screen.getByTestId("final-score-you")).toHaveTextContent("6");
    expect(screen.getByTestId("final-score-opponent")).toHaveTextContent("6");
    // Rows: the base number AND a legible bonus figure, from the settlements.
    expect([1, 2, 3].map((m) => bubble("viewer", m).dataset.basePoints)).toEqual(["2", "2", "2"]);
    expect([1, 2, 3].map((m) => bubble("opponent", m).dataset.basePoints)).toEqual(["2", "2", "0"]);
    expect([1, 2, 3].map((m) => speed("viewer", m))).toEqual([null, null, null]);
    expect([1, 2, 3].map((m) => speed("opponent", m))).toEqual(["+1", "+1", null]);
    // Each row ends with the SAME number the headline prints.
    expect(screen.getByTestId("module-duel-total-viewer")).toHaveTextContent("6");
    expect(screen.getByTestId("module-duel-total-opponent")).toHaveTextContent("6");
    // Modules won: the modules' own verdicts (loss, loss, win), not "3 correct".
    // The stat needs the review read, which lands after the frame.
    const frame = screen.getByTestId("ranked-match-over");
    await waitFor(() => expect(frame.textContent).toMatch(/Modules won\s*1 \/ 3/), { timeout: 5000 });
    expect(frame.textContent).not.toMatch(/Modules won\s*3 \/ 3/);
  });

  it("the row figures visibly reconcile with the totals (base + bonus per module)", async () => {
    await endScreen();
    const rowSum = (side: "viewer" | "opponent") => [1, 2, 3].reduce((n, m) =>
      n + Number(bubble(side, m).dataset.basePoints) + Number((speed(side, m) ?? "+0").slice(1)), 0);
    expect(rowSum("viewer")).toBe(SCORES[VIEWER]);
    expect(rowSum("opponent")).toBe(SCORES[BOT]);
  });

  it("a backend that states no modules_won prints 'Modules correct', never 'Modules won'", async () => {
    served = (b) => {
      const copy = JSON.parse(JSON.stringify(b));
      const scoring = copy.payload?.scoring ?? copy.payload?.result?.payload?.scoring;
      if (scoring) delete scoring.modules_won;
      return copy;
    };
    await endScreen();
    const frame = screen.getByTestId("ranked-match-over");
    await waitFor(() => expect(frame.textContent).toMatch(/Modules correct\s*3 \/ 3/), { timeout: 5000 });
    expect(frame.textContent).not.toMatch(/Modules won/);
  });
});
