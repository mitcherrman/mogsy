/**
 * LC1 — the Ranked lobby hero at /quiz.
 *
 * Replaces the single centred Ranked card with a three-column character-select
 * composition, read left → centre → right:
 *
 *   LEFT   Role carousel. The five canonical League roles as an RPG selector,
 *          with the selected role's real record beneath it.
 *   CENTRE The page's focal point: the LEAGUECRAFT wordmark, the RANKED
 *          subtitle, the Ranked emblem, the rating, and the one PLAY gem.
 *   RIGHT  Personal identity: the player's own portrait mirroring the left
 *          one, their Academy crown, their name, compact stats, and their
 *          real recent Ranked results.
 *
 * The two flanking portraits are deliberately the same height and face
 * inward, so the centre column keeps the strongest silhouette on the page and
 * the classroom art stays visible around all three.
 *
 * PRESENTATION ONLY — the RE1 boundary
 * ────────────────────────────────────
 * Every value here arrives already resolved. This file computes no rating, no
 * tier, no threshold, no XP and no placement state; it renders the backend's
 * own figures and the host's own callbacks. The competitive identity in the
 * centre is the account's MOGZY RANKED standing (`rankedProgression`), and
 * the legacy Academy/quiz ladder is deliberately unreachable from it — the
 * Academy crown on the right is labelled as Academy and never as Ranked, so
 * the two tracks cannot read as one.
 *
 * Placement honesty is unchanged from the card this replaces: until placements
 * are complete the player has NO TIER — the placement series, never a
 * provisional tier, even when a rating already exists. What that state now
 * SHOWS is the ladder's own floor: the Bronze emblem, held a little back,
 * labelled simply BRONZE, rather than the off-ladder `unranked` emblem it
 * used to render. See `BASELINE_TIER` — "baseline" is the INTERNAL name for
 * this state and never reaches the page, because the heading above the emblem
 * already reads "Placement Series" and the line under it already reads
 * "Rating set after placements". The emblem is art for "the bottom of the
 * ladder", never a tier the account has been awarded, and both flanking
 * columns read it from the same one gate.
 *
 * DATA HONESTY
 * ────────────
 * Nothing on this surface is mocked. The role record and the recent-results
 * list are the account's real match rows; when there are none, each says so.
 * There is no per-role rating and no personalized mascot art in the product
 * today, so neither is invented here.
 */

import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Flame,
  History,
  Shield,
  Target,
  TrendingDown,
  TrendingUp,
  Trophy,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import RankCrown from "@/components/ranked/RankCrown";
import RankedClassCarousel from "@/components/quiz/RankedClassCarousel";
import RankedPlayGem from "@/components/quiz/RankedPlayGem";
import LobbyPanel from "@/components/quiz/LobbyPanel";
import { MOGZY_MASCOT_ASSETS } from "@/components/mascot/mascot-assets";
import { progressAttempts, resolveQuizAssetUrl, type QuizProgress } from "@/lib/quiz/api";
import type { RankedState } from "@/lib/quiz/featured-mock";
import { RANKED_ROLE_LABELS, type RankedRole } from "@/lib/ranked-public/roles";
import { rankedTierLabel, resolveRankedEmblemUrl } from "@/lib/progression/rankedArt";
import { parseRankTier, type RankTier } from "@/lib/progression/tiers";
import { academyTierLabel } from "@/lib/progression/academy";
import type { RankedProgressionView, MatchHistoryEntryView } from "@/lib/ranked-public/contracts";
import { tallyRoleRecords, roleRecordScopeLabel } from "@/lib/ranked-public/roleRecords";

const PLACEMENT_TOTAL = 5;

