import { Badge } from "@/components/ui/badge";
import { Megaphone } from "lucide-react";

/**
 * Static ads/Premium education. Renders NO ad component, calls no ad service,
 * imports no ad policy or Premium state, and offers no purchase action.
 *
 * The component name and `data-testid` keep the `Pro`/`pro` spelling; they are
 * the tutorial machine's step identity, not user-facing copy.
 */
export function AdsProEducationPanel() {
  return (
    <section
      aria-label="Ads and Premium"
      data-testid="ads-pro-panel"
      className="rounded-xl border-2 border-border bg-card p-4 space-y-3"
    >
      <div className="flex items-center gap-2">
        <Megaphone className="h-4 w-4" aria-hidden />
        <h3 className="text-sm font-bold">Ads and Premium</h3>
        <Badge variant="secondary" className="text-[10px]">
          Informational only
        </Badge>
      </div>
      <ul className="text-sm space-y-1 list-disc pl-5" data-testid="ads-pro-facts">
        <li>Free players may see ads around Ranked.</li>
        <li>Ads should not cover active timed gameplay.</li>
        <li>Ad behavior is part of alpha testing.</li>
        <li>Premium removes ads.</li>
      </ul>
      <div
        className="rounded-lg border-2 border-dashed border-border p-4 text-center text-xs text-muted-foreground"
        data-testid="ad-placeholder"
        aria-hidden
      >
        Example ad area — not a live ad
      </div>
    </section>
  );
}
