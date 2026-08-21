/**
 * LC1 / MALT — the Ranked lobby hero at /quiz.
 *
 * Three parchment scrolls, and — since the MALT information-architecture pass
 * — three SINGLE responsibilities, one per scroll. The whole point of the
 * restructure is that a reader can name what each sheet is for at a glance:
 *
 *   LEFT    ROLE.    "What am I playing, and how strong am I at it?"
 *                    The five-role stage, and the selected role's own MASTERY
 *                    RECORD — games, win rate, rating movement, last played —
 *                    counted from the account's real match rows.
 *   CENTRE  RANKED.  "Where do I stand, and what just happened?"
 *                    The LEAGUECRAFT wordmark, the Ranked emblem, the tier and
 *                    its progression, the one PLAY seal, and beneath it the
 *                    RECENT RANKED ledger.
 *   RIGHT   ACADEMY. "Who am I overall, and what are my long-term records?"
 *                    The player's portrait and Academy standing, and their
 *                    lifetime personal records.
 *
 * WHAT MOVED, AND WHY
 * ───────────────────
 * Recent Ranked history was on the RIGHT. It is Ranked, and the right sheet is
 * the Academy sheet, so it moved under PLAY where the rest of the competitive
 * identity already lives — a result ledger belongs beside the thing that
 * produced it. The right sheet's Ranked standing chip went with it: two sheets
 * naming the same ladder was the exact confusion this pass exists to end.
 *
 * PLACEMENTS ARE A STATE, NOT A SCREEN
 * ────────────────────────────────────
 * The centre used to be BUILT around placements: a "Placement Series"
 * headline, a Bronze pill, a boxed counter and an explanatory paragraph, all
 * permanent furniture for a condition that lasts five matches. The permanent
 * design is now the POST-placement steady state — tier, rating, progression —
 * and placements are one compact line inside that same block. Nothing about
 * placement HONESTY changed: until placements are complete the account still
 * has no tier and no rating is shown, and the emblem is still the ladder's
 * Bronze floor rather than an award. See `BASELINE_TIER`.
 *
 * There is no placement modal, popup or dialog on this surface and there was
 * never one to remove — placement status is, and stays, inline.
 *
 * PRESENTATION ONLY — the RE1 boundary
 * ────────────────────────────────────
 * Every value here arrives already resolved. This file computes no rating, no
 * tier, no threshold, no XP and no placement state; it renders the backend's
 * own figures and the host's own callbacks. The competitive identity in the
 * centre is the account's MOGZY RANKED standing (`rankedProgression`), and
 * the legacy Academy/quiz ladder is deliberately unreachable from it — the
 * Academy standing on the right is labelled as Academy and never as Ranked,
 * so the two tracks cannot read as one.
 *
 * DATA HONESTY
 * ────────────
 * Nothing on this surface is mocked. The role mastery ledger and the recent
 * results are the account's real match rows; the personal records are the
 * account's real progress figures; when a figure does not exist the row shows
 * an em dash and never a zero standing in for one.
 *
 * What the product does NOT expose, and which is therefore ABSENT here rather
 * than invented: per-role accuracy, per-role rating, per-role study-category
 * strength or weakness, and lifetime Ranked wins/losses (the history endpoint
 * serves a window, not a career).
 */

import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { useState } from "react";
import { History, Shield, TrendingDown, TrendingUp } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import RankCrown from "@/components/ranked/RankCrown";
import RankEmblem from "@/components/ranked/RankEmblem";
import RankedClassCarousel from "@/components/quiz/RankedClassCarousel";
import RankedPlayGem from "@/components/quiz/RankedPlayGem";
import LobbyPanel from "@/components/quiz/LobbyPanel";
import { MOGZY_MASCOT_ASSETS } from "@/components/mascot/mascot-assets";
import { progressAttempts, resolveQuizAssetUrl, type QuizProgress } from "@/lib/quiz/api";
import type { RankedState } from "@/lib/quiz/featured-mock";
import { RANKED_ROLE_LABELS, type RankedRole } from "@/lib/ranked-public/roles";
import { rankedTierLabel } from "@/lib/progression/rankedArt";
import { parseRankTier, type RankTier } from "@/lib/progression/tiers";
import { academyTierLabel, parseAcademyProgression } from "@/lib/progression/academy";
import type { RankedProgressionView, MatchHistoryEntryView } from "@/lib/ranked-public/contracts";
import {
  matchAgeLabel,
  tallyRoleMastery,
  type RoleMastery,
} from "@/lib/ranked-public/roleRecords";

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
 * it anywhere: the emblem carries `data-baseline` and never `data-tier`, the
 * copy says "Placement Series" and "Rating set after placements" and never
 * "Ranked Bronze", and the moment RE1 hands over a real tier the earned art
 * and the real tier name take over. The rating, the tier and the placement
 * count are still the backend's, unchanged and un-guessed.
 *
 * IT IS ALSO NOT A DIM PLACEHOLDER, and that is a deliberate reversal. The
 * baseline emblem used to be held back by draining its light, which put a
 * grey smudge at the top of the sheet directly above the PLAY seal — it read
 * as a broken image rather than as an unearned rank. The centre emblem is now
 * the page's ceremonial instance whether or not placements are done; what
 * marks the state is the baseline's own warm tint and halo tone plus the copy
 * around it, not an absence of light. See EARNED IS SEMANTICS, EMPHASIS IS
 * PRESENTATION in `RankEmblem.tsx`.
 *
 * It is `RankTier`-typed on purpose, so it can only ever be one of the five
 * canonical tiers, and it renders through the same `RankEmblem` every earned
 * emblem does — no second art path, no invented asset.
 */
