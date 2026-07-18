import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ApiReadCompositionPanel } from "./ApiReadCompositionPanel";
import {
  getPrivateEnvelopeScenario,
  getPublicEnvelopeScenario,
  getResolvedEnvelopeScenario,
} from "@/lib/ranked-core/transport/rankedDuelEnvelopeFixtures";
import { DuelAction } from "../duelMachine";

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const publicEnv = (key = "public-active-question") =>
  clone(getPublicEnvelopeScenario(key)!.envelope);
const privateEnv = (key = "private-idle") => clone(getPrivateEnvelopeScenario(key)!.envelope);
const resolvedEnv = (key = "plain-round") => clone(getResolvedEnvelopeScenario(key)!.envelope);

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

type Route = (url: string, init?: RequestInit) => Promise<Response>;

/** Fetch router keyed by endpoint path; captures signals for abort checks. */
const mockRoutes = (routes: { public?: Route; private?: Route; resolved?: Route }) => {
  const signals: { public: AbortSignal[]; private: AbortSignal[]; resolved: AbortSignal[] } = {
    public: [],
    private: [],
    resolved: [],
  };
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    const signal = init?.signal as AbortSignal;
    if (url.includes("/rounds/current/public")) {
      signals.public.push(signal);
      return (routes.public ?? (async () => jsonResponse(publicEnv())))(url, init);
    }
    if (url.includes("/rounds/current/private/")) {
      signals.private.push(signal);
      return (routes.private ?? (async () => jsonResponse(privateEnv())))(url, init);
    }
    signals.resolved.push(signal);
    return (routes.resolved ?? (async () => jsonResponse(resolvedEnv())))(url, init);
  });
  vi.stubGlobal("fetch", fn);
  return { fn, signals };
};

afterEach(() => {
  vi.unstubAllGlobals();
});

const setValue = (testId: string, value: string) =>
  fireEvent.change(screen.getByTestId(testId), { target: { value } });

const initIdentity = (
  ids: Partial<Record<"match" | "p1" | "p2" | "owner", string>> = {},
) => {
  setValue("comp-match-id", ids.match ?? "mock-match-001");
  setValue("comp-p1-id", ids.p1 ?? "alice");
  setValue("comp-p2-id", ids.p2 ?? "bob");
  setValue("comp-owner-id", ids.owner ?? "alice");
  fireEvent.click(screen.getByTestId("comp-init-identity"));
};

const renderPanel = (dispatch = vi.fn<(a: DuelAction) => void>(), strict = false) => {
  const ui = <ApiReadCompositionPanel dispatch={dispatch} />;
  const utils = render(strict ? <StrictMode>{ui}</StrictMode> : ui);
  return { dispatch, ...utils };
};

const settledDispatches = (dispatch: ReturnType<typeof vi.fn>) =>
  dispatch.mock.calls.filter((c) => (c[0] as DuelAction).type === "APPLY_BACKEND_SETTLEMENT");

describe("identity", () => {
  it("starts uninitialized with load actions disabled", () => {
    renderPanel();
    expect(screen.getByTestId("comp-init-identity")).toBeInTheDocument();
    expect(screen.getByTestId("comp-load-public")).toBeDisabled();
    expect(screen.getByTestId("comp-load-private")).toBeDisabled();
    expect(screen.getByTestId("comp-load-resolved")).toBeDisabled();
  });

  it("initializes a valid identity and locks the identity inputs", () => {
    renderPanel();
    initIdentity();
    expect(screen.getByTestId("comp-identity-locked")).toHaveTextContent("owner is p1");
    expect(screen.getByTestId("comp-match-id")).toBeDisabled();
    expect(screen.getByTestId("comp-p1-id")).toBeDisabled();
    expect(screen.queryByTestId("comp-init-identity")).toBeNull();
    expect(screen.getByTestId("comp-load-public")).not.toBeDisabled();
  });

  it("fails closed for empty, duplicate, and non-participant owner ids", () => {
    renderPanel();
    initIdentity({ match: " " });
    expect(screen.getByTestId("comp-identity-error")).toHaveTextContent(/matchId/);
    initIdentity({ p2: "alice" });
    expect(screen.getByTestId("comp-identity-error")).toHaveTextContent(/must differ/);
    initIdentity({ owner: "mallory" });
    expect(screen.getByTestId("comp-identity-error")).toHaveTextContent(/ownerPlayerId/);
    expect(screen.queryByTestId("comp-identity-locked")).toBeNull();
  });

  it("reset clears the composition and permits a new identity", async () => {
    mockRoutes({});
    renderPanel();
    initIdentity();
    fireEvent.click(screen.getByTestId("comp-load-public"));
    await screen.findByTestId("comp-public-section");
    fireEvent.click(screen.getByTestId("comp-reset"));
    expect(screen.queryByTestId("comp-public-section")).toBeNull();
    expect(screen.getByTestId("comp-init-identity")).toBeInTheDocument();
    initIdentity({ match: "mock-match-001", p1: "alice", p2: "bob", owner: "bob" });
    expect(screen.getByTestId("comp-identity-locked")).toHaveTextContent("owner is p2");
  });

  it("reversed lexical ids map correctly (identity by explicit ids, never order)", async () => {
    const env = publicEnv("public-first-submitted");
    env.payload.players = env.payload.players
      .map((p) => ({ ...p, player_id: p.player_id === "alice" ? "zed" : "adam" }))
      .sort((a, b) => (a.player_id < b.player_id ? -1 : 1)); // [adam, zed]
    mockRoutes({ public: async () => jsonResponse(env) });
    renderPanel();
    initIdentity({ p1: "zed", p2: "adam", owner: "zed" });
    fireEvent.click(screen.getByTestId("comp-load-public"));
    const section = await screen.findByTestId("comp-public-section");
    expect(section).toHaveTextContent(/p1 zed \(tank\).*submitted/);
    expect(section).toHaveTextContent(/p2 adam \(mage\).*thinking/);
  });
});

