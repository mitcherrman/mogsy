/**
 * SIM2 Phase 4E — server-side recovery discovery, at the page.
 *
 * The flagship is "browser loss": a completed simulation, a browser that kept
 * nothing, and a result collected anyway — from a list the server produced, by
 * one explicit click, with zero simulation POSTs anywhere in the transcript.
 *
 * Everything else exists to make sure nothing ELSE happens. The recurring
 * assertion is `harness.postCalls` — the billable endpoint — being empty. This
 * whole surface is about a request that has already been paid for, so a single
 * simulation POST leaking out of it would be worse than the bug it fixes.
 *
 * Sections:
 *   1. Browser loss (the flagship)
 *   2. Discovery on mount
 *   3. Explicit recovery
 *   4. Pending and stale entries
 *   5. Catalog independence
 *   6. De-duplication against the Phase 4D local record
 *   7. Account scoping
 *   8. Safety: no automatic anything
 */
import { act, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { REAL_1V1 } from "@/lib/combat-lab/team-sim/__fixtures__";
import type { TeamSimulationRequest } from "@/lib/combat-lab/team-sim/contract";
import {
  buildRecord,
  storageKeyFor,
  scopeForAccount,
} from "@/lib/combat-lab/team-sim/recovery";
import { fixedIdentitySource } from "@/lib/combat-lab/team-sim/identity";

import {
  recoverableEntry,
  recoverableListing,
  renderTeamSimPage,
  TEST_ACCOUNT_A,
  TEST_ACCOUNT_B,
  teamSimTree,
  makeTeamSimQueryClient,
  type HarnessOptions,
} from "./testHarness";

const ok = (body: unknown, headers: Record<string, string> = {}) => ({
  status: 200,
  body,
  headers,
});

/** A recovery response, which the endpoint always marks as a replay. */
const recovered = (body: unknown = REAL_1V1) =>
  ok(body, { "idempotency-replayed": "true" });

const COMPLETED = recoverableEntry();

/**
 * The suite-wide find timeout, matching every other team-sim page test.
 * `useTeamSimCatalog` and the discovery query both set `retry: 1`, and
 * react-query's first backoff alone exceeds the 1 s default.
 */
const FIND = { timeout: 8_000 };

/**
 * The Phase 4D click idiom, reused verbatim: a real DOM click inside `act`.
 *
 * Not `userEvent` — it is not a dependency of this repo, and the thing being
 * asserted here is the NUMBER of requests a click produces, which a plain
 * dispatch measures exactly as well.
 */
async function clickElement(element: HTMLElement | Promise<HTMLElement>) {
  const target = await element;
  await act(async () => {
    target.click();
  });
}

/** Let every timer, focus handler and query listener have its chance. */
async function settle(ms = 150) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

async function renderWith(options: HarnessOptions) {
  const rendered = renderTeamSimPage(options);
  // The editor is the page's own readiness signal; waiting on it means every
  // mount-time request has been issued by the time an assertion runs.
  await screen.findByTestId("run-panel", {}, FIND);
  return rendered;
}

beforeEach(() => {
  vi.useRealTimers();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/* ══════════════════════ 1. Browser loss (flagship) ══════════════════════ */

describe("browser loss", () => {
  it("recovers a paid result with no local state and no idempotency key", async () => {
    // The browser knows NOTHING: sessionStorage is cleared by the harness and
    // no request was ever made from this page.
    expect(sessionStorage.length).toBe(0);

    const { harness } = await renderWith({
      recoverable: () => ok(recoverableListing([COMPLETED])),
      recover: [recovered()],
    });

    // The server found it, and described it well enough to be recognised.
    const panel = await screen.findByTestId("server-recovery", {}, FIND);
    expect(within(panel).getByText(/1v1/)).toBeInTheDocument();
    expect(within(panel).getByText(/Vayne/)).toBeInTheDocument();
    expect(within(panel).getByText(/Garen/)).toBeInTheDocument();

    // Nothing billable has been sent, and nothing will be until a click.
    expect(harness.postCalls).toHaveLength(0);
    expect(harness.recoverCalls).toHaveLength(0);

    await clickElement(within(panel).getByTestId("server-recover"));

    // The result renders through the ordinary results UI.
    await screen.findByTestId("result-workspace", {}, FIND);
    expect(screen.getByTestId("result-panel")).toBeInTheDocument();

    // The two invariants: one recovery call, zero simulations.
    expect(harness.recoverCalls).toHaveLength(1);
    expect(harness.postCalls).toHaveLength(0);

    // Addressed by the opaque handle, never by an idempotency key.
    const call = harness.recoverCalls[0];
    expect(call.method).toBe("POST");
    expect(call.url).toContain(COMPLETED.recovery_id);
    expect(
      Object.keys(call.headers).map((h) => h.toLowerCase())
    ).not.toContain("idempotency-key");
    // And the browser still holds no recovery record of its own.
    expect(sessionStorage.getItem(storageKeyFor(scopeForAccount(TEST_ACCOUNT_A)))).toBeNull();
  });

  it("re-reads the credit balance after a recovery instead of guessing", async () => {
    const { harness } = await renderWith({
      recoverable: () => ok(recoverableListing([COMPLETED])),
      recover: [recovered()],
    });
    const before = harness.creditCalls.length;

    await clickElement(await screen.findByTestId("server-recover", {}, FIND));
    await screen.findByTestId("result-workspace", {}, FIND);

    // Re-read, never decremented locally: recovery does not charge, so any
    // optimistic subtraction here would show a balance that never happened.
    await waitFor(() =>
      expect(harness.creditCalls.length).toBeGreaterThan(before)
    );
  });
});

/* ═════════════════════════ 2. Discovery on mount ════════════════════════ */

describe("discovery", () => {
  it("asks the server once on mount and sends no simulation", async () => {
    const { harness } = await renderWith({
      recoverable: () => ok(recoverableListing([COMPLETED])),
    });
    await screen.findByTestId("server-recovery", {}, FIND);
    expect(harness.recoverableCalls).toHaveLength(1);
    expect(harness.recoverableCalls[0].method).toBe("GET");
    expect(harness.postCalls).toHaveLength(0);
    expect(harness.recoverCalls).toHaveLength(0);
  });

  it("shows nothing at all when the account has no recoverable requests", async () => {
    await renderWith({ recoverable: () => ok(recoverableListing([])) });
    await waitFor(() =>
      expect(screen.queryByTestId("server-recovery")).not.toBeInTheDocument()
    );
  });

  it("lists several records in the order the server returned them", async () => {
    const entries = [
      recoverableEntry({ recovery_id: "a".repeat(32), team_shape: "2v2" }),
      recoverableEntry({ recovery_id: "b".repeat(32), team_shape: "1v2" }),
      recoverableEntry({ recovery_id: "c".repeat(32), team_shape: "1v1" }),
    ];
    await renderWith({ recoverable: () => ok(recoverableListing(entries)) });

    const rows = await screen.findAllByTestId("server-recoverable-entry", {}, FIND);
    expect(rows).toHaveLength(3);
    // Rendered as received: the server's ordering is the contract, and
    // re-sorting here would silently disagree with its documented one.
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining("2v2"),
      expect.stringContaining("1v2"),
      expect.stringContaining("1v1"),
    ]);
  });

  it("reports a discovery failure without hiding anything else", async () => {
    const calls: number[] = [];
    await renderWith({
      recoverable: () => {
        calls.push(1);
        return { status: 500, body: { detail: { code: "internal_error" } } };
      },
    });

    const panel = await screen.findByTestId("server-recovery", {}, FIND);
    expect(panel).toHaveTextContent(/could not be listed/i);
    // The editor is untouched: discovery is an extra way to find a result, not
    // a precondition for running one.
    expect(screen.getByTestId("run-panel")).toBeInTheDocument();

    await clickElement(within(panel).getByTestId("server-recovery-retry"));
    await waitFor(() => expect(calls.length).toBeGreaterThan(1));
  });

  it("asks nothing at all for a signed-out visitor", async () => {
    // A signed-out session resolves to the `unidentified` SENTINEL, which is a
    // truthy scope — so a `!!scope` gate would fire one guaranteed-401 GET on
    // every signed-out page load. There is nothing to recover without an
    // account; the right number of requests is zero.
    const { harness } = await renderWith({
      accountId: null,
      recoverable: () => ok(recoverableListing([COMPLETED])),
    });
    await settle();
    expect(harness.recoverableCalls).toHaveLength(0);
    expect(screen.queryByTestId("server-recovery")).not.toBeInTheDocument();
  });

  it("renders nothing when the server answers an auth failure anyway", async () => {
    // Belt for the braces above: a token that expires between resolution and
    // the request is an ordinary state, not a fault worth a card.
    await renderWith({
      recoverable: () => ({ status: 401, body: { detail: { code: "AUTH_REQUIRED" } } }),
    });
    await waitFor(() =>
      expect(screen.queryByTestId("server-recovery")).not.toBeInTheDocument()
    );
  });

  it("survives an entry whose champions are the wrong shape", async () => {
    // There is no error boundary on this route: an unguarded `.join()` on a
    // string would unmount the whole tree — a blank page hiding every
    // recoverable paid result. The bad entry degrades; the good one renders.
    await renderWith({
      recoverable: () =>
        ok(
          recoverableListing([
            recoverableEntry({
              recovery_id: "f".repeat(32),
              champions: { a: "Vayne", b: 7 },
              team_shape: 42,
              credits_charged: undefined,
              created_at: "not a date",
            }),
            COMPLETED,
          ])
        ),
    });
    const rows = await screen.findAllByTestId("server-recoverable-entry", {}, FIND);
    // The undated entry is dropped (it cannot be placed in the list); the
    // usable one is still offered.
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).not.toMatch(/undefined|Invalid Date|NaN/);
  });

  it("never renders undefined or Invalid Date from a partial entry", async () => {
    await renderWith({
      recoverable: () =>
        ok(
          recoverableListing([
            {
              recovery_id: "9".repeat(32),
              status: "completed",
              replay_available: true,
              created_at: "2026-08-07T09:15:00.000000+00:00",
            },
          ])
        ),
    });
    const row = await screen.findByTestId("server-recoverable-entry", {}, FIND);
    expect(row.textContent).not.toMatch(/undefined|Invalid Date|NaN|null/);
    expect(row).toHaveTextContent(/Scenario details unavailable/i);
  });

  it("does not query at all until the account is known", async () => {
    const { harness } = renderTeamSimPage({
      accountId: null,
      identitySource: {
        current: () => null,
        // Never resolves: identity is still being determined.
        resolve: () => new Promise<string | null>(() => {}),
        subscribe: () => () => {},
      },
      recoverable: () => ok(recoverableListing([COMPLETED])),
    });
    await screen.findByTestId("run-panel", {}, FIND);
    // No account means no scope to attribute an answer to. Asking anyway would
    // either 401 noisily or, after a switch, briefly show someone else's list.
    expect(harness.recoverableCalls).toHaveLength(0);
  });

  it("drops a malformed entry without losing the usable ones", async () => {
    await renderWith({
      recoverable: () =>
        ok(
          recoverableListing([
            COMPLETED,
            { recovery_id: "", status: "completed" },
            { nonsense: true },
          ])
        ),
    });
    const rows = await screen.findAllByTestId("server-recoverable-entry", {}, FIND);
    // One bad entry must not hide the good one: this list is how somebody
    // finds a simulation they already paid for.
    expect(rows).toHaveLength(1);
  });
});

