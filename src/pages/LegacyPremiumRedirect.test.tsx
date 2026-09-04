/**
 * The paid subscription moved from /lol/pro to /lol/premium so that "Pro"
 * means Pro Play and nothing else. Two things must hold forever after:
 *
 *  1. the legacy URLs redirect (they are in ads, house-ad CTAs, Stripe return
 *     paths and bookmarks) and carry their query string with them, because
 *     Stripe returns the buyer with ?success=true / ?canceled=true;
 *  2. Pro Play's own routes are not swept up in the rename.
 *
 * The route declarations are asserted against the App.tsx source for the same
 * reason as App.routing-contract.test.ts: App mounts BrowserRouter and every
 * provider itself, so it cannot be rendered at an arbitrary path in jsdom.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import LegacyPremiumRedirect from "./LegacyPremiumRedirect";
import { LEGACY_PREMIUM_ROUTES, PREMIUM_ROUTE } from "@/lib/premium-routes";

const appSource = readFileSync(resolve(__dirname, "..", "App.tsx"), "utf8");

afterEach(cleanup);

function renderAt(initial: string) {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        {LEGACY_PREMIUM_ROUTES.map((path) => (
          <Route key={path} path={path} element={<LegacyPremiumRedirect />} />
        ))}
        <Route
          path={PREMIUM_ROUTE}
          element={<LandedProbe />}
        />
        <Route path="/lol/pro-play" element={<div data-testid="pro-play" />} />
        <Route path="/:slug" element={<div data-testid="custom-link" />} />
      </Routes>
    </MemoryRouter>,
  );
}

function LandedProbe() {
  const { pathname } = useLocation();
  return <div data-testid="premium-page">{pathname}</div>;
}

describe("legacy subscription URLs", () => {
  it.each(LEGACY_PREMIUM_ROUTES)("redirects %s to the Premium page", (path) => {
    renderAt(path);
    expect(screen.getByTestId("premium-page")).toBeTruthy();
  });

  it("does not let /pro fall through to the custom-link catch-all", () => {
    renderAt("/pro");
    expect(screen.queryByTestId("custom-link")).toBeNull();
    expect(screen.getByTestId("premium-page")).toBeTruthy();
  });

  it("leaves Pro Play alone", () => {
    renderAt("/lol/pro-play");
    expect(screen.getByTestId("pro-play")).toBeTruthy();
  });

  it("carries the Stripe return query string through the redirect", () => {
    // Asserted on the component's own output rather than the router's
    // location, so the contract survives any router-version change.
    const { container } = render(
      <MemoryRouter initialEntries={["/lol/pro?success=true#plans"]}>
        <Routes>
          <Route path="/lol/pro" element={<LegacyPremiumRedirect />} />
          <Route path={PREMIUM_ROUTE} element={<Probe />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(container.textContent).toContain("?success=true");
    expect(container.textContent).toContain("#plans");
  });
});

function Probe() {
  const { search, hash } = useLocation();
  return <span>{`${search}${hash}`}</span>;
}

describe("App route registration", () => {
  const routeLine = (path: string) =>
    appSource.split("\n").find((l) => l.includes(`path="${path}"`) && l.includes("<Route"));

  it("mounts the subscription page at /lol/premium", () => {
    expect(routeLine("/lol/premium")).toContain("<LolPremium />");
  });

  it("no longer declares a page at /lol/pro", () => {
    // The legacy paths are declared from LEGACY_PREMIUM_ROUTES, so no literal
    // <Route path="/lol/pro"> is left to drift back into a second page.
    expect(appSource).not.toContain('path="/lol/pro"');
    expect(appSource).toContain("LEGACY_PREMIUM_ROUTES.map");
  });

  it("keeps Pro Play at its own routes", () => {
    expect(routeLine("/lol/pro-play")).toContain("<ProPlayHub />");
    expect(routeLine("/lol/pro-play/quiz")).toContain("<ProPlayQuiz />");
  });
});
