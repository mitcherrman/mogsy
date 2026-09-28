import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DataDuel } from "./DataDuel";
import type {
  DataDuelPublic, DataDuelResponse, DataDuelReveal, InteractionPhase,
} from "@/lib/interaction-grammar/types";

/** Two content-neutral duels: a two-sided one and one whose domain has a tie. */
const FIXTURES: Array<{ name: string; content: DataDuelPublic; hidden: DataDuelReveal }> = [
  {
    name: "two-sided",
    content: {
      prompt: "Which team has more wins this split?",
      metricLabel: "Wins",
      context: "Split 2",
      left: { token: "blue", label: "Blue Team", sublabel: "Region A", media: null },
      right: { token: "red", label: "Red Team", sublabel: "Region B", media: null },
    },
    hidden: {
      canonicalToken: "red",
      values: { blue: "11 wins", red: "14 wins" },
      numericValues: { blue: 11, red: 14 },
      marginDisplay: "3 wins",
      evidence: "Red 14, Blue 11.",
      source: "Scoreboard",
    },
  },
  {
    name: "with a tie",
    content: {
      prompt: "Which is shorter?",
      metricLabel: "Cooldown",
      left: { token: "a", label: "Subject A", media: { src: "/a.jpg", alt: "" } },
      right: { token: "b", label: "Subject B", media: null },
      tie: { token: "same", label: "Same value" },
    },
    hidden: {
      canonicalToken: "a",
      values: { a: "90 seconds", b: "180 seconds" },
      numericValues: { a: 90, b: 180 },
      marginDisplay: "90 seconds",
    },
  },
];

/** A minimal controller: the primitive is controlled, like it is in production. */
function Harness({ f, phase = "open", revealed = false, onLock = () => {} }: {
  f: (typeof FIXTURES)[number]; phase?: InteractionPhase; revealed?: boolean;
  onLock?: (r: DataDuelResponse) => void;
}) {
  const [value, setValue] = useState<string | null>(null);
  return (
    <DataDuel content={f.content} phase={phase} value={value} onChange={setValue} onLock={onLock}
      reveal={revealed ? f.hidden : null} />
  );
}

describe.each(FIXTURES)("DataDuel · $name", (f) => {
  it("renders the public content and NO canonical answer or value before reveal", () => {
    const { container } = render(<Harness f={f} />);
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
    render(<Harness f={f} onLock={onLock} />);
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
    render(<Harness f={f} onLock={onLock} />);
    const left = screen.getByTestId("duel-side-left");
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
    render(<Harness f={f} />);
    const group = screen.getByRole("radiogroup");
    expect(group).toHaveAccessibleName(f.content.prompt);
    expect(within(group).getAllByRole("radio")).toHaveLength(f.content.tie ? 3 : 2);
    expect(screen.getByRole("radio", { name: new RegExp(f.content.left.label) })).toBeInTheDocument();
  });

  it("locked: inputs are inert and the suspense beat shows", () => {
    const onLock = vi.fn();
    const { rerender } = render(<Harness f={f} onLock={onLock} />);
    fireEvent.click(screen.getByTestId("duel-side-left"));
    rerender(<Harness f={f} phase="locked" onLock={onLock} />);
    expect(screen.getByTestId("mig-data-duel")).toHaveAttribute("data-phase", "locked");
    expect(screen.getByRole("radiogroup")).toHaveAttribute("data-answers-state", "locked");
    expect(screen.getByTestId("duel-suspense")).toBeInTheDocument();
    expect(screen.queryByTestId("duel-lock")).toBeNull();
    fireEvent.click(screen.getByTestId("duel-side-right"));
    fireEvent.keyDown(screen.getByTestId("duel-side-right"), { key: "Enter" });
    expect(onLock).not.toHaveBeenCalled();
  });

  it("reveal: both deciding values, the canonical side, the pick and the margin are all shown", () => {
    const { rerender } = render(<Harness f={f} />);
    fireEvent.click(screen.getByTestId("duel-side-left"));
    rerender(<Harness f={f} phase="revealed" revealed />);
    expect(screen.getByTestId("duel-value-left")).toHaveTextContent(f.hidden.values[f.content.left.token]);
    expect(screen.getByTestId("duel-value-right")).toHaveTextContent(f.hidden.values[f.content.right.token]);
    const canonicalWhich = f.hidden.canonicalToken === f.content.left.token ? "left" : "right";
    expect(screen.getByTestId(`duel-tag-answer-${canonicalWhich}`)).toHaveTextContent(/answer/i);
    expect(screen.getByTestId(`duel-side-${canonicalWhich}`)).toHaveAttribute("data-choice-state", "correct");
    expect(screen.getByTestId("duel-tag-pick-left")).toHaveTextContent(/locked/i);
    expect(screen.getByTestId("duel-margin-text")).toHaveTextContent(f.hidden.marginDisplay!);
    if (f.hidden.evidence) expect(screen.getByTestId("mig-evidence")).toHaveTextContent(f.hidden.evidence);
  });
});

describe("DataDuel — a reveal without values (legacy)", () => {
  it("shows the tags but no value, no placeholder and no margin", () => {
    const f = FIXTURES[1];
    render(<DataDuel content={f.content} phase="revealed" value="b" onChange={() => {}} onLock={() => {}}
      reveal={{ canonicalToken: "a", values: {} }} />);
    expect(screen.getByTestId("duel-side-left")).toHaveAttribute("data-choice-state", "correct");
    expect(screen.getByTestId("duel-side-right")).toHaveAttribute("data-choice-state", "incorrect-selected");
    expect(screen.getByTestId("duel-value-left").textContent).toBe("");
    expect(screen.getByTestId("mig-data-duel").textContent).not.toContain("—");
    expect(screen.queryByTestId("duel-margin")).toBeNull();
  });
});

describe("DataDuel is content-neutral", () => {
  it("names no domain, never grades, never formats a number and makes no side effects", () => {
    // Comments may explain what the component is used for; code may not know it.
    const src = readFileSync(resolve(__dirname, "DataDuel.tsx"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    for (const word of ["Faker", "T1", "Leona", "Pantheon", "champion", "pro-play", "leaguecraft", "mastery"]) {
      expect(src, word).not.toMatch(new RegExp(`\\b${word}\\b`, "i"));
    }
    // It reads the canonical side only off `reveal`, and prints the authority's strings.
    expect(src).not.toMatch(/parseFloat|Number\(|toFixed/);
    for (const forbidden of ["analytics", "ranked-public/client\"", "fetch(", "/audio/", "useSfx", "playSfx"]) {
      expect(src).not.toContain(forbidden);
    }
  });
});