/* ════════════════════════ 3. Explicit recovery ══════════════════════════ */

describe("recovery", () => {
  it("sends exactly one request per click", async () => {
    const { harness } = await renderWith({
      recoverable: () => ok(recoverableListing([COMPLETED])),
      recover: [recovered()],
    });
    const button = await screen.findByTestId("server-recover", {}, FIND);
    await clickElement(button);
    await screen.findByTestId("result-workspace", {}, FIND);

    expect(harness.recoverCalls).toHaveLength(1);
    expect(harness.postCalls).toHaveLength(0);
  });

  it("marks the recovered result as replayed", async () => {
    await renderWith({
      recoverable: () => ok(recoverableListing([COMPLETED])),
      recover: [recovered()],
    });
    await clickElement(await screen.findByTestId("server-recover", {}, FIND));
    const panel = await screen.findByTestId("result-panel", {}, FIND);
    // The server replayed a stored result, so this cost nothing — the same
    // banner a Phase 4C key replay produces.
    expect(panel).toHaveTextContent(/replay|already produced|cost/i);
  });

  it("makes no configured-vs-executed catalog claim about a recovered result", async () => {
    await renderWith({
      recoverable: () => ok(recoverableListing([COMPLETED])),
      recover: [recovered()],
    });
    await clickElement(await screen.findByTestId("server-recover", {}, FIND));
    await screen.findByTestId("result-workspace", {}, FIND);

    // The catalog this ran against was never loaded here. Claiming a match
    // would invent an agreement between a known value and an unknown one.
    expect(await screen.findByTestId("digest-unknown", {}, FIND)).toHaveTextContent(
      /not known to this browser/i
    );
    expect(screen.queryByTestId("digest-match")).not.toBeInTheDocument();
    expect(screen.queryByTestId("digest-mismatch")).not.toBeInTheDocument();
  });

  it("reports a record that expired between listing and clicking", async () => {
    const { harness } = await renderWith({
      recoverable: () => ok(recoverableListing([COMPLETED])),
      recover: [
        { status: 404, body: { detail: { code: "recovery_not_found" } } },
      ],
    });
    await clickElement(await screen.findByTestId("server-recover", {}, FIND));

    const error = await screen.findByTestId("server-recovery-error", {}, FIND);
    expect(error).toHaveTextContent(/no longer available/i);
    // A dead entry must never fall back to running the scenario again.
    expect(harness.postCalls).toHaveLength(0);

    await clickElement(within(error).getByTestId("dismiss-server-recovery-error"));
    await waitFor(() =>
      expect(screen.queryByTestId("server-recovery-error")).not.toBeInTheDocument()
    );
  });

  it("does not start a simulation when recovery fails in transport", async () => {
    const { harness } = await renderWith({
      recoverable: () => ok(recoverableListing([COMPLETED])),
      recover: [{ status: 0, throws: new TypeError("Failed to fetch") }],
    });
    await clickElement(await screen.findByTestId("server-recover", {}, FIND));
    await screen.findByTestId("server-recovery-error", {}, FIND);
    expect(harness.postCalls).toHaveLength(0);
    expect(harness.recoverCalls).toHaveLength(1);
  });
});

