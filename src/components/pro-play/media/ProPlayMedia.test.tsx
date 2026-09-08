/**
 * The media authority, from the frontend's side of the contract.
 *
 * Three properties are worth more than the rest and all three are about what
 * does NOT happen: no page render reaches an external host, a key that is not
 * a canonical identity draws a monogram rather than someone else's face, and a
 * player the authority KNOWS about but has not cleared for publication draws
 * the same monogram as a stranger.
 *
 * That last one is the shipped Phase 1 rights policy. The three team marks are
 * published on a trademark-identification basis; the three Riot-owned
 * photographs are held as candidates. The payloads below are shaped exactly
 * like the ones the live endpoint returns for that state, so this file fails if
 * the hold is ever quietly lifted.
 */
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PlayerPortrait, TeamCrest, monogram } from "@/components/pro-play/dossier/DossierMedia";
import { ProPlayMediaProvider, __resetProPlayMediaCache } from "./ProPlayMediaProvider";
import { matchupMediaKeys, type EntityMedia } from "@/lib/pro-play/mediaApi";

/** The configured backend base, derived exactly as `mediaApi` derives it —
 *  NOT hardcoded. A developer with a local `.env.local` pointing at their own
 *  API otherwise fails these tests for a reason that has nothing to do with
 *  media, which is how a suite starts getting ignored. */
const API = (
  (import.meta.env?.VITE_COMBAT_API_URL as string | undefined) ||
  "https://web-production-83e53.up.railway.app"
).replace(/\/+$/, "");

function art(
  entity_type: "team" | "player",
  entity_key: string,
  asset_path: string,
  over: Partial<EntityMedia> = {},
): EntityMedia {
  return {
    entity_type,
    entity_key,
    media_type: entity_type === "team" ? "team_logo" : "player_portrait",
    state: "art",
    reason: "ok",
    display_name: entity_key,
    fallback_label: null,
    asset_path,
    mime_type: "image/png",
    width: 1024,
    height: 405,
    credit: null,
    contract_version: "pro_media_v1",
    ...over,
  };
}

function fallback(entity_type: "team" | "player", entity_key: string): EntityMedia {
  return {
    ...art(entity_type, entity_key, ""),
    state: "fallback",
    reason: "unknown_entity",
    asset_path: null,
  };
}

/** A player the authority knows but is not publishing: `no_approved_media`,
 *  which is a DIFFERENT reason from `unknown_entity` and must render the same. */
function held(entity_key: string): EntityMedia {
  return { ...fallback("player", entity_key), reason: "no_approved_media" };
}

//: The shipped pilot, exactly as the live endpoint answers it today.
const PILOT = [
  art("team", "T1", "assets/esports/teams/t1-27e460ed/team_logo-c253d2cb81e4.png"),
  art("team", "Gen.G", "assets/esports/teams/gen-g-0819355b/team_logo-15057dc5a0f8.png"),
  art("team", "Hanwha Life Esports", "assets/esports/teams/hanwha-life-esports-05483fea/team_logo-eb8ff3bdffc4.png"),
  held("Faker"),
  held("Chovy"),
  held("Zeus"),
  fallback("player", "Knight"),
];

let fetchMock: ReturnType<typeof vi.fn>;

function mockMedia(results: EntityMedia[], identity_available = true) {
  fetchMock = vi.fn(async () => ({
    ok: true,
    json: async () => ({
      ok: true,
      contract_version: "pro_media_v1",
      count: results.length,
      identity_available,
      results,
    }),
  }));
  vi.stubGlobal("fetch", fetchMock);
}

/** No QueryClientProvider anywhere in this file, on purpose: the media layer
 *  must work in a tree that has none, which is how the Matchup Explorer's own
 *  page tests render it. */
function wrap(ui: React.ReactNode, teams: string[], players: string[]) {
  return render(
    <ProPlayMediaProvider teams={teams} players={players}>
      {ui}
    </ProPlayMediaProvider>,
  );
}

beforeEach(() => {
  __resetProPlayMediaCache();
  mockMedia(PILOT);
});
afterEach(() => vi.unstubAllGlobals());

describe("pilot media", () => {
  it("renders the T1 crest from Mogzy's own asset store", async () => {
    wrap(<TeamCrest name="T1" shortCode="T1" entityKey="T1" />, ["T1"], []);
    const img = await screen.findByRole("img", { name: "T1" });
    expect(img).toHaveAttribute("src", `${API}/assets/esports/teams/t1-27e460ed/team_logo-c253d2cb81e4.png`);
    expect(screen.getByTestId("team-crest")).toHaveAttribute("data-media-state", "art");
  });

  it("renders the Gen.G crest", async () => {
    wrap(<TeamCrest name="Gen.G" shortCode="GEN" entityKey="Gen.G" />, ["Gen.G"], []);
    const img = await screen.findByRole("img", { name: "Gen.G" });
    expect(img.getAttribute("src")).toContain("assets/esports/teams/gen-g-");
  });

  it("renders the HLE crest", async () => {
    wrap(
      <TeamCrest name="Hanwha Life Esports" shortCode="HLE" entityKey="Hanwha Life Esports" />,
      ["Hanwha Life Esports"],
      [],
    );
    const img = await screen.findByRole("img", { name: "Hanwha Life Esports" });
    expect(img.getAttribute("src")).toContain("assets/esports/teams/hanwha-life-esports-");
  });

  it("never renders an external image URL", async () => {
    wrap(
      <>
        <TeamCrest name="T1" shortCode="T1" entityKey="T1" />
        <TeamCrest name="Gen.G" shortCode="GEN" entityKey="Gen.G" />
      </>,
      ["T1", "Gen.G"],
      [],
    );
    await screen.findByRole("img", { name: "T1" });
    for (const img of screen.getAllByRole("img")) {
      const src = img.getAttribute("src") ?? "";
      expect(src.startsWith(API)).toBe(true);
      expect(src).not.toMatch(/liquipedia|fandom|leaguepedia|lolesports|flickr/i);
    }
  });

  it("a crest contains rather than covers — a wordmark is never cropped", async () => {
    wrap(<TeamCrest name="T1" shortCode="T1" entityKey="T1" />, ["T1"], []);
    const img = await screen.findByRole("img", { name: "T1" });
    expect(img.className).toContain("object-contain");
  });
});

