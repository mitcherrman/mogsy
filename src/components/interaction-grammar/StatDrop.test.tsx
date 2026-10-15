import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { initialEstimate, snapToScale, StatDrop } from "./StatDrop";
import type { InteractionPhase, StatDropResponse } from "@/lib/interaction-grammar/types";
import { labFixture, type LabDomain } from "@/pages/dev/interaction-lab/labFixtures";

const DOMAINS: LabDomain[] = ["pro-play", "leaguecraft"];

function Harness({ domain, phase = "open", revealed = false, onLock = () => {}, onChange }: {
  domain: LabDomain; phase?: InteractionPhase; revealed?: boolean;
  onLock?: (r: StatDropResponse) => void; onChange?: (v: number) => void;
}) {
  const f = labFixture("stat-drop", domain);
  const [value, setValue] = useState<number | null>(null);
  return (
    <StatDrop content={f.content} phase={phase} value={value}
      onChange={(v) => { setValue(v); onChange?.(v); }} onLock={onLock}
      reveal={revealed ? f.hidden : null} />
  );
}

const estimate = () => Number(screen.getByTestId("drop-estimate").textContent!.replace(/[^\d.-]/g, ""));

describe.each(DOMAINS)("StatDrop · %s fixture", (domain) => {
  const f = labFixture("stat-drop", domain);
  const { scale } = f.content;

  it("renders the prompt and scale with NO canonical value in the DOM before reveal", () => {
    const { container } = render(<Harness domain={domain} />);
    expect(screen.getByTestId("drop-prompt")).toHaveTextContent(f.content.prompt);
    const html = container.innerHTML;
    expect(html).not.toContain(f.hidden.canonicalDisplay);
    expect(html).not.toContain(String(f.hidden.canonicalValue));
    if (f.hidden.evidence) expect(html).not.toContain(f.hidden.evidence);
    expect(screen.queryByTestId("drop-true-value")).toBeNull();
    expect(screen.queryByTestId("drop-true-marker")).toBeNull();
    // The untouched estimate is mid-scale — a property of the scale, not the answer.
    expect(estimate()).toBe(initialEstimate(scale));
  });

  it("the pointer/touch control changes the estimate (snapped to the step grid)", () => {
    const onChange = vi.fn();
    render(<Harness domain={domain} onChange={onChange} />);
    const target = scale.min + (scale.max - scale.min) * 0.3 + scale.step / 3;
    fireEvent.change(screen.getByTestId("drop-range"), { target: { value: String(target) } });
    expect(onChange).toHaveBeenLastCalledWith(snapToScale(target, scale));
    expect(estimate()).toBe(snapToScale(target, scale));
  });

  it("keyboard: arrows step, PageUp/PageDown step ten, Home/End hit the bounds", () => {
    render(<Harness domain={domain} />);
    const range = screen.getByTestId("drop-range");
    const start = initialEstimate(scale);
    fireEvent.keyDown(range, { key: "ArrowRight" });
    expect(estimate()).toBe(snapToScale(start + scale.step, scale));
    fireEvent.keyDown(range, { key: "ArrowDown" });
    fireEvent.keyDown(range, { key: "ArrowDown" });
    expect(estimate()).toBe(snapToScale(start - scale.step, scale));
    fireEvent.keyDown(range, { key: "PageUp" });
    expect(estimate()).toBe(snapToScale(start + 9 * scale.step, scale));
    fireEvent.keyDown(range, { key: "End" });
    expect(estimate()).toBe(scale.max);
    fireEvent.keyDown(range, { key: "Home" });
    expect(estimate()).toBe(scale.min);
  });

  it("nudge buttons adjust by one step", () => {
    render(<Harness domain={domain} />);
    const start = initialEstimate(scale);
    fireEvent.click(screen.getByTestId("drop-nudge-up"));
    fireEvent.click(screen.getByTestId("drop-nudge-up"));
    fireEvent.click(screen.getByTestId("drop-nudge-down"));
    expect(estimate()).toBe(snapToScale(start + scale.step, scale));
  });

  it("locks explicitly and emits { selected: number }", () => {
    const onLock = vi.fn();
    render(<Harness domain={domain} onLock={onLock} />);
    fireEvent.keyDown(screen.getByTestId("drop-range"), { key: "ArrowUp" });
    expect(onLock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("drop-lock"));
    const expected = snapToScale(initialEstimate(scale) + scale.step, scale);
    expect(onLock).toHaveBeenCalledWith({ selected: expected });
    expect(typeof onLock.mock.calls[0][0].selected).toBe("number");
  });

  it("Enter locks from the keyboard; locked inputs are inert", () => {
    const onLock = vi.fn();
    const { rerender } = render(<Harness domain={domain} onLock={onLock} />);
    fireEvent.keyDown(screen.getByTestId("drop-range"), { key: "Enter" });
    expect(onLock).toHaveBeenCalledTimes(1);
    rerender(<Harness domain={domain} phase="locked" onLock={onLock} />);
    expect(screen.getByTestId("drop-range")).toBeDisabled();
    expect(screen.getByTestId("drop-suspense")).toBeInTheDocument();
    expect(screen.queryByTestId("drop-lock")).toBeNull();
    fireEvent.keyDown(screen.getByTestId("drop-range"), { key: "Enter" });
    expect(onLock).toHaveBeenCalledTimes(1);
  });

  it("reveal introduces the canonical value and shows it with the estimate and the gap", () => {
    const { rerender } = render(<Harness domain={domain} />);
    fireEvent.keyDown(screen.getByTestId("drop-range"), { key: "Home" });
    rerender(<Harness domain={domain} phase="revealed" revealed />);
    expect(screen.getByTestId("drop-true-value")).toHaveTextContent(f.hidden.canonicalDisplay);
    expect(estimate()).toBe(scale.min);
    expect(screen.getByTestId("drop-true-marker")).toBeInTheDocument();
    expect(screen.getByTestId("drop-gap")).toBeInTheDocument();
    const delta = Math.abs(scale.min - f.hidden.canonicalValue);
    expect(Number(screen.getByTestId("drop-delta").textContent)).toBeCloseTo(delta, scale.decimals);
    expect(screen.getByTestId("mig-evidence")).toHaveTextContent(f.hidden.evidence!);
  });
});

describe("StatDrop is content-neutral and does not score", () => {
  it("names no domain and has no points formula", () => {
    const src = readFileSync(resolve(__dirname, "StatDrop.tsx"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    for (const word of ["Faker", "Peanut", "Olaf", "Sejuani", "champion", "pro-play", "leaguecraft"]) {
      expect(src, word).not.toMatch(new RegExp(`\\b${word}\\b`, "i"));
    }
    expect(src).not.toMatch(/points|score|isCorrect|tolerance/i);
    for (const forbidden of ["analytics", "fetch(", "/audio/"]) expect(src).not.toContain(forbidden);
  });
});
