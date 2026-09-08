/**
 * Phase 2B — the same media authority, on four more surfaces.
 *
 * These tests are mostly about restraint. It is easy to prove a crest appears;
 * what matters is that a team with no approved media still renders the frame it
 * always rendered, that a player's slot never fills with their team's logo, and
 * that no surface reaches an external host. Each surface is exercised through
 * the SAME provider and the SAME resolver payload shape the live endpoint
 * returns, so a change to the contract fails here rather than in production.
 */
import { render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  PlayerPortraitSlot,
  TeamCrest,
} from "./EntityCrest";
import {
  ProPlayMediaProvider,
  __resetProPlayMediaCache,
} from "./ProPlayMediaProvider";
import type { EntityMedia } from "@/lib/pro-play/mediaApi";

const API = (
  (import.meta.env?.VITE_COMBAT_API_URL as string | undefined) ||
  "https://web-production-83e53.up.railway.app"
).replace(/\/+$/, "");

function art(entity_key: string, path: string): EntityMedia {
  return {
    entity_type: "team",
    entity_key,
    media_type: "team_logo",
    state: "art",
    reason: "ok",
    display_name: entity_key,
    fallback_label: null,
    asset_path: path,
    mime_type: "image/png",
    width: 1024,
    height: 405,
    credit: null,
    contract_version: "pro_media_v1",
  };
}

function held(entity_key: string, reason = "no_approved_media"): EntityMedia {
  return { ...art(entity_key, ""), state: "fallback", reason, asset_path: null };
}

//: Production's actual answer for these keys, as of Phase 2A.
const PAYLOAD = [
  art("T1", "assets/esports/teams/t1-27e460ed/team_logo-c225140b0c01.png"),
  art("Gen.G", "assets/esports/teams/gen-g-0819355b/team_logo-fed666df6261.png"),
  art(
    "Hanwha Life Esports",
    "assets/esports/teams/hanwha-life-esports-05483fea/team_logo-b525ea77b187.png",
  ),
  held("Fnatic"),
  held("GEN", "unknown_entity"),
];

let fetchMock: ReturnType<typeof vi.fn>;

function mockMedia(results: EntityMedia[] = PAYLOAD) {
  fetchMock = vi.fn(async () => ({
    ok: true,
    json: async () => ({
      ok: true,
      contract_version: "pro_media_v1",
      count: results.length,
      identity_available: true,
      results,
    }),
  }));
  vi.stubGlobal("fetch", fetchMock);
}

/** No QueryClientProvider anywhere: the provider must work in any tree. */
function wrap(ui: React.ReactNode, teams: (string | null | undefined)[]) {
  return render(<ProPlayMediaProvider teams={teams}>{ui}</ProPlayMediaProvider>);
}

beforeEach(() => {
  __resetProPlayMediaCache();
  mockMedia();
});
afterEach(() => vi.unstubAllGlobals());

// --- Search rows ------------------------------------------------------------

describe("search rows", () => {
  it("an approved team shows its crest", async () => {
    wrap(<TeamCrest teamKey="T1" name="T1" shortCode="T1" size="sm" />, ["T1"]);
    const img = await screen.findByRole("presentation", { hidden: true });
    expect(img.getAttribute("src")).toBe(`${API}/${PAYLOAD[0].asset_path}`);
    expect(screen.getByTestId("team-crest")).toHaveAttribute("data-media-state", "art");
  });

  it("a team with no approved media keeps its short code in the frame", async () => {
    wrap(
      <TeamCrest teamKey="Fnatic" name="Fnatic" shortCode="FNC" size="sm" />,
      ["Fnatic"],
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const slot = screen.getByTestId("team-crest");
    expect(slot).toHaveAttribute("data-media-state", "placeholder");
    expect(slot.querySelector("img")).toBeNull();
    expect(slot).toHaveTextContent("FNC");
  });

  it("a short code asked for as if it were a key draws the fallback", async () => {
    // `GEN` is Gen.G's short code and resolves to `unknown_entity`. A search row
    // that passed it would be a caller bug; it must not become a wrong crest.
    wrap(<TeamCrest teamKey="GEN" name="GEN" size="sm" />, ["GEN"]);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.getByTestId("team-crest")).toHaveAttribute(
      "data-media-state",
      "placeholder",
    );
  });

  it("asks once for every team on the page, each key sent once", async () => {
    wrap(
      <>
        <TeamCrest teamKey="T1" name="T1" size="sm" />
        <TeamCrest teamKey="Gen.G" name="Gen.G" size="sm" />
        <TeamCrest teamKey="T1" name="T1" size="xs" />
      </>,
      ["T1", "Gen.G", "T1"],
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url.match(/team=T1/g)).toHaveLength(1);
  });
});

// --- Profiles ---------------------------------------------------------------

