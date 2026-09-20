/**
 * FUNNEL1B2 — which surface emits which canonical event.
 *
 * The companion suite (src/lib/analytics/instrumentation.test.ts) proves the
 * dedupe boundary and the signup definition as RULES. This one proves the
 * WIRING: that the rules are attached to the real surfaces, and that the
 * specific mistakes the audit found are corrected in the code rather than only
 * described in a contract file.
 *
 * TWO KINDS OF ASSERTION, AND WHY BOTH
 *
 * The landing page is RENDERED, under StrictMode, because "exactly one event
 * per page entry" is a runtime property and StrictMode's double-invoke is the
 * exact failure it has to survive. It is also the event every other number in
 * the funnel is divided by, so it earns the setup cost.
 *
 * The remaining surfaces are asserted STATICALLY, by reading the source for an
 * emission call. Rendering Ranked, Meta Reflex, Mastery and DSA would mean
 * standing up an auth provider, a query client and several network doubles per
 * page — a large, brittle harness that would mostly be testing the harness. The
 * property that actually matters for them is "this surface emits this canonical
 * name and does not emit a name that belongs to the server", and the dedupe
 * behaviour they inherit is already proved twice over. A static check states
 * that honestly instead of dressing it up.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { StrictMode } from "react";
import { render, cleanup, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { installLocalStorageStub } from "@/test/localStorageStub";

// vi.mock factories are hoisted above every top-level binding, so the capture
// has to be hoisted with them.
const { tracked, captureTrack } = vi.hoisted(() => {
  const rows: { name: string; metadata?: Record<string, unknown> }[] = [];
  return {
    tracked: rows,
    captureTrack: (name: string, options?: { metadata?: Record<string, unknown> }) => {
      rows.push({ name, metadata: options?.metadata });
    },
  };
});

/**
 * The emitter is stubbed; the dedupe hook above it is NOT. A stub that also
 * replaced useSurfaceEvent would pass happily while StrictMode double-fired in
 * production, which is the one thing this file exists to catch.
 */
vi.mock("@/lib/analytics/track", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/analytics/track")>("@/lib/analytics/track");
  return { ...actual, track: captureTrack };
});

vi.mock("@/lib/analytics", async () => {
  const actual = await vi.importActual<typeof import("@/lib/analytics")>("@/lib/analytics");
  return { ...actual, track: captureTrack };
});

/** Chainable enough for any read the landing page's tree performs. */
function queryStub(): Record<string, unknown> {
  const result = Promise.resolve({ data: null, error: null });
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    in: () => chain,
    order: () => chain,
    limit: () => chain,
    maybeSingle: async () => ({ data: null, error: null }),
    single: async () => ({ data: null, error: null }),
    then: result.then.bind(result),
  };
  return chain;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: null } }),
      signInAnonymously: async () => ({ data: null, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
    from: () => queryStub(),
    rpc: async () => ({ data: null, error: null }),
  },
}));

import { resetSurfaceEventLedgerForTests } from "@/lib/analytics/useSurfaceEvent";
import { resetIdentityForTests } from "@/lib/analytics/identity";
import { RETIRED_EVENTS } from "@/lib/analytics/contract";

let resetStorage: () => void;

beforeEach(() => {
  resetStorage = installLocalStorageStub();
  resetIdentityForTests();
  resetSurfaceEventLedgerForTests();
  tracked.length = 0;
});

afterEach(() => {
  cleanup();
  resetStorage();
});

const names = () => tracked.map((t) => t.name);
const countOf = (name: string) => names().filter((n) => n === name).length;

function renderStrict(ui: React.ReactElement, route = "/") {
  return render(
    <StrictMode>
      <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
    </StrictMode>,
  );
}

const SRC = join(process.cwd(), "src");
const read = (relative: string) => readFileSync(join(SRC, relative), "utf8");

/**
 * Does this source EMIT this event name?
 *
 * Matches a name in the first argument position of an emitter call, so a
 * mention in prose — of which this phase's comments contain many, deliberately,
 * because the retirements need explaining — is not mistaken for a call site.
 */
