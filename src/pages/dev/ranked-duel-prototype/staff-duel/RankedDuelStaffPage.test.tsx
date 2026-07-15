import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { RankedDuelStaffPage } from "./RankedDuelStaffPage";
import {
  MATCH_ID,
  ME,
  OPPONENT,
  errorBody,
  privateEnvelope,
  publicEnvelope,
  resolvedEnvelope,
} from "./testFixtures";

const TOKEN = "token-alice";

interface FakeBackend {
  round: number;
  noActiveRound: boolean;
  pending: string[];
  meSubmitted: boolean;
  opponentSubmitted: boolean;
  privateLevel2Made: boolean;
  privateUnlocked: string[];
  privateCharges: Record<string, number | null>;
  matchGone: boolean;
  resolved: Record<number, unknown>;
  submissions: unknown[];
  levelTwoChoices: unknown[];
  tokenHeaders: (string | undefined)[];
  urls: string[];
  signals: AbortSignal[];
  inFlight: number;
  maxInFlight: number;
  /** Poll-only (GET public/private/resolved) concurrency — commands excluded. */
  pollInFlight: number;
  maxPollInFlight: number;
  /** One public request == one polling cycle started. */
  publicStarts: number;
  /** When set, public requests hang until it is resolved. */
  gatePublic: { promise: Promise<void>; resolve: () => void } | null;
}

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

let backend: FakeBackend;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const install = () => {
  const impl = async (url: string, init: RequestInit = {}): Promise<Response> => {
    backend.urls.push(String(url));
    if (init.signal) backend.signals.push(init.signal as AbortSignal);
    const headers = (init.headers ?? {}) as Record<string, string>;
    backend.tokenHeaders.push(headers["X-Ranked-Duel-Player-Token"]);
    backend.inFlight += 1;
    backend.maxInFlight = Math.max(backend.maxInFlight, backend.inFlight);
    const path0 = String(url);
    const isPoll =
      (init.method ?? "GET") === "GET" &&
      (path0.includes("/rounds/current/public") ||
        path0.includes("/rounds/current/private/") ||
        /\/rounds\/\d+\/resolved$/.test(path0));
    if (isPoll) {
      backend.pollInFlight += 1;
      backend.maxPollInFlight = Math.max(backend.maxPollInFlight, backend.pollInFlight);
    }
    try {
      await Promise.resolve();
      const path = String(url);
      if (path.includes("/rounds/current/public")) {
        backend.publicStarts += 1;
        if (backend.gatePublic) await backend.gatePublic.promise;
      }
      if (backend.matchGone) {
        return json(errorBody("ranked_duel_match_not_found", `no ranked duel match: ${MATCH_ID}`), 404);
      }
      if (path.includes("/rounds/current/public")) {
        if (backend.noActiveRound) {
          return json(
            errorBody("ranked_duel_no_active_round", "match m1 has no active round", {
              ...(backend.pending.length ? { progression_pending_players: backend.pending } : {}),
            }),
            409,
          );
        }
        return json(
          publicEnvelope({
            roundNumber: backend.round,
            me: { hasSubmitted: backend.meSubmitted },
            opponent: { hasSubmitted: backend.opponentSubmitted },
            pending: backend.pending,
          }),
        );
      }
      if (path.includes("/rounds/current/private/")) {
        if (backend.noActiveRound) {
          return json(errorBody("ranked_duel_no_active_round", "no active round"), 409);
        }
        return json(
          privateEnvelope({
            ownerId: ME,
            roundNumber: backend.round,
            hasSubmitted: backend.meSubmitted,
            unlocked: backend.privateUnlocked,
            charges: backend.privateCharges,
            level2Choice: backend.privateLevel2Made ? "tank.brace" : null,
          }),
        );
      }
      const resolvedMatch = path.match(/\/rounds\/(\d+)\/resolved$/);
      if (resolvedMatch) {
        const n = Number(resolvedMatch[1]);
        const body = backend.resolved[n];
        if (!body) {
          return json(errorBody("ranked_duel_round_not_found", `match m1 has no round ${n}`), 404);
        }
        return json(body);
      }
      if (path.includes("/rounds/current/submission")) {
        backend.submissions.push(JSON.parse(init.body as string));
        return json({
          status: "accepted",
          match_id: MATCH_ID,
          round_number: backend.round,
          player_id: ME,
          round_resolved: false,
        });
      }
      if (path.includes("/progression/level-two-choice")) {
        backend.levelTwoChoices.push(JSON.parse(init.body as string));
        return json({
          status: "confirmed",
          match_id: MATCH_ID,
          player_id: ME,
          ability_id: "tank.brace",
          pending_players: [],
        });
      }
      return json({ detail: "unexpected route" }, 500);
    } finally {
      backend.inFlight -= 1;
      if (isPoll) backend.pollInFlight -= 1;
    }
  };
  vi.stubGlobal("fetch", vi.fn(impl) as unknown as typeof fetch);
};

