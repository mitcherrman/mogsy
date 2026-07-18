import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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
  /** When true, submission POSTs fail once (flag auto-clears). */
  submitFailOnce: boolean;
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
        if (backend.submitFailOnce) {
          backend.submitFailOnce = false;
          return json(errorBody("ranked_duel_round_mismatch", "submission arrived for a stale round"), 409);
        }
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

/** Canonical AnswerGrid button for backend option index i. */
const answerBtn = (i: number): HTMLButtonElement => {
  const grid = screen.getByTestId("answer-grid");
  const btn = grid.querySelector(`[data-quiz-choice="${i}"]`);
  if (!btn) throw new Error(`no answer option ${i}`);
  return btn as HTMLButtonElement;
};

/** Full canonical submission flow: pick -> review -> confirm atomically. */
const submitAnswer = async (i: number, abilityId?: string) => {
  fireEvent.click(answerBtn(i));
  if (abilityId) fireEvent.click(screen.getByTestId(`ability-${abilityId}`));
  fireEvent.click(screen.getByTestId("review-button"));
  backend.meSubmitted = true;
  fireEvent.click(screen.getByTestId("confirm-button"));
  await tick(50);
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
    submitFailOnce: false,
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

    expect(screen.getByTestId("sd-question").textContent).toContain("Immolate");
    expect(answerBtn(0).textContent).toContain("Sunfire Aegis");
    expect(answerBtn(3)).toBeTruthy();
    // Nothing marks an option as correct before the backend resolves.
    for (const i of [0, 1, 2, 3]) {
      expect(answerBtn(i).getAttribute("data-choice-state")).toBe("idle");
    }
    expect(screen.getByTestId("sd-question").textContent?.toLowerCase()).not.toContain("correct");

    expect(screen.getByTestId("ability-tank.fortify").textContent).toContain("3 charges left");
    expect(screen.getByTestId("ability-none")).toBeTruthy();
    // Progression-locked abilities render disabled with the lock state.
    const brace = screen.getByTestId("ability-tank.brace") as HTMLButtonElement;
    expect(brace.disabled).toBe(true);
    expect(brace.getAttribute("data-ability-state")).toBe("locked-progression");
  });

  it("selects one answer + one ability, reviews, and submits the backend round number and index once", async () => {
    backend.round = 2;
    render(<RankedDuelStaffPage />);
    await joinAsMe();

    fireEvent.click(answerBtn(2));
    fireEvent.click(answerBtn(1));
    expect(answerBtn(2).getAttribute("data-choice-state")).toBe("idle");
    expect(answerBtn(1).getAttribute("data-choice-state")).toBe("selected");

    fireEvent.click(screen.getByTestId("ability-tank.fortify"));
    expect(screen.getByTestId("ability-none").getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(screen.getByTestId("review-button"));
    const review = screen.getByTestId("submission-review");
    expect(review.getAttribute("data-phase")).toBe("reviewing");
    expect(review.textContent).toContain("lock together");
    expect(screen.getByTestId("review-answer").textContent).toContain("Heartsteel");
    expect(screen.getByTestId("review-ability").textContent).toContain("Fortify");
    // Entering review sends nothing.
    expect(backend.submissions).toHaveLength(0);

    backend.meSubmitted = true;
    fireEvent.click(screen.getByTestId("confirm-button"));
    await tick(10);

    // Exactly one atomic submission with the backend round number + index.
    expect(backend.submissions).toEqual([
      { round_number: 2, answer: 1, ability_id: "tank.fortify" },
    ]);
    expect(backend.tokenHeaders.filter(Boolean)).toContain(TOKEN);
  });

  it("submits a null ability when 'No ability' is chosen", async () => {
    render(<RankedDuelStaffPage />);
    await joinAsMe();
    await submitAnswer(0);
    expect(backend.submissions).toEqual([{ round_number: 1, answer: 0, ability_id: null }]);
  });

  it("allows editing the selection before the atomic confirm", async () => {
    render(<RankedDuelStaffPage />);
    await joinAsMe();
    fireEvent.click(answerBtn(0));
    fireEvent.click(screen.getByTestId("review-button"));
    fireEvent.click(screen.getByTestId("edit-button"));
    // Back in selecting: the answer can change, nothing was sent.
    fireEvent.click(answerBtn(2));
    expect(answerBtn(2).getAttribute("data-choice-state")).toBe("selected");
    expect(backend.submissions).toHaveLength(0);
    fireEvent.click(screen.getByTestId("review-button"));
    backend.meSubmitted = true;
    fireEvent.click(screen.getByTestId("confirm-button"));
    await tick(10);
    expect(backend.submissions).toEqual([{ round_number: 1, answer: 2, ability_id: null }]);
  });

  it("keeps answer and ability after a failed submit and allows a retry", async () => {
    render(<RankedDuelStaffPage />);
    await joinAsMe();
    backend.submitFailOnce = true;
    fireEvent.click(answerBtn(1));
    fireEvent.click(screen.getByTestId("ability-tank.fortify"));
    fireEvent.click(screen.getByTestId("review-button"));
    fireEvent.click(screen.getByTestId("confirm-button"));
    await tick(50);

    // The failure surfaced; nothing was accepted; the selection is intact.
    expect(screen.getByTestId("submission-status")).toBeTruthy();
    expect(backend.submissions).toHaveLength(0);
    expect(screen.getByTestId("review-answer").textContent).toContain("Heartsteel");
    expect(screen.getByTestId("review-ability").textContent).toContain("Fortify");

    backend.meSubmitted = true;
    fireEvent.click(screen.getByTestId("confirm-button"));
    await tick(50);
    expect(backend.submissions).toEqual([
      { round_number: 1, answer: 1, ability_id: "tank.fortify" },
    ]);
  });

  it("disables a depleted ability", async () => {
    backend.privateCharges = { "tank.fortify": 0 };
    render(<RankedDuelStaffPage />);
    await joinAsMe();
    const depleted = screen.getByTestId("ability-tank.fortify") as HTMLButtonElement;
    expect(depleted.disabled).toBe(true);
    expect(depleted.textContent).toContain("No charges remaining");
  });

  it("shows the waiting state and blocks duplicate submissions", async () => {
    render(<RankedDuelStaffPage />);
    await joinAsMe();
    await submitAnswer(0);

    expect(screen.getByTestId("submission-review").getAttribute("data-phase")).toBe("locked");
    expect(screen.getByTestId("locked-banner")).toBeTruthy();
    expect(screen.getByTestId("submission-status").textContent).toContain("waiting for opponent");
    // No confirm control exists once locked; the grid is disabled (via its
    // fieldset, so match :disabled rather than the button's own property).
    expect(screen.queryByTestId("confirm-button")).toBeNull();
    expect(screen.queryByTestId("review-button")).toBeNull();
    expect(screen.getByTestId("answer-grid").getAttribute("data-answers-state")).toBe("locked");
    expect(answerBtn(0).matches(":disabled")).toBe(true);
    expect(backend.submissions).toHaveLength(1);
  });

  it("reveals the resolved round and resets the selection when the backend advances", async () => {
    render(<RankedDuelStaffPage />);
    await joinAsMe();
    await submitAnswer(0);

    // Backend resolves round 1 and starts round 2.
    backend.resolved[1] = resolvedEnvelope({
      roundNumber: 1,
      me: { outcome: "correct", dealt: 30, hpBefore: 170, hpAfter: 170 },
      opponent: { outcome: "incorrect", received: 30, hpBefore: 90, hpAfter: 60 },
    });
    backend.round = 2;
    backend.meSubmitted = false;
    await tick(2000);

    expect(screen.getByTestId("reveal-panel").textContent).toContain("Round 1 resolved");
    const opponentCard = within(screen.getByTestId(`reveal-${OPPONENT}`));
    expect(opponentCard.getByTestId(`reveal-hp-${OPPONENT}`).textContent).toContain("90 → 60");
    expect(opponentCard.getByTestId(`reveal-hp-${OPPONENT}`).textContent).toContain("−30");
    expect(screen.getByTestId("sd-round").textContent).toContain("Round 2");
    // Previous round's answer is not carried into the new round.
    expect(answerBtn(0).getAttribute("data-choice-state")).toBe("idle");
    expect((screen.getByTestId("review-button") as HTMLButtonElement).disabled).toBe(true);
  });

  it("a round change while reviewing returns safely to a fresh selection", async () => {
    render(<RankedDuelStaffPage />);
    await joinAsMe();
    fireEvent.click(answerBtn(0));
    fireEvent.click(screen.getByTestId("review-button"));
    expect(screen.getByTestId("submission-review").getAttribute("data-phase")).toBe("reviewing");

    // Backend resolves the round (opponent finished it) and starts round 2.
    backend.resolved[1] = resolvedEnvelope({ roundNumber: 1 });
    backend.round = 2;
    await tick(2000);

    const review = screen.getByTestId("submission-review");
    expect(review.getAttribute("data-phase")).toBe("selecting");
    expect(answerBtn(0).getAttribute("data-choice-state")).toBe("idle");
    expect(backend.submissions).toHaveLength(0);
  });
});

