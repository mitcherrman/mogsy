export interface MockProfile {
  id: string;
  displayName: string;
  age: number;
  location: string;
  statusMessage: string;
  avatarUrl: string;
  socials: {
    instagram?: string;
    tiktok?: string;
    youtube?: string;
    x?: string;
    twitch?: string;
    website?: string;
  };
  elo: number;
  tier: "bronze" | "silver" | "gold" | "diamond" | "unranked";
}

export interface MockLeague {
  id: string;
  name: string;
  type: "user" | "preset";
  isSystem: boolean;
  memberCount: number;
  description?: string;
}

export interface MockPresetItem {
  id: string;
  leagueId: string;
  name: string;
  imageUrl: string;
  externalLink?: string;
  elo: number;
}

const avatarBase = "https://api.dicebear.com/9.x/avataaars/svg?seed=";

export const mockProfiles: MockProfile[] = [
  {
    id: "1",
    displayName: "NeonViper",
    age: 24,
    location: "Los Angeles, CA",
    statusMessage: "Coming for that #1 spot 🔥",
    avatarUrl: `${avatarBase}NeonViper`,
    socials: { instagram: "neonviper", twitch: "neonviper" },
    elo: 1650,
    tier: "diamond",
  },
  {
    id: "2",
    displayName: "CrystalFox",
    age: 22,
    location: "Tokyo, Japan",
    statusMessage: "✨ Sparkle and conquer",
    avatarUrl: `${avatarBase}CrystalFox`,
    socials: { instagram: "crystalfox", tiktok: "crystalfox" },
    elo: 1520,
    tier: "diamond",
  },
  {
    id: "3",
    displayName: "ShadowKing",
    age: 28,
    location: "London, UK",
    statusMessage: "The crown is mine.",
    avatarUrl: `${avatarBase}ShadowKing`,
    socials: { x: "shadowking", youtube: "shadowking" },
    elo: 1430,
    tier: "gold",
  },
  {
    id: "4",
    displayName: "LunarEcho",
    age: 20,
    location: "Seoul, Korea",
    statusMessage: "Moon child 🌙",
    avatarUrl: `${avatarBase}LunarEcho`,
    socials: { instagram: "lunarecho", tiktok: "lunarecho" },
    elo: 1380,
    tier: "gold",
  },
  {
    id: "5",
    displayName: "BlazeTitan",
    age: 26,
    location: "Miami, FL",
    statusMessage: "Heat check 🏀",
    avatarUrl: `${avatarBase}BlazeTitan`,
    socials: { twitch: "blazetitan" },
    elo: 1290,
    tier: "silver",
  },
  {
    id: "6",
    displayName: "ArcticWolf",
    age: 23,
    location: "Stockholm, Sweden",
    statusMessage: "Cold and calculated ❄️",
    avatarUrl: `${avatarBase}ArcticWolf`,
    socials: { instagram: "arcticwolf", x: "arcticwolf" },
    elo: 1240,
    tier: "silver",
  },
  {
    id: "7",
    displayName: "PhoenixRise",
    age: 25,
    location: "Berlin, Germany",
    statusMessage: "Rising from the ashes 🔥",
    avatarUrl: `${avatarBase}PhoenixRise`,
    socials: { youtube: "phoenixrise" },
    elo: 1150,
    tier: "silver",
  },
  {
    id: "8",
    displayName: "StormChaser",
    age: 21,
    location: "Sydney, Australia",
    statusMessage: "Chasing the eye of the storm ⛈️",
    avatarUrl: `${avatarBase}StormChaser`,
    socials: { tiktok: "stormchaser" },
    elo: 1050,
    tier: "bronze",
  },
  {
    id: "9",
    displayName: "MysticRaven",
    age: 27,
    location: "Paris, France",
    statusMessage: "Mystère et élégance",
    avatarUrl: `${avatarBase}MysticRaven`,
    socials: { instagram: "mysticraven" },
    elo: 980,
    tier: "bronze",
  },
  {
    id: "10",
    displayName: "CosmicDust",
    age: 19,
    location: "Toronto, Canada",
    statusMessage: "Stardust in my veins ✨",
    avatarUrl: `${avatarBase}CosmicDust`,
    socials: { tiktok: "cosmicdust", instagram: "cosmicdust" },
    elo: 1320,
    tier: "gold",
  },
];

export const mockLeagues: MockLeague[] = [
  { id: "global", name: "Global Rankings", type: "user", isSystem: true, memberCount: 12847 },
  { id: "na", name: "North America", type: "user", isSystem: true, memberCount: 4521 },
  { id: "eu", name: "Europe", type: "user", isSystem: true, memberCount: 3892 },
  { id: "asia", name: "Asia Pacific", type: "user", isSystem: true, memberCount: 4434 },
];

