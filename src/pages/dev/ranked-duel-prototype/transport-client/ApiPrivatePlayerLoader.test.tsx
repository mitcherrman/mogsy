import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ApiPrivatePlayerLoader } from "./ApiPrivatePlayerLoader";
import { getPrivateEnvelopeScenario } from "@/lib/ranked-core/transport/rankedDuelEnvelopeFixtures";

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const envelope = (key: string) => clone(getPrivateEnvelopeScenario(key)!.envelope);

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

const fillInputs = (playerId = "alice") => {
  setValue("private-api-match-id", "mock-match-001");
  setValue("private-api-player-id", playerId);
};

describe("ApiPrivatePlayerLoader", () => {
  it("renders ONLY owner-scoped private state after a successful load", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(envelope("private-max-level"))));
    render(<ApiPrivatePlayerLoader />);
    fillInputs();
    fireEvent.click(screen.getByTestId("private-api-load"));
    const summary = await screen.findByTestId("private-player-summary");
    expect(summary).toHaveTextContent("Owner alice · mock-match-001 · round 3");
    expect(summary).toHaveTextContent(/Unlocked: tank\.fortify, tank\.brace, tank\.barrier/);
    expect(summary).toHaveTextContent(/Level 2 choice: made \(tank\.brace\)/);
    expect(summary).toHaveTextContent(/Level 3 final unlock: tank\.barrier/);
    expect(summary).toHaveTextContent(
      /Remaining charges: tank\.fortify 2 · tank\.brace 2 · tank\.barrier 1/,
    );
    expect(summary).toHaveTextContent(/streak 2 correct/);
    // ONE shared timer, displayed verbatim.
    expect(summary).toHaveTextContent(/Shared deadline: 2026-07-13T12:00:20\+00:00/);
    expect(summary).toHaveTextContent(/next round shared timer: 20s/);
    // Nothing about the opponent, damage, or correctness is rendered.
    for (const banned of [/\bbob\b/i, /opponent/i, /damage/i, /outcome/i, /winner/i]) {
      expect(summary.textContent).not.toMatch(banned);
    }
  });

  it("presents a null selected ability as an intentional state", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(envelope("private-locked-no-ability"))),
    );
    render(<ApiPrivatePlayerLoader />);
    fillInputs();
    fireEvent.click(screen.getByTestId("private-api-load"));
    const summary = await screen.findByTestId("private-player-summary");
    expect(summary).toHaveTextContent(/ability window locked/);
    expect(summary).toHaveTextContent(/selected ability: none \(no active ability\)/);
    expect(summary).toHaveTextContent(/Answer: submitted/);
  });

  it("rejects an owner mismatch (envelope owner differs from requested id)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(envelope("private-idle")))); // owner alice
    render(<ApiPrivatePlayerLoader />);
    fillInputs("bob");
    fireEvent.click(screen.getByTestId("private-api-load"));
    await waitFor(() =>
      expect(screen.getByTestId("private-api-status")).toHaveTextContent(
        /owner "alice" does not match expected owner "bob"/,
      ),
    );
    expect(screen.queryByTestId("private-player-summary")).toBeNull();
  });

  it("shows the backend's sanitized player-not-found message verbatim", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(
          {
            detail: {
              error_code: "ranked_duel_player_not_found",
              message: "no such player in match mock-match-001",
            },
          },
          404,
        ),
      ),
    );
    render(<ApiPrivatePlayerLoader />);
    fillInputs("mallory");
    fireEvent.click(screen.getByTestId("private-api-load"));
    await waitFor(() =>
      expect(screen.getByTestId("private-api-status")).toHaveTextContent(
        /player_not_found \(ranked_duel_player_not_found\): no such player in match mock-match-001/,
      ),
    );
  });

  it("disables the load control while a request is in flight", async () => {
    let release: (r: Response) => void = () => undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>((resolve) => (release = resolve))),
    );
    render(<ApiPrivatePlayerLoader />);
    fillInputs();
    const button = screen.getByTestId("private-api-load");
    fireEvent.click(button);
    await waitFor(() => expect(button).toBeDisabled());
    fireEvent.click(button); // ignored while disabled
    release(jsonResponse(envelope("private-idle")));
    await waitFor(() => expect(button).not.toBeDisabled());
    expect(screen.getByTestId("private-player-summary")).toBeInTheDocument();
  });

  it("a stale in-flight response is dropped once superseded (unmount guard)", async () => {
    const pending: Array<(r: Response) => void> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>((resolve) => pending.push(resolve))),
    );
    const { unmount } = render(<ApiPrivatePlayerLoader />);
    fillInputs();
    fireEvent.click(screen.getByTestId("private-api-load"));
    expect(pending).toHaveLength(1);
    unmount(); // bumps generation and aborts — the response is now stale
    pending[0](jsonResponse(envelope("private-idle")));
    await new Promise((r) => setTimeout(r, 10));
    expect(document.querySelector('[data-testid="private-player-summary"]')).toBeNull();
  });
});
