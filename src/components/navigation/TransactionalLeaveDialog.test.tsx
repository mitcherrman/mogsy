import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import { TransactionalLeaveDialog } from "./TransactionalLeaveDialog";

describe("TransactionalLeaveDialog", () => {
  it("focuses the safe action, contains focus, and maps Escape to Stay", async () => {
    const onStay = vi.fn();
    render(
      <>
        <button>Underlying Forfeit</button>
        <TransactionalLeaveDialog
          open
          title="Leave fixture?"
          body="Neutral body"
          stayLabel="Stay safely"
          leaveLabel="Leave fixture"
          onStay={onStay}
          onLeave={vi.fn()}
        />
      </>,
    );

    const dialog = screen.getByRole("alertdialog");
    const stay = screen.getByRole("button", { name: "Stay safely" });
    await waitFor(() => expect(stay).toHaveFocus());
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    expect(screen.getByRole("button", { name: "Underlying Forfeit", hidden: true })).not.toHaveFocus();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onStay).toHaveBeenCalledTimes(1);
  });

  it("prevents double submit before the owner can render proceeding state", () => {
    const onLeave = vi.fn();
    render(
      <TransactionalLeaveDialog
        open
        title="Leave fixture?"
        body="Neutral body"
        stayLabel="Stay"
        leaveLabel="Leave"
        onStay={vi.fn()}
        onLeave={onLeave}
      />,
    );

    const leave = screen.getByRole("button", { name: "Leave" });
    fireEvent.click(leave);
    fireEvent.click(leave);
    expect(onLeave).toHaveBeenCalledTimes(1);
  });

  it("disables both actions while proceeding", () => {
    render(
      <TransactionalLeaveDialog
        open
        busy
        title="Leave fixture?"
        body="Neutral body"
        stayLabel="Stay"
        leaveLabel="Leave"
        onStay={vi.fn()}
        onLeave={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Stay" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Leave" })).toBeDisabled();
  });
});
