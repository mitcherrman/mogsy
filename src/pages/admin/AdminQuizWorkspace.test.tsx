import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import AdminQuizWorkspace from "./AdminQuizWorkspace";

// Account-bound authorization is exercised in AdminAuthGate/AdminAuthProvider
// tests. Here we only care about routing/tabs, so the gate is a pass-through.
vi.mock("@/components/admin/AdminAuthGate", () => ({
  AdminAuthGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

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
// The Ranked Duel panel fetches on mount and has its own dedicated test suite;
// stub it here so the shell test stays about routing/tabs. The stub echoes its
// controlled selection props, the same way the Review stub does, so the
// workspace ↔ URL wiring for ?candidateId= is assertable here.
vi.mock("@/components/admin/ranked-duel-review/RankedDuelReviewPanel", () => ({
  RankedDuelReviewPanel: ({
    selectedCandidateId,
    onSelectCandidate,
  }: {
    selectedCandidateId?: string | null;
    onSelectCandidate?: (id: string | null) => void;
  }) => (
    <div data-testid="ranked-duel-review-panel">
      <span data-testid="rd-selected">{selectedCandidateId ?? "none"}</span>
      <button data-testid="rd-select-a" onClick={() => onSelectCandidate?.("cand-a")} />
      <button data-testid="rd-select-b" onClick={() => onSelectCandidate?.("cand-b")} />
      <button data-testid="rd-clear" onClick={() => onSelectCandidate?.(null)} />
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
});

describe("AdminQuizWorkspace shell (/admin/quiz-content)", () => {
  it("renders the three workspace tabs when authorized", () => {
    renderAt("/admin/quiz-content");
    expect(screen.getByRole("tab", { name: /Quiz Builder/i })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /Quiz Review/i })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /Ranked Duel Review/i })).toBeTruthy();
  });

  describe("routing", () => {
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

    it("mounts the Ranked Duel review workspace on ?tab=ranked-duel", () => {
      renderAt("/admin/quiz-content?tab=ranked-duel");
      expect(screen.getByTestId("ranked-duel-review-panel")).toBeTruthy();
    });

    it("falls back to the builder tab for an unknown ?tab= value", async () => {
      renderAt("/admin/quiz-content?tab=bogus");
      expect(await screen.findByTestId("stub-builder")).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// RA9 — Ranked candidate deep linking (?candidateId=)
// ---------------------------------------------------------------------------

describe("AdminQuizWorkspace — ranked candidate deep links", () => {
  const sel = () => screen.getByTestId("rd-selected").textContent;
  // Radix tab triggers activate on mouseDown, like the existing tab tests.
  const switchTab = (name: RegExp) => {
    const tab = screen.getByRole("tab", { name });
    fireEvent.mouseDown(tab);
    fireEvent.click(tab);
  };

  it("opens the candidate named in the URL", () => {
    renderAt("/admin/quiz-content?tab=ranked-duel&candidateId=cand-a");
    expect(sel()).toBe("cand-a");
  });

  it("has no selection when the param is absent or empty", () => {
    renderAt("/admin/quiz-content?tab=ranked-duel");
    expect(sel()).toBe("none");
    cleanup();
    renderAt("/admin/quiz-content?tab=ranked-duel&candidateId=");
    expect(sel()).toBe("none");
  });

  it("writes the selection into the URL", async () => {
    renderAt("/admin/quiz-content?tab=ranked-duel");
    fireEvent.click(screen.getByTestId("rd-select-a"));
    await waitFor(() => expect(loc()).toContain("candidateId=cand-a"));
    expect(loc()).toContain("tab=ranked-duel");
    expect(sel()).toBe("cand-a");
  });

  it("clears the param when the selection is cleared", async () => {
    renderAt("/admin/quiz-content?tab=ranked-duel&candidateId=cand-a");
    fireEvent.click(screen.getByTestId("rd-clear"));
    await waitFor(() => expect(loc()).not.toContain("candidateId"));
    expect(sel()).toBe("none");
  });

  it("restores the previous candidate on Back and re-applies it on Forward", async () => {
    renderAt("/admin/quiz-content?tab=ranked-duel");
    fireEvent.click(screen.getByTestId("rd-select-a"));
    await waitFor(() => expect(sel()).toBe("cand-a"));
    fireEvent.click(screen.getByTestId("rd-select-b"));
    await waitFor(() => expect(sel()).toBe("cand-b"));

    fireEvent.click(screen.getByTestId("nav-back"));
    await waitFor(() => expect(sel()).toBe("cand-a"));

    fireEvent.click(screen.getByTestId("nav-fwd"));
    await waitFor(() => expect(sel()).toBe("cand-b"));
  });

  it("drops the candidate param when leaving the tab", async () => {
    renderAt("/admin/quiz-content?tab=ranked-duel&candidateId=cand-a");
    switchTab(/Quiz Builder/i);
    await waitFor(() => expect(loc()).toContain("tab=builder"));
    expect(loc()).not.toContain("candidateId");
  });

  it("keeps the two tabs' deep links independent", async () => {
    renderAt("/admin/quiz-content?tab=review&questionId=42");
    switchTab(/Ranked Duel Review/i);
    await waitFor(() => expect(loc()).toContain("tab=ranked-duel"));
    // Leaving Review drops ITS param; the ranked tab starts unselected.
    expect(loc()).not.toContain("questionId");
    expect(sel()).toBe("none");

    fireEvent.click(screen.getByTestId("rd-select-a"));
    await waitFor(() => expect(loc()).toContain("candidateId=cand-a"));
    switchTab(/Quiz Review/i);
    await waitFor(() => expect(loc()).toContain("tab=review"));
    expect(loc()).not.toContain("candidateId");
  });
});
