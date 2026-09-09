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
 *
 * FILLING THE RESERVED REGION (RR1 pass 1)
 * ────────────────────────────────────────
 * Inside the arena, `.ranked-question-stage` reserves `--qs-media-h` (16rem =
 * 256px at >=1024px) for the media region, so consecutive rounds occupy one
 * physical space and the answer tablets never move. This band was a FIXED
 * 64/72px strip, so a compact round drew that strip at the top of the region
 * and left ~184px of bare parchment beneath it — which reads as content that
 * failed to load rather than as a question that legitimately has no artwork.
 *
 * The fix is deliberately NOT to shrink the reserve (that reintroduces the
 * height oscillation the stage exists to remove) and NOT to invent artwork
 * (several families are premise-DENIED precisely because no canonical asset
 * exists). The band simply GROWS INTO whatever the region gives it:
 *
 *   - `h-full` resolves against the region's reserved height inside the arena;
 *   - outside the arena no token is set, the region is content-sized, a
 *     percentage height against an indefinite parent resolves to `auto`, and
 *     the `min-h` below keeps the original 64/72px strip EXACTLY as it was —
 *     so the admin preview, the screenshot harness and Mastery are unchanged.
 *
 * What fills the extra room is chrome this component ALREADY owns — the gold
 * hairline, the inset ring, the diagonal sheen and the hextech diamond — with
 * the diamond restated once as a large, low-opacity watermark. No new asset, no
 * second filler system, and nothing that can 404.
 */

import { formatCategoryLabel } from "@/lib/question-surface/categoryLabel";

export interface CompactScenarioBandProps {
  /** Question category (already question-safe). Shown as the band label. */
  category: string | null;
}

export function CompactScenarioBand({ category }: CompactScenarioBandProps) {
  // Same formatter the cinematic header uses — the rule moved out of this file
  // unchanged so both presentations of the category read identically.
  const label = formatCategoryLabel(category, "Ranked");
  return (
    <div
      data-testid="scenario-compact"
      // `min-h` is the ORIGINAL fixed height and is what every caller outside
      // the arena still gets. `grow` is what lets the plate own the arena's
      // reserved region instead of floating at the top of it.
      //
      // `grow` (flex-grow:1, flex-basis:auto) rather than `h-full`: the media
      // region is a flex COLUMN whose own height is `auto` with a `min-height`,
      // and a percentage height against an indefinite parent resolves to
      // `auto` — so `h-full` would have been a no-op in the one place it was
      // needed. Flex free space is defined for exactly this case: with no
      // reserve there is none and the plate keeps its intrinsic 64/72px, and
      // with a 256px reserve the 184px of free space goes to this item.
      className="relative flex min-h-16 w-full grow items-center gap-3 overflow-hidden rounded-xl border border-[#d4b35a]/30 bg-gradient-to-r from-black/55 via-black/35 to-black/55 px-4 sm:min-h-[4.5rem]"
    >
      {/* gold inner hairline ring — echoes the cinematic frame at a smaller scale */}
      <div className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-inset ring-[#d4b35a]/15" />
      {/* faint diagonal sheen for a premium (not flat) feel; purely decorative */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-y-8 -left-1/4 w-1/3 rotate-[18deg] bg-gradient-to-r from-transparent via-white/[0.05] to-transparent"
      />

      {/* Watermark — the SAME hextech diamond as the emblem below, restated
          large and faint so a tall plate reads as a composed surface rather
          than an empty one.

          Sized as a PERCENTAGE of the plate's own height — deliberately not a
          container-query unit, because this band is not inside a
          `container-type` element (only the cinematic band establishes one) and
          a stray `cqh` would silently resolve against the viewport. The
          absolute wrapper takes a definite height from `inset-y-0`, so the 40%
          below is 40% of the plate: a ~28px mark on the original strip, and a
          ~102px one in the arena's 256px region. Decorative and asset-free. */}
      <div
        aria-hidden
        data-testid="scenario-compact-watermark"
        className="pointer-events-none absolute inset-y-0 right-[7%] flex items-center justify-center"
      >
        <span className="block aspect-square h-[40%] max-h-24 rotate-45 rounded-[12%] border border-[#d4b35a]/20 bg-gradient-to-br from-[#f3dca0]/[0.07] to-[#d4b35a]/[0.02]" />
      </div>

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
