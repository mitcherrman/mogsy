/**
 * SIM2 Phase 4D — durable browser recovery for an unresolved PAID request.
 *
 * The scenario this file exists for, in one line: the backend ran and charged
 * a simulation, the browser never saw the answer, and the page was reloaded.
 * Before Phase 4D that combination cost the operator a credit with no result
 * and no way to ask for one. Every assertion below is about that being false
 * now — and about it being fixed WITHOUT introducing the thing that would be
 * worse than the original bug: a page that sends a paid request on its own.
 *
 * So the two counts that appear over and over are deliberate:
 *   `postCalls` after a restore  → must be 0, always, no matter what fires.
 *   `postCalls` after one click  → must be exactly 1.
 */
import { StrictMode } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  REAL_1V1,
  REAL_CATALOG,
  REAL_ERRORS,
  REAL_REPLAY_PAIR,
} from "@/lib/combat-lab/team-sim/__fixtures__";
import { indexCatalog } from "@/lib/combat-lab/team-sim/catalog";
import { __resetCatalogCache } from "@/lib/combat-lab/team-sim/client";
import {
  __setAccountIdentitySource,
  fixedIdentitySource,
} from "@/lib/combat-lab/team-sim/identity";
import { IDEMPOTENCY_HEADER } from "@/lib/combat-lab/team-sim/contract";
import { createDraft, draftReducer } from "@/lib/combat-lab/team-sim/draft";
import { buildSimulationRequest } from "@/lib/combat-lab/team-sim/request";
import {
  buildRecord,
  expiresAt,
  fingerprintRequest,
  scopeForAccount,
  storageKeyFor,
  writeRecord,
  type TeamSimRecoveryRecord,
} from "@/lib/combat-lab/team-sim/recovery";

import {
  makeTeamSimQueryClient,
  renderTeamSimPage,
  teamSimTree,
  TeamSimHarness,
  TEST_ACCOUNT_A,
  TEST_ACCOUNT_B,
  type HarnessOptions,
} from "./testHarness";

vi.mock("@/lib/backend-auth", () => ({
  getBackendAuthHeaders: async () => ({ Authorization: "Bearer test-token" }),
  ensureBackendAuthToken: async () => "test-token",
}));

vi.setConfig({ testTimeout: 45_000, hookTimeout: 45_000 });
const FIND = { timeout: 8_000 };

const SCOPE_A = scopeForAccount(TEST_ACCOUNT_A);
const SCOPE_B = scopeForAccount(TEST_ACCOUNT_B);

/* ────────────────────────────── helpers ────────────────────────────── */

const INDEX = indexCatalog(REAL_CATALOG);

/** A request built the way the page builds one — never hand-written. */
function builtRequest() {
  return buildSimulationRequest(createDraft(INDEX), INDEX).request;
}

function seedRecord(
  scope: string,
  overrides: Partial<TeamSimRecoveryRecord> = {}
): TeamSimRecoveryRecord {
  const record: TeamSimRecoveryRecord = {
    ...buildRecord({
      scope,
      idempotencyKey: "seeded-key-0000-4000-8000-000000000001",
      request: builtRequest(),
      submittedAt: Date.now() - 60_000,
      catalogDigest: REAL_CATALOG.catalog_digest,
      creditCost: 1,
      retentionSeconds: 86_400,
    }),
    ...overrides,
  };
  writeRecord(record);
  return record;
}

function storedFor(scope: string): TeamSimRecoveryRecord | null {
  const raw = sessionStorage.getItem(storageKeyFor(scope));
  return raw ? (JSON.parse(raw) as TeamSimRecoveryRecord) : null;
}

function keyOf(call: { headers: Record<string, string> }): string {
  const name = Object.keys(call.headers).find(
    (k) => k.toLowerCase() === IDEMPOTENCY_HEADER.toLowerCase()
  );
  return name ? call.headers[name] : "";
}

async function loadedPage(options: HarnessOptions = {}) {
  const rendered = renderTeamSimPage(options);
  await screen.findByTestId("run-panel", {}, FIND);
  return rendered;
}

