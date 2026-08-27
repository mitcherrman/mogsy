import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import QuizContentRedirect from "./QuizContentRedirect";

function Landing() {
  const loc = useLocation();
  return <div data-testid="landing">{loc.pathname + loc.search}</div>;
}

const renderRedirect = (from: string, tab: "review" | "diagnostics" = "review") =>
  render(
    <MemoryRouter initialEntries={[from]}>
      <Routes>
        <Route path="/admin/quiz-builder" element={<QuizContentRedirect tab={tab} />} />
        <Route path="/admin/quiz-review" element={<QuizContentRedirect tab={tab} />} />
        <Route path="/admin/quiz-content" element={<Landing />} />
      </Routes>
    </MemoryRouter>,
  );

const landing = () => screen.getByTestId("landing").textContent ?? "";

afterEach(cleanup);

describe("QuizContentRedirect (legacy-route compatibility)", () => {
  it("lands the retired Builder bookmark on Quiz Review, not on a dead tab", () => {
    renderRedirect("/admin/quiz-builder", "review");
    expect(landing()).toContain("/admin/quiz-content");
    expect(landing()).toContain("tab=review");
    expect(landing()).not.toContain("tab=builder");
  });

  it("forces the review tab and preserves an existing questionId deep link", () => {
    renderRedirect("/admin/quiz-review?questionId=1234", "review");
    expect(landing()).toContain("/admin/quiz-content");
    expect(landing()).toContain("tab=review");
    expect(landing()).toContain("questionId=1234");
  });

  it("carries forward arbitrary compatible params (filters, packs, pagination, search)", () => {
    renderRedirect(
      "/admin/quiz-review?category=items&pack_key=itemq&page=3&search=sunfire",
      "review",
    );
    const url = landing();
    expect(url).toContain("tab=review");
    expect(url).toContain("category=items");
    expect(url).toContain("pack_key=itemq");
    expect(url).toContain("page=3");
    expect(url).toContain("search=sunfire");
  });

  it("overrides a conflicting incoming tab with the forced destination tab", () => {
    // A stale ?tab=ranked-duel bookmark must not survive the redirect.
    renderRedirect("/admin/quiz-builder?tab=ranked-duel", "review");
    const url = landing();
    expect(url).toContain("tab=review");
    expect(url).not.toContain("tab=ranked-duel");
  });
});
