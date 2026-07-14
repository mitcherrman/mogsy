/**
 * Item-build recipe visual for content screenshots:
 *
 *   [final item icon + name]
 *   [component] + [component] + [component] + [?]   (question state)
 *   [component] + [component] + [component] + [answer]  (reveal state)
 *
 * Icons are 64px sources — displayed at ≤96px so they stay sharp.
 * Data comes exclusively from deriveRecipe(), which never exposes the
 * missing component before reveal.
 */
import type { RecipeVisualData } from "@/lib/quiz-screenshot/recipe";

const GOLD_FRAME = {
  padding: 2,
  background: "linear-gradient(145deg, #d4a857 0%, #8a6a2a 50%, #d4a857 100%)",
  boxShadow: "0 0 14px rgba(212,168,87,0.4), 0 4px 14px rgba(0,0,0,0.5)",
} as const;

function ItemTile({
  icon,
  label,
  size,
  highlight,
}: {
  icon: string | null;
  label: string | null;
  size: number;
  highlight?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-1" style={{ width: size + 14 }}>
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
          {icon ? (
            <img src={icon} alt={label ?? "Item"} className="block" style={{ width: size, height: size }} />
          ) : (
            <span
              data-recipe-missing-slot
              className="font-bold"
              style={{ color: "hsl(42 75% 62%)", fontSize: size * 0.5 }}
            >
              ?
            </span>
          )}
        </div>
      </div>
      <span
        className="text-center text-[10px] leading-tight"
        style={{ color: highlight ? "hsl(42 75% 66%)" : "hsl(42 30% 72%)", minHeight: 24 }}
      >
        {label ?? ""}
      </span>
    </div>
  );
}

export default function RecipeVisual({
  recipe,
  resolveUrl,
}: {
  recipe: RecipeVisualData;
  resolveUrl: (path?: string) => string | undefined;
}) {
  return (
    <div data-quiz-recipe className="flex flex-col items-center gap-2.5 py-1">
      <ItemTile
        icon={resolveUrl(recipe.itemIcon) ?? null}
        label={recipe.itemName}
        size={88}
      />
      <div className="flex items-start justify-center gap-1 flex-wrap">
        {recipe.components.map((c, i) => (
          <div key={c.name} className="flex items-start">
            {i > 0 && (
              <span className="mx-1 mt-4 text-lg font-bold" style={{ color: "hsl(42 55% 60%)" }}>
                +
              </span>
            )}
            <ItemTile icon={resolveUrl(c.icon) ?? null} label={c.name} size={56} />
          </div>
        ))}
        <div className="flex items-start">
          <span className="mx-1 mt-4 text-lg font-bold" style={{ color: "hsl(42 55% 60%)" }}>
            +
          </span>
          <ItemTile
            icon={recipe.missing ? resolveUrl(recipe.missing.icon) ?? null : null}
            label={recipe.missing ? recipe.missing.name : null}
            size={56}
            highlight={!!recipe.missing}
          />
        </div>
      </div>
    </div>
  );
}
