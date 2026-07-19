import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { MasteryReviewerFixtureHarness } from "./MasteryReviewerFixtureHarness";
import {
  ARTIFACT_DIGEST,
  SET_ID,
  SNAP1,
  SNAP2,
  TXN2,
} from "../fixtures";

afterEach(cleanup);

function renderInspector() {
  return render(<MasteryReviewerFixtureHarness />);
}
function selectQuestion(i: number) {
  fireEvent.click(screen.getByTestId(`reviewer-question-item-${i}`));
}
function openTab(name: string) {
  fireEvent.click(screen.getByRole("tab", { name }));
}

describe("artifact header", () => {
  it("renders immutable IDs and counts", () => {
    renderInspector();
    expect(screen.getByText(ARTIFACT_DIGEST)).toBeInTheDocument();
    expect(screen.getByText(SET_ID)).toBeInTheDocument();
    expect(screen.getByTestId("count-questions")).toHaveTextContent("6");
    expect(screen.getByTestId("count-transitions")).toHaveTextContent("2");
    expect(screen.getByTestId("count-authored")).toHaveTextContent("1");
    expect(screen.getByTestId("count-step-bound")).toHaveTextContent("1");
  });

  it("shows the curated / non-meta warning", () => {
    renderInspector();
    expect(screen.getByTestId("curated-warning")).toHaveTextContent(/curated teaching scenario/i);
    expect(screen.getByTestId("curated-warning")).toHaveTextContent(/is_proven_meta = false/i);
  });
});

describe("patch presentation", () => {
  it("shows the mixed-snapshot warning, labels the digest canonical and the descriptor provenance", () => {
    renderInspector();
    openTab("Summary & patch");
    expect(screen.getByTestId("mixed-snapshot-warning")).toBeInTheDocument();
    expect(screen.getByTestId("patch-digest-line")).toHaveTextContent(/canonical patch authority/i);
    expect(screen.getByTestId("patch-label-line")).toHaveTextContent(/display text/i);
    expect(screen.getByTestId("summary-patch-descriptor-trigger")).toBeInTheDocument();
  });
});

describe("question list and selection", () => {
  it("renders six questions in order", () => {
    renderInspector();
    const list = within(screen.getByTestId("reviewer-question-list"));
    expect(list.getAllByRole("listitem")).toHaveLength(6);
  });

  it("selecting a question updates the detail and moves focus to its heading", () => {
    renderInspector();
    selectQuestion(3);
    const heading = screen.getByTestId("reviewer-detail-heading");
    expect(heading).toHaveTextContent(/^Q4:/);
    expect(heading).toHaveFocus();
    expect(screen.getByTestId(`reviewer-question-item-3`)).toHaveAttribute("aria-current", "true");
  });

  it("supports keyboard selection (button activation)", () => {
    renderInspector();
    const item = screen.getByTestId("reviewer-question-item-4");
    item.focus();
    fireEvent.click(item); // buttons activate via Enter/Space → click
    expect(screen.getByTestId("reviewer-detail-heading")).toHaveTextContent(/^Q5:/);
  });
});

describe("per-step canonical sequence", () => {
  it("Q1 is read-only and its authored inter-step T1 is shown separately", () => {
    renderInspector();
    selectQuestion(0);
    expect(screen.getByTestId("detail-readonly-badge")).toHaveTextContent(/read-only/i);
    // Step-level state unchanged; authored inter-step transition noted separately.
    expect(screen.getByTestId("snapshot-unchanged")).toBeInTheDocument();
    expect(screen.getByTestId("snapshot-authored-note")).toHaveTextContent(/authored inter-step/i);
  });

  it("Q2 shows S1 and the +20 ability haste input", () => {
    renderInspector();
    selectQuestion(1);
    const snap = within(screen.getByTestId("snapshot-comparison"));
    expect(snap.getAllByText(SNAP1).length).toBeGreaterThan(0);
    const inputs = within(screen.getByTestId("detail-canonical-inputs"));
    expect(inputs.getByText("ability_haste")).toBeInTheDocument();
    expect(inputs.getByText("20")).toBeInTheDocument();
  });

  it("Q5 is transition-bound to T2 and advances S1 -> S2", () => {
    renderInspector();
    selectQuestion(4);
    expect(screen.getByTestId("detail-readonly-badge")).toHaveTextContent(/transition-bound/i);
    const snap = within(screen.getByTestId("snapshot-comparison"));
    expect(snap.getByText(SNAP1)).toBeInTheDocument();
    expect(snap.getByText(SNAP2)).toBeInTheDocument();
    expect(snap.getByText("-250")).toBeInTheDocument();
    // Transition ID T2 bound to the step.
    expect(within(screen.getByLabelText("Identifiers")).getByText(TXN2)).toBeInTheDocument();
  });

  it("Q6 is read-only and proposes an unapplied transition", () => {
    renderInspector();
    selectQuestion(5);
    expect(screen.getByTestId("detail-readonly-badge")).toHaveTextContent(/read-only/i);
    expect(screen.getByTestId("detail-proposes-badge")).toBeInTheDocument();
    expect(screen.getByTestId("snapshot-unchanged")).toBeInTheDocument();
  });
});

