import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import Feedback from "./Feedback";
import { FeedbackRateLimitError } from "@/lib/feedback/client";

/**
 * /feedback behaviour: four entry doors, progressive disclosure per door, the
 * confirmation reference, and — the load-bearing one — that submissions are
 * read through the RPC client rather than a table select.
 */

/**
 * Keep the real Supabase client out of jsdom. Importing it boots GoTrue, which
 * reaches for localStorage and produces an unhandled rejection unrelated to
 * anything under test here.
 */
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: vi.fn(), rpc: vi.fn(), storage: { from: vi.fn() } },
}));

const submitFeedback = vi.fn();
const listMySubmissions = vi.fn();
const getMyProfileId = vi.fn();
const uploadScreenshot = vi.fn();

vi.mock("@/lib/feedback/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/feedback/client")>(
    "@/lib/feedback/client",
  );
  return {
    ...actual,
    submitFeedback: (...a: unknown[]) => submitFeedback(...a),
    listMySubmissions: (...a: unknown[]) => listMySubmissions(...a),
    getMyProfileId: (...a: unknown[]) => getMyProfileId(...a),
    uploadScreenshot: (...a: unknown[]) => uploadScreenshot(...a),
  };
});

/**
 * Stable identity matters: the page's load effect depends on `user`, so a mock
 * that returns a fresh object each render would re-fire it every render and
 * spin forever. The real AuthProvider holds this in state, so it is stable
 * there too.
 */
const TEST_USER = { id: "user-1", is_anonymous: true };
const TEST_AUTH = { user: TEST_USER };
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => TEST_AUTH }));

const toastError = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    error: (...a: unknown[]) => toastError(...a),
    success: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock("@/components/SEOHead", () => ({ default: () => null }));

function renderPage(path = "/feedback") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/feedback" element={<Feedback />} />
      </Routes>
    </MemoryRouter>,
  );
}

/** Fill the two always-required fields. */
function fillCore(title = "Ranked timer freezes", body = "It stopped at 0:07 and never advanced.") {
  fireEvent.change(screen.getByLabelText(/^title$/i), { target: { value: title } });
  fireEvent.change(screen.getByLabelText(/what happened|what problem|what's on your mind|your feedback/i), {
    target: { value: body },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  listMySubmissions.mockResolvedValue([]);
  getMyProfileId.mockResolvedValue("profile-1");
  submitFeedback.mockResolvedValue("3f2a9c14-5b6d-4e7f-8a9b-0c1d2e3f4a5b");
});

afterEach(cleanup);

describe("/feedback entry choices", () => {
  it("offers exactly the four doors", async () => {
    renderPage();
    const choices = await screen.findByTestId("feedback-entry-choices");
    for (const label of [
      "Report a Bug",
      "Request a Feature",
      "Gameplay Feedback",
      "Other Feedback",
    ]) {
      expect(within(choices).getByText(label)).toBeInTheDocument();
    }
    expect(choices.querySelectorAll("button")).toHaveLength(4);
  });

  it("shows no form until a door is chosen", () => {
    renderPage();
    expect(screen.queryByTestId("feedback-form")).not.toBeInTheDocument();
  });
});

describe("/feedback progressive disclosure", () => {
  it("reveals bug-only fields for Report a Bug", () => {
    renderPage();
    fireEvent.click(screen.getByText("Report a Bug"));
    expect(screen.getByTestId("feedback-bug-fields")).toBeInTheDocument();
    expect(screen.getByLabelText(/what did you expect/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/how much did it block you/i)).toBeInTheDocument();
  });

  it("does not show bug fields for the other three doors", () => {
    for (const label of ["Request a Feature", "Gameplay Feedback", "Other Feedback"]) {
      renderPage();
      fireEvent.click(screen.getByText(label));
      expect(screen.queryByTestId("feedback-bug-fields")).not.toBeInTheDocument();
      cleanup();
    }
  });

  it("asks a feature request about the problem, not the implementation", () => {
    renderPage();
    fireEvent.click(screen.getByText("Request a Feature"));
    expect(screen.getByLabelText(/what problem would this solve/i)).toBeInTheDocument();
  });

  it("keeps evidence collapsed until asked for", () => {
    renderPage();
    fireEvent.click(screen.getByText("Report a Bug"));
    expect(screen.queryByLabelText(/video or other link/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /add a screenshot or link/i }));
    expect(screen.getByLabelText(/video or other link/i)).toBeInTheDocument();
  });
});

