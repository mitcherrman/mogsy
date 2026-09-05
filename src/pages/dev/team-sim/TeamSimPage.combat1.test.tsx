/**
 * COMBAT1 — the Premium access contract, as the user meets it.
 *
 * The backend is authoritative: this page never decides entitlement, it only
 * renders what the server answered. What these tests protect is the difference
 * between the four answers a user can get, because the right next action is
 * different for each and getting them confused is the expensive mistake:
 *
 *   401 / 403   sign in with a real account       → identity, then Premium
 *   402 premium_required                          → the ONE upsell
 *   503 team_simulation_unavailable               → operational; NOT an upsell
 *   503 entitlement_unavailable                   → temporary; NOT an upsell
 *
 * The two negative properties matter more than the positive one. An
 * operationally closed deployment must never be turned into a sales
 * opportunity — the user cannot buy their way past it — and a member whose
 * membership merely could not be READ must never be shown a paywall for
 * something they already own.
 */
import { act, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  errorFromResponse,
  isPremiumRequired,
  isRecoverable,
  needsAccountBeforePremium,
  PREMIUM_ROUTE,
  UNCERTAIN_STATUS_WARNING,
} from "@/lib/combat-lab/team-sim/errors";
import { PREMIUM_ROUTE as CANONICAL_PREMIUM_ROUTE } from "@/lib/premium-routes";
import { REAL_ERRORS, REAL_ERROR_META } from "@/lib/combat-lab/team-sim/__fixtures__";

import { renderTeamSimPage } from "./testHarness";

vi.setConfig({ testTimeout: 45_000, hookTimeout: 45_000 });

const FIND = { timeout: 8_000 };

const PREMIUM_BODY = REAL_ERRORS["402_premium"];
const PREMIUM_STATUS = REAL_ERROR_META["402_premium"].status;
const ENTITLEMENT_BODY = REAL_ERRORS["503_entitlement"];
const ENTITLEMENT_STATUS = REAL_ERROR_META["503_entitlement"].status;
const OPERATIONAL_BODY = {
  detail: {
    code: "team_simulation_unavailable",
    message:
      "team simulation is not accepting requests on this deployment; " +
      "nothing was simulated and nothing was charged",
  },
};

async function loadedPage(options = {}) {
  const rendered = renderTeamSimPage(options);
  await screen.findByTestId("run-panel", {}, FIND);
  return rendered;
}

async function clickRun() {
  await act(async () => {
    screen.getByTestId("run-simulation").click();
  });
}

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  consoleError.mockRestore();
  vi.unstubAllEnvs();
});

// ── classification ──────────────────────────────────────────────────────────

describe("premium_required classification", () => {
  it("is told apart from insufficient_credits, which shares its status", () => {
    // The regression this pins: 402 defaults to `insufficient_credits` BY
    // STATUS, so without the code entry a Premium refusal would have rendered
    // as an empty daily balance and advised the user to come back tomorrow —
    // advice that never becomes true.
    const premium = errorFromResponse(PREMIUM_STATUS, PREMIUM_BODY);
    expect(premium.status).toBe(402);
    expect(premium.kind).toBe("premium_required");

    const credits = errorFromResponse(
      REAL_ERROR_META[402].status,
      REAL_ERRORS[402]
    );
    expect(credits.status).toBe(402);
    expect(credits.kind).toBe("insufficient_credits");
  });

  it("is a PROVEN refusal that offers no recovery control", () => {
    const error = errorFromResponse(PREMIUM_STATUS, PREMIUM_BODY);
    expect(error.certainty).toBe("rejected");
    expect(error.isUncertain).toBe(false);
    expect(isRecoverable(error)).toBe(false);
  });

  it("carries the backend's own message and upgrade path", () => {
    const error = errorFromResponse(PREMIUM_STATUS, PREMIUM_BODY);
    expect(error.code).toBe("premium_required");
    expect(error.message).toMatch(/nothing was simulated and nothing was charged/i);
    expect(JSON.stringify(error.detail)).toContain(PREMIUM_ROUTE);
  });

  it("discloses nothing about how entitlement is stored", () => {
    const raw = JSON.stringify(PREMIUM_BODY).toLowerCase();
    for (const leak of ["stripe", "is_pro", "profiles", "grant", "supabase"]) {
      expect(raw).not.toContain(leak);
    }
  });
});

describe("entitlement_unavailable classification", () => {
  it("is its own kind, never premium_required", () => {
    const error = errorFromResponse(ENTITLEMENT_STATUS, ENTITLEMENT_BODY);
    expect(error.kind).toBe("entitlement_unavailable");
    expect(isPremiumRequired(error)).toBe(false);
  });

  it("is a proven refusal, so nothing warns about an uncertain charge", () => {
    // Without the PROVEN_REFUSAL_CODES entry this 503 would inherit the 5xx
    // default of certainty "unknown", and the page would warn about a charge
    // status the backend can prove never existed.
    const error = errorFromResponse(ENTITLEMENT_STATUS, ENTITLEMENT_BODY);
    expect(error.certainty).toBe("rejected");
    expect(isRecoverable(error)).toBe(false);
  });

  it("does not borrow the deployment-off or ledger wording", () => {
    const error = errorFromResponse(ENTITLEMENT_STATUS, ENTITLEMENT_BODY);
    expect(error.message).not.toMatch(/could not record it/i);
    expect(error.message).not.toMatch(/configuration state/i);
  });
});