describe("public surface", () => {
  it("loads, renders neutral facts, and shows exactly one shared timer block", async () => {
    mockRoutes({ public: async () => jsonResponse(publicEnv("public-both-submitted")) });
    renderPanel();
    initIdentity();
    fireEvent.click(screen.getByTestId("comp-load-public"));
    const section = await screen.findByTestId("comp-public-section");
    expect(screen.getAllByTestId("comp-shared-timer")).toHaveLength(1);
    expect(section).toHaveTextContent("Shared timer: 20s");
    expect(section).toHaveTextContent(/p1 alice \(tank\) · HP 90 · 16 xp · Lv 1 · submitted/);
    expect(section).toHaveTextContent(/ability window locked \(no selection\)/);
    // Privacy + no per-player timers: nothing hidden renders here.
    for (const banned of [/tank\.fortify/i, /damage/i, /charge/i, /correct/i, /p1 timer/i, /p2 timer/i]) {
      expect(section.textContent).not.toMatch(banned);
    }
    expect(screen.getByTestId("comp-status-public")).toHaveTextContent("success");
  });

  it("public failure keeps private and resolved state (statuses independent)", async () => {
    mockRoutes({
      public: async () =>
        jsonResponse({ detail: { error_code: "ranked_duel_match_not_found", message: "nope" } }, 404),
    });
    const { dispatch } = renderPanel();
    initIdentity();
    fireEvent.click(screen.getByTestId("comp-load-private"));
    await screen.findByTestId("comp-private-section");
    fireEvent.click(screen.getByTestId("comp-load-resolved"));
    await screen.findByTestId("comp-resolved-history");
    fireEvent.click(screen.getByTestId("comp-load-public"));
    await waitFor(() =>
      expect(screen.getByTestId("comp-status-public")).toHaveTextContent(/match_not_found/),
    );
    expect(screen.getByTestId("comp-private-section")).toBeInTheDocument();
    expect(screen.getByTestId("comp-resolved-history")).toBeInTheDocument();
    expect(screen.getByTestId("comp-status-private")).toHaveTextContent("success");
    expect(screen.getByTestId("comp-status-resolved")).toHaveTextContent("success");
    expect(settledDispatches(dispatch)).toHaveLength(1); // history commit unaffected
  });

  it("a newer public request aborts the older one without touching other surfaces", async () => {
    const pending: Array<(r: Response) => void> = [];
    const { signals } = mockRoutes({
      public: () => new Promise<Response>((resolve) => pending.push(resolve)),
      private: () => new Promise<Response>(() => undefined), // stays in flight
    });
    renderPanel();
    initIdentity();
    fireEvent.click(screen.getByTestId("comp-load-private")); // pending private
    fireEvent.click(screen.getByTestId("comp-load-public")); // public #1
    fireEvent.click(screen.getByTestId("comp-load-public")); // public #2 supersedes
    await waitFor(() => expect(signals.public).toHaveLength(2));
    expect(signals.public[0].aborted).toBe(true); // prior public aborted
    expect(signals.public[1].aborted).toBe(false);
    expect(signals.private[0].aborted).toBe(false); // private untouched
    // Stale public #1 resolving later is ignored by the generation gate.
    pending[0](jsonResponse(publicEnv("public-match-over")));
    pending[1](jsonResponse(publicEnv("public-active-question")));
    const section = await screen.findByTestId("comp-public-section");
    expect(section).toHaveTextContent("active · round 3");
    expect(screen.getByTestId("comp-status-private")).toHaveTextContent("loading");
  });
});

