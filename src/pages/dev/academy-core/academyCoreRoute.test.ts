/**
 * Academy Core V1 — route isolation, pinned against the source.
 *
 * Same technique as App.routing-contract.test.ts: App mounts its own router
 * and providers, so the declaration is the contract. What matters here is
 * that the preview exists where the brief says, is lazily loaded, and that
 * nothing about the production Hall or the site root moved.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const APP = readFileSync(resolve(__dirname, "../../../App.tsx"), "utf8");
const LAYOUT = readFileSync(resolve(__dirname, "../../../components/Layout.tsx"), "utf8");
const INDEX_CSS = readFileSync(resolve(__dirname, "../../../index.css"), "utf8");

function routeLine(path: string): string {
  const line = APP.split("\n").find((l) => l.includes(`path="${path}"`) && l.includes("<Route"));
  if (!line) throw new Error(`no <Route> declared for ${path}`);
  return line;
}

describe("the preview route", () => {
  it("renders the Core at /lol/dev/academy-core, lazily", () => {
    expect(APP).toContain('const AcademyCorePage = lazy(() => import("./pages/dev/academy-core/AcademyCorePage"));');
    expect(routeLine("/lol/dev/academy-core")).toContain("<AcademyCorePage />");
    expect(routeLine("/lol/dev/academy-core")).toContain("<Suspense");
  });

  it("answers the brief's /dev/academy-core as an alias onto the same page", () => {
    expect(routeLine("/dev/academy-core")).toMatch(/<Navigate to="\/lol\/dev\/academy-core" replace \/>/);
  });

  it("is a full-bleed scene inside the existing shell", () => {
    expect(LAYOUT).toContain('pathname === "/lol/dev/academy-core"');
  });
});

describe("production surfaces are untouched", () => {
  it("the Hall still owns /lol and the entrance still owns /", () => {
    expect(routeLine("/lol")).toContain("<LolHub />");
    // The root route is declared across lines.
    expect(APP).toMatch(/path="\/"\s*\n\s*element=\{<Suspense[^\n]*<MogzyEntryV2 seo="root" autoEnter \/>/);
  });

  it("the global stylesheet gained no Academy Core rules", () => {
    expect(INDEX_CSS).not.toContain(".acore-");
  });
});
