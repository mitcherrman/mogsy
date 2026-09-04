/**
 * Symmetric context cards for the entities a question compares.
 *
 * SYMMETRY IS THE SAFETY PROPERTY, and it is enforced here as well as on the
 * server. Every card renders the SAME rows in the SAME order, and a missing
 * value becomes a neutral placeholder ("—") rather than a dropped row: a
 * richer card on one option is itself a signal about which option matters,
 * which would leak the answer without ever printing a number.
 *
 * The cards carry identity only — role, seasons in scope, teams/leagues in
 * scope. Never games, wins, a rate, or an ordering; those exist only in
 * `result.evidence` and only after an answer. Nothing here computes anything.
 *
 * Two facts the data forces, both deliberate:
 *   * "years in scope" is scoped to the QUESTION, not to a career, so an LCK
 *     question shows a player's LCK years. The server already narrowed it.
 *   * team identities are never merged. `SK Telecom T1` and `T1` arrive as
 *     two teams with two spans and two short codes, and this renders exactly
 *     what it is given — it has no lineage logic to get wrong.
 */
import ProPlayTooltip from "./ProPlayTooltip";
import RoleGlyph from "@/components/graph1/RoleGlyph";
import { cn } from "@/lib/utils";
import type { ProPlaySubject } from "@/lib/pro-play/contract";
import type { Graph1PlayerRole } from "@/graph1/contract";

/** Neutral absence marker, used everywhere a value is unknown. */
const EMPTY = "—";

/**
 * Backend role id → the existing lane glyph's vocabulary. `adc` is `Bot` in
 * Graph1's naming; `flex` has no lane and deliberately gets no glyph rather
 * than a guessed one.
 */
const ROLE_GLYPH: Record<string, Graph1PlayerRole> = {
  top: "Top",
  jungle: "Jungle",
  mid: "Mid",
  adc: "Bot",
  support: "Support",
};

/** Restrained accents, matching `components/ranked-arena/roleIdentity`. */
const ROLE_ACCENT: Record<string, string> = {
  top: "text-[#d5b66f]",
  jungle: "text-[#8fd0a0]",
  mid: "text-[#7fd6ef]",
  adc: "text-[#e8b98a]",
  support: "text-[#c6a8e8]",
};

function WithTooltip({
  tooltip,
  label,
  children,
}: {
  tooltip?: string | null;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <ProPlayTooltip label={label} tooltip={tooltip}>
      {children}
    </ProPlayTooltip>
  );
}

/** One labelled metadata row. Always rendered, even when the value is absent. */
function Row({
  label,
  children,
  testId,
}: {
  label: string;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <div className="flex items-baseline gap-1.5 text-[11px]" data-testid={testId}>
      <span className="shrink-0 uppercase tracking-wide text-muted-foreground/70">
        {label}
      </span>
      <span className="min-w-0 flex-1 truncate text-foreground/85">{children}</span>
    </div>
  );
}

function RoleBadge({ subject }: { subject: ProPlaySubject }) {
  const role = subject.role;
  if (!role?.id || !role.label) {
    return <span className="text-muted-foreground/60">{EMPTY}</span>;
  }
  const glyph = ROLE_GLYPH[role.id];
  return (
    <WithTooltip tooltip={role.tooltip ?? role.label} label={role.label}>
      <span
        data-pro-play-role={role.id}
        className={cn(
          "inline-flex items-center gap-1 font-semibold",
          ROLE_ACCENT[role.id] ?? "text-foreground/80",
        )}
      >
        {glyph ? <RoleGlyph role={glyph} className="h-3 w-3" /> : null}
        {role.label}
      </span>
    </WithTooltip>
  );
}

function TeamChips({ subject }: { subject: ProPlaySubject }) {
  const teams = subject.teams ?? [];
  if (!teams.length) return <span className="text-muted-foreground/60">{EMPTY}</span>;
  const hidden = Math.max(0, (subject.teams_total ?? teams.length) - teams.length);
  return (
    <span className="flex flex-wrap items-center gap-1">
      {teams.map((team) => (
        <WithTooltip
          key={team.id ?? team.label}
          // The short code is the compact chip; the full name is what the
          // tooltip is FOR ("BFX" → "BNK FEARX"). When there is no short code
          // the label is already the full name and a tooltip would repeat it.
          tooltip={team.short ? (team.tooltip ?? team.label) : null}
          label={team.short ?? team.label}
        >
          <span
            data-pro-play-team-chip
            className="inline-flex rounded border border-border/70 bg-muted/40 px-1 py-px text-[10px] font-semibold text-foreground/80"
          >
            {team.short ?? team.label}
          </span>
        </WithTooltip>
      ))}
      {hidden > 0 ? (
        <span
          data-pro-play-team-overflow
          title={`${hidden} more team${hidden === 1 ? "" : "s"} in this scope`}
          className="text-[10px] text-muted-foreground"
        >
          +{hidden}
        </span>
      ) : null}
    </span>
  );
}

