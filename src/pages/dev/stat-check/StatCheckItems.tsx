import { useState, type ReactNode } from "react";
import { Check, Gem, Sandwich, Shield, Sword } from "lucide-react";
import { Button } from "@/components/ui/button";
import { resolveAssetUrl } from "@/hooks/useChampionAssets";
import { cn } from "@/lib/utils";
import { ITEMS, ITEM_IDS, inventoryCount, totalInventoryCount, type ItemId, type ItemInventory } from "./items";
import { STAT_FAMILY_LABELS, type StatFamily } from "./statCheckEngine";

/**
 * Canonical LoL item ids for the existing backend item-icon convention
 * (`assets/items/{id}.png`, same pipeline as the mastery and quiz surfaces).
 * The Mogzy Snack has no LoL id — see MOGZY_SNACK_ASSET_PATH.
 */
const LOL_ITEM_IDS: Partial<Record<ItemId, number>> = {
  "long-sword": 1036,
  "cloth-armor": 1029,
  "ruby-crystal": 1028,
};

/**
 * Stable local asset path reserved for future Mogzy Snack art. Until the art
 * exists the snack renders its placeholder glyph; dropping a file at this path
 * (and importing it here) is the only change needed to ship real art.
 */
export const MOGZY_SNACK_ASSET_PATH = "src/assets/stat-check/items/mogzy-snack.png";

/**
 * Item glyphs for the dev prototype. The Mogzy Snack uses a deliberately
 * temporary clean sandwich placeholder — production snack art is out of scope.
 */
export function ItemGlyph({ itemId, className }: { itemId: ItemId; className?: string }) {
  switch (itemId) {
    case "long-sword":
      return <Sword className={className} />;
    case "cloth-armor":
      return <Shield className={className} />;
    case "ruby-crystal":
      return <Gem className={className} />;
    case "mogzy-snack":
      return <Sandwich className={className} />;
  }
}

/**
 * Recognizable item art from the canonical backend asset pipeline, falling
 * back to the glyph when no id is mapped (Mogzy Snack) or the image fails.
 */
export function ItemImage({
  itemId,
  className,
  glyphClassName,
}: {
  itemId: ItemId;
  className?: string;
  glyphClassName?: string;
}) {
  const [failed, setFailed] = useState(false);
  const lolId = LOL_ITEM_IDS[itemId];
  const src = lolId ? resolveAssetUrl(`assets/items/${lolId}.png`) : null;
  if (!src || failed) return <ItemGlyph itemId={itemId} className={glyphClassName ?? className} />;
  return (
    <img
      src={src}
      alt=""
      aria-hidden
      draggable={false}
      loading="lazy"
      onError={() => setFailed(true)}
      className={cn("h-full w-full object-cover", className)}
    />
  );
}

function itemFamiliesLabel(itemId: ItemId): string {
  return (Object.keys(ITEMS[itemId].bonuses) as StatFamily[]).map((family) => STAT_FAMILY_LABELS[family]).join(" / ");
}

/**
 * Contextual overlay for the item-acquisition phase: a bottom sheet on small
 * screens, a centered modal above. The board stays mounted and visible behind
 * the dimmed backdrop — no page transition. The overlay is not dismissable
 * because the choice itself is mandatory game state.
 */
export function ItemChoiceOverlay({ open, children }: { open: boolean; children: ReactNode }) {
  if (!open) return null;
  return (
    <div
      data-testid="stat-check-item-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Item choice"
      className="fixed inset-0 z-[8000] flex items-end justify-center bg-black/55 backdrop-blur-[2px] sm:items-center sm:p-6"
    >
      <div className="max-h-[85svh] w-full overflow-y-auto rounded-t-2xl border border-[#d6b55d]/40 bg-[#0a1220]/95 p-3 pb-[max(env(safe-area-inset-bottom),12px)] shadow-[0_-12px_48px_rgba(0,0,0,0.6)] sm:max-w-md sm:rounded-2xl sm:pb-3 sm:shadow-2xl">
        {children}
      </div>
    </div>
  );
}

