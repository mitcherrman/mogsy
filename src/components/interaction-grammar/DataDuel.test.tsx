import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DataDuel } from "./DataDuel";
import type { DataDuelResponse, InteractionPhase } from "@/lib/interaction-grammar/types";
import { labFixture, type LabDomain } from "@/pages/dev/interaction-lab/labFixtures";

const DOMAINS: LabDomain[] = ["pro-play", "leaguecraft"];

/** A minimal controller: the primitive is controlled, like it is in the arena. */
function Harness({ domain, phase = "open", revealed = false, onLock = () => {} }: {
  domain: LabDomain; phase?: InteractionPhase; revealed?: boolean; onLock?: (r: DataDuelResponse) => void;
}) {
  const f = labFixture("data-duel", domain);
  const [value, setValue] = useState<string | null>(null);
  return (
    <DataDuel content={f.content} phase={phase} value={value} onChange={setValue} onLock={onLock}
      reveal={revealed ? f.hidden : null} />
  );
}

describe.each(DOMAINS)("DataDuel · %s fixture", (domain) => {
  const f = labFixture("data-duel", domain);

  it("renders the public content and NO canonical answer or value before reveal", () => {
    const { container } = render(<Harness domain={domain} />);
    expect(screen.getByTestId("duel-prompt")).toHaveTextContent(f.content.prompt);
    const html = container.innerHTML;
    for (const v of Object.values(f.hidden.values)) expect(html).not.toContain(v);
    if (f.hidden.evidence) expect(html).not.toContain(f.hidden.evidence);
    expect(container.querySelector("[data-canonical]")).toBeNull();
    expect(container.querySelector('[data-choice-state="correct"]')).toBeNull();
    expect(screen.queryByTestId("duel-tag-answer-left")).toBeNull();
    expect(screen.queryByTestId("duel-tag-answer-right")).toBeNull();
  });

  it("selects the left side, then the right side, and locks the pick as { selected }", () => {
    const onLock = vi.fn();
    render(<Harness domain={domain} onLock={onLock} />);
    const lock = screen.getByTestId("duel-lock");
    expect(lock).toBeDisabled();

    fireEvent.click(screen.getByTestId("duel-side-left"));
    expect(screen.getByTestId("duel-side-left")).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId("duel-side-left")).toHaveAttribute("data-choice-state", "selected");

    fireEvent.click(screen.getByTestId("duel-side-right"));
    expect(screen.getByTestId("duel-side-right")).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId("duel-side-left")).toHaveAttribute("aria-checked", "false");

    fireEvent.click(lock);
    expect(onLock).toHaveBeenCalledWith({ selected: f.content.right.token });
  });

  it("is keyboard operable: arrows move the pick, Enter locks it", () => {
    const onLock = vi.fn();
    render(<Harness domain={domain} onLock={onLock} />);
    const left = screen.getByTestId("duel-side-left");
    // Roving tab stop starts on the left side.
    expect(left).toHaveAttribute("tabindex", "0");
    expect(screen.getByTestId("duel-side-right")).toHaveAttribute("tabindex", "-1");
    left.focus();
    fireEvent.keyDown(left, { key: "ArrowRight" });
    const right = screen.getByTestId("duel-side-right");
    expect(right).toHaveAttribute("aria-checked", "true");
    expect(document.activeElement).toBe(right);
    fireEvent.keyDown(right, { key: "ArrowLeft" });
    expect(screen.getByTestId("duel-side-left")).toHaveAttribute("aria-checked", "true");
    fireEvent.keyDown(screen.getByTestId("duel-side-left"), { key: "Enter" });
    expect(onLock).toHaveBeenCalledWith({ selected: f.content.left.token });
  });

  it("exposes accessible names and a radiogroup", () => {
    render(<Harness domain={domain} />);
    const group = screen.getByRole("radiogroup");
    expect(group).toHaveAccessibleName(f.content.prompt);
    // Two sides, plus the tie option when the comparison's domain has one.
    expect(within(group).getAllByRole("radio")).toHaveLength(f.content.tie ? 3 : 2);
    expect(screen.getByRole("radio", { name: new RegExp(f.content.left.label) })).toBeInTheDocument();
  });

  it("locked: inputs are inert and the suspense beat shows", () => {
    const onLock = vi.fn();
    const { rerender } = render(<Harness domain={domain} onLock={onLock} />);
    fireEvent.click(screen.getByTestId("duel-side-left"));
    rerender(<Harness domain={domain} phase="locked" onLock={onLock} />);
    expect(screen.getByTestId("mig-data-duel")).toHaveAttribute("data-phase", "locked");
    expect(screen.getByRole("radiogroup")).toHaveAttribute("data-answers-state", "locked");
    expect(screen.getByTestId("duel-suspense")).toBeInTheDocument();
    expect(screen.queryByTestId("duel-lock")).toBeNull();
    fireEvent.click(screen.getByTestId("duel-side-right"));
    fireEvent.keyDown(screen.getByTestId("duel-side-right"), { key: "Enter" });
    expect(onLock).not.toHaveBeenCalled();
  });

  it("reveal: both deciding values, the canonical side and the pick are all shown", () => {
    const { rerender } = render(<Harness domain={domain} />);
    fireEvent.click(screen.getByTestId("duel-side-left"));
    rerender(<Harness domain={domain} phase="revealed" revealed />);
    expect(screen.getByTestId("duel-value-left")).toHaveTextContent(f.hidden.values[f.content.left.token]);
    expect(screen.getByTestId("duel-value-right")).toHaveTextContent(f.hidden.values[f.content.right.token]);
    const canonicalWhich = f.hidden.canonicalToken === f.content.left.token ? "left" : "right";
    expect(screen.getByTestId(`duel-tag-answer-${canonicalWhich}`)).toHaveTextContent(/answer/i);
    expect(screen.getByTestId(`duel-side-${canonicalWhich}`)).toHaveAttribute("data-choice-state", "correct");
    // The pick stays marked in words (not colour alone).
    expect(screen.getByTestId("duel-tag-pick-left")).toHaveTextContent(/locked/i);
    expect(screen.getByTestId("mig-evidence")).toHaveTextContent(f.hidden.evidence!);
  });
});

describe("DataDuel is content-neutral", () => {
  it("names no domain, never grades, and never compares values", () => {
    // Comments may explain what the component is used for; code may not know it.
    const src = readFileSync(resolve(__dirname, "DataDuel.tsx"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    for (const word of ["Faker", "T1", "Leona", "Pantheon", "champion", "pro-play", "leaguecraft"]) {
      expect(src, word).not.toMatch(new RegExp(`\\b${word}\\b`, "i"));
    }
    // It reads the canonical side only off `reveal`.
    expect(src).not.toMatch(/parseFloat|Number\(/);
    for (const forbidden of ["analytics", "ranked-public/client\"", "fetch(", "/audio/"]) {
      expect(src).not.toContain(forbidden);
    }
  });
});