function emits(source: string, eventName: string): boolean {
  return new RegExp(
    String.raw`(?:^|[^\w])(?:track|trackFunnelEvent|useSurfaceEvent|trackSurfaceOncePerSession)\(\s*"${eventName}"`,
  ).test(source);
}

/**
 * Every .ts/.tsx file under src/, excluding tests.
 *
 * `analyticsLibrary: false` drops src/lib/analytics/, whose job is to DEFINE
 * the vocabulary — its docblocks show callers what a `track("…")` call looks
 * like, and a scan for instrumentation should not read a usage example as an
 * instrumented surface.
 */
function productionSources(
  options: { analyticsLibrary?: boolean } = {},
): { path: string; source: string }[] {
  const includeLibrary = options.analyticsLibrary ?? true;
  const libraryDir = join(SRC, "lib", "analytics");
  const out: { path: string; source: string }[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.tsx?$/.test(entry) || /\.(test|spec)\.tsx?$/.test(entry)) continue;
      if (!includeLibrary && full.startsWith(libraryDir)) continue;
      out.push({ path: full, source: readFileSync(full, "utf8") });
    }
  };
  walk(SRC);
  return out;
}

// ---------------------------------------------------------------------------
// Landing — rendered, because the dedupe is the risk
// ---------------------------------------------------------------------------

