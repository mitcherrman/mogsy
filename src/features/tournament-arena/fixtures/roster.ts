/**
 * FIXTURE entrants for the Tournament Arena prototype. Invented names, no
 * real accounts; every id is prefixed `fx_` so it can never be mistaken for a
 * `profiles.id`. The viewer in every scenario is `fx_you`.
 */
import type { ArenaEntrant, ArenaRoleEmblem } from "../contracts";

export const VIEWER_ID = "fx_you";

interface Seed {
  id: string;
  name: string;
  role: ArenaRoleEmblem | null;
  tier: string | null;
}

const ROSTER: readonly Seed[] = [
  { id: "fx_you", name: "You", role: "mid", tier: "gold" },
  { id: "fx_aurelion", name: "Aurelion Sage", role: "mid", tier: "diamond" },
  { id: "fx_kindred", name: "KindredMark", role: "jungle", tier: "challenger" },
  { id: "fx_vayne", name: "vayne_main", role: "adc", tier: "gold" },
  { id: "fx_thresh", name: "LanternKeeper", role: "support", tier: "silver" },
  { id: "fx_sett", name: "Sett Boss", role: "top", tier: "bronze" },
  { id: "fx_orianna", name: "Clockwork", role: "mid", tier: "diamond" },
  { id: "fx_leesin", name: "BlindMonk", role: "jungle", tier: "gold" },
  { id: "fx_jinx", name: "Pow-Pow", role: "adc", tier: "silver" },
  { id: "fx_nami", name: "TidecallerN", role: "support", tier: "gold" },
  { id: "fx_garen", name: "DemaciaSpin", role: "top", tier: "bronze" },
  { id: "fx_ahri", name: "Ninetails", role: "mid", tier: "challenger" },
  { id: "fx_elise", name: "SpiderQueen", role: "jungle", tier: "silver" },
  { id: "fx_caitlyn", name: "Sheriff", role: "adc", tier: "diamond" },
  { id: "fx_lulu", name: "Pix", role: "support", tier: "bronze" },
  { id: "fx_fiora", name: "GrandDuelist", role: "top", tier: "gold" },
  { id: "fx_zed", name: "Shadowstep", role: "mid", tier: "silver" },
  { id: "fx_nidalee", name: "Spearcat", role: "jungle", tier: "gold" },
  { id: "fx_ezreal", name: "ArcaneShift", role: "adc", tier: "challenger" },
  { id: "fx_leona", name: "Daybreak", role: "support", tier: "diamond" },
  { id: "fx_darius", name: "Dunkmaster", role: "top", tier: "silver" },
  { id: "fx_syndra", name: "DarkSphere", role: "mid", tier: "gold" },
  { id: "fx_graves", name: "Cigar", role: "jungle", tier: "bronze" },
  { id: "fx_kaisa", name: "VoidDaughter", role: "adc", tier: "gold" },
  { id: "fx_rakan", name: "Charm", role: "support", tier: "silver" },
  { id: "fx_camille", name: "Hextech Hook", role: "top", tier: "diamond" },
  { id: "fx_yasuo", name: "Hasagi", role: null, tier: null },
  { id: "fx_viego", name: "RuinedKing", role: "jungle", tier: "gold" },
  { id: "fx_lucian", name: "Purifier", role: "adc", tier: "silver" },
  { id: "fx_janna", name: "Zephyr", role: "support", tier: "gold" },
  { id: "fx_ornn", name: "Forgemaster", role: "top", tier: "challenger" },
  { id: "fx_lux", name: "Final Spark", role: null, tier: "bronze" },
];

export function fixtureEntrants(count: number, organizer = VIEWER_ID): ArenaEntrant[] {
  return ROSTER.slice(0, count).map((s, i) => ({
    profile_id: s.id,
    display_name: s.name,
    seed: i + 1,
    status: "joined",
    role: s.id === organizer ? "organizer" : "player",
    role_emblem: s.role,
    tier: s.tier,
  }));
}

/** The viewer's friends, for the Host Portal invite picker. */
export function fixtureFriends(): ArenaEntrant[] {
  return ROSTER.slice(1, 20).map((s) => ({
    profile_id: s.id,
    display_name: s.name,
    seed: null,
    status: "invited",
    role: "player",
    role_emblem: s.role,
    tier: s.tier,
  }));
}
