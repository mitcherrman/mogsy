/**
 * QMEDIA2 — Match Grid art that fails to load falls back to its monogram.
 *
 * The seal, sigil and ledger images had no error handler: a dead rune asset
 * left a broken-image glyph on the board. A failed image now shows exactly the
 * text a missing one already did.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { MatchGrid } from "./MatchGrid";
import type { MatchPublic } from "@/lib/match-grid/contract";

beforeAll(() => {
  if (!Element.prototype.setPointerCapture) Element.prototype.setPointerCapture = () => {};
  if (!Element.prototype.releasePointerCapture) Element.prototype.releasePointerCapture = () => {};
});

const content: MatchPublic = {
  prompt: "Seat each sigil in its discipline.",
  context: "Lab · two disciplines",
  entityNoun: "sigil",
  groupNoun: "discipline",
  membership: "one",
  groups: [
    { token: "d0", label: "Alpha", hue: 44, media: { src: "/assets/__viscont_missing__/alpha.png", alt: "" } },
    { token: "d1", label: "Beta", hue: 200 },
  ],
  entities: [
    { token: "s0", label: "Ash", media: { src: "/assets/__viscont_missing__/ash.png", alt: "" } },
    { token: "s1", label: "Bell", media: { src: "/assets/runes/bell.png", alt: "" } },
    { token: "s2", label: "Cinder" },
  ],
};

function board() {
  return render(
    <MatchGrid content={content} phase="open" value={{}} onChange={() => {}}
      onLock={() => {}} reveal={null} />,
  );
}

afterEach(cleanup);

describe("Match Grid with a missing asset", () => {
  it("a failed sigil image becomes the sigil's monogram", () => {
    const { container } = board();
    const sigil = screen.getByRole("button", { name: /^Ash\b/ });
    const img = sigil.querySelector("img")!;
    expect(img).toBeTruthy();
    fireEvent.error(img);
    expect(sigil.querySelector("img")).toBeNull();
    expect(sigil.querySelector(".mg-sigil-mono")!.textContent).toBe("As");
    // The healthy sigil keeps its art.
    const bell = screen.getByRole("button", { name: /^Bell\b/ });
    expect(bell.querySelector("img")).toBeTruthy();
    expect(container.querySelectorAll("img").length).toBeGreaterThan(0);
  });

  it("a failed seal image becomes the group's initial", () => {
    board();
    const seal = screen.getByRole("button", { name: /^Alpha,/ });
    fireEvent.error(seal.querySelector("img")!);
    expect(seal.querySelector("img")).toBeNull();
    expect(seal.querySelector(".mg-seal-mono")!.textContent).toBe("A");
  });
});
