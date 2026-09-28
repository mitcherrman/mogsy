import { expect, test, type Page, type Request } from "@playwright/test";
import { privatePlayerV2, publicRoundV2 } from "../../src/lib/ranked-public/fixtures";
import { rankedTerminalResponse } from "../../src/test/fixtures/rankedTerminal";

type RankedFixture = {
  terminal: boolean;
  locked: boolean;
  activeRound: number;
  resolved: Record<number, unknown>;
  requests: Request[];
  revealRound: () => void;
};

function resolvedPayload(round: number) {
  const now = new Date().toISOString();
  const player = (id: string) => ({
    player_id: id, class_id: id === "userA" ? "tank" : "mage", outcome: "correct",
    submitted_at: now, answered_first: id === "userA", timed_out: false,
    selected_ability_id: null,
    damage: { base_damage_dealt: 10, outgoing_bonus: 0, final_damage_dealt: 10,
      shield_absorbed: 0, incoming_reduction: 0, final_damage_received: 10 },
    hp_before: 170, hp_after: 160, reached_zero_hp: false,
    xp_gained: 10, total_xp_after: 10, level_before: 1, level_after: 1,
    level_up_events: [], charge_consumed: false, consumed_ability_id: null,
    remaining_charges: { "tank.fortify": 3 },
    carryover: { effects_gained: [], effects_consumed: [], consecutive_correct: 1 },
    combat_lab_unlock_delta_seconds: 0,
  });
  return { match_id: "m1", round_number: round, question_id: `q${round}`,
    end_reason: "both_answered", started_at: now, original_deadline: now,
    final_deadline: now, pressure_applied: false,
    players: [player("userA"), player("userB")], next_round_duration_seconds: 30,
    next_round_duration_delta: 0, match_over: false, winner_id: null,
    completion_reason: null };
}

async function prepareRanked(page: Page, options: { locked?: boolean; mobile?: boolean } = {}) {
  if (options.mobile) await page.setViewportSize({ width: 390, height: 844 });
  const fixture: RankedFixture = {
    terminal: false, locked: options.locked ?? false, activeRound: 1, resolved: {}, requests: [],
    revealRound: () => {
      fixture.resolved[fixture.activeRound] = resolvedPayload(fixture.activeRound);
      fixture.activeRound += 1;
      fixture.locked = false;
    },
  };
  page.on("request", (request) => fixture.requests.push(request));
  await page.addInitScript(() => {
    localStorage.setItem("lol:ranked-rules:seen_version", "1");
    sessionStorage.setItem("quiz:gate:hub_visited", "1");
    localStorage.setItem("mogsy_e2e_identity", JSON.stringify({ token: "nav1-e4-token",
      user: { id: "userA", email: "nav1-e4@example.test", is_anonymous: false }, admin: false }));
    if (location.pathname === "/quiz/ranked" && !history.state?.usr) {
      history.replaceState({ idx: 0, key: "e4-origin", usr: null }, "", "/quiz");
      history.pushState({ idx: 1, key: "e4-ranked", usr: { matchId: "m1" } }, "", "/quiz/ranked");
    }
  });
  await page.route("**/*", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (!["fetch", "xhr"].includes(req.resourceType())) return route.continue();
    if (url.hostname === "127.0.0.1" && !url.pathname.startsWith("/api/")) return route.continue();
    if (url.pathname.startsWith("/api/ranked/matches/m1")) {
      if (fixture.terminal) return route.fulfill({ json: rankedTerminalResponse(url.pathname) });
      if (url.pathname.endsWith("/presence")) return route.fulfill({ json: { status: "active", match_id: "m1", active: true } });
      const resolvedMatch = /\/rounds\/(\d+)\/resolved$/.exec(url.pathname);
      if (resolvedMatch) {
        const round = Number(resolvedMatch[1]);
        const payload = fixture.resolved[round];
        return payload ? route.fulfill({ json: { schema_version: "ranked_duel.resolved_round.v2",
          projection_type: "resolved_round", match_id: "m1", round_number: round,
          server_time: new Date().toISOString(), payload } })
          : route.fulfill({ status: 404, json: { detail: "not ready" } });
      }
      const publicBody = publicRoundV2(false);
      const privateBody = privatePlayerV2("userA");
      const now = new Date();
      for (const body of [publicBody, privateBody]) {
        body.server_time = now.toISOString();
        body.round_number = fixture.activeRound;
        body.payload.completed_rounds = fixture.activeRound - 1;
        if (body.payload.active_round) {
          body.payload.active_round.round_number = fixture.activeRound;
          body.payload.active_round.started_at = now.toISOString();
          body.payload.active_round.active_deadline = new Date(now.getTime() + 60_000).toISOString();
        }
      }
      if (publicBody.payload.question) {
        publicBody.payload.question.question_id = `q${fixture.activeRound}`;
        publicBody.payload.question.prompt = `Round ${fixture.activeRound} — which item grants Immolate?`;
      }
      const body = url.pathname.endsWith("/private") ? privateBody : publicBody;
      if (fixture.locked) {
        const players = body.payload.players as Array<{ player_id: string; has_submitted: boolean }>;
        const own = players.find((player) => player.player_id === "userA");
        if (own) own.has_submitted = true;
      }
      if (url.pathname.endsWith("/resume")) {
        const latestRound = fixture.activeRound - 1;
        return route.fulfill({ json: { schema_version: "ranked_duel.resume.v1", projection_type: "resume",
          match_id: "m1", round_number: fixture.activeRound, server_time: now.toISOString(),
          payload: { match_status: "active", match_over: false, public: publicBody,
            private: privateBody, latest_resolved_round: latestRound > 0 ? {
              schema_version: "ranked_duel.resolved_round.v2", projection_type: "resolved_round",
              match_id: "m1", round_number: latestRound, server_time: now.toISOString(),
              payload: fixture.resolved[latestRound],
            } : null, result: null } } });
      }
      return route.fulfill({ json: body });
    }
    if (url.pathname.includes("/profiles")) return route.fulfill({ json: { id: "nav1-profile",
      user_id: "userA", display_name: "NAV1 Tester", is_anonymous: false, is_disabled: false, socials: {} } });
    if (url.pathname.endsWith("/role")) return route.fulfill({ json: { role: "top", selected_at: null, updated_at: null } });
    if (url.pathname.startsWith("/api/quiz/")) return route.fulfill({ json: { ok: true, sets: [] } });
    if (url.pathname.endsWith("/today")) return route.fulfill({ json: { run: null } });
    return route.fulfill({ json: [] });
  });
  return fixture;
}

