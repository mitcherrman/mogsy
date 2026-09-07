/**
 * CON1 Step 3A — the local Content Workspace as a HANDOFF RECEIVER.
 *
 * What is being held:
 *   1. a workspace opened from an Admin link seeds itself — selection AND
 *      configuration — without anyone searching the corpus again;
 *   2. multi-question ORDER survives the handoff, including when the local
 *      server resolves the ids out of order;
 *   3. a pasted payload is the same intake, through the same validator;
 *   4. an invalid handoff is refused with its reason, and the workspace stays
 *      usable rather than dying on it;
 *   5. the seeded configuration is EDITABLE and local edits win — Admin seeds,
 *      the workspace owns the final generation configuration;
 *   6. reorder, post-mode/challenge composition, daily-package, featured,
 *      preview, generate and run browsing are all still here;
 *   7. the legacy corpus search is GONE, and nothing reaches its server route.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import ContentStudioPage from "./ContentStudioPage";
import { readFileSync } from "node:fs";
import path from "node:path";
import { serializeContentHandoff, validateContentHandoff } from "@/lib/content-handoff/schema";
import { isFailure } from "@/lib/result-narrowing";

const mkQuestion = (id: string, prompt: string) => ({
  id,
  prompt,
  category: "items",
  choices: ["Sunfire", "Thornmail"],
  correct_index: 1,
  correct_label: "Thornmail",
  content_difficulty: "gold",
  question_type: "item_build_path",
  is_active: true,
  compatible: true,
  incompatible_reason: null,
});

const BY_ID: Record<string, ReturnType<typeof mkQuestion>> = {
  "101": mkQuestion("101", "Which item grants the most armor?"),
  "102": mkQuestion("102", "Which item grants haste?"),
  "103": mkQuestion("103", "Which boots give tenacity?"),
};

/** Ids the mocked server should fail to resolve. */
let missingIds = new Set<string>();
/** Per-id resolution delay, so a handoff can resolve OUT of its own order. */
let idDelayMs: Record<string, number> = {};
let requestedIds: string[] = [];

function respond(body: unknown, status = 200): Promise<Response> {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

async function mockFetch(url: string): Promise<Response> {
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
    const id = single[1];
    requestedIds.push(id);
    const delay = idDelayMs[id] ?? 0;
    if (delay) await new Promise((r) => setTimeout(r, delay));
    if (missingIds.has(id)) return respond({ error: `Question ${id} not found` }, 404);
    const q = BY_ID[id];
    return q ? respond({ question: q }) : respond({ error: "not found" }, 404);
  }
  if (url.includes("/questions")) return respond({ questions: Object.values(BY_ID) });
  if (url.includes("/jobs/job-1")) {
    return respond({
      id: "job-1", state: "running", mode: "classic", created_at: "", finished_at: null,
      run_ids: [], result: null, error: null, log: ["[capture] ✓ mobile-social question"],
    });
  }
  if (url.endsWith("/jobs")) return respond({ job_id: "job-1", state: "queued" }, 202);
  if (url.includes("/runs/run-a")) {
    return respond({
      run_id: "run-a", manifest: null, summary: null, failures: null,
      images: ["q101/mobile-social/question.png"], has_contact_sheet: true,
    });
  }
  if (url.includes("/runs")) {
    return respond({
      runs: [{
        run_id: "run-a", modified_at: "2026-09-06T00:00:00Z", mode: "classic",
        package_type: null, question_count: 1, capture_count: 2, failure_count: 0,
        warning_count: 0, has_manifest: true, has_contact_sheet: true, image_count: 2,
      }],
      packages: [],
    });
  }
  return respond({ error: "not found" }, 404);
}

/** Open the page as if Admin had linked into it. */
function openWith(search: string) {
  window.history.replaceState({}, "", `/dev/content-studio${search}`);
  return render(<ContentStudioPage />);
}

beforeEach(() => {
  missingIds = new Set();
  idDelayMs = {};
  requestedIds = [];
  vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => mockFetch(String(input))));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState({}, "", "/");
});

const selectedText = () => screen.getByTestId("selected-list").textContent ?? "";
const orderOf = (...ids: string[]) => ids.map((id) => selectedText().indexOf(`#${id}`));

