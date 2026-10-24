/** Official MOGZY public channels. Keep all placements sourced from here. */
export const OFFICIAL_SOCIALS = [
  { id: "youtube", label: "YouTube", href: "https://www.youtube.com/@MogzydotLoL" },
  { id: "tiktok", label: "TikTok", href: "https://www.tiktok.com/@mitcherrmanlol" },
  { id: "instagram", label: "Instagram", href: "https://www.instagram.com/mogzy.lol/" },
  { id: "x", label: "X", href: "https://x.com/mogzylol" },
  { id: "facebook", label: "Facebook", href: "https://www.facebook.com/mogzy.lol" },
  { id: "discord", label: "Discord", href: "https://discord.gg/gbHqKSUEh" },
] as const;

export type OfficialSocialId = (typeof OFFICIAL_SOCIALS)[number]["id"];