const tick = async (ms = 0) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

const joinAsMe = async () => {
  fireEvent.change(screen.getByTestId("sd-join-match"), { target: { value: MATCH_ID } });
  fireEvent.change(screen.getByTestId("sd-join-player"), { target: { value: ME } });
  fireEvent.change(screen.getByTestId("sd-join-token"), { target: { value: TOKEN } });
  fireEvent.click(screen.getByTestId("sd-join"));
  await tick(10);
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-14T12:00:05Z"));
  backend = {
    round: 1,
    noActiveRound: false,
    pending: [],
    meSubmitted: false,
    opponentSubmitted: false,
    privateLevel2Made: false,
    privateUnlocked: ["tank.fortify"],
    privateCharges: { "tank.fortify": 3 },
    matchGone: false,
    resolved: {},
    submissions: [],
    levelTwoChoices: [],
    tokenHeaders: [],
    urls: [],
    signals: [],
    inFlight: 0,
    maxInFlight: 0,
    pollInFlight: 0,
    maxPollInFlight: 0,
    publicStarts: 0,
    gatePublic: null,
  };
  install();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("participant join", () => {
  it("requires match id, player id, and token", async () => {
    render(<RankedDuelStaffPage />);
    fireEvent.click(screen.getByTestId("sd-join"));
    expect(screen.getByTestId("sd-join-error")).toBeTruthy();
    expect(backend.urls).toHaveLength(0);
  });

  it("joins, never puts the token in a URL, and does not echo it back", async () => {
    render(<RankedDuelStaffPage />);
    await joinAsMe();
    expect(screen.getByTestId("sd-joined-as").textContent).toContain(ME);
    expect(backend.urls.length).toBeGreaterThan(0);
    for (const url of backend.urls) expect(url).not.toContain(TOKEN);
    expect(document.body.textContent).not.toContain(TOKEN);
  });

  it("leaving clears the credentials and stops the session", async () => {
    render(<RankedDuelStaffPage />);
    await joinAsMe();
    const before = backend.urls.length;
    fireEvent.click(screen.getByTestId("sd-leave"));
    await tick(5000);
    expect(screen.getByTestId("participant-join")).toBeTruthy();
    expect(backend.urls.length).toBe(before);
  });

  it("surfaces a wrong token as a session-stopping credential error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        String(url).includes("/private/")
          ? json(errorBody("ranked_duel_invalid_player_token", "invalid participant token"), 401)
          : json(publicEnvelope({ roundNumber: 1 })),
      ) as unknown as typeof fetch,
    );
    render(<RankedDuelStaffPage />);
    await joinAsMe();
    expect(screen.getByTestId("sd-fatal").textContent).toContain("not valid for this match");
  });
});

