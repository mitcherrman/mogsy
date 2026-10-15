import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import rangeCapture from "@/lib/rangefinder/__fixtures__/rangeAuthorityCapture.json";
import wordRounds from "@/lib/word-puzzle/__fixtures__/wordPuzzleRounds.json";
import { PROTOTYPE_LABEL } from "@/lib/interaction-labs/packs";
import InteractionLabPage from "./InteractionLabPage";

// The labs are covered by their own suites; here they only report what they were handed.
vi.mock("@/pages/dev/rangefinder/RangefinderLab", () => ({
  default: ({ capture }: { capture: { eligible: unknown[] } }) => <div data-testid="rf-lab">{capture.eligible.length} rounds</div>,
}));
vi.mock("@/pages/dev/word-puzzle/WordPuzzleLab", () => ({
  default: ({ rounds }: { rounds: unknown[] }) => <div data-testid="wp-lab">{rounds.length} rounds</div>,
}));

const at = (path: string) => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route path="/admin/interaction-labs" element={<InteractionLabPage />} />
      <Route path="/admin/interaction-labs/:lab" element={<InteractionLabPage />} />
    </Routes>
  </MemoryRouter>,
);
const pick = (json: unknown, name = "pack.json") =>
  fireEvent.change(screen.getByTestId("lab-pack-input"), { target: { files: [new File([JSON.stringify(json)], name, { type: "application/json" })] } });

describe("INT1 /admin/interaction-labs", () => {
  it("the index lists both labs under the prototype label", () => {
    at("/admin/interaction-labs");
    expect(screen.getByTestId("lab-prototype-label")).toHaveTextContent(PROTOTYPE_LABEL);
    expect(screen.getByRole("link", { name: /Rangefinder/ })).toHaveAttribute("href", "/admin/interaction-labs/rangefinder");
    expect(screen.getByRole("link", { name: /Glyph Press/ })).toHaveAttribute("href", "/admin/interaction-labs/word-puzzle");
  });

  it("an unknown lab mounts nothing", () => {
    at("/admin/interaction-labs/nope");
    expect(screen.getByTestId("interaction-lab-unknown")).toBeInTheDocument();
    expect(screen.queryByTestId("lab-pack-input")).toBeNull();
  });

  it("a lab opens on the loader with the label, an accessible file input and no lab mounted", () => {
    at("/admin/interaction-labs/word-puzzle");
    expect(screen.getByTestId("lab-prototype-label")).toHaveTextContent(PROTOTYPE_LABEL);
    expect(screen.getByLabelText("Load the lab pack")).toHaveAttribute("type", "file");
    expect(screen.queryByTestId("wp-lab")).toBeNull();
  });

  it("refuses the wrong lab's file with a reason and mounts nothing", async () => {
    at("/admin/interaction-labs/word-puzzle");
    pick(rangeCapture);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/Not a Word Puzzle round file/));
    expect(screen.queryByTestId("wp-lab")).toBeNull();
  });

  it("mounts Glyph Press with every round of the committed file", async () => {
    at("/admin/interaction-labs/word-puzzle");
    pick(wordRounds, "wordPuzzleRounds.json");
    expect(await screen.findByTestId("wp-lab")).toHaveTextContent(`${wordRounds.rounds.length} rounds`);
    expect(screen.getByTestId("interaction-lab-live")).toHaveAttribute("data-pack", "wordPuzzleRounds.json");
  });

  it("mounts Rangefinder with the 227-round capture", async () => {
    at("/admin/interaction-labs/rangefinder");
    pick(rangeCapture);
    expect(await screen.findByTestId("rf-lab")).toHaveTextContent("227 rounds");
  });
});
