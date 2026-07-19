/**
 * Compact patch badge (G5.2B; J1 player-safe pass). Shows a single clear patch
 * label (e.g. "Patch 26.13") derived from the backend patch string — never the
 * internal "Mixed verified snapshot" wording.
 */
import { Badge } from "@/components/ui/badge";
import { patchLabel } from "./playerFormat";

export function MasteryPatchBadge({ patchDisplay }: { patchDisplay: string }) {
  return (
    <Badge
      variant="outline"
      data-testid="mastery-patch-badge"
      className="whitespace-normal text-[10px] font-medium"
    >
      {patchLabel(patchDisplay)}
    </Badge>
  );
}
