/** MQS1 L1: bounded tests for controls, shared query API and paging. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import QuestionExplorer from "./QuestionExplorer";

vi.mock("@/lib/backend-auth", () => ({
  getBackendAuthHeaders: async () => ({ Authorization: "Bearer test-admin" }),
}));
vi.mock("@/lib/quiz/api", () => ({
  quizApi: { baseUrl: "https://api.example.invalid" },
}));

function json(data: unknown) {
  return new Response(JSON.stringify(data), {
    status: 200, headers: { "Content-Type": "application/json" },
  });
}

const schema = {
  schema_version: "mqs1.1", fields: ["family", "champion", "resource"],
  bank_fields: ["family", "champion", "resource"],
  candidate_families: ["ability_cost_rank"], max_page_size: 10000,
};

const janna = {
  question_key: "ability_cost_rank:Janna:Q:r1",
  champion: "Janna", slot: "Q", rank: 1, family: "ability_cost_rank",
  question_text: "How much mana does Janna Q cost?",
  correct_answer: "60", bank_status: "not_stored",
};

describe("MQS1 Question Explorer", () => {
  let requests: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    requests = vi.fn(async (_url: string, init?: RequestInit) => {
      if (!init?.method) return json(schema);
      return json({ rows: [janna], shown: 1, has_more: false });
    });
    vi.stubGlobal("fetch", requests);
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it("turns visual champion filtering into the exact query sent to the API", async () => {
    render(<QuestionExplorer />);
    fireEvent.change(screen.getByLabelText("Champion"), { target: { value: "Janna" } });
    expect((screen.getByLabelText("Mogzy Query Language") as HTMLTextAreaElement).value)
      .toContain('champion = "Janna"');
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    await waitFor(() => expect(screen.getByText("How much mana does Janna Q cost?")).toBeTruthy());
    const posts = requests.mock.calls.filter((call) => call[1]?.method === "POST");
    expect(posts).toHaveLength(1);
    const posted = JSON.parse(posts[0][1].body as string) as { query: string; offset: number };
    expect(posted.query).toContain('champion = "Janna"');
    expect(posted.offset).toBe(0);
  });

  it("does not mistake a preview page for the whole bank", async () => {
    requests.mockImplementation(async (_url: string, init?: RequestInit) =>
      init?.method ? json({ rows: [janna], shown: 1, has_more: true }) : json(schema));
    render(<QuestionExplorer />);
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    await waitFor(() => expect(screen.getByText("1 shown · more available")).toBeTruthy());
  });

  it("surfaces invalid query responses rather than returning invented rows", async () => {
    requests.mockImplementation(async (_url: string, init?: RequestInit) =>
      init?.method
        ? new Response(JSON.stringify({ detail: { code: "INVALID_QUERY", message: "unknown field" } }),
                       { status: 422, headers: { "Content-Type": "application/json" } })
        : json(schema));
    render(<QuestionExplorer />);
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("unknown field"));
  });
  it("stitches sequential CSV pages with one header and sends advancing offsets", async () => {
    const pages = [
      { body: "a,b
1,2
3,4
", count: "2", more: "true" },
      { body: "a,b
5,6
", count: "1", more: "false" },
    ];
    let n = 0;
    requests.mockImplementation(async (_url: string, init?: RequestInit) => {
      if (!init?.method) return json(schema);
      const page = pages[n++];
      return new Response(page.body, { status: 200, headers: {
        "X-Export-Row-Count": page.count, "X-Export-Has-More": page.more } });
    });
    let saved: Blob | null = null;
    URL.createObjectURL = vi.fn((b: Blob) => { saved = b; return "blob:x"; });
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    render(<QuestionExplorer />);
    fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));
    await waitFor(() => expect(saved).not.toBeNull());
    const text = await new Response(saved!).text();
    expect(text.replace(/^﻿/, "")).toBe("a,b
1,2
3,4
5,6
");
    const offsets = requests.mock.calls.filter((c) => c[1]?.method === "POST")
      .map((c) => JSON.parse(c[1].body as string).offset);
    expect(offsets).toEqual([0, 2]);
  });

  it("downloads nothing when a later CSV page fails", async () => {
    let n = 0;
    requests.mockImplementation(async (_url: string, init?: RequestInit) => {
      if (!init?.method) return json(schema);
      if (n++ === 0) return new Response("a
1
", { status: 200, headers: {
        "X-Export-Row-Count": "1", "X-Export-Has-More": "true" } });
      return new Response("{}", { status: 500, statusText: "boom" });
    });
    URL.createObjectURL = vi.fn(() => "blob:x");
    render(<QuestionExplorer />);
    fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("500"));
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
});