/* ═══════════════════════ 4. Pending and stale ═══════════════════════════ */

describe("pending and stale entries", () => {
  const PENDING = recoverableEntry({
    recovery_id: "d".repeat(32),
    status: "pending",
    replay_available: false,
    completed_at: null,
    credits_charged: 0,
    winner: null,
    termination_reason: null,
    event_count: null,
    response_bytes: null,
  });

  it("offers Check status, not Recover, for a running request", async () => {
    await renderWith({ recoverable: () => ok(recoverableListing([PENDING])) });
    const row = await screen.findByTestId("server-recoverable-entry", {}, FIND);
    expect(row).toHaveAttribute("data-status", "pending");
    expect(within(row).getByTestId("server-check-status")).toBeInTheDocument();
    expect(within(row).queryByTestId("server-recover")).not.toBeInTheDocument();
    expect(row).toHaveTextContent(/never starts a second simulation/i);
  });

  it("checking a running request starts no second simulation", async () => {
    const { harness } = await renderWith({
      recoverable: () => ok(recoverableListing([PENDING])),
      recover: [
        { status: 409, body: { detail: { code: "idempotency_in_progress" } } },
      ],
    });
    await clickElement(await screen.findByTestId("server-check-status", {}, FIND));

    expect(await screen.findByTestId("server-recovery-error", {}, FIND)).toHaveTextContent(
      /still running/i
    );
    expect(harness.postCalls).toHaveLength(0);
    expect(harness.recoverCalls).toHaveLength(1);
  });

  it("shows a stale record as uncharged, with no control at all", async () => {
    const stale = recoverableEntry({
      recovery_id: "e".repeat(32),
      status: "stale",
      replay_available: false,
      completed_at: null,
      credits_charged: 0,
      winner: null,
      termination_reason: null,
    });
    await renderWith({ recoverable: () => ok(recoverableListing([stale])) });

    const row = await screen.findByTestId("server-recoverable-entry", {}, FIND);
    expect(row).toHaveAttribute("data-status", "stale");
    expect(row).toHaveTextContent(/was not charged/i);
    // Nothing to collect and nothing to check: the server cannot resume it, so
    // a button could only repeat what the row already says.
    expect(within(row).queryByTestId("server-recover")).not.toBeInTheDocument();
    expect(
      within(row).queryByTestId("server-check-status")
    ).not.toBeInTheDocument();
  });

  it("never reports a quoted cost as charged on an unfinished record", async () => {
    await renderWith({ recoverable: () => ok(recoverableListing([PENDING])) });
    const row = await screen.findByTestId("server-recoverable-entry", {}, FIND);
    expect(row).toHaveTextContent(/quoted/i);
    expect(row).not.toHaveTextContent(/charged/i);
  });
});

