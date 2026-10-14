import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StatDrop } from "./StatDrop";
import { CombatEstimate } from "./CombatEstimate";
import type { InteractionPhase } from "@/lib/interaction-grammar/types";
import type {
  CombatEstimatePublic, NumericResponse, NumericReveal, StatDropPublic,
} from "@/lib/interaction-grammar/numericModes";

const DROP: StatDropPublic = {
  prompt: "Drop the marker on the value.",
  metricLabel: "Quantity",
  subject: { label: "Subject A", monogram: "A" },
  scale: { min: 400, max: 800, step: 5, unitLabel: "u" },
};
const EST: CombatEstimatePublic = {
  prompt: "Estimate the result.",
  metricLabel: "Result",
  attacker: { label: "Side A", lines: ["Line one"] },
  target: { label: "Side B", lines: ["Line two"] },
  action: "One action.",
  scale: { min: 0, max: 2000, step: 1, unitLabel: "u" },
};
const REVEAL: NumericReveal = {
  submitted: 660, submittedDisplay: "660 u",
  canonicalValue: 645, canonicalDisplay: "645 u",
  band: { low: 612.75, high: 677.25, display: "612.75 – 677.25 u" },
  verdict: "within", deltaDisplay: "+15 u", isCorrect: true,
  evidence: "Authority sentence.", source: "Authority source",
};

function DropHarness({ phase = "open", reveal = null, onLock = () => {} }: {
  phase?: InteractionPhase; reveal?: NumericReveal | null; onLock?: (r: NumericResponse) => void;
}) {
  const [value, setValue] = useState<number | null>(null);
  return <StatDrop content={DROP} phase={phase} value={value} onChange={setValue} onLock={onLock} reveal={reveal} />;
}
function EstHarness({ phase = "open", reveal = null, onLock = () => {} }: {
  phase?: InteractionPhase; reveal?: NumericReveal | null; onLock?: (r: NumericResponse) => void;
}) {
  const [text, setText] = useState("");
  return <CombatEstimate content={EST} phase={phase} text={text} onTextChange={setText} onLock={onLock} reveal={reveal} />;
}

describe("StatDrop", () => {
  it("renders no answer, band or verdict before the reveal", () => {
    const { container } = render(<DropHarness />);
    expect(screen.queryByTestId("statdrop-canonical")).toBeNull();
    expect(screen.queryByTestId("statdrop-band")).toBeNull();
    expect(screen.queryByTestId("num-reveal")).toBeNull();
    expect(container.textContent).not.toMatch(/645|Answer|Within/);
    expect(screen.getByTestId("statdrop-lock")).toBeDisabled();
  });

  it("is keyboard playable: first key places, arrows step, Enter locks", () => {
    const onLock = vi.fn();
    render(<DropHarness onLock={onLock} />);
    const thumb = screen.getByRole("slider");
    expect(thumb).toHaveAttribute("aria-valuetext", "Not placed");
    fireEvent.keyDown(thumb, { key: "ArrowRight" });
    expect(thumb).toHaveAttribute("aria-valuenow", "600");
    fireEvent.keyDown(thumb, { key: "ArrowRight" });
    fireEvent.keyDown(thumb, { key: "PageUp" });
    expect(thumb).toHaveAttribute("aria-valuenow", "645");
    expect(screen.getByTestId("statdrop-readout")).toHaveTextContent("645 u");
    fireEvent.keyDown(thumb, { key: "Enter" });
    expect(onLock).toHaveBeenCalledWith({ selected: 645 });
  });

  it("places the marker from a pointer on the track", () => {
    // jsdom has no PointerEvent; a MouseEvent subclass carries clientX like the real one.
    if (!("PointerEvent" in window)) {
      (window as unknown as { PointerEvent: unknown }).PointerEvent = class extends MouseEvent {
        pointerId: number;
        constructor(type: string, init: PointerEventInit = {}) { super(type, init); this.pointerId = init.pointerId ?? 0; }
      };
    }
    render(<DropHarness />);
    const track = document.querySelector('[data-part="track"]') as HTMLElement;
    track.getBoundingClientRect = () => ({ left: 0, width: 400, top: 0, height: 56, right: 400, bottom: 56, x: 0, y: 0, toJSON() {} });
    fireEvent.pointerDown(track, { clientX: 100, pointerId: 1 });
    expect(screen.getByRole("slider")).toHaveAttribute("aria-valuenow", "500");
  });

  it("ignores input once locked and shows the authority's reveal", () => {
    const onLock = vi.fn();
    render(<DropHarness phase="revealed" reveal={REVEAL} onLock={onLock} />);
    const thumb = screen.getByRole("slider");
    fireEvent.keyDown(thumb, { key: "ArrowRight" });
    fireEvent.keyDown(thumb, { key: "Enter" });
    expect(onLock).not.toHaveBeenCalled();
    expect(screen.getByTestId("num-canonical")).toHaveTextContent("645 u");
    expect(screen.getByTestId("num-verdict")).toHaveTextContent("Within the band");
    expect(screen.getByTestId("statdrop-band")).toBeTruthy();
    expect(screen.getByRole("status")).toHaveTextContent("Answer 645 u; you said 660 u");
  });
});

