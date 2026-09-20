/**
 * FUNNEL1B1 — the analytics foundation, behaviourally.
 *
 * Scope note: this suite proves the CLIENT half — identity, session policy,
 * attribution, the common fields on a row. The database half (the idempotency
 * index, the CHECKs, the RLS integrity rules) is proved against a real
 * Postgres in src/test/security/funnel1b1AnalyticsSchema.test.ts, because
 * asserting those from here could only ever restate the SQL back to itself.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { installLocalStorageStub } from "@/test/localStorageStub";

// ---------------------------------------------------------------------------
// Supabase double
// ---------------------------------------------------------------------------
//
// Records every write so the row under test can be inspected, and lets a test
// force a failure to prove the non-fatal / non-silent contract.

type Write = { table: string; row: Record<string, unknown> };

const writes: Write[] = [];
let failTable: string | null = null;
/** Set to make a table answer with a unique violation instead of a failure. */
let duplicateTable: string | null = null;
let authUser: { id: string; is_anonymous: boolean } | null = null;

function result(table: string) {
  if (duplicateTable === table) {
    return {
      data: null,
      error: { code: "23505", message: "duplicate key value violates unique constraint" },
    };
  }
  return failTable === table
    ? { data: null, error: { code: "XXXXX", message: `forced failure on ${table}` } }
    : { data: null, error: null };
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: async () => ({
        data: { session: authUser ? { user: authUser } : null },
      }),
    },
    from: (table: string) => ({
      insert: async (row: Record<string, unknown>) => {
        writes.push({ table, row });
        return result(table);
      },
    }),
  },
}));

import {
  EMPTY_TOUCH,
  hasUtm,
  readCurrentTouch,
  sameCampaign,
} from "./attribution";
import {
  MACRO_EVENTS,
  PRODUCT_EVENTS,
  EVENT_NAME_PATTERN,
  RETIRED_EVENTS,
  isKnownEvent,
  isRegisteredUser,
} from "./contract";
import {
  SESSION_INACTIVITY_MS,
  getSession,
  getVisitor,
  resetIdentityForTests,
} from "./identity";
import { getAnalyticsDiagnostics, resetAnalyticsDiagnostics } from "./runtime";
import { buildServerEventRow, trackAsync } from "./track";

let resetStorage: () => void;

function setUrl(path: string) {
  window.history.replaceState({}, "", path);
}

function setReferrer(value: string) {
  Object.defineProperty(document, "referrer", {
    value,
    configurable: true,
  });
}

beforeEach(() => {
  resetStorage = installLocalStorageStub();
  resetIdentityForTests();
  resetAnalyticsDiagnostics();
  writes.length = 0;
  failTable = null;
  duplicateTable = null;
  authUser = null;
  setUrl("/");
  setReferrer("");
});

afterEach(() => {
  resetStorage();
});

const eventRows = () => writes.filter((w) => w.table === "analytics_events");
const visitorRows = () => writes.filter((w) => w.table === "analytics_visitors");
const sessionRows = () => writes.filter((w) => w.table === "analytics_sessions");

// ---------------------------------------------------------------------------
// Visitor identity
// ---------------------------------------------------------------------------

describe("visitor id", () => {
  it("is a UUID that is stable across reads", () => {
    const first = getVisitor();
    const second = getVisitor();

    expect(first.visitorId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(second.visitorId).toBe(first.visitorId);
  });

  it("is new exactly once, then never again", () => {
    expect(getVisitor().isNew).toBe(true);
    expect(getVisitor().isNew).toBe(false);
    expect(getVisitor().isNew).toBe(false);
  });

  it("survives a simulated browser restart (storage outlives the module state)", () => {
    const before = getVisitor().visitorId;
    // A restart clears in-memory state but not localStorage.
    resetIdentityForTests();
    localStorage.setItem("mogzy.analytics.visitor.v1", before);

    expect(getVisitor().visitorId).toBe(before);
    expect(getVisitor().isNew).toBe(false);
  });

  it("still produces a working id when storage throws, and says it is ephemeral", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("site data blocked");
    });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("site data blocked");
    });

    const visitor = getVisitor();
    expect(visitor.visitorId).toBeTruthy();
    expect(visitor.ephemeral).toBe(true);
    // The failure is recorded rather than swallowed.
    expect(getAnalyticsDiagnostics().failureCount).toBeGreaterThan(0);

    vi.restoreAllMocks();
  });
});

// ---------------------------------------------------------------------------
// Session policy
// ---------------------------------------------------------------------------