/* ══════════════════════ 5. Catalog independence ═════════════════════════ */

describe("catalog independence", () => {
  it("still offers server recovery when the catalog is unavailable", async () => {
    const { harness } = renderTeamSimPage({
      catalog: { status: 503, body: { detail: { code: "catalog_unavailable" } } },
      recoverable: () => ok(recoverableListing([COMPLETED])),
      recover: [recovered()],
    });

    // The editor is gone — no vocabulary to build it from — and that is
    // exactly the moment a paid result must still be collectable.
    await screen.findByText(/simulation catalog is unavailable/i, {}, FIND);
    const panel = await screen.findByTestId("server-recovery", {}, FIND);

    await clickElement(within(panel).getByTestId("server-recover"));
    await screen.findByTestId("result-workspace", {}, FIND);
    expect(harness.recoverCalls).toHaveLength(1);
    expect(harness.postCalls).toHaveLength(0);
  });

  it("does not wait for the catalog before asking what is recoverable", async () => {
    let release: (() => void) | null = null;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { harness } = renderTeamSimPage({
      catalog: { status: 200, body: undefined, gate },
      recoverable: () => ok(recoverableListing([COMPLETED])),
    });

    // The discovery call is on the wire while the catalog is still open.
    await waitFor(() => expect(harness.recoverableCalls).toHaveLength(1));
    release?.();
  });
});