describe("the root landing page", () => {
  const load = () => import("@/pages/dev/mogzy-entry-v2/MogzyEntryV2");

  it("emits exactly one landing_viewed under StrictMode", async () => {
    const { default: MogzyEntryV2 } = await load();
    renderStrict(<MogzyEntryV2 seo="root" />);

    await waitFor(() => expect(countOf("landing_viewed")).toBe(1));
  });

  it("stays silent on the dev preview mount of the same component", async () => {
    const { default: MogzyEntryV2 } = await load();
    renderStrict(<MogzyEntryV2 seo="dev" />);

    await new Promise((r) => setTimeout(r, 20));
    expect(names()).not.toContain("landing_viewed");
  });

  it("does not also claim to be the Hub", async () => {
    const { default: MogzyEntryV2 } = await load();
    renderStrict(<MogzyEntryV2 seo="root" />);

    await waitFor(() => expect(countOf("landing_viewed")).toBe(1));
    expect(names()).not.toContain("hub_entered");
  });

  it("still emits once after a remount, because the session has not changed", async () => {
    const { default: MogzyEntryV2 } = await load();
    const first = renderStrict(<MogzyEntryV2 seo="root" />);
    await waitFor(() => expect(countOf("landing_viewed")).toBe(1));
    first.unmount();

    renderStrict(<MogzyEntryV2 seo="root" />);
    await new Promise((r) => setTimeout(r, 20));
    expect(countOf("landing_viewed")).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// The canonical surfaces
// ---------------------------------------------------------------------------

describe("each canonical surface emits its own event, from its own file", () => {
  const WIRING: [file: string, event: string][] = [
    ["pages/dev/mogzy-entry-v2/MogzyEntryV2.tsx", "landing_viewed"],
    ["pages/LolHub.tsx", "hub_entered"],
    ["pages/Quiz.tsx", "leaguecraft_opened"],
    ["pages/Quiz.tsx", "practice_quiz_opened"],
    ["pages/quiz-ranked/QuizRankedPage.tsx", "ranked_opened"],
    ["pages/LeagueSwipeHub.tsx", "meta_reflex_opened"],
    ["pages/quiz-mastery/MasteryJourneysPage.tsx", "mastery_opened"],
    ["pages/QuizDailyScoreAttack.tsx", "dsa_opened"],
    ["pages/Auth.tsx", "signup_viewed"],
  ];

  it.each(WIRING)("%s emits %s", (file, event) => {
    expect(emits(read(file), event)).toBe(true);
  });

  it("emits each canonical surface event from exactly one file", () => {
    const surfaces = [
      "landing_viewed",
      "hub_entered",
      "leaguecraft_opened",
      "ranked_opened",
      "meta_reflex_opened",
      "mastery_opened",
      "dsa_opened",
    ];
    for (const event of surfaces) {
      const emitters = productionSources({ analyticsLibrary: false })
        .filter(({ source }) => emits(source, event))
        .map(({ path }) => path);
      expect(emitters, event).toHaveLength(1);
    }
  });
});

describe("the browser never claims what Railway owns", () => {
  it("emits no server-authoritative gameplay event from any source file", () => {
    const serverOwned = [
      "practice_quiz_started",
      "practice_quiz_completed",
      "ranked_started",
      "ranked_completed",
      "meta_reflex_started",
      "meta_reflex_completed",
      "mastery_started",
      "mastery_completed",
      "dsa_started",
      "dsa_completed",
    ];
    const offenders: string[] = [];
    for (const { path, source } of productionSources()) {
      for (const event of serverOwned) {
        if (emits(source, event)) offenders.push(`${path} → ${event}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The corrections
// ---------------------------------------------------------------------------

describe("retired legacy behaviour is gone from the codebase", () => {
  it("no source file emits any retired event name", () => {
    const offenders: string[] = [];
    for (const { path, source } of productionSources()) {
      for (const retired of Object.keys(RETIRED_EVENTS)) {
        if (emits(source, retired)) offenders.push(`${path} → ${retired}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the Hub emits hub_entered and no longer calls itself the landing page", () => {
    const hub = read("pages/LolHub.tsx");
    expect(emits(hub, "hub_entered")).toBe(true);
    expect(emits(hub, "lol_landing_viewed")).toBe(false);
    expect(emits(hub, "landing_viewed")).toBe(false);
  });

  it("the Leaguecraft CTA is diagnostic, and the page owns the canonical open", () => {
    const hub = read("pages/LolHub.tsx");
    const quiz = read("pages/Quiz.tsx");

    // The CTA records which door was used…
    expect(emits(hub, "leaguecraft_cta_clicked")).toBe(true);
    // …and does not stand in for the open, so a direct link counts identically.
    expect(emits(hub, "leaguecraft_opened")).toBe(false);
    expect(emits(quiz, "leaguecraft_opened")).toBe(true);
  });

  it("practice starts are no longer gated on the visitor being anonymous", () => {
    const quiz = read("pages/Quiz.tsx");
    // Both start paths, both unconditional; the retired name fired only for
    // guests and so hid every signed-in practice start.
    expect(quiz.match(/track\("practice_quiz_opened"/g)).toHaveLength(2);
    expect(emits(quiz, "quiz_guest_started")).toBe(false);
  });

  it("the duplicated completion event is gone", () => {
    const quiz = read("pages/Quiz.tsx");
    expect(quiz.match(/trackFunnelEvent\("quiz_completed"/g)).toHaveLength(1);
    expect(emits(quiz, "quiz_results_viewed")).toBe(false);
  });
});

describe("one signup, one canonical row", () => {
  it("signup_completed is emitted only by the analytics layer, never by a component", () => {
    const offenders = productionSources()
      .filter(({ source }) => emits(source, "signup_completed"))
      .map(({ path }) => path);

    // Exactly one producer: the module that owns the definition.
    expect(offenders).toEqual([join(SRC, "lib", "analytics", "signup.ts")]);
  });

  it("the guest-upgrade path reports a start but not a completion", () => {
    const upgrade = read("lib/auth/useAccountUpgrade.ts");
    expect(upgrade).toContain("trackSignupStarted(");
    // Completion for this path is detected centrally, so that the
    // verification-pending guest who converts days later is still counted.
    expect(upgrade).not.toContain("reportDirectSignupCompleted");
  });

  it("the signup form reports the brand-new-account case explicitly", () => {
    const auth = read("pages/Auth.tsx");
    expect(auth).toContain("reportDirectSignupCompleted(");
    expect(auth).toContain("trackSignupStarted(");
  });

  it("the identity observer is installed exactly once, in the auth provider", () => {
    const installers = productionSources()
      .filter(({ source }) => /observeAuthIdentity\(/.test(source))
      .filter(({ path }) => !path.endsWith(join("lib", "analytics", "signup.ts")))
      .filter(({ path }) => !path.endsWith(join("lib", "analytics", "index.ts")))
      .map(({ path }) => path);

    expect(installers).toEqual([join(SRC, "hooks", "useAuth.tsx")]);
  });
});