describe("calculation inspection", () => {
  it("renders fixture calc values and shows expressions without evaluating them", () => {
    renderInspector();
    selectQuestion(0);
    const table = within(screen.getByTestId("calc-steps-table"));
    // Expression text present verbatim; results are the fixture-provided numbers.
    expect(table.getByText("abs(12.0 - 15.0)")).toBeInTheDocument();
    expect(table.getAllByText("3").length).toBeGreaterThan(0);
  });

  it("shows recomputation pass in text (not colour only)", () => {
    renderInspector();
    selectQuestion(0);
    const status = screen.getByTestId("recomputation-status");
    expect(status).toHaveAttribute("data-matches", "true");
    expect(status).toHaveTextContent(/verified/i);
    expect(status.querySelector("svg")).not.toBeNull();
  });

  it("exposes eligibility evidence, not just a badge", () => {
    renderInspector();
    selectQuestion(0);
    const elig = within(screen.getByTestId("eligibility-inspector"));
    expect(elig.getByText("operation_type")).toBeInTheDocument();
    expect(elig.getByText("adapter_id")).toBeInTheDocument();
  });
});

describe("mechanics", () => {
  it("renders supported and suppressed mechanics with verbatim reason codes and no fabricated calc", () => {
    renderInspector();
    openTab("Mechanics");
    expect(within(screen.getByTestId("supported-table")).getAllByRole("row").length).toBeGreaterThan(1);
    const suppressed = within(screen.getByTestId("suppressed-table"));
    // Verbatim canonical reason codes (some repeat across mechanics).
    expect(suppressed.getAllByText("mixed_damage_unsupported").length).toBe(2);
    expect(suppressed.getByText("source_conflict")).toBeInTheDocument();
    expect(suppressed.getByText("unversioned_source")).toBeInTheDocument();
    expect(suppressed.getByText("missing_data")).toBeInTheDocument();
    // No suppressed row shows a present calculation result.
    expect(suppressed.getAllByText(/audit only/i).length).toBe(11);
    expect(suppressed.queryByText(/^present$/)).toBeNull();
  });
});

describe("ranked capsules", () => {
  it("marks Q1/Q2/Q4/Q5 eligible and Q3/Q6 chain-only with reasons and shows capsule IDs", () => {
    renderInspector();
    openTab("Capsules");
    const table = within(screen.getByTestId("capsule-table"));
    for (const i of [0, 1, 3, 4]) {
      expect(within(screen.getByTestId(`capsule-row-${i}`)).getByText("eligible")).toBeInTheDocument();
    }
    for (const i of [2, 5]) {
      expect(within(screen.getByTestId(`capsule-row-${i}`)).getByText("chain-only")).toBeInTheDocument();
    }
    expect(table.getByText("prompt_references_chain_context")).toBeInTheDocument();
    expect(table.getByText("depends_on_prior_step")).toBeInTheDocument();
    expect(table.getAllByText(/^rankcapsule_/).length).toBe(4);
  });
});

describe("transition invariants", () => {
  it("summarizes 2 total, 1 authored, 1 bound, 0 double, 0 unclassified", () => {
    renderInspector();
    openTab("Transitions");
    expect(screen.getByTestId("inv-total")).toHaveTextContent("2");
    expect(screen.getByTestId("inv-authored")).toHaveTextContent("1");
    expect(screen.getByTestId("inv-bound")).toHaveTextContent("1");
    expect(screen.getByTestId("inv-double")).toHaveTextContent("0");
    expect(screen.getByTestId("inv-unclassified")).toHaveTextContent("0");
  });
});

describe("review record (read-only) and provenance", () => {
  it("renders the review record read-only with disabled actions, notes, revision history, source hash", () => {
    renderInspector();
    openTab("Review");
    expect(screen.getByTestId("review-readonly-label")).toHaveTextContent(/read-only fixture prototype/i);
    expect(screen.getByTestId("review-reviewer-status")).toHaveTextContent(/unreviewed/i);
    expect(screen.getByTestId("review-publication-status")).toHaveTextContent(/draft/i);
    expect(screen.getByTestId("review-action-approve")).toBeDisabled();
    expect(screen.getByTestId("review-action-publish")).toBeDisabled();
    expect(screen.getByTestId("review-notes")).toBeInTheDocument();
    expect(screen.getByTestId("revision-history-trigger")).toBeInTheDocument();
    expect(screen.getByText("reviewhash_fixture_0001")).toBeInTheDocument();
  });

  it("renders source records and the replay-provenance note", () => {
    renderInspector();
    openTab("Review");
    expect(screen.getByTestId("source-union-trigger")).toBeInTheDocument();
    expect(screen.getByTestId("replay-provenance-note")).toHaveTextContent(/replay provenance identifies reconstructed state/i);
  });
});

describe("identity and raw JSON", () => {
  it("shows step, transition and capsule IDs and never generates them", () => {
    renderInspector();
    openTab("Identity");
    const id = within(screen.getByTestId("identity-inspector"));
    expect(id.getByText(ARTIFACT_DIGEST)).toBeInTheDocument();
    expect(id.getAllByText(/^mqstep_/).length).toBe(6);
    expect(id.getAllByText(/^rankcapsule_/).length).toBe(4);
  });

  it("keeps the raw JSON collapsed by default and expands accessibly", () => {
    renderInspector();
    openTab("Raw JSON");
    const trigger = screen.getByTestId("artifact-raw-json-trigger");
    expect(trigger).toHaveAttribute("data-state", "closed");
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("data-state", "open");
    expect(screen.getByTestId("mastery-json-content")).toBeInTheDocument();
  });
});