async function clickRun() {
  await act(async () => {
    screen.getByTestId("run-simulation").click();
  });
}

async function clickTestId(testId: string) {
  const el = await screen.findByTestId(testId, {}, FIND);
  await act(async () => {
    el.click();
  });
}

/** Let every timer, focus handler and query listener have its chance. */
async function settle(ms = 150) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

/** A response the page will never see — the Phase 4D failure, exactly. */
function neverAnswers() {
  return { status: 200, body: REAL_1V1, gate: new Promise<void>(() => {}) };
}

const originalStorage = Object.getOwnPropertyDescriptor(window, "sessionStorage");
function restoreStorage() {
  if (originalStorage) Object.defineProperty(window, "sessionStorage", originalStorage);
}

beforeEach(() => {
  restoreStorage();
  vi.clearAllMocks();
});
afterEach(() => {
  restoreStorage();
  try {
    sessionStorage.clear();
  } catch {
    /* a storage-failure test owns its own cleanup */
  }
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// =========================================================================
// Persistence — before the POST, or not at all
// =========================================================================

describe("persistence", () => {
  it("has already written the key and the body when the POST is dispatched", async () => {
    // Observed INSIDE the fetch stub, synchronously, at the instant the
    // request is handed to the network. Checking afterwards would only prove
    // the write happened eventually — and "eventually" is precisely the window
    // in which a crash costs the operator a credit.
    let atDispatch: TeamSimRecoveryRecord | null = null;
    const { harness } = await loadedPage({
      simulate: [{ status: 200, body: REAL_1V1 }],
      onCall: (call) => {
        if (call.url.includes("/team-simulate/v1")) atDispatch = storedFor(SCOPE_A);
      },
    });
    await clickRun();
    await waitFor(() => expect(harness.postCalls).toHaveLength(1));

    expect(atDispatch).not.toBeNull();
    const record = atDispatch as unknown as TeamSimRecoveryRecord;
    const post = harness.postCalls[0];
    expect(record.idempotency_key).toBe(keyOf(post));
    expect(record.request).toEqual(JSON.parse(String(post.body)));
    expect(record.user_scope).toBe(SCOPE_A);
    expect(record.request_fingerprint).toBe(fingerprintRequest(record.request));
  });

  it("clears the record once an accepted result is on screen", async () => {
    const { harness } = await loadedPage({
      simulate: [{ status: 200, body: REAL_1V1 }],
    });
    await clickRun();
    await screen.findByTestId("result-workspace", {}, FIND);
    expect(harness.postCalls).toHaveLength(1);
    expect(storedFor(SCOPE_A)).toBeNull();
  });

  it("clears the record on a REPLAYED success too", async () => {
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
    expect(storedFor(SCOPE_A)).not.toBeNull();

    await clickTestId("recover-request");
    await screen.findByTestId("result-workspace", {}, FIND);
    expect(storedFor(SCOPE_A)).toBeNull();
  });

  it("KEEPS the record when the outcome is uncertain", async () => {
    await loadedPage({
      simulate: [{ status: 0, throws: new TypeError("Failed to fetch") }],
    });
    await clickRun();
    await screen.findByTestId("failure-notice", {}, FIND);

    const record = storedFor(SCOPE_A);
    expect(record).not.toBeNull();
    // Re-stamped, because a later page load will describe it as recoverable.
    expect(record?.state).toBe("recovery_available");
  });

  it("KEEPS the record while the original request is still in progress", async () => {
    await loadedPage({
      simulate: [{ status: 409, body: REAL_ERRORS["409_in_progress"] }],
    });
    await clickRun();
    await screen.findByTestId("in-progress-note", {}, FIND);
    expect(storedFor(SCOPE_A)).not.toBeNull();
  });

  it("clears the record on a proven pre-execution rejection", async () => {
    // 402: the server states the simulation did not run, so there is nothing
    // to collect and nothing to protect.
    await loadedPage({ simulate: [{ status: 402, body: REAL_ERRORS[402] }] });
    await clickRun();
    await screen.findByTestId("rejected-note", {}, FIND);
    expect(storedFor(SCOPE_A)).toBeNull();
  });

  it("clears the record on a 409 conflict, and says why on screen", async () => {
    // Documented Phase 4D choice: a conflict proves the server holds a
    // DIFFERENT body under this key, so these bytes can never replay — and a
    // 409 is answered before execution, so they were never charged. Keeping an
    // unreplayable record would gate every future run for no benefit.
    await loadedPage({ simulate: [{ status: 409, body: REAL_ERRORS[409] }] });
    await clickRun();
    const notice = await screen.findByTestId("failure-notice", {}, FIND);
    expect(notice).toHaveTextContent("idempotency_conflict");
    expect(storedFor(SCOPE_A)).toBeNull();
  });

  it("refuses to send a paid request it cannot write down", async () => {
    const { harness } = await loadedPage({
      simulate: [{ status: 200, body: REAL_1V1 }],
    });
    // Quota exhausted between page load and click.
    Object.defineProperty(window, "sessionStorage", {
      configurable: true,
      get: () => ({
        getItem: () => null,
        setItem: () => {
          throw new DOMException("quota", "QuotaExceededError");
        },
        removeItem: () => {},
      }),
    });

    await clickRun();
    await screen.findByTestId("run-blocked-storage", {}, FIND);
    await settle();
    // The whole invariant: no recoverability, no charge.
    expect(harness.postCalls).toHaveLength(0);
    expect(screen.getByTestId("run-blocked-storage")).toHaveTextContent(/NOT sent/);
  });
});

// =========================================================================
// FLAGSHIP — reload after a lost response
// =========================================================================

describe("reload after a lost response", () => {
  it("restores, offers, recovers on one click, and costs nothing extra", async () => {
    // 1–4. Configure, run, and let the record be written.
    const first = await loadedPage({ simulate: [neverAnswers()] });
    await clickRun();
    await waitFor(() => expect(first.harness.postCalls).toHaveLength(1));

    const stored = storedFor(SCOPE_A);
    expect(stored).not.toBeNull();
    const originalKey = stored!.idempotency_key;
    const originalRequest = stored!.request;
    expect(originalKey).toBe(keyOf(first.harness.postCalls[0]));

    // 5–6. The browser never observes the answer, and the page is reloaded.
    first.view.unmount();

    const second = await loadedPage({
      keepStorage: true,
      simulate: [
        {
          status: 200,
          body: REAL_REPLAY_PAIR.replayed,
          headers: { "idempotency-replayed": "true" },
        },
      ],
    });

    // 7–9. Restored, offered, and NOTHING sent. Not on mount, not on the
    // catalog load, not on the credit read, not after everything settles.
    await screen.findByTestId("recovery-notice", {}, FIND);
    await settle(300);
    expect(second.harness.postCalls).toHaveLength(0);

    // The editor is the operator's, not the recovery's: a fresh draft, edited
    // freely, and the stored request must not follow it.
    await act(async () => {
      fireEvent.change(screen.getByLabelText("A1 level"), { target: { value: "9" } });
    });
    expect(storedFor(SCOPE_A)?.request).toEqual(originalRequest);

    // 10–12. One explicit click, one POST, the ORIGINAL key and bytes.
    await clickTestId("recover-stored");
    await waitFor(() => expect(second.harness.postCalls).toHaveLength(1));
    const post = second.harness.postCalls[0];
    expect(keyOf(post)).toBe(originalKey);
    expect(JSON.parse(String(post.body))).toEqual(originalRequest);

    // 13–15. The result the operator already paid for, named as a replay, and
    // the record retired.
    await screen.findByTestId("result-workspace", {}, FIND);
    expect(screen.getByTestId("replayed-result-banner")).toHaveTextContent(
      /no credits were spent/i
    );
    expect(storedFor(SCOPE_A)).toBeNull();
    expect(screen.queryByTestId("recovery-notice")).not.toBeInTheDocument();

    // 16. The draft the operator was editing is untouched by any of it.
    expect(screen.getByLabelText("A1 level")).toHaveValue(9);
  });

  it("sends nothing on a remount, a catalog refresh or a window focus", async () => {
    seedRecord(SCOPE_A);
    const { harness, view } = await loadedPage({ keepStorage: true, simulate: [] });
    await screen.findByTestId("recovery-notice", {}, FIND);

    await act(async () => {
      screen.getByText(/Refresh catalog/i).click();
      window.dispatchEvent(new Event("focus"));
      window.dispatchEvent(new Event("online"));
    });
    await settle(250);
    expect(harness.postCalls).toHaveLength(0);

    // A remount inside the same page load must not "resume" anything either.
    view.rerender(<div />);
    await settle(100);
    expect(harness.postCalls).toHaveLength(0);
  });

  it("sends exactly one POST when Recover is double-clicked", async () => {
    const record = seedRecord(SCOPE_A);
    const { harness } = await loadedPage({
      keepStorage: true,
      simulate: [
        {
          status: 200,
          body: REAL_REPLAY_PAIR.replayed,
          headers: { "idempotency-replayed": "true" },
          gate: new Promise<void>((resolve) => setTimeout(resolve, 30)),
        },
      ],
    });
    const button = await screen.findByTestId("recover-stored", {}, FIND);
    await act(async () => {
      button.click();
      button.click();
    });
    await waitFor(() => expect(harness.postCalls).toHaveLength(1));
    await settle();
    expect(harness.postCalls).toHaveLength(1);
    expect(keyOf(harness.postCalls[0])).toBe(record.idempotency_key);
  });

  it("keeps the record when a recovery attempt is itself uncertain", async () => {
    seedRecord(SCOPE_A);
    const { harness } = await loadedPage({
      keepStorage: true,
      simulate: [{ status: 0, throws: new TypeError("Failed to fetch") }],
    });
    await clickTestId("recover-stored");
    await waitFor(() => expect(harness.postCalls).toHaveLength(1));
    await screen.findByTestId("failure-notice", {}, FIND);
    expect(storedFor(SCOPE_A)).not.toBeNull();
  });

  it("keeps the record when the server says the original is still running", async () => {
    seedRecord(SCOPE_A);
    await loadedPage({
      keepStorage: true,
      simulate: [{ status: 409, body: REAL_ERRORS["409_in_progress"] }],
    });
    await clickTestId("recover-stored");
    await screen.findByTestId("in-progress-note", {}, FIND);
    expect(storedFor(SCOPE_A)).not.toBeNull();
  });

  it("forgets on request, sending nothing", async () => {
    seedRecord(SCOPE_A);
    const { harness } = await loadedPage({ keepStorage: true, simulate: [] });
    await screen.findByTestId("recovery-notice", {}, FIND);

    await clickTestId("forget-recovery");
    await waitFor(() =>
      expect(screen.queryByTestId("recovery-notice")).not.toBeInTheDocument()
    );
    expect(storedFor(SCOPE_A)).toBeNull();
    // Forgetting is a local erasure, not a request — the operator is told the
    // server may still have run it.
    expect(harness.postCalls).toHaveLength(0);
  });
});

// =========================================================================
// Identity isolation
// =========================================================================

describe("identity isolation", () => {
  it("offers A's record to A", async () => {
    seedRecord(SCOPE_A);
    await loadedPage({ keepStorage: true, accountId: TEST_ACCOUNT_A, simulate: [] });
    expect(await screen.findByTestId("recovery-notice", {}, FIND)).toBeInTheDocument();
  });

  it("never shows or sends A's record to B", async () => {
    seedRecord(SCOPE_A);
    const { harness } = await loadedPage({
      keepStorage: true,
      accountId: TEST_ACCOUNT_B,
      simulate: [],
    });
    await settle(250);
    expect(screen.queryByTestId("recovery-notice")).not.toBeInTheDocument();
    expect(harness.postCalls).toHaveLength(0);
    // And B's own namespace was never populated from A's.
    expect(storedFor(SCOPE_B)).toBeNull();
    // A's record is untouched — B must not be able to destroy it either.
    expect(storedFor(SCOPE_A)).not.toBeNull();
  });

  it("does not expose A's record to an anonymous session", async () => {
    seedRecord(SCOPE_A);
    const { harness } = await loadedPage({
      keepStorage: true,
      accountId: null,
      simulate: [],
    });
    await settle(250);
    expect(screen.queryByTestId("recovery-notice")).not.toBeInTheDocument();
    expect(harness.postCalls).toHaveLength(0);
    expect(storedFor(SCOPE_A)).not.toBeNull();
  });

  it("restores A's record when A comes back in the same browser session", async () => {
    seedRecord(SCOPE_A);
    const asB = await loadedPage({
      keepStorage: true,
      accountId: TEST_ACCOUNT_B,
      simulate: [],
    });
    await settle(150);
    expect(screen.queryByTestId("recovery-notice")).not.toBeInTheDocument();
    asB.view.unmount();

    await loadedPage({ keepStorage: true, accountId: TEST_ACCOUNT_A, simulate: [] });
    expect(await screen.findByTestId("recovery-notice", {}, FIND)).toBeInTheDocument();
  });

  it("discards a record whose stored scope does not match its slot", async () => {
    // Hand-written into A's slot while claiming to belong to B.
    const foreign = { ...seedRecord(SCOPE_A), user_scope: SCOPE_B };
    sessionStorage.setItem(storageKeyFor(SCOPE_A), JSON.stringify(foreign));

    const { harness } = await loadedPage({ keepStorage: true, simulate: [] });
    await settle(200);
    expect(screen.queryByTestId("recovery-notice")).not.toBeInTheDocument();
    expect(harness.postCalls).toHaveLength(0);
    expect(storedFor(SCOPE_A)).toBeNull();
  });
});

// =========================================================================
// Races found by adversarial review
// =========================================================================

/** A source the test can switch mid-life. Must exist before the render. */
function switchableSource(initial: string | null) {
  return fixedIdentitySource(initial) as ReturnType<typeof fixedIdentitySource> & {
    __set(next: string | null): void;
  };
}

describe("account switches while a request is unresolved", () => {
  it("hides A's uncertain failure — and its recovery button — from B", async () => {
    const source = switchableSource(TEST_ACCOUNT_A);
    const { harness } = await loadedPage({
      identitySource: source,
      simulate: [{ status: 0, throws: new TypeError("Failed to fetch") }],
    });
    await clickRun();
    await screen.findByTestId("recover-request", {}, FIND);
    expect(harness.postCalls).toHaveLength(1);

    await act(async () => {
      source.__set(TEST_ACCOUNT_B);
    });

    // B must not inherit a control that would re-send A's body on B's token —
    // which the backend, scoping idempotency per user, would price as a brand
    // new simulation.
    await waitFor(() =>
      expect(screen.queryByTestId("recover-request")).not.toBeInTheDocument()
    );
    await settle(200);
    expect(harness.postCalls).toHaveLength(1);
    // A's record survives for A; it was not destroyed by B arriving.
    expect(storedFor(SCOPE_A)).not.toBeNull();
    expect(storedFor(SCOPE_B)).toBeNull();
  });

  it("does not show B a response that A's in-flight request produced", async () => {
    // The ordering the scope-change effect cannot catch: the switch happens
    // FIRST, and the response repopulates run state afterwards, from the
    // mutation callbacks, behind the effect's back.
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const source = switchableSource(TEST_ACCOUNT_A);
    const { harness } = await loadedPage({
      identitySource: source,
      simulate: [{ status: 0, throws: new TypeError("Failed to fetch"), gate }],
    });
    await clickRun();
    await waitFor(() => expect(harness.postCalls).toHaveLength(1));

    await act(async () => {
      source.__set(TEST_ACCOUNT_B);
    });
    await act(async () => {
      release();
      await new Promise((resolve) => setTimeout(resolve, 60));
    });

    // A's outcome belongs to A. B sees no failure notice and, crucially, no
    // "Check this request" button pointed at A's key.
    expect(screen.queryByTestId("failure-notice")).not.toBeInTheDocument();
    expect(screen.queryByTestId("recover-request")).not.toBeInTheDocument();
    expect(screen.queryByTestId("recovery-notice")).not.toBeInTheDocument();
    await settle(150);
    expect(harness.postCalls).toHaveLength(1);
    // Still A's to recover when A returns.
    expect(storedFor(SCOPE_A)).not.toBeNull();
  });

  it("does not load the previous account's slot into the new account's offer", async () => {
    const source = switchableSource(TEST_ACCOUNT_A);
    // A has an unresolved record; B has none.
    seedRecord(SCOPE_A);
    const { harness } = await loadedPage({
      keepStorage: true,
      identitySource: source,
      simulate: [],
    });
    await screen.findByTestId("recovery-notice", {}, FIND);

    await act(async () => {
      source.__set(TEST_ACCOUNT_B);
    });
    await waitFor(() =>
      expect(screen.queryByTestId("recovery-notice")).not.toBeInTheDocument()
    );
    await settle(200);
    expect(harness.postCalls).toHaveLength(0);
  });
});

describe("StrictMode", () => {
  it("restores once and sends nothing when effects are double-invoked", async () => {
    seedRecord(SCOPE_A);
    const harness = new TeamSimHarness({ simulate: [] });
    harness.install();
    __resetCatalogCache();
    __setAccountIdentitySource(fixedIdentitySource(TEST_ACCOUNT_A));

    render(<StrictMode>{teamSimTree(makeTeamSimQueryClient())}</StrictMode>);
    await screen.findByTestId("run-panel", {}, FIND);
    // Exactly one card, not two, and no request from either effect pass.
    expect(await screen.findAllByTestId("recovery-notice", {}, FIND)).toHaveLength(1);
    await settle(250);
    expect(harness.postCalls).toHaveLength(0);
  });
});

describe("retention comes from the catalog", () => {
  it("stores the backend's published retention, not a client guess", async () => {
    const { harness } = await loadedPage({ simulate: [neverAnswers()] });
    await clickRun();
    await waitFor(() => expect(harness.postCalls).toHaveLength(1));
    expect(storedFor(SCOPE_A)?.retention_seconds).toBe(
      REAL_CATALOG.billing.idempotency_retention_seconds
    );
  });
});

// =========================================================================
// Corruption at the page level
// =========================================================================

describe("corrupt storage never reaches the network", () => {
  const poisons: Array<[string, () => void]> = [
    ["malformed JSON", () => sessionStorage.setItem(storageKeyFor(SCOPE_A), "{oops")],
    [
      "a wrong schema version",
      () => {
        const r = seedRecord(SCOPE_A);
        sessionStorage.setItem(
          storageKeyFor(SCOPE_A),
          JSON.stringify({ ...r, schema_version: 42 })
        );
      },
    ],
    [
      "a malformed key",
      () => {
        const r = seedRecord(SCOPE_A);
        sessionStorage.setItem(
          storageKeyFor(SCOPE_A),
          JSON.stringify({ ...r, idempotency_key: "not a key" })
        );
      },
    ],
    [
      "a malformed request",
      () => {
        const r = seedRecord(SCOPE_A);
        sessionStorage.setItem(
          storageKeyFor(SCOPE_A),
          JSON.stringify({ ...r, request: { nope: true } })
        );
      },
    ],
    [
      "a fingerprint mismatch",
      () => {
        const r = seedRecord(SCOPE_A);
        const tampered = structuredClone(r);
        tampered.request.team_a.combatants[0].champion = "Tampered";
        sessionStorage.setItem(storageKeyFor(SCOPE_A), JSON.stringify(tampered));
      },
    ],
    [
      "an expired record",
      () => {
        const r = seedRecord(SCOPE_A);
        writeRecord({
          ...r,
          submitted_at: r.submitted_at - (expiresAt(r) - r.submitted_at) - 1_000,
        });
      },
    ],
    [
      "an oversized blob",
      () => sessionStorage.setItem(storageKeyFor(SCOPE_A), "x".repeat(300_000)),
    ],
  ];

  for (const [label, poison] of poisons) {
    it(`ignores ${label} without crashing or sending anything`, async () => {
      poison();
      const { harness } = await loadedPage({ keepStorage: true, simulate: [] });
      await settle(200);

      // The editor still works — a bad storage slot must not cost the page.
      expect(screen.getByTestId("run-panel")).toBeInTheDocument();
      expect(screen.queryByTestId("recovery-notice")).not.toBeInTheDocument();
      expect(harness.postCalls).toHaveLength(0);
      // Quarantined, so it cannot fail identically on every future load.
      expect(sessionStorage.getItem(storageKeyFor(SCOPE_A))).toBeNull();
      // Said once, quietly, and dismissible — never as an alarm.
      const lapsed = screen.getByTestId("recovery-lapsed");
      expect(lapsed).toBeInTheDocument();
      expect(lapsed.textContent ?? "").not.toMatch(/error|failed|corrupt/i);
    });
  }

  it("says the recovery WINDOW closed when a record simply expired", async () => {
    const r = seedRecord(SCOPE_A);
    writeRecord({
      ...r,
      submitted_at: r.submitted_at - (expiresAt(r) - r.submitted_at) - 1_000,
    });
    const { harness } = await loadedPage({ keepStorage: true, simulate: [] });
    const lapsed = await screen.findByTestId("recovery-lapsed", {}, FIND);
    expect(lapsed).toHaveTextContent(/recovery window has closed/i);
    expect(lapsed).toHaveTextContent(/check your credit balance/i);
    expect(harness.postCalls).toHaveLength(0);

    await clickTestId("dismiss-lapsed");
    await waitFor(() =>
      expect(screen.queryByTestId("recovery-lapsed")).not.toBeInTheDocument()
    );
    // Dismissing is not a run, and the expired slot stays gone.
    expect(harness.postCalls).toHaveLength(0);
    expect(sessionStorage.getItem(storageKeyFor(SCOPE_A))).toBeNull();
  });

  it("still renders the editor when sessionStorage is unreachable", async () => {
    Object.defineProperty(window, "sessionStorage", {
      configurable: true,
      get: () => {
        throw new DOMException("blocked", "SecurityError");
      },
    });
    const { harness } = await loadedPage({ keepStorage: true, simulate: [] });
    await settle(150);
    expect(screen.getByTestId("run-panel")).toBeInTheDocument();
    expect(harness.postCalls).toHaveLength(0);
  });
});

// =========================================================================
// New-run collision
// =========================================================================

describe("a new run cannot silently overwrite an unresolved one", () => {
  async function pageWithUnresolved(simulate: HarnessOptions["simulate"] = []) {
    seedRecord(SCOPE_A);
    return loadedPage({ keepStorage: true, simulate });
  }

  it("stops the run and offers the three explicit choices", async () => {
    const { harness } = await pageWithUnresolved();
    await clickRun();
    await screen.findByTestId("run-blocked-unresolved", {}, FIND);
    await settle();
    expect(harness.postCalls).toHaveLength(0);
    expect(screen.getByTestId("collision-recover")).toBeInTheDocument();
    expect(screen.getByTestId("collision-forget")).toBeInTheDocument();
    expect(screen.getByTestId("collision-cancel")).toBeInTheDocument();
  });

  it("recovers the PREVIOUS request from the collision prompt", async () => {
    seedRecord(SCOPE_A);
    const { harness } = await loadedPage({
      keepStorage: true,
      simulate: [
        {
          status: 200,
          body: REAL_REPLAY_PAIR.replayed,
          headers: { "idempotency-replayed": "true" },
        },
      ],
    });
    const seeded = storedFor(SCOPE_A)!;
    await clickRun();
    await clickTestId("collision-recover");
    await waitFor(() => expect(harness.postCalls).toHaveLength(1));
    expect(keyOf(harness.postCalls[0])).toBe(seeded.idempotency_key);
  });

  it("cancels without sending or forgetting anything", async () => {
    const { harness } = await pageWithUnresolved();
    await clickRun();
    await clickTestId("collision-cancel");
    await settle();
    expect(harness.postCalls).toHaveLength(0);
    expect(storedFor(SCOPE_A)).not.toBeNull();
  });

  it("forgets on request, then lets a NEW run through with a NEW key", async () => {
    seedRecord(SCOPE_A);
    const { harness } = await loadedPage({
      keepStorage: true,
      simulate: [{ status: 200, body: REAL_1V1 }],
    });
    const seeded = storedFor(SCOPE_A)!;
    await clickRun();
    await clickTestId("collision-forget");
    await settle();
    expect(harness.postCalls).toHaveLength(0);

    await clickRun();
    await waitFor(() => expect(harness.postCalls).toHaveLength(1));
    expect(keyOf(harness.postCalls[0])).not.toBe(seeded.idempotency_key);
  });
});

// =========================================================================
// Leaving the page
// =========================================================================

describe("the leave guard", () => {
  it("is armed while a restored request is unresolved, and disarmed once it is not", async () => {
    const added: string[] = [];
    const removed: string[] = [];
    const realAdd = window.addEventListener.bind(window);
    const realRemove = window.removeEventListener.bind(window);
    vi.spyOn(window, "addEventListener").mockImplementation((type, ...rest) => {
      added.push(String(type));
      return realAdd(type as never, ...(rest as [never]));
    });
    vi.spyOn(window, "removeEventListener").mockImplementation((type, ...rest) => {
      removed.push(String(type));
      return realRemove(type as never, ...(rest as [never]));
    });

    seedRecord(SCOPE_A);
    await loadedPage({ keepStorage: true, simulate: [] });
    await screen.findByTestId("recovery-notice", {}, FIND);
    expect(added).toContain("beforeunload");

    await clickTestId("forget-recovery");
    await waitFor(() => expect(removed).toContain("beforeunload"));
  });

  it("tells the operator the request survives a reload, and does not claim it is cancelled", async () => {
    await loadedPage({
      simulate: [{ status: 0, throws: new TypeError("Failed to fetch") }],
    });
    await clickRun();
    const warning = await screen.findByTestId("uncertain-warning", {}, FIND);
    expect(warning).toHaveTextContent(/reload this tab/i);
    expect(warning).toHaveTextContent(/does not cancel the simulation/i);
    // The pre-4D sentence is now false and must be gone.
    expect(warning).not.toHaveTextContent(/reloading or leaving discards/i);
  });
});

// =========================================================================
// The recovery surface itself
// =========================================================================

describe("the recovery card", () => {
  it("summarises the request without exposing the key or the payload", async () => {
    const record = seedRecord(SCOPE_A);
    await loadedPage({ keepStorage: true, simulate: [] });
    const card = await screen.findByTestId("recovery-notice", {}, FIND);

    expect(card).toHaveTextContent("1v1");
    expect(card).toHaveTextContent(/1 credit/);
    // The idempotency key is an opaque handle with no operator meaning; on
    // screen it only invites screenshots and support threads.
    expect(card.textContent ?? "").not.toContain(record.idempotency_key);
    expect(card.textContent ?? "").not.toContain("contract_version");
  });

  it("keeps every line inside a 375px viewport", async () => {
    seedRecord(SCOPE_A);
    await loadedPage({ keepStorage: true, simulate: [] });
    const card = await screen.findByTestId("recovery-notice", {}, FIND);
    // jsdom has no layout, so this asserts the mechanism that prevents the
    // overflow rather than the pixels: the two fields that can carry
    // unbounded text (champion list, timestamp) must be allowed to wrap.
    const summary = screen.getByTestId("recovery-summary");
    for (const dd of Array.from(summary.querySelectorAll("dd"))) {
      expect(dd.className).toContain("break-words");
      expect(dd.className).toContain("min-w-0");
    }
    expect(card.querySelector(".flex-wrap")).not.toBeNull();
  });
});