describe("session policy", () => {
  it("keeps one session across route activity", () => {
    const t0 = 1_000_000;
    const a = getSession({ now: t0, touch: EMPTY_TOUCH });

    // Twenty route transitions over five minutes.
    let last = a;
    for (let i = 1; i <= 20; i += 1) {
      last = getSession({ now: t0 + i * 15_000, touch: EMPTY_TOUCH });
    }

    expect(last.sessionId).toBe(a.sessionId);
    expect(last.isNew).toBe(false);
  });

  it("holds the session at one millisecond short of the inactivity window", () => {
    const t0 = 1_000_000;
    const a = getSession({ now: t0, touch: EMPTY_TOUCH });
    const b = getSession({
      now: t0 + SESSION_INACTIVITY_MS - 1,
      touch: EMPTY_TOUCH,
    });

    expect(b.sessionId).toBe(a.sessionId);
  });

  it("starts a new session once the inactivity window elapses", () => {
    const t0 = 1_000_000;
    const a = getSession({ now: t0, touch: EMPTY_TOUCH });
    const b = getSession({ now: t0 + SESSION_INACTIVITY_MS, touch: EMPTY_TOUCH });

    expect(b.sessionId).not.toBe(a.sessionId);
    expect(b.isNew).toBe(true);
  });

  it("measures inactivity from the last activity, not from the session start", () => {
    const t0 = 1_000_000;
    const a = getSession({ now: t0, touch: EMPTY_TOUCH });
    // Active every 20 minutes for an hour: still one session.
    getSession({ now: t0 + 20 * 60_000, touch: EMPTY_TOUCH });
    getSession({ now: t0 + 40 * 60_000, touch: EMPTY_TOUCH });
    const d = getSession({ now: t0 + 60 * 60_000, touch: EMPTY_TOUCH });

    expect(d.sessionId).toBe(a.sessionId);
  });

  it("starts a new session on a new campaign arrival", () => {
    const t0 = 1_000_000;
    const a = getSession({
      now: t0,
      touch: { ...EMPTY_TOUCH, utm_source: "tiktok", utm_campaign: "launch" },
    });
    const b = getSession({
      now: t0 + 60_000,
      touch: { ...EMPTY_TOUCH, utm_source: "youtube", utm_campaign: "shorts" },
    });

    expect(b.sessionId).not.toBe(a.sessionId);
  });

  it("does NOT start a new session for an internal navigation with no UTM", () => {
    const t0 = 1_000_000;
    const a = getSession({
      now: t0,
      touch: { ...EMPTY_TOUCH, utm_source: "tiktok", utm_campaign: "launch" },
    });
    // The very next page has no query string, as every internal link does not.
    const b = getSession({ now: t0 + 1_000, touch: EMPTY_TOUCH });

    expect(b.sessionId).toBe(a.sessionId);
  });

  it("does NOT start a new session when the same campaign is re-seen", () => {
    const t0 = 1_000_000;
    const campaign = { ...EMPTY_TOUCH, utm_source: "tiktok", utm_campaign: "launch" };
    const a = getSession({ now: t0, touch: campaign });
    const b = getSession({ now: t0 + 1_000, touch: { ...campaign } });

    expect(b.sessionId).toBe(a.sessionId);
  });
});

// ---------------------------------------------------------------------------
// Attribution
// ---------------------------------------------------------------------------

describe("attribution parsing", () => {
  it("reads all five UTM parameters plus referrer and landing path", () => {
    const touch = readCurrentTouch(
      {
        search:
          "?utm_source=tiktok&utm_medium=social&utm_campaign=launch&utm_content=clip7&utm_term=adc",
        pathname: "/lol",
      },
      "https://www.tiktok.com/@mogzy",
    );

    expect(touch).toEqual({
      utm_source: "tiktok",
      utm_medium: "social",
      utm_campaign: "launch",
      utm_content: "clip7",
      utm_term: "adc",
      referrer: "https://www.tiktok.com/@mogzy",
      landing_path: "/lol",
    });
  });

  it("treats no query string and no referrer as direct (all null)", () => {
    const touch = readCurrentTouch({ search: "", pathname: "/" }, "");

    expect(hasUtm(touch)).toBe(false);
    expect(touch.referrer).toBeNull();
    expect(touch.landing_path).toBe("/");
  });

  it("keeps a referrer with no UTM, and does not invent a source for it", () => {
    const touch = readCurrentTouch(
      { search: "", pathname: "/" },
      "https://discord.com/channels/123",
    );

    expect(touch.referrer).toBe("https://discord.com/channels/123");
    // Raw only — no channel classification is performed in B1.
    expect(touch.utm_source).toBeNull();
    expect(touch.utm_medium).toBeNull();
  });

  it("caps oversized values to the database's CHECK limits", () => {
    const touch = readCurrentTouch(
      { search: `?utm_campaign=${"x".repeat(400)}`, pathname: "/" },
      `https://e.com/${"y".repeat(2000)}`,
    );

    expect(touch.utm_campaign).toHaveLength(255);
    expect(touch.referrer).toHaveLength(1024);
  });

  it("compares campaigns on UTM alone, ignoring referrer churn", () => {
    const a = { ...EMPTY_TOUCH, utm_source: "tiktok", referrer: "https://a.com" };
    const b = { ...EMPTY_TOUCH, utm_source: "tiktok", referrer: "https://b.com" };

    expect(sameCampaign(a, b)).toBe(true);
  });
});

