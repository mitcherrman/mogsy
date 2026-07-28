/**
 * Public bot route: it mounts the established Stat Check game with no online
 * controller and no room state, and drops the dev-facing header chrome.
 */
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import StatCheckBotPage from "./StatCheckBotPage";
import DevStatCheckPage, { ProfilePanel } from "../dev/stat-check/StatCheckPage";

/**
 * The rank/record flavour line lives in the wide matchup rail, which the page
 * only mounts at >=1210px. jsdom defaults to 1024, so widen it for those cases.
 */
function withWideViewport(run: () => void) {
  const original = window.innerWidth;
  Object.defineProperty(window, "innerWidth", { value: 1400, configurable: true, writable: true });
  try {
    run();
  } finally {
    Object.defineProperty(window, "innerWidth", { value: original, configurable: true, writable: true });
  }
}

vi.mock("@/hooks/useChampionBaseStats", () => ({
  useChampionBaseStats: () => ({ data: undefined, isLoading: false, isError: false }),
}));
vi.mock("@/hooks/useChampionAssets", () => ({
  useChampionAssets: () => ({ data: undefined }),
  getChampionSplash: () => null,
  getChampionIcon: () => null,
  resolveAssetUrl: () => null,
}));

const roomApi = vi.hoisted(() => ({
  createRoom: vi.fn(),
  joinRoom: vi.fn(),
  getRoom: vi.fn(),
  getActiveRoom: vi.fn(),
}));
vi.mock("@/lib/stat-check-online/client", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/stat-check-online/client")>();
  return { ...original, statCheckOnlineApi: { ...original.statCheckOnlineApi, ...roomApi } };
});

function renderBotRoute() {
  return render(
    <MemoryRouter initialEntries={["/quiz/stat-check/bot"]}>
      <Routes>
        <Route path="/quiz/stat-check/bot" element={<StatCheckBotPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("public Stat Check bot route", () => {
  it("renders the established game board directly from the URL", () => {
    const { container } = renderBotRoute();
    expect(screen.getByTestId("stat-check-arena")).toBeInTheDocument();
    // Three lanes dealt and playable: the local engine ran, not a room.
    expect(container.querySelectorAll('[data-testid^="stat-check-lane-"]').length).toBe(3);
    expect(screen.queryByTestId("sc-online-connecting")).not.toBeInTheDocument();
    expect(screen.queryByTestId("sc-room-create")).not.toBeInTheDocument();
    expect(screen.queryByTestId("sc-room-lobby")).not.toBeInTheDocument();
  });

  it("requires no multiplayer room and issues no room API call", () => {
    renderBotRoute();
    for (const fn of Object.values(roomApi)) expect(fn).not.toHaveBeenCalled();
  });

  it("keeps the bot game's restart control", () => {
    renderBotRoute();
    expect(screen.getByRole("button", { name: /restart/i })).toBeInTheDocument();
  });

  it("mounts the wide matchup rail with the public surface", () => {
    withWideViewport(() => {
      renderBotRoute();
      expect(screen.getByText("Deterministic Bot")).toBeInTheDocument();
      expect(screen.getByText("Metal IV - 99% WR - 999 games")).toBeInTheDocument();
      // The previous placeholder values are gone from the public route.
      expect(screen.queryByText(/Platinum IV/)).not.toBeInTheDocument();
      expect(screen.queryByText(/63% WR/)).not.toBeInTheDocument();
      expect(screen.queryByText(/412 games/)).not.toBeInTheDocument();
    });
  });

  it("hides the dev prototype chrome the dev route shows", () => {
    const { unmount } = render(
      <MemoryRouter>
        <DevStatCheckPage />
      </MemoryRouter>,
    );
    expect(screen.getByText(/Dev prototype/i)).toBeInTheDocument();
    unmount();

    renderBotRoute();
    expect(screen.queryByText(/Dev prototype/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Fixture deck|League Docs stats/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Practice match/i)).toBeInTheDocument();
  });
});

/**
 * The matchup card's rank/record line is invented decoration. These assert the
 * exact string each surface shows, and that the online (private-room) path
 * never shows any of it.
 */
describe("matchup flavour by surface", () => {
  const PUBLIC_BOT = "Metal IV - 99% WR - 999 games";
  const DEV_BOT = "Platinum IV - 63% WR - 412 games";
  const PLAYER = "Diamond II - 57% WR - 892 games";

  it("gives the public bot the exaggerated fictional record", () => {
    render(<ProfilePanel side="bot" surface="public" />);
    expect(screen.getByText(PUBLIC_BOT)).toBeInTheDocument();
    expect(screen.getByText(/Metal IV/)).toBeInTheDocument();
    expect(screen.getByText(/99% WR/)).toBeInTheDocument();
    expect(screen.getByText(/999 games/)).toBeInTheDocument();
    // Bot name is unchanged by the flavour swap.
    expect(screen.getByText("Deterministic Bot")).toBeInTheDocument();
    expect(screen.queryByText(DEV_BOT)).not.toBeInTheDocument();
  });

  it("keeps the dev bot on its original fixture line", () => {
    render(<ProfilePanel side="bot" surface="dev" />);
    expect(screen.getByText(DEV_BOT)).toBeInTheDocument();
    expect(screen.queryByText(/Metal IV/)).not.toBeInTheDocument();
    expect(screen.queryByText(/99% WR/)).not.toBeInTheDocument();
    expect(screen.queryByText(/999 games/)).not.toBeInTheDocument();
  });

  it("leaves the player's own flavour identical on both surfaces", () => {
    const { unmount } = render(<ProfilePanel side="player" surface="dev" />);
    expect(screen.getByText(PLAYER)).toBeInTheDocument();
    unmount();
    render(<ProfilePanel side="player" surface="public" />);
    expect(screen.getByText(PLAYER)).toBeInTheDocument();
    expect(screen.queryByText(/Metal IV/)).not.toBeInTheDocument();
  });

  it("shows neutral seat identities in an online private match, never a fake record", () => {
    for (const surface of ["dev", "public"] as const) {
      for (const side of ["bot", "player"] as const) {
        const { unmount } = render(<ProfilePanel side={side} isOnline surface={surface} />);
        expect(screen.getByText("Private match")).toBeInTheDocument();
        expect(screen.queryByText(/Metal IV|Platinum IV|Diamond II|99% WR|999 games/)).not.toBeInTheDocument();
        expect(screen.queryByText("Deterministic Bot")).not.toBeInTheDocument();
        unmount();
      }
    }
  });

  it("keeps the flavour strings out of gameplay: they are fixed decoration", async () => {
    const engine = await import("../dev/stat-check/statCheckEngine");
    const source = Object.values(engine).map((value) => String(value)).join("\n");
    for (const text of [PUBLIC_BOT, DEV_BOT, PLAYER, "Metal IV", "999 games"]) {
      expect(source).not.toContain(text);
    }
  });
});