/**
 * The visual baseline of the Ranked ladder — PRESENTATION ONLY.
 *
 * The ladder is bronze → silver → gold → diamond → challenger, so Bronze is
 * its floor: the rank a player is working up FROM, and therefore the honest
 * thing to show an account that has no standing yet. The old treatment showed
 * the `unranked.png` emblem, which is a sixth piece of art outside the five
 * canonical tiers and reads as "you are not part of this ladder" rather than
 * "you are at the bottom of it".
 *
 * THIS IS NOT A TIER CLAIM. Nothing here awards Bronze, computes it, or sends
 * it anywhere: the emblem is rendered in a visibly unearned state (see
 * `BASELINE_EMBLEM_FILTER`), the copy says "baseline" and never "Ranked
 * Bronze", and the moment RE1 hands over a real tier the earned art and the
 * real tier name take over. The rating, the tier and the placement count are
 * still the backend's, unchanged and un-guessed.
 *
 * It is `RankTier`-typed on purpose, so it can only ever be one of the five
 * canonical tiers and resolves through the same `resolveRankedEmblemUrl` that
 * every earned emblem does — no second art path, no invented asset.
 */
const BASELINE_TIER: RankTier = "bronze";

/**
 * Baseline Bronze, drawn as a slightly quieter emblem — the same metal, in
 * lower light, rather than a different piece of art.
 *
 * This has been retuned twice, and both corrections were in the same
 * direction. The first pass drained it (`grayscale(0.42) brightness(0.9)`),
 * which on an asset that is ALREADY dark and low-chroma produced a muddy
 * grey-violet crest — broken art, not an unearned rank. The second softened
 * that but still carried enough grey that the centre emblem read visibly
 * greyer than the identical Bronze emblem in the chip beside it, which is
 * worse than either extreme: one rank, two colours, on one sheet.
 *
 * So the desaturation is gone. What remains is a small light difference —
 * about 8% of transparency and a hair of extra warmth — which is enough to
 * hold "not yet struck" without arguing with the metal. The badge under it
 * says BRONZE and the heading says Placement Series; the emblem does not need
 * to carry that message on its own, and it was damaging itself trying to.
 *
 * COHERENCE IS THE INVARIANT: the centre emblem and the right column's chip
 * are the same tier and must read as the same metal. Any future retune has to
 * keep chroma alone, and spend its budget on luminance.
 */
const BASELINE_EMBLEM_FILTER = "sepia(0.12) saturate(1.06) brightness(1.03) opacity(0.92)";

/**
 * The ink this hero writes in.
 *
 * The three columns now sit on beige parchment rather than on a navy plate, so
 * the palette they inherited is inverted: `text-foreground`, `muted-foreground`
 * and the pale `#e2c877` brass were all tuned to glow ON DARK, and every one of
 * them turns to a pale smear on a light sheet. These are their parchment
 * counterparts, dark enough to hold contrast on the sheet's own beige.
 *
 * Scoped to the three top columns ON PURPOSE. The rest of the lobby — the
 * study panel, the section headings, the classroom behind them — is still on
 * dark and keeps the palette it already had; nothing here recolours the page.
 */
/*
 * Every value below clears 4.5:1 against the parchment AT ITS DARKEST POINT
 * UNDER TEXT — a flanking scroll, at the inner edge where the edge shading
 * still bites: rgb(209,187,158). That is the binding case, not the sheet's
 * mid-tone, and it caps ink luminance at 0.0747.
 *
 * These values moved once already. The ageing pass darkened the sheet, and a
 * darker background does not merely shift dark ink's contrast — it REDUCES
 * it. Twelve runs that cleared 4.5:1 on the bright parchment fell as low as
 * 3.03 the moment the tone came down, so the palette is re-derived from the
 * composited background rather than carried across.
 */
const INK = {
  /** Headlines and figures: the darkest thing on the sheet. */
  strong: "#241708",
  /** Body copy and secondary lines. */
  body: "#3f2c14",
  /** Labels, captions, the quietest readable line. Still the quietest — it
   *  has to stay LIGHTER than `body`, which the first retune inverted. */
  faint: "#56412a",
  /** Section headings. Between `strong` and `brass`: dark enough to hold the
   *  top of the hierarchy on the sheet, warm enough to still read as a
   *  manuscript header rather than as body copy in caps. */
  heading: "#3a2708",
  /** Brass, dropped from a glow to a pigment so it reads on beige. */
  brass: "#533808",
  /** The interactive accent. The lobby's cyan, taken to a depth that holds
   *  against parchment instead of vanishing into it. */
  accent: "#08404f",
  /** Hairlines and tile borders, in the sheet's own brown. Carried down with
   *  the sheet's tone so the tiles do not dissolve into the darker beige. */
  rule: "rgba(96, 68, 28, 0.5)",
  /** A tile a shade deeper than the sheet, for grouped rows. */
  inset: "rgba(112, 82, 36, 0.16)",
  /** The press. One hairline of parchment-coloured light above each glyph,
   *  which is what a letterpress leaves behind and what separates ink that
   *  was printed ONTO the sheet from text that is merely sitting over it.
   *  Kept to a single sub-pixel offset: any more and it reads as a glow. */
  press: "0 1px 0 rgba(255, 249, 233, 0.5)",
} as const;

