/**
 * Regenerate `src/data/championAbilityIcons.ts` from the Mogzy champion asset
 * store.
 *
 * Ability icons are stored per champion as
 * `assets/champions/<folder>/<SLOT>_<riotSpellKey>.png` (plus a single
 * `passive.png`). The spell key is Riot's internal name and is *not* derivable
 * from the champion name — `Lux` ships `Q_LuxLightBinding.png`, `Wukong` lives
 * under `MonkeyKing`. The asset manifest served at `/api/assets/champions` only
 * exposes icon/splash/loading/cutout, so the filenames are baked into a static
 * map here rather than discovered at runtime.
 *
 * The manifest's `folder` field is also unreliable on a case-sensitive host
 * (it reports `KaiSa`/`ChoGath` for directories actually named `Kaisa`/
 * `Chogath`), so the folder recorded here is the real on-disk directory,
 * matched case-insensitively.
 *
 * Usage:
 *   npx tsx scripts/generate-ability-icon-map.ts \
 *     --assets ../League_Combat_Simulator/assets \
 *     [--api https://web-production-83e53.up.railway.app]
 */
import { readdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const SLOTS = ["Q", "W", "E", "R"] as const;
const OUT = resolve(import.meta.dirname, "../src/data/championAbilityIcons.ts");

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

/** Mirrors `champion_asset_name` in the backend's routes/meta.py. */
function assetFolderGuess(name: string): string {
  if (name === "Wukong") return "MonkeyKing";
  return name.replace(/ /g, "").replace(/'/g, "").replace(/\./g, "");
}

function normalize(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

async function main() {
  const assetsRoot = resolve(arg("assets", "../League_Combat_Simulator/assets"));
  const apiBase = arg("api", "https://web-production-83e53.up.railway.app").replace(/\/+$/, "");
  const championsRoot = join(assetsRoot, "champions");

  const res = await fetch(`${apiBase}/api/meta/champions`, {
    headers: { accept: "application/json" },
  });
  if (!res.ok) throw new Error(`GET /api/meta/champions failed: ${res.status}`);
  const names: string[] = (await res.json()).champions ?? [];
  if (names.length === 0) throw new Error("champion list came back empty");

  const dirs = new Map<string, string>();
  for (const entry of readdirSync(championsRoot)) {
    if (statSync(join(championsRoot, entry)).isDirectory()) dirs.set(entry.toLowerCase(), entry);
  }

  const rows: string[] = [];
  const skipped: string[] = [];
  for (const name of [...names].sort((a, b) => a.localeCompare(b))) {
    const folder =
      dirs.get(assetFolderGuess(name).toLowerCase()) ?? dirs.get(normalize(name)) ?? null;
    if (!folder) {
      skipped.push(`${name} (no asset directory)`);
      continue;
    }
    const files = readdirSync(join(championsRoot, folder));
    const keys: Partial<Record<(typeof SLOTS)[number], string>> = {};
    for (const slot of SLOTS) {
      const hit = files
        .filter((f) => f.startsWith(`${slot}_`) && f.endsWith(".png"))
        .sort()[0];
      if (hit) keys[slot] = hit.slice(slot.length + 1, -".png".length);
    }
    const missing = SLOTS.filter((s) => !keys[s]);
    if (missing.length > 0) {
      skipped.push(`${name} (missing ${missing.join("/")})`);
      continue;
    }
    const fields = SLOTS.map((s) => `${s}: ${JSON.stringify(keys[s])}`).join(", ");
    rows.push(`  ${JSON.stringify(name)}: { folder: ${JSON.stringify(folder)}, ${fields} },`);
  }

  const file = `/**
 * Champion ability icon filenames in the Mogzy champion asset store.
 *
 * GENERATED — do not edit by hand. Regenerate with:
 *   npx tsx scripts/generate-ability-icon-map.ts --assets <path-to>/assets
 *
 * Each entry names the real on-disk asset directory plus the Riot spell key for
 * every castable slot; the served path is
 * \`assets/champions/<folder>/<SLOT>_<key>.png\` (and \`passive.png\` for P).
 * See scripts/generate-ability-icon-map.ts for why these cannot be derived.
 */

export type CastableAbilitySlot = "Q" | "W" | "E" | "R";

export type ChampionAbilityIconEntry = {
  /** Directory name under \`assets/champions\` as it exists on the asset host. */
  folder: string;
} & Record<CastableAbilitySlot, string>;

export const CHAMPION_ABILITY_ICON_FILES: Record<string, ChampionAbilityIconEntry> = {
${rows.join("\n")}
};
`;

  writeFileSync(OUT, file, "utf8");
  console.log(`wrote ${rows.length} champions to ${OUT}`);
  if (skipped.length > 0) console.log(`skipped:\n  ${skipped.join("\n  ")}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
