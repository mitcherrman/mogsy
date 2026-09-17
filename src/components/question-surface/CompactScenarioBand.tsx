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

import { QuestionRoleEmblems } from "@/components/ranked-arena/RoleEmblem";
import type { RankedRole } from "@/lib/ranked-public/roles";
import { formatCategoryLabel } from "@/lib/question-surface/categoryLabel";
import type { CompactDensity } from "@/lib/question-surface/compactDensity";
import academyHall from "@/assets/ranked/academy-hall.jpg";

export interface CompactScenarioBandProps {
  /** Question category (already question-safe). Shown as the band label. */
  category: string | null;
  /**
   * ENV1 — how much of the reserved region this plate takes. Optional and
   * defaulting to the RR1 presentation, so every caller and every family that
   * does not opt in is byte-identical to what it was. See
   * `@/lib/question-surface/compactDensity` for who opts in and why.
   */
  density?: CompactDensity;
  /** RQ1 — the question's role(s); drawn immediately left of the label. */
  roles?: readonly RankedRole[];
}

export function CompactScenarioBand({ category, density = "plate", roles }: CompactScenarioBandProps) {
  /**
   * ENV1 — the CONTEXT strip.
   *
   * RR1 grew this plate into the arena's 256px reserve because a fixed 72px
   * strip left ~184px of bare parchment and read as a failed load. That was
   * the right call for a plate with nothing to show; it is the wrong one for
   * the environment families, where it produced a ~256px near-empty black
   * rectangle carrying one hextech diamond — which reads as a subject the
   * question does not have.
   *
   * The context strip takes the third option neither of those two is: it
   * stops growing (≈7rem against the 16rem reserve, 44%) AND it earns the
   * height it does take, by seating the same academy hall the environment
   * card's atmosphere layer uses. The residual region stays reserved, because
   * that reserve is what pins the answer tablets between rounds — this pass
   * changes what the BAND draws, never the stage's geometry.
   *
   * The large watermark diamond is suppressed here on purpose. At plate
   * density it is chrome filling a region; at this height it would be the
   * single dominant mark on the band, i.e. exactly the generic glyph standing
   * in for a turret that this fallback exists to remove. The small emblem
   * beside the label stays: it is secondary decoration at label scale, sized
   * and positioned as a bullet, and it is asset-free so it can never 404.
   */
  const context = density === "context";
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
      data-compact-density={density}
      className={`relative flex w-full items-center gap-3 overflow-hidden rounded-xl border border-[#d4b35a]/30 bg-gradient-to-r from-black/55 via-black/35 to-black/55 px-4 ${
        context
          ? // No `grow`: the strip keeps this height whatever the region
            // reserves, which is the entire point of the variant.
            "min-h-16 sm:min-h-[7rem]"
          : "min-h-16 grow sm:min-h-[4.5rem]"
      }`}
    >
      {/* Context ground — the academy hall, the same asset the environment
          card seats as its atmosphere layer, so a media-free environment round
          and one WITH a subject read as the same place. Heavily dimmed and
          masked to the right so the two label lines keep their contrast; it is
          a ground, never a subject, and it is decorative rather than a claim
          about the question. */}
      {context && (
        <img
          src={academyHall}
          alt=""
          aria-hidden
          data-testid="scenario-compact-ground"
          className="pointer-events-none absolute inset-y-0 right-0 h-full w-[62%] object-cover opacity-40"
          style={{
            filter: "brightness(0.9) saturate(0.9)",
            maskImage:
              "linear-gradient(to right, transparent 0%, rgba(0,0,0,0.5) 34%, #000 78%)",
            WebkitMaskImage:
              "linear-gradient(to right, transparent 0%, rgba(0,0,0,0.5) 34%, #000 78%)",
          }}
        />
      )}
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
      {!context && (
      <div
        aria-hidden
        data-testid="scenario-compact-watermark"
        className="pointer-events-none absolute inset-y-0 right-[7%] flex items-center justify-center"
      >
        <span className="block aspect-square h-[40%] max-h-24 rotate-45 rounded-[12%] border border-[#d4b35a]/20 bg-gradient-to-br from-[#f3dca0]/[0.07] to-[#d4b35a]/[0.02]" />
      </div>
      )}

      {/* left accent bar */}
      <div className="relative h-8 w-1 shrink-0 rounded-full bg-gradient-to-b from-[#f3dca0] to-[#d4b35a]/30" />

      {/* emblem — a gold hextech diamond, asset-free so it can never 404 */}
      <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#d4b35a]/35 bg-black/40">
        <span
          aria-hidden
          className="block h-3.5 w-3.5 rotate-45 rounded-[3px] bg-gradient-to-br from-[#f3dca0] to-[#d4b35a]/60 shadow-[0_0_10px_rgba(212,179,90,0.45)]"
        />
      </div>

      <div className="relative min-w-0">
        <div className="flex min-w-0 items-center gap-1.5">
          <QuestionRoleEmblems roles={roles} size="sm" />
          <div className="min-w-0 truncate text-sm font-bold uppercase tracking-[0.26em] text-[#e8c97a]">
            {label}
          </div>
        </div>
        <div className="mt-0.5 text-[11px] font-medium uppercase tracking-[0.3em] text-white/45">
          Knowledge Battle
        </div>
      </div>
    </div>
  );
}
