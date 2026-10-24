/**
 * W26Q-UX — the Footer is not rendered under the one-screen Worlds 2026 Quiz,
 * and nowhere else changes: the general Pro Play Quiz and its siblings keep it.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import Footer from "./Footer";
import { PRO_PLAY_WORLDS_QUIZ_ROUTE } from "@/lib/pro-play/routes";

const at = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Footer />
    </MemoryRouter>,
  );

afterEach(cleanup);

describe("Footer on the Worlds 2026 Quiz (W26Q-UX)", () => {
  it("is absent on the Worlds quiz route", () => {
    at(PRO_PLAY_WORLDS_QUIZ_ROUTE);
    expect(screen.queryByTestId("site-footer-nav")).toBeNull();
  });

  it.each(["/lol/pro-play/quiz", "/lol/pro-play", "/lol/pro-play/quiz/worlds-2026-archive", "/privacy"])(
    "keeps the Footer at %s",
    (path) => {
      at(path);
      expect(screen.getByTestId("site-footer-nav")).toBeInTheDocument();
    },
  );
});
