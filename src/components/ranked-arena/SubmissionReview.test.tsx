import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import {
  InteractionPermissions,
  NO_INTERACTIONS,
  SubmissionView,
} from "@/lib/ranked-core/viewTypes";
import { permissionsForSubmissionPhase } from "@/lib/ranked-core/permissions";
import { SubmissionReview } from "./SubmissionReview";

const submission = (overrides: Partial<SubmissionView> = {}): SubmissionView => ({
  selectedOptionId: "1",
  selectedAbilityId: "tank.fortify",
  phase: "selecting",
  ...overrides,
});

const renderReview = (
  sub: SubmissionView,
  permissions: InteractionPermissions,
  extra: Partial<Parameters<typeof SubmissionReview>[0]> = {},
) => {
  const onReview = vi.fn();
  const onEdit = vi.fn();
  const onConfirm = vi.fn();
  render(
    <SubmissionReview
      submission={sub}
      answerLabel="Brace"
      abilityName="Fortify"
      permissions={permissions}
      onReview={onReview}
      onEdit={onEdit}
      onConfirm={onConfirm}
      {...extra}
    />,
  );
  return { onReview, onEdit, onConfirm };
};

describe("SubmissionReview", () => {
  it("selecting phase offers review and emits the review intent", () => {
    const perms = permissionsForSubmissionPhase("selecting", true);
    const { onReview } = renderReview(submission(), perms);
    expect(screen.getByTestId("submission-review")).toHaveAttribute("data-phase", "selecting");
    fireEvent.click(screen.getByTestId("review-button"));
    expect(onReview).toHaveBeenCalledTimes(1);
  });

  it("review is disabled without an answer, with a reason", () => {
    const perms = permissionsForSubmissionPhase("selecting", true);
    const onReview = vi.fn();
    render(
      <SubmissionReview
        submission={submission({ selectedOptionId: null })}
        answerLabel={null}
        abilityName={null}
        permissions={perms}
        onReview={onReview}
        onEdit={() => {}}
        onConfirm={() => {}}
      />,
    );
    expect(screen.getByTestId("review-button")).toBeDisabled();
    expect(screen.getByText(/choose an answer first/i)).toBeInTheDocument();
  });

  it("reviewing shows answer and ability together with the atomic-lock note", () => {
    const perms = permissionsForSubmissionPhase("reviewing", true);
    renderReview(submission({ phase: "reviewing" }), perms);
    expect(screen.getByTestId("review-answer")).toHaveTextContent("Brace");
    expect(screen.getByTestId("review-ability")).toHaveTextContent("Fortify");
    expect(screen.getByText(/lock together/i)).toBeInTheDocument();
  });

  it("reviewing a no-ability submission reads 'No ability'", () => {
    const perms = permissionsForSubmissionPhase("reviewing", true);
    render(
      <SubmissionReview
        submission={submission({ phase: "reviewing", selectedAbilityId: null })}
        answerLabel="Brace"
        abilityName={null}
        permissions={perms}
        onReview={() => {}}
        onEdit={() => {}}
        onConfirm={() => {}}
      />,
    );
    expect(screen.getByTestId("review-ability")).toHaveTextContent("No ability");
  });

  it("edit and confirm emit distinct intents gated by permissions", () => {
    const perms = permissionsForSubmissionPhase("reviewing", true);
    const { onEdit, onConfirm } = renderReview(submission({ phase: "reviewing" }), perms);
    fireEvent.click(screen.getByTestId("edit-button"));
    expect(onEdit).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId("confirm-button"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("denied permissions disable edit and confirm", () => {
    const { onEdit, onConfirm } = renderReview(
      submission({ phase: "reviewing" }),
      NO_INTERACTIONS,
    );
    expect(screen.getByTestId("edit-button")).toBeDisabled();
    expect(screen.getByTestId("confirm-button")).toBeDisabled();
    fireEvent.click(screen.getByTestId("confirm-button"));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onEdit).not.toHaveBeenCalled();
  });

  it("locked phase shows a status banner and no confirm control at all", () => {
    const perms = permissionsForSubmissionPhase("locked", true);
    const { onConfirm } = renderReview(submission({ phase: "locked" }), perms);
    expect(screen.getByTestId("locked-banner")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/submission locked/i);
    expect(screen.getByTestId("locked-answer")).toHaveTextContent("Brace");
    // Duplicate confirmation is impossible: the control does not exist.
    expect(screen.queryByTestId("confirm-button")).toBeNull();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("carries no correctness content in any phase", () => {
    const perms = permissionsForSubmissionPhase("locked", true);
    const { container } = render(
      <SubmissionReview
        submission={submission({ phase: "locked" })}
        answerLabel="Brace"
        abilityName="Fortify"
        permissions={perms}
        onReview={() => {}}
        onEdit={() => {}}
        onConfirm={() => {}}
      />,
    );
    expect(container.innerHTML).not.toMatch(/correct|incorrect|damage/i);
  });

  it("renders supplied failure copy as an alert", () => {
    const perms = permissionsForSubmissionPhase("selecting", true);
    renderReview(submission(), perms, {
      statusMessage: { tone: "error", text: "Submission rejected — try again." },
    });
    expect(screen.getByRole("alert")).toHaveTextContent("Submission rejected — try again.");
  });
});
