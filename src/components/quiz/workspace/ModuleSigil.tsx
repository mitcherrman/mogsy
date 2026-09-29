/**
 * HUB6.2 — the drawn mark for a MODULE round that carries no entity art.
 *
 * A Mastery slice asks several generated questions about one worked topic;
 * its frozen review publishes a generic icon hint (no entity, on purpose), so
 * until now its tile fell through to the "no picture" question mark — which,
 * enlarged in History's stage analytics, read as unfinished rather than as a
 * module. The round's KIND is authoritative (`ReviewRound.kind`), so it earns
 * a deliberate sigil of its own: stacked layers, one module of several
 * questions. Meta Reflex keeps its existing drawn mark (the bolt).
 *
 * Never entity art: a champion or item picture is shown only when the
 * backend proved it (`iconHint.icon`); a sigil claims nothing about subject.
 */
import { ArrowDownUp, Layers, Zap } from "lucide-react";
import { LEAGUECRAFT_INK } from "@/components/quiz/leaguecraft-ink";
import type { ReviewRound } from "@/lib/ranked-public/contracts";

export function hasModuleSigil(round: ReviewRound | null): boolean {
  return round?.kind === "mastery_slice" || round?.kind === "meta_reflex"
    || round?.kind === "order_forge";
}

export default function ModuleSigil({
  kind,
  className = "h-4 w-4",
  ink = LEAGUECRAFT_INK.brass,
}: {
  kind: ReviewRound["kind"];
  className?: string;
  ink?: string;
}) {
  const Icon = kind === "meta_reflex" ? Zap : kind === "order_forge" ? ArrowDownUp : Layers;
  return (
    <Icon
      className={className}
      style={{ color: ink }}
      aria-hidden="true"
      data-testid="module-sigil"
      data-module={kind}
    />
  );
}