describe("first-touch immutability", () => {
  it("writes the visitor row once and never again", async () => {
    setUrl("/?utm_source=tiktok&utm_campaign=launch");
    await trackAsync("landing_viewed");
    await trackAsync("hub_entered");
    await trackAsync("leaguecraft_opened");

    expect(visitorRows()).toHaveLength(1);
  });

  it("writes it as a plain insert keyed on the visitor", async () => {
    // NOT an upsert with a conflict target: under these tables' insert-only
    // RLS a named target is rejected outright. See the schema suite.
    await trackAsync("landing_viewed");

    const [row] = visitorRows();
    expect(row.row.visitor_id).toBe(getVisitor().visitorId);
  });

  it("treats a unique violation as success rather than a failure", async () => {
    duplicateTable = "analytics_visitors";
    await trackAsync("landing_viewed");

    expect(
      getAnalyticsDiagnostics().failures.some((f) =>
        f.op.includes("analytics_visitors"),
      ),
    ).toBe(false);
  });

  it("records the first campaign, and a later campaign does not replace it", async () => {
    setUrl("/?utm_source=tiktok&utm_campaign=launch");
    setReferrer("https://www.tiktok.com/@mogzy");
    await trackAsync("landing_viewed");

    const first = visitorRows()[0].row;
    expect(first.first_utm_source).toBe("tiktok");
    expect(first.first_utm_campaign).toBe("launch");

    // A later visit from a different campaign, same visitor.
    setUrl("/?utm_source=youtube&utm_campaign=shorts");
    setReferrer("https://youtube.com/");
    await trackAsync("hub_entered");

    // No second visitor row was even attempted.
    expect(visitorRows()).toHaveLength(1);
  });
});

