/**
 * FUNNEL1B2 — the instrumentation contract.
 *
 * Two things are proved here that a page-level render test cannot prove
 * cheaply, and that are the two ways this phase could quietly produce a wrong
 * dataset:
 *
 *   1. the dedupe boundary — one surface event per session, surviving
 *      StrictMode, rerenders, remounts and route churn, while still firing
 *      again for a genuinely new session;
 *   2. the signup definition — `signup_completed` on a real anonymous →
 *      registered transition and on nothing else, in particular not on an
 *      anonymous session appearing and not on an ordinary sign-in.
 *
 * The page wiring itself (which component calls which event) is asserted in
 * src/test/funnel/canonicalSurfaces.test.tsx by rendering the real routes.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { installLocalStorageStub } from "@/test/localStorageStub";

type Write = { table: string; row: Record<string, unknown> };
const writes: Write[] = [];
let authUser: { id: string; is_anonymous: boolean } | null = null;

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
        return { data: null, error: null };
      },
    }),
  },
}));

import { SESSION_INACTIVITY_MS, getSession, resetIdentityForTests } from "./identity";
import { EMPTY_TOUCH } from "./attribution";
import { resetAnalyticsDiagnostics } from "./runtime";
import {
  trackSurfaceOncePerSession,
  resetSurfaceEventLedgerForTests,
} from "./useSurfaceEvent";
import {
  observeAuthIdentity,
  reportDirectSignupCompleted,
  trackSignupStarted,
  resetSignupObserverForTests,
} from "./signup";

let resetStorage: () => void;

const GUEST = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const events = () => writes.filter((w) => w.table === "analytics_events");
const names = () => events().map((w) => w.row.event_name);

/** Let the emitter's fire-and-forget promise chain settle. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  resetStorage = installLocalStorageStub();
  resetIdentityForTests();
  resetSurfaceEventLedgerForTests();
  resetSignupObserverForTests();
  resetAnalyticsDiagnostics();
  writes.length = 0;
  authUser = null;
  window.history.replaceState({}, "", "/");
});

afterEach(() => resetStorage());

// ---------------------------------------------------------------------------
// Dedupe
// ---------------------------------------------------------------------------

describe("surface event dedupe", () => {
  it("emits once no matter how many times the surface re-announces itself", async () => {
    // StrictMode double-invoke, a rerender, an auth hydration pass, a remount.
    for (let i = 0; i < 12; i += 1) trackSurfaceOncePerSession("landing_viewed");
    await flush();

    expect(names()).toEqual(["landing_viewed"]);
  });

  it("reports whether it actually emitted, so a caller cannot be misled", () => {
    expect(trackSurfaceOncePerSession("hub_entered")).toBe(true);
    expect(trackSurfaceOncePerSession("hub_entered")).toBe(false);
  });

  it("does not suppress a DIFFERENT surface in the same session", async () => {
    trackSurfaceOncePerSession("landing_viewed");
    trackSurfaceOncePerSession("hub_entered");
    trackSurfaceOncePerSession("leaguecraft_opened");
    await flush();

    expect(names()).toEqual(["landing_viewed", "hub_entered", "leaguecraft_opened"]);
  });

  it("counts a surface again in a genuinely new session", async () => {
    const t0 = 1_000_000;
    getSession({ now: t0, touch: EMPTY_TOUCH });
    trackSurfaceOncePerSession("hub_entered");
    await flush();
    expect(names()).toEqual(["hub_entered"]);

    // Thirty-one minutes later: a new visit, not a rerender.
    getSession({ now: t0 + SESSION_INACTIVITY_MS + 1, touch: EMPTY_TOUCH });
    trackSurfaceOncePerSession("hub_entered");
    await flush();

    expect(names()).toEqual(["hub_entered", "hub_entered"]);
    const [first, second] = events();
    expect(first.row.session_id).not.toBe(second.row.session_id);
  });

  it("counts a surface again after a new campaign arrival", async () => {
    window.history.replaceState({}, "", "/?utm_source=tiktok");
    trackSurfaceOncePerSession("landing_viewed");
    await flush();

    window.history.replaceState({}, "", "/?utm_source=youtube");
    trackSurfaceOncePerSession("landing_viewed");
    await flush();

    expect(names()).toEqual(["landing_viewed", "landing_viewed"]);
  });

  it("separates surfaces that share a name but not a key", async () => {
    trackSurfaceOncePerSession("signup_viewed", { key: "/quiz" });
    trackSurfaceOncePerSession("signup_viewed", { key: "/quiz" });
    trackSurfaceOncePerSession("signup_viewed", { key: "/quiz/ranked" });
    await flush();

    expect(names()).toHaveLength(2);
  });

  it("is not global suppression — the visitor id is unchanged across sessions", async () => {
    const t0 = 1_000_000;
    getSession({ now: t0, touch: EMPTY_TOUCH });
    trackSurfaceOncePerSession("landing_viewed");
    await flush();
    getSession({ now: t0 + SESSION_INACTIVITY_MS + 1, touch: EMPTY_TOUCH });
    trackSurfaceOncePerSession("landing_viewed");
    await flush();

    const [a, b] = events();
    expect(a.row.visitor_id).toBe(b.row.visitor_id);
  });
});

// ---------------------------------------------------------------------------
// Signup definition
// ---------------------------------------------------------------------------

describe("signup completion — the anon → registered transition", () => {
  it("does NOT fire when an anonymous session appears", async () => {
    observeAuthIdentity(null);
    observeAuthIdentity({ id: GUEST, is_anonymous: true });
    await flush();

    expect(names()).toEqual([]);
  });

  it("does NOT fire on a plain sign-in with no prior guest session", async () => {
    // A returning user on a new device: no local state, a registered user
    // simply appears. This is the case that would inflate the metric if the
    // observer treated "registered where there was none" as a signup.
    observeAuthIdentity(null);
    observeAuthIdentity({ id: OTHER, is_anonymous: false });
    await flush();

    expect(names()).toEqual([]);
  });

  it("does NOT fire on a page load that merely finds a registered user", async () => {
    observeAuthIdentity({ id: OTHER, is_anonymous: false });
    observeAuthIdentity({ id: OTHER, is_anonymous: false });
    observeAuthIdentity({ id: OTHER, is_anonymous: false });
    await flush();

    expect(names()).toEqual([]);
  });

  it("fires exactly once on a real guest upgrade", async () => {
    authUser = { id: GUEST, is_anonymous: true };
    observeAuthIdentity({ id: GUEST, is_anonymous: true });

    authUser = { id: GUEST, is_anonymous: false };
    const fired = observeAuthIdentity({ id: GUEST, is_anonymous: false });
    await flush();

    expect(fired).toBe(true);
    expect(names()).toEqual(["signup_completed"]);
    expect(events()[0].row.metadata).toMatchObject({
      upgraded_from_guest: true,
      detected_by: "auth_identity_transition",
    });
  });

  it("does not fire a second time on any later auth event for that account", async () => {
    observeAuthIdentity({ id: GUEST, is_anonymous: true });
    observeAuthIdentity({ id: GUEST, is_anonymous: false });
    // Token refresh, tab focus, reload, a second tab.
    observeAuthIdentity({ id: GUEST, is_anonymous: false });
    observeAuthIdentity(null);
    observeAuthIdentity({ id: GUEST, is_anonymous: false });
    await flush();

    expect(names()).toEqual(["signup_completed"]);
  });

  it("survives a reload between the two halves of the transition", async () => {
    observeAuthIdentity({ id: GUEST, is_anonymous: true });
    // The observer keeps NO module state — everything it compares against is in
    // localStorage, which is exactly what survives a reload. This is the
    // email-confirmation path: the guest left, came back days later, and is now
    // registered with no signup form alive anywhere to notice.
    observeAuthIdentity({ id: GUEST, is_anonymous: false });
    await flush();

    expect(names()).toEqual(["signup_completed"]);
  });

  it("attributes the upgrade to the same uid the guest had — continuity is preserved", async () => {
    authUser = { id: GUEST, is_anonymous: true };
    observeAuthIdentity({ id: GUEST, is_anonymous: true });
    authUser = { id: GUEST, is_anonymous: false };
    observeAuthIdentity({ id: GUEST, is_anonymous: false });
    await flush();

    expect(events()[0].row.user_id).toBe(GUEST);
    expect(events()[0].row.is_guest).toBe(false);
  });
});

describe("signup completion — a brand-new registered account", () => {
  it("is reported by the form, with upgraded_from_guest false", async () => {
    authUser = { id: OTHER, is_anonymous: false };
    reportDirectSignupCompleted({
      userId: OTHER,
      method: "email",
      entrySurface: "ranked",
      returnTo: "/quiz/ranked",
    });
    await flush();

    expect(names()).toEqual(["signup_completed"]);
    expect(events()[0].row.metadata).toMatchObject({
      upgraded_from_guest: false,
      entry_surface: "ranked",
      detected_by: "signup_form",
    });
  });

  it("cannot be double-counted by the observer seeing the same account afterwards", async () => {
    reportDirectSignupCompleted({ userId: OTHER, method: "email" });
    observeAuthIdentity({ id: OTHER, is_anonymous: false });
    observeAuthIdentity({ id: OTHER, is_anonymous: false });
    await flush();

    expect(names()).toEqual(["signup_completed"]);
  });

  it("cannot be double-counted by a repeated form report", async () => {
    reportDirectSignupCompleted({ userId: OTHER });
    reportDirectSignupCompleted({ userId: OTHER });
    await flush();

    expect(names()).toEqual(["signup_completed"]);
  });
});

describe("signup_started", () => {
  it("records the surface and whether the submitter was a guest", async () => {
    trackSignupStarted({
      entrySurface: "guest_upgrade",
      fromGuest: true,
      returnTo: "/quiz",
    });
    await flush();

    expect(names()).toEqual(["signup_started"]);
    expect(events()[0].row.metadata).toMatchObject({
      entry_surface: "guest_upgrade",
      from_guest: true,
      return_to: "/quiz",
    });
  });

  it("is not deduped — two genuine attempts are two events", async () => {
    trackSignupStarted({ entrySurface: "guest_upgrade", fromGuest: true });
    trackSignupStarted({ entrySurface: "guest_upgrade", fromGuest: true });
    await flush();

    expect(names()).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Attribution through a realistic visit sequence
// ---------------------------------------------------------------------------

describe("attribution across real navigation", () => {
  const visitorRow = () => writes.find((w) => w.table === "analytics_visitors");
  const sessionRows = () => writes.filter((w) => w.table === "analytics_sessions");

  it("1. direct visit — no campaign, landing path recorded", async () => {
    window.history.replaceState({}, "", "/");
    trackSurfaceOncePerSession("landing_viewed");
    await flush();

    expect(visitorRow()!.row).toMatchObject({
      first_utm_source: null,
      first_referrer: null,
      first_landing_path: "/",
    });
  });

  it("2. UTM visit — first touch and session touch both record the campaign", async () => {
    window.history.replaceState({}, "", "/?utm_source=tiktok&utm_medium=social&utm_campaign=launch");
    trackSurfaceOncePerSession("landing_viewed");
    await flush();

    expect(visitorRow()!.row).toMatchObject({
      first_utm_source: "tiktok",
      first_utm_medium: "social",
      first_utm_campaign: "launch",
    });
    expect(sessionRows()[0].row).toMatchObject({ utm_source: "tiktok" });
  });

  it("3. later return with no UTM — first touch survives, session is direct", async () => {
    window.history.replaceState({}, "", "/?utm_source=tiktok&utm_campaign=launch");
    trackSurfaceOncePerSession("landing_viewed");
    await flush();

    // A new session tomorrow, typed straight in.
    const later = Date.now() + SESSION_INACTIVITY_MS + 1;
    window.history.replaceState({}, "", "/");
    getSession({ now: later, touch: EMPTY_TOUCH });
    resetSurfaceEventLedgerForTests();
    trackSurfaceOncePerSession("landing_viewed");
    await flush();

    // One visitor row, still TikTok's.
    expect(writes.filter((w) => w.table === "analytics_visitors")).toHaveLength(1);
    expect(visitorRow()!.row.first_utm_source).toBe("tiktok");
    // Two sessions, the second with no campaign.
    expect(sessionRows()).toHaveLength(2);
    expect(sessionRows()[1].row.utm_source).toBeNull();
  });

  it("4. later return from a DIFFERENT campaign — session touch changes, first touch does not", async () => {
    window.history.replaceState({}, "", "/?utm_source=tiktok&utm_campaign=launch");
    trackSurfaceOncePerSession("landing_viewed");
    await flush();

    window.history.replaceState({}, "", "/?utm_source=youtube&utm_campaign=shorts");
    resetSurfaceEventLedgerForTests();
    trackSurfaceOncePerSession("landing_viewed");
    await flush();

    expect(visitorRow()!.row.first_utm_source).toBe("tiktok");
    expect(sessionRows().at(-1)!.row.utm_source).toBe("youtube");
  });

  it("5. guest → signup — one visitor, one session, both sides of the conversion", async () => {
    window.history.replaceState({}, "", "/?utm_source=tiktok");
    authUser = { id: GUEST, is_anonymous: true };
    trackSurfaceOncePerSession("landing_viewed");
    trackSurfaceOncePerSession("hub_entered");
    observeAuthIdentity({ id: GUEST, is_anonymous: true });

    trackSignupStarted({ entrySurface: "guest_upgrade", fromGuest: true });
    // Settle the guest-side writes before the identity flips. The emitter reads
    // auth state asynchronously, so without this the whole batch would resolve
    // against the post-upgrade session and the is_guest snapshot below would be
    // testing the test's sequencing rather than the product's.
    await flush();

    authUser = { id: GUEST, is_anonymous: false };
    observeAuthIdentity({ id: GUEST, is_anonymous: false });
    await flush();

    expect(names()).toEqual([
      "landing_viewed",
      "hub_entered",
      "signup_started",
      "signup_completed",
    ]);

    // The whole conversion is one visitor and one session, so it is joinable
    // back to the TikTok click that produced it.
    const ids = events().map((w) => `${w.row.visitor_id}|${w.row.session_id}`);
    expect(new Set(ids).size).toBe(1);
    expect(visitorRow()!.row.first_utm_source).toBe("tiktok");

    // And the guest-ness snapshot flips across the boundary on the same uid.
    const started = events().find((w) => w.row.event_name === "signup_started")!;
    const completed = events().find((w) => w.row.event_name === "signup_completed")!;
    expect(started.row.is_guest).toBe(true);
    expect(completed.row.is_guest).toBe(false);
    expect(started.row.user_id).toBe(completed.row.user_id);
  });
});