describe("private surface", () => {
  it("renders owner-only fields and never copies them into the public section", async () => {
    mockRoutes({ private: async () => jsonResponse(privateEnv("private-max-level")) });
    renderPanel();
    initIdentity();
    fireEvent.click(screen.getByTestId("comp-load-public"));
    await screen.findByTestId("comp-public-section");
    fireEvent.click(screen.getByTestId("comp-load-private"));
    const section = await screen.findByTestId("comp-private-section");
    expect(section).toHaveTextContent("Private owner alice");
    expect(section).toHaveTextContent(/Level 2: made \(tank\.brace\)/);
    expect(section).toHaveTextContent(/Current charges: tank\.fortify 2/);
    // Opponent-private and resolved data absent from the private section.
    for (const banned of [/\bbob\b/, /opponent/i, /damage/i, /outcome/i]) {
      expect(section.textContent).not.toMatch(banned);
    }
    // Public section unchanged — no private identity leaked into it.
    const pub = screen.getByTestId("comp-public-section");
    expect(pub.textContent).not.toMatch(/tank\.fortify|tank\.brace|charges/i);
  });

  it("rejects an owner mismatch and preserves the sanitized player-not-found", async () => {
    // Envelope owner is alice; identity owner is bob -> validator rejects.
    mockRoutes({ private: async () => jsonResponse(privateEnv()) });
    renderPanel();
    initIdentity({ owner: "bob" });
    fireEvent.click(screen.getByTestId("comp-load-private"));
    await waitFor(() =>
      expect(screen.getByTestId("comp-status-private")).toHaveTextContent(
        /invalid_envelope.*owner "alice" does not match expected owner "bob"/,
      ),
    );
    expect(screen.queryByTestId("comp-private-section")).toBeNull();

    // Sanitized 404 stays verbatim.
    mockRoutes({
      private: async () =>
        jsonResponse(
          {
            detail: {
              error_code: "ranked_duel_player_not_found",
              message: "no such player in match mock-match-001",
            },
          },
          404,
        ),
    });
    fireEvent.click(screen.getByTestId("comp-load-private"));
    await waitFor(() =>
      expect(screen.getByTestId("comp-status-private")).toHaveTextContent(
        /player_not_found.*no such player in match mock-match-001/,
      ),
    );
  });

  it("a newer private request aborts only the prior private request; stale result ignored", async () => {
    const pending: Array<(r: Response) => void> = [];
    const { signals } = mockRoutes({
      private: () => new Promise<Response>((resolve) => pending.push(resolve)),
      resolved: () => new Promise<Response>(() => undefined),
    });
    renderPanel();
    initIdentity();
    fireEvent.click(screen.getByTestId("comp-load-resolved")); // pending resolved
    fireEvent.click(screen.getByTestId("comp-load-private")); // private #1
    fireEvent.click(screen.getByTestId("comp-load-private")); // private #2
    await waitFor(() => expect(signals.private).toHaveLength(2));
    expect(signals.private[0].aborted).toBe(true);
    expect(signals.resolved[0].aborted).toBe(false);
    pending[0](jsonResponse(privateEnv("private-max-level"))); // stale
    pending[1](jsonResponse(privateEnv("private-idle")));
    const section = await screen.findByTestId("comp-private-section");
    expect(section).toHaveTextContent(/Level 3: not yet/); // #2 (idle) state
    expect(section.textContent).not.toMatch(/tank\.barrier 1/); // not #1's max-level charges
  });
});