export const presetCategories = [
  { id: "restaurants", name: "Best Restaurant", icon: "🍽️", itemCount: 50 },
  { id: "fastfood", name: "Best Fast Food", icon: "🍔", itemCount: 30 },
  { id: "movies2025", name: "Best Movie of 2025", icon: "🎬", itemCount: 40 },
  { id: "moviesalltime", name: "Best Movie of All Time", icon: "🏆", itemCount: 100 },
  { id: "celebrity", name: "Best Celebrity", icon: "⭐", itemCount: 80 },
  { id: "cars", name: "Best Car", icon: "🏎️", itemCount: 45 },
  { id: "anime", name: "Best Anime", icon: "🎌", itemCount: 60 },
];

export const mockPresetItems: MockPresetItem[] = [
  { id: "m1", leagueId: "movies2025", name: "Thunderbolt", imageUrl: `${avatarBase}movie1`, elo: 1450 },
  { id: "m2", leagueId: "movies2025", name: "Eclipse Rising", imageUrl: `${avatarBase}movie2`, elo: 1380 },
  { id: "m3", leagueId: "movies2025", name: "Neon Horizon", imageUrl: `${avatarBase}movie3`, elo: 1320 },
  { id: "m4", leagueId: "movies2025", name: "Silent Depths", imageUrl: `${avatarBase}movie4`, elo: 1290 },
  { id: "r1", leagueId: "restaurants", name: "Nobu", imageUrl: `${avatarBase}nobu`, elo: 1500 },
  { id: "r2", leagueId: "restaurants", name: "Eleven Madison Park", imageUrl: `${avatarBase}emp`, elo: 1480 },
  { id: "f1", leagueId: "fastfood", name: "In-N-Out Burger", imageUrl: `${avatarBase}innout`, elo: 1550 },
  { id: "f2", leagueId: "fastfood", name: "Chick-fil-A", imageUrl: `${avatarBase}chickfila`, elo: 1520 },
];

// Absolute Elo-based tiers (used for preset/collection leagues)
export function getTierFromElo(elo: number): "bronze" | "silver" | "gold" | "diamond" {
  if (elo >= 1500) return "diamond";
  if (elo >= 1300) return "gold";
  if (elo >= 1100) return "silver";
  return "bronze";
}

// Percentile-based tiers (used for compete/user leagues)
export interface TierConfig {
  name: string;
  min_percentile: number;
  max_percentile: number;
}

export const DEFAULT_TIER_CONFIG: TierConfig[] = [
  { name: "unranked", min_percentile: 0, max_percentile: 60 },
  { name: "bronze", min_percentile: 60, max_percentile: 75 },
  { name: "silver", min_percentile: 75, max_percentile: 90 },
  { name: "gold", min_percentile: 90, max_percentile: 99 },
  { name: "diamond", min_percentile: 99, max_percentile: 100 },
];

export function getTierFromPercentile(
  rankIndex: number,
  total: number,
  tierConfig: TierConfig[] = DEFAULT_TIER_CONFIG
): string {
  if (total <= 0) return "unranked";
  // rankIndex is 0-based, 0 = best
  const percentile = ((total - rankIndex) / total) * 100;
  // Find matching tier (check from highest to lowest)
  const sorted = [...tierConfig].sort((a, b) => b.min_percentile - a.min_percentile);
  for (const tier of sorted) {
    if (percentile >= tier.min_percentile && percentile <= tier.max_percentile) {
      return tier.name;
    }
  }
  return "unranked";
}

export function getTierColor(tier: string): string {
  switch (tier) {
    case "diamond": return "text-tier-diamond";
    case "platinum": return "text-tier-platinum";
    case "gold": return "text-tier-gold";
    case "silver": return "text-tier-silver";
    case "bronze": return "text-tier-bronze";
    case "unranked": return "text-muted-foreground";
    default: return "text-muted-foreground";
  }
}

export function getTierBgColor(tier: string): string {
  switch (tier) {
    case "diamond": return "bg-tier-diamond/20 border-tier-diamond/40";
    case "platinum": return "bg-tier-platinum/20 border-tier-platinum/40";
    case "gold": return "bg-tier-gold/20 border-tier-gold/40";
    case "silver": return "bg-tier-silver/20 border-tier-silver/40";
    case "bronze": return "bg-tier-bronze/20 border-tier-bronze/40";
    case "unranked": return "bg-muted/30 border-border";
    default: return "bg-muted border-border";
  }
}

export function getTierRowBg(tier: string): string {
  switch (tier) {
    case "diamond": return "bg-tier-diamond/10 border-l-2 border-l-tier-diamond";
    case "gold": return "bg-tier-gold/10 border-l-2 border-l-tier-gold";
    case "silver": return "bg-tier-silver/10 border-l-2 border-l-tier-silver";
    case "bronze": return "bg-tier-bronze/10 border-l-2 border-l-tier-bronze";
    default: return "";
  }
}

export function getTierIcon(tier: string): string {
  switch (tier) {
    case "diamond": return "💎";
    case "gold": return "🥇";
    case "silver": return "🥈";
    case "bronze": return "🥉";
    default: return "";
  }
}