describe("CombatEstimate", () => {
  it("renders the premise and no answer before the reveal", () => {
    const { container } = render(<EstHarness />);
    expect(screen.getByTestId("ce-action")).toHaveTextContent("One action.");
    expect(screen.queryByTestId("num-reveal")).toBeNull();
    expect(container.textContent).not.toMatch(/645|Answer|Within/);
    expect(screen.getByTestId("ce-input")).toHaveAttribute("inputmode", "decimal");
  });

  it("locks a valid typed number with Enter and refuses an invalid one", () => {
    const onLock = vi.fn();
    render(<EstHarness onLock={onLock} />);
    const input = screen.getByTestId("ce-input");
    expect(screen.getByTestId("ce-lock")).toBeDisabled();
    fireEvent.change(input, { target: { value: "abc" } });
    expect(screen.getByTestId("ce-lock")).toBeEnabled();
    fireEvent.submit(input.closest("form")!);
    expect(onLock).not.toHaveBeenCalled();
    expect(screen.getByTestId("ce-error")).toHaveTextContent("Enter a number.");
    fireEvent.change(input, { target: { value: "1,240" } });
    fireEvent.submit(input.closest("form")!);
    expect(onLock).toHaveBeenCalledWith({ selected: 1240 });
  });

  it("is read-only after the reveal and prints the authority's strings", () => {
    render(<EstHarness phase="revealed" reveal={REVEAL} />);
    expect(screen.getByTestId("ce-input")).toHaveAttribute("readonly");
    expect(screen.getByTestId("ce-input")).toHaveValue("660 u");
    expect(screen.queryByTestId("ce-lock")).toBeNull();
    expect(screen.getByTestId("num-band")).toHaveTextContent("612.75 – 677.25 u");
  });
});

describe("numeric primitives are content-neutral", () => {
  it("name no domain, never grade and make no side effects", () => {
    for (const file of ["StatDrop.tsx", "CombatEstimate.tsx", "NumericRevealPanel.tsx"]) {
      const src = readFileSync(resolve(__dirname, file), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
      for (const word of ["champion", "pro-play", "leaguecraft", "mastery", "armor"]) {
        expect(src, `${file} ${word}`).not.toMatch(new RegExp(`\\b${word}\\b`, "i"));
      }
      // Correctness is read off `reveal` only.
      expect(src, file).not.toMatch(/canonicalValue\s*[=<>!]=|Math\.abs/);
      for (const forbidden of ["analytics", "ranked-public/client\"", "fetch(", "useSfx", "playSfx", "labAuthority"]) {
        expect(src, `${file} ${forbidden}`).not.toContain(forbidden);
      }
    }
  });
});