describe("the player-portrait hold", () => {
  //: The shipped rights decision: these three are known, fetched and fully
  //: provenanced, and deliberately not published.
  it.each(["Faker", "Chovy", "Zeus"])(
    "%s renders the monogram fallback, never a photograph",
    async (name) => {
      wrap(<PlayerPortrait name={name} entityKey={name} />, [], [name]);
      await waitFor(() => expect(fetchMock).toHaveBeenCalled());
      const slot = screen.getByTestId("player-portrait");
      expect(slot).toHaveAttribute("data-media-state", "placeholder");
      expect(slot.querySelector("img")).toBeNull();
      expect(slot).toHaveTextContent(monogram(name));
    },
  );

  it("a held player is indistinguishable on screen from an unknown one", async () => {
    // The REASONS differ — `no_approved_media` vs `unknown_entity` — and that
    // difference is for operators, never for the reader. Both draw a monogram.
    wrap(
      <>
        <PlayerPortrait name="Faker" entityKey="Faker" />
        <PlayerPortrait name="Knight" entityKey="Knight" />
      </>,
      [],
      ["Faker", "Knight"],
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const slots = screen.getAllByTestId("player-portrait");
    expect(slots).toHaveLength(2);
    for (const slot of slots) {
      expect(slot).toHaveAttribute("data-media-state", "placeholder");
      expect(slot.querySelector("img")).toBeNull();
    }
  });

  it("no quarantine path can reach the DOM even if one were served", async () => {
    // Belt and braces: the backend already refuses to emit an `assets_pending`
    // path, and if that ever regressed this is where it would surface.
    wrap(<PlayerPortrait name="Faker" entityKey="Faker" />, [], ["Faker"]);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(document.body.innerHTML).not.toContain("assets_pending");
  });
});

describe("fallbacks", () => {
  it("an entity with no approved media keeps its designed monogram", async () => {
    wrap(
      <TeamCrest name="Bilibili Gaming" shortCode="BLG" entityKey="Bilibili Gaming" />,
      ["Bilibili Gaming"],
      [],
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const slot = screen.getByTestId("team-crest");
    expect(slot).toHaveAttribute("data-media-state", "placeholder");
    expect(slot.querySelector("img")).toBeNull();
    expect(slot).toHaveTextContent("BLG");
  });

  it("an ambiguous bare handle draws a monogram, never a face", async () => {
    wrap(<PlayerPortrait name="Knight" entityKey="Knight" />, [], ["Knight"]);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const slot = screen.getByTestId("player-portrait");
    expect(slot).toHaveAttribute("data-media-state", "placeholder");
    expect(slot.querySelector("img")).toBeNull();
  });

  it("a failed request degrades to monograms rather than breaking the page", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("network down");
    }));
    wrap(<TeamCrest name="T1" shortCode="T1" entityKey="T1" />, ["T1"], []);
    await waitFor(() =>
      expect(screen.getByTestId("team-crest")).toHaveAttribute("data-media-state", "placeholder"),
    );
  });

  it("a slot rendered outside a provider still renders", () => {
    render(<TeamCrest name="T1" shortCode="T1" entityKey="T1" />);
    expect(screen.getByTestId("team-crest")).toHaveAttribute("data-media-state", "placeholder");
  });
});

describe("request shaping", () => {
  it("asks once for the whole screen, with each key sent once", async () => {
    wrap(
      <>
        <TeamCrest name="T1" shortCode="T1" entityKey="T1" />
        <TeamCrest name="T1" shortCode="T1" size="md" entityKey="T1" />
        <PlayerPortrait name="Faker" entityKey="Faker" />
      </>,
      ["T1", "T1"],
      ["Faker"],
    );
    await screen.findAllByRole("img", { name: "T1" });
    // The held portrait is still REQUESTED — the hold is the server's decision,
    // not something the client is allowed to pre-empt.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url.match(/team=T1/g)).toHaveLength(1);
    expect(url).toContain("player=Faker");
  });

  it("collects exactly the keys the board is about to draw", () => {
    expect(
      matchupMediaKeys({
        teams: { a: { team_key: "T1" }, b: { team_key: "Gen.G" } },
        lanes: [
          { a: { candidates: [{ player_lp_page: "Faker" }] }, b: { candidates: [{ player_lp_page: "Chovy" }] } },
        ],
      }),
    ).toEqual({ teams: ["T1", "Gen.G"], players: ["Faker", "Chovy"] });

    expect(
      matchupMediaKeys({
        sides: {
          a: { team: { team_key: "T1" }, player: { player_lp_page: "Faker" } },
          b: { team: { team_key: "Gen.G" }, player: null },
        },
      }),
    ).toEqual({ teams: ["T1", "Gen.G"], players: ["Faker"] });

    expect(matchupMediaKeys(null)).toEqual({ teams: [], players: [] });
  });
});
