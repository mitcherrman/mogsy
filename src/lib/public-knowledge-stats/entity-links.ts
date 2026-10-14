import { championSlug } from "@/lib/league-docs/api";
import type { EntityStats } from "./api";

export function entityHref(row: Pick<EntityStats, "entity_type" | "entity_key">) {
  if (row.entity_type === "champion") {
    return `/lol/docs/champions/${championSlug(row.entity_key)}`;
  }
  if (row.entity_type === "item") {
    return `/items/${championSlug(row.entity_key)}`;
  }
  return null;
}