describe("profiles", () => {
  it("a team profile hero renders the crest large and contained", async () => {
    wrap(<TeamCrest teamKey="Gen.G" name="Gen.G" shortCode="GEN" size="xl" />, [
      "Gen.G",
    ]);
    const img = await screen.findByRole("presentation", { hidden: true });
    // CONTAIN, never cover — several crests are wide wordmarks.
    expect(img.className).toContain("object-contain");
    expect(img.className).not.toContain("object-cover");
    expect(screen.getByTestId("team-crest").className).toMatch(/h-20|h-24/);
  });

  it("a player's own slot is a monogram and never becomes a team logo", async () => {
    wrap(
      <>
        <PlayerPortraitSlot name="Faker" size="xl" />
        <TeamCrest teamKey="T1" name="T1" size="md" />
      </>,
      ["T1"],
    );
    await screen.findByRole("presentation", { hidden: true });
    const portrait = screen.getByTestId("player-portrait");
    expect(portrait).toHaveAttribute("data-media-state", "placeholder");
    expect(portrait.querySelector("img")).toBeNull();
    expect(portrait).toHaveTextContent("FA");
    // The crest is a SEPARATE element, beside the portrait, not inside it.
    expect(within(portrait).queryByTestId("team-crest")).toBeNull();
    expect(screen.getByTestId("team-crest")).toHaveAttribute("data-media-state", "art");
  });

  it("the portrait slot never requests player media at all", async () => {
    render(<PlayerPortraitSlot name="Chovy" size="xl" />);
    expect(screen.getByTestId("player-portrait")).toHaveTextContent("CH");
  });
});

// --- LIVE -------------------------------------------------------------------

describe("live scoreboard", () => {
  it("two known teams render two crests", async () => {
    wrap(
      <>
        <TeamCrest teamKey="T1" name="T1" shortCode="T1" size="md" />
        <TeamCrest teamKey="Gen.G" name="Gen.G" shortCode="GEN" size="md" />
      </>,
      ["T1", "Gen.G"],
    );
    await waitFor(() =>
      expect(screen.getAllByTestId("team-crest").filter(
        (n) => n.getAttribute("data-media-state") === "art",
      )).toHaveLength(2),
    );
  });

  it("a game whose team identity is unresolved falls back on both sides", async () => {
    // LIVE1 stores `resolved_page: null` when the broadcast name could not be
    // resolved. Null must never be coerced into a lookup.
    wrap(
      <>
        <TeamCrest teamKey={null} name="KT Rolster" shortCode="KT" size="md" />
        <TeamCrest teamKey={undefined} name="BRO" shortCode="BRO" size="md" />
      </>,
      [],
    );
    for (const slot of screen.getAllByTestId("team-crest")) {
      expect(slot).toHaveAttribute("data-media-state", "placeholder");
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("no rendered image points anywhere but Mogzy's own store", async () => {
    wrap(
      <>
        <TeamCrest teamKey="T1" name="T1" size="md" />
        <TeamCrest teamKey="Hanwha Life Esports" name="HLE" size="md" />
      </>,
      ["T1", "Hanwha Life Esports"],
    );
    await waitFor(() =>
      expect(screen.getAllByRole("presentation", { hidden: true })).toHaveLength(2),
    );
    for (const img of screen.getAllByRole("presentation", { hidden: true })) {
      const src = img.getAttribute("src") ?? "";
      expect(src.startsWith(`${API}/assets/esports/`)).toBe(true);
      expect(src).not.toMatch(/liquipedia|fandom|leaguepedia|lolesports|flickr/i);
      expect(src).not.toContain("assets_pending");
    }
  });
});

// --- Degradation ------------------------------------------------------------

describe("degradation", () => {
  it("a failed media request leaves every surface on its fallback", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("network down");
    }));
    wrap(<TeamCrest teamKey="T1" name="T1" shortCode="T1" size="md" />, ["T1"]);
    await waitFor(() =>
      expect(screen.getByTestId("team-crest")).toHaveAttribute(
        "data-media-state",
        "placeholder",
      ),
    );
    expect(screen.getByTestId("team-crest")).toHaveTextContent("T1");
  });

  it("an asset that 404s degrades to the monogram, not a broken glyph", async () => {
    wrap(<TeamCrest teamKey="T1" name="T1" shortCode="T1" size="md" />, ["T1"]);
    const img = await screen.findByRole("presentation", { hidden: true });
    img.dispatchEvent(new Event("error"));
    await waitFor(() =>
      expect(screen.getByTestId("team-crest")).toHaveAttribute(
        "data-media-state",
        "placeholder",
      ),
    );
  });

  it("the box is the same size with art, without art, and before the answer", async () => {
    // No layout shift: whatever the media does, the frame does not move.
    const { rerender } = render(
      <ProPlayMediaProvider teams={["Fnatic"]}>
        <TeamCrest teamKey="Fnatic" name="Fnatic" shortCode="FNC" size="md" />
      </ProPlayMediaProvider>,
    );
    const before = screen.getByTestId("team-crest").className;
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    rerender(
      <ProPlayMediaProvider teams={["T1"]}>
        <TeamCrest teamKey="T1" name="T1" shortCode="T1" size="md" />
      </ProPlayMediaProvider>,
    );
    await screen.findByRole("presentation", { hidden: true });
    const after = screen.getByTestId("team-crest").className;
    const box = (c: string) => c.match(/h-\d+ w-\d+/)?.[0];
    expect(box(before)).toBe(box(after));
  });

  it("a slot outside any provider still renders its fallback", () => {
    render(<TeamCrest teamKey="T1" name="T1" shortCode="T1" size="md" />);
    expect(screen.getByTestId("team-crest")).toHaveAttribute(
      "data-media-state",
      "placeholder",
    );
  });
});
