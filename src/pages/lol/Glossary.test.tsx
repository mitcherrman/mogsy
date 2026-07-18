/**
 * /lol/glossary route rendering + interaction: the page mounts, lists
 * every term, filters by search box and category chip, and honours a
 * direct `#term-id` anchor deep link by rendering that term's card with
 * the matching element id.
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import LolGlossary from "./Glossary";
import { GLOSSARY_TERMS } from "@/lib/lol-glossary/registry";

// jsdom implements neither scrollIntoView nor HTMLElement.focus({ preventScroll })
// beyond a plain no-op; stub scrollIntoView so the anchor effect can run.
beforeAll(() => {
  if (!("scrollIntoView" in HTMLElement.prototype)) {
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
  } else {
    vi.spyOn(HTMLElement.prototype, "scrollIntoView").mockImplementation(() => {});
  }
});

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/lol/glossary" element={<LolGlossary />} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(cleanup);

describe("/lol/glossary route", () => {
  it("renders the glossary heading and every term", () => {
    renderAt("/lol/glossary");
    expect(
      screen.getByRole("heading", { level: 1, name: /league of legends glossary/i }),
    ).toBeInTheDocument();
    for (const t of GLOSSARY_TERMS) {
      expect(
        screen.getByRole("heading", { level: 3, name: t.term }),
      ).toBeInTheDocument();
    }
  });

  it("shows the total term count in the result summary", () => {
    renderAt("/lol/glossary");
    expect(
      screen.getByText(new RegExp(`of ${GLOSSARY_TERMS.length} terms`)),
    ).toBeInTheDocument();
  });

  it("filters the list via the search box", () => {
    renderAt("/lol/glossary");
    fireEvent.change(screen.getByLabelText(/search glossary/i), {
      target: { value: "ability haste" },
    });
    expect(
      screen.getByRole("heading", { level: 3, name: "Ability haste" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { level: 3, name: "Armor" }),
    ).not.toBeInTheDocument();
  });

  it("filters to a single category via a category chip", () => {
    renderAt("/lol/glossary");
    fireEvent.click(screen.getByRole("button", { name: "Defense" }));
    expect(
      screen.getByRole("heading", { level: 3, name: "Armor" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { level: 3, name: "Raw damage" }),
    ).not.toBeInTheDocument();
  });

  it("shows an empty state when nothing matches", () => {
    renderAt("/lol/glossary");
    fireEvent.change(screen.getByLabelText(/search glossary/i), {
      target: { value: "zzz-not-a-real-term" },
    });
    expect(screen.getByText(/no terms match that search/i)).toBeInTheDocument();
  });

  it("honours a direct #term-id anchor by rendering that term's card", () => {
    renderAt("/lol/glossary#lethal-damage");
    const card = document.getElementById("term-lethal-damage");
    expect(card).not.toBeNull();
    expect(
      within(card as HTMLElement).getByRole("heading", { level: 3, name: "Lethal damage" }),
    ).toBeInTheDocument();
  });

  it("renders the Health damage term and its post-shield definition", () => {
    renderAt("/lol/glossary#health-damage");
    const card = document.getElementById("term-health-damage");
    expect(card).not.toBeNull();
    expect(
      within(card as HTMLElement).getByRole("heading", { level: 3, name: "Health damage" }),
    ).toBeInTheDocument();
    expect(
      within(card as HTMLElement).getByText(/removed from current health/i),
    ).toBeInTheDocument();
  });
});
