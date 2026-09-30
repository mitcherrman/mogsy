import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OrderForge, moveToken } from "./OrderForge";
import type {
  InteractionPhase, OrderForgePublic, OrderForgeResponse, OrderForgeReveal,
} from "@/lib/interaction-grammar/types";

const CONTENT: OrderForgePublic = {
  prompt: "Order these items by gold cost",
  metricLabel: "Gold cost",
  directionLabels: { first: "Most expensive", last: "Cheapest" },
  entries: [
    { token: "e0", label: "Kindlegem" },
    { token: "e1", label: "Infinity Edge" },
    { token: "e2", label: "Long Sword" },
    { token: "e3", label: "Sunfire Aegis" },
    { token: "e4", label: "Zhonya's Hourglass" },
  ],
};

const REVEAL: OrderForgeReveal = {
  order: ["e3", "e0", "e4", "e1", "e2"],
  canonicalOrder: ["e2", "e0", "e3", "e4", "e1"],
  valueDisplay: { e0: "800 g", e1: "3600 g", e2: "350 g", e3: "2700 g", e4: "3250 g" },
  positionCorrect: [false, true, false, false, false],
  isCorrect: false,
};

function Harness({ phase = "open", reveal = null, onLock = () => {}, initial }: {
  phase?: InteractionPhase; reveal?: OrderForgeReveal | null;
  onLock?: (r: OrderForgeResponse) => void; initial?: string[];
}) {
  const [value, setValue] = useState<string[]>(initial ?? CONTENT.entries.map((e) => e.token));
  return (
    <OrderForge content={CONTENT} phase={phase} value={value} onChange={setValue}
      onLock={onLock} reveal={reveal} />
  );
}

const positions = () =>
  screen.getAllByTestId(/^forge-card-e\d$/).map((el) => el.getAttribute("data-testid")!.slice(-2));

describe("moveToken", () => {
  it("swaps with a neighbour and is a no-op at the ends", () => {
    expect(moveToken(["a", "b", "c"], "b", "up")).toEqual(["b", "a", "c"]);
    expect(moveToken(["a", "b", "c"], "b", "down")).toEqual(["a", "c", "b"]);
    expect(moveToken(["a", "b", "c"], "a", "up")).toEqual(["a", "b", "c"]);
    expect(moveToken(["a", "b", "c"], "c", "down")).toEqual(["a", "b", "c"]);
    expect(moveToken(["a", "b", "c"], "zzz", "down")).toEqual(["a", "b", "c"]);
  });
});

