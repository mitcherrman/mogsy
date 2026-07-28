import { useState, type ReactNode } from "react";
import { Check, ChevronUp, Gem, Sandwich, Shield, Sword } from "lucide-react";
import { Button } from "@/components/ui/button";
import { resolveAssetUrl } from "@/hooks/useChampionAssets";
import { cn } from "@/lib/utils";
import { ITEMS, ITEM_IDS, inventoryCount, totalInventoryCount, type ItemId, type ItemInventory } from "./items";
import { STAT_FAMILY_LABELS, type StatFamily } from "./statCheckEngine";
import { nextRoundHintTooltip, statFamilyPresentation } from "./statCategoryIcons";
import { BoardTooltip } from "./StatCheckTooltip";

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
 * Board-mounted persistent inventory: a stone-and-brass socket strip bolted to
 * the board assembly, holding one recessed item well per item. Icons and
 * counts only — no labels. Always a vertical column, top to bottom, at every
 * width: one component, one construction, no compact variant. The page mounts
 * it as the left column of the hand tray so it reads as a board extension.
 * Clicking an owned well arms it for lane assignment (click item, then click a
 * compatible occupied lane); clicking again disarms.
 */
export function ItemInventoryDock({
  inventory,
  selectedItemId,
  disabled,
  onToggle,
  collapsed = false,
  onToggleCollapsed,
  nextHintFamily = null,
  className,
}: {
  inventory: ItemInventory;
  selectedItemId: ItemId | null;
  disabled: boolean;
  onToggle: (itemId: ItemId) => void;
  /** Local UI state only — never part of match/engine/multiplayer state. */
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  /** Upcoming stat family for the board-mounted hint socket, if revealed. */
  nextHintFamily?: StatFamily | null;
  className?: string;
}) {
  const hintIcon = nextHintFamily ? statFamilyPresentation(nextHintFamily).icon : null;
  return (
    <div
      data-testid="stat-check-inventory"
      data-collapsed={collapsed ? "true" : "false"}
      aria-label={`Item inventory, ${totalInventoryCount(inventory)} owned`}
      className={cn(
        // The strip: same slab construction — brass perimeter, dark stone
        // face, drop shadows giving it physical thickness beside the board.
        // A single vertical column at every width; only the well size steps
        // down below sm so the strip stays 44px wide on phones (52px above).
        "relative flex w-max flex-col items-center gap-0.5 border-2 border-[#7d6430] px-1 pb-1 pt-1.5",
        "rounded-b-xl rounded-t-[4px] bg-[linear-gradient(180deg,rgba(27,37,54,0.55),rgba(9,14,24,0.9)),linear-gradient(160deg,#182236,#0b111d)]",
        "shadow-[inset_0_2px_0_rgba(244,215,125,0.22),inset_0_-2px_0_rgba(0,0,0,0.6),inset_0_0_18px_rgba(0,0,0,0.5),0_5px_0_-2px_#241d0e,0_8px_0_-4px_#0a0d14,0_16px_28px_rgba(0,0,0,0.55)]",
        className,
      )}
    >
      {/* brass mounting lip where the shelf meets the board edge */}
      <span
        aria-hidden
        className="pointer-events-none absolute -top-[3px] left-2 right-2 h-[3px] rounded-full bg-[linear-gradient(90deg,transparent,rgba(168,137,75,0.9)_20%,rgba(214,181,93,0.95)_50%,rgba(168,137,75,0.9)_80%,transparent)] shadow-[inset_0_1px_0_rgba(244,215,125,0.5)]"
      />
      {/* corner bolts fixing the shelf to the frame */}
      <span aria-hidden className="pointer-events-none absolute left-1 top-1 h-1.5 w-1.5 rounded-full bg-[#a8894b] shadow-[inset_0_-1px_1px_rgba(0,0,0,0.7),0_0_2px_rgba(244,215,125,0.4)]" />
      <span aria-hidden className="pointer-events-none absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-[#a8894b] shadow-[inset_0_-1px_1px_rgba(0,0,0,0.7),0_0_2px_rgba(244,215,125,0.4)]" />
      {/* Collapsing hides only the wells; the lever and the hint socket below
          always stay mounted so the board extension never disappears. */}
      {!collapsed && ITEM_IDS.map((itemId) => {
        const owned = inventoryCount(inventory, itemId);
        const armed = selectedItemId === itemId;
        const usable = owned > 0 && !disabled;
        return (
          <button
            key={itemId}
            type="button"
            data-testid={`stat-check-inventory-${itemId}`}
            data-dock-state={armed ? "armed" : owned > 0 ? "owned" : "empty"}
            aria-pressed={armed}
            aria-label={`${ITEMS[itemId].label}, ${owned} owned. ${ITEMS[itemId].effectText}.`}
            disabled={!usable}
            title={`${ITEMS[itemId].label}: ${ITEMS[itemId].effectText} (${itemFamiliesLabel(itemId)})`}
            onClick={() => onToggle(itemId)}
            className={cn(
              // A recessed item well carved into the strip stone.
              "relative grid h-8 w-8 shrink-0 place-items-center rounded-md border outline-none transition focus-visible:ring-2 focus-visible:ring-cyan-200 sm:h-10 sm:w-10",
              "border-black/55 bg-[radial-gradient(ellipse_at_50%_40%,#101a2b,#0a121f_80%)] shadow-[inset_0_3px_8px_rgba(0,0,0,0.75),inset_0_-1px_0_rgba(244,215,125,0.1)]",
              armed
                ? // Armed: the well lights up — raised, gold-rimmed, cyan energy glow.
                  "-translate-y-1 border-[#f4d77d] ring-2 ring-cyan-300/80 shadow-[inset_0_2px_6px_rgba(0,0,0,0.5),0_0_14px_rgba(34,211,238,0.7),0_0_28px_rgba(34,211,238,0.35),0_4px_10px_rgba(0,0,0,0.5)]"
                : usable && "hover:border-[#d6b55d]/60 hover:shadow-[inset_0_3px_8px_rgba(0,0,0,0.75),0_0_10px_rgba(214,181,93,0.25)]",
              owned === 0 && "opacity-40 grayscale",
              !usable && "cursor-not-allowed",
            )}
          >
            <span className="grid h-6 w-6 place-items-center overflow-hidden rounded-[4px] sm:h-[30px] sm:w-[30px]">
              <ItemImage itemId={itemId} glyphClassName="h-4 w-4 text-[#f4d77d] sm:h-5 sm:w-5" className="h-full w-full" />
            </span>
            {/* armed energy tap: a lit gem at the well's base, echoing the
                socket status lights */}
            {armed && (
              <span
                aria-hidden
                className="pointer-events-none absolute -bottom-[5px] left-1/2 h-1.5 w-3 -translate-x-1/2 rounded-b-sm bg-cyan-300 shadow-[0_0_10px_rgba(34,211,238,0.9),0_0_20px_rgba(34,211,238,0.5)]"
              />
            )}
            <span
              className={cn(
                "pointer-events-none absolute -right-1 -top-1 rounded-full border px-1 text-[9px] font-black leading-[13px]",
                owned > 0
                  ? "border-[#f4d77d]/60 bg-[#d6b55d] text-black shadow-[0_0_6px_rgba(214,181,93,0.5)]"
                  : "border-white/10 bg-black/75 text-slate-500",
              )}
            >
              {`×${owned}`}
            </span>
          </button>
        );
      })}
      {/* Physical brass lever bolted to the strip: no text, just a chevron
          that folds the wells away. Always visible at every width. */}
      {onToggleCollapsed && (
        <>
          <span
            aria-hidden
            className="pointer-events-none my-0.5 h-px w-6 rounded-full bg-[linear-gradient(90deg,transparent,rgba(168,137,75,0.8),transparent)]"
          />
          <BoardTooltip
            testId="stat-check-dock-lever"
            label={collapsed ? "Expand items" : "Collapse items"}
            side="right"
            ariaExpanded={!collapsed}
            onClick={onToggleCollapsed}
            buttonClassName={cn(
              "relative grid h-5 w-8 shrink-0 place-items-center rounded-[3px] border border-[#7d6430] transition sm:w-10",
              "bg-[linear-gradient(180deg,#3c3118,#1a1508)] shadow-[inset_0_1px_0_rgba(244,215,125,0.35),0_2px_4px_rgba(0,0,0,0.6)]",
              "hover:border-[#d6b55d]/70",
            )}
          >
            <ChevronUp
              aria-hidden
              className={cn("h-3.5 w-3.5 text-[#f4d77d] transition-transform", collapsed && "rotate-180")}
              strokeWidth={3}
            />
          </BoardTooltip>
        </>
      )}
      {/* Next-round hint socket: family art only. Deliberately not a button
          and not an item well — it reveals the upcoming stat family and
          nothing about direction, level, or the rest of the board. */}
      {nextHintFamily && (
        <BoardTooltip
          testId="stat-check-next-hint"
          label={nextRoundHintTooltip(nextHintFamily)}
          side="right"
          buttonClassName={cn(
            // Distinct from item wells: a circular cyan-rimmed intel port
            // rather than a square recessed stone socket.
            "relative mt-0.5 grid h-7 w-7 shrink-0 cursor-help place-items-center rounded-full border border-cyan-300/50 sm:h-9 sm:w-9",
            "bg-[radial-gradient(circle_at_50%_35%,rgba(34,211,238,0.18),#08111c_75%)]",
            "shadow-[inset_0_1px_4px_rgba(0,0,0,0.7),0_0_10px_rgba(34,211,238,0.28)]",
          )}
        >
          <span data-hint-family={nextHintFamily} className="contents">
            {hintIcon && (
              <img
                src={hintIcon}
                alt=""
                aria-hidden
                data-testid="stat-check-next-hint-icon"
                className="h-4 w-4 object-contain sm:h-5 sm:w-5"
              />
            )}
          </span>
        </BoardTooltip>
      )}
    </div>
  );
}
