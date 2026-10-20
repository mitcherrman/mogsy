import type { PatchEditorialDirection, PatchEditorialSource } from "@/lib/patch-reports/api";
import type { EditorialResolution } from "@/lib/patch-reports/report-structure";

/** Words for the backend's editorial direction and its provenance. Never a local guess. */
export const DIRECTION_WORD: Record<PatchEditorialDirection, string> = {
  buff: "Buff",
  nerf: "Nerf",
  adjustment: "Adjustment",
};

export const SOURCE_WORD: Record<PatchEditorialSource, string> = {
  riot_section: "Riot's own section",
  riot_text_semantic: "Riot's patch text",
  riot_patch_highlights: "Riot's patch highlights",
  mogzy_inferred: "inferred by Mogzy",
};

/** `data-direction` value for a card: the backend claim or none. */
export const directionAttr = (editorial: EditorialResolution): string => editorial.direction ?? "none";

/** One sentence naming where the direction claim comes from. */
export function directionProvenance(editorial: EditorialResolution): string | null {
  if (!editorial.direction) return null;
  const word = DIRECTION_WORD[editorial.direction].toLowerCase();
  if (!editorial.source) return `Classified as a ${word} by the Patch Hub backend.`;
  if (editorial.inferred) return `Mogzy inferred "${word}" from the numbers; Riot did not classify this entry.`;
  return `Classified as a ${word} from ${SOURCE_WORD[editorial.source]}.`;
}