// ── the one upsell ──────────────────────────────────────────────────────────

describe("premium call to action", () => {
  it("appears for a Free member and points at /lol/premium", async () => {
    const { harness } = await loadedPage({
      simulate: [{ status: PREMIUM_STATUS, body: PREMIUM_BODY }],
    });
    await clickRun();

    const cta = await screen.findByTestId("premium-cta", {}, FIND);
    expect(cta).toHaveAttribute("href", "/lol/premium");
    // One click, one POST. A refusal must not become a second billable send.
    expect(harness.postCalls).toHaveLength(1);
  });

  it("uses the canonical Premium route constant, never /pro", () => {
    // /pro and /lol/pro are the Pro Play esports family, not the subscription.
    expect(PREMIUM_ROUTE).toBe(CANONICAL_PREMIUM_ROUTE);
    expect(PREMIUM_ROUTE).toBe("/lol/premium");
  });

  it("says what Free still gets, so the refusal is not a dead end", async () => {
    await loadedPage({
      simulate: [{ status: PREMIUM_STATUS, body: PREMIUM_BODY }],
    });
    await clickRun();
    await screen.findByTestId("premium-required", {}, FIND);
    expect(
      screen.getByText(/1v1 Combat Lab is free and unlimited/i)
    ).toBeInTheDocument();
  });

  it("does not re-send after the refusal", async () => {
    const { harness } = await loadedPage({
      simulate: [{ status: PREMIUM_STATUS, body: PREMIUM_BODY }],
    });
    await clickRun();
    await screen.findByTestId("premium-required", {}, FIND);

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });
    expect(harness.postCalls).toHaveLength(1);
  });
});

// ── what must NOT become an upsell ──────────────────────────────────────────

describe("an unavailable service is never an upsell", () => {
  it("shows the operational refusal with no Premium call to action", async () => {
    await loadedPage({
      simulate: [{ status: 503, body: OPERATIONAL_BODY }],
    });
    await clickRun();

    await screen.findByText(
      /nothing was simulated and nothing was charged/i, {}, FIND
    );
    expect(screen.queryByTestId("premium-required")).not.toBeInTheDocument();
    expect(screen.queryByTestId("premium-cta")).not.toBeInTheDocument();
  });

  it("shows an entitlement outage with no Premium call to action", async () => {
    await loadedPage({
      simulate: [{ status: ENTITLEMENT_STATUS, body: ENTITLEMENT_BODY }],
    });
    await clickRun();

    await screen.findByText(/could not be confirmed right now/i, {}, FIND);
    expect(screen.queryByTestId("premium-cta")).not.toBeInTheDocument();
    expect(screen.queryByText(UNCERTAIN_STATUS_WARNING)).not.toBeInTheDocument();
  });

  it("classifies only premium_required as an upsell", () => {
    for (const [status, body] of [
      [401, REAL_ERRORS[401]],
      [403, REAL_ERRORS[403]],
      [402, REAL_ERRORS[402]],
      [429, REAL_ERRORS[429]],
      [503, OPERATIONAL_BODY],
      [ENTITLEMENT_STATUS, ENTITLEMENT_BODY],
      [500, REAL_ERRORS[500]],
    ] as const) {
      expect(
        isPremiumRequired(errorFromResponse(status as number, body)),
        `${status} must not offer the Premium CTA`
      ).toBe(false);
    }
    expect(
      isPremiumRequired(errorFromResponse(PREMIUM_STATUS, PREMIUM_BODY))
    ).toBe(true);
  });
});

// ── the signed-out path ─────────────────────────────────────────────────────

describe("signed-out visitors", () => {
  it("are told about BOTH gates, and offered no CTA yet", async () => {
    // Otherwise a visitor signs in, runs again, and only then discovers a
    // second requirement. The next step is signing in, not buying, so the
    // hint appears and the Premium button does not.
    const { view } = await loadedPage({
      simulate: [{ status: REAL_ERROR_META[401].status, body: REAL_ERRORS[401] }],
    });
    await clickRun();

    const hint = await screen.findByTestId("premium-sign-in-hint", {}, FIND);
    expect(hint.textContent).toMatch(/sign in/i);
    expect(hint.textContent).toMatch(/premium/i);
    expect(hint.textContent).toMatch(/1v1 Combat Lab is free and unlimited/i);
    expect(screen.queryByTestId("premium-cta")).not.toBeInTheDocument();
    view.unmount();
  });

  it("classifies both identity refusals as needing an account first", () => {
    for (const key of [401, 403] as const) {
      const error = errorFromResponse(
        REAL_ERROR_META[key].status,
        REAL_ERRORS[key]
      );
      expect(needsAccountBeforePremium(error), String(key)).toBe(true);
      expect(isPremiumRequired(error), String(key)).toBe(false);
    }
    expect(
      needsAccountBeforePremium(errorFromResponse(PREMIUM_STATUS, PREMIUM_BODY))
    ).toBe(false);
  });

  it("can still read the catalog and the editor without signing in", async () => {
    // Discovery/preview stays open — a Free or signed-out user must be able to
    // understand what Team Combat IS without being able to execute it.
    await loadedPage();
    expect(screen.getByTestId("catalog-digest")).toBeInTheDocument();
    expect(screen.getByTestId("run-simulation")).toBeInTheDocument();
  });
});
