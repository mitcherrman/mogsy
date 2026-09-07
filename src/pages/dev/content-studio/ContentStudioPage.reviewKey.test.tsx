/**
 * CON1 Step 3B — the Content Workspace receives a GENERATED handoff.
 *
 * What is being held:
 *   1. a v2 review-key handoff hydrates through the resolver route, not the
 *      stored-question route;
 *   2. order survives, including when the keys resolve out of their own order;
 *   3. a key the resolver refuses is REPORTED as unresolved, never silently
 *      dropped from the package;
 *   4. the job the workspace would submit names `reviewKeys`, and validates
 *      through the local server's own validator;
 *   5. the corpus search is still gone — Step 3A2 is not reopened by this.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import ContentStudioPage from "./ContentStudioPage";
import {
  contentHandoffFromCommandConfig,
  encodeContentHandoffParams,
  serializeContentHandoff,
} from "@/lib/content-handoff/schema";
import { isFailure } from "@/lib/result-narrowing";

const KEY_A = "mastery:ssm.base.BARRIER";
const KEY_B = "mastery:ssm.combined.BARRIER.cosmic-insight+ionian-boots-of-lucidity";

const mkItem = (key: string, prompt: string) => ({
  id: key,
  review_key: key,
  source_kind: "mastery_question",
  prompt,
  category: "summoners",
  choices: ["180s", "162s", "198s", "144s"],
  correct_index: 0,
  correct_label: "180s",
  content_difficulty: null,
  question_type: null,
  is_active: true,
  compatible: true,
  incompatible_reason: null,
});

const BY_KEY: Record<string, ReturnType<typeof mkItem>> = {
  [KEY_A]: mkItem(KEY_A, "What is the base cooldown of Barrier?"),
  [KEY_B]: mkItem(KEY_B, "Barrier with Cosmic Insight and Ionian Boots?"),
};

let refusedKeys = new Set<string>();
let keyDelayMs: Record<string, number> = {};
let requestedKeys: string[] = [];
let requestedIdPaths: string[] = [];
let postedBodies: unknown[] = [];

function respond(body: unknown, status = 200): Promise<Response> {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

async function mockFetch(url: string, init?: RequestInit): Promise<Response> {
  if (url.includes("/health")) {
    return respond({
      ok: true, backend_configured: true, api_base: "http://127.0.0.1:8000",
      render_base_url: "http://127.0.0.1:5199", active_job: null,
    });
  }
  if (url.includes("/review-items?key=")) {
    const key = decodeURIComponent(url.split("key=")[1]);
    requestedKeys.push(key);
    const delay = keyDelayMs[key] ?? 0;
    if (delay) await new Promise((r) => setTimeout(r, delay));
    if (refusedKeys.has(key)) {
      return respond(
        { error: "A family definition describes a generator, not a question.", code: "definition_only" },
        404,
      );
    }
    const item = BY_KEY[key];
    return item ? respond({ question: item }) : respond({ error: "not found" }, 404);
  }
  const single = url.match(/\/questions\/([^/?]+)$/);
  if (single) {
    requestedIdPaths.push(single[1]);
    return respond({ error: "not found" }, 404);
  }
  if (url.endsWith("/jobs")) {
    postedBodies.push(JSON.parse(String(init?.body ?? "{}")));
    return respond({ job_id: "job-1", state: "queued" }, 202);
  }
  if (url.includes("/jobs/job-1")) {
    return respond({
      id: "job-1", state: "running", mode: "classic", created_at: "", finished_at: null,
      run_ids: [], result: null, error: null, log: [],
    });
  }
  if (url.includes("/runs")) return respond({ runs: [], packages: [] });
  return respond({ error: "not found" }, 404);
}

function openWith(search: string) {
  window.history.replaceState({}, "", `/dev/content-studio${search}`);
  return render(<ContentStudioPage />);
}

/** The v2 query string Admin would actually produce for these keys. */
function v2Search(keys: string[]): string {
  const built = contentHandoffFromCommandConfig({
    questionIds: [],
    reviewKeys: keys,
    formats: ["mobile-social"],
    states: ["question", "correct"],
    post: null,
    difficulty: null,
    runId: null,
    overwrite: false,
  });
  if (isFailure(built)) throw new Error(built.errors.join("; "));
  return `?${encodeContentHandoffParams(built.handoff)}`;
}

