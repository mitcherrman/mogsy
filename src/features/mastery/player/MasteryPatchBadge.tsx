/**
 * Compact patch badge (G5.2B). Renders the backend-provided patch display string
 * verbatim — no patch value is derived or computed here.
 */
import { Badge } from "@/components/ui/badge";

export function MasteryPatchBadge({ patchDisplay }: { patchDisplay: string }) {
  return (
    <Badge
      variant="outline"
      data-testid="mastery-patch-badge"
      className="whitespace-normal text-[10px] font-medium"
    >
      {patchDisplay}
    </Badge>
  );
}
