/**
 * imageComponent injection — the Remotion composition substitutes
 * remotion's <Img> for avatar images; the live app keeps the lazy native
 * element by default. Only image media routes through the injection;
 * initials media never does.
 */
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { stateAt } from "@/graph1/engine";
import { buildRaceIndex } from "@/graph1/raceIndex";
import { makeDataset, type EventSpec } from "@/graph1/testFixtures";
import RaceRenderer, { type RaceRendererImageComponent } from "./RaceRenderer";

const SPEC: EventSpec[] = [
  ["champion:Azir", "2015-01-01T10:00:00Z"],
  ["player:B", "2015-01-02T10:00:00Z"],
];

const IMAGE_OVERRIDES = {
  "champion:Azir": {
    media: {
      kind: "image" as const,
      src: "https://example.test/azir.png",
      fallbackText: "Azir",
    },
  },
};

const DISPLAY = { showWinOverlay: false, showSecondaryEntityLabel: false };

function fullFrame() {
  const ds = makeDataset(SPEC, IMAGE_OVERRIDES);
  const index = buildRaceIndex(ds);
  return { ds, frame: stateAt(index, index.eventCount, { topN: 10 }) };
}

describe("RaceRenderer imageComponent", () => {
  it("defaults to a lazy native <img> for image media", () => {
    const { ds, frame } = fullFrame();
    const { container } = render(
      <RaceRenderer frame={frame} entities={ds.entities} metricLabel="games"
        topN={10} display={DISPLAY} />,
    );
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img).toHaveAttribute("src", "https://example.test/azir.png");
    expect(img).toHaveAttribute("loading", "lazy");
  });

  it("routes image media through an injected component instead", () => {
    const seen: string[] = [];
    const Probe: RaceRendererImageComponent = ({ src, alt, className }) => {
      seen.push(src);
      return <div data-testid="probe-img" data-alt={alt} className={className} />;
    };
    const { ds, frame } = fullFrame();
    const { container, getByTestId } = render(
      <RaceRenderer frame={frame} entities={ds.entities} metricLabel="games"
        topN={10} display={DISPLAY} imageComponent={Probe} />,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(seen).toEqual(["https://example.test/azir.png"]);
    expect(getByTestId("probe-img").dataset.alt).toBe("Azir");
    // initials media stays a plain div, not the injected component
    expect(container.querySelectorAll("[data-testid=probe-img]")).toHaveLength(1);
  });
});
