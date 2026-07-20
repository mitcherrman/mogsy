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

  describe("direct flow (streamlined one-shot lock)", () => {
    it("offers a single Lock-in CTA from the selecting phase and locks atomically", () => {
      const perms = permissionsForSubmissionPhase("selecting", true);
      const { onConfirm, onReview } = renderReview(submission(), perms, { flow: "direct" });
      // No separate review step in direct flow.
      expect(screen.queryByTestId("review-button")).toBeNull();
      const lock = screen.getByTestId("lock-in-button");
      expect(lock).toHaveTextContent(/lock in answer \+ ability/i);
      expect(screen.getByTestId("summary-answer")).toHaveTextContent("Brace");
      expect(screen.getByTestId("summary-ability")).toHaveTextContent("Fortify");
      fireEvent.click(lock);
      expect(onConfirm).toHaveBeenCalledTimes(1);
      expect(onReview).not.toHaveBeenCalled();
    });

    it("labels the CTA for a no-ability submission", () => {
      const perms = permissionsForSubmissionPhase("selecting", true);
      render(
        <SubmissionReview
          flow="direct"
          submission={submission({ selectedAbilityId: null })}
          answerLabel="Brace"
          abilityName={null}
          permissions={perms}
          onReview={() => {}}
          onEdit={() => {}}
          onConfirm={() => {}}
        />,
      );
      expect(screen.getByTestId("lock-in-button")).toHaveTextContent(/lock in answer$/i);
      expect(screen.getByTestId("summary-ability")).toHaveTextContent("No ability");
    });

    it("disables the lock until an answer is chosen, with a reason", () => {
      const perms = permissionsForSubmissionPhase("selecting", true);
      const onConfirm = vi.fn();
      render(
        <SubmissionReview
          flow="direct"
          submission={submission({ selectedOptionId: null })}
          answerLabel={null}
          abilityName={null}
          permissions={perms}
          onReview={() => {}}
          onEdit={() => {}}
          onConfirm={onConfirm}
        />,
      );
      expect(screen.getByTestId("lock-in-button")).toBeDisabled();
      expect(screen.getByText(/choose an answer first/i)).toBeInTheDocument();
      fireEvent.click(screen.getByTestId("lock-in-button"));
      expect(onConfirm).not.toHaveBeenCalled();
    });

    it("shows the sealed locked banner (no lock CTA) once submitted", () => {
      const perms = permissionsForSubmissionPhase("locked", true);
      renderReview(submission({ phase: "locked" }), perms, { flow: "direct" });
      expect(screen.getByTestId("locked-banner")).toHaveTextContent(/sealed/i);
      expect(screen.getByTestId("locked-answer")).toHaveTextContent("Brace");
      expect(screen.queryByTestId("lock-in-button")).toBeNull();
    });
  });
});
