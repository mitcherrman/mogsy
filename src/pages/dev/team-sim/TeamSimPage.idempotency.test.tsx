/**
 * SIM2 Phase 4C — the idempotency key's life on the page.
 *
 * The question every test here answers is "what went on the wire?", because
 * that is the only place the guarantee lives. The harness records every fetch
 * with its headers, so key identity across attempts is asserted against the
 * actual requests rather than against component state.
 *
 * Kept separate from TeamSimPage.test.tsx so the Phase 4B submission-safety
 * suite stays exactly as it was: idempotency is defense in depth, and the
 * guards it sits behind must not be relaxed to make room for it.
 */
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  REAL_1V1,
  REAL_ERRORS,
  REAL_REPLAY_PAIR,
} from "@/lib/combat-lab/team-sim/__fixtures__";
import { IDEMPOTENCY_HEADER } from "@/lib/combat-lab/team-sim/contract";

import { renderTeamSimPage, type TeamSimHarness } from "./testHarness";

vi.mock("@/lib/backend-auth", () => ({
  getBackendAuthHeaders: async () => ({ Authorization: "Bearer test-token" }),
  ensureBackendAuthToken: async () => "test-token",
}));

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllGlobals());

vi.setConfig({ testTimeout: 45_000, hookTimeout: 45_000 });

const FIND = { timeout: 8_000 };

async function loadedPage(options = {}) {
  const rendered = renderTeamSimPage(options);
  await screen.findByTestId("run-panel", {}, FIND);
  return rendered;
}

function runButton() {
  return screen.getByTestId("run-simulation");
}

async function clickRun() {
  await act(async () => {
    runButton().click();
  });
}

async function clickRecover() {
  const button = await screen.findByTestId("recover-request", {}, FIND);
  await act(async () => {
    button.click();
  });
}

/** The Idempotency-Key each simulation POST actually carried. */
function sentKeys(harness: TeamSimHarness): string[] {
  return harness.postCalls.map((call) => {
    const headers = call.headers as Record<string, string>;
    const name = Object.keys(headers).find(
      (key) => key.toLowerCase() === IDEMPOTENCY_HEADER.toLowerCase()
    );
    return name ? headers[name] : "";
  });
}

/** The parsed body each simulation POST carried. */
function sentBodies(harness: TeamSimHarness): unknown[] {
  return harness.postCalls.map((call) => JSON.parse(String(call.body)));
}

// =========================================================================
// Key generation
// =========================================================================

describe("key generation", () => {
  it("sends exactly one key with the POST for one explicit click", async () => {
    const { harness } = await loadedPage({ simulate: [{ status: 200, body: REAL_1V1 }] });
    await clickRun();
    await waitFor(() => expect(harness.postCalls).toHaveLength(1));

    const [key] = sentKeys(harness);
    expect(key).toBeTruthy();
    expect(key).toMatch(/^[!-~]+$/);
    expect(key.length).toBeLessThanOrEqual(128);
  });

  it("mints a NEW key for each explicit new run", async () => {
    const { harness } = await loadedPage({ simulate: [{ status: 200, body: REAL_1V1 }] });
    await clickRun();
    await waitFor(() => expect(harness.postCalls).toHaveLength(1));
    await clickRun();
    await waitFor(() => expect(harness.postCalls).toHaveLength(2));

    const keys = sentKeys(harness);
    // Two deliberate runs of the same scenario are two paid requests. Reusing
    // the key would silently replay the first and charge nothing — which is
    // NOT what the operator asked for.
    expect(keys[0]).not.toBe(keys[1]);
    expect(sentBodies(harness)[0]).toEqual(sentBodies(harness)[1]);
  });

  it("mints a new key after an edit, so a changed body never reuses one", async () => {
    const { harness } = await loadedPage({ simulate: [{ status: 200, body: REAL_1V1 }] });
    await clickRun();
    await waitFor(() => expect(harness.postCalls).toHaveLength(1));

    await act(async () => {
      fireEvent.change(screen.getByLabelText("A1 level"), { target: { value: "9" } });
    });
    await clickRun();
    await waitFor(() => expect(harness.postCalls).toHaveLength(2));

    const keys = sentKeys(harness);
    expect(keys[0]).not.toBe(keys[1]);
    expect(sentBodies(harness)[0]).not.toEqual(sentBodies(harness)[1]);
  });

  it("still sends only ONE POST for a double click", async () => {
    // The Phase 4B guard, re-asserted here: idempotency must not become an
    // excuse to relax it. One click, one request — the key is the second line
    // of defense, not the first.
    const gate = new Promise<void>((resolve) => setTimeout(resolve, 30));
    const { harness } = await loadedPage({
      simulate: [{ status: 200, body: REAL_1V1, gate }],
    });
    const button = runButton();
    await act(async () => {
      button.click();
      button.click();
    });
    await waitFor(() => expect(harness.postCalls).toHaveLength(1));
    expect(new Set(sentKeys(harness)).size).toBe(1);
  });
});