beforeEach(() => {
  refusedKeys = new Set();
  keyDelayMs = {};
  requestedKeys = [];
  requestedIdPaths = [];
  postedBodies = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => mockFetch(String(input), init)),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState({}, "", "/");
});

const selectedText = () => screen.getByTestId("selected-list").textContent ?? "";

describe("a v2 review-key handoff", () => {
  it("hydrates through the resolver route, never the stored-question route", async () => {
    openWith(v2Search([KEY_A]));
    await waitFor(() => expect(selectedText()).toContain("Barrier"));
    expect(requestedKeys).toEqual([KEY_A]);
    expect(requestedIdPaths).toEqual([]);
  });

  it("survives a key whose '+' a naive URL round trip would eat", async () => {
    openWith(v2Search([KEY_B]));
    await waitFor(() => expect(requestedKeys.length).toBe(1));
    // A '+' decoded as a space would have asked for a DIFFERENT concept.
    expect(requestedKeys[0]).toBe(KEY_B);
  });

  it("keeps the handoff order even when the keys resolve out of order", async () => {
    keyDelayMs = { [KEY_A]: 40, [KEY_B]: 5 };
    openWith(v2Search([KEY_A, KEY_B]));
    await waitFor(() => expect(selectedText()).toContain("Cosmic Insight"));
    const text = selectedText();
    expect(text.indexOf(KEY_A)).toBeGreaterThanOrEqual(0);
    expect(text.indexOf(KEY_A)).toBeLessThan(text.indexOf(KEY_B));
  });

  it("reports a refused key as unresolved rather than shipping a short package", async () => {
    refusedKeys = new Set([KEY_B]);
    openWith(v2Search([KEY_A, KEY_B]));
    await waitFor(() => expect(selectedText()).toContain("Barrier"));
    await waitFor(() =>
      expect(screen.getByTestId("handoff-banner").textContent).toContain(KEY_B),
    );
    expect(selectedText()).not.toContain("Cosmic Insight");
  });

  it("names the selection as generated in the banner", async () => {
    openWith(v2Search([KEY_A, KEY_B]));
    await waitFor(() => expect(selectedText()).toContain("Cosmic Insight"));
    expect(screen.getByTestId("handoff-seed").textContent).toContain("2 generated");
  });

  it("submits a job carrying reviewKeys, not question ids", async () => {
    openWith(v2Search([KEY_A, KEY_B]));
    await waitFor(() => expect(selectedText()).toContain("Cosmic Insight"));
    fireEvent.click(screen.getByRole("button", { name: /Generate/i }));
    await waitFor(() => expect(postedBodies.length).toBe(1));
    const body = postedBodies[0] as Record<string, unknown>;
    expect(body.reviewKeys).toEqual([KEY_A, KEY_B]);
    expect(body.questionIds).toEqual([]);
  });

  it("accepts the same selection as a pasted payload", async () => {
    const built = contentHandoffFromCommandConfig({
      questionIds: [], reviewKeys: [KEY_A], formats: ["mobile-social"],
      states: ["question"], post: null, difficulty: null, runId: null, overwrite: false,
    });
    if (isFailure(built)) throw new Error(built.errors.join("; "));
    openWith("");
    const box = await screen.findByTestId("handoff-import-input");
    fireEvent.change(box, { target: { value: serializeContentHandoff(built.handoff) } });
    fireEvent.click(screen.getByTestId("handoff-import-button"));
    await waitFor(() => expect(selectedText()).toContain("Barrier"));
    expect(requestedKeys).toEqual([KEY_A]);
  });

  it("still has no corpus search — Step 3A2 is not reopened", async () => {
    openWith(v2Search([KEY_A]));
    await waitFor(() => expect(selectedText()).toContain("Barrier"));
    const calls = (fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls.map(String);
    expect(calls.some((c) => c.includes("search="))).toBe(false);
    expect(screen.queryByTestId("studio-search-input")).toBeNull();
  });
});