describe("resolved surface and settlement commit bridge", () => {
  it("commits an accepted settlement exactly once via APPLY_BACKEND_SETTLEMENT (Strict Mode safe)", async () => {
    mockRoutes({ resolved: async () => jsonResponse(resolvedEnv("plain-round")) });
    const dispatch = vi.fn<(a: DuelAction) => void>();
    renderPanel(dispatch, true); // StrictMode double-invokes render+effects
    initIdentity();
    fireEvent.click(screen.getByTestId("comp-load-resolved"));
    await screen.findByTestId("comp-resolved-history");
    // History row shows post-resolution facts through the exact adapter chain.
    const row = screen.getByTestId("comp-resolved-round-1");
    expect(row).toHaveTextContent(/p1 correct.*dealt 30 took 0/);
    expect(row).toHaveTextContent(/p2 incorrect.*took 30 HP 90→60/);
    expect(row).toHaveTextContent(/next shared 20s/);
    await waitFor(() => expect(settledDispatches(dispatch)).toHaveLength(1));
    const action = settledDispatches(dispatch)[0][0] as Extract<
      DuelAction,
      { type: "APPLY_BACKEND_SETTLEMENT" }
    >;
    expect(action.settlement.players.p2.finalDamageReceived).toBe(30);

    // Duplicate load of the same round: reducer ignores it; no redispatch.
    fireEvent.click(screen.getByTestId("comp-load-resolved"));
    await waitFor(() => expect(screen.getByTestId("comp-status-resolved")).toHaveTextContent("gen 2"));
    expect(settledDispatches(dispatch)).toHaveLength(1);
  });

  it("an older resolved round after a newer accepted round does not dispatch", async () => {
    let round = "carryover-consumed"; // round 2
    mockRoutes({ resolved: async () => jsonResponse(resolvedEnv(round)) });
    const { dispatch } = renderPanel();
    initIdentity();
    setValue("comp-round-number", "2");
    fireEvent.click(screen.getByTestId("comp-load-resolved"));
    await screen.findByTestId("comp-resolved-round-2");
    await waitFor(() => expect(settledDispatches(dispatch)).toHaveLength(1));
    round = "plain-round"; // round 1 — older
    setValue("comp-round-number", "1");
    fireEvent.click(screen.getByTestId("comp-load-resolved"));
    await waitFor(() => expect(screen.getByTestId("comp-status-resolved")).toHaveTextContent("gen 2"));
    expect(screen.queryByTestId("comp-resolved-round-1")).toBeNull();
    expect(settledDispatches(dispatch)).toHaveLength(1); // no second commit
  });

  it("stale/aborted/malformed/409 resolved responses never dispatch", async () => {
    // Stale generation: two rapid requests, older resolves later.
    const pending: Array<(r: Response) => void> = [];
    const { signals } = mockRoutes({
      resolved: () => new Promise<Response>((resolve) => pending.push(resolve)),
    });
    const { dispatch, unmount } = renderPanel();
    initIdentity();
    fireEvent.click(screen.getByTestId("comp-load-resolved"));
    fireEvent.click(screen.getByTestId("comp-load-resolved"));
    await waitFor(() => expect(signals.resolved).toHaveLength(2));
    expect(signals.resolved[0].aborted).toBe(true); // prior resolved aborted
    pending[0](jsonResponse(resolvedEnv("plain-round"))); // stale — ignored
    await new Promise((r) => setTimeout(r, 10));
    expect(settledDispatches(dispatch)).toHaveLength(0);

    // Unmount before the current request completes: no commit.
    unmount();
    pending[1](jsonResponse(resolvedEnv("plain-round")));
    await new Promise((r) => setTimeout(r, 10));
    expect(settledDispatches(dispatch)).toHaveLength(0);

    // Malformed envelope: extra transport field — validator rejects, no commit.
    const bad = resolvedEnv("plain-round") as unknown as Record<string, unknown>;
    bad.event_id = "evt-1";
    mockRoutes({ resolved: async () => jsonResponse(bad) });
    const second = renderPanel();
    initIdentity();
    fireEvent.click(screen.getByTestId("comp-load-resolved"));
    await waitFor(() =>
      expect(screen.getByTestId("comp-status-resolved")).toHaveTextContent(/invalid_envelope/),
    );
    expect(settledDispatches(second.dispatch)).toHaveLength(0);
    expect(screen.queryByTestId("comp-resolved-history")).toBeNull();
    second.unmount();

    // 409 round-not-resolved: waiting state; public/private retained.
    mockRoutes({
      resolved: async () =>
        jsonResponse(
          { detail: { error_code: "ranked_duel_round_not_resolved", message: "not yet" } },
          409,
        ),
    });
    const third = renderPanel();
    initIdentity();
    fireEvent.click(screen.getByTestId("comp-load-public"));
    await screen.findByTestId("comp-public-section");
    fireEvent.click(screen.getByTestId("comp-load-resolved"));
    await waitFor(() =>
      expect(screen.getByTestId("comp-status-resolved")).toHaveTextContent(/round_not_resolved/),
    );
    expect(screen.getByTestId("comp-public-section")).toBeInTheDocument();
    expect(settledDispatches(third.dispatch)).toHaveLength(0);
  });

  it("renders terminal winner and simultaneous-knockout draw rows", async () => {
    let key = "match-over";
    mockRoutes({ resolved: async () => jsonResponse(resolvedEnv(key)) });
    renderPanel();
    initIdentity();
    setValue("comp-round-number", "3");
    fireEvent.click(screen.getByTestId("comp-load-resolved"));
    const row = await screen.findByTestId("comp-resolved-round-3");
    expect(row).toHaveTextContent(/MATCH OVER \(knockout\) winner p1/);

    key = "double-knockout";
    fireEvent.click(screen.getByTestId("comp-reset"));
    initIdentity();
    setValue("comp-round-number", "3");
    fireEvent.click(screen.getByTestId("comp-load-resolved"));
    await waitFor(() =>
      expect(screen.getByTestId("comp-resolved-round-3")).toHaveTextContent(
        /MATCH OVER \(simultaneous_knockout\) winner draw/,
      ),
    );
  });

  it("reset clears commit tracking together with the composition", async () => {
    mockRoutes({ resolved: async () => jsonResponse(resolvedEnv("plain-round")) });
    const { dispatch } = renderPanel();
    initIdentity();
    fireEvent.click(screen.getByTestId("comp-load-resolved"));
    await waitFor(() => expect(settledDispatches(dispatch)).toHaveLength(1));
    fireEvent.click(screen.getByTestId("comp-reset"));
    initIdentity();
    fireEvent.click(screen.getByTestId("comp-load-resolved"));
    // Fresh composition, fresh tracking: the same round commits again.
    await waitFor(() => expect(settledDispatches(dispatch)).toHaveLength(2));
  });
});

