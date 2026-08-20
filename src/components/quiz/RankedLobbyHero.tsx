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
 * are complete the player is UNRANKED — the unranked emblem and the placement
 * series, never a provisional tier, even when a rating already exists.
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
import { parseRankTier } from "@/lib/progression/tiers";
import { academyTierLabel } from "@/lib/progression/academy";
import type { RankedProgressionView, MatchHistoryEntryView } from "@/lib/ranked-public/contracts";
import { tallyRoleRecords, roleRecordScopeLabel } from "@/lib/ranked-public/roleRecords";

const PLACEMENT_TOTAL = 5;

const OUTCOME_STYLE: Record<MatchHistoryEntryView["viewerOutcome"], { label: string; className: string }> = {
  win: { label: "Victory", className: "text-emerald-300" },
  loss: { label: "Defeat", className: "text-rose-300" },
  draw: { label: "Draw", className: "text-muted-foreground" },
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
  const unrankedEmblem = resolveQuizAssetUrl("assets/ranks/unranked.png");
  const emblemUrl = showCompetitive
    ? resolveRankedEmblemUrl(tier, "large") ?? unrankedEmblem
    : unrankedEmblem;
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

  return (
    <section
      data-testid="ranked-hero"
      className="relative grid grid-cols-1 items-stretch gap-3 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.05fr)_minmax(0,0.9fr)] lg:gap-4 xl:gap-6"
    >
      {/* ══ LEFT — role character select ═══════════════════════════════════ */}
      <div className="order-2 flex min-w-0 flex-col lg:order-1" data-testid="hero-role-column">
        <LobbyPanel>
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
        <LobbyPanel emphasis className="items-center text-center">
        {/* The wordmark steps DOWN at `lg` on purpose: that is where the
            single stacked column becomes the three-column rack and the centre
            plate is at its narrowest, so the largest sizes are held back until
            `xl`/`2xl` widen it again. Sized to fit the plate at every step —
            it never overhangs its own panel. */}
        <h1 className="bg-gradient-to-b from-[#fdf3d2] via-[#e8cd85] to-[#b7913c] bg-clip-text text-[30px] font-black leading-none tracking-[0.14em] text-transparent drop-shadow-[0_2px_12px_rgba(201,168,76,0.35)] sm:text-[40px] lg:text-[36px] xl:text-[46px] 2xl:text-[52px]">
          LEAGUECRAFT
        </h1>
        <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.52em] text-[#7fd6ef]/80 sm:text-xs">
          Ranked
        </p>

        {/* Emblem slot — sized for whatever emblem family RE1 ships next. */}
        <div
          className="relative mt-2 flex h-24 w-24 items-center justify-center rounded-full sm:h-28 sm:w-28"
          style={{
            background:
              "radial-gradient(circle, rgba(201,168,76,0.30) 0%, rgba(80,170,220,0.16) 46%, transparent 72%)",
          }}
        >
          {emblemUrl ? (
            <img
              src={emblemUrl}
              alt={showCompetitive ? `${tierLabel} ranked emblem` : "Unranked"}
              data-tier={tier ?? undefined}
              className="h-full w-full object-contain drop-shadow-[0_0_22px_rgba(201,168,76,0.55)]"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          ) : (
            <Shield className="h-12 w-12 text-[#f0d78c]" />
          )}
        </div>

        <h2 className="mt-1 text-xl font-bold tracking-tight text-foreground sm:text-2xl">
          {ranked.isPlaced ? rankName : "Placement Series"}
        </h2>

        {/* The numeric Ranked rating, directly under the tier it belongs to. */}
        {showCompetitive ? (
          <p
            data-testid="hub-ranked-rating"
            className="text-[12px] font-semibold tabular-nums text-muted-foreground"
          >
            {rankedProgression!.rating} Ranked rating
          </p>
        ) : (
          /* No competitive standing to show. The slot keeps its height so the
             gem does not jump when a rating arrives — and stays empty of any
             number, because a guessed rating is worse than none. */
          <p className="h-[18px] text-[12px] text-muted-foreground" data-testid="hub-ranked-rating-absent">
            {ranked.isPlaced ? "" : "Rating set after placements"}
          </p>
        )}

        {!ranked.isPlaced && (
          <Badge
            variant="outline"
            className="mt-1.5 border-amber-400/60 bg-amber-400/15 text-[10px] font-bold uppercase tracking-wider text-amber-200"
          >
            Unranked
          </Badge>
        )}

        <RankedPlayGem className="mt-3" onClick={onPlayRanked} disabled={playDisabled} />

        {/* Stakes, directly under the action they belong to. */}
        <div className="mt-3.5 flex items-center gap-4 text-[11px] font-semibold uppercase tracking-wider">
          <span className="flex items-center gap-1 text-emerald-300">
            <TrendingUp className="h-3 w-3" />
            Win
            <span className="tabular-nums text-emerald-200">+{ranked.estimatedGain}</span>
            <span className="text-[9px] font-medium opacity-70">XP</span>
          </span>
          <span aria-hidden className="h-3 w-px bg-border/60" />
          <span className="flex items-center gap-1 text-rose-300">
            <TrendingDown className="h-3 w-3" />
            Loss
            <span className="tabular-nums text-rose-200">−{ranked.estimatedLoss}</span>
            <span className="text-[9px] font-medium opacity-70">XP</span>
          </span>
        </div>

        {/* Status: the placement series, or progress toward the next tier. */}
        <div className="mt-2 w-full max-w-xs">
          {!ranked.isPlaced ? (
            <div className="rounded-md border border-amber-400/25 bg-amber-400/5 px-2.5 py-1.5 text-left">
              <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 text-[10px] uppercase tracking-wider">
                <span className="font-bold text-amber-200">
                  Placement {placementDone}/{PLACEMENT_TOTAL}
                </span>
                <span className="text-muted-foreground">
                  {ranked.placementMatchesRemaining} placement
                  {ranked.placementMatchesRemaining === 1 ? " match" : " matches"} remaining
                </span>
              </div>
              <Progress value={(placementDone / PLACEMENT_TOTAL) * 100} className="mt-1 h-1.5" />
              <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                Complete your placement matches to establish your starting rank.
              </p>
            </div>
          ) : (
            showCompetitive && (
              <div data-testid="rank-progress" className="text-left">
                <Progress value={rankedProgression!.progressPercent} className="h-1.5" />
                <div className="mt-0.5 text-[10px] tabular-nums text-muted-foreground">
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

      {/* ══ RIGHT — personal identity ══════════════════════════════════════ */}
      <div className="order-3 flex min-w-0 flex-col" data-testid="hero-profile-column">
        <LobbyPanel>
        <ColumnHeading align="right">Your record</ColumnHeading>

        {/* Portrait mirrors the left stage: same height, facing inward. */}
        <div className="relative mt-1.5 flex h-[244px] items-end justify-center sm:h-[288px] lg:h-[324px]">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-6 bottom-10 top-4 rounded-[999px] blur-xl"
            style={{
              background:
                "radial-gradient(58% 50% at 50% 78%, rgba(201,168,76,0.26) 0%, transparent 72%)",
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
              <span className="mt-0.5 text-[9px] font-bold uppercase tracking-[0.18em] text-[#c9a84c]/80">
                {academyTierLabel(academyTier)}
              </span>
            </div>
          )}
        </div>

        <div className="mt-1 text-center">
          <div
            className="truncate text-lg font-bold tracking-tight text-foreground"
            data-testid="hero-display-name"
          >
            {displayName ?? (signedIn ? "Your profile" : "Guest")}
          </div>
          {rankedRole !== null && (
            <div
              data-testid="hub-ranked-role"
              className="text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-200"
            >
              {RANKED_ROLE_LABELS[rankedRole]}
            </div>
          )}
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
            <History className="h-3 w-3 text-cyan-300/80" aria-hidden="true" />
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-300/80">
              Recent Ranked
            </span>
          </div>
          <div className="mt-1 flex flex-col gap-1">
            {matchHistoryLoading ? (
              <p className="px-0.5 text-[11px] text-muted-foreground">Loading…</p>
            ) : recentMatches.length === 0 ? (
              <p className="px-0.5 text-[11px] text-muted-foreground" data-testid="hero-recent-empty">
                No ranked matches on record yet.
              </p>
            ) : (
              recentMatches.map((entry) => {
                const outcome = OUTCOME_STYLE[entry.viewerOutcome];
                return (
                  <div
                    key={entry.matchId}
                    data-testid="hero-recent-match"
                    className="flex items-center gap-2 rounded-md border border-border/40 bg-background/40 px-2 py-1"
                  >
                    <span className={`shrink-0 text-[10px] font-bold uppercase tracking-wider ${outcome.className}`}>
                      {outcome.label}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
                      vs {entry.opponentIsBot ? "Bot" : entry.opponentDisplayName ?? "Opponent"}
                    </span>
                    {entry.viewerRole !== null && (
                      <span className="shrink-0 text-[10px] uppercase tracking-wider text-cyan-200/80">
                        {RANKED_ROLE_LABELS[entry.viewerRole]}
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="mt-1.5 flex items-center justify-center gap-1">
          <Button asChild variant="ghost" size="sm" className="h-7 text-[11px] text-muted-foreground hover:text-foreground">
            <Link to="/profile">View full profile</Link>
          </Button>
          <Button asChild variant="ghost" size="sm" className="h-7 text-[11px] text-muted-foreground hover:text-foreground">
            <Link to="/lol/history">Full history</Link>
          </Button>
        </div>
        </LobbyPanel>
      </div>
    </section>
  );
}

function ColumnHeading({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <div
      className={`text-[10px] font-bold uppercase tracking-[0.24em] text-[#e2c877]/70 ${
        align === "right" ? "text-center lg:text-right" : "text-center lg:text-left"
      }`}
    >
      {children}
    </div>
  );
}

function HeroStat({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-1.5 rounded-md border border-border/40 bg-background/40 px-2 py-1 text-left">
      <Icon className="h-3 w-3 shrink-0 text-cyan-300/80" />
      <div className="min-w-0 leading-tight">
        <div className="text-[8px] uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="truncate text-xs font-semibold tabular-nums">{value}</div>
      </div>
    </div>
  );
}
