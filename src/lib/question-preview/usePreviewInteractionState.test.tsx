import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { usePreviewInteractionState } from "./usePreviewInteractionState";
import type { AnswerOptionView } from "@/lib/question-surface/contract";

const option = (index: number): AnswerOptionView => ({
  id: String(index),
  index,
  label: `option ${index}`,
});

const setup = (correctAnswerIndex: number | null = 2, resetKey = "c1") =>
  renderHook(
    ({ key }: { key: string }) =>
      usePreviewInteractionState({
        correctAnswerIndex,
        resetKey: key,
        optionCount: 4,
      }),
    { initialProps: { key: resetKey } },
  );

describe("usePreviewInteractionState", () => {
  it("starts unselected with answers enabled and no reveal", () => {
    const { result } = setup();
    expect(result.current.state).toBe("unselected");
    expect(result.current.selectedOptionId).toBeNull();
    expect(result.current.permissions.canSelectAnswer).toBe(true);
    expect(result.current.reveal).toBeNull();
  });

  it("selecting an answer moves to selected and keeps answers changeable", () => {
    const { result } = setup();
    act(() => result.current.onSelectOption(option(1)));
    expect(result.current.state).toBe("selected");
    expect(result.current.selectedOptionId).toBe("1");
    expect(result.current.permissions.canChangeAnswer).toBe(true);
    expect(result.current.reveal).toBeNull();
  });

  it("locked keeps the selection but disables every answer interaction", () => {
    const { result } = setup();
    act(() => result.current.onSelectOption(option(1)));
    act(() => result.current.setState("locked"));
    expect(result.current.selectedOptionId).toBe("1");
    expect(result.current.permissions.canSelectAnswer).toBe(false);
    expect(result.current.permissions.canChangeAnswer).toBe(false);
    expect(result.current.reveal).toBeNull();
  });

  it("reveal exposes the admin-supplied correct option, still locked", () => {
    const { result } = setup(2);
    act(() => result.current.onSelectOption(option(1)));
    act(() => result.current.setState("reveal"));
    expect(result.current.permissions.canSelectAnswer).toBe(false);
    expect(result.current.reveal).toEqual({
      revealed: true,
      correctOptionId: "2",
      isCorrect: false,
      explanation: null,
    });
  });

  it("reports a correct pick as correct", () => {
    const { result } = setup(2);
    act(() => result.current.onSelectOption(option(2)));
    act(() => result.current.setState("reveal"));
    expect(result.current.reveal?.isCorrect).toBe(true);
  });

  it("never reveals when the candidate has no unambiguous correct option", () => {
    const { result } = setup(null);
    act(() => result.current.onSelectOption(option(0)));
    act(() => result.current.setState("reveal"));
    expect(result.current.state).toBe("reveal");
    expect(result.current.reveal).toBeNull();
  });

  it("entering a selection state with nothing chosen picks the first option", () => {
    const { result } = setup();
    act(() => result.current.setState("locked"));
    expect(result.current.selectedOptionId).toBe("0");
  });

  it("returning to unselected clears the selection", () => {
    const { result } = setup();
    act(() => result.current.onSelectOption(option(3)));
    act(() => result.current.setState("unselected"));
    expect(result.current.selectedOptionId).toBeNull();
    expect(result.current.permissions.canSelectAnswer).toBe(true);
  });

  it("resets when the previewed candidate changes", () => {
    const { result, rerender } = setup(2, "c1");
    act(() => result.current.onSelectOption(option(3)));
    act(() => result.current.setState("reveal"));

    rerender({ key: "c2" });

    expect(result.current.state).toBe("unselected");
    expect(result.current.selectedOptionId).toBeNull();
    expect(result.current.reveal).toBeNull();
  });

  it("changing the answer while selected does not advance the state", () => {
    const { result } = setup();
    act(() => result.current.onSelectOption(option(0)));
    act(() => result.current.onSelectOption(option(3)));
    expect(result.current.state).toBe("selected");
    expect(result.current.selectedOptionId).toBe("3");
  });
});