describe("OrderForge — open", () => {
  it("shows the cards in the dealt order with the direction stated both ends", () => {
    render(<Harness />);
    expect(positions()).toEqual(["e0", "e1", "e2", "e3", "e4"]);
    expect(screen.getByTestId("forge-rail-first")).toHaveTextContent("Most expensive");
    expect(screen.getByTestId("forge-rail-last")).toHaveTextContent("Cheapest");
    expect(screen.getByTestId("forge-prompt")).toHaveTextContent("Order these items by gold cost");
  });

  it("reorders with the up / down buttons and announces the move", () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId("forge-down-e0"));
    expect(positions()).toEqual(["e1", "e0", "e2", "e3", "e4"]);
    expect(screen.getByTestId("forge-live")).toHaveTextContent("Kindlegem moved to position 2 of 5");
    fireEvent.click(screen.getByTestId("forge-up-e4"));
    expect(positions()).toEqual(["e1", "e0", "e2", "e4", "e3"]);
  });

  it("disables up on the first card and down on the last", () => {
    render(<Harness />);
    expect(screen.getByTestId("forge-up-e0")).toBeDisabled();
    expect(screen.getByTestId("forge-down-e4")).toBeDisabled();
    expect(screen.getByTestId("forge-down-e0")).toBeEnabled();
  });

  it("reorders from the keyboard on the grip handle", () => {
    render(<Harness />);
    fireEvent.keyDown(screen.getByTestId("forge-grip-e2"), { key: "ArrowUp" });
    expect(positions()).toEqual(["e0", "e2", "e1", "e3", "e4"]);
    fireEvent.keyDown(screen.getByTestId("forge-grip-e2"), { key: "ArrowDown" });
    expect(positions()).toEqual(["e0", "e1", "e2", "e3", "e4"]);
  });

  it("keeps focus on the control that moved the card, so a key can be pressed again", () => {
    // OF1-C: an arrow key on the grip used to hand focus to the up/down
    // button, and the next arrow key then did nothing.
    render(<Harness />);
    const grip = screen.getByTestId("forge-grip-e0");
    grip.focus();
    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(screen.getByTestId("forge-grip-e0"));
    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
    expect(positions()).toEqual(["e1", "e2", "e0", "e3", "e4"]);
    expect(document.activeElement).toBe(screen.getByTestId("forge-grip-e0"));
    fireEvent.keyDown(document.activeElement!, { key: "ArrowUp" });
    expect(positions()).toEqual(["e1", "e0", "e2", "e3", "e4"]);
    // A button press keeps focus on that button...
    screen.getByTestId("forge-up-e0").focus();
    fireEvent.click(screen.getByTestId("forge-up-e0"));
    expect(positions()).toEqual(["e0", "e1", "e2", "e3", "e4"]);
    // ...until the card reaches an end and the button disables: then its grip.
    expect(document.activeElement).toBe(screen.getByTestId("forge-grip-e0"));
  });

  it("makes drag start only from the grip: it alone has touch-action:none", () => {
    render(<Harness />);
    expect(screen.getByTestId("forge-grip-e1").style.touchAction).toBe("none");
    expect(screen.getByTestId("forge-card-e1").style.touchAction).not.toBe("none");
    expect(screen.getByTestId("forge-up-e1").style.touchAction).not.toBe("none");
  });

  it("gives every control an accessible name and a 44px target", () => {
    render(<Harness />);
    expect(screen.getByLabelText(/Move Long Sword up \(currently position 3 of 5\)/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Drag Long Sword, position 3 of 5/)).toBeInTheDocument();
    for (const id of ["forge-up-e1", "forge-down-e1", "forge-grip-e1"]) {
      expect(screen.getByTestId(id).className).toMatch(/h-11 w-11/);
    }
  });

  it("locks the CURRENT order, exactly once per press, as `{order}`", () => {
    const onLock = vi.fn();
    render(<Harness onLock={onLock} />);
    fireEvent.click(screen.getByTestId("forge-down-e0"));
    fireEvent.click(screen.getByTestId("forge-lock"));
    expect(onLock).toHaveBeenCalledTimes(1);
    expect(onLock).toHaveBeenCalledWith({ order: ["e1", "e0", "e2", "e3", "e4"] });
  });

  it("allows locking the untouched order (no local judgement about it)", () => {
    const onLock = vi.fn();
    render(<Harness onLock={onLock} />);
    fireEvent.click(screen.getByTestId("forge-lock"));
    expect(onLock).toHaveBeenCalledWith({ order: ["e0", "e1", "e2", "e3", "e4"] });
  });

  it("never draws a value, rank claim or verdict before the reveal", () => {
    const { container } = render(<Harness />);
    expect(container.textContent).not.toMatch(/\bg\b|800|3600|350|Exactly right|Not quite|Correct order/);
    expect(screen.queryByTestId("forge-reveal")).toBeNull();
  });
});

describe("OrderForge — locked", () => {
  it("shows the locked sequence, no controls, no lock button", () => {
    render(<Harness phase="locked" initial={["e3", "e0", "e4", "e1", "e2"]} />);
    expect(screen.queryByTestId("forge-lock")).toBeNull();
    expect(screen.queryByTestId("forge-grip-e0")).toBeNull();
    expect(screen.queryByTestId("forge-up-e0")).toBeNull();
    const rows = screen.getAllByTestId(/^forge-locked-e\d$/);
    expect(rows.map((r) => r.getAttribute("data-testid")!.slice(-2))).toEqual(
      ["e3", "e0", "e4", "e1", "e2"]);
    expect(screen.getByTestId("forge-suspense")).toBeInTheDocument();
    expect(screen.getByTestId("forge-live")).toHaveTextContent(/locked in/i);
  });

  it("ignores a lock press that arrives after locking", () => {
    const onLock = vi.fn();
    render(<Harness phase="locked" onLock={onLock} />);
    expect(screen.queryByTestId("forge-lock")).toBeNull();
    expect(onLock).not.toHaveBeenCalled();
  });
});