function LeagueChips({ subject }: { subject: ProPlaySubject }) {
  const leagues = subject.leagues ?? [];
  if (!leagues.length) return <span className="text-muted-foreground/60">{EMPTY}</span>;
  const hidden = Math.max(0, (subject.leagues_total ?? leagues.length) - leagues.length);
  return (
    <span className="flex flex-wrap items-center gap-1">
      {leagues.map((league) => (
        <WithTooltip
          key={league.id}
          tooltip={league.tooltip !== league.label ? league.tooltip : null}
          label={league.label}
        >
          <span
            data-pro-play-league-chip
            className="inline-flex rounded border border-border/70 bg-muted/40 px-1 py-px text-[10px] font-semibold text-foreground/80"
          >
            {league.label}
          </span>
        </WithTooltip>
      ))}
      {hidden > 0 ? (
        <span className="text-[10px] text-muted-foreground">+{hidden}</span>
      ) : null}
    </span>
  );
}

function Seasons({ subject }: { subject: ProPlaySubject }) {
  const label = subject.seasons?.label;
  if (!label) return <span className="text-muted-foreground/60">{EMPTY}</span>;
  return (
    <WithTooltip
      tooltip={subject.seasons?.tooltip ?? "Seasons in this scope"}
      label={label}
    >
      <span data-pro-play-seasons>{label}</span>
    </WithTooltip>
  );
}

export function ProPlaySubjectCard({ subject }: { subject: ProPlaySubject }) {
  return (
    <div
      data-pro-play-subject={subject.kind}
      className="min-w-0 rounded-lg border border-border/60 bg-background/40 p-2.5"
    >
      <p className="truncate text-sm font-semibold text-foreground" title={subject.label}>
        {subject.label}
      </p>
      <div className="mt-1.5 space-y-1">
        {subject.kind === "player" ? (
          <>
            <Row label="Role" testId="pro-play-subject-role">
              <RoleBadge subject={subject} />
            </Row>
            <Row label="Years" testId="pro-play-subject-years">
              <Seasons subject={subject} />
            </Row>
            <Row label="Teams" testId="pro-play-subject-teams">
              <TeamChips subject={subject} />
            </Row>
          </>
        ) : subject.kind === "team" ? (
          <>
            <Row label="Team" testId="pro-play-subject-short">
              {subject.short ? (
                <span className="font-semibold">{subject.short}</span>
              ) : (
                <span className="text-muted-foreground/60">{EMPTY}</span>
              )}
              {subject.region ? (
                <span className="ml-1.5 text-muted-foreground">{subject.region}</span>
              ) : null}
            </Row>
            <Row label="Years" testId="pro-play-subject-years">
              <Seasons subject={subject} />
            </Row>
            <Row label="Leagues" testId="pro-play-subject-leagues">
              <LeagueChips subject={subject} />
            </Row>
          </>
        ) : null}
      </div>
    </div>
  );
}

export interface ProPlaySubjectCardsProps {
  subjects: ProPlaySubject[];
  className?: string;
}

export default function ProPlaySubjectCards({
  subjects,
  className,
}: ProPlaySubjectCardsProps) {
  // Champion subjects carry no context beyond their own name and art, which
  // the choice buttons already show — a row of cards repeating the four
  // options would be the "repeated text already obvious from imagery" the
  // brief asks to avoid. So only entity subjects get cards.
  const cards = subjects.filter((s) => s.kind === "player" || s.kind === "team");
  if (cards.length < 2) return null;
  // A RANKING pairs up even on mobile. Measured on a real 4-way NA LCS
  // question at 375px: four stacked cards ran ~480px and pushed the answer
  // buttons well below the fold, which is the "splash/context must not push
  // core content down" rule failing in a different place. Two columns halve
  // that; a two-way comparison still gets full width per card, where the
  // side-by-side read matters most.
  const ranking = cards.length > 2;
  return (
    <div
      data-pro-play-subject-cards
      data-pro-play-subject-count={cards.length}
      className={cn(
        "grid gap-2",
        ranking ? "grid-cols-2" : "grid-cols-1 sm:grid-cols-2",
        className,
      )}
    >
      {cards.map((subject, i) => (
        <ProPlaySubjectCard key={subject.id ?? `${subject.label}:${i}`} subject={subject} />
      ))}
    </div>
  );
}
