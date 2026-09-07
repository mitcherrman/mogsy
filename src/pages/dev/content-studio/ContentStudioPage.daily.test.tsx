/**
 * CON1 Step 3C — the Content Workspace receives a frozen Daily handoff.
 *
 * What is being held:
 *   1. a Daily review key hydrates through the SAME resolver route Mastery
 *      uses, and never through the stored-question route — no new handoff
 *      version, no Daily branch in the workspace;
 *   2. two cards of one day keep their handoff order even when they resolve
 *      out of it;
 *   3. a refused card (the frozen Meta Reflex one) is reported as unresolved,
 *      never silently dropped from the package;
 *   4. the submitted job carries `reviewKeys` and no question ids — the source
 *      row's id never becomes the identity;
 *   5. Step 3A2's removal of the workspace's own corpus discovery still holds
 *      under a Daily handoff.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import ContentStudioPage from "./ContentStudioPage";
import {
  contentHandoffFromCommandConfig,
  encodeContentHandoffParams,
} from "@/lib/content-handoff/schema";
import { isFailure } from "@/lib/result-narrowing";

const CARD_12 = "daily:2026-08-20:v1:12";
const CARD_3 = "daily:2026-08-20:v1:3";
const REFLEX_CARD = "daily:2026-08-20:v1:4";

const mkItem = (key: string, prompt: string) => ({
  id: key,
  review_key: key,
  source_kind: "daily_card",
  prompt,
  category: "item_cost category",
  choices: ["item_cost opt 86.0", "item_cost opt 86.1", "item_cost opt 86.2", "item_cost opt 86.3"],
  correct_index: 2,
  correct_label: "item_cost opt 86.2",
  content_difficulty: null,
  question_type: null,
  is_active: true,
  compatible: true,
  incompatible_reason: null,
});

const BY_KEY: Record<string, ReturnType<typeof mkItem>> = {
  [CARD_12]: mkItem(CARD_12, "How much does Long Sword cost?"),
  [CARD_3]: mkItem(CARD_3, "Which item grants the most armour?"),
};

let refusedKeys = new Set<string>();
let keyDelayMs: Record<string, number> = {};
let requestedKeys: string[] = [];
let requestedIdPaths: string[] = [];
let searchCalls: string[] = [];
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
  if (url.includes("search=")) searchCalls.push(url);
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
        {
          error:
            "A frozen Meta Reflex card is a two-entity swipe card — its options " +
            "are entity sides carrying artwork, not four labels.",
          code: "renderer_unsupported",
        },
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

/** The v2 query string Admin would actually produce for these Daily keys. */
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
  searchCalls = [];
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

describe("a frozen Daily handoff", () => {
  it("hydrates through the resolver route, never the stored-question route", async () => {
    openWith(v2Search([CARD_12]));
    await waitFor(() => expect(selectedText()).toContain("Long Sword"));
    expect(requestedKeys).toEqual([CARD_12]);
    expect(requestedIdPaths).toEqual([]);
  });

  it("needs no new handoff version — it is the same v2 items model", async () => {
    const search = v2Search([CARD_12, CARD_3]);
    expect(search).toContain("hv=2");
    expect(search).toContain("items=");
    openWith(search);
    await waitFor(() => expect(requestedKeys.length).toBe(2));
  });

  it("keeps the day's order even when the cards resolve out of it", async () => {
    keyDelayMs = { [CARD_12]: 40, [CARD_3]: 5 };
    openWith(v2Search([CARD_12, CARD_3]));
    await waitFor(() => expect(selectedText()).toContain("armour"));
    const text = selectedText();
    expect(text.indexOf(CARD_12)).toBeGreaterThanOrEqual(0);
    expect(text.indexOf(CARD_12)).toBeLessThan(text.indexOf(CARD_3));
  });

  it("reports a refused reflex card rather than shipping a short package", async () => {
    refusedKeys = new Set([REFLEX_CARD]);
    openWith(v2Search([CARD_12, REFLEX_CARD]));
    await waitFor(() => expect(selectedText()).toContain("Long Sword"));
    await waitFor(() =>
      expect(screen.getByTestId("handoff-banner").textContent).toContain(REFLEX_CARD),
    );
  });

  it("submits a job carrying reviewKeys, and no source-row ids", async () => {
    openWith(v2Search([CARD_12, CARD_3]));
    await waitFor(() => expect(selectedText()).toContain("armour"));
    fireEvent.click(screen.getByRole("button", { name: /Generate/i }));
    await waitFor(() => expect(postedBodies.length).toBe(1));
    const body = postedBodies[0] as Record<string, unknown>;
    expect(body.reviewKeys).toEqual([CARD_12, CARD_3]);
    expect(body.questionIds).toEqual([]);
  });

  it("brought no corpus search back with it", async () => {
    openWith(v2Search([CARD_12]));
    await waitFor(() => expect(selectedText()).toContain("Long Sword"));
    expect(searchCalls).toEqual([]);
    expect(screen.queryByTestId("studio-search-input")).toBeNull();
  });
});