describe("/feedback submission", () => {
  it("records which door the user walked through", async () => {
    renderPage();
    fireEvent.click(screen.getByText("Gameplay Feedback"));
    fillCore("Daily is too hard", "Three expert questions in a row.");
    fireEvent.click(screen.getByRole("button", { name: /submit/i }));

    await waitFor(() => expect(submitFeedback).toHaveBeenCalledTimes(1));
    expect(submitFeedback.mock.calls[0][0]).toMatchObject({
      entryIntent: "gameplay",
      profileId: "profile-1",
      title: "Daily is too hard",
    });
  });

  it("never sends `type` — the database derives it", async () => {
    renderPage();
    fireEvent.click(screen.getByText("Report a Bug"));
    fillCore();
    fireEvent.click(screen.getByRole("button", { name: /submit/i }));

    await waitFor(() => expect(submitFeedback).toHaveBeenCalled());
    expect(submitFeedback.mock.calls[0][0]).not.toHaveProperty("type");
  });

  it("attaches allow-listed diagnostics only", async () => {
    renderPage();
    fireEvent.click(screen.getByText("Other Feedback"));
    fillCore("Nice work", "The new hub looks great.");
    fireEvent.click(screen.getByRole("button", { name: /submit/i }));

    await waitFor(() => expect(submitFeedback).toHaveBeenCalled());
    const meta = submitFeedback.mock.calls[0][0].clientMeta as Record<string, string>;
    for (const key of Object.keys(meta)) {
      expect(["ua", "viewport", "app_version"]).toContain(key);
    }
  });

  it("shows a copyable reference code on success", async () => {
    renderPage();
    fireEvent.click(screen.getByText("Report a Bug"));
    fillCore();
    fireEvent.click(screen.getByRole("button", { name: /submit/i }));

    const panel = await screen.findByTestId("feedback-confirmation");
    // First 8 hex chars of the returned uuid, uppercased.
    expect(within(panel).getByText("3F2A9C14")).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: /send another/i })).toBeInTheDocument();
  });

  it("surfaces the rate limit as a human sentence", async () => {
    submitFeedback.mockRejectedValueOnce(new FeedbackRateLimitError());
    renderPage();
    fireEvent.click(screen.getByText("Report a Bug"));
    fillCore();
    fireEvent.click(screen.getByRole("button", { name: /submit/i }));

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(String(toastError.mock.calls[0][0])).toMatch(/try again/i);
    expect(screen.queryByTestId("feedback-confirmation")).not.toBeInTheDocument();
  });

  it("does not submit with an empty title or body", () => {
    renderPage();
    fireEvent.click(screen.getByText("Report a Bug"));
    expect(screen.getByRole("button", { name: /submit/i })).toBeDisabled();
  });
});

describe("/feedback submissions list", () => {
  it("reads through the RPC client", async () => {
    renderPage();
    await waitFor(() => expect(listMySubmissions).toHaveBeenCalled());
  });

  it("renders each submission with its public status label", async () => {
    listMySubmissions.mockResolvedValue([
      {
        id: "11112222-3333-4444-5555-666677778888",
        entry_intent: "bug",
        type: "bug",
        category: "Ranked",
        title: "Timer freeze",
        body: "Stuck at 0:07",
        status: "completed",
        severity: null,
        reproducibility: null,
        expected_result: null,
        actual_result: null,
        evidence_url: null,
        screenshot_path: null,
        page_url: "/quiz/ranked",
        page_reference: null,
        created_at: "2026-08-12T00:00:00Z",
        updated_at: "2026-08-12T00:00:00Z",
      },
    ]);
    renderPage();

    const list = await screen.findByTestId("feedback-submissions");
    expect(within(list).getByText("Timer freeze")).toBeInTheDocument();
    // "completed" is shown to the user as "Resolved".
    expect(within(list).getByText("Resolved")).toBeInTheDocument();
    expect(within(list).getByText("11112222")).toBeInTheDocument();
  });

  it("stays usable when history fails to load", async () => {
    listMySubmissions.mockRejectedValue(new Error("network"));
    renderPage();
    await waitFor(() => expect(screen.getByTestId("feedback-entry-choices")).toBeInTheDocument());
  });
});
