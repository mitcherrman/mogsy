import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import AdminQuizWorkspace from "./AdminQuizWorkspace";
import { setAdminKey, clearAdminKey } from "@/lib/knowledge-admin/key";

// Stub the two heavy admin pages. The Review stub echoes its controlled
// selection props so we can assert the workspace ↔ URL wiring.
vi.mock("./QuizBuilderPro", () => ({
  default: ({ embedded }: { embedded?: boolean }) => (
    <div data-testid="stub-builder">builder embedded={String(embedded)}</div>
  ),
}));
vi.mock("./AdminQuizReview", () => ({
  default: ({
    embedded,
    selectedQuestionId,
    onSelectQuestion,
  }: {
    embedded?: boolean;
    selectedQuestionId?: number | null;
    onSelectQuestion?: (id: number | null) => void;
  }) => (
    <div data-testid="stub-review">
      <span data-testid="review-embedded">{String(embedded)}</span>
      <span data-testid="review-selected">{selectedQuestionId ?? "none"}</span>
      <button data-testid="review-select-99" onClick={() => onSelectQuestion?.(99)} />
      <button data-testid="review-clear" onClick={() => onSelectQuestion?.(null)} />
    </div>
  ),
}));

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="loc">{loc.pathname + loc.search}</div>;
}
function NavProbe() {
  const navigate = useNavigate();
  return (
    <>
      <button data-testid="nav-back" onClick={() => navigate(-1)} />
      <button data-testid="nav-fwd" onClick={() => navigate(1)} />
    </>
  );
}

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <NavProbe />
      <LocationProbe />
      <Routes>
        <Route path="/admin/quiz-content" element={<AdminQuizWorkspace />} />
      </Routes>
    </MemoryRouter>,
  );

const loc = () => screen.getByTestId("loc").textContent ?? "";

afterEach(() => {
  cleanup();
  clearAdminKey();
});

describe("AdminQuizWorkspace shell (/admin/quiz-content)", () => {
  it("shows a single admin-key gate when no key is set, and no tabs", () => {
    renderAt("/admin/quiz-content");
    expect(screen.getByLabelText("Admin key")).toBeTruthy();
    expect(screen.queryByRole("tab", { name: /Quiz Builder/i })).toBeNull();
  });

  it("reveals the three tabs once a key is entered", () => {
    renderAt("/admin/quiz-content");
    fireEvent.change(screen.getByLabelText("Admin key"), { target: { value: "secret" } });
    fireEvent.click(screen.getByRole("button", { name: /Unlock workspace/i }));
    expect(screen.getByRole("tab", { name: /Quiz Builder/i })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /Quiz Review/i })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /Ranked Duel Review/i })).toBeTruthy();
  });

  describe("with an admin key", () => {
    beforeEach(() => setAdminKey("secret"));

    it("defaults to the builder tab in embedded mode", async () => {
      renderAt("/admin/quiz-content");
      expect((await screen.findByTestId("stub-builder")).textContent).toContain("embedded=true");
    });

    it("honors ?tab=review from a legacy redirect", async () => {
      renderAt("/admin/quiz-content?tab=review");
      expect((await screen.findByTestId("review-embedded")).textContent).toBe("true");
      expect(screen.queryByTestId("stub-builder")).toBeNull();
    });

    it("passes the ?questionId deep link into Review as controlled selection", async () => {
      renderAt("/admin/quiz-content?tab=review&questionId=42");
      expect((await screen.findByTestId("review-selected")).textContent).toBe("42");
    });

    it("ignores an invalid questionId (non-numeric) — fails safe to no selection", async () => {
      renderAt("/admin/quiz-content?tab=review&questionId=not-a-number");
      expect((await screen.findByTestId("review-selected")).textContent).toBe("none");
    });

    it("writes a selection back into the URL (?questionId=) as a pushed entry", async () => {
      renderAt("/admin/quiz-content?tab=review");
      fireEvent.click(await screen.findByTestId("review-select-99"));
      await waitFor(() => expect(loc()).toContain("questionId=99"));
      expect(loc()).toContain("tab=review");
    });

    it("preserves tab and selection across browser Back/Forward", async () => {
      renderAt("/admin/quiz-content?tab=review");
      fireEvent.click(await screen.findByTestId("review-select-99"));
      await waitFor(() => expect(loc()).toContain("questionId=99"));

      fireEvent.click(screen.getByTestId("nav-back"));
      await waitFor(() => expect(loc()).not.toContain("questionId=99"));
      expect(loc()).toContain("tab=review");
      expect(screen.getByTestId("review-selected").textContent).toBe("none");

      fireEvent.click(screen.getByTestId("nav-fwd"));
      await waitFor(() => expect(screen.getByTestId("review-selected").textContent).toBe("99"));
      expect(loc()).toContain("tab=review");
    });

    it("drops the questionId when leaving the Review tab", async () => {
      renderAt("/admin/quiz-content?tab=review&questionId=42");
      await screen.findByTestId("stub-review");
      const builderTab = screen.getByRole("tab", { name: /Quiz Builder/i });
      fireEvent.mouseDown(builderTab);
      fireEvent.click(builderTab);
      await waitFor(() => expect(loc()).toContain("tab=builder"));
      expect(loc()).not.toContain("questionId");
    });

    it("shows the Ranked Duel boundary (blocker, no fake data) on ?tab=ranked-duel", () => {
      renderAt("/admin/quiz-content?tab=ranked-duel");
      expect(screen.getByTestId("ranked-duel-review-panel")).toBeTruthy();
      expect(screen.getByTestId("ranked-duel-review-boundary").textContent).toContain(
        "Backend endpoints not shipped yet",
      );
      expect(screen.getByTestId("ranked-duel-review-blocker").textContent).toContain("0 / 30");
    });

    it("falls back to the builder tab for an unknown ?tab= value", async () => {
      renderAt("/admin/quiz-content?tab=bogus");
      expect(await screen.findByTestId("stub-builder")).toBeTruthy();
    });
  });
});
