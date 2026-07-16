/**
 * Content Studio UI behavior: search, selection/ordering, mode switching,
 * Generate enablement, and job progress rendering — against a mocked studio
 * server (no network, no generation).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import ContentStudioPage from "./ContentStudioPage";

const QUESTIONS = [
  {
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
  {
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
  {
    id: "103",
    prompt: "Broken question",
    category: "items",
    choices: [],
    correct_index: null,
    correct_label: null,
    content_difficulty: null,
    question_type: null,
    is_active: true,
    compatible: false,
    incompatible_reason: "needs at least 2 choices (got 0)",
  },
];

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
  if (url.includes("/questions")) return respond({ questions: QUESTIONS });
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
});

async function searchAndAdd(ids: string[]) {
  fireEvent.change(screen.getByPlaceholderText(/Search text or exact ID/i), {
    target: { value: "item" },
  });
  fireEvent.submit(screen.getByPlaceholderText(/Search text or exact ID/i).closest("form")!);
  await waitFor(() => expect(screen.getByTestId("search-results").textContent).toContain("#101"));
  for (const id of ids) {
    fireEvent.click(screen.getByLabelText(`Add question ${id}`));
  }
}

describe("ContentStudioPage", () => {
  it("searches, shows compatibility, and blocks adding incompatible questions", async () => {
    render(<ContentStudioPage />);
    await searchAndAdd(["101"]);
    const results = screen.getByTestId("search-results");
    expect(results.textContent).toContain("needs at least 2 choices");
    expect((screen.getByLabelText("Add question 103") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId("selected-list").textContent).toContain("#101");
  });

  it("supports ordering and removal of selected questions", async () => {
    render(<ContentStudioPage />);
    await searchAndAdd(["101", "102"]);
    const list = screen.getByTestId("selected-list");
    expect(list.textContent!.indexOf("#101")).toBeLessThan(list.textContent!.indexOf("#102"));
    fireEvent.click(screen.getAllByLabelText("Move down")[0]);
    expect(list.textContent!.indexOf("#102")).toBeLessThan(list.textContent!.indexOf("#101"));
    fireEvent.click(screen.getByLabelText("Remove 102"));
    expect(list.textContent).not.toContain("#102");
  });

  it("disables Generate with a reason until the request validates per mode", async () => {
    render(<ContentStudioPage />);
    await waitFor(() => expect(screen.getByText("backend ready")).toBeTruthy());
    // No selection yet.
    expect((screen.getByTestId("generate-button") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId("disabled-reason").textContent).toMatch(/at least one/i);
    // Multi-question needs 2-10.
    fireEvent.click(screen.getByRole("radio", { name: /Multi-question challenge/i }));
    await searchAndAdd(["101"]);
    expect((screen.getByTestId("generate-button") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId("disabled-reason").textContent).toMatch(/2-10/);
    fireEvent.click(screen.getByLabelText("Add question 102"));
    await waitFor(() =>
      expect((screen.getByTestId("generate-button") as HTMLButtonElement).disabled).toBe(false),
    );
  });

  it("daily-package requires a featured (★) question", async () => {
    render(<ContentStudioPage />);
    fireEvent.click(screen.getByRole("radio", { name: /Daily package/i }));
    await searchAndAdd(["101", "102"]);
    expect((screen.getByTestId("generate-button") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByLabelText("Feature question 101"));
    // 101 featured + reused, 102 challenge → still below the 2-question
    // challenge minimum needs one more... featured reuse counts, so 102 + ★ = 2 → valid.
    await waitFor(() =>
      expect((screen.getByTestId("generate-button") as HTMLButtonElement).disabled).toBe(false),
    );
  });

  it("starts a job and renders its progress log", async () => {
    render(<ContentStudioPage />);
    await searchAndAdd(["101"]);
    await waitFor(() =>
      expect((screen.getByTestId("generate-button") as HTMLButtonElement).disabled).toBe(false),
    );
    fireEvent.click(screen.getByTestId("generate-button"));
    await waitFor(() => expect(screen.getByTestId("job-log").textContent).toContain("mobile-social question"));
    expect(screen.getByText("running")).toBeTruthy();
  });

  it("shows an offline notice when the studio server is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("ECONNREFUSED"))),
    );
    render(<ContentStudioPage />);
    await waitFor(() => expect(screen.getByText("server offline")).toBeTruthy());
    expect(screen.getByTestId("disabled-reason").textContent).toMatch(/npm run content-studio/);
  });
});
