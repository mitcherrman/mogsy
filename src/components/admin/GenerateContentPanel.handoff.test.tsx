/**
 * CON1 Step 3A — the Admin side of the handoff: "Open Content Workspace".
 *
 * What is being held:
 *   1. the generated localhost URL is deterministic, loopback-only, and
 *      carries exactly the selection in exactly the selection order;
 *   2. the link, the copyable config and the copyable command all describe the
 *      SAME work — three routes, one configuration;
 *   3. no secret, backend URL or diagnostic gate override appears in any of
 *      them, or anywhere on the surface;
 *   4. a blocked selection cannot be handed off by ANY route — the workspace
 *      link is disabled exactly when Copy command is;
 *   5. Admin makes no claim about whether the workspace is running: there is
 *      no probe, and the offline case degrades to the browser's own error with
 *      the copy routes still available.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { GenerateContentPanel } from "./GenerateContentPanel";
import type { ReviewQuestion } from "@/lib/quiz/api";
import type { AssetStatus } from "@/lib/quiz/assetStatus";
import { EXACT_MINION_PRESENTATION } from "@/lib/quiz-screenshot/presentationFixtures";
import { NEVER_EMITTED_FLAGS } from "@/lib/quiz-screenshot/command";
import { HANDOFF_FORBIDDEN_KEYS, decodeContentHandoffParams } from "@/lib/content-handoff/schema";
import { CONTENT_WORKSPACE_PORT } from "@/lib/content-handoff/location";
import { isFailure } from "@/lib/result-narrowing";

const NOT_REQUIRED: AssetStatus = {
  status: "not_required", reason: "", references: [], unresolved: [],
  degraded_to_text: false, optional_unresolved: false, case_repaired: false,
};

const mkQuestion = (id: number, over: Partial<ReviewQuestion> = {}): ReviewQuestion => ({
  id,
  question_text: `Question number ${id}`,
  category: "items",
  format: "multiple_choice",
  choices: ["Thornmail", "Sunfire Aegis", "Randuin's Omen"],
  correct_answer: { type: "text", value: "Thornmail" },
  is_active: true,
  review_status: "unreviewed",
  favorite_for_shorts: false,
  missing_asset: false,
  asset_status: NOT_REQUIRED,
  ...over,
});

const renderPanel = (questions: ReviewQuestion[]) =>
  render(<GenerateContentPanel questions={questions} onClose={vi.fn()} />);

const workspaceLink = () =>
  screen.getByTestId("generate-content-open-workspace") as HTMLAnchorElement;

afterEach(cleanup);

describe("the Open Content Workspace link", () => {
  it("is deterministic, loopback-only, and on the workspace route", () => {
    renderPanel([mkQuestion(41), mkQuestion(7)]);
    const href = workspaceLink().getAttribute("href")!;
    cleanup();
    renderPanel([mkQuestion(41), mkQuestion(7)]);
    expect(workspaceLink().getAttribute("href")).toBe(href);

    const url = new URL(href);
    expect(url.protocol).toBe("http:");
    expect(url.hostname).toBe("127.0.0.1");
    expect(url.port).toBe(String(CONTENT_WORKSPACE_PORT));
    expect(url.pathname).toBe("/dev/content-studio");
  });

  it("carries the selection in the SELECTION order, never sorted", () => {
    renderPanel([mkQuestion(9), mkQuestion(2), mkQuestion(30), mkQuestion(1)]);
    const parsed = decodeContentHandoffParams(new URL(workspaceLink().href).search.slice(1));
    if (isFailure(parsed)) throw new Error(parsed.errors.join("; "));
    expect(parsed.handoff.questionIds).toEqual(["9", "2", "30", "1"]);
  });

  it("carries the configuration the operator chose, and updates when it changes", () => {
    renderPanel([mkQuestion(41)]);
    fireEvent.click(screen.getByTestId("content-format-square"));
    fireEvent.click(screen.getByTestId("content-difficulty-diamond"));
    fireEvent.change(screen.getByLabelText("Run name"), { target: { value: "drop_2" } });
    const parsed = decodeContentHandoffParams(new URL(workspaceLink().href).search.slice(1));
    if (isFailure(parsed)) throw new Error(parsed.errors.join("; "));
    expect(parsed.handoff.formats).toContain("square");
    expect(parsed.handoff.difficulty).toBe("diamond");
    expect(parsed.handoff.runId).toBe("drop_2");
  });

  it("carries a post type instead of states, exactly as the command does", () => {
    renderPanel([mkQuestion(41)]);
    fireEvent.click(screen.getByTestId("content-post-answer-reveal"));
    const parsed = decodeContentHandoffParams(new URL(workspaceLink().href).search.slice(1));
    if (isFailure(parsed)) throw new Error(parsed.errors.join("; "));
    expect(parsed.handoff.post).toBe("answer-reveal");
    expect(parsed.handoff.states).toEqual([]);
    expect(screen.getByTestId("generate-content-command").textContent).toContain(
      "--post answer-reveal",
    );
  });

  it("opens in a new tab without handing the workspace this page's opener", () => {
    renderPanel([mkQuestion(41)]);
    expect(workspaceLink().getAttribute("target")).toBe("_blank");
    expect(workspaceLink().getAttribute("rel")).toContain("noopener");
  });

  it("describes the same work as the copyable command", () => {
    renderPanel([mkQuestion(9), mkQuestion(2)]);
    const parsed = decodeContentHandoffParams(new URL(workspaceLink().href).search.slice(1));
    if (isFailure(parsed)) throw new Error(parsed.errors.join("; "));
    const command = screen.getByTestId("generate-content-command").textContent ?? "";
    expect(command).toContain(`--question-ids "${parsed.handoff.questionIds.join(",")}"`);
    expect(command).toContain(`--states "${parsed.handoff.states.join(",")}"`);
    expect(command).toContain(`--formats ${parsed.handoff.formats.join(",")}`);
  });
});

describe("no secrets travel by any route", () => {
  it("puts no forbidden flag or key in the link, the config, or anywhere on the surface", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const { container } = renderPanel([mkQuestion(41), mkQuestion(7)]);

    const href = workspaceLink().getAttribute("href")!.toLowerCase();
    for (const key of HANDOFF_FORBIDDEN_KEYS) expect(href).not.toContain(key);
    for (const flag of NEVER_EMITTED_FLAGS) expect(href).not.toContain(flag.slice(2));

    fireEvent.click(screen.getByTestId("generate-content-copy-config"));
    await vi.waitFor(() => expect(writeText).toHaveBeenCalled());
    const config = String(writeText.mock.calls[0][0]).toLowerCase();
    for (const key of HANDOFF_FORBIDDEN_KEYS) expect(config).not.toContain(key);

    // And the surface itself offers no control that could turn one on.
    const surface = (container.textContent ?? "").toLowerCase();
    for (const flag of NEVER_EMITTED_FLAGS) expect(surface).not.toContain(flag);
  });

  it("hands over a config a workspace will accept", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    renderPanel([mkQuestion(41), mkQuestion(7)]);
    fireEvent.click(screen.getByTestId("generate-content-copy-config"));
    await vi.waitFor(() => expect(writeText).toHaveBeenCalled());
    const payload = JSON.parse(String(writeText.mock.calls[0][0]));
    expect(payload.questionIds).toEqual(["41", "7"]);
    expect(payload.version).toBe(1);
  });
});

describe("a blocked selection cannot be handed off by ANY route", () => {
  const blockedRow = mkQuestion(3, {
    presentation: EXACT_MINION_PRESENTATION as Record<string, unknown>,
  });

  it("disables the workspace link exactly when Copy command is disabled", () => {
    renderPanel([mkQuestion(41), blockedRow]);
    expect(screen.queryByTestId("generate-content-open-workspace")).toBeNull();
    expect(screen.getByTestId("generate-content-open-workspace-disabled")).toBeTruthy();
    expect((screen.getByTestId("generate-content-copy") as HTMLButtonElement).disabled).toBe(true);
    expect(
      (screen.getByTestId("generate-content-copy-config") as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("re-enables every route once the blocked rows are gone", () => {
    renderPanel([mkQuestion(41)]);
    expect(workspaceLink().getAttribute("href")).toContain("ids=41");
    expect((screen.getByTestId("generate-content-copy") as HTMLButtonElement).disabled).toBe(false);
  });

  it("offers no route at all with an empty selection", () => {
    renderPanel([]);
    expect(screen.queryByTestId("generate-content-open-workspace")).toBeNull();
    expect((screen.getByTestId("generate-content-copy") as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("a workspace that is not running degrades gracefully", () => {
  it("never probes the workspace — Admin makes no claim about it being up", () => {
    // https Admin cannot reach loopback http; a probe would be blocked long
    // before CORS. Asserting no fetch is asserting that no such claim exists.
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    renderPanel([mkQuestion(41)]);
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("keeps the deterministic copy routes beside the link, and says how to start it", () => {
    const { container } = renderPanel([mkQuestion(41)]);
    expect(screen.getByTestId("generate-content-copy")).toBeTruthy();
    expect(screen.getByTestId("generate-content-copy-config")).toBeTruthy();
    expect(container.textContent).toContain("npm run content-studio");
    expect(container.textContent).toMatch(/Not running\?/);
  });
});
