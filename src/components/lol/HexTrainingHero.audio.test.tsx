import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

const sfx = vi.hoisted(() => ({ play: vi.fn() }));
vi.mock("@/lib/audio/useSfx", () => ({ useSfx: () => sfx }));
vi.mock("@/hooks/useChampionAssets", () => ({ getChampionSplash: () => null }));

import HexTrainingHero from "./HexTrainingHero";

describe("HexTrainingHero SFX", () => {
  it("keeps passive mode state silent and requests one canonical cue on entry", () => {
    render(
      <MemoryRouter>
        <HexTrainingHero assets={null} onStartQuiz={vi.fn()} />
      </MemoryRouter>,
    );
    expect(sfx.play).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Combat Lab" }));
    expect(sfx.play).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("link", { name: /Enter Combat Lab/ }));
    expect(sfx.play).toHaveBeenCalledTimes(1);
    expect(sfx.play).toHaveBeenCalledWith("training.primary.activate");
  });
});
