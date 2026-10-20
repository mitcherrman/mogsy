/**
 * RFB — what the owner actually sees in the Feedback inbox.
 *
 * `adminReportView.test.ts` proves the projection; this proves the RENDER, and
 * it exists because the live surface cannot be opened in a browser without a
 * signed-in Supabase admin AND the FB1-4 migration applied. Those are both
 * real deployment steps, so the readability of the inbox — the one thing that
 * decides whether these reports are worth anything to the owner — would
 * otherwise go unverified until after the deploy.
 *
 * Supabase is mocked at the client boundary, so this asserts presentation
 * only: no RLS, no RPC behaviour, no privilege claims.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const QUESTION_ROW = {
  id: "fb-1",
  profile_id: "p-1",
  entry_intent: "question_report",
  type: "bug",
  category: "Ranked",
  legacy_category: null,
  page_reference: null,
  page_url: "/quiz/ranked",
  title: "Incorrect answer — Ranked",
  body: "Thornmail gives more armor than Warmog's.",
  status: "open",
  priority: "normal",
  severity: null,
  reproducibility: null,
  expected_result: null,
  actual_result: null,
  evidence_url: null,
  screenshot_path: null,
  client_meta: { ua: "TestAgent/1.0", viewport: "1440x900", app_version: "build-123" },
  report_context: {
    kind: "question_report",
    v: 1,
    reason: "incorrect_answer",
    mode: "Ranked",
    route: "/quiz/ranked",
    captured_at: "2026-09-13T10:00:00.000Z",
    prompt: "Which item gives the most armor?",
    choices: ["Thornmail", "Warmog's", "Bloodthirster"],
    canonical_answer: "Warmog's",
    selected_answer: "Thornmail",
    runtime_question_id: "q-77",
    question_type: "items",
    module_type: "quiz.v1",
    difficulty: "hard",
    match_id: "match-1",
    round_number: 3,
  },
  admin_notes: "",
  is_archived: false,
  upvotes: 0,
  created_at: "2026-09-13T10:00:00.000Z",
};

const MASTERY_ROW = {
  ...QUESTION_ROW,
  id: "fb-2",
  category: "Mastery",
  title: "Typo — Mastery",
  body: "Spelling in the prompt.",
  page_url: "/quiz/mastery/set-9",
  report_context: {
    kind: "question_report", v: 1, reason: "typo", mode: "Mastery",
    route: "/quiz/mastery/set-9", captured_at: "2026-09-13T10:05:00.000Z",
    prompt: "How much post-mitigaton damage?",
    session_id: "sess-abc", round_number: 2, question_type: "post_mitigation_damage",
  },
};

const PAGE_ROW = {
  ...QUESTION_ROW,
  id: "fb-3",
  entry_intent: "page_report",
  category: "General",
  title: "Page issue — /lol/pro-play/live",
  body: "The match list renders empty.",
  page_url: "/lol/pro-play/live",
  report_context: {
    kind: "page_report", v: 1, route: "/lol/pro-play/live",
    captured_at: "2026-09-13T10:10:00.000Z", query: { tab: "stats" },
  },
};

const LEGACY_ROW = {
  ...QUESTION_ROW,
  id: "fb-4",
  entry_intent: "bug",
  category: "Combat Lab",
  title: "Simulator crashed",
  body: "It stopped mid-run.",
  severity: "blocking",
  reproducibility: "always",
  page_url: "/combat-lab",
  report_context: {},
};

const ROWS = [QUESTION_ROW, MASTERY_ROW, PAGE_ROW, LEGACY_ROW];

const supa = vi.hoisted(() => ({ rows: [] as unknown[], error: null as { message: string } | null, profiles: [] as unknown[] }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({ single: async () => ({ data: { value: null } }) }),
        in: async () => ({
          data: supa.profiles,
        }),
      }),
      update: () => ({ eq: async () => ({ error: null }) }),
      delete: () => ({ eq: async () => ({ error: null }) }),
      upsert: async () => ({ error: null }),
      _table: table,
    }),
    rpc: async () => ({ data: supa.rows, error: supa.error }),
    channel: () => ({ on() { return this; }, subscribe() { return this; } }),
    removeChannel: () => {},
  },
}));

vi.mock("@/components/UserAvatar", () => ({
  default: ({ name }: { name: string }) => <span data-testid="avatar">{name}</span>,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import AdminFeedback from "./AdminFeedback";

beforeEach(() => { supa.rows = ROWS; supa.error = null; supa.profiles = [{ id: "p-1", display_name: "Summoner One", avatar_url: null }]; });
afterEach(cleanup);

async function renderInbox() {
  render(<AdminFeedback />);
  await waitFor(() => expect(screen.getByText("Incorrect answer — Ranked")).toBeInTheDocument());
}

describe("origin is obvious without expanding anything", () => {
  it("labels a Ranked question report with its reason and mode", async () => {
    await renderInbox();
    expect(screen.getByText("Question Report · Incorrect answer · Ranked")).toBeInTheDocument();
  });

  it("labels a Mastery question report the same way", async () => {
    await renderInbox();
    expect(screen.getByText("Question Report · Typo · Mastery")).toBeInTheDocument();
  });

  it("labels a page issue with its route", async () => {
    await renderInbox();
    expect(screen.getByText("Page Issue · /lol/pro-play/live")).toBeInTheDocument();
  });

  it("leaves a Feedback Center submission reading as its own door", async () => {
    await renderInbox();
    expect(screen.getByText("Report a Bug")).toBeInTheDocument();
  });

  it("tags each row with its origin kind for the eye and for tests", async () => {
    await renderInbox();
    expect(screen.getAllByTestId("feedback-origin-question")).toHaveLength(2);
    expect(screen.getByTestId("feedback-origin-page")).toBeInTheDocument();
    expect(screen.getByTestId("feedback-origin-center")).toBeInTheDocument();
  });
});

describe("an expanded question report shows the captured snapshot", () => {
  const expand = async (title: string) => {
    await renderInbox();
    fireEvent.click(screen.getByText(title));
  };

  it("shows prompt, choices, canonical answer and the player's selection", async () => {
    await expand("Incorrect answer — Ranked");
    expect(screen.getByTestId("feedback-field-prompt"))
      .toHaveTextContent("Which item gives the most armor?");
    // Choices arrive newline-joined and render as one pre-wrapped block.
    expect(screen.getByTestId("feedback-field-choices")).toHaveTextContent("Thornmail");
    expect(screen.getByTestId("feedback-field-choices")).toHaveTextContent("Bloodthirster");
    expect(screen.getByTestId("feedback-field-canonical_answer")).toHaveTextContent("Warmog's");
    expect(screen.getByTestId("feedback-field-selected_answer")).toHaveTextContent("Thornmail");
  });

  it("shows the identity an owner needs to find the question again", async () => {
    await expand("Incorrect answer — Ranked");
    expect(screen.getByTestId("feedback-field-runtime_question_id")).toHaveTextContent("q-77");
    expect(screen.getByTestId("feedback-field-match_id")).toHaveTextContent("match-1");
    expect(screen.getByTestId("feedback-field-round_number")).toHaveTextContent("3");
    expect(screen.getByTestId("feedback-field-module_type")).toHaveTextContent("quiz.v1");
    expect(screen.getByTestId("feedback-field-difficulty")).toHaveTextContent("hard");
  });

  it("shows the reason and the player's own comment, kept apart", async () => {
    await expand("Incorrect answer — Ranked");
    expect(screen.getByText("Player's comment")).toBeInTheDocument();
    // Three on purpose: truncated in the collapsed row, in full under "What
    // did they report?" in the at-a-glance summary, and under its own
    // "Player's comment" label next to the captured facts.
    expect(screen.getAllByText("Thornmail gives more armor than Warmog's."))
      .toHaveLength(3);
    expect(within(screen.getByTestId("feedback-plain-summary"))
      .getByText("Thornmail gives more armor than Warmog's.")).toBeInTheDocument();
    // The reason lives in the origin line, not buried in the body.
    expect(screen.getByText("Question Report · Incorrect answer · Ranked")).toBeInTheDocument();
  });

  it("shows browser and build diagnostics", async () => {
    await expand("Incorrect answer — Ranked");
    expect(screen.getByTestId("feedback-field-app_version")).toHaveTextContent("build-123");
    expect(screen.getByTestId("feedback-field-viewport")).toHaveTextContent("1440x900");
    expect(screen.getByTestId("feedback-field-ua")).toHaveTextContent("TestAgent/1.0");
    expect(screen.getByTestId("feedback-field-created")).toBeInTheDocument();
  });

  it("omits a field the mode could not capture, rather than showing a blank", async () => {
    await expand("Typo — Mastery");
    expect(screen.queryByTestId("feedback-field-question_key")).toBeNull();
    expect(screen.queryByTestId("feedback-field-choices")).toBeNull();
    expect(screen.getByTestId("feedback-field-session_id")).toHaveTextContent("sess-abc");
  });
});

describe("an expanded page report shows the page", () => {
  it("shows route, description, query and time", async () => {
    await renderInbox();
    fireEvent.click(screen.getByText("Page issue — /lol/pro-play/live"));
    expect(screen.getByTestId("feedback-field-route")).toHaveTextContent("/lol/pro-play/live");
    expect(screen.getByTestId("feedback-field-query.tab")).toHaveTextContent("stats");
    expect(screen.getAllByText("The match list renders empty.").length)
      .toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Description")).toBeInTheDocument();
    expect(screen.getByTestId("feedback-field-created")).toBeInTheDocument();
  });
});

describe("existing admin capabilities survive", () => {
  it("keeps status, priority, admin notes, archive and delete on an expanded row", async () => {
    await renderInbox();
    fireEvent.click(screen.getByText("Incorrect answer — Ranked"));
    expect(screen.getByText("Status")).toBeInTheDocument();
    expect(screen.getByText("Priority")).toBeInTheDocument();
    expect(screen.getByText("Admin Notes")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Internal notes...")).toBeInTheDocument();
    expect(screen.getByText("Archive")).toBeInTheDocument();
    expect(screen.getByText("Delete")).toBeInTheDocument();
  });

  it("still shows a Feedback Center report's severity and reproducibility", async () => {
    await renderInbox();
    fireEvent.click(screen.getByText("Simulator crashed"));
    expect(screen.getByTestId("feedback-field-severity"))
      .toHaveTextContent("Blocking — I could not continue");
    expect(screen.getByTestId("feedback-field-reproducibility")).toHaveTextContent("always");
  });

  it("filters by origin", async () => {
    await renderInbox();
    // Four rows to start; the page report and the legacy bug must drop out
    // when the owner asks for question reports only.
    expect(screen.getAllByTestId(/^feedback-origin-/)).toHaveLength(4);
  });

  it("searches inside the captured snapshot, not just the title", async () => {
    await renderInbox();
    const search = screen.getByPlaceholderText("Search...");
    // "Bloodthirster" appears ONLY in a captured choice list. A search that
    // could not reach it would make the whole capture unreachable except by
    // scrolling.
    fireEvent.change(search, { target: { value: "bloodthirster" } });
    await waitFor(() => {
      expect(screen.getByText("Incorrect answer — Ranked")).toBeInTheDocument();
      expect(screen.queryByText("Page issue — /lol/pro-play/live")).toBeNull();
    });
  });

  it("searches the route of a page report", async () => {
    await renderInbox();
    fireEvent.change(screen.getByPlaceholderText("Search..."), {
      target: { value: "pro-play/live" },
    });
    await waitFor(() => {
      expect(screen.getByText("Page issue — /lol/pro-play/live")).toBeInTheDocument();
      expect(screen.queryByText("Typo — Mastery")).toBeNull();
    });
  });
});

describe("the retired vocabulary is gone", () => {
  it("offers no Swipe / Shop / Aura Check category anywhere", async () => {
    await renderInbox();
    const root = screen.getByPlaceholderText("Search...").closest("div")!.parentElement!;
    for (const dead of ["Swipe", "Aura Check", "Multiplayer", "Bug Report", "UI/UX"]) {
      expect(within(root).queryByText(dead)).toBeNull();
    }
  });
});

describe("PR 87 truthful owner summary", () => {
  it("shows actual captured question context with technical evidence collapsed", async () => {
    await renderInbox();
    fireEvent.click(screen.getByText("Incorrect answer — Ranked"));
    const summary = screen.getByTestId("feedback-plain-summary");
    expect(summary).toHaveTextContent("Which item gives the most armor?");
    expect(summary).toHaveTextContent("Captured mode: Ranked · Round 3");
    expect(summary).toHaveTextContent("Player selected: Thornmail");
    expect(summary).toHaveTextContent("Recorded correct answer: Warmog's (not independently checked)");
    expect(screen.getByText("Technical details (for investigating)").closest("details")).not.toHaveAttribute("open");
  });
  it("missing reporter profile cannot imply guest status, deletion or signup", async () => {
    supa.profiles = [];
    await renderInbox();
    fireEvent.click(screen.getByText("Incorrect answer — Ranked"));
    expect(screen.getByTestId("feedback-plain-summary")).toHaveTextContent("Reporter profile unavailable");
  });
  it("denied report read does not look like an empty inbox", async () => {
    supa.error = { message: "denied" };
    render(<AdminFeedback />);
    expect(await screen.findByRole("alert")).toHaveTextContent("This is not evidence of an empty inbox");
    expect(screen.queryByText("No feedback found")).toBeNull();
  });
});
