/**
 * ROG1-D1 — rarity frames. Rarity is a display label from the catalog; the
 * simulation never reads it, so the styling must never suggest strength.
 */
const RARITY: Record<string, { ring: string; chip: string; glow: string }> = {
  common: { ring: "border-slate-400/30", chip: "bg-slate-400/15 text-slate-200", glow: "from-slate-300/10" },
  rare: { ring: "border-sky-400/45", chip: "bg-sky-400/15 text-sky-200", glow: "from-sky-400/15" },
  epic: { ring: "border-violet-400/50", chip: "bg-violet-400/15 text-violet-200", glow: "from-violet-400/20" },
  legendary: { ring: "border-[#e3c66f]/60", chip: "bg-[#e3c66f]/15 text-[#f1dc95]", glow: "from-[#e3c66f]/25" },
};
export const rarityStyle = (r: string) => RARITY[r] ?? RARITY.common;
