/**
 * USERS1 — the guard.
 *
 * Every property here was true before and stopped being true without anyone
 * noticing, which is the only kind of rule worth a guard test. It scans ACTIVE
 * RUNTIME SOURCE only: comments are stripped so prose describing the old
 * behaviour cannot fail the build, test files are excluded because they
 * legitimately name what they mock, and `supabase/migrations/**` is excluded
 * because migration history is a record and must stay writable.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const SRC = resolve(__dirname, "../..");

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

const isTest = (p: string) => /\.test\.tsx?$/.test(p) || /[\\/]test[\\/]/.test(p);

/** Active runtime source, comments stripped, as { path, code }. */
const RUNTIME = walk(SRC)
  .filter((p) => !isTest(p))
  .map((p) => ({
    path: relative(SRC, p).replace(/\\/g, "/"),
    code: readFileSync(p, "utf8")
      .replace(/\/\/.*$/gm, "")
      .replace(/\/\*[\s\S]*?\*\//g, ""),
  }));

// ---------------------------------------------------------------------------
// 1. Identity creation
// ---------------------------------------------------------------------------

describe("USERS1 guard · a page visit is not a user account", () => {
  /**
   * The rule that stops the 5,000 anonymous identities coming back.
   *
   * `signInAnonymously` has exactly one caller in the product. Anything else
   * that wants an identity goes through `ensureAnonymousIdentity`, which
   * documents every boundary and single-flights them.
   */
  it("calls signInAnonymously from exactly one module", () => {
    const callers = RUNTIME.filter((f) => /signInAnonymously\s*\(/.test(f.code)).map((f) => f.path);
    expect(callers).toEqual(["lib/auth/anonymous-identity.ts"]);
  });

  it("does not mint an identity from the auth provider's boot sequence", () => {
    const useAuth = RUNTIME.find((f) => f.path === "hooks/useAuth.tsx")!;
    expect(useAuth.code).not.toMatch(/signInAnonymously/);
  });

  it("does not mint an identity from any page's mount effect", () => {
    for (const page of [
      "pages/LolHub.tsx",
      "pages/Quiz.tsx",
      "pages/CombatLab.tsx",
      "pages/LeagueSwipeGame.tsx",
    ]) {
      const file = RUNTIME.find((f) => f.path === page);
      expect(file, page).toBeTruthy();
      expect(file!.code, page).not.toMatch(/signInAnonymously/);
    }
  });

  /**
   * Meta Reflex is the one page that still mints, and it must do it at the
   * VOTE — a durable per-voter write the RPC keys on auth.uid() — and not on
   * mount. The positive half of the guard: deleting this call would silently
   * stop anonymous playtesters' votes counting toward community ranking.
   */
  it("keeps Meta Reflex's mint at the vote, where the write actually is", () => {
    const page = RUNTIME.find((f) => f.path === "pages/LeagueSwipeGame.tsx")!;
    expect(page.code).toMatch(/ensureAnonymousIdentity\("meta_reflex_vote"\)/);
    // lastIndexOf, not indexOf: the first occurrence is the import.
    const mintAt = page.code.lastIndexOf("ensureAnonymousIdentity");
    const handlerAt = page.code.indexOf("const handleChoose");
    expect(handlerAt).toBeGreaterThan(-1);
    expect(mintAt).toBeGreaterThan(handlerAt);
  });

  it("reads user-owned data with the non-minting helper", () => {
    for (const reader of [
      "pages/LolHistory.tsx",
      "components/profile/LeagueProfileStats.tsx",
      "components/quiz/workspace/useMissedQuestions.ts",
    ]) {
      const file = RUNTIME.find((f) => f.path === reader)!;
      expect(file.code, reader).toMatch(/getExistingBackendAuthToken/);
      expect(file.code, reader).not.toMatch(/ensureBackendAuthToken/);
    }
  });

  it("keeps analytics free of auth entirely — the funnel is recorded for a session-less browser", () => {
    for (const file of RUNTIME.filter((f) => f.path.startsWith("lib/analytics/"))) {
      expect(file.code, file.path).not.toMatch(/signInAnonymously|ensureAnonymousIdentity/);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Traffic classification
// ---------------------------------------------------------------------------

describe("USERS1 guard · classification is metadata, never authorization", () => {
  /**
   * The rule that keeps this honest. `traffic_class` decides which KPI a
   * visitor is counted in and nothing else. The moment a gate, an entitlement
   * or a rate limit reads it, a self-reported value becomes a privilege, and a
   * marker that exists so our own agents can EXCLUDE themselves becomes a way
   * in.
   */
  it("is read by no gate, entitlement or rate limiter", () => {
    const readers = RUNTIME.filter((f) => /traffic_class|trafficClass/.test(f.code)).map(
      (f) => f.path,
    );
    for (const path of readers) {
      expect(
        /^(lib\/analytics\/|lib\/admin\/analytics\/|lib\/admin\/admin-registry\.ts$|components\/admin\/users\/|pages\/admin\/areas\/AdminUsersPage)/.test(
          path,
        ),
        `${path} reads the traffic class outside the analytics surface`,
      ).toBe(true);
    }
  });

  it("promotes to human from exactly one module, through the RPC", () => {
    const callers = RUNTIME.filter((f) =>
      /analytics_promote_session_human/.test(f.code),
    ).map((f) => f.path);
    // schema.ts DECLARES the function's type at the typed seam; track.ts is
    // the only module that calls it.
    expect(callers.sort()).toEqual(["lib/analytics/schema.ts", "lib/analytics/track.ts"]);
    const track = RUNTIME.find((f) => f.path === "lib/analytics/track.ts")!;
    expect(track.code).toMatch(/\.rpc\("analytics_promote_session_human"/);
  });
});

// ---------------------------------------------------------------------------
// 3. Admin IA
// ---------------------------------------------------------------------------

describe("USERS1 guard · one Users domain", () => {
  const registry = RUNTIME.find((f) => f.path === "lib/admin/admin-registry.ts")!.code;
  const app = RUNTIME.find((f) => f.path === "App.tsx")!.code;

  it("has no People or Analytics area, and no page for either", () => {
    expect(registry).not.toMatch(/id:\s*"people"/);
    expect(registry).not.toMatch(/id:\s*"analytics"/);
    expect(app).not.toMatch(/AdminPeoplePage|AdminAnalyticsPage/);
    for (const f of RUNTIME) {
      expect(f.path).not.toMatch(/AdminPeoplePage|AdminAnalyticsPage/);
    }
  });

  it("declares Users, and Ranked as a section of Leaguecraft rather than an area", () => {
    expect(registry).toMatch(/id:\s*"users"/);
    expect(registry).not.toMatch(/id:\s*"ranked",\n\s*label:\s*"Ranked",\n\s*path:/);
    expect(app).toMatch(/path="users" element=\{<Suspense/);
  });

  it("keeps the three retired paths resolving as redirects and nothing more", () => {
    for (const [from, to] of [
      ["analytics", "/admin/users"],
      ["people", "/admin/users?section=accounts"],
      ["ranked", "/admin/leaguecraft?section=ranked"],
    ]) {
      expect(app, from).toContain(`<Route path="${from}" element={<Navigate to="${to}" replace />} />`);
    }
  });

  it("advertises no destination under the retired paths", () => {
    expect(registry).not.toMatch(/path:\s*"\/admin\/(people|analytics)[?"]/);
  });
});
