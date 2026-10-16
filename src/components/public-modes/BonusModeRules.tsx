/**
 * PGM2 — a bonus game's Rules beside its arena.
 *
 * Mounted by the Ranked route in place of Ranked's own scroll when the match
 * is a bonus game: the mode's rules are the server catalog's copy
 * (`buildModeRules`), not Ranked's scoring. Collapsed to its dock tab until
 * the player opens it, so it never lays itself over a board on the clock.
 */
import { useState } from "react";
import { ModeRulesPanel } from "./ModeRulesPanel";
import { usePublicModeCatalog } from "@/lib/public-modes/client";
import { buildModeRules } from "@/lib/public-modes/rules";

export function BonusModeRules({ gameModeId }: { gameModeId: string }) {
  const catalog = usePublicModeCatalog();
  const [open, setOpen] = useState(false);
  const entry = catalog.data?.modes.find((m) => m.id === gameModeId) ?? null;
  if (!entry) return null;
  return (
    <ModeRulesPanel rules={buildModeRules(entry)} open={open}
      onOpen={() => setOpen(true)} onClose={() => setOpen(false)} />
  );
}
