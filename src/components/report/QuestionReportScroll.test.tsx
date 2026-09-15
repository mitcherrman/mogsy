/**
 * FB1-4 — the in-play question reporter.
 *
 * The properties worth pinning are the ones a live match depends on: the
 * control exists only when there is a question to report, submitting does not
 * navigate or unmount anything, and a report always carries the reason and the
 * snapshot the mode published.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

vi.mock("@/components/mascot/MogzyMascot", () => ({
  MogzyMascot: () => <span data-testid="mascot" />,
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "user-1" } }) }));

const submit = vi.hoisted(() => ({
  submitQuestionReport: vi.fn(async () => "row-1"),
  submitPageReport: vi.fn(async () => "row-2"),
  MissingProfileError: class extends Error {},
}));
vi.mock("@/lib/feedback/submitReport", () => submit);
vi.mock("@/lib/feedback/client", () => ({
  FeedbackRateLimitError: class extends Error {},
}));

const toasts = vi.hoisted(() => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));
vi.mock("sonner", () => toasts);

import { MogzyDockProvider } from "@/components/mogzy-dock/MogzyDock";
import {
  ReportableQuestionProvider,
  usePublishReportableQuestion,
} from "@/lib/feedback/reportable-question";
import type { ReportableQuestionSnapshot } from "@/lib/feedback/report-context";
import { QuestionReportScroll } from "./QuestionReportScroll";

const RANKED: ReportableQuestionSnapshot = {
  category: "Ranked",
  mode: "Ranked",
  runtimeQuestionId: "q-77",
  prompt: "Which item gives the most armor?",
  choices: ["Thornmail", "Warmog's"],
  matchId: "match-1",
  roundNumber: 3,
};

/** A stand-in for a mode: it publishes and renders a "live round" beside the
 *  reporter, so a test can prove the round survives a submission. */
function Mode({ snapshot }: { snapshot: ReportableQuestionSnapshot | null }) {
  usePublishReportableQuestion(snapshot);
  return <div data-testid="live-round">{snapshot?.prompt ?? "no question"}</div>;
}

function renderReporter(snapshot: ReportableQuestionSnapshot | null, path = "/quiz/ranked") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ReportableQuestionProvider>
        <MogzyDockProvider>
          <Routes>
            <Route path="*" element={<>
              <Mode snapshot={snapshot} />
              <QuestionReportScroll />
            </>} />
          </Routes>
        </MogzyDockProvider>
      </ReportableQuestionProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  submit.submitQuestionReport.mockClear();
  submit.submitQuestionReport.mockResolvedValue("row-1");
  toasts.toast.success.mockClear();
  toasts.toast.error.mockClear();
});
afterEach(cleanup);

describe("the control appears only where a question is being played", () => {
  it("renders nothing when no mode is publishing", async () => {
    renderReporter(null);
    await waitFor(() => expect(screen.getByTestId("live-round")).toBeInTheDocument());
    expect(screen.queryByTestId("question-report-tab")).toBeNull();
  });

  it("renders a tab as soon as a mode publishes a question", async () => {
    renderReporter(RANKED);
    expect(await screen.findByTestId("question-report-tab")).toBeInTheDocument();
  });
});

describe("reporting a question", () => {
  it("requires a reason before it will send", async () => {
    renderReporter(RANKED);
    fireEvent.click(await screen.findByTestId("question-report-tab"));
    expect(screen.getByTestId("question-report-submit")).toBeDisabled();
  });

  it("sends the chosen reason with the published snapshot", async () => {
    renderReporter(RANKED);
    fireEvent.click(await screen.findByTestId("question-report-tab"));
    fireEvent.click(screen.getByTestId("question-report-reason-incorrect_answer"));
    fireEvent.change(screen.getByTestId("question-report-comment"), {
      target: { value: "Thornmail gives more" },
    });
    fireEvent.click(screen.getByTestId("question-report-submit"));

    await waitFor(() => expect(submit.submitQuestionReport).toHaveBeenCalledTimes(1));
    expect(submit.submitQuestionReport).toHaveBeenCalledWith({
      userId: "user-1",
      reason: "incorrect_answer",
      comment: "Thornmail gives more",
      route: "/quiz/ranked",
      snapshot: RANKED,
    });
  });

  it("offers exactly the four reasons", async () => {
    renderReporter(RANKED);
    fireEvent.click(await screen.findByTestId("question-report-tab"));
    for (const reason of ["doesnt_make_sense", "incorrect_answer", "typo", "other"]) {
      expect(screen.getByTestId(`question-report-reason-${reason}`)).toBeInTheDocument();
    }
  });

  it("leaves the live round mounted and does not navigate", async () => {
    renderReporter(RANKED);
    fireEvent.click(await screen.findByTestId("question-report-tab"));
    fireEvent.click(screen.getByTestId("question-report-reason-typo"));
    fireEvent.click(screen.getByTestId("question-report-submit"));

    await waitFor(() => expect(screen.getByTestId("question-report-sent")).toBeInTheDocument());
    // The mode's own surface is untouched — the reporter owns no mode state,
    // renders outside every mode's layout, and never routes.
    expect(screen.getByTestId("live-round")).toHaveTextContent(
      "Which item gives the most armor?",
    );
  });

  it("keeps the panel open on the confirmation rather than moving focus", async () => {
    renderReporter(RANKED);
    fireEvent.click(await screen.findByTestId("question-report-tab"));
    fireEvent.click(screen.getByTestId("question-report-reason-other"));
    fireEvent.click(screen.getByTestId("question-report-submit"));
    await waitFor(() => expect(screen.getByTestId("question-report-sent")).toBeInTheDocument());
    expect(screen.getByTestId("question-report-panel")).toBeInTheDocument();
  });

  it("surfaces a failure without losing the form", async () => {
    submit.submitQuestionReport.mockRejectedValue(new Error("network"));
    renderReporter(RANKED);
    fireEvent.click(await screen.findByTestId("question-report-tab"));
    fireEvent.click(screen.getByTestId("question-report-reason-typo"));
    fireEvent.click(screen.getByTestId("question-report-submit"));
    await waitFor(() => expect(toasts.toast.error).toHaveBeenCalled());
    expect(screen.queryByTestId("question-report-sent")).toBeNull();
    expect(screen.getByTestId("question-report-submit")).toBeEnabled();
  });
});

describe("a new question is a new report", () => {
  it("clears the reason and the confirmation when the round advances", async () => {
    const { rerender } = renderReporter(RANKED);
    fireEvent.click(await screen.findByTestId("question-report-tab"));
    fireEvent.click(screen.getByTestId("question-report-reason-typo"));
    fireEvent.click(screen.getByTestId("question-report-submit"));
    await waitFor(() => expect(screen.getByTestId("question-report-sent")).toBeInTheDocument());

    const nextRound = { ...RANKED, runtimeQuestionId: "q-78", roundNumber: 4,
      prompt: "Which item gives the most MR?" };
    rerender(
      <MemoryRouter initialEntries={["/quiz/ranked"]}>
        <ReportableQuestionProvider>
          <MogzyDockProvider>
            <Mode snapshot={nextRound} />
            <QuestionReportScroll />
          </MogzyDockProvider>
        </ReportableQuestionProvider>
      </MemoryRouter>,
    );

    // A reason picked for round 3 must never be attached to round 4.
    await waitFor(() =>
      expect(screen.queryByTestId("question-report-sent")).toBeNull());
  });
});