describe("OrderForge — revealed", () => {
  it("compares MY ORDER with CORRECT ORDER using only the supplied reveal", () => {
    render(<Harness phase="revealed" reveal={REVEAL} />);
    const mine = screen.getByTestId("forge-reveal-mine");
    const correct = screen.getByTestId("forge-reveal-correct");
    expect(within(mine).getByRole("heading", { name: "My order" })).toBeInTheDocument();
    expect(within(correct).getByRole("heading", { name: "Correct order" })).toBeInTheDocument();
    const mineIds = within(mine).getAllByTestId(/^forge-mine-e\d$/)
      .map((r) => r.getAttribute("data-testid")!.slice(-2));
    const correctIds = within(correct).getAllByTestId(/^forge-correct-e\d$/)
      .map((r) => r.getAttribute("data-testid")!.slice(-2));
    expect(mineIds).toEqual(REVEAL.order);
    expect(correctIds).toEqual(REVEAL.canonicalOrder);
    // Values are the authority's strings, verbatim.
    expect(screen.getByTestId("forge-correct-e2-value")).toHaveTextContent("350 g");
    expect(screen.getByTestId("forge-mine-e3-value")).toHaveTextContent("2700 g");
  });

  it("marks positions from positionCorrect and does not compute any itself", () => {
    render(<Harness phase="revealed" reveal={REVEAL} />);
    expect(screen.getByTestId("forge-mine-e0")).toHaveAttribute("data-mark", "right");
    expect(screen.getByTestId("forge-mine-e3")).toHaveAttribute("data-mark", "wrong");
    // Deliberately inconsistent marks (they disagree with the two orders) are
    // drawn as stated: the primitive never re-derives correctness.
    render(<Harness phase="revealed" reveal={{ ...REVEAL, positionCorrect: [true, true, true, true, true] }} />);
    expect(screen.getAllByTestId("forge-mine-e3")[1]).toHaveAttribute("data-mark", "right");
  });

  it("draws no marks when the authority stated none, and no partial-credit text", () => {
    const { container } = render(
      <Harness phase="revealed" reveal={{ ...REVEAL, positionCorrect: [], isCorrect: null }} />);
    expect(screen.getByTestId("forge-mine-e0")).toHaveAttribute("data-mark", "neutral");
    expect(screen.queryByTestId("forge-verdict")).toBeNull();
    expect(container.textContent).not.toMatch(/partial|\d+\s*\/\s*\d+|points?\b/i);
  });

  it("states the server verdict in words", () => {
    render(<Harness phase="revealed" reveal={{ ...REVEAL, isCorrect: true }} />);
    expect(screen.getByTestId("forge-verdict")).toHaveTextContent("Exactly right");
  });
});

describe("OrderForge — source contract", () => {
  const src = readFileSync(resolve(__dirname, "OrderForge.tsx"), "utf8");
  it("never grades: the reveal's order is never compared with the canonical one", () => {
    expect(src).not.toMatch(/canonicalOrder\s*[!=]==/);
    expect(src).not.toMatch(/positionCorrect\.(every|some|filter)/);
  });
  it("starts drag only from the handle", () => {
    expect(src).toContain("dragListener={false}");
    expect(src).toContain("controls.start(e)");
  });
});

describe("OrderForge F1 layout", () => {
  it("keeps the wider desktop stack and big-desktop tier as literal classes", () => {
    render(<OrderForge content={CONTENT} phase="open" value={[]} onChange={() => {}} onLock={() => {}} />);
    expect(screen.getByTestId("forge-list").parentElement!.className).toContain("xl:max-w-[52rem]");
    expect(screen.getByTestId("forge-lock").className).toContain("lg:[@media(min-height:860px)]:min-h-[56px]");
    expect(screen.getByTestId(`forge-rank-${CONTENT.entries[0].token}`).className).toContain("md:rounded-full");
  });
});