const BASELINE_TIER: RankTier = "bronze";

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

/** How many recent Ranked rows the centre ledger shows. Four fits the sheet
 *  at every width the lobby supports without pushing the seal off the fold. */
const RECENT_LEDGER_ROWS = 4;

/**
 * A Role Mastery score — WHICH THE PRODUCT DOES NOT HAVE.
 *
 * There is no mastery score, mastery tier or per-role rating anywhere in
 * Mogzy today. "Mastery" in this codebase means the champion Mastery
 * Journeys at `/quiz/mastery`, which are a study feature and have nothing to
 * do with roles. Nothing computes one, no endpoint returns one, and this file
 * deliberately does not derive one.
 *
 * So this type exists for exactly one caller: the `/dev/lobby-preview` demo,
 * which supplies representative values so the mature-state summary band can
 * be judged before the product can fill it. `Quiz.tsx` — the real lobby —
 * passes nothing, which is asserted in the tests, and a real account
 * therefore never sees a score. It sees the neutral summary instead: its own
 * real recent win rate, labelled as recent.
 *
 * If a genuine mastery score is ever built, it arrives HERE, from the
 * backend, through the same prop — and the demo stops being the only source.
 */
export interface DemoRoleMastery {
  /** The figure shown large in the summary band. */
  score: number;
  /** The word beneath it — a mastery tier name, not a rank. */
  label: string;
}

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
  demoRoleMastery = null,
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
  /**
   * DEMO ONLY — see `DemoRoleMastery`. The product has no mastery score, and
   * the real lobby passes nothing here; only `/dev/lobby-preview` does, so
   * the mature-state band can be reviewed. Never fetched, never derived,
   * never persisted.
   */
  demoRoleMastery?: Partial<Record<RankedRole, DemoRoleMastery>> | null;
}) {
  // ── Competitive identity (RE1-owned values, rendered as given) ──────────
  const tier = rankedProgression?.tier ?? null;
  const tierLabel = tier === null ? null : rankedTierLabel(tier);
  const showCompetitive = ranked.isPlaced && rankedProgression !== null && tier !== null;
  // The emblem the columns render, as a tier and a state — the art path,
  // the halo, the baseline treatment and the fallback all belong to
  // `RankEmblem` now.
  const emblemTier: RankTier = showCompetitive ? tier! : BASELINE_TIER;
  // Last resort only, and only for the baseline: the legacy off-ladder file,
  // reached solely if the Bronze emblem itself fails to load.
  const legacyEmblemFallback = showCompetitive
    ? null
    : resolveQuizAssetUrl("assets/ranks/unranked.png");
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
  const totalXp = finiteOrNull(progress?.total_xp ?? progress?.xp);

  // Academy standing — the personal study track, named as such. The crown
  // still reads the bare tier token (so a backend that sends only that keeps
  // its crown), while the ledger's XP interval needs the whole coherent
  // block and renders nothing without it.
  const academyTier = parseRankTier(progress?.academy_tier);
  const academy = parseAcademyProgression(progress);

  // ── Role mastery, derived from the same real rows the centre lists ─────
  const roleMastery = tallyRoleMastery(matchHistory);
  // The role the STAGE is pointing at, which is not necessarily the account's
  // saved role: a reader spinning the ring expects the ledger under it to
  // follow their eye. Seeded from the saved role, then owned by the stage.
  const [browsedRole, setBrowsedRole] = useState<RankedRole>(rankedRole ?? "top");

  const recentMatches = matchHistory.slice(0, RECENT_LEDGER_ROWS);

  const portrait = avatarUrl || MOGZY_MASCOT_ASSETS.base;

  return (
    <section
      data-testid="ranked-hero"
      className="relative grid grid-cols-1 items-stretch gap-3 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.05fr)_minmax(0,0.9fr)] lg:gap-4 xl:gap-6"
    >
      {/* ══ LEFT — ROLE: the choice, and the record for it ═════════════════ */}
      <div className="order-2 flex min-w-0 flex-col lg:order-1" data-testid="hero-role-column">
        <LobbyPanel variant="scroll" order="left">
        {/* The lobby's one genuine pre-match DECISION. `ceremonial` gives it
            display size and — deliberately — no rule at all, so it reads as
            the title OF the selection below it rather than as a caption with
            a widget underneath. See `ColumnHeading`. */}
        <ColumnHeading ceremonial>Choose your role</ColumnHeading>
        <RankedClassCarousel
          /* Sits directly under the title with no divider between them: the
             two are one composed thing, and any gap here re-creates exactly
             the separation the title was enlarged to break. */
          className="mt-0.5"
          value={rankedRole}
          onSelect={(role) => onSelectRole?.(role)}
          onViewChange={setBrowsedRole}
          disabled={roleSelectDisabled || !onSelectRole}
          busyRole={roleSaving}
          /* The stage's own strip is off: the ledger below is the same tally
             at more depth, and two records stacked would state the W-L twice
             and disagree about which one is the summary. */
          showRecord={false}
          surface="parchment"
        />
        <RoleMasteryLedger
          role={browsedRole}
          mastery={roleMastery[browsedRole] ?? null}
          demoScore={demoRoleMastery?.[browsedRole] ?? null}
          loading={matchHistoryLoading}
        />
        </LobbyPanel>
      </div>

      {/* ══ CENTRE — RANKED: standing, the action, and what just happened ══ */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="order-1 flex min-w-0 flex-col lg:order-2"
        data-testid="hero-play-column"
      >
        <LobbyPanel variant="scroll" order="centre" emphasis className="items-center text-center">
        {/* The wordmark is sized against the SCROLL, not the viewport —
            `.lc-scroll-wordmark` measures it in container units, so it can
            never overhang its own sheet at any width. Struck brass on the
            sheet rather than a gold glow over it. */}
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

        {/* The Ranked emblem. One component owns the art, the halo, the
            baseline treatment, the glint and the fallback. This column states
            only WHICH tier and WHETHER it has been earned. */}
        <RankEmblem
          className="mt-2"
          variant="hero"
          emphasis="ceremonial"
          tier={emblemTier}
          earned={showCompetitive}
          /* The alt deliberately says MORE than the heading does: a screen
             reader arriving at this image has no layout adjacency to read the
             placement line from, so the state is stated here. */
          alt={
            showCompetitive
              ? `${tierLabel} ranked emblem`
              : "Bronze — the baseline Ranked emblem, not yet earned"
          }
          fallbackSrc={legacyEmblemFallback}
          fallback={<Shield className="h-12 w-12 text-[#f0d78c]" />}
        />

        {/* ── Ranked status ────────────────────────────────────────────────
            One block, in two states. The PERMANENT design is the placed one —
            tier, rating, progression — and placements are a temporary line
            inside it rather than a screen of their own. The heading is always
            the tier NAME (the ladder's Bronze floor while unplaced), never a
            system label like "Placement Series". */}
        <h2
          data-testid="hub-ranked-tier"
          className="mt-1 text-xl font-extrabold uppercase tracking-[0.12em] sm:text-2xl"
          style={{ color: INK.strong, textShadow: INK.press }}
        >
          {showCompetitive ? tierLabel : rankedTierLabel(BASELINE_TIER)}
        </h2>

        <div className="mt-0.5 w-full max-w-[17rem]">
          {showCompetitive ? (
            <>
              <p
                data-testid="hub-ranked-rating"
                className="text-[13px] font-bold tabular-nums"
                style={{ color: INK.body }}
              >
                {rankedProgression!.rating} Ranked rating
              </p>
              <div data-testid="rank-progress" className="mt-1">
                <Progress
                  value={rankedProgression!.progressPercent}
                  className="h-1.5 bg-[#60441c38] [&>*]:bg-[#5e420a]"
                />
                <div
                  className="mt-0.5 text-[11px] font-semibold tabular-nums"
                  style={{ color: INK.body }}
                >
                  {atMaxTier
                    ? "Challenger — the highest Ranked tier."
                    : `${rankedProgression!.ratingToNext} rating to ${rankedTierLabel(
                        rankedProgression!.nextTier!,
                      )}`}
                </div>
              </div>
            </>
          ) : !ranked.isPlaced ? (
            /* PLACEMENTS — deliberately the smaller state. Two short lines
               and the same bar the placed state uses, and no rating: a
               guessed one is worse than none. The old boxed panel, its Bronze
               pill and its explanatory paragraph are gone; what they said is
               said by "Placement 0 / 5" and by the emblem being the floor. */
            <div data-testid="hub-ranked-placement">
              <p
                data-testid="hub-ranked-rating-absent"
                className="text-[12px] font-bold tabular-nums"
                style={{ color: INK.body }}
              >
                Placement {placementDone} / {PLACEMENT_TOTAL}
              </p>
              <Progress
                value={(placementDone / PLACEMENT_TOTAL) * 100}
                className="mt-1 h-1.5 bg-[#60441c38] [&>*]:bg-[#5e420a]"
              />
              <p
                className="mt-0.5 text-[11px] font-semibold leading-tight"
                style={{ color: INK.faint }}
              >
                {ranked.placementMatchesRemaining}{" "}
                {ranked.placementMatchesRemaining === 1 ? "match" : "matches"} remaining · rating
                set after placements
              </p>
            </div>
          ) : (
            /* PLACED, but the progression endpoint gave us nothing — a guest,
               an older backend, a rate limit. NOT a placement state: showing
               a placement counter here would claim the account is mid-series
               when the truth is that we could not read its standing. The
               emblem stays the unearned Bronze floor and no rating appears. */
            <p
              data-testid="hub-ranked-standing-absent"
              className="text-[11.5px] font-semibold leading-tight"
              style={{ color: INK.faint }}
            >
              No Ranked standing on record yet.
            </p>
          )}
        </div>

        <RankedPlayGem className="mt-3" onClick={onPlayRanked} disabled={playDisabled} />

        {/* Stakes, directly under the action they belong to. Wraps and carries
            a tighter gap: stacked at 768 the sheet's own margin leaves ~206px
            of writing area, and a fixed `gap-4` row overran it at both ends. */}
        <div className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] font-semibold uppercase tracking-wider">
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

        {/* ── Recent Ranked, moved here from the Academy sheet ───────────── */}
        <RecentRankedLedger
          entries={recentMatches}
          loading={matchHistoryLoading}
          className="mt-3"
        />
        </LobbyPanel>
      </motion.div>

      {/* ══ RIGHT — ACADEMY: who I am, and my long-term records ════════════
          No Ranked identity on this sheet. The standing chip and the recent
          results that used to sit here belong to the centre column and now
          live there, so the Academy crown is the only rank art in this
          column and cannot be misread as the competitive tier. */}
      <div className="order-3 flex min-w-0 flex-col" data-testid="hero-profile-column">
        <LobbyPanel variant="scroll" order="right">
        <ColumnHeading align="right">Academy record</ColumnHeading>

        {/* Portrait mirrors the left stage: same height, facing inward. The
            size is APPROVED and deliberately unchanged by this pass. */}
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
        </div>

        <div className="mt-1 w-full text-center">
          <div
            className="truncate text-lg font-extrabold tracking-tight"
            style={{ color: INK.strong, textShadow: INK.press }}
            data-testid="hero-display-name"
          >
            {displayName ?? (signedIn ? "Your profile" : "Guest")}
          </div>

          {/* ── The Academy identity lockup ───────────────────────────────
              The crown, the tier it stands for, and the progress toward the
              next one, as ONE object under the name.

              The crown used to float at the top-right corner of the portrait
              while the words "Academy Gold" sat far below it, under the
              mascot — two halves of a single statement separated by 300px of
              art, so neither explained the other and the emblem read as
              decoration. Same crown, same size, moved into the sentence it
              belongs to: emblem, then rank, then the climb.

              This is the ONE rank statement on the sheet. The competitive
              tier is the centre column's, and the two must never be read as
              the same ladder — which is why the wording here always comes
              from `academyTierLabel`, the one helper that prefixes "Academy". */}
          {academyTier && (
            <div className="mt-2 w-full" data-testid="hero-academy-standing">
              <div className="flex items-center justify-center gap-2">
                <RankCrown
                  rankName={academyTier}
                  alt={`${academyTierLabel(academyTier)} crown`}
                  size="profile"
                />
                <div className="min-w-0 text-left">
                  <div
                    className="text-[9px] font-bold uppercase tracking-[0.2em]"
                    style={{ color: INK.faint }}
                  >
                    Academy rank
                  </div>
                  {/* The TIER alone. "Academy" is stated directly above by
                      the caption, and printing it twice in a two-line lockup
                      both read as a stutter and truncated the value in the
                      column ("ACADEMY G…"). The track is still named beside
                      the tier every time it appears — which is the actual RE1
                      requirement — and the crown's alt carries the full
                      `academyTierLabel` for a reader with no layout. */}
                  <div
                    data-testid="hero-academy-tier"
                    className="truncate text-[16px] font-black uppercase tracking-[0.1em]"
                    style={{ color: INK.brass, textShadow: INK.press }}
                  >
                    {rankedTierLabel(academyTier)}
                  </div>
                </div>
              </div>

              {/* The interval, only when the backend sends the whole coherent
                  block — a partial payload keeps the crown and the rank and
                  simply draws no bar, rather than rendering half a migration. */}
              {academy && (
                <div className="mt-1.5">
                  <Progress
                    value={academy.progressPercent}
                    className="h-1.5 bg-[#60441c38] [&>*]:bg-[#5e420a]"
                  />
                  <div
                    className="mt-0.5 text-[11px] font-semibold tabular-nums"
                    style={{ color: INK.body }}
                  >
                    {academy.isMaxTier || academy.nextTier === null
                      ? "The highest Academy tier."
                      : `${academy.xpToNext.toLocaleString()} XP to ${academyTierLabel(
                          academy.nextTier,
                        )}`}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Personal records — the long-term ledger ──────────────────────
            The four rounded stat tiles are gone. These are the same real
            figures written as ruled record lines: a label on the left, its
            figure on the right, a hairline between each pair. That is how a
            ledger states a record, and it is the treatment the sheet was
            asking for — the tiles read as dashboard cards dropped onto
            parchment. Every row is real or an em dash; none is invented. */}
        <LedgerBlock title="Personal records" className="mt-2.5" testId="hero-personal-records">
          <LedgerRow label="Questions answered" value={answered ? answered.toLocaleString() : "—"} />
          <LedgerRow label="All-time accuracy" value={accuracy === null ? "—" : `${accuracy}%`} />
          <LedgerRow label="Current streak" value={progress?.current_streak ?? "—"} />
          <LedgerRow label="Best streak" value={progress?.best_streak ?? "—"} />
          <LedgerRow
            label="Academy XP"
            value={totalXp === null ? "—" : totalXp.toLocaleString()}
          />
          {/* Ranked matches RATED is a career figure the progression endpoint
              really does carry, unlike wins/losses — the history endpoint
              serves a window, so a lifetime W-L would have to be guessed and
              is therefore absent. */}
          <LedgerRow
            label="Ranked matches"
            value={rankedProgression === null ? "—" : rankedProgression.matchesRated.toLocaleString()}
          />
        </LedgerBlock>

        {/* Same reason as the stakes row: at the deepest inset the two links
            are a hair wider than the writing area, so the row wraps rather
            than reaching past the sheet's margin. */}
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

/** A finite number off the wire, or null. Rejects NaN, Infinity and strings. */
function finiteOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * The selected role's MASTERY RECORD: a summary band, then the detail.
 *
 * THE SUMMARY BAND, AND WHY IT IS NOT A SCORE
 * ───────────────────────────────────────────
 * The band exists to give the sheet a transition — from "this is the role I
 * am choosing" to "this is how I perform in it" — which a straight run of
 * ledger rows did not. It always has the same shape: one large figure, the
 * word that qualifies it, and the record beneath. What fills it depends on
 * what is actually known:
 *
 *   demo       the representative mastery score, supplied ONLY by
 *              `/dev/lobby-preview` (see `DemoRoleMastery`);
 *   real       the account's own recent win rate, labelled as RECENT;
 *   no rows    an em dash and "Mastery not established" — never a 0%.
 *
 * The middle case is the important one. There is no mastery score in the
 * product, so a real account is shown a NEUTRAL SUMMARY of figures it can
 * verify in its own history rather than a number this file made up.
 *
 * SCOPE HONESTY, WITHOUT A FOOTNOTE
 * ─────────────────────────────────
 * These figures come from `/api/ranked/history`, which is capped server-side
 * at 50 rows (`HISTORY_MAX_LIMIT`) and requested here at 20 — so they are
 * RECENT FORM and cannot be lifetime totals, whatever the lobby would prefer.
 *
 * The old treatment stated that in a footnote ("Last 20 ranked matches").
 * The footnote is gone, and the scope moved INTO the labels instead: the
 * section is "recent form", the rows say "Recent matches", "Recent record",
 * "Recent win rate". That removes the line the owner asked to remove without
 * removing the truth it carried — a figure that says "recent" on its own face
 * cannot be misread as a career total, and a footnote is the first thing a
 * reader skips.
 *
 * Lifetime per-role totals need a backend aggregate that does not exist yet;
 * see `tallyRoleMastery`. When it lands, these labels drop the word "recent"
 * and nothing else about this component changes.
 */
function RoleMasteryLedger({
  role,
  mastery,
  demoScore,
  loading,
}: {
  role: RankedRole;
  mastery: RoleMastery | null;
  /** DEMO ONLY. Null for every real account — see `DemoRoleMastery`. */
  demoScore: DemoRoleMastery | null;
  loading: boolean;
}) {
  const age = matchAgeLabel(mastery?.lastPlayedAt ?? null);
  const swing =
    mastery?.netRating === null || mastery?.netRating === undefined
      ? "—"
      : `${mastery.netRating > 0 ? "+" : ""}${mastery.netRating}`;

  const figure = demoScore
    ? String(demoScore.score)
    : mastery
      ? `${mastery.winRatePercent}%`
      : "—";
  const qualifier = demoScore
    ? demoScore.label
    : mastery
      ? "Recent win rate"
      /* Short on purpose: "ROLE MASTERY" is ruled directly above this line,
         so repeating the word here only made the qualifier wrap to three
         cramped lines beside a single em dash. */
      : "Not established";

  return (
    <div className="mt-2.5 w-full" data-testid="role-mastery-ledger" data-role={role}>
      <LedgerTitle>Role mastery</LedgerTitle>

      {/* ── The summary band ─────────────────────────────────────────────
          Ruled top and bottom rather than boxed: two hairlines with the
          figure written between them is how a ledger sets a total apart,
          and it keeps the sheet free of one more rounded rectangle. */}
      <div
        data-testid="role-mastery-summary"
        className="mt-1 flex items-baseline justify-between gap-2 border-b py-1.5"
        style={{ borderColor: INK.rule }}
      >
        <div className="min-w-0">
          <div
            data-testid="role-mastery-figure"
            className="text-[26px] font-black leading-none tabular-nums"
            style={{ color: INK.strong, textShadow: INK.press }}
          >
            {loading ? "…" : figure}
          </div>
          <div
            className="mt-1 text-[10px] font-bold uppercase tracking-[0.16em]"
            style={{ color: INK.faint }}
          >
            {qualifier}
          </div>
        </div>
        <div className="shrink-0 text-right">
          {mastery ? (
            <>
              <div
                className="text-[14px] font-extrabold tabular-nums"
                style={{ color: INK.strong, textShadow: INK.press }}
              >
                {mastery.wins}W · {mastery.losses}L
                {mastery.draws > 0 ? ` · ${mastery.draws}D` : ""}
              </div>
              <div
                className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.16em]"
                style={{ color: INK.faint }}
              >
                Recent record
              </div>
            </>
          ) : (
            <div
              className="max-w-[9.5rem] text-[11.5px] font-medium leading-snug"
              style={{ color: INK.body }}
              data-testid="role-mastery-empty"
            >
              No ranked games on this role yet.
            </div>
          )}
        </div>
      </div>

      {/* ── The detail. Three rows, because the band above already carries
             the record and the win rate — repeating them here would make the
             summary decorative rather than a summary. ─────────────────── */}
      <LedgerRow
        label="Recent matches"
        value={loading ? "…" : mastery ? mastery.games : "—"}
      />
      <LedgerRow label="Rating swing" value={swing} />
      <LedgerRow label="Last played" value={age ?? "—"} />
    </div>
  );
}

/**
 * Recent Ranked results, as a duel record rather than as table rows.
 *
 * MOVED HERE from the Academy sheet by the MALT pass: a result ledger belongs
 * under the action that produced it, and the right-hand sheet is the Academy's.
 *
 * Real rows only. `ratingDelta` is rendered when the backend applied one and
 * omitted when it did not — a skipped or pre-F2.2 result shows no number
 * rather than a zero standing in for "unknown".
 *
 * FOUR COLUMNS, FIXED, IN ONE GRID
 * ────────────────────────────────
 * The rows used to be a flex line of four differently-sized runs of text, so
 * nothing lined up down the ledger: the opponent started at a different x on
 * every row and the deltas drifted with the role names beside them. They are
 * a `grid` with stated column widths now, which is what makes a ledger
 * scannable — the eye reads DOWN the outcome column to count wins, and down
 * the delta column to read the swing, without reading any row in full.
 *
 * The outcome is the loudest thing in the row and the role the quietest, in
 * that order, because "did I win?" is the question this list answers. The
 * delta column reserves its width whether or not a row has a number, so a
 * row without one leaves a gap in the column rather than pulling the row's
 * other three cells out of alignment.
 *
 * THE COLUMNS ARE TIGHT BECAUSE THE SHEET IS
 * ──────────────────────────────────────────
 * The scroll's writing area is about 224px at EVERY viewport — it is a
 * fraction of a column which is itself a fraction of the grid, so it does not
 * widen on a bigger screen. Five columns have to live in it, and the first
 * draft spent so much of it on fixed cells that the opponent — the one cell
 * a reader actually reads — was left about 47px and truncated real names to
 * "Belvet…".
 *
 * So every fixed cell is cut to what it needs and the opponent takes the
 * rest. The marker is what pays for it: a filled-or-hollow nib in the margin
 * carries win/loss on its own, which lets the word beside it drop to 10px
 * without costing any scannability — the column can still be counted at a
 * glance, and it is now the NAMES that are legible.
 */
function RecentRankedLedger({
  entries,
  loading,
  className = "",
}: {
  entries: readonly MatchHistoryEntryView[];
  loading: boolean;
  className?: string;
}) {
  return (
    <div className={`w-full ${className}`} data-testid="hero-recent-matches">
      <LedgerTitle icon={History}>Recent ranked</LedgerTitle>
      {loading ? (
        <p className="mt-1 text-[12px] font-medium" style={{ color: INK.body }}>
          Loading…
        </p>
      ) : entries.length === 0 ? (
        <p
          className="mt-1 text-[12px] font-medium"
          style={{ color: INK.body }}
          data-testid="hero-recent-empty"
        >
          No ranked matches on record yet.
        </p>
      ) : (
        <ul className="mt-1 w-full">
          {entries.map((entry) => {
            const outcome = OUTCOME_STYLE[entry.viewerOutcome];
            const won = entry.viewerOutcome === "win";
            return (
              <li
                key={entry.matchId}
                data-testid="hero-recent-match"
                className="grid grid-cols-[7px_44px_minmax(0,1fr)_auto_34px] items-center gap-x-1.5 border-b py-[5px] text-left last:border-b-0"
                style={{ borderColor: INK.rule }}
              >
                {/* The result mark. A ledger keeps its verdict in the margin,
                    so the column can be counted without reading the entries —
                    a filled nib for a win, a hollow one for anything else. */}
                <span
                  aria-hidden="true"
                  className="h-[7px] w-[7px] rotate-45"
                  style={
                    won
                      ? { background: "#0d3f28" }
                      : { border: `1.5px solid ${entry.viewerOutcome === "loss" ? "#6c1a21" : INK.faint}` }
                  }
                />
                <span
                  className={`text-[10px] font-extrabold uppercase tracking-normal ${outcome.className}`}
                >
                  {outcome.label}
                </span>
                <span
                  className="min-w-0 truncate text-left text-[12.5px] font-semibold"
                  style={{ color: INK.strong }}
                  title={entry.opponentIsBot ? "Bot" : entry.opponentDisplayName ?? "Opponent"}
                >
                  {entry.opponentIsBot ? "Bot" : entry.opponentDisplayName ?? "Opponent"}
                </span>
                <span
                  className="text-[9px] font-bold uppercase tracking-[0.06em]"
                  style={{ color: INK.faint }}
                >
                  {entry.viewerRole !== null ? RANKED_ROLE_LABELS[entry.viewerRole] : ""}
                </span>
                {/* The column keeps its width whether or not this row has a
                    number, so one delta-less row cannot shift the three cells
                    beside it out of the ledger's alignment. */}
                <span
                  data-testid={entry.ratingDelta === null ? undefined : "hero-recent-delta"}
                  className={`text-right text-[12px] font-extrabold tabular-nums ${
                    entry.ratingDelta === null
                      ? ""
                      : entry.ratingDelta > 0
                        ? "text-[#0d3f28]"
                        : entry.ratingDelta < 0
                          ? "text-[#6c1a21]"
                          : ""
                  }`}
                  style={
                    entry.ratingDelta === null || entry.ratingDelta === 0
                      ? { color: INK.faint }
                      : undefined
                  }
                >
                  {entry.ratingDelta === null
                    ? "·"
                    : entry.ratingDelta > 0
                      ? `+${entry.ratingDelta}`
                      : entry.ratingDelta}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/**
 * A column's header, written as a manuscript heading rather than as a UI
 * label: a full step darker and heavier than the copy under it, pressed into
 * the sheet with `INK.press`, and closed by a ruled line that runs the width
 * of the column. The rule is what does most of the work — an underscored
 * heading is how a ledger separates a section, and it lets the heading state
 * hierarchy through structure instead of through yet more size.
 *
 * `ceremonial` is the left sheet's "Choose your role", and it deliberately
 * breaks the pattern: it carries NO RULE AT ALL.
 *
 * That is the whole point of it. A ruled heading is a SECTION marker — it
 * says "a labelled part of this sheet begins here", which is exactly how the
 * role title used to read: a small caption, a divider, and then an unrelated
 * carousel widget underneath. The role choice is not a section of the left
 * parchment; it IS the left parchment. So the title takes display size and
 * centres itself over the stage with nothing drawn between them, and the
 * figures below become the thing it is naming rather than the next widget
 * down. It stays ink and press — no second gold gradient, because the centre
 * wordmark owns that and two would fight.
 */
function ColumnHeading({
  children,
  align = "left",
  ceremonial = false,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  ceremonial?: boolean;
}) {
  const rule = (opacity: string) =>
    align === "right"
      ? `linear-gradient(270deg, rgba(83,56,8,${opacity}) 0%, rgba(83,56,8,0.12) 100%)`
      : `linear-gradient(90deg, rgba(83,56,8,${opacity}) 0%, rgba(83,56,8,0.12) 100%)`;

  if (ceremonial) {
    return (
      <div
        className="w-full text-center"
        data-testid="column-heading-ceremonial"
      >
        {/* One line at every supported width. A display title that breaks
            mid-phrase reads as an overflow, not as a title — so the size
            steps with the breakpoint and the letterspacing steps down as it
            goes up, which is what keeps the measure inside the sheet. */}
        <div
          className="lc-scroll-title whitespace-nowrap font-black uppercase leading-none tracking-[0.13em]"
          style={{ color: INK.strong, textShadow: INK.press }}
        >
          {children}
        </div>
      </div>
    );
  }

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
        style={{ background: rule("0.55") }}
      />
    </div>
  );
}

/** A ledger section: a small ruled title, then the record rows under it. */
function LedgerBlock({
  title,
  children,
  className = "",
  testId,
  ...rest
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
  testId?: string;
} & Record<string, unknown>) {
  return (
    <div className={`w-full ${className}`} data-testid={testId} {...rest}>
      <LedgerTitle>{title}</LedgerTitle>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}

/** The ledger's own heading: small caps in the accent ink, over a hairline. */
function LedgerTitle({
  children,
  icon: Icon,
}: {
  children: React.ReactNode;
  icon?: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
}) {
  return (
    <div className="w-full">
      <div className="flex items-center gap-1.5">
        {Icon && <Icon className="h-3 w-3 shrink-0" style={{ color: INK.accent }} />}
        <span
          className="text-[10.5px] font-extrabold uppercase tracking-[0.2em]"
          style={{ color: INK.accent, textShadow: INK.press }}
        >
          {children}
        </span>
      </div>
      <span
        aria-hidden="true"
        className="mt-0.5 block h-px w-full"
        style={{ background: "linear-gradient(90deg, rgba(83,56,8,0.42) 0%, rgba(83,56,8,0.10) 100%)" }}
      />
    </div>
  );
}

/**
 * One ruled record line: the label on the left, its figure on the right, and
 * a hairline closing the pair. No box, no fill, no rounded corner — the row
 * IS the record, exactly as a ruled ledger writes one.
 */
function LedgerRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div
      data-testid="ledger-row"
      className="flex items-baseline justify-between gap-2 border-b py-[3px] last:border-b-0"
      style={{ borderColor: INK.rule }}
    >
      <span
        className="min-w-0 truncate text-[11px] font-semibold"
        style={{ color: INK.faint }}
      >
        {label}
      </span>
      <span
        className="shrink-0 text-[12.5px] font-bold tabular-nums"
        style={{ color: INK.strong, textShadow: INK.press }}
      >
        {value}
      </span>
    </div>
  );
}