describe("gameplay", () => {
  it("renders the public question and the owner's private abilities without revealing correctness", async () => {
    render(<RankedDuelStaffPage />);
    await joinAsMe();

    expect(screen.getByTestId("sd-prompt").textContent).toContain("Immolate");
    expect(screen.getByTestId("sd-answer-0").textContent).toContain("Sunfire Aegis");
    expect(screen.getByTestId("sd-answer-3")).toBeTruthy();
    // Nothing marks an option as correct before the backend resolves.
    for (const i of [0, 1, 2, 3]) {
      expect(screen.getByTestId(`sd-answer-${i}`).getAttribute("aria-checked")).toBe("false");
    }
    expect(screen.getByTestId("sd-question").textContent?.toLowerCase()).not.toContain("correct");

    expect(screen.getByTestId("sd-ability-tank.fortify").textContent).toContain("3 charge(s)");
    expect(screen.getByTestId("sd-ability-none")).toBeTruthy();
    expect(screen.getByTestId("sd-locked-abilities").textContent).toContain("Brace");
  });

  it("selects exactly one answer and one ability, then submits the backend round number", async () => {
    backend.round = 2;
    render(<RankedDuelStaffPage />);
    await joinAsMe();

    fireEvent.click(screen.getByTestId("sd-answer-2"));
    fireEvent.click(screen.getByTestId("sd-answer-1"));
    expect(screen.getByTestId("sd-answer-2").getAttribute("aria-checked")).toBe("false");
    expect(screen.getByTestId("sd-answer-1").getAttribute("aria-checked")).toBe("true");

    fireEvent.click(screen.getByTestId("sd-ability-tank.fortify"));
    expect(screen.getByTestId("sd-ability-none").getAttribute("aria-checked")).toBe("false");

    fireEvent.click(screen.getByTestId("sd-lock"));
    expect(screen.getByTestId("sd-confirm-note").textContent).toContain("final for the round");

    backend.meSubmitted = true;
    fireEvent.click(screen.getByTestId("sd-confirm-submit"));
    await tick(10);

    expect(backend.submissions).toEqual([
      { round_number: 2, answer: 1, ability_id: "tank.fortify" },
    ]);
    expect(backend.tokenHeaders.filter(Boolean)).toContain(TOKEN);
  });

  it("submits a null ability when 'No ability' is chosen", async () => {
    render(<RankedDuelStaffPage />);
    await joinAsMe();
    fireEvent.click(screen.getByTestId("sd-answer-0"));
    fireEvent.click(screen.getByTestId("sd-lock"));
    backend.meSubmitted = true;
    fireEvent.click(screen.getByTestId("sd-confirm-submit"));
    await tick(10);
    expect(backend.submissions).toEqual([{ round_number: 1, answer: 0, ability_id: null }]);
  });

  it("disables a depleted ability", async () => {
    backend.privateCharges = { "tank.fortify": 0 };
    render(<RankedDuelStaffPage />);
    await joinAsMe();
    const depleted = screen.getByTestId("sd-ability-tank.fortify") as HTMLButtonElement;
    expect(depleted.disabled).toBe(true);
    expect(depleted.textContent).toContain("depleted");
  });

  it("shows the waiting state and blocks duplicate submissions", async () => {
    render(<RankedDuelStaffPage />);
    await joinAsMe();
    fireEvent.click(screen.getByTestId("sd-answer-0"));
    fireEvent.click(screen.getByTestId("sd-lock"));
    backend.meSubmitted = true;
    fireEvent.click(screen.getByTestId("sd-confirm-submit"));
    await tick(10);

    expect(screen.getByTestId("sd-waiting").textContent).toContain("waiting for opponent");
    expect(screen.queryByTestId("sd-lock")).toBeNull();
    expect((screen.getByTestId("sd-answer-0") as HTMLButtonElement).disabled).toBe(true);
    expect(backend.submissions).toHaveLength(1);
  });

  it("reveals the resolved round and resets the selection when the backend advances", async () => {
    render(<RankedDuelStaffPage />);
    await joinAsMe();
    fireEvent.click(screen.getByTestId("sd-answer-0"));
    fireEvent.click(screen.getByTestId("sd-lock"));
    backend.meSubmitted = true;
    fireEvent.click(screen.getByTestId("sd-confirm-submit"));
    await tick(10);

    // Backend resolves round 1 and starts round 2.
    backend.resolved[1] = resolvedEnvelope({
      roundNumber: 1,
      me: { outcome: "correct", dealt: 30, hpBefore: 170, hpAfter: 170 },
      opponent: { outcome: "incorrect", received: 30, hpBefore: 90, hpAfter: 60 },
    });
    backend.round = 2;
    backend.meSubmitted = false;
    await tick(2000);

    expect(screen.getByTestId("sd-reveal").textContent).toContain("Round 1 result");
    expect(screen.getByTestId(`sd-reveal-${OPPONENT}`).textContent).toContain("damage taken 30");
    expect(screen.getByTestId("sd-round").textContent).toContain("Round 2");
    // Previous round's answer is not carried into the new round.
    expect(screen.getByTestId("sd-answer-0").getAttribute("aria-checked")).toBe("false");
    expect((screen.getByTestId("sd-lock") as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("progression", () => {
  it("blocks submission, renders the backend's Level 2 options, and posts the choice", async () => {
    render(<RankedDuelStaffPage />);
    await joinAsMe();

    // Round 1 resolves into a Level 2 gate for me.
    backend.resolved[1] = resolvedEnvelope({
      roundNumber: 1,
      me: { outcome: "correct", levelBefore: 1, levelAfter: 2, levelUp: true },
    });
    backend.noActiveRound = true;
    backend.pending = [ME];
    await tick(2000);

    expect(screen.getByTestId("sd-progression")).toBeTruthy();
    expect(screen.queryByTestId("sd-lock")).toBeNull();
    expect(screen.getByTestId("sd-level2-tank.brace")).toBeTruthy();
    expect(screen.getByTestId("sd-level2-tank.barrier")).toBeTruthy();
    // No passive or ultimate concepts exist anywhere in this UI.
    const text = document.body.textContent?.toLowerCase() ?? "";
    expect(text).not.toContain("passive");
    expect(text).not.toContain("ultimate");

    fireEvent.click(screen.getByTestId("sd-level2-tank.brace"));
    await tick(10);
    expect(backend.levelTwoChoices).toEqual([{ ability_id: "tank.brace" }]);
    expect(backend.tokenHeaders.filter(Boolean)).toContain(TOKEN);

    // Backend starts round 2 once the choice is confirmed.
    backend.noActiveRound = false;
    backend.pending = [];
    backend.round = 2;
    backend.privateLevel2Made = true;
    backend.privateUnlocked = ["tank.fortify", "tank.brace"];
    backend.privateCharges = { "tank.fortify": 3, "tank.brace": 3 };
    await tick(2000);

    expect(screen.queryByTestId("sd-progression")).toBeNull();
    expect(screen.getByTestId("sd-ability-tank.brace")).toBeTruthy();
  });

  it("shows a waiting state while only the opponent owes a choice", async () => {
    render(<RankedDuelStaffPage />);
    await joinAsMe();
    backend.resolved[1] = resolvedEnvelope({ roundNumber: 1 });
    backend.noActiveRound = true;
    backend.pending = [OPPONENT];
    await tick(2000);

    expect(screen.getByTestId("sd-progression-waiting").textContent).toContain(
      "Waiting for your opponent",
    );
    expect(screen.queryByTestId("sd-progression")).toBeNull();
  });

  it("renders the automatic Level 3 unlock from backend state", async () => {
    backend.privateUnlocked = ["tank.fortify", "tank.brace", "tank.barrier"];
    backend.privateCharges = { "tank.fortify": 3, "tank.brace": 3, "tank.barrier": null };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        String(url).includes("/private/")
          ? json(
              privateEnvelope({
                ownerId: ME,
                unlocked: backend.privateUnlocked,
                locked: [],
                charges: backend.privateCharges,
                level3: true,
                level: 3,
              }),
            )
          : json(publicEnvelope({ roundNumber: 1 })),
      ) as unknown as typeof fetch,
    );
    render(<RankedDuelStaffPage />);
    await joinAsMe();
    expect(screen.getByTestId("sd-level3").textContent).toContain("Barrier");
    expect(screen.queryByTestId("sd-locked-abilities")).toBeNull();
  });
});

describe("match completion and failure states", () => {
  it("shows the winner from the resolved round and stops polling", async () => {
    render(<RankedDuelStaffPage />);
    await joinAsMe();

    backend.resolved[1] = resolvedEnvelope({
      roundNumber: 1,
      me: { outcome: "correct", dealt: 90 },
      opponent: { outcome: "incorrect", received: 90, hpBefore: 90, hpAfter: 0, zero: true },
      matchOver: true,
      winnerId: ME,
    });
    backend.noActiveRound = true;
    await tick(2000);

    expect(screen.getByTestId("sd-match-over")).toBeTruthy();
    expect(screen.getByTestId("sd-winner").textContent).toContain(`${ME} (you)`);
    expect(screen.queryByTestId("sd-lock")).toBeNull();

    const after = backend.urls.length;
    await tick(20000);
    expect(backend.urls.length).toBe(after);
  });

  it("reports a lost in-memory match and stops polling", async () => {
    render(<RankedDuelStaffPage />);
    await joinAsMe();
    backend.matchGone = true;
    await tick(2000);

    expect(screen.getByTestId("sd-fatal").textContent).toContain("no longer exists");
    const after = backend.urls.length;
    await tick(20000);
    expect(backend.urls.length).toBe(after);
    for (const url of backend.urls) expect(url).not.toContain(TOKEN);
  });

  it("keeps a single inline error and backs off when the backend is unreachable", async () => {
    render(<RankedDuelStaffPage />);
    await joinAsMe();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }) as unknown as typeof fetch,
    );
    await tick(2000);
    const errors = screen.getAllByTestId("sd-poll-error");
    expect(errors).toHaveLength(1);
    expect(errors[0].textContent).toContain("could not reach");
  });
});

describe("polling discipline", () => {
  it("never overlaps requests and keeps polling public and private state", async () => {
    render(<RankedDuelStaffPage />);
    await joinAsMe();
    const firstPass = backend.urls.length;
    await tick(6000);

    expect(backend.maxInFlight).toBe(1);
    expect(backend.urls.length).toBeGreaterThan(firstPass);
    expect(backend.urls.some((u) => u.includes("/rounds/current/public"))).toBe(true);
    expect(backend.urls.some((u) => u.includes("/rounds/current/private/alice"))).toBe(true);
  });

  // The exact defect the audit found: a command's immediate refresh arriving
  // while a poll cycle is still awaiting its fetch used to start a SECOND
  // cycle, and both cycles then scheduled their own timeout — permanently
  // doubling the loop.
  it("queues a submission's refresh during an in-flight poll instead of starting a second loop", async () => {
    const view = render(<RankedDuelStaffPage />);
    await joinAsMe();

    // Hold the next polling cycle's public fetch open.
    backend.gatePublic = deferred();
    const startsBeforeHeldPoll = backend.publicStarts;
    await tick(1600);
    expect(backend.publicStarts).toBe(startsBeforeHeldPoll + 1);
    expect(backend.pollInFlight).toBe(1); // the held cycle is still running

    // Submit while that poll is unresolved; the command asks for an immediate
    // refresh as soon as its POST returns.
    fireEvent.click(screen.getByTestId("sd-answer-0"));
    fireEvent.click(screen.getByTestId("sd-lock"));
    backend.meSubmitted = true;
    fireEvent.click(screen.getByTestId("sd-confirm-submit"));
    await tick(50);

    // The refresh is queued, not run: no second cycle has begun.
    expect(backend.submissions).toHaveLength(1);
    expect(backend.publicStarts).toBe(startsBeforeHeldPoll + 1);
    expect(backend.maxPollInFlight).toBe(1);

    // Releasing the held poll runs exactly ONE queued refresh.
    backend.gatePublic.resolve();
    backend.gatePublic = null;
    await tick(20);
    expect(backend.publicStarts).toBe(startsBeforeHeldPoll + 2);

    // Steady state: a single loop at the normal cadence (two loops would
    // produce eight cycles over six intervals).
    const beforeCadence = backend.publicStarts;
    await tick(6000);
    expect(backend.publicStarts - beforeCadence).toBe(4);
    expect(backend.maxPollInFlight).toBe(1);

    // A further command-triggered refresh must not compound the loop either.
    backend.resolved[1] = resolvedEnvelope({ roundNumber: 1 });
    backend.round = 2;
    backend.meSubmitted = false;
    await tick(2000);
    fireEvent.click(screen.getByTestId("sd-answer-1"));
    fireEvent.click(screen.getByTestId("sd-lock"));
    backend.meSubmitted = true;
    fireEvent.click(screen.getByTestId("sd-confirm-submit"));
    await tick(50);
    const beforeSecondCadence = backend.publicStarts;
    await tick(6000);
    expect(backend.publicStarts - beforeSecondCadence).toBe(4);
    expect(backend.maxPollInFlight).toBe(1);
    expect(backend.submissions).toHaveLength(2);

    // Leaving stops every loop.
    view.unmount();
    const afterUnmount = backend.urls.length;
    await tick(20000);
    expect(backend.urls.length).toBe(afterUnmount);
  });

  it("queues a Level 2 choice's refresh through the same coordinator", async () => {
    render(<RankedDuelStaffPage />);
    await joinAsMe();

    // Round 1 resolves into a Level 2 gate for me.
    backend.resolved[1] = resolvedEnvelope({
      roundNumber: 1,
      me: { outcome: "correct", levelBefore: 1, levelAfter: 2, levelUp: true },
    });
    backend.noActiveRound = true;
    backend.pending = [ME];
    await tick(2000);
    expect(screen.getByTestId("sd-progression")).toBeTruthy();

    // Hold the next cycle's public fetch, then choose while it is in flight.
    backend.gatePublic = deferred();
    const startsBeforeHeldPoll = backend.publicStarts;
    await tick(1600);
    expect(backend.publicStarts).toBe(startsBeforeHeldPoll + 1);
    expect(backend.pollInFlight).toBe(1);

    fireEvent.click(screen.getByTestId("sd-level2-tank.brace"));
    await tick(50);
    expect(backend.levelTwoChoices).toEqual([{ ability_id: "tank.brace" }]);
    expect(backend.publicStarts).toBe(startsBeforeHeldPoll + 1); // queued, not run
    expect(backend.maxPollInFlight).toBe(1);

    backend.gatePublic.resolve();
    backend.gatePublic = null;
    backend.noActiveRound = false;
    backend.pending = [];
    backend.round = 2;
    await tick(20);
    expect(backend.publicStarts).toBe(startsBeforeHeldPoll + 2);

    const beforeCadence = backend.publicStarts;
    await tick(6000);
    expect(backend.publicStarts - beforeCadence).toBe(4);
    expect(backend.maxPollInFlight).toBe(1);
  });

  it("aborts in-flight requests on unmount", async () => {
    const view = render(<RankedDuelStaffPage />);
    await joinAsMe();
    expect(backend.signals.length).toBeGreaterThan(0);
    view.unmount();
    expect(backend.signals.every((s) => s.aborted)).toBe(true);
  });
});