/* ══════════════ 6. De-duplication with the Phase 4D record ══════════════ */

describe("local recovery takes precedence", () => {
  function seedLocalRecord(accountId: string) {
    const scope = scopeForAccount(accountId);
    const record = buildRecord({
      scope,
      idempotencyKey: "local-key-0001",
      request: REAL_1V1_REQUEST,
      submittedAt: Date.now() - 5_000,
      catalogDigest: "local-digest",
      creditCost: 1,
      retentionSeconds: 86_400,
    });
    sessionStorage.setItem(storageKeyFor(scope), JSON.stringify(record));
  }

  it("hides the server list entirely while a local record is offered", async () => {
    seedLocalRecord(TEST_ACCOUNT_A);
    await renderWith({
      keepStorage: true,
      recoverable: () => ok(recoverableListing([COMPLETED])),
    });

    // The local card wins: it holds the original request and key, and the two
    // surfaces cannot be matched to each other without guessing.
    expect(await screen.findByTestId("recovery-notice", {}, FIND)).toBeInTheDocument();
    expect(screen.queryByTestId("server-recovery")).not.toBeInTheDocument();
    // Exactly one recovery control is on screen for the operator to press.
    expect(screen.getAllByTestId(/^(recover-stored|server-recover)$/)).toHaveLength(1);
  });

  it("reveals the server list once the local record is forgotten", async () => {
    seedLocalRecord(TEST_ACCOUNT_A);
    const { harness } = await renderWith({
      keepStorage: true,
      recoverable: () => ok(recoverableListing([COMPLETED])),
    });

    await clickElement(await screen.findByTestId("forget-recovery", {}, FIND));

    expect(await screen.findByTestId("server-recovery", {}, FIND)).toBeInTheDocument();
    // Forgetting sends nothing — neither a simulation nor a recovery.
    expect(harness.postCalls).toHaveLength(0);
    expect(harness.recoverCalls).toHaveLength(0);
  });
});

/* ════════════════════════ 7. Account scoping ════════════════════════════ */

describe("account scoping", () => {
  it("re-queries under the new account after a switch", async () => {
    const source = fixedIdentitySource(TEST_ACCOUNT_A) as ReturnType<
      typeof fixedIdentitySource
    > & { __set(next: string | null): void };

    const seen: string[] = [];
    const { harness } = renderTeamSimPage({
      identitySource: source,
      recoverable: () => {
        seen.push("call");
        return ok(recoverableListing([COMPLETED]));
      },
    });
    await screen.findByTestId("server-recovery", {}, FIND);
    expect(harness.recoverableCalls).toHaveLength(1);

    source.__set(TEST_ACCOUNT_B);

    // A different account is a different question. The cached answer belongs
    // to the previous one and must not be reused for even one render.
    await waitFor(() => expect(harness.recoverableCalls.length).toBe(2));
  });

  it("does not attribute a recovered result to a different account", async () => {
    const source = fixedIdentitySource(TEST_ACCOUNT_A) as ReturnType<
      typeof fixedIdentitySource
    > & { __set(next: string | null): void };

    await renderWith({
      identitySource: source,
      recoverable: () => ok(recoverableListing([COMPLETED])),
      recover: [recovered()],
    });
    await clickElement(await screen.findByTestId("server-recover", {}, FIND));
    await screen.findByTestId("result-workspace", {}, FIND);

    source.__set(TEST_ACCOUNT_B);

    // Account B never recovered anything, so B must not be looking at A's
    // paid result.
    await waitFor(() =>
      expect(screen.queryByTestId("result-workspace")).not.toBeInTheDocument()
    );
  });
});

