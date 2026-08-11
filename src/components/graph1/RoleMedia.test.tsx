/**
 * Role-enhanced initials media, and browser/Remotion parity.
 *
 * The ladder is: validated image -> role-enhanced initials -> plain initials.
 * A missing, unknown or non-playing role must land on the last rung silently;
 * it is an enhancement, never a requirement.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { GRAPH1_PLAYER_ROLES } from "@/graph1/contract";
import { stateAt } from "@/graph1/engine";
import { buildRaceIndex } from "@/graph1/raceIndex";
import { makeDataset, type EventSpec } from "@/graph1/testFixtures";
import RaceRenderer from "./RaceRenderer";
import RoleGlyph from "./RoleGlyph";

const SPEC: EventSpec[] = [
  ["player:Mid", "2020-01-01T10:00:00Z", 1, { gameId: "G0" }],
  ["player:Plain", "2020-01-02T10:00:00Z", 1, { gameId: "G1" }],
  ["champion:Azir", "2020-01-03T10:00:00Z", 1, { gameId: "G2" }],
];

function scene() {
  const ds = makeDataset(SPEC, {
    "player:Mid": {
      displayName: "Faker",
      media: { kind: "initials", value: "FA", role: "Mid" },
    },
    "player:Plain": {
      displayName: "Nobody",
      media: { kind: "initials", value: "NO" },
    },
    "champion:Azir": {
      displayName: "Azir",
      type: "champion",
      media: {
        kind: "image",
        src: "https://example.test/assets/champions/Azir/icon.png",
        fallbackText: "AZ",
      },
    },
  });
  const index = buildRaceIndex(ds);
  return { ds, frame: stateAt(index, index.eventCount, { topN: 10 }) };
}

const DISPLAY = { showWinOverlay: true, showSecondaryEntityLabel: false };

function renderScene() {
  const { ds, frame } = scene();
  return render(
    <RaceRenderer
      frame={frame}
      entities={ds.entities}
      metricLabel="games"
      topN={10}
      display={DISPLAY}
    />,
  );
}

describe("media ladder", () => {
  it("a validated image still wins", () => {
    const { container } = renderScene();
    const row = container.querySelector('[data-entity-id="champion:Azir"]')!;
    const img = row.querySelector("img")!;
    expect(img.getAttribute("src")).toContain("/assets/champions/Azir/icon.png");
    expect(row.querySelector("[data-role-glyph]")).toBeNull();
  });

  it("role-enhanced initials keep the initials and add a glyph", () => {
    const { container } = renderScene();
    const row = container.querySelector('[data-entity-id="player:Mid"]')!;
    const avatar = row.querySelector("[data-avatar]")!;
    expect(avatar.getAttribute("data-avatar")).toBe("role-initials");
    expect(avatar.textContent).toContain("FA");
    expect(row.querySelector("[data-role-glyph]")!.getAttribute("data-role-glyph"))
      .toBe("Mid");
  });

  it("a player without a role degrades to ordinary initials", () => {
    const { container } = renderScene();
    const row = container.querySelector('[data-entity-id="player:Plain"]')!;
    const avatar = row.querySelector("[data-avatar]")!;
    expect(avatar.getAttribute("data-avatar")).toBe("initials");
    expect(avatar.textContent).toBe("NO");
    expect(row.querySelector("[data-role-glyph]")).toBeNull();
  });

  it("never renders a broken image for a role avatar", () => {
    const { container } = renderScene();
    const row = container.querySelector('[data-entity-id="player:Mid"]')!;
    expect(row.querySelector("img")).toBeNull();
  });

  it("does not change the row's accessible label", () => {
    renderScene();
    const label = screen
      .getByLabelText(/Faker/)
      .getAttribute("aria-label");
    expect(label).toContain("Rank");
    expect(label).not.toContain("Mid");
  });

  it("the glyph is decorative, not announced", () => {
    const { container } = renderScene();
    const glyph = container.querySelector("[data-role-glyph]")!;
    expect(glyph.getAttribute("aria-hidden")).toBe("true");
  });
});

describe("RoleGlyph", () => {
  it("renders every lane position without external assets", () => {
    for (const role of GRAPH1_PLAYER_ROLES) {
      const { container, unmount } = render(<RoleGlyph role={role} />);
      const svg = container.querySelector("svg")!;
      expect(svg.getAttribute("data-role-glyph")).toBe(role);
      expect(svg.querySelector("path")).not.toBeNull();
      expect(container.querySelector("img")).toBeNull();
      expect(container.innerHTML).not.toContain("http");
      unmount();
    }
  });

  it("is deterministic for the same role", () => {
    const a = render(<RoleGlyph role="Jungle" />).container.innerHTML;
    const b = render(<RoleGlyph role="Jungle" />).container.innerHTML;
    expect(a).toBe(b);
  });

  it("holds no module-scope JSX, so both JSX runtimes can load it", async () => {
    // Regression guard: the glyph table was once `Record<Role, JSX.Element>`
    // with JSX literals at module scope. Vite (automatic runtime) was happy;
    // Remotion's webpack uses the CLASSIC runtime, so those literals compiled
    // to a bare React.createElement evaluated at import time and crashed the
    // video bundle with "React is not defined". Vitest also uses the
    // automatic runtime, so no rendering test can reproduce it — what keeps
    // the module runtime-agnostic is that its constant is plain path data.
    const source = await import("./RoleGlyph.tsx?raw").then((m) => m.default);
    const table = source.slice(
      source.indexOf("const PATHS"),
      source.indexOf("export interface RoleGlyphProps"),
    );
    // JSX element literals: a fragment, or a lowercase intrinsic tag
    expect(table).not.toMatch(/<>|<(path|svg|g|circle|rect)\b/);
    expect(table).toContain("Record<Graph1PlayerRole, string[]>");
  });
});

describe("browser / Remotion parity", () => {
  it("the injected image component still receives image media only", () => {
    const seen: string[] = [];
    const Injected = ({ src, alt }: { src: string; alt: string }) => {
      seen.push(src);
      return <span data-injected={alt} />;
    };
    const { ds, frame } = scene();
    const { container } = render(
      <RaceRenderer
        frame={frame}
        entities={ds.entities}
        metricLabel="games"
        topN={10}
        display={DISPLAY}
        imageComponent={Injected}
      />,
    );
    expect(seen).toEqual([
      "https://example.test/assets/champions/Azir/icon.png",
    ]);
    // role avatars need no loader at all, so a Remotion frame cannot stall
    expect(
      container.querySelectorAll("[data-avatar] [data-role-glyph]"),
    ).toHaveLength(1);
  });

  it("renders identically with and without an injected image component", () => {
    const { ds, frame } = scene();
    const plain = render(
      <RaceRenderer frame={frame} entities={ds.entities} metricLabel="games"
        topN={10} display={DISPLAY} />,
    );
    const roleMarkup = plain.container.querySelector(
      '[data-entity-id="player:Mid"] [data-avatar]',
    )!.outerHTML;
    plain.unmount();

    const injected = render(
      <RaceRenderer frame={frame} entities={ds.entities} metricLabel="games"
        topN={10} display={DISPLAY}
        imageComponent={({ src, alt }) => <img src={src} alt={alt} />} />,
    );
    expect(
      injected.container.querySelector(
        '[data-entity-id="player:Mid"] [data-avatar]',
      )!.outerHTML,
    ).toBe(roleMarkup);
  });

  it("entity-media off removes role avatars too", () => {
    const { ds, frame } = scene();
    const { container } = render(
      <RaceRenderer frame={frame} entities={ds.entities} metricLabel="games"
        topN={10} display={{ ...DISPLAY, showEntityMedia: false }} />,
    );
    expect(container.querySelector("[data-role-glyph]")).toBeNull();
    expect(container.querySelector("[data-avatar]")).toBeNull();
    expect(container.querySelectorAll("[data-entity-id]")).toHaveLength(3);
  });
});