describe("a workspace opened from an Admin handoff", () => {
  it("seeds the selection without anyone searching the corpus", async () => {
    openWith("?hv=1&ids=101,102&formats=mobile-social,square&states=question,correct&difficulty=gold&run=drop_1");
    await waitFor(() => expect(selectedText()).toContain("#101"));
    expect(selectedText()).toContain("#102");
    // The corpus search was never called — only the by-id reads the handoff asked for.
    expect(requestedIds).toEqual(["101", "102"]);
    const calls = (fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls.map(String);
    expect(calls.some((c) => c.includes("search="))).toBe(false);
  });

  it("prefills the handed-off formats, states, difficulty and run name", async () => {
    openWith("?hv=1&ids=101&formats=square&states=explanation&difficulty=diamond&run=drop_1");
    await waitFor(() => expect(selectedText()).toContain("#101"));
    expect((screen.getByLabelText(/Run ID/i) as HTMLInputElement).value).toBe("drop_1");
    expect((screen.getByLabelText(/Default difficulty/i) as HTMLSelectElement).value).toBe("diamond");
    const checked = (label: string) =>
      (screen.getByText(label).closest("label")!.querySelector("button,input") as HTMLElement)
        ?.getAttribute("data-state") ?? "";
    expect(checked("square")).toBe("checked");
    expect(checked("mobile-social")).toBe("unchecked");
    expect(checked("explanation")).toBe("checked");
    expect(checked("question")).toBe("unchecked");
  });

  it("seeds classic mode for a states handoff and the post mode for a post handoff", async () => {
    const { unmount } = openWith("?hv=1&ids=101&states=question");
    await waitFor(() => expect(selectedText()).toContain("#101"));
    expect(screen.getByRole("radio", { name: /Classic/ }).getAttribute("aria-checked")).toBe("true");
    unmount();
    cleanup();
    openWith("?hv=1&ids=101&post=answer-reveal");
    await waitFor(() => expect(selectedText()).toContain("#101"));
    expect(screen.getByRole("radio", { name: /Answer reveal/ }).getAttribute("aria-checked")).toBe("true");
  });

  it("keeps the handoff ORDER even when the ids resolve out of order", async () => {
    idDelayMs = { "101": 40, "102": 5, "103": 20 };
    openWith("?hv=1&ids=101,102,103&formats=mobile-social&states=question");
    await waitFor(() => expect(selectedText()).toContain("#103"));
    const [a, b, c] = orderOf("101", "102", "103");
    expect(a).toBeLessThan(b);
    expect(b).toBeLessThan(c);
  });

  it("reports an id the local server cannot resolve instead of quietly shortening the run", async () => {
    missingIds = new Set(["102"]);
    openWith("?hv=1&ids=101,102,103&formats=mobile-social&states=question");
    await waitFor(() => expect(screen.getByTestId("handoff-unresolved")).toBeTruthy());
    expect(screen.getByTestId("handoff-unresolved").textContent).toContain("#102");
    expect(selectedText()).toContain("#101");
    expect(selectedText()).toContain("#103");
    expect(selectedText()).not.toContain("#102");
  });

  it("refuses an invalid handoff with its reason, and stays usable", async () => {
    openWith("?hv=1&ids=101&formats=billboard");
    await waitFor(() => expect(screen.getByTestId("handoff-errors")).toBeTruthy());
    expect(screen.getByTestId("handoff-errors").textContent).toMatch(/Unknown format "billboard"/);
    // Nothing was seeded, and the paste intake is still there so the operator
    // is not stranded on a dead link.
    expect(screen.queryByTestId("handoff-banner")).toBeNull();
    expect(screen.getByTestId("handoff-import-input")).toBeTruthy();
  });

  it("refuses a URL carrying a secret or a gate override", async () => {
    openWith("?hv=1&ids=101&admin-key=hunter2");
    await waitFor(() => expect(screen.getByTestId("handoff-errors")).toBeTruthy());
    expect(screen.getByTestId("handoff-errors").textContent).toMatch(/forbidden parameter/);
    cleanup();
    openWith("?hv=1&ids=101&allowMissingAssets=1");
    await waitFor(() => expect(screen.getByTestId("handoff-errors")).toBeTruthy());
    expect(screen.getByTestId("handoff-errors").textContent).toMatch(/forbidden parameter/);
  });

  it("says the Admin readiness check is a preflight, not the final gate", async () => {
    openWith("?hv=1&ids=101&states=question");
    await waitFor(() => expect(screen.getByTestId("handoff-banner")).toBeTruthy());
    expect(screen.getByTestId("handoff-banner").textContent).toMatch(/preflight/i);
    expect(screen.getByTestId("handoff-banner").textContent).toMatch(/generation time/i);
  });
});

describe("the pasted-payload intake", () => {
  const payload = () => {
    const r = validateContentHandoff({
      questionIds: ["103", "101"],
      formats: ["square"],
      states: ["correct"],
      difficulty: "iron",
      runId: "pasted_run",
    });
    if (isFailure(r)) throw new Error(r.errors.join("; "));
    return serializeContentHandoff(r.handoff);
  };

  const paste = (text: string) => {
    fireEvent.change(screen.getByTestId("handoff-import-input"), { target: { value: text } });
    fireEvent.click(screen.getByTestId("handoff-import-button"));
  };

  it("seeds the workspace from a pasted config, in order", async () => {
    render(<ContentStudioPage />);
    paste(payload());
    await waitFor(() => expect(selectedText()).toContain("#101"));
    const [a, b] = orderOf("103", "101");
    expect(a).toBeLessThan(b);
    expect(screen.getByTestId("handoff-banner").getAttribute("data-handoff-origin")).toBe("import");
    expect((screen.getByLabelText(/Run ID/i) as HTMLInputElement).value).toBe("pasted_run");
  });

  it("accepts a pasted workspace URL as well as the JSON payload", async () => {
    render(<ContentStudioPage />);
    paste("http://127.0.0.1:5199/dev/content-studio?hv=1&ids=102&formats=square&states=correct");
    await waitFor(() => expect(selectedText()).toContain("#102"));
  });

  it("refuses an invalid paste with its reason and seeds nothing", async () => {
    render(<ContentStudioPage />);
    paste('{"questionIds":["../etc"]}');
    await waitFor(() => expect(screen.getByTestId("handoff-errors")).toBeTruthy());
    expect(screen.getByTestId("handoff-errors").textContent).toMatch(/Invalid question id/);
    expect(screen.queryByTestId("handoff-banner")).toBeNull();
  });
});

describe("Admin seeds, the workspace owns the final configuration", () => {
  it("lets a local edit override the seed, and says so", async () => {
    openWith("?hv=1&ids=101&formats=mobile-social&states=question&difficulty=gold");
    await waitFor(() => expect(selectedText()).toContain("#101"));
    expect(screen.getByTestId("handoff-banner").getAttribute("data-handoff-edited")).toBe("false");
    expect(screen.queryByTestId("handoff-edited")).toBeNull();

    fireEvent.change(screen.getByLabelText(/Default difficulty/i), { target: { value: "iron" } });
    await waitFor(() =>
      expect(screen.getByTestId("handoff-banner").getAttribute("data-handoff-edited")).toBe("true"),
    );
    expect(screen.getByTestId("handoff-edited").textContent).toMatch(/workspace owns the final/i);
    expect((screen.getByLabelText(/Default difficulty/i) as HTMLSelectElement).value).toBe("iron");
  });

  it("still reports the seed after it has been edited — the banner never lies about it", async () => {
    openWith("?hv=1&ids=101&formats=mobile-social&states=question&run=seed_run");
    await waitFor(() => expect(selectedText()).toContain("#101"));
    fireEvent.change(screen.getByLabelText(/Run ID/i), { target: { value: "local_run" } });
    await waitFor(() =>
      expect(screen.getByTestId("handoff-banner").getAttribute("data-handoff-edited")).toBe("true"),
    );
    expect(screen.getByTestId("handoff-seed").textContent).toContain("seed_run");
  });
});

describe("the specialized workspace capabilities survive", () => {
  it("still reorders a handed-off selection, and the reorder is the edit", async () => {
    openWith("?hv=1&ids=101,102&formats=mobile-social&states=question");
    await waitFor(() => expect(selectedText()).toContain("#102"));
    expect(orderOf("101", "102")[0]).toBeLessThan(orderOf("101", "102")[1]);
    fireEvent.click(screen.getAllByLabelText("Move down")[0]);
    const [a, b] = orderOf("101", "102");
    expect(b).toBeLessThan(a);
    await waitFor(() =>
      expect(screen.getByTestId("handoff-banner").getAttribute("data-handoff-edited")).toBe("true"),
    );
  });

  it("still offers every post/composition mode, including the Studio-only ones", async () => {
    render(<ContentStudioPage />);
    for (const name of [/Classic/, /Single question/, /Answer reveal/, /Multi-question/, /Daily package/]) {
      expect(screen.getByRole("radio", { name })).toBeTruthy();
    }
  });

  it("still composes a challenge and a daily package from a handed-off selection", async () => {
    openWith("?hv=1&ids=101,102&formats=mobile-social&states=question");
    await waitFor(() => expect(selectedText()).toContain("#102"));
    fireEvent.click(screen.getByRole("radio", { name: /Multi-question/ }));
    await waitFor(() =>
      expect((screen.getByTestId("generate-button") as HTMLButtonElement).disabled).toBe(false),
    );
    // Daily package: featured (★) treatment is still how the opener is chosen.
    fireEvent.click(screen.getByRole("radio", { name: /Daily package/ }));
    expect((screen.getByTestId("generate-button") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByLabelText("Feature question 101"));
    await waitFor(() =>
      expect((screen.getByTestId("generate-button") as HTMLButtonElement).disabled).toBe(false),
    );
  });

  it("still generates from a handed-off selection and shows the job log", async () => {
    openWith("?hv=1&ids=101&formats=mobile-social&states=question");
    await waitFor(() => expect(selectedText()).toContain("#101"));
    await waitFor(() =>
      expect((screen.getByTestId("generate-button") as HTMLButtonElement).disabled).toBe(false),
    );
    fireEvent.click(screen.getByTestId("generate-button"));
    await waitFor(() =>
      expect(screen.getByTestId("job-log").textContent).toContain("mobile-social question"),
    );
  });

  it("still browses previous runs, the manifest, per-image files and the ZIP", async () => {
    render(<ContentStudioPage />);
    const tab = screen.getByRole("tab", { name: /Previous runs/i });
    fireEvent.mouseDown(tab);
    fireEvent.focus(tab);
    await waitFor(() => expect(screen.getByText("run-a")).toBeTruthy());
    fireEvent.click(screen.getByText("run-a"));
    await waitFor(() => expect(screen.getAllByTestId("slide-grid").length).toBeGreaterThan(0));
    // ZIP export, contact sheet, and the per-image file link all still resolve
    // through the local server's own file routes.
    const href = (name: RegExp) =>
      (screen.getAllByText(name)[0].closest("a") as HTMLAnchorElement).getAttribute("href") ?? "";
    expect(href(/download zip/i)).toContain("/runs/run-a/zip");
    expect(href(/contact sheet/i)).toContain("/runs/run-a/files/index.html");
    const img = screen.getAllByRole("img")[0] as HTMLImageElement;
    expect(img.getAttribute("src")).toContain("/runs/run-a/files/q101/mobile-social/question.png");
  });
});

describe("legacy discovery is GONE (CON1 Step 3A2)", () => {
  it("has no corpus-search UI, under a handoff or without one", async () => {
    openWith("?hv=1&ids=101&formats=mobile-social&states=question");
    await waitFor(() => expect(selectedText()).toContain("#101"));
    for (const id of ["legacy-search", "legacy-search-toggle", "search-results"]) {
      expect(screen.queryByTestId(id)).toBeNull();
    }
    expect(screen.queryByPlaceholderText(/Search text or exact ID/i)).toBeNull();
    expect(screen.queryByPlaceholderText(/Category/i)).toBeNull();
    cleanup();

    render(<ContentStudioPage />);
    for (const id of ["legacy-search", "legacy-search-toggle", "search-results"]) {
      expect(screen.queryByTestId(id)).toBeNull();
    }
    expect(screen.queryByPlaceholderText(/Search text or exact ID/i)).toBeNull();
  });

  it("cannot reach the removed search route — it is never requested", async () => {
    render(<ContentStudioPage />);
    await waitFor(() => expect(screen.getByTestId("handoff-empty")).toBeTruthy());
    fireEvent.change(screen.getByTestId("handoff-import-input"), {
      target: { value: "http://127.0.0.1:5199/dev/content-studio?hv=1&ids=101" },
    });
    fireEvent.click(screen.getByTestId("handoff-import-button"));
    await waitFor(() => expect(selectedText()).toContain("#101"));
    const calls = (fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls.map(String);
    expect(calls.some((c) => c.includes("search="))).toBe(false);
    expect(calls.some((c) => c.includes("category="))).toBe(false);
    // The per-id hydration route IS still used — that is the one that stays.
    expect(calls.some((c) => c.includes("/questions/101"))).toBe(true);
    expect(requestedIds).toEqual(["101"]);
  });

  it("sends an operator with no handoff to Admin Quiz Review, not to a search box", () => {
    render(<ContentStudioPage />);
    const empty = screen.getByTestId("handoff-empty");
    expect(empty.textContent).toMatch(/does not search the corpus/i);
    expect(screen.getByTestId("handoff-admin-link").getAttribute("href")).toBe(
      "/admin/quiz-content",
    );
    // The paste intake is the other way in, and it is present.
    expect(screen.getByTestId("handoff-import-input")).toBeTruthy();
  });

  it("keeps no corpus-search method on the local API client", async () => {
    const api = await import("@/lib/content-studio/api");
    expect("searchQuestions" in api.studioApi).toBe(false);
    expect(typeof api.studioApi.getQuestion).toBe("function");
  });

  it("leaves no frontend consumer of the removed server route", () => {
    // Proved against the source, not asserted from memory: the route was
    // deleted only because nothing but the search UI called it.
    const root = path.resolve(__dirname, "../../..");
    const files = [
      "lib/content-studio/api.ts",
      "pages/dev/content-studio/ContentStudioPage.tsx",
    ];
    for (const rel of files) {
      const code = readFileSync(path.join(root, rel), "utf8");
      expect(code).not.toMatch(/searchQuestions/);
      expect(code).not.toMatch(/questions\?search=/);
    }
    const server = readFileSync(
      path.resolve(root, "../scripts/content-studio/server.ts"),
      "utf8",
    );
    expect(server).not.toMatch(/async function searchQuestions/);
    expect(server).toMatch(/fetchQuestionById/); // per-id hydration stays
  });
});