/* ═══════════════════ 8. Safety: no automatic anything ═══════════════════ */

describe("safety", () => {
  it("recovers nothing without a click", async () => {
    const { harness } = await renderWith({
      recoverable: () => ok(recoverableListing([COMPLETED])),
    });
    await screen.findByTestId("server-recovery", {}, FIND);
    // Give every effect, every refetch trigger and every microtask a turn.
    await settle();
    expect(harness.recoverCalls).toHaveLength(0);
    expect(harness.postCalls).toHaveLength(0);
  });

  it("does not refetch or recover on window focus or reconnect", async () => {
    const { harness } = await renderWith({
      recoverable: () => ok(recoverableListing([COMPLETED])),
    });
    await screen.findByTestId("server-recovery", {}, FIND);
    const before = harness.recoverableCalls.length;

    window.dispatchEvent(new Event("focus"));
    window.dispatchEvent(new Event("online"));
    await settle();

    expect(harness.recoverableCalls).toHaveLength(before);
    expect(harness.recoverCalls).toHaveLength(0);
    expect(harness.postCalls).toHaveLength(0);
  });

  it("keeps the list on screen, with feedback, while its own recovery runs", async () => {
    let release: (() => void) | null = null;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await renderWith({
      recoverable: () => ok(recoverableListing([COMPLETED])),
      recover: [{ ...recovered(), gate }],
    });
    await clickElement(await screen.findByTestId("server-recover", {}, FIND));

    // Suppressing on ANY in-flight request would unmount the panel the instant
    // its own button was pressed — no feedback at all, and none whatsoever
    // when the catalog is down and nothing else is on screen.
    expect(screen.getByTestId("server-recovery")).toBeInTheDocument();
    expect(screen.getByTestId("server-recover")).toBeDisabled();

    // And the page must not describe a free collection as a paid simulation.
    expect(screen.queryByText(/Simulating…/)).not.toBeInTheDocument();
    expect(screen.getByTestId("run-panel")).toHaveTextContent(
      /no credit is being used/i
    );

    release?.();
    await screen.findByTestId("result-workspace", {}, FIND);
  });

  it("does not queue a second recovery from a double click", async () => {
    let release: (() => void) | null = null;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { harness } = await renderWith({
      recoverable: () => ok(recoverableListing([COMPLETED])),
      recover: [{ ...recovered(), gate }],
    });

    const button = await screen.findByTestId("server-recover", {}, FIND);
    await clickElement(button);
    await clickElement(button);
    await clickElement(button);

    expect(harness.recoverCalls).toHaveLength(1);
    release?.();
    await screen.findByTestId("result-workspace", {}, FIND);
    expect(harness.recoverCalls).toHaveLength(1);
  });

  it("never puts the raw recovery identifier on screen", async () => {
    const { view } = await renderWith({
      recoverable: () => ok(recoverableListing([COMPLETED])),
    });
    await screen.findByTestId("server-recovery", {}, FIND);
    expect(view.container.textContent ?? "").not.toContain(COMPLETED.recovery_id);
  });
});

/**
 * A minimal valid request body, used only to seed a Phase 4D local record.
 * Deliberately not imported from the fixtures: what matters here is that the
 * record VALIDATES on read, not what it contains.
 */
const REAL_1V1_REQUEST: TeamSimulationRequest = {
  contract_version: "sim2.team-simulate.v1",
  scenario_id: "seeded",
  team_a: {
    team_id: "A",
    combatants: [
      {
        runtime_id: "A1",
        champion: "Vayne",
        level: 11,
        items: [],
        runes: [],
        ability_ranks: {},
        crit_mode: "expected",
      },
    ],
  },
  team_b: {
    team_id: "B",
    combatants: [
      {
        runtime_id: "B1",
        champion: "Garen",
        level: 11,
        items: [],
        runes: [],
        ability_ranks: {},
        crit_mode: "expected",
      },
    ],
  },
  action_plans: {},
  targeting: {},
  limits: { max_duration: 120, max_events: 1000, max_trace_events: 400 },
};