describe("session / current-touch attribution", () => {
  it("changes when a later acquisition arrives, while first touch does not", async () => {
    setUrl("/?utm_source=tiktok&utm_campaign=launch");
    await trackAsync("landing_viewed");

    setUrl("/?utm_source=youtube&utm_campaign=shorts");
    await trackAsync("landing_viewed");

    const sessions = sessionRows();
    expect(sessions.length).toBeGreaterThanOrEqual(2);
    expect(sessions[0].row.utm_source).toBe("tiktok");
    expect(sessions[sessions.length - 1].row.utm_source).toBe("youtube");

    // …and exactly one visitor row, still on the first campaign.
    expect(visitorRows()).toHaveLength(1);
    expect(visitorRows()[0].row.first_utm_source).toBe("tiktok");
  });

  it("links the session row to the visitor", async () => {
    await trackAsync("landing_viewed");

    expect(sessionRows()[0].row.visitor_id).toBe(getVisitor().visitorId);
  });

  it("retries the session row on the next event when the first write fails", async () => {
    failTable = "analytics_sessions";
    await trackAsync("landing_viewed");
    expect(sessionRows()).toHaveLength(1);

    failTable = null;
    await trackAsync("hub_entered");
    // Retried rather than left permanently unattributed.
    expect(sessionRows()).toHaveLength(2);

    // …and once it lands, it is not written a third time.
    await trackAsync("ranked_opened");
    expect(sessionRows()).toHaveLength(2);
  });

  it("stops retrying when the retry finds the row already there", async () => {
    duplicateTable = "analytics_sessions";
    await trackAsync("landing_viewed");
    expect(sessionRows()).toHaveLength(1);

    // A lost response, not a lost write: the session is recorded, so the next
    // event must not try again.
    duplicateTable = null;
    await trackAsync("hub_entered");
    expect(sessionRows()).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Event common fields
// ---------------------------------------------------------------------------

describe("event common fields", () => {
  it("captures identity, route, source and timestamps without the caller supplying them", async () => {
    setUrl("/lol/ranked");
    authUser = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", is_anonymous: true };

    await trackAsync("ranked_opened");

    const row = eventRows()[0].row;
    expect(row.event_name).toBe("ranked_opened");
    expect(row.event_version).toBe(1);
    expect(row.route).toBe("/lol/ranked");
    expect(row.visitor_id).toBe(getVisitor().visitorId);
    expect(typeof row.session_id).toBe("string");
    expect(row.user_id).toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    expect(row.is_guest).toBe(true);
    expect(row.source_system).toBe("web");
    expect(typeof row.occurred_at).toBe("string");
    // received_at is the database's clock; the client must not set it.
    expect(row).not.toHaveProperty("received_at");
  });

  it("never claims server authority from the browser", async () => {
    await trackAsync("ranked_completed");

    const row = eventRows()[0].row;
    expect(row.source_system).toBe("web");
    expect(row.source_entity_type).toBeUndefined();
    expect(row.source_entity_id).toBeUndefined();
  });

  it("snapshots is_guest=false for a registered user", async () => {
    authUser = { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", is_anonymous: false };
    await trackAsync("signup_completed");

    expect(eventRows()[0].row.is_guest).toBe(false);
  });

  it("emits user_id null before any auth session exists (the landing page)", async () => {
    authUser = null;
    await trackAsync("landing_viewed");

    const row = eventRows()[0].row;
    expect(row.user_id).toBeNull();
    expect(row.is_guest).toBe(true);
  });

  it("shares one visitor and one session across a whole page flow", async () => {
    await trackAsync("landing_viewed");
    await trackAsync("hub_entered");
    await trackAsync("leaguecraft_opened");

    const ids = eventRows().map((w) => `${w.row.visitor_id}|${w.row.session_id}`);
    expect(new Set(ids).size).toBe(1);
  });

  it("carries caller metadata untouched", async () => {
    await trackAsync("ranked_opened", { metadata: { entry: "hub_tile", slot: 3 } });

    expect(eventRows()[0].row.metadata).toEqual({ entry: "hub_tile", slot: 3 });
  });
});

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

describe("event contract", () => {
  it("has no name the database's CHECK would reject", () => {
    for (const name of [...MACRO_EVENTS, ...PRODUCT_EVENTS]) {
      expect(EVENT_NAME_PATTERN.test(name), name).toBe(true);
    }
  });

  it("has no name in both the macro funnel and product telemetry", () => {
    const overlap = MACRO_EVENTS.filter((n) =>
      (PRODUCT_EVENTS as readonly string[]).includes(n),
    );
    expect(overlap).toEqual([]);
  });

  it("has no duplicate names", () => {
    const all = [...MACRO_EVENTS, ...PRODUCT_EVENTS];
    expect(new Set(all).size).toBe(all.length);
  });

  it("does not define a `returned` event — return is derived from sessions", () => {
    const all = [...MACRO_EVENTS, ...PRODUCT_EVENTS] as readonly string[];
    expect(all).not.toContain("returned");
    expect(all).not.toContain("visitor_returned");
  });

  /**
   * B2 replaced B1's emitter-level alias table with outright refusal. The
   * difference matters: an alias would let a reintroduced `lol_landing_viewed`
   * call site quietly contribute to `hub_entered` again, which is the exact
   * class of silent mis-definition the audit was about.
   */
  it("refuses every retired legacy name instead of translating it", async () => {
    for (const retired of Object.keys(RETIRED_EVENTS)) {
      await trackAsync(retired);
    }

    expect(eventRows()).toHaveLength(0);
    expect(
      getAnalyticsDiagnostics().failures.filter((f) => f.op === "contract:retired_event"),
    ).toHaveLength(Object.keys(RETIRED_EVENTS).length);
  });

  it("keeps every retired name out of the live vocabulary", () => {
    for (const retired of Object.keys(RETIRED_EVENTS)) {
      expect(isKnownEvent(retired), retired).toBe(false);
    }
  });

  it("names a real replacement for each retired event", () => {
    // The right-hand side is prose, but it must at least mention a name that
    // still exists, or the record is pointing at nothing.
    const live = [...MACRO_EVENTS, ...PRODUCT_EVENTS] as readonly string[];
    for (const [retired, replacement] of Object.entries(RETIRED_EVENTS)) {
      expect(live.some((name) => replacement.includes(name)), retired).toBe(true);
    }
  });

  it("refuses a name the database would reject, and says so to the developer", async () => {
    await trackAsync("Ranked Opened!");

    expect(eventRows()).toHaveLength(0);
    expect(
      getAnalyticsDiagnostics().failures.some((f) => f.op === "contract:event_name"),
    ).toBe(true);
  });

  it("still records an unknown-but-valid name, while flagging it", async () => {
    await trackAsync("some_future_event");

    expect(eventRows()).toHaveLength(1);
    expect(
      getAnalyticsDiagnostics().failures.some((f) => f.op === "contract:unknown_event"),
    ).toBe(true);
  });
});

describe("verification contract", () => {
  it("carries verification_type as a structured column, not buried in metadata", async () => {
    const { trackVerificationStarted, trackVerificationCompleted, trackVerificationFailed } =
      await import("./track");

    trackVerificationStarted("discord");
    trackVerificationCompleted("email");
    trackVerificationFailed("league_ign", "riot_timeout");
    await vi.waitFor(() => expect(eventRows()).toHaveLength(3));

    const [started, completed, failed] = eventRows().map((w) => w.row);
    expect([started.event_name, started.verification_type]).toEqual([
      "verification_started",
      "discord",
    ]);
    expect([completed.event_name, completed.verification_type]).toEqual([
      "verification_completed",
      "email",
    ]);
    expect([failed.event_name, failed.verification_type]).toEqual([
      "verification_failed",
      "league_ign",
    ]);
    expect(failed.metadata).toMatchObject({ reason: "riot_timeout" });
  });

  it("accepts a verification type that does not exist yet (open string, no enum)", async () => {
    const { trackVerificationCompleted } = await import("./track");
    trackVerificationCompleted("steam");
    await vi.waitFor(() => expect(eventRows()).toHaveLength(1));

    expect(eventRows()[0].row.verification_type).toBe("steam");
  });
});

describe("signup definition", () => {
  it("excludes anonymous users from `registered`", () => {
    expect(isRegisteredUser({ is_anonymous: true })).toBe(false);
    expect(isRegisteredUser({ is_anonymous: false })).toBe(true);
    expect(isRegisteredUser(null)).toBe(false);
    expect(isRegisteredUser(undefined)).toBe(false);
  });

  // B2 note: the `trackSignupCompleted` helper this used to exercise is gone.
  // Emitting `signup_completed` is now the sole responsibility of
  // analytics/signup.ts, so that one signup cannot produce two canonical rows;
  // the guest-upgrade flag and both detection paths are covered in
  // instrumentation.test.ts.
});

describe("server-authoritative rows", () => {
  it("builds the idempotency key the partial unique index enforces", () => {
    const row = buildServerEventRow({
      eventName: "ranked_completed",
      identity: {
        sourceSystem: "railway",
        entityType: "ranked_match",
        entityId: "match-42",
      },
      userId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      isGuest: false,
    });

    expect(row.source_system).toBe("railway");
    expect(row.source_entity_type).toBe("ranked_match");
    expect(row.source_entity_id).toBe("match-42");
  });

  it("keys per-participant events on the participant, not the match", () => {
    const rows = ["p1", "p2"].map((p) =>
      buildServerEventRow({
        eventName: "ranked_started",
        identity: {
          sourceSystem: "railway",
          entityType: "ranked_participant",
          entityId: p,
        },
      }),
    );

    // Distinct under the unique index, which is the whole point.
    const keys = rows.map(
      (r) =>
        `${r.source_system}|${r.event_name}|${r.source_entity_type}|${r.source_entity_id}`,
    );
    expect(new Set(keys).size).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Failure contract
// ---------------------------------------------------------------------------

describe("failure contract", () => {
  it("never throws when the insert fails, and records the failure", async () => {
    failTable = "analytics_events";

    await expect(trackAsync("hub_entered")).resolves.toBeUndefined();

    const diag = getAnalyticsDiagnostics();
    expect(diag.eventsSent).toBe(0);
    expect(diag.failures.some((f) => f.op === "insert:analytics_events")).toBe(true);
  });

  it("returns synchronously without waiting for the network", async () => {
    const { track } = await import("./track");
    const before = Date.now();
    expect(track("hub_entered")).toBeUndefined();
    expect(Date.now() - before).toBeLessThan(50);
  });

  it("still writes the event when the visitor row fails", async () => {
    failTable = "analytics_visitors";
    await trackAsync("landing_viewed");

    expect(eventRows()).toHaveLength(1);
  });
});
