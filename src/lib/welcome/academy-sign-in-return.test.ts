/**
 * The register's Sign In actually lands the visitor at /lol (HI1-C5B).
 *
 * The page test proves the introduction NAVIGATES to ACADEMY_SIGN_IN_ROUTE.
 * That is only half a return destination: the other half is that /auth reads
 * the parameter, validates it, and goes there — and if any link in that chain
 * changes, a returning account holder silently lands at /auth's own default
 * instead, which is a bug nobody would notice from either side alone. This
 * suite is the join.
 *
 * `safeReturnPath` is exercised for real; Auth.tsx is read as source, in the
 * style of App.routing-contract.test.ts, because the declaration IS the
 * contract and rendering that whole screen would prove less.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { ACADEMY_SIGN_IN_ROUTE } from "./academy-registration";
import { safeReturnPath } from "@/lib/auth/safe-return";
import { LEAGUE_HOME_ROUTE } from "@/lib/site-config";

const authSource = readFileSync(resolve(__dirname, "../../pages/Auth.tsx"), "utf8");

/** The parameters exactly as /auth would parse them off the URL. */
const params = new URLSearchParams(ACADEMY_SIGN_IN_ROUTE.slice(ACADEMY_SIGN_IN_ROUTE.indexOf("?")));

describe("the sign-in hand-off", () => {
  it("targets the app's real auth route", () => {
    expect(ACADEMY_SIGN_IN_ROUTE.startsWith("/auth?")).toBe(true);
  });

  it("opens it in sign-in mode, not sign-up", () => {
    // This person says they already have an account. Landing them on a signup
    // form would be answering a different question than the one they pressed.
    expect(params.get("mode")).toBe("signin");
    expect(authSource).toContain('searchParamsInit.get("mode") === "signup"');
  });

  it("asks to return to the hub", () => {
    expect(params.get("returnTo")).toBe(LEAGUE_HOME_ROUTE);
    expect(LEAGUE_HOME_ROUTE).toBe("/lol");
  });

  it("survives the open-redirect guard that /auth puts it through", () => {
    // safeReturnPath silently swaps anything it does not like for a fallback.
    // A destination that fails it is a destination that never happens.
    expect(safeReturnPath(params.get("returnTo"), "/somewhere-else")).toBe(LEAGUE_HOME_ROUTE);
  });

  it("is read, validated and navigated to by /auth on a successful sign-in", () => {
    // AUTH2: this asserted the pre-AUTH1 call shape
    // `safeReturnPath(searchParams.get("returnTo")`. /auth now goes through
    // resolveReturnTo, which calls safeReturnPath itself AND reports whether
    // the destination was explicit — the flag that stops onboarding overriding
    // a chosen destination. The behaviour this suite exists to pin is
    // unchanged (proved by the safeReturnPath case above); only the name of the
    // function /auth calls moved, so the assertion follows it.
    expect(authSource).toContain('resolveReturnTo(searchParams.get("returnTo")');
    expect(authSource).toContain("navigate(safeReturnTo");
  });

  it("never carries a returning visitor back into the introduction", () => {
    // Chapters three to five are for someone meeting Mogzy. The one thing this
    // destination must never be is /welcome.
    expect(params.get("returnTo")).not.toContain("/welcome");
  });
});
