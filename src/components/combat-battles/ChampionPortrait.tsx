// Champion portrait/splash with a text fallback — reuses the shared champion
// asset manifest (useChampionAssets). No new asset system introduced.
import { useChampionAssets, getChampionIcon, getChampionSplash } from "@/hooks/useChampionAssets";
import { cn } from "@/lib/utils";

type Props = {
  champion: string | null | undefined;
  variant?: "icon" | "splash";
  className?: string;
};

export default function ChampionPortrait({ champion, variant = "icon", className }: Props) {
  const { data: manifest } = useChampionAssets();
  const name = champion ?? "";
  const src =
    variant === "splash"
      ? getChampionSplash(manifest, name)
      : getChampionIcon(manifest, name);
  const initial = (name.trim()[0] || "?").toUpperCase();

  if (!src) {
    // Sufficient text fallback for a missing image.
    return (
      <div
        className={cn(
          "flex items-center justify-center rounded-md bg-muted text-muted-foreground font-semibold",
          variant === "splash" ? "aspect-video w-full text-3xl" : "h-12 w-12 text-lg",
          className,
        )}
        role="img"
        aria-label={name || "Unknown champion"}
      >
        {initial}
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={name}
      loading="lazy"
      className={cn(
        "rounded-md object-cover",
        variant === "splash" ? "aspect-video w-full" : "h-12 w-12",
        className,
      )}
    />
  );
}
