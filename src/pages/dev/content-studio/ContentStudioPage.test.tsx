/**
 * Content Workspace UI behaviour: handoff intake, selection/ordering, mode
 * switching, Generate enablement, and job progress — against a mocked local
 * server (no network, no generation).
 *
 * CON1 Step 3A2 rewrote this file. It used to drive every case through the
 * page's own corpus search; that search is gone, so each case now arrives the
 * way an operator actually does — through an Admin handoff. The behaviours
 * being held are the same ones as before, minus discovery.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import ContentStudioPage from "./ContentStudioPage";

const QUESTIONS: Record<string, unknown> = {
  "101": {
    id: "101",
    prompt: "Which item grants the most armor?",
    category: "items",
    choices: ["Sunfire", "Thornmail"],
    correct_index: 1,
    correct_label: "Thornmail",
    content_difficulty: "gold",
    question_type: "item_build_path",
    is_active: true,
    compatible: true,
    incompatible_reason: null,
  },
  "102": {
    id: "102",
    prompt: "Which item grants haste?",
    category: "items",
    choices: ["Kindlegem", "Ruby Crystal"],
    correct_index: 0,
    correct_label: "Kindlegem",
    content_difficulty: null,
    question_type: null,
    is_active: true,
    compatible: true,
    incompatible_reason: null,
  },
};

let jobState = "running";

function mockFetch(url: string): Promise<Response> {
  const respond = (body: unknown, status = 200) =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
    );
  if (url.includes("/health")) {
    return respond({
      ok: true,
      backend_configured: true,
      api_base: "http://127.0.0.1:8000",
      render_base_url: "http://127.0.0.1:5199",
      active_job: null,
    });
  }
  const single = url.match(/\/questions\/([^/?]+)$/);
  if (single) {
    const q = QUESTIONS[single[1]];
    return q ? respond({ question: q }) : respond({ error: "not found" }, 404);
  }
  if (url.includes("/jobs/job-1")) {
    return respond({
      id: "job-1",
      state: jobState,
      mode: "single-question",
      created_at: "",
      finished_at: null,
      run_ids: [],
      result: null,
      error: null,
      log: ["[capture] ✓ mobile-social question"],
    });
  }
  if (url.endsWith("/jobs")) return respond({ job_id: "job-1", state: "queued" }, 202);
  if (url.includes("/runs")) return respond({ runs: [], packages: [] });
  return respond({ error: "not found" }, 404);
}

beforeEach(() => {
  jobState = "running";
  vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => mockFetch(String(input))));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState({}, "", "/");
});

/** Open the workspace the way Admin opens it. */
function openWith(ids: string, extra = "&formats=mobile-social&states=question,correct") {
  window.history.replaceState({}, "", `/dev/content-studio?hv=1&ids=${ids}${extra}`);
  return render(<ContentStudioPage />);
}

const selectedText = () => screen.getByTestId("selected-list").textContent ?? "";

describe("ContentStudioPage", () => {
  it("opens straight into the workspace with the handed-off selection", async () => {
    openWith("101,102");
    await waitFor(() => expect(selectedText()).toContain("#101"));
    expect(selectedText()).toContain("#102");
  });

  it("supports ordering and removal of the selected questions", async () => {
    openWith("101,102");
    await waitFor(() => expect(selectedText()).toContain("#102"));
    expect(selectedText().indexOf("#101")).toBeLessThan(selectedText().indexOf("#102"));
    fireEvent.click(screen.getAllByLabelText("Move down")[0]);
    expect(selectedText().indexOf("#102")).toBeLessThan(selectedText().indexOf("#101"));
    fireEvent.click(screen.getByLabelText("Remove 102"));
    expect(selectedText()).not.toContain("#102");
  });

  it("disables Generate with a reason until the request validates per mode", async () => {
    render(<ContentStudioPage />);
    await waitFor(() => expect(screen.getByText("backend ready")).toBeTruthy());
    // Nothing handed off yet.
    expect((screen.getByTestId("generate-button") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId("disabled-reason").textContent).toMatch(/at least one/i);
    cleanup();

    // Multi-question needs 2-10.
    openWith("101");
    await waitFor(() => expect(selectedText()).toContain("#101"));
    fireEvent.click(screen.getByRole("radio", { name: /Multi-question challenge/i }));
    expect((screen.getByTestId("generate-button") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId("disabled-reason").textContent).toMatch(/2-10/);
  });

  it("daily-package requires a featured (★) question", async () => {
    openWith("101,102");
    await waitFor(() => expect(selectedText()).toContain("#102"));
    fireEvent.click(screen.getByRole("radio", { name: /Daily package/i }));
    expect((screen.getByTestId("generate-button") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByLabelText("Feature question 101"));
    await waitFor(() =>
      expect((screen.getByTestId("generate-button") as HTMLButtonElement).disabled).toBe(false),
    );
  });

  it("starts a job and renders its progress log", async () => {
    openWith("101");
    await waitFor(() => expect(selectedText()).toContain("#101"));
    await waitFor(() =>
      expect((screen.getByTestId("generate-button") as HTMLButtonElement).disabled).toBe(false),
    );
    fireEvent.click(screen.getByTestId("generate-button"));
    await waitFor(() =>
      expect(screen.getByTestId("job-log").textContent).toContain("mobile-social question"),
    );
    expect(screen.getByText("running")).toBeTruthy();
  });

  it("shows an offline notice when the workspace server is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("ECONNREFUSED"))),
    );
    render(<ContentStudioPage />);
    await waitFor(() => expect(screen.getByText("server offline")).toBeTruthy());
    expect(screen.getByTestId("disabled-reason").textContent).toMatch(/npm run content-studio/);
  });
});
