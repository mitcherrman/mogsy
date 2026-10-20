/**
 * Academy Core V3 — production route wiring, pinned against the source.
 *
 * Same technique as App.routing-contract.test.ts: App mounts its own router
 * and providers, so the declaration is the contract. What matters here is
 * that `/lol` is the Core, the previous Home Hub (and Academy Commons) is kept
 * whole at `/lol/hall`, the preview URLs redirect home, the Landing hands off
 * to the Core's warm — not the Hall's — and nothing outside the home moved.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = resolve(__dirname, "../..");
const read = (rel: string) => readFileSync(resolve(SRC, rel), "utf8");

const APP = read("App.tsx");
const LAYOUT = read("components/Layout.tsx");
const FOOTER = read("components/Footer.tsx");
const INDEX_CSS = read("index.css");
const PREFETCH = read("lib/route-prefetch.ts");
const LANDING = read("pages/dev/mogzy-entry-v2/MogzyEntryV2.tsx");
const HALL = read("pages/LolHub.tsx");

function routeLine(path: string): string {
  const line = APP.split("\n").find((l) => l.includes(`path="${path}"`) && l.includes("<Route"));
  if (!line) throw new Error(`no <Route> declared for ${path}`);
  return line;
}

describe("/lol is the Academy Core", () => {
  it("renders the Core at /lol through the shared lazy route, with the hero-height fallback", () => {
    expect(APP).toContain("const AcademyCore = R.AcademyCore.Component;");
    expect(routeLine("/lol")).toContain("<AcademyCore />");
    expect(routeLine("/lol")).toContain("<AcademyCoreFallback />");
    expect(PREFETCH).toContain('AcademyCore: lazyWithRetry(() => import("@/pages/academy-core/AcademyCorePage"))');
  });

  it("keeps the previous Home Hub, with Academy Commons, whole at /lol/hall", () => {
    expect(routeLine("/lol/hall")).toContain("<LolHub />");
  });

  it("redirects the preview URLs to the home", () => {
    expect(routeLine("/lol/dev/academy-core")).toMatch(/<Navigate to="\/lol" replace \/>/);
    expect(routeLine("/dev/academy-core")).toMatch(/<Navigate to="\/lol" replace \/>/);
  });

  it("is a full-bleed scene inside the existing shell, as the Hall still is", () => {
    expect(LAYOUT).toContain('pathname === "/lol" || pathname === "/lol/hall"');
    expect(LAYOUT).not.toContain("/lol/dev/academy-core");
    expect(FOOTER).toContain('pathname === "/lol/hall"');
  });

  it("the entrance still owns /", () => {
    expect(APP).toMatch(/path="\/"\s*\n\s*element=\{<Suspense[^\n]*<MogzyEntryV2 seo="root" autoEnter \/>/);
  });

  it("the global stylesheet gained no Academy Core rules", () => {
    expect(INDEX_CSS).not.toContain(".acore-");
  });
});

describe("prefetch and warm-up follow the home", () => {
  it("/lol warms the Core chunk alone (its destinations follow once it is shown), /lol/hall the Hall's", () => {
    expect(PREFETCH).toMatch(/p === "\/lol", keys: \["AcademyCore"\]/);
    expect(PREFETCH).toMatch(/p === "\/lol\/hall", keys: \["LolHub"\]/);
  });

  it("the Landing hands off to the Core's warm and no longer fetches Hall-only art", () => {
    expect(LANDING).toContain('from "@/pages/academy-core/academy-core-warm"');
    expect(LANDING).toContain("warmAcademyCore");
    expect(LANDING).not.toContain("warmAcademyHub");
    expect(LANDING).not.toContain("academy-hub-warm");
  });

  it("the Hall keeps warming its own art when visited directly", () => {
    expect(HALL).toContain("warmAcademyHub(queryClient)");
  });
});