test("standalone Ranked ordinary reveal preserves the exact Back and native Forward recovery", async ({ page }) => {
  const fixture = await prepareRanked(page);
  await page.goto("/quiz/ranked");
  await expect(page.getByTestId("ranked-match")).toBeVisible();
  const initialLength = await page.evaluate(() => history.length);

  fixture.revealRound();
  await expect(page.getByTestId("ranked-match")).toHaveAttribute("data-reveal-hold", "true", { timeout: 6_000 });
  await expect(page.getByTestId("ranked-last-result")).toHaveAttribute("data-round", "1");

  await page.goBack();
  const dialog = page.getByRole("alertdialog", { name: "Leave this Ranked match?" });
  await expect(dialog).toHaveCount(1);
  await expect(page).toHaveURL("/quiz/ranked");
  await expect(page.getByTestId("ranked-last-result")).toHaveAttribute("data-round", "1");
  await page.getByRole("button", { name: "Stay in Match" }).click();
  await expect(page).toHaveURL("/quiz/ranked");
  expect(await page.evaluate(() => history.length)).toBe(initialLength);

  await page.goBack();
  await expect(dialog).toHaveCount(1);
  await page.getByRole("button", { name: "Leave Match" }).click();
  await expect(page).toHaveURL("/quiz");
  await page.goForward();
  await expect(page).toHaveURL("/quiz/ranked");
  await expect(page.getByTestId("ranked-match")).toBeVisible();
  await expect(page.getByTestId("ranked-entry-intro")).toHaveCount(0);
  expect(await page.evaluate(() => history.length)).toBe(initialLength);
  expect(forbiddenWrites(fixture)).toEqual([]);
});

function forbiddenWrites(fixture: RankedFixture) {
  return fixture.requests.filter((request) => request.method() !== "GET")
    .map((request) => new URL(request.url()).pathname)
    .filter((path) => /forfeit|abandon|cancel|terminate/.test(path));
}

for (const locked of [false, true]) {
  test(`standalone Ranked ${locked ? "locked" : "active"} Back/Stay/Leave/Forward is transactional`, async ({ page }) => {
    const fixture = await prepareRanked(page, { locked });
    await page.goto("/quiz/ranked");
    await expect(page.getByTestId("ranked-back-to-quiz")).toHaveText("Leave Match");
    const initialLength = await page.evaluate(() => history.length);
    await page.goBack();
    const dialog = page.getByRole("alertdialog", { name: "Leave this Ranked match?" });
    await expect(dialog).toHaveCount(1);
    await page.getByRole("button", { name: "Stay in Match" }).click();
    await expect(page).toHaveURL("/quiz/ranked");
    expect(await page.evaluate(() => history.length)).toBe(initialLength);
    await page.goBack();
    await page.getByRole("button", { name: "Leave Match" }).click();
    await expect(page).toHaveURL("/quiz");
    await page.goForward();
    await expect(page).toHaveURL("/quiz/ranked");
    expect(forbiddenWrites(fixture)).toEqual([]);
  });
}

test("authoritative Ranked terminal state cancels a pending Back", async ({ page }) => {
  const fixture = await prepareRanked(page);
  await page.goto("/quiz/ranked");
  await expect(page.getByTestId("ranked-back-to-quiz")).toHaveText("Leave Match");
  await page.goBack();
  await expect(page.getByRole("alertdialog", { name: "Leave this Ranked match?" })).toBeVisible();
  fixture.terminal = true;
  await expect(page.getByTestId("ranked-match-over")).toBeVisible({ timeout: 8_000 });
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(page).toHaveURL("/quiz/ranked");
  expect(forbiddenWrites(fixture)).toEqual([]);
});

test("mobile Ranked guard keeps one focused dialog and the active route", async ({ page }) => {
  const fixture = await prepareRanked(page, { mobile: true });
  await page.goto("/quiz/ranked");
  await expect(page.getByTestId("ranked-back-to-quiz")).toHaveText("Leave Match");
  await page.goBack();
  const dialog = page.getByRole("alertdialog", { name: "Leave this Ranked match?" });
  await expect(dialog).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Stay in Match" })).toBeFocused();
  await expect(dialog).toBeInViewport();
  await page.getByRole("button", { name: "Stay in Match" }).click();
  await expect(page).toHaveURL("/quiz/ranked");
  expect(forbiddenWrites(fixture)).toEqual([]);
});
