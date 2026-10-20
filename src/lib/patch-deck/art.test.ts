import { describe, expect, it } from "vitest";
import type { ChampionManifest } from "@/hooks/useChampionAssets";
import type { PatchReportCard, PatchReportDetail } from "@/lib/patch-reports/api";
import report2620 from "./fixtures/report-26.20.json";
import { championKeyFor, indexManifestFolders, resolveDeckArt } from "./art";

const detail = report2620 as unknown as PatchReportDetail;

const manifest: ChampionManifest = {
  champions: {
    "K'Sante": {
      icon: "assets/champions/KSante/icon.png",
      splash: "assets/champions/KSante/splash/0_default.jpg",
      loading: "assets/champions/KSante/loading/0_default.jpg",
      cutout: "",
    },
    Bard: {
      icon: "assets/champions/Bard/icon.png",
      splash: "assets/champions/Bard/splash/0_default.jpg",
      loading: "assets/champions/Bard/loading/0_default.jpg",
      cutout: "",
    },
  },
};
const folders = indexManifestFolders(manifest);
const card = (name: string, section: string) =>
  detail.cards.find((c) => c.entity_name === name && c.section_title === section) as PatchReportCard;

describe("deck art", () => {
  it("indexes manifest folders from the manifest's own paths", () => {
    expect(folders.get("ksante")).toBe("K'Sante");
    expect(folders.get("bard")).toBe("Bard");
    expect(indexManifestFolders(null).size).toBe(0);
  });

  it("resolves a Summoner's Rift champion by catalog ref", () => {
    const art = resolveDeckArt(card("K'Sante", "Champions"), manifest, folders);
    expect(art.champion).toBe("K'Sante");
    expect(art.splash).toMatch(/\/assets\/champions\/KSante\/splash\/0_default\.jpg$/);
    expect(art.loading).toMatch(/\/assets\/champions\/KSante\/loading\/0_default\.jpg$/);
    expect(art.icon).toMatch(/\/assets\/champions\/KSante\/icon\.png$/);
  });

  it("resolves a mode entity through the report's own image folder, never the display name", () => {
    const bard = card("Bard", "ARAM: Mayhem");
    expect(bard.entity_type).toBe("system");
    expect(bard.mogzy_entity_ref).toBeNull();
    expect(championKeyFor(bard, manifest, folders)).toBe("Bard");
    expect(resolveDeckArt(bard, manifest, folders).splash).toMatch(/Bard\/splash/);
    // Same name, no folder: no art is invented.
    expect(championKeyFor({ entity_type: "system", mogzy_entity_ref: null, mogzy_image_path: null }, manifest, folders)).toBeNull();
  });

  it("gives items and prose sections the report's icon only", () => {
    const rocketbelt = resolveDeckArt(card("Hextech Rocketbelt", "Items"), manifest, folders);
    expect(rocketbelt.champion).toBeNull();
    expect(rocketbelt.splash).toBeNull();
    expect(rocketbelt.icon).toMatch(/\/assets\/items\/3152\.png$/);
    const replays = resolveDeckArt(card("Private Replays", "Private Replays"), manifest, folders);
    expect(replays).toEqual({ splash: null, loading: null, icon: null, champion: null });
  });

  it("falls back to the report image when the manifest lacks the champion", () => {
    const diana = resolveDeckArt(card("Diana", "Champions"), manifest, folders);
    expect(diana.champion).toBeNull();
    expect(diana.splash).toBeNull();
    expect(diana.icon).toMatch(/\/assets\/champions\/Diana\/icon\.png$/);
  });
});
