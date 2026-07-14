import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ApiResolvedRoundLoader } from "./ApiResolvedRoundLoader";
import { getResolvedEnvelopeScenario } from "../transport-adapter/rankedDuelEnvelopeFixtures";
import { DuelAction } from "../duelMachine";

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const envelope = (key: string) => clone(getResolvedEnvelopeScenario(key)!.envelope);

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

afterEach(() => {
  vi.unstubAllGlobals();
});

const setValue = (testId: string, value: string) =>
  fireEvent.change(screen.getByTestId(testId), { target: { value } });

const fillIdentity = () => {
  setValue("api-match-id", "mock-match-001");
  setValue("api-p1-id", "alice");
  setValue("api-p2-id", "bob");
};

describe("ApiResolvedRoundLoader", () => {
  it("loads, adapts with the explicit id mapping, and dispatches APPLY_BACKEND_SETTLEMENT", async () => {
    const env = envelope("shield-plus-reduction");
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(env)));
    const dispatch = vi.fn<(a: DuelAction) => void>();
    render(<ApiResolvedRoundLoader dispatch={dispatch} />);
    fillIdentity();
    fireEvent.click(screen.getByTestId("api-load-resolved"));
    await waitFor(() => expect(dispatch).toHaveBeenCalledTimes(1));
    const action = dispatch.mock.calls[0][0];
    expect(action.type).toBe("APPLY_BACKEND_SETTLEMENT"); // existing action, unchanged
    if (action.type === "APPLY_BACKEND_SETTLEMENT") {
      expect(action.settlement.players.p1.playerId).toBe("alice");
      expect(action.settlement.players.p2.finalDamageReceived).toBe(20); // pass-through
    }
    expect(screen.getByTestId("api-load-status")).toHaveTextContent(/Loaded mock-match-001/);
  });

  it("requires explicit player ids before fetching", async () => {
    const fn = vi.fn(async () => jsonResponse(envelope("solo-correct")));
    vi.stubGlobal("fetch", fn);
    render(<ApiResolvedRoundLoader dispatch={vi.fn()} />);
    setValue("api-match-id", "mock-match-001");
    fireEvent.click(screen.getByTestId("api-load-resolved"));
    expect(await screen.findByTestId("api-load-status")).toHaveTextContent(
      /player ids .* required/i,
    );
    expect(fn).not.toHaveBeenCalled();
  });

  it("shows a dev-facing backend error state without fixture fallback", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(
          { detail: { error_code: "ranked_duel_round_not_resolved", message: "not yet" } },
          409,
        ),
      ),
    );
    const dispatch = vi.fn();
    render(<ApiResolvedRoundLoader dispatch={dispatch} />);
    fillIdentity();
    fireEvent.click(screen.getByTestId("api-load-resolved"));
    await waitFor(() =>
      expect(screen.getByTestId("api-load-status")).toHaveTextContent(
        /round_not_resolved.*ranked_duel_round_not_resolved.*not yet/,
      ),
    );
    expect(dispatch).not.toHaveBeenCalled(); // no silent fixture fallback
  });

  it("disables the load control while a request is in flight (no duplicate apply)", async () => {
    let release: (r: Response) => void = () => undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>((resolve) => (release = resolve))),
    );
    const dispatch = vi.fn();
    render(<ApiResolvedRoundLoader dispatch={dispatch} />);
    fillIdentity();
    const button = screen.getByTestId("api-load-resolved");
    fireEvent.click(button);
    await waitFor(() => expect(button).toBeDisabled());
    fireEvent.click(button); // ignored while disabled
    release(jsonResponse(envelope("solo-correct")));
    await waitFor(() => expect(dispatch).toHaveBeenCalledTimes(1));
    expect(button).not.toBeDisabled();
  });

  it("a stale in-flight response is dropped once its generation is superseded", async () => {
    // Overlapping requests are prevented by the disabled control (test
    // above); the generation counter additionally drops any response whose
    // request was invalidated — unmount exercises that exact guard.
    const pending: Array<(r: Response) => void> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>((resolve) => pending.push(resolve))),
    );
    const dispatch = vi.fn<(a: DuelAction) => void>();
    const { unmount } = render(<ApiResolvedRoundLoader dispatch={dispatch} />);
    fillIdentity();
    fireEvent.click(screen.getByTestId("api-load-resolved")); // request #1
    expect(pending).toHaveLength(1);
    unmount(); // bumps the generation and aborts — request #1 is now stale
    pending[0](jsonResponse(envelope("match-over")));
    await new Promise((r) => setTimeout(r, 10));
    expect(dispatch).not.toHaveBeenCalled(); // never applied after staleness
  });
});