// =========================================================================
// Recovery of an uncertain request
// =========================================================================

describe("recovering an uncertain request", () => {
  it("offers a recovery action when the outcome is unknown", async () => {
    await loadedPage({
      simulate: [{ status: 0, throws: new TypeError("Failed to fetch") }],
    });
    await clickRun();
    await screen.findByTestId("failure-notice", {}, FIND);
    expect(screen.getByTestId("uncertain-warning")).toBeInTheDocument();
    expect(screen.getByTestId("recover-request")).toBeInTheDocument();
  });

  it("resends the SAME key and the SAME body when recovering", async () => {
    const { harness } = await loadedPage({
      simulate: [
        { status: 0, throws: new TypeError("Failed to fetch") },
        {
          status: 200,
          body: REAL_REPLAY_PAIR.replayed,
          headers: { "idempotency-replayed": "true" },
        },
      ],
    });
    await clickRun();
    await screen.findByTestId("failure-notice", {}, FIND);
    await clickRecover();
    await waitFor(() => expect(harness.postCalls).toHaveLength(2));

    const keys = sentKeys(harness);
    const bodies = sentBodies(harness);
    // This is the whole point: identical key + identical bytes is the only
    // combination the backend replays instead of charging again.
    expect(keys[1]).toBe(keys[0]);
    expect(bodies[1]).toEqual(bodies[0]);
  });

  it("renders a replayed success as a full result, and SAYS it was replayed", async () => {
    await loadedPage({
      simulate: [
        { status: 0, throws: new TypeError("Failed to fetch") },
        {
          status: 200,
          body: REAL_REPLAY_PAIR.replayed,
          headers: { "idempotency-replayed": "true" },
        },
      ],
    });
    await clickRun();
    await screen.findByTestId("failure-notice", {}, FIND);
    await clickRecover();

    await screen.findByTestId("result-workspace", {}, FIND);
    expect(screen.queryByTestId("failure-notice")).not.toBeInTheDocument();
    // "I collected the result I already paid for" and "I bought another one"
    // must not look the same — that ambiguity is what the key exists to remove.
    expect(screen.getByTestId("replayed-result-banner")).toHaveTextContent(
      /no credits were spent/i
    );
  });

  it("does not claim a replay when the server ran a fresh simulation", async () => {
    await loadedPage({
      simulate: [
        {
          status: 200,
          body: REAL_REPLAY_PAIR.first,
          headers: { "idempotency-replayed": "false" },
        },
      ],
    });
    await clickRun();
    await screen.findByTestId("result-workspace", {}, FIND);
    expect(screen.queryByTestId("replayed-result-banner")).not.toBeInTheDocument();
  });

  it("keeps the key stable across repeated recovery attempts", async () => {
    const { harness } = await loadedPage({
      simulate: [
        { status: 0, throws: new TypeError("Failed to fetch") },
        { status: 0, throws: new TypeError("Failed to fetch") },
        { status: 0, throws: new TypeError("Failed to fetch") },
      ],
    });
    await clickRun();
    await screen.findByTestId("failure-notice", {}, FIND);
    await clickRecover();
    await waitFor(() => expect(harness.postCalls).toHaveLength(2));
    await clickRecover();
    await waitFor(() => expect(harness.postCalls).toHaveLength(3));

    // An unresolved logical request keeps ONE identity for as long as it takes
    // to find out what happened to it.
    expect(new Set(sentKeys(harness)).size).toBe(1);
  });

  it("does not offer recovery for a rejection the operator must fix first", async () => {
    // 402: the server proved the simulation did not run. Re-sending the same
    // bytes would just repeat the same answer.
    await loadedPage({ simulate: [{ status: 402, body: REAL_ERRORS[402] }] });
    await clickRun();
    await screen.findByTestId("failure-notice", {}, FIND);
    expect(screen.getByTestId("rejected-note")).toBeInTheDocument();
    expect(screen.queryByTestId("recover-request")).not.toBeInTheDocument();
  });

  it("starts a NEW request, with a new key, when the operator runs again after a failure", async () => {
    const { harness } = await loadedPage({
      simulate: [
        { status: 0, throws: new TypeError("Failed to fetch") },
        { status: 200, body: REAL_1V1 },
      ],
    });
    await clickRun();
    await screen.findByTestId("failure-notice", {}, FIND);
    await clickRun();
    await waitFor(() => expect(harness.postCalls).toHaveLength(2));

    const keys = sentKeys(harness);
    // Run is "simulate this scenario", not "find out what happened" — so it
    // deliberately does NOT inherit the uncertain request's identity.
    expect(keys[1]).not.toBe(keys[0]);
  });
});

// =========================================================================
// Conflict and in-progress
// =========================================================================

