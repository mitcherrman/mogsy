/**
 * Item-build recipe visual for content screenshots. Renders the normalized
 * model from deriveRecipe():
 *
 *   [header item]                       (optional, e.g. the completed item)
 *   [tile] + [tile] (+|→|·) [slot]      (relation row; slot is `?` until reveal)
 *
 * Icons are 64px sources — displayed at ≤88px so they stay sharp. Tiles
 * without a known icon render as name-only chips (never a fabricated image).
 * Data comes exclusively from deriveRecipe(), which never exposes the answer
 * before reveal.
 */
import type { RecipeTile, RecipeVisualData } from "@/lib/quiz-screenshot/recipe";

const GOLD_FRAME = {
  padding: 2,
  background: "linear-gradient(145deg, #d4a857 0%, #8a6a2a 50%, #d4a857 100%)",
  boxShadow: "0 0 14px rgba(212,168,87,0.4), 0 4px 14px rgba(0,0,0,0.5)",
} as const;

function ItemTile({
  tile,
  size,
  highlight,
  missingSlot,
  resolveUrl,
}: {
  /** Tile to render, or null for the unanswered `?` slot. */
  tile: RecipeTile | null;
  size: number;
  highlight?: boolean;
  missingSlot?: boolean;
  resolveUrl: (path?: string) => string | undefined;
}) {
  const iconUrl = tile?.icon ? resolveUrl(tile.icon) : undefined;
  return (
    <div className="flex flex-col items-center gap-1" style={{ width: size + 18 }}>
      <div
        className="rounded-md"
        style={{
          ...GOLD_FRAME,
          ...(highlight
            ? { boxShadow: "0 0 18px rgba(240,215,140,0.75), 0 4px 14px rgba(0,0,0,0.5)" }
            : null),
        }}
      >
        <div
          className="overflow-hidden rounded-sm bg-[#0a0a14] flex items-center justify-center"
          style={{ width: size, height: size }}
        >
          {iconUrl ? (
            <img src={iconUrl} alt={tile!.name} className="block" style={{ width: size, height: size }} />
          ) : missingSlot ? (
            <span
              data-recipe-missing-slot
              className="font-bold"
              style={{ color: "hsl(42 75% 62%)", fontSize: size * 0.5 }}
            >
              ?
            </span>
          ) : (
            // Known component with no icon source: name-only chip.
            <span
              data-recipe-name-chip
              className="px-1 text-center font-semibold leading-tight"
              style={{ color: "hsl(42 55% 74%)", fontSize: 11 }}
            >
              {tile!.name}
            </span>
          )}
        </div>
      </div>
      <span
        className="text-center text-[10px] leading-tight"
        style={{
          color: highlight ? "hsl(42 75% 66%)" : "hsl(42 30% 72%)",
          // FIXED two-line envelope (not minHeight): the label must occupy
          // identical space whether it is empty (pre-reveal "?" slot) or
          // holds a wrapped item name, so revealing never changes the row
          // height — the screenshot question/correct pair must not reflow.
          height: 26,
          overflow: "hidden",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
        }}
      >
        {iconUrl ? tile!.name : ""}
      </span>
    </div>
  );
}

function Join({ symbol }: { symbol: "+" | "→" }) {
  return (
    <span
      data-recipe-join={symbol === "+" ? "plus" : "arrow"}
      className="mx-1 mt-4 text-lg font-bold"
      style={{ color: "hsl(42 55% 60%)" }}
    >
      {symbol}
    </span>
  );
}

export default function RecipeVisual({
  recipe,
  resolveUrl,
}: {
  recipe: RecipeVisualData;
  resolveUrl: (path?: string) => string | undefined;
}) {
  const slotTile = recipe.missing;
  return (
    <div
      data-quiz-recipe
      data-recipe-mode={recipe.mode}
      className="flex flex-col items-center gap-2.5 py-1"
    >
      {recipe.header && <ItemTile tile={recipe.header} size={88} resolveUrl={resolveUrl} />}
      <div className="flex items-start justify-center gap-1 flex-wrap">
        {recipe.row.map((tile, i) => (
          <div key={`${tile.name}-${i}`} className="flex items-start">
            {i > 0 && <Join symbol="+" />}
            <ItemTile tile={tile} size={56} resolveUrl={resolveUrl} />
          </div>
        ))}
        <div className="flex items-start">
          {recipe.slotJoin === "plus" && <Join symbol="+" />}
          {recipe.slotJoin === "arrow" && <Join symbol="→" />}
          <ItemTile
            tile={slotTile}
            size={recipe.row.length === 0 ? 72 : 56}
            highlight={!!slotTile}
            missingSlot={!slotTile}
            resolveUrl={resolveUrl}
          />
        </div>
      </div>
    </div>
  );
}