describe("progression", () => {
  it("blocks submission, renders the backend's Level 2 options, and posts the confirmed choice", async () => {
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
    expect(screen.queryByTestId("review-button")).toBeNull();
    expect(screen.getByTestId("level-option-tank.brace")).toBeTruthy();
    expect(screen.getByTestId("level-option-tank.barrier")).toBeTruthy();
    // No passive or ultimate concepts exist anywhere in this UI.
    const text = document.body.textContent?.toLowerCase() ?? "";
    expect(text).not.toContain("passive");
    expect(text).not.toContain("ultimate");

    // Canonical two-step: pick, then confirm the permanent choice.
    fireEvent.click(screen.getByTestId("level-option-tank.brace"));
    expect(backend.levelTwoChoices).toHaveLength(0);
    fireEvent.click(screen.getByTestId("level-confirm"));
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
    expect(screen.getByTestId("ability-tank.brace")).toBeTruthy();
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
    const unlock = screen.getByTestId("level-up-panel");
    expect(unlock.getAttribute("data-kind")).toBe("level3-unlock");
    expect(unlock.textContent).toContain("Barrier");
    // Nothing remains progression-locked.
    expect(document.querySelector('[data-ability-state="locked-progression"]')).toBeNull();
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
    expect(screen.getByTestId("match-over-frame").getAttribute("data-result")).toBe("victory");
    expect(screen.getByTestId("match-over-subheading").textContent).toContain(`${ME} (you)`);
    expect(screen.queryByTestId("review-button")).toBeNull();

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
    fireEvent.click(answerBtn(0));
    fireEvent.click(screen.getByTestId("review-button"));
    backend.meSubmitted = true;
    fireEvent.click(screen.getByTestId("confirm-button"));
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
    fireEvent.click(answerBtn(1));
    fireEvent.click(screen.getByTestId("review-button"));
    backend.meSubmitted = true;
    fireEvent.click(screen.getByTestId("confirm-button"));
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

    fireEvent.click(screen.getByTestId("level-option-tank.brace"));
    fireEvent.click(screen.getByTestId("level-confirm"));
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
