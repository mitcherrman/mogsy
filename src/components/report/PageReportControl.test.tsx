/**
 * FB1-4 — the HUD's page reporter.
 *
 * The one property the feature turns on is that it files against the page the
 * visitor is standing on, WITHOUT taking them off it. Everything asserted here
 * is some form of that.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "user-1" } }) }));

const submit = vi.hoisted(() => ({
  submitPageReport: vi.fn(async () => "row-1"),
  submitQuestionReport: vi.fn(async () => "row-2"),
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

import PageReportControl from "./PageReportControl";

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <PageReportControl />
    </MemoryRouter>,
  );

beforeEach(() => {
  submit.submitPageReport.mockClear();
  submit.submitPageReport.mockResolvedValue("row-1");
  toasts.toast.error.mockClear();
});
afterEach(cleanup);

describe("the control lives in the HUD and opens in place", () => {
  it("renders a trigger and no panel until it is pressed", () => {
    renderAt("/lol/pro-play/live");
    expect(screen.getByTestId("hud-page-report")).toBeInTheDocument();
    expect(screen.queryByTestId("hud-page-report-panel")).toBeNull();
  });

  it("opens an inline panel rather than routing to /feedback", () => {
    renderAt("/lol/pro-play/live");
    fireEvent.click(screen.getByTestId("hud-page-report"));
    expect(screen.getByTestId("hud-page-report-panel")).toBeInTheDocument();
    // The trigger is still there, still on the same page.
    expect(screen.getByTestId("hud-page-report")).toBeInTheDocument();
  });
});

describe("it captures the current route", () => {
  it("shows the visitor which page they are reporting", () => {
    renderAt("/lol/pro-play/live");
    fireEvent.click(screen.getByTestId("hud-page-report"));
    expect(screen.getByTestId("hud-page-report-route")).toHaveTextContent(
      "/lol/pro-play/live",
    );
  });

  it("displays the path only, never the query string", () => {
    renderAt("/quiz/stat-check/room?invite=SECRET");
    fireEvent.click(screen.getByTestId("hud-page-report"));
    const route = screen.getByTestId("hud-page-report-route");
    expect(route).toHaveTextContent("/quiz/stat-check/room");
    expect(route.textContent).not.toContain("SECRET");
  });

  it("submits the route and the search, and lets the allow-list decide", async () => {
    renderAt("/lol/patch-reports?patch=26.18&invite=SECRET");
    fireEvent.click(screen.getByTestId("hud-page-report"));
    fireEvent.change(screen.getByTestId("hud-page-report-comment"), {
      target: { value: "the table renders empty" },
    });
    fireEvent.click(screen.getByTestId("hud-page-report-submit"));

    await waitFor(() => expect(submit.submitPageReport).toHaveBeenCalledTimes(1));
    expect(submit.submitPageReport).toHaveBeenCalledWith({
      userId: "user-1",
      comment: "the table renders empty",
      route: "/lol/patch-reports",
      // Raw search is passed on; capturePageQuery is the single place the
      // allow-list is applied, and it has its own tests.
      search: "?patch=26.18&invite=SECRET",
    });
  });

  it("reports a different route after navigation", () => {
    const { unmount } = renderAt("/lol");
    fireEvent.click(screen.getByTestId("hud-page-report"));
    expect(screen.getByTestId("hud-page-report-route")).toHaveTextContent("/lol");
    unmount();

    renderAt("/quiz/mastery");
    fireEvent.click(screen.getByTestId("hud-page-report"));
    expect(screen.getByTestId("hud-page-report-route")).toHaveTextContent("/quiz/mastery");
  });
});

describe("submission", () => {
  it("will not send an empty description", () => {
    renderAt("/lol");
    fireEvent.click(screen.getByTestId("hud-page-report"));
    expect(screen.getByTestId("hud-page-report-submit")).toBeDisabled();
  });

  it("confirms in place", async () => {
    renderAt("/lol");
    fireEvent.click(screen.getByTestId("hud-page-report"));
    fireEvent.change(screen.getByTestId("hud-page-report-comment"), {
      target: { value: "nothing loads" },
    });
    fireEvent.click(screen.getByTestId("hud-page-report-submit"));
    await waitFor(() =>
      expect(screen.getByTestId("hud-page-report-sent")).toBeInTheDocument());
  });

  it("keeps the form on failure", async () => {
    submit.submitPageReport.mockRejectedValue(new Error("network"));
    renderAt("/lol");
    fireEvent.click(screen.getByTestId("hud-page-report"));
    fireEvent.change(screen.getByTestId("hud-page-report-comment"), {
      target: { value: "nothing loads" },
    });
    fireEvent.click(screen.getByTestId("hud-page-report-submit"));
    await waitFor(() => expect(toasts.toast.error).toHaveBeenCalled());
    expect(screen.queryByTestId("hud-page-report-sent")).toBeNull();
    expect(screen.getByTestId("hud-page-report-comment")).toHaveValue("nothing loads");
  });
});

describe("dismissal", () => {
  it("closes on Escape", () => {
    renderAt("/lol");
    fireEvent.click(screen.getByTestId("hud-page-report"));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByTestId("hud-page-report-panel")).toBeNull();
  });

  it("closes on a pointer press outside it", () => {
    renderAt("/lol");
    fireEvent.click(screen.getByTestId("hud-page-report"));
    fireEvent.pointerDown(document.body);
    expect(screen.queryByTestId("hud-page-report-panel")).toBeNull();
  });
});
