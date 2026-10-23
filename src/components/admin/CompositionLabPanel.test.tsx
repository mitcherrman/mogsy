/**
 * Admin · Daily Composition Lab panel. The server owns composition and the
 * answers; these pin what the panel sends, what it shows, and that the CSV
 * download asks for exactly the batch on screen, with the owner's headers.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("@/lib/admin-auth/adminCredentials", () => ({
  ADMIN_API_BASE_URL: "https://railway.example",
  buildAdminHeaders: vi.fn(async () => ({ Authorization: "Bearer owner-session" })),
}));

import { CompositionLabPanel } from "./CompositionLabPanel";
import { exportFilename, exportUrl, type LabBatch } from "@/lib/daily-challenge/run/compositionLab";

const row = (n: number, extra: Record<string, unknown> = {}) => ({
  answer_index: n, segment_index: n, challenge_index: 0, act: "early", set_id: "early.1",
  difficulty_band: "E", timer_seconds: 18, interaction: "mcq", family: "item_cost",
  question_ref: `quiz:item_cost:${n}`, prompt: `Question ${n}?`, choices_json: JSON.stringify(["A", "B"]),
  correct_answer: "B", resolution: "exact", resolution_note: "", ...extra,
});

function batch(request: LabBatch["request"], ids: string[]): LabBatch {
  return {
    batch_refs_in_multiple_samples: 2,
    request,
    samples: ids.map((id) => ({
      sample_id: id, status: "composed", mode: request.mode ?? "actual", date: "2026-10-23",
      variant_seed: "seed", seed_source: "plan.day_seed", bank_revision: "bank:abc", content_digest: "d",
      config_fingerprint: "c", composer_version: "v",
      summary: {
        answers: 21, unresolved: 0, resolution: { exact: 17, exact_set: 1, sample: 3 },
        families: { item_cost: 4, combat_cooldown: 2 }, interactions: { mcq: 17, order: 1, meta_reflex: 3 },
        acts: { early: 6, mid: 6, late: 6, meta_reflex: 3 }, difficulty: { E: 6, M: 6, H: 6, "-": 3 },
        duplicate_refs: 0, duplicate_subjects: 1, refs_shared_with_other_samples: 1,
        quotas: { minion_xp: 1 }, quotas_unmet: [], shortages: [],
      },
      rows: [row(1), row(2, { interaction: "meta_reflex", act: "", challenge_index: 1, mr_left_display: "3,000 gold", mr_right_display: "75 gold", resolution: "sample" })],
    })),
  };
}

type Call = { url: string; init?: RequestInit };
let calls: Call[];

function stub(handler: (url: string, init?: RequestInit) => unknown, ok = true, status = 200) {
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const body = handler(url, init);
    return { ok, status, json: async () => body, text: async () => "schema_version\r\n" };
  }));
}

beforeEach(() => { vi.restoreAllMocks(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Composition Lab panel", () => {
  it("fetches nothing until asked", () => {
    stub(() => ({}));
    render(<CompositionLabPanel />);
    expect(calls).toHaveLength(0);
    expect(screen.getByTestId("lab-download")).toHaveProperty("disabled", true);
  });

  it("generates the actual composition and shows its summary and questions", async () => {
    stub(() => batch({ date: "2026-10-23", mode: "actual", count: null, token: null, sample_id: null }, ["tav2.2026-10-23.actual"]));
    render(<CompositionLabPanel />);
    fireEvent.change(screen.getByLabelText("UTC date"), { target: { value: "2026-10-23" } });
    fireEvent.click(screen.getByTestId("lab-generate"));
    expect((await screen.findByTestId("lab-sample-id")).textContent).toBe("tav2.2026-10-23.actual");
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ date: "2026-10-23", mode: "actual" });
    expect(calls[0].url).toBe("https://railway.example/api/daily-run/admin/composition-lab/samples");
    const summary = screen.getByTestId("lab-sample-summary").textContent ?? "";
    expect(summary).toContain("mcq 17");
    expect(summary).toContain("meta_reflex 3");
    expect(summary).toContain("1 shared with other samples");
    fireEvent.click(screen.getByTestId("lab-view-questions"));
    const list = screen.getByTestId("lab-question-list").textContent ?? "";
    expect(list).toContain("Question 1?");
    expect(list).toContain("Answer: B");
    expect(list).toContain("Meta Reflex card 2");
    expect(list).toContain("(3,000 gold vs 75 gold)");
  });

  it("variations: generate keeps the token, shuffle asks for a new one", async () => {
    stub((_url, init) => {
      const body = JSON.parse(String(init?.body));
      const token = body.shuffle ? "f00d" : body.token;
      return batch({ date: "2026-10-23", mode: "variant", count: 5, token, sample_id: null }, [`tav2.2026-10-23.${token}.1`]);
    });
    render(<CompositionLabPanel />);
    fireEvent.change(screen.getByLabelText("UTC date"), { target: { value: "2026-10-23" } });
    fireEvent.click(screen.getByTestId("lab-mode-variant"));
    fireEvent.click(screen.getByTestId("lab-generate"));
    await screen.findByTestId("lab-batch");
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ date: "2026-10-23", mode: "variant", count: 5, token: "base" });
    fireEvent.click(screen.getByTestId("lab-shuffle"));
    await waitFor(() => expect(screen.getByTestId("lab-sample-id").textContent).toBe("tav2.2026-10-23.f00d.1"));
    expect(JSON.parse(String(calls[1].init?.body))).toEqual({ date: "2026-10-23", mode: "variant", count: 5, shuffle: true });
    fireEvent.click(screen.getByTestId("lab-generate"));
    await waitFor(() => expect(calls).toHaveLength(3));
    expect(JSON.parse(String(calls[2].init?.body)).token).toBe("f00d");
  });

  it("downloads exactly the batch on screen with the owner's headers", async () => {
    const createUrl = vi.fn(() => "blob:lab");
    const revoke = vi.fn();
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: createUrl, revokeObjectURL: revoke }));
    stub(() => batch({ date: "2026-10-23", mode: "variant", count: 10, token: "abc", sample_id: null }, ["tav2.2026-10-23.abc.1"]));
    render(<CompositionLabPanel />);
    fireEvent.click(screen.getByTestId("lab-mode-variant"));
    fireEvent.click(screen.getByTestId("lab-generate"));
    await screen.findByTestId("lab-batch");
    fireEvent.click(screen.getByTestId("lab-download"));
    await waitFor(() => expect(createUrl).toHaveBeenCalled());
    const get = calls[1];
    expect(get.url).toBe("https://railway.example/api/daily-run/admin/composition-lab/export.csv?date=2026-10-23&mode=variant&count=10&token=abc");
    expect(get.init?.headers).toEqual({ Authorization: "Bearer owner-session" });
    expect(revoke).toHaveBeenCalledWith("blob:lab");
  });

  it("reproduces a sample by ID and surfaces server refusals", async () => {
    stub(() => ({ detail: { code: "LAB_BAD_SAMPLE_ID", message: "unrecognised sample id" } }), false, 400);
    render(<CompositionLabPanel />);
    fireEvent.change(screen.getByLabelText("Sample ID"), { target: { value: "nope" } });
    fireEvent.click(screen.getByTestId("lab-reproduce"));
    expect((await screen.findByTestId("lab-error")).textContent).toContain("unrecognised sample id");
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ sample_id: "nope" });
    expect(screen.queryByTestId("lab-batch")).toBeNull();
  });
});

describe("export URL", () => {
  it("names a single reproduced sample by its id", () => {
    const b = batch({ date: null, mode: null, count: null, token: null, sample_id: "tav2.2026-10-23.abc.3" }, ["x"]);
    expect(exportUrl(b)).toBe("https://railway.example/api/daily-run/admin/composition-lab/export.csv?sample_id=tav2.2026-10-23.abc.3");
    expect(exportFilename(b)).toBe("daily-composition_tav2.2026-10-23.abc.3.csv");
  });
});
