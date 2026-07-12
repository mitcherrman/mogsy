import { Link } from "react-router-dom";
import { Database } from "lucide-react";
import { parseProDataSource, proDataSourceUrl } from "@/lib/league-docs/pro-data-links";

/**
 * Post-answer "View source data" action for esports/pro-data quiz questions.
 *
 * Renders ONLY when the question carries valid structured source metadata at
 * `metadata.pro_data_source` (typed inputs, never a raw URL). Invalid or
 * absent metadata renders nothing — the quiz continues normally. This is a
 * secondary, explainability affordance shown after the answer result; it must
 * not be used before the user has answered.
 */
export default function ProDataSourceLink({
  metadata,
}: {
  metadata?: Record<string, unknown> | null;
}) {
  const source = parseProDataSource(metadata?.pro_data_source);
  if (!source) return null;

  return (
    <div className="mt-2.5 border-t border-[#c9a84c]/20 pt-2.5">
      <Link
        to={proDataSourceUrl(source)}
        className="inline-flex items-center gap-1.5 rounded-md border border-[#c9a84c]/40 bg-black/30 px-2.5 py-1.5 text-xs font-semibold text-[#c9a84c] transition-colors hover:bg-[#c9a84c]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a84c]/40"
      >
        <Database className="h-3.5 w-3.5 shrink-0" aria-hidden />
        View source data
      </Link>
      <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
        Source data reflects Mogsy's imported dataset; coverage may be incomplete for historical
        years.
      </p>
    </div>
  );
}