/**
 * The simultaneous item-choice surface: four fixed choices (no randomized
 * offers), one confirmed pick per phase, shown as a 2x2 grid inside the
 * ItemChoiceOverlay. The opponent's pick is never shown.
 */
export function ItemChoicePanel({
  title,
  subtitle,
  inventory,
  selectedItemId,
  onSelect,
  onConfirm,
  waiting = false,
}: {
  title: string;
  subtitle: string;
  inventory: ItemInventory;
  selectedItemId: ItemId | null;
  onSelect: (itemId: ItemId) => void;
  onConfirm: () => void;
  /** Online: own pick committed, opponent still choosing (controls freeze). */
  waiting?: boolean;
}) {
  return (
    <div
      data-testid="stat-check-item-choice"
      className="rounded-md border border-[#d6b55d]/35 bg-[#d6b55d]/10 p-2 shadow-xl"
    >
      <div className="text-[11px] font-black uppercase tracking-[0.18em] text-[#f4d77d]">{title}</div>
      <div className="mt-0.5 text-[11px] text-slate-300">{subtitle}</div>
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        {ITEM_IDS.map((itemId) => {
          const item = ITEMS[itemId];
          const owned = inventoryCount(inventory, itemId);
          const selected = selectedItemId === itemId;
          return (
            <button
              key={itemId}
              type="button"
              data-testid={`stat-check-item-option-${itemId}`}
              aria-pressed={selected}
              disabled={waiting}
              onClick={() => onSelect(itemId)}
              className={cn(
                "relative rounded-md border bg-black/40 p-1.5 text-left outline-none transition focus-visible:ring-2 focus-visible:ring-cyan-200",
                selected
                  ? "border-[#f4d77d] shadow-[0_0_18px_rgba(244,215,125,0.35)] ring-1 ring-[#f4d77d]/70"
                  : "border-cyan-300/15 hover:border-[#d6b55d]/50",
              )}
            >
              <div className="flex items-center gap-1.5">
                <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded border border-[#d6b55d]/40 bg-black/50 text-[#f4d77d]">
                  <ItemImage itemId={itemId} glyphClassName="h-5 w-5" />
                </span>
                <span className="min-w-0 truncate text-xs font-black text-white">{item.label}</span>
                {selected && <Check className="ml-auto h-3.5 w-3.5 shrink-0 text-[#f4d77d]" aria-hidden />}
              </div>
              <div className="mt-1 text-[10px] font-semibold text-cyan-100/90">{item.effectText}</div>
              <div className="mt-0.5 text-[9px] uppercase tracking-[0.08em] text-slate-400">
                {itemFamiliesLabel(itemId)}
              </div>
              {owned > 0 && (
                <div className="mt-0.5 text-[9px] font-black uppercase tracking-[0.1em] text-[#f4d77d]">
                  Owned x{owned}
                </div>
              )}
            </button>
          );
        })}
      </div>
      <Button
        size="sm"
        data-testid="stat-check-item-confirm"
        disabled={!selectedItemId || waiting}
        onClick={onConfirm}
        className="mt-2 w-full bg-[#d6b55d] text-[#071018] hover:bg-[#f4d77d]"
      >
        {waiting
          ? "Waiting for opponent…"
          : selectedItemId
            ? `Take ${ITEMS[selectedItemId].label}`
            : "Choose an item"}
      </Button>
    </div>
  );
}

/**
 * The player's owned-item strip (wide-desktop utility rail). Clicking a chip
 * arms it for lane assignment (click item, then click a compatible occupied
 * lane); clicking again disarms.
 */
export function ItemInventoryStrip({
  inventory,
  selectedItemId,
  disabled,
  onToggle,
}: {
  inventory: ItemInventory;
  selectedItemId: ItemId | null;
  disabled: boolean;
  onToggle: (itemId: ItemId) => void;
}) {
  return (
    <div data-testid="stat-check-inventory" className="rounded-md border border-cyan-300/12 bg-black/28 p-2 shadow-xl">
      <div className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">
        Items - {totalInventoryCount(inventory)}
      </div>
      <div className="mt-1.5 grid gap-1">
        {ITEM_IDS.map((itemId) => {
          const owned = inventoryCount(inventory, itemId);
          const selected = selectedItemId === itemId;
          const usable = owned > 0 && !disabled;
          return (
            <button
              key={itemId}
              type="button"
              data-testid={`stat-check-inventory-${itemId}`}
              aria-pressed={selected}
              disabled={!usable}
              title={`${ITEMS[itemId].label}: ${ITEMS[itemId].effectText} (${itemFamiliesLabel(itemId)})`}
              onClick={() => onToggle(itemId)}
              className={cn(
                "flex items-center gap-1.5 rounded border px-1.5 py-1 text-left outline-none transition focus-visible:ring-2 focus-visible:ring-cyan-200",
                selected
                  ? "border-[#f4d77d] bg-[#d6b55d]/15 shadow-[0_0_12px_rgba(244,215,125,0.3)]"
                  : "border-cyan-300/12 bg-black/30",
                owned === 0 && "opacity-40",
                usable && !selected && "hover:border-[#d6b55d]/50",
                !usable && "cursor-not-allowed",
              )}
            >
              <span className="grid h-5 w-5 shrink-0 place-items-center overflow-hidden rounded border border-[#d6b55d]/35 bg-black/50 text-[#f4d77d]">
                <ItemImage itemId={itemId} glyphClassName="h-3.5 w-3.5" />
              </span>
              <span className="min-w-0 truncate text-[11px] font-black text-white">{ITEMS[itemId].label}</span>
              <span className="ml-auto text-[11px] font-black text-cyan-100">{owned}</span>
            </button>
          );
        })}
      </div>
      {selectedItemId && (
        <div className="mt-1.5 text-[10px] font-semibold text-[#f4d77d]">
          Click a compatible occupied lane to attach it.
        </div>
      )}
    </div>
  );
}

/**
 * Compact icon-row inventory for narrow layouts, docked in the controls row
 * next to Lock In. Same arm/disarm interaction and testids as the rail strip —
 * exactly one of the two is mounted at a time (layouts switch by viewport).
 */
export function ItemInventoryTray({
  inventory,
  selectedItemId,
  disabled,
  onToggle,
}: {
  inventory: ItemInventory;
  selectedItemId: ItemId | null;
  disabled: boolean;
  onToggle: (itemId: ItemId) => void;
}) {
  return (
    <div data-testid="stat-check-inventory" className="flex items-center gap-1">
      <span className="sr-only">Items - {totalInventoryCount(inventory)}</span>
      {ITEM_IDS.map((itemId) => {
        const owned = inventoryCount(inventory, itemId);
        const selected = selectedItemId === itemId;
        const usable = owned > 0 && !disabled;
        return (
          <button
            key={itemId}
            type="button"
            data-testid={`stat-check-inventory-${itemId}`}
            aria-pressed={selected}
            aria-label={`${ITEMS[itemId].label}, ${owned} owned. ${ITEMS[itemId].effectText}.`}
            disabled={!usable}
            title={`${ITEMS[itemId].label}: ${ITEMS[itemId].effectText} (${itemFamiliesLabel(itemId)})`}
            onClick={() => onToggle(itemId)}
            className={cn(
              "relative grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-md border outline-none transition focus-visible:ring-2 focus-visible:ring-cyan-200",
              selected
                ? "border-[#f4d77d] bg-[#d6b55d]/15 shadow-[0_0_12px_rgba(244,215,125,0.3)]"
                : "border-cyan-300/15 bg-black/40",
              owned === 0 && "opacity-35",
              !usable && "cursor-not-allowed",
            )}
          >
            <ItemImage itemId={itemId} glyphClassName="h-4.5 w-4.5 text-[#f4d77d]" className="h-full w-full" />
            <span
              className={cn(
                "absolute -right-0.5 -top-0.5 rounded-full px-1 text-[9px] font-black leading-[13px]",
                owned > 0 ? "bg-[#d6b55d] text-black" : "bg-black/70 text-slate-400",
              )}
            >
              {owned}
            </span>
          </button>
        );
      })}
    </div>
  );
}
