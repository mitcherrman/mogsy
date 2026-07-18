import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ApiPublicRoundLoader } from "./ApiPublicRoundLoader";
import { getPublicEnvelopeScenario } from "@/lib/ranked-core/transport/rankedDuelEnvelopeFixtures";

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const envelope = (key: string) => clone(getPublicEnvelopeScenario(key)!.envelope);

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
  setValue("public-api-match-id", "mock-match-001");
  setValue("public-api-p1-id", "alice");
  setValue("public-api-p2-id", "bob");
};

describe("ApiPublicRoundLoader", () => {
  it("loads and renders the adapted public projection read-only", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(envelope("public-both-submitted"))),
    );
    render(<ApiPublicRoundLoader />);
    fillIdentity();
    fireEvent.click(screen.getByTestId("public-api-load"));
    const summary = await screen.findByTestId("public-round-summary");
    // Pass-through public facts with explicit p1/p2 mapping.
    expect(summary).toHaveTextContent(/p1 alice \(tank\) · HP 90 · 16 xp · Lv 1 · submitted/);
    expect(summary).toHaveTextContent(/p2 bob \(mage\).*submitted/);
    expect(summary).toHaveTextContent(/ability window locked \(selection made\)/);
    expect(summary).toHaveTextContent(/ability window locked \(no selection\)/);
    // ONE shared timer, displayed verbatim.
    expect(summary).toHaveTextContent("Shared round timer: 20s");
    expect(summary).toHaveTextContent("Next round shared timer: 20s");
    // Privacy: nothing hidden is rendered.
    for (const banned of [/tank\.fortify/i, /damage/i, /charge/i, /correct/i, /answer/i]) {
      expect(summary.textContent).not.toMatch(banned);
    }
  });

  it("renders public match-over state including a winner", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(envelope("public-match-over"))));
    render(<ApiPublicRoundLoader />);
    fillIdentity();
    fireEvent.click(screen.getByTestId("public-api-load"));
    const summary = await screen.findByTestId("public-round-summary");
    expect(summary).toHaveTextContent(/match over \(knockout\) — winner: p1/);
    expect(summary).toHaveTextContent("No active round.");
  });

  it("requires explicit player ids before fetching", async () => {
    const fn = vi.fn(async () => jsonResponse(envelope("public-active-question")));
    vi.stubGlobal("fetch", fn);
    render(<ApiPublicRoundLoader />);
    setValue("public-api-match-id", "mock-match-001");
    fireEvent.click(screen.getByTestId("public-api-load"));
    expect(await screen.findByTestId("public-api-status")).toHaveTextContent(
      /player ids .* required/i,
    );
    expect(fn).not.toHaveBeenCalled();
  });

  it("shows a dev-facing backend error state without any fixture fallback", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(
          { detail: { error_code: "ranked_duel_no_active_round", message: "none" } },
          409,
        ),
      ),
    );
    render(<ApiPublicRoundLoader />);
    fillIdentity();
    fireEvent.click(screen.getByTestId("public-api-load"));
    await waitFor(() =>
      expect(screen.getByTestId("public-api-status")).toHaveTextContent(
        /no_active_round.*ranked_duel_no_active_round.*none/,
      ),
    );
    expect(screen.queryByTestId("public-round-summary")).toBeNull();
  });

  it("disables the load control while a request is in flight", async () => {
    let release: (r: Response) => void = () => undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>((resolve) => (release = resolve))),
    );
    render(<ApiPublicRoundLoader />);
    fillIdentity();
    const button = screen.getByTestId("public-api-load");
    fireEvent.click(button);
    await waitFor(() => expect(button).toBeDisabled());
    fireEvent.click(button); // ignored while disabled
    release(jsonResponse(envelope("public-active-question")));
    await waitFor(() => expect(button).not.toBeDisabled());
    expect(screen.getByTestId("public-round-summary")).toBeInTheDocument();
  });

  it("a stale in-flight response is dropped once superseded (unmount guard)", async () => {
    const pending: Array<(r: Response) => void> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>((resolve) => pending.push(resolve))),
    );
    const { unmount } = render(<ApiPublicRoundLoader />);
    fillIdentity();
    fireEvent.click(screen.getByTestId("public-api-load"));
    expect(pending).toHaveLength(1);
    unmount(); // bumps generation and aborts — the response is now stale
    pending[0](jsonResponse(envelope("public-active-question")));
    await new Promise((r) => setTimeout(r, 10));
    // No render target exists; the guard prevented post-unmount state writes
    // (React would log a console error otherwise — asserted globally below).
    expect(document.querySelector('[data-testid="public-round-summary"]')).toBeNull();
  });
});
