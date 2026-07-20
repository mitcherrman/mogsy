import { Badge } from "@/components/ui/badge";
import { STATUS_LABELS, statusBadgeVariant } from "@/lib/combat-battles/lifecycle";
import type { BattleStatus } from "@/lib/combat-battles/types";

export default function StatusBadge({ status }: { status: BattleStatus }) {
  return (
    <Badge variant={statusBadgeVariant(status)} aria-label={`Status: ${STATUS_LABELS[status]}`}>
      {STATUS_LABELS[status]}
    </Badge>
  );
}