describe("idempotency responses", () => {
  it("surfaces a 409 conflict with its stable code", async () => {
    await loadedPage({ simulate: [{ status: 409, body: REAL_ERRORS[409] }] });
    await clickRun();
    const notice = await screen.findByTestId("failure-notice", {}, FIND);
    expect(notice).toHaveTextContent("HTTP 409");
    expect(notice).toHaveTextContent("idempotency_conflict");
    // A conflict is a proven non-execution; recovering it would be pointless.
    expect(screen.queryByTestId("recover-request")).not.toBeInTheDocument();
  });

  it("treats in-progress as 'ask again', not as 'nothing happened'", async () => {
    await loadedPage({
      simulate: [{ status: 409, body: REAL_ERRORS["409_in_progress"] }],
    });
    await clickRun();
    await screen.findByTestId("failure-notice", {}, FIND);
    // The ORIGINAL request may well be charging right now, so the "server
    // rejected this before the simulation ran" note must not appear.
    expect(screen.queryByTestId("rejected-note")).not.toBeInTheDocument();
    expect(screen.getByTestId("in-progress-note")).toBeInTheDocument();
    expect(screen.getByTestId("recover-request")).toBeInTheDocument();
  });

  it("collects the result when a previously in-progress request finishes", async () => {
    const { harness } = await loadedPage({
      simulate: [
        { status: 409, body: REAL_ERRORS["409_in_progress"] },
        {
          status: 200,
          body: REAL_REPLAY_PAIR.replayed,
          headers: { "idempotency-replayed": "true" },
        },
      ],
    });
    await clickRun();
    await screen.findByTestId("failure-notice", {}, FIND);
    await clickRecover();
    await screen.findByTestId("result-workspace", {}, FIND);
    expect(new Set(sentKeys(harness)).size).toBe(1);
  });

  it("surfaces the fail-closed 503 as a rejection, not an unknown", async () => {
    await loadedPage({ simulate: [{ status: 503, body: REAL_ERRORS[503] }] });
    await clickRun();
    const notice = await screen.findByTestId("failure-notice", {}, FIND);
    expect(notice).toHaveTextContent("HTTP 503");
    // The backend documents this one as "nothing ran, nothing was charged".
    expect(screen.getByTestId("rejected-note")).toBeInTheDocument();
    expect(screen.queryByTestId("uncertain-warning")).not.toBeInTheDocument();
  });

  it("never tells the operator nothing was charged on an unidentified 503", async () => {
    // A proxy or a cold start, not the endpoint. Same status, no code — and
    // the opposite fact about money, so the confident copy must not leak here.
    await loadedPage({
      simulate: [{ status: 503, body: { detail: "upstream unavailable" } }],
    });
    await clickRun();
    const notice = await screen.findByTestId("failure-notice", {}, FIND);
    expect(notice).not.toHaveTextContent(/nothing was charged/i);
    expect(screen.getByTestId("uncertain-warning")).toBeInTheDocument();
    expect(screen.getByTestId("recover-request")).toBeInTheDocument();
  });

  it("says a damaged stored result WAS charged, and offers no pointless retry", async () => {
    await loadedPage({
      simulate: [{ status: 503, body: REAL_ERRORS["503_unreadable"] }],
    });
    await clickRun();
    const notice = await screen.findByTestId("failure-notice", {}, FIND);
    expect(notice).toHaveTextContent(/charged/i);
    expect(notice).not.toHaveTextContent(/nothing was charged/i);
    // Checking again would fail identically until the record expires.
    expect(screen.queryByTestId("recover-request")).not.toBeInTheDocument();
  });

  it("does not blame the idempotency key for a generic 400", async () => {
    await loadedPage({
      simulate: [
        { status: 400, body: { detail: "There was an error parsing the body" } },
      ],
    });
    await clickRun();
    const notice = await screen.findByTestId("failure-notice", {}, FIND);
    expect(notice).not.toHaveTextContent(/identifier/i);
    expect(notice).toHaveTextContent("Scenario rejected");
  });
});

// =========================================================================
// No automatic anything
// =========================================================================

describe("nothing retries on its own", () => {
  it("makes no POST until a click, and none after a failure", async () => {
    const { harness } = await loadedPage({
      simulate: [{ status: 0, throws: new TypeError("Failed to fetch") }],
    });
    expect(harness.postCalls).toHaveLength(0);

    await clickRun();
    await screen.findByTestId("failure-notice", {}, FIND);

    // Give the query client every chance to do something clever.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 120));
    });
    expect(harness.postCalls).toHaveLength(1);
  });

  it("does not resend when the catalog is refreshed after a failure", async () => {
    const { harness } = await loadedPage({
      simulate: [{ status: 0, throws: new TypeError("Failed to fetch") }],
    });
    await clickRun();
    await screen.findByTestId("failure-notice", {}, FIND);

    await act(async () => {
      screen.getByText(/Refresh catalog/i).click();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 120));
    });
    expect(harness.postCalls).toHaveLength(1);
    expect(screen.getByTestId("recover-request")).toBeInTheDocument();
  });
});
