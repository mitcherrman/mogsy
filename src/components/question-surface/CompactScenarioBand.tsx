/**
 * CompactScenarioBand (F1) — the low-content presentation of the premium
 * scenario band.
 *
 * WHY THIS EXISTS
 * The reused Broadcast scenario cards size every element in container-query
 * (`cqmin`) units tuned for the large passive OBS stage. Inside the Ranked
 * surface the container-query box is far smaller (a short 16/6 band → the min
 * dimension is only ~140–240px), so `cqmin`-based labels collapse to a few
 * pixels. For a genuinely rich card (champion splash, item recipe) the tall
 * cinematic box is worth the space; for a text-driven / low-content scenario
 * it produced a tiny label marooned in a large empty panel.
 *
 * This control is the compact answer: a short, premium strip sized in absolute
 * (rem) units — readable at every viewport and browser zoom — with no
 * container-query dependency and no animation (cheap; reduced-motion safe by
 * construction). It is spoiler-safe: it never receives the subject or the
 * prompt, so it can never leak the answer and never duplicates the question
 * header. Presentation is chosen by content CAPABILITY upstream, never by mode
 * identity (no isRanked/isTutorial/isBot/isPlaceholder).
 */

export interface CompactScenarioBandProps {
  /** Question category (already question-safe). Shown as the band label. */
  category: string | null;
}

export function CompactScenarioBand({ category }: CompactScenarioBandProps) {
  const label = (category ?? "").replace(/_/g, " ").trim() || "Ranked";
  return (
    <div
      data-testid="scenario-compact"
      className="relative flex h-16 w-full items-center gap-3 overflow-hidden rounded-xl border border-[#d4b35a]/30 bg-gradient-to-r from-black/55 via-black/35 to-black/55 px-4 sm:h-[4.5rem]"
    >
      {/* gold inner hairline ring — echoes the cinematic frame at a smaller scale */}
      <div className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-inset ring-[#d4b35a]/15" />
      {/* faint diagonal sheen for a premium (not flat) feel; purely decorative */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-y-8 -left-1/4 w-1/3 rotate-[18deg] bg-gradient-to-r from-transparent via-white/[0.05] to-transparent"
      />

      {/* left accent bar */}
      <div className="h-8 w-1 shrink-0 rounded-full bg-gradient-to-b from-[#f3dca0] to-[#d4b35a]/30" />

      {/* emblem — a gold hextech diamond, asset-free so it can never 404 */}
      <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#d4b35a]/35 bg-black/40">
        <span
          aria-hidden
          className="block h-3.5 w-3.5 rotate-45 rounded-[3px] bg-gradient-to-br from-[#f3dca0] to-[#d4b35a]/60 shadow-[0_0_10px_rgba(212,179,90,0.45)]"
        />
      </div>

      <div className="min-w-0">
        <div className="truncate text-sm font-bold uppercase tracking-[0.26em] text-[#e8c97a]">
          {label}
        </div>
        <div className="mt-0.5 text-[11px] font-medium uppercase tracking-[0.3em] text-white/45">
          Knowledge Battle
        </div>
      </div>
    </div>
  );
}
