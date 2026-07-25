import { Check, Gem, Sandwich, Shield, Sword } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ITEMS, ITEM_IDS, inventoryCount, totalInventoryCount, type ItemId, type ItemInventory } from "./items";
import { STAT_FAMILY_LABELS, type StatFamily } from "./statCheckEngine";

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

function itemFamiliesLabel(itemId: ItemId): string {
  return (Object.keys(ITEMS[itemId].bonuses) as StatFamily[]).map((family) => STAT_FAMILY_LABELS[family]).join(" / ");
}

/**
 * The simultaneous item-choice surface: four fixed choices (no randomized
 * offers), one confirmed pick per phase. Rendered inside the right rail so
 * the board — resolved results included — always stays visible behind it.
 * The bot's pick is never shown.
 */
export function ItemChoicePanel({
  title,
  subtitle,
  inventory,
  selectedItemId,
  onSelect,
  onConfirm,
}: {
  title: string;
  subtitle: string;
  inventory: ItemInventory;
  selectedItemId: ItemId | null;
  onSelect: (itemId: ItemId) => void;
  onConfirm: () => void;
}) {
  return (
    <div
      data-testid="stat-check-item-choice"
      className="rounded-md border border-[#d6b55d]/35 bg-[#d6b55d]/10 p-2 shadow-xl"
    >
      <div className="text-[11px] font-black uppercase tracking-[0.18em] text-[#f4d77d]">{title}</div>
      <div className="mt-0.5 text-[11px] text-slate-300">{subtitle}</div>
      <div className="mt-2 grid grid-cols-1 gap-1.5">
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
              onClick={() => onSelect(itemId)}
              className={cn(
                "relative rounded-md border bg-black/40 p-1.5 text-left outline-none transition focus-visible:ring-2 focus-visible:ring-cyan-200",
                selected
                  ? "border-[#f4d77d] shadow-[0_0_18px_rgba(244,215,125,0.35)] ring-1 ring-[#f4d77d]/70"
                  : "border-cyan-300/15 hover:border-[#d6b55d]/50",
              )}
            >
              <div className="flex items-center gap-1.5">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded border border-[#d6b55d]/40 bg-black/50 text-[#f4d77d]">
                  <ItemGlyph itemId={itemId} className="h-4 w-4" />
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
        disabled={!selectedItemId}
        onClick={onConfirm}
        className="mt-2 w-full bg-[#d6b55d] text-[#071018] hover:bg-[#f4d77d]"
      >
        {selectedItemId ? `Take ${ITEMS[selectedItemId].label}` : "Choose an item"}
      </Button>
    </div>
  );
}

/**
 * The player's owned-item strip. Clicking a chip arms it for lane assignment
 * (click item, then click a compatible occupied lane); clicking again disarms.
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
              <span className="grid h-5 w-5 shrink-0 place-items-center rounded border border-[#d6b55d]/35 bg-black/50 text-[#f4d77d]">
                <ItemGlyph itemId={itemId} className="h-3.5 w-3.5" />
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