describe("cross-surface composition", () => {
  it("historical resolved rows stay immutable when later private/public state differs", async () => {
    mockRoutes({
      resolved: async () => jsonResponse(resolvedEnv("charge-consumed")), // round 1
      private: async () => {
        const env = privateEnv("private-max-level"); // different current charges
        env.round_number = 2;
        env.payload.active_round!.round_number = 2;
        return jsonResponse(env);
      },
      public: async () => {
        const env = publicEnv("public-active-question");
        env.round_number = 2;
        env.payload.active_round!.round_number = 2;
        env.payload.players[0].hp = 55; // later public HP differs
        return jsonResponse(env);
      },
    });
    renderPanel();
    initIdentity();
    fireEvent.click(screen.getByTestId("comp-load-resolved"));
    const row = await screen.findByTestId("comp-resolved-round-1");
    const historical = row.textContent;
    expect(historical).toMatch(/snapshot\[tank\.fortify 2, tank\.brace 2\]/);
    fireEvent.click(screen.getByTestId("comp-load-private"));
    await screen.findByTestId("comp-private-section");
    fireEvent.click(screen.getByTestId("comp-load-public"));
    await screen.findByTestId("comp-public-section");
    // The historical row did not change: not re-read from current state.
    expect(screen.getByTestId("comp-resolved-round-1").textContent).toBe(historical);
    expect(screen.getByTestId("comp-private-section")).toHaveTextContent(/tank\.barrier 1/);
  });

  it("warns on a public/private round mismatch instead of merging them", async () => {
    mockRoutes({
      public: async () => {
        const env = publicEnv("public-active-question");
        env.round_number = 4;
        env.payload.active_round!.round_number = 4;
        return jsonResponse(env);
      },
      private: async () => jsonResponse(privateEnv()), // round 3
    });
    renderPanel();
    initIdentity();
    fireEvent.click(screen.getByTestId("comp-load-public"));
    await screen.findByTestId("comp-public-section");
    fireEvent.click(screen.getByTestId("comp-load-private"));
    await screen.findByTestId("comp-private-section");
    expect(screen.getByTestId("comp-round-mismatch")).toHaveTextContent(
      /public round 4 and private round 3 disagree/,
    );
  });

  it("terminal resolved state prevents stale active public state from becoming current", async () => {
    mockRoutes({
      resolved: async () => jsonResponse(resolvedEnv("match-over")), // round 3, terminal
      public: async () => {
        const env = publicEnv("public-active-question"); // still claims active
        env.round_number = 4;
        env.payload.active_round!.round_number = 4;
        return jsonResponse(env);
      },
    });
    renderPanel();
    initIdentity();
    setValue("comp-round-number", "3");
    fireEvent.click(screen.getByTestId("comp-load-resolved"));
    await screen.findByTestId("comp-resolved-round-3");
    fireEvent.click(screen.getByTestId("comp-load-public"));
    // The reducer silently ignores the stale "active" claim (status remains
    // pending) — the important fact is that it never became current state.
    await new Promise((r) => setTimeout(r, 25));
    expect(screen.queryByTestId("comp-public-section")).toBeNull();
    expect(screen.getByTestId("comp-status-public")).toHaveTextContent(/loading/);
    expect(screen.getByTestId("comp-resolved-round-3")).toBeInTheDocument();
  });
});