const OUTCOME_STYLE: Record<MatchHistoryEntryView["viewerOutcome"], { label: string; className: string }> = {
  win: { label: "Victory", className: "text-[#0d3f28]" },
  loss: { label: "Defeat", className: "text-[#6c1a21]" },
  draw: { label: "Draw", className: "text-[#4e3a24]" },
};

export default function RankedLobbyHero({
  progress,
  ranked,
  onPlayRanked,
  playDisabled = false,
  rankedRole = null,
  onSelectRole,
  roleSelectDisabled = false,
  roleSaving = null,
  rankedProgression = null,
  matchHistory = [],
  matchHistoryLoading = false,
  displayName = null,
  avatarUrl = null,
  signedIn = false,
}: {
  progress: QuizProgress | null;
  ranked: RankedState;
  onPlayRanked: () => void;
  playDisabled?: boolean;
  rankedRole?: RankedRole | null;
  /** Persist a role. Absent means role identity is read-only here. */
  onSelectRole?: (role: RankedRole) => void;
  roleSelectDisabled?: boolean;
  roleSaving?: RankedRole | null;
  rankedProgression?: RankedProgressionView | null;
  /** The account's real recent Ranked rows; empty when there are none. */
  matchHistory?: readonly MatchHistoryEntryView[];
  matchHistoryLoading?: boolean;
  displayName?: string | null;
  avatarUrl?: string | null;
  signedIn?: boolean;
}) {
  // ── Competitive identity (RE1-owned values, rendered as given) ──────────
  const tier = rankedProgression?.tier ?? null;
  const tierLabel = tier === null ? null : rankedTierLabel(tier);
  const showCompetitive = ranked.isPlaced && rankedProgression !== null && tier !== null;
  const rankName = showCompetitive ? `Ranked ${tierLabel}` : "Unranked";
  // Baseline art for anyone without a standing yet: the ladder's own floor,
  // not a sixth off-ladder emblem. `resolveQuizAssetUrl` on the legacy file
  // remains only as the last fallback if the Bronze emblem cannot resolve.
  const baselineEmblem =
    resolveRankedEmblemUrl(BASELINE_TIER, "large") ??
    resolveQuizAssetUrl("assets/ranks/unranked.png");
  const emblemUrl = showCompetitive
    ? resolveRankedEmblemUrl(tier, "large") ?? baselineEmblem
    : baselineEmblem;
  const atMaxTier = rankedProgression !== null && rankedProgression.nextTier === null;
  const placementDone = Math.max(0, PLACEMENT_TOTAL - ranked.placementMatchesRemaining);

  // ── Personal figures (real, or an em dash) ─────────────────────────────
  const answered = progressAttempts(progress);
  const accuracy =
    progress?.accuracy === undefined ||
    progress?.accuracy === null ||
    Number.isNaN(Number(progress.accuracy))
      ? null
      : Math.round(Number(progress.accuracy));

  // Academy standing — the personal study track, named as such. Null for a
  // backend without it or a token outside the five-tier vocabulary.
  const academyTier = parseRankTier(progress?.academy_tier);

  // Per-role record, counted from the same real rows the list below renders.
  const roleRecords = tallyRoleRecords(matchHistory);
  const rowsWithRole = matchHistory.filter((e) => e.viewerRole !== null).length;
  const recentMatches = matchHistory.slice(0, 3);

  const portrait = avatarUrl || MOGZY_MASCOT_ASSETS.base;

  // The right column's standing chip renders the same identity as the centre,
  // at chip size — one gate (`showCompetitive`), one baseline constant.
  const standingEmblem = showCompetitive
    ? resolveRankedEmblemUrl(tier, "small") ?? resolveRankedEmblemUrl(tier, "large")
    : resolveRankedEmblemUrl(BASELINE_TIER, "small") ??
      resolveRankedEmblemUrl(BASELINE_TIER, "large");

  return (
    <section
      data-testid="ranked-hero"
      className="relative grid grid-cols-1 items-stretch gap-3 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.05fr)_minmax(0,0.9fr)] lg:gap-4 xl:gap-6"
    >
      {/* ══ LEFT — role character select ═══════════════════════════════════ */}
      <div className="order-2 flex min-w-0 flex-col lg:order-1" data-testid="hero-role-column">
        <LobbyPanel variant="scroll" order="left">
        <ColumnHeading>Choose your role</ColumnHeading>
        {/* The role stage is the shortest of the three columns, so on the
            desktop rack (where all three plates share one height) it centres
            in its plate rather than leaving a tall empty foot below it. */}
        <RankedClassCarousel
          className="mt-1.5 lg:my-auto"
          value={rankedRole}
          onSelect={(role) => onSelectRole?.(role)}
          disabled={roleSelectDisabled || !onSelectRole}
          busyRole={roleSaving}
          records={rowsWithRole > 0 ? roleRecords : null}
          recordScopeLabel={rowsWithRole > 0 ? roleRecordScopeLabel(rowsWithRole) : undefined}
          surface="parchment"
        />
        </LobbyPanel>
      </div>

      {/* ══ CENTRE — the focal column ══════════════════════════════════════ */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="order-1 flex min-w-0 flex-col lg:order-2"
        data-testid="hero-play-column"
      >
        <LobbyPanel variant="scroll" order="centre" emphasis className="items-center text-center">
        {/* Its gradient stops were lifted again when the sheet darkened: the
            lightest one had fallen to 2.30:1, under even the 3.0 floor that
            large display type gets.

            The wordmark is sized against the SCROLL, not against the viewport
            — `.lc-scroll-wordmark` measures it in container units, so it can
            never overhang its own sheet at any width. The breakpoint steps it
            used to carry were tuned to a full-width panel and overhung the
            parchment at 1280.

            It was also a pale gold gradient built to glow on navy; on
            parchment it read as a smudge. Same metal, taken down into the
            pigment range — a struck-brass look on the sheet rather than a lit
            one over it. The highlight is a light top edge, not a halo. */}
        <h1
          className="lc-scroll-wordmark bg-gradient-to-b from-[#8a6414] via-[#63450c] to-[#3f2b05] bg-clip-text font-black leading-none tracking-[0.14em]"
          style={{
            // `.theme-lol h1` sets a flat gold `color` and outranks Tailwind's
            // single-class `.text-transparent`, so the clip-to-text gradient
            // was being painted over by the theme and never reached the
            // glyphs. Stated inline, where nothing outranks it.
            color: "transparent",
            WebkitTextFillColor: "transparent",
            filter: "drop-shadow(0 1px 0 rgba(255,246,222,0.65))",
          }}
        >
          LEAGUECRAFT
        </h1>
        <p
          className="mt-1 text-[11px] font-extrabold uppercase tracking-[0.52em] sm:text-xs"
          style={{ color: INK.accent, textShadow: INK.press }}
        >
          Ranked
        </p>

        {/* Emblem slot — sized for whatever emblem family RE1 ships next. */}
        <div
          className="relative mt-2 flex h-24 w-24 items-center justify-center rounded-full sm:h-28 sm:w-28"
          style={{
            /* Warm bronze rather than the old gold/cyan pair: on the baseline
               state the halo has to belong to the emblem inside it, and a
               cyan ring around a bronze emblem read as two rank systems. */
            background: showCompetitive
              ? "radial-gradient(circle, rgba(201,168,76,0.28) 0%, rgba(120,84,32,0.16) 46%, transparent 72%)"
              : "radial-gradient(circle, rgba(150,98,44,0.26) 0%, rgba(110,74,32,0.13) 48%, transparent 74%)",
          }}
        >
          {emblemUrl ? (
            <img
              src={emblemUrl}
              /* The alt deliberately says MORE than the badge does. The badge
                 reads only "Bronze" because "Placement Series" is directly
                 above it in the layout; a screen-reader user reaching this
                 image has no such adjacency, so the state is stated here. */
              alt={
                showCompetitive
                  ? `${tierLabel} ranked emblem`
                  : "Bronze — the baseline Ranked emblem, not yet earned"
              }
              data-tier={showCompetitive ? tier ?? undefined : undefined}
              data-baseline={showCompetitive ? undefined : BASELINE_TIER}
              style={showCompetitive ? undefined : { filter: BASELINE_EMBLEM_FILTER }}
              className="h-full w-full object-contain drop-shadow-[0_6px_10px_rgba(58,32,10,0.45)]"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          ) : (
            <Shield className="h-12 w-12 text-[#f0d78c]" />
          )}
        </div>

        <h2
          className="mt-1 text-xl font-extrabold tracking-tight sm:text-2xl"
          style={{ color: INK.strong, textShadow: INK.press }}
        >
          {ranked.isPlaced ? rankName : "Placement Series"}
        </h2>

        {/* The numeric Ranked rating, directly under the tier it belongs to. */}
        {showCompetitive ? (
          <p
            data-testid="hub-ranked-rating"
            className="text-[13px] font-bold tabular-nums"
            style={{ color: INK.body }}
          >
            {rankedProgression!.rating} Ranked rating
          </p>
        ) : (
          /* No competitive standing to show. The slot keeps its height so the
             gem does not jump when a rating arrives — and stays empty of any
             number, because a guessed rating is worse than none. */
          <p
            /* `min-h`, not `h`. The deeper manuscript inset narrows the
               centre column enough that this line wraps to two at some
               widths, and a hard 18px height let the badge below it sit on
               top of the second line. The slot still RESERVES its height so
               the seal does not jump when a rating arrives; it just no longer
               caps it. */
            className="min-h-[18px] text-[12px] font-medium leading-tight"
            style={{ color: INK.body }}
            data-testid="hub-ranked-rating-absent"
          >
            {ranked.isPlaced ? "" : "Rating set after placements"}
          </p>
        )}

        {!ranked.isPlaced && (
          /* Names the state as the ladder's FLOOR rather than as exclusion
             from it. It says only BRONZE: "baseline" is our internal word for
             this state, and the page has already said "Placement Series" and
             "Rating set after placements" directly above, so the reader
             already knows nothing has been earned yet. Spending a second word
             on it made the badge read like a system label instead of a rank.
             The internal semantics are unchanged and still checkable — see
             `data-baseline` on the emblem and `BASELINE_TIER` above. */
          <Badge
            variant="outline"
            data-testid="hub-ranked-baseline"
            className="mt-1.5 border-[#533808]/60 bg-[#533808]/16 text-[10px] font-extrabold uppercase tracking-wider text-[#4a3207]"
          >
            {rankedTierLabel(BASELINE_TIER)}
          </Badge>
        )}

        <RankedPlayGem className="mt-3" onClick={onPlayRanked} disabled={playDisabled} />

        {/* Stakes, directly under the action they belong to. */}
        {/* Wraps and carries a tighter gap: stacked at 768 the sheet's own
            margin leaves ~206px of writing area, and the fixed `gap-4` row
            was 1.3px wider than that at both ends. */}
        <div className="mt-3.5 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] font-semibold uppercase tracking-wider">
          <span className="flex items-center gap-1 text-[#0d3f28]">
            <TrendingUp className="h-3 w-3" />
            Win
            <span className="tabular-nums text-[#0a3220]">+{ranked.estimatedGain}</span>
            {/* No opacity here: on navy the suffix could be faded to sit back,
                on parchment the same 0.7 took it to ~3:1. It is held back by
                size and weight instead, which cost no contrast. */}
            <span className="text-[9px] font-medium">XP</span>
          </span>
          <span aria-hidden className="h-3 w-px" style={{ background: INK.rule }} />
          <span className="flex items-center gap-1 text-[#6c1a21]">
            <TrendingDown className="h-3 w-3" />
            Loss
            <span className="tabular-nums text-[#571219]">−{ranked.estimatedLoss}</span>
            <span className="text-[9px] font-medium">XP</span>
          </span>
        </div>

        {/* Status: the placement series, or progress toward the next tier. */}
        <div className="mt-2 w-full max-w-xs">
          {!ranked.isPlaced ? (
            <div
              className="rounded-md border px-2.5 py-1.5 text-left"
              style={{ borderColor: INK.rule, background: INK.inset }}
            >
              <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 text-[10.5px] uppercase tracking-wider">
                <span className="font-extrabold" style={{ color: INK.brass }}>
                  Placement {placementDone}/{PLACEMENT_TOTAL}
                </span>
                <span className="font-semibold" style={{ color: INK.faint }}>
                  {ranked.placementMatchesRemaining} placement
                  {ranked.placementMatchesRemaining === 1 ? " match" : " matches"} remaining
                </span>
              </div>
              {/* The default track is a dark theme colour and disappears into
                  parchment; both ends are stated here instead. */}
              <Progress
                value={(placementDone / PLACEMENT_TOTAL) * 100}
                className="mt-1 h-1.5 bg-[#60441c38] [&>*]:bg-[#5e420a]"
              />
              <p className="mt-1 text-[12px] font-medium leading-snug" style={{ color: INK.body }}>
                Complete your placement matches to establish your starting rank.
              </p>
            </div>
          ) : (
            showCompetitive && (
              <div data-testid="rank-progress" className="text-left">
                <Progress
                  value={rankedProgression!.progressPercent}
                  className="h-1.5 bg-[#60441c38] [&>*]:bg-[#5e420a]"
                />
                <div className="mt-0.5 text-[11px] font-semibold tabular-nums" style={{ color: INK.body }}>
                  {atMaxTier
                    ? "Challenger — the highest Ranked tier."
                    : `${rankedProgression!.ratingToNext} rating to ${rankedTierLabel(
                        rankedProgression!.nextTier!,
                      )}`}
                </div>
              </div>
            )
          )}
        </div>
        </LobbyPanel>
      </motion.div>

      {/* ══ RIGHT — personal identity ══════════════════════════════════════
          TEMPORARY, and still temporary after this pass. The portrait / crown /
          stat-strip / recent-rows stack is a placeholder standing in for a
          purpose-built Ranked identity module — one that should show the
          account's Ranked standing, its role identity and its live series
          state, not a generic profile card reused from the Academy track.
          The polish pass only changed its SURFACE: parchment ink weights, the
          deeper manuscript inset, and a standing chip that keeps it in the
          same Bronze-baseline state as the centre. Not one row, figure or
          module of the model itself moved, and the redesign is still owed.
          The Academy crown staying beside a Ranked standing chip is exactly
          the confusion the purpose-built panel should resolve. */}
      <div className="order-3 flex min-w-0 flex-col" data-testid="hero-profile-column">
        <LobbyPanel variant="scroll" order="right">
        <ColumnHeading align="right">Your record</ColumnHeading>

        {/* Portrait mirrors the left stage: same height, facing inward. */}
        <div className="relative mt-1.5 flex h-[244px] items-end justify-center sm:h-[288px] lg:h-[324px]">
          {/* On navy this was a glow behind the portrait. On parchment a glow
              is invisible, so the same slot does the opposite job: a soft warm
              shade that seats the figure on the sheet instead of lifting it
              off one. */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-6 bottom-10 top-4 rounded-[999px] blur-xl"
            style={{
              background:
                "radial-gradient(58% 50% at 50% 82%, rgba(84,56,20,0.32) 0%, transparent 70%)",
            }}
          />
          <img
            src={portrait}
            alt=""
            aria-hidden="true"
            draggable={false}
            data-testid="hero-personal-portrait"
            className="relative h-[86%] w-auto max-w-full -scale-x-100 object-contain drop-shadow-[0_14px_28px_rgba(0,0,0,0.6)]"
          />
          {/* Academy crown — the personal study track, named as Academy so it
              can never read as the Ranked standing in the centre column. */}
          {academyTier && (
            <div
              className="absolute right-0 top-2 flex flex-col items-center"
              data-testid="hero-academy-crown"
            >
              {/* `academyTierLabel` already prefixes "Academy" — the track is
                  named exactly once, by the one helper that owns the wording. */}
              <RankCrown
                rankName={academyTier}
                alt={`${academyTierLabel(academyTier)} crown`}
                size="profile"
              />
              {/* The crown sits over the portrait, so this label crosses two
                  backgrounds — parchment on one side, the mascot's own dark
                  art on the other. A parchment-coloured halo keeps it legible
                  on both without putting a chip or a plate around it. */}
              <span
                className="mt-0.5 text-[9.5px] font-extrabold uppercase tracking-[0.18em]"
                style={{
                  color: INK.brass,
                  textShadow:
                    "0 0 3px rgba(222,201,170,0.95), 0 0 6px rgba(222,201,170,0.85), 0 1px 0 rgba(222,201,170,0.9)",
                }}
              >
                {academyTierLabel(academyTier)}
              </span>
            </div>
          )}
        </div>

        <div className="mt-1 text-center">
          <div
            className="truncate text-lg font-extrabold tracking-tight"
            style={{ color: INK.strong, textShadow: INK.press }}
            data-testid="hero-display-name"
          >
            {displayName ?? (signedIn ? "Your profile" : "Guest")}
          </div>
          {rankedRole !== null && (
            <div
              data-testid="hub-ranked-role"
              className="text-[11px] font-bold uppercase tracking-[0.2em]"
              style={{ color: INK.accent }}
            >
              {RANKED_ROLE_LABELS[rankedRole]}
            </div>
          )}

          {/* Ranked standing, in the SAME state the centre column is in — the
              earned tier once there is one, and otherwise the identical
              Bronze, drawn with the identical held-back treatment.
              Without this the two columns disagreed: the centre said Bronze
              baseline while the right column's only rank art was the Academy
              crown, so the sheet showed two different ladders and named
              neither. It reads the same `showCompetitive` gate and invents
              nothing of its own. */}
          <div
            data-testid="hero-ranked-standing"
            className="mt-1.5 inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5"
            style={{ borderColor: INK.rule, background: INK.inset }}
          >
            {standingEmblem && (
              <img
                src={standingEmblem}
                alt=""
                aria-hidden="true"
                draggable={false}
                data-tier={showCompetitive ? tier ?? undefined : undefined}
                data-baseline={showCompetitive ? undefined : BASELINE_TIER}
                className="h-4 w-4 shrink-0 object-contain"
                style={showCompetitive ? undefined : { filter: BASELINE_EMBLEM_FILTER }}
              />
            )}
            <span
              className="text-[10px] font-extrabold uppercase tracking-[0.16em]"
              style={{ color: INK.brass }}
            >
              {showCompetitive ? `Ranked ${tierLabel}` : rankedTierLabel(BASELINE_TIER)}
            </span>
          </div>
        </div>

        {/* Compact stats — real progress figures, or an em dash. */}
        <div className="mt-2 grid grid-cols-2 gap-1.5" data-testid="hero-stat-strip">
          <HeroStat icon={Flame} label="Current streak" value={progress?.current_streak ?? 0} />
          <HeroStat icon={Trophy} label="Best streak" value={progress?.best_streak ?? 0} />
          <HeroStat icon={Target} label="Accuracy" value={accuracy === null ? "—" : `${accuracy}%`} />
          <HeroStat icon={Shield} label="Answered" value={answered} />
        </div>

        {/* Recent Ranked results — the account's own real rows, or nothing. */}
        <div className="mt-2" data-testid="hero-recent-matches">
          <div className="flex items-center gap-1.5 px-0.5">
            <History className="h-3 w-3" style={{ color: INK.accent }} aria-hidden="true" />
            <span
              className="text-[11px] font-extrabold uppercase tracking-[0.2em]"
              style={{ color: INK.accent, textShadow: INK.press }}
            >
              Recent Ranked
            </span>
          </div>
          <div className="mt-1 flex flex-col gap-1">
            {matchHistoryLoading ? (
              <p className="px-0.5 text-[12px] font-medium" style={{ color: INK.body }}>
                Loading…
              </p>
            ) : recentMatches.length === 0 ? (
              <p
                className="px-0.5 text-[12px] font-medium"
                style={{ color: INK.body }}
                data-testid="hero-recent-empty"
              >
                No ranked matches on record yet.
              </p>
            ) : (
              recentMatches.map((entry) => {
                const outcome = OUTCOME_STYLE[entry.viewerOutcome];
                return (
                  <div
                    key={entry.matchId}
                    data-testid="hero-recent-match"
                    className="flex items-center gap-2 rounded-md border px-2 py-1"
                    style={{ borderColor: INK.rule, background: INK.inset }}
                  >
                    <span className={`shrink-0 text-[10.5px] font-extrabold uppercase tracking-wider ${outcome.className}`}>
                      {outcome.label}
                    </span>
                    <span
                      className="min-w-0 flex-1 truncate text-[12px] font-medium"
                      style={{ color: INK.body }}
                    >
                      vs {entry.opponentIsBot ? "Bot" : entry.opponentDisplayName ?? "Opponent"}
                    </span>
                    {entry.viewerRole !== null && (
                      <span
                        className="shrink-0 text-[10.5px] font-semibold uppercase tracking-wider"
                        style={{ color: INK.accent }}
                      >
                        {RANKED_ROLE_LABELS[entry.viewerRole]}
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Same reason as the stakes row above: at the deepest inset the two
            links are a hair wider than the writing area, so the row wraps
            rather than reaching past the sheet's margin. */}
        <div className="mt-1.5 flex flex-wrap items-center justify-center gap-x-1 gap-y-0.5">
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="h-7 text-[11.5px] font-semibold text-[#3f2c14] hover:bg-[#60442024] hover:text-[#241708]"
          >
            <Link to="/profile">View full profile</Link>
          </Button>
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="h-7 text-[11.5px] font-semibold text-[#3f2c14] hover:bg-[#60442024] hover:text-[#241708]"
          >
            <Link to="/lol/history">Full history</Link>
          </Button>
        </div>
        </LobbyPanel>
      </div>
    </section>
  );
}

/**
 * A column's header, written as a manuscript heading rather than as a UI
 * label: a full step darker and heavier than the copy under it, pressed into
 * the sheet with `INK.press`, and closed by a ruled line that runs the width
 * of the column. The rule is what does most of the work — an underscored
 * heading is how a ledger separates a section, and it lets the heading state
 * hierarchy through structure instead of through yet more size.
 */
function ColumnHeading({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <div className="w-full">
      <div
        className={`text-[11px] font-extrabold uppercase tracking-[0.26em] ${
          align === "right" ? "text-center lg:text-right" : "text-center lg:text-left"
        }`}
        style={{ color: INK.heading, textShadow: INK.press }}
      >
        {children}
      </div>
      {/* Decorative: the heading's own text already carries the meaning. The
          rule fades at the far end so it reads as drawn by hand and not as a
          border on a box. */}
      <span
        aria-hidden="true"
        className="mt-1 block h-px w-full"
        style={{
          background:
            align === "right"
              ? "linear-gradient(270deg, rgba(83,56,8,0.55) 0%, rgba(83,56,8,0.12) 100%)"
              : "linear-gradient(90deg, rgba(83,56,8,0.55) 0%, rgba(83,56,8,0.12) 100%)",
        }}
      />
    </div>
  );
}

function HeroStat({
  icon: Icon,
  label,
  value,
}: {
  /* `style` as well as `className`: the icon is tinted with an `INK` value,
     which is a runtime constant and cannot be a Tailwind class. */
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div
      className="flex items-center gap-1.5 rounded-md border px-2 py-1 text-left"
      style={{ borderColor: INK.rule, background: INK.inset }}
    >
      <Icon className="h-3 w-3 shrink-0" style={{ color: INK.accent }} />
      <div className="min-w-0 leading-tight">
        <div
          className="text-[9px] font-semibold uppercase tracking-[0.12em]"
          style={{ color: INK.faint }}
        >
          {label}
        </div>
        <div
          className="truncate text-[13px] font-bold tabular-nums"
          style={{ color: INK.strong, textShadow: INK.press }}
        >
          {value}
        </div>
      </div>
    </div>
  );
}
