/**
 * UX4 — the Footer is not rendered inside the fixed-viewport Worlds
 * experience, and nowhere else changes: the published Worlds page (flag off),
 * other tournaments and the rest of Mogzy keep it, legal links included.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import Footer from "./Footer";

const at = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Footer />
    </MemoryRouter>,
  );

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

const WORLDS = "/lol/pro-play/tournament/worlds-2026";

describe("Footer on the Worlds experience (UX4)", () => {
  it.each([WORLDS, `${WORLDS}/stages/swiss`, `${WORLDS}/teams`, `${WORLDS}/schedule`])("flag on: no Footer at %s", (path) => {
    vi.stubEnv("VITE_WORLDS_EXPERIENCE_ENABLED", "true");
    at(path);
    expect(screen.queryByTestId("site-footer-nav")).toBeNull();
  });

  it("flag on: the development prototype has none either", () => {
    vi.stubEnv("VITE_WORLDS_EXPERIENCE_ENABLED", "true");
    at("/lol/dev/worlds-experience/schedule");
    expect(screen.queryByTestId("site-footer-nav")).toBeNull();
  });

  it("flag off: the published Worlds page keeps the Footer and its legal links", () => {
    vi.stubEnv("VITE_WORLDS_EXPERIENCE_ENABLED", "false");
    at(WORLDS);
    const nav = screen.getByTestId("site-footer-nav");
    expect(nav).toHaveTextContent("Privacy Policy");
    expect(nav).toHaveTextContent("Terms of Service");
  });

  it.each(["/lol/pro-play", "/lol/pro-play/tournament/dcgi-2026", "/privacy", "/about"])("flag on: %s keeps the Footer", (path) => {
    vi.stubEnv("VITE_WORLDS_EXPERIENCE_ENABLED", "true");
    at(path);
    expect(screen.getByTestId("site-footer-nav")).toBeInTheDocument();
  });
});
