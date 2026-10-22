/**
 * ATL-P1-C — page smoke test: the five-step journey runs end to end in jsdom
 * through the real reducers and the real plates, with the announcements a
 * screen reader would hear.
 */
import { MotionGlobalConfig } from "framer-motion";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeAll, describe, expect, it } from "vitest";
import AtlasP1CPage from "./AtlasP1CPage";

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
});

function mount(search = "") {
  return render(
    <MemoryRouter initialEntries={[`/lol/dev/atlas-p1c${search}`]}>
      <Routes>
        <Route path="/lol/dev/atlas-p1c" element={<AtlasP1CPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

const lensByTitle = (title: string) => {
  const heading = screen.getAllByRole("heading", { level: 3, name: new RegExp(`^${title}`) })[0];
  return heading.closest("[data-lens-id]") as HTMLElement;
};

describe("ATL-P1-C page", () => {
  it("renders an empty stage marked DEMO DATA with the deck docked", () => {
    mount();
    expect(screen.getByTestId("atlas-root")).toBeInTheDocument();
    expect(screen.getAllByText("DEMO DATA").length).toBeGreaterThan(0);
    expect(screen.getByText("The stage is empty")).toBeInTheDocument();
    expect(screen.getByTestId("atlas-deck")).toBeInTheDocument();
  });

  it("walks the showcase journey", async () => {
    mount();
    const journey = screen.getByRole("navigation", { name: "Showcase journey" });

    // Step 1: two Lenses, compared.
    fireEvent.click(within(journey).getByRole("button", { name: /Ahri Q · Syndra Q/ }));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(lensByTitle("Ahri Q")).toBeInTheDocument();
    expect(lensByTitle("Syndra Q")).toBeInTheDocument();
    const bridge = screen.getByTestId("atlas-bridge");
    expect(within(bridge).getByText("comparable")).toBeInTheDocument();

    // Step 2: patch + override, honest history.
    fireEvent.click(within(journey).getByRole("button", { name: /Patch & override/ }));
    const ahri = lensByTitle("Ahri Q");
    expect(await within(ahri).findByText(/Absolute values at patch 26\.16 are not recorded/)).toBeInTheDocument();
    expect(within(ahri).getByText("Recorded change evidence")).toBeInTheDocument();
    expect(within(ahri).getByText("inherits global")).toBeInTheDocument();
    const syndra = lensByTitle("Syndra Q");
    expect(within(syndra).getByText("override")).toBeInTheDocument();
    expect(within(syndra).getByText("diverges")).toBeInTheDocument();
    // The comparison is now blocked by context divergence, not silently kept.
    expect(within(screen.getByTestId("atlas-bridge")).getByText("blocked")).toBeInTheDocument();

    // Step 3: transform both, dropped facet visible and reversible.
    fireEvent.click(within(journey).getByRole("button", { name: /To Pro Play/ }));
    const proAhri = lensByTitle("Ahri");
    expect(within(proAhri).getByText("Pro Play")).toBeInTheDocument();
    expect(await within(proAhri).findByText(/Dropped:/)).toBeInTheDocument();
    expect(within(proAhri).getAllByRole("button", { name: /Revert/ }).length).toBeGreaterThan(0);
    expect(await within(proAhri).findByText("Games")).toBeInTheDocument();
    expect(within(proAhri).queryByText("Base damage")).toBeNull();
    fireEvent.click(within(proAhri).getAllByRole("button", { name: /Revert/ })[0]);
    expect(lensByTitle("Ahri Q")).toBeInTheDocument();

    // Step 4: matrix + sealed exact matchup.
    fireEvent.click(within(journey).getByRole("button", { name: /Faker × Chovy/ }));
    const group = screen.getByTestId("atlas-group");
    expect(within(group).getAllByRole("group", { name: /on/ })).toHaveLength(4);
    expect(await within(group).findByText(/0 recorded games: covered, and empty/)).toBeInTheDocument();
    fireEvent.click(within(group).getByRole("button", { name: /Exact head-to-head/ }));
    expect(await screen.findByText("OWNER-ONLY · SEALED")).toBeInTheDocument();
    expect(screen.getByText("/api/pro-play/matchup/exact")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Request owner session" })).toBeDisabled();

    // Step 5: restore a memory-only sample.
    fireEvent.click(within(journey).getByRole("button", { name: /Restore/ }));
    await waitFor(() => expect(screen.queryByTestId("atlas-group")).toBeNull());
    expect(lensByTitle("Ahri Q")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/Restored "Lane scout" from memory/);
  });

  it("pins, holds, moves and undoes from the keyboard, announcing each", () => {
    mount("?start=lane-scout");
    const ahri = lensByTitle("Ahri Q");
    const syndra = lensByTitle("Syndra Q");
    ahri.focus();
    fireEvent.keyDown(ahri, { key: "h" });
    expect(within(ahri).getByText("held")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/Lens held/);

    syndra.focus();
    fireEvent.keyDown(syndra, { key: "ArrowLeft", shiftKey: true });
    const stage = screen.getByTestId("atlas-stage");
    const keys = Array.from(stage.querySelectorAll<HTMLElement>("[data-dock-key]")).map((el) => el.dataset.dockKey);
    expect(keys[0]).toBe("lens:lens-2");
    expect(screen.getByRole("status")).toHaveTextContent(/Moved to position 1 of 2/);

    fireEvent.keyDown(screen.getByTestId("atlas-root"), { key: "z", ctrlKey: true });
    expect(within(lensByTitle("Ahri Q")).queryByText("held")).toBeNull();
  });

  it("honours forced reduced motion", () => {
    mount("?motion=reduce");
    expect(screen.getByTestId("atlas-root").dataset.reduced).toBe("true");
    expect(document.documentElement.classList.contains("reduce-motion")).toBe(true);
  });
});
