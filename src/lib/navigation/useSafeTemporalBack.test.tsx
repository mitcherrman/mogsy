import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { BrowserRouter, Link, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hasUsableMogzyHistory, useSafeTemporalBack } from "./useSafeTemporalBack";

function LocationProbe({ label }: { label: string }) {
  const location = useLocation();
  return <p>{`${label}:${location.pathname}${location.search}${location.hash}`}</p>;
}

function Start() {
  return (
    <main>
      <LocationProbe label="start" />
      <Link to="/destination?tab=ranked#record">Open destination</Link>
    </main>
  );
}

function Destination({ fallback = "/fallback" }: { fallback?: string }) {
  const goBack = useSafeTemporalBack(fallback);
  return (
    <main>
      <LocationProbe label="destination" />
      <button type="button" onClick={goBack}>Go back</button>
    </main>
  );
}

function Harness({ fallback }: { fallback?: string }) {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/start" element={<Start />} />
        <Route path="/destination" element={<Destination fallback={fallback} />} />
        <Route path="/fallback" element={<LocationProbe label="fallback" />} />
        <Route path="/lol" element={<LocationProbe label="home" />} />
      </Routes>
    </BrowserRouter>
  );
}

beforeEach(() => {
  window.history.replaceState({ idx: 0 }, "", "/start");
});

afterEach(cleanup);

describe("hasUsableMogzyHistory", () => {
  it.each([null, undefined, {}, { idx: 0 }, { idx: -1 }, { idx: "1" }, { idx: 1.5 }])(
    "rejects a direct, absent, or malformed router entry: %j",
    (state) => expect(hasUsableMogzyHistory(state)).toBe(false),
  );

  it("accepts a positive React Router browser-history index", () => {
    expect(hasUsableMogzyHistory({ idx: 1 })).toBe(true);
  });
});

describe("useSafeTemporalBack", () => {
  it("pops from B to the preceding Mogzy route and preserves query/hash on Forward", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("link", { name: "Open destination" }));
    await screen.findByText("destination:/destination?tab=ranked#record");

    fireEvent.click(screen.getByRole("button", { name: "Go back" }));
    await screen.findByText("start:/start");

    act(() => window.history.forward());
    await screen.findByText("destination:/destination?tab=ranked#record");
  });

  it("replaces a direct/new-tab-equivalent entry with its exact fallback", async () => {
    window.history.replaceState({ idx: 0 }, "", "/destination");
    render(<Harness />);

    fireEvent.click(screen.getByRole("button", { name: "Go back" }));
    await screen.findByText("fallback:/fallback");
    expect(window.history.state.idx).toBe(0);
  });

  it("fails a non-internal fallback closed to Mogzy Home", async () => {
    window.history.replaceState({ idx: 0 }, "", "/destination");
    render(<Harness fallback="https://example.com/escape" />);

    fireEvent.click(screen.getByRole("button", { name: "Go back" }));
    await screen.findByText("home:/lol");
  });
});

describe("structural navigation remains structural", () => {
  it("keeps audited parent links fixed instead of adopting temporal Back", () => {
    const historyPage = readFileSync(resolve(__dirname, "../../pages/LolHistory.tsx"), "utf8");
    const rankedHeader = readFileSync(resolve(__dirname, "../../pages/quiz-ranked/RankedRouteHeader.tsx"), "utf8");
    expect(historyPage).toContain('<Link to="/lol">');
    expect(rankedHeader).toContain('to="/quiz"');
    expect(historyPage).not.toContain("useSafeTemporalBack");
    expect(rankedHeader).not.toContain("useSafeTemporalBack");
  });
});

