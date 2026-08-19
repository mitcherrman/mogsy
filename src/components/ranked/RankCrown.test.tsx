import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import RankCrown from "./RankCrown";

afterEach(() => {
  cleanup();
});

describe("RankCrown", () => {
  it("uses the Mogzy crown path for a supported rank", () => {
    render(<RankCrown rankName="Gold" fallbackSrc="/legacy/gold.png" alt="Gold rank" />);
    expect(screen.getByAltText("Gold rank")).toHaveAttribute("src", "/images/ranked/crowns/gold.png");
  });

  it("uses fallbackSrc for an unsupported rank", () => {
    render(<RankCrown rankName="Platinum" fallbackSrc="/legacy/platinum.png" alt="Platinum rank" />);
    expect(screen.getByAltText("Platinum rank")).toHaveAttribute("src", "/legacy/platinum.png");
  });

  it("renders nothing when there is no crown art and no fallback", () => {
    const { container } = render(<RankCrown rankName="Platinum" fallbackSrc={null} alt="Platinum rank" />);
    expect(container.querySelector("img")).toBeNull();
  });
});
