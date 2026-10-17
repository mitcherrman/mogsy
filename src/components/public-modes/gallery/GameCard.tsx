/**
 * MC-UX1 — one game in the More Challenges gallery.
 *
 * Draws what it is given and decides nothing: the action comes from
 * `resolveModeAction` and the status from `cardStatus` (lib/public-modes).
 * Play calls `onPlay` with exactly that action — the page carries it out as it
 * always did — and a card with no Play shows the resolver's own reason.
 */
import { useId } from "react";
import { BookOpen, Check, Clock3, History, Lock, PauseCircle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { PublicModeEntry } from "@/lib/public-modes/contracts";
import type { CardStatus } from "@/lib/public-modes/gallery";
import type { ModeAction } from "@/lib/public-modes/launch";
import { cn } from "@/lib/utils";
import { MODE_ACCENT } from "@/lib/public-modes/gallery";
import { GameArt } from "./GameArt";

export type PlayAction = Extract<ModeAction, { kind: "play" | "start" }>;

/**
 * MC-UX2 — the player's own record for this game, already worded (see
 * `modeHistoryParts`): `loading` holds the line's height, `none` says there is
 * no game yet.
 */
export type CardHistory =
  | { state: "loading" }
  /** No record: `text` says so honestly (see `modeHistoryEmptyText`). */
  | { state: "none"; text?: string }
  | { state: "ready"; parts: string[] };

export function GameCard({ entry, action, status, onPlay, onRules, starting = false, busy = false, feature = false,
  history }: {
  entry: PublicModeEntry;
  action: ModeAction;
  status: CardStatus;
  onPlay: (entry: PublicModeEntry, action: PlayAction) => void;
  onRules: () => void;
  starting?: boolean;
  busy?: boolean;
  /** Daily Extras: a wide card with the art beside the copy (from lg). */
  feature?: boolean;
  history?: CardHistory;
}) {
  const titleId = useId();
  const dim = status.state === "coming_soon" || status.state === "paused" || status.state === "unavailable";
  return (
    <article
      className="mc-card"
      style={{ ["--mc-accent" as string]: MODE_ACCENT[entry.id] }}
      data-testid="mode-card"
      data-mode-id={entry.id}
      data-action={action.kind}
      data-state={status.state}
      data-feature={feature ? "true" : undefined}
      data-dim={dim ? "true" : undefined}
      aria-labelledby={titleId}
    >
      <div className="mc-card-art">
        <GameArt modeId={entry.id} />
        <span className="mc-theme" data-testid="mode-card-theme">{entry.theme}</span>
        {status.badge && (
          <span className="mc-badge" data-testid="mode-card-status"
            data-tone={status.state === "ready" ? "gold" : status.state === "daily_first" ? "lock" : "muted"}>
            {status.state === "daily_first" && <Lock className="h-3 w-3" aria-hidden="true" />}
            {status.state === "ready" && <Sparkles className="h-3 w-3" aria-hidden="true" />}
            {status.badge}
          </span>
        )}
      </div>

      <div className="mc-card-body flex min-w-0 flex-col gap-1 px-3 pt-3 sm:gap-2 sm:px-4 sm:pt-4">
        <h3 id={titleId} className="ranked-title text-lg font-semibold leading-tight sm:text-xl" data-testid="mode-card-title">
          {entry.title}
        </h3>
        <p className="text-[13px] leading-snug text-[color:var(--ranked-text)] opacity-90 sm:text-sm" data-testid="mode-card-summary">
          {entry.summary}
        </p>
      </div>

      <div className="mc-card-foot flex flex-col gap-1.5 px-3 pb-3 pt-2.5 sm:px-4 sm:pb-4 sm:pt-3">
        <div className="flex items-stretch gap-2">
            <CardAction entry={entry} action={action} status={status} onPlay={onPlay} starting={starting} busy={busy} />
            <button
              type="button"
              onClick={onRules}
              data-testid="mode-card-rules"
              className="mc-rules"
              aria-label={`Rules for ${entry.title}`}
            >
              <BookOpen className="h-4 w-4" aria-hidden="true" />
              <span>Rules</span>
            </button>
        </div>
        {status.note && (
          <p className="text-[11.5px] leading-snug text-[color:var(--ranked-muted)]" data-testid="mode-card-note">
            {status.note}
          </p>
        )}
        {history && <HistoryLine history={history} />}
      </div>
    </article>
  );
}

function HistoryLine({ history }: { history: CardHistory }) {
  if (history.state === "loading") {
    return <Skeleton className="mc-history h-[18px] w-2/3 rounded" data-testid="mode-card-history" data-state="loading" />;
  }
  const parts = history.state === "ready" ? history.parts : [];
  return (
    <p className="mc-history" data-testid="mode-card-history" data-state={parts.length ? "ready" : "none"}>
      <History className="h-3.5 w-3.5 flex-none" aria-hidden="true" />
      <span className="sr-only">Your record: </span>
      {parts.length ? (
        <span className="min-w-0">
          {parts.map((p, i) => (
            <span key={p}>{i > 0 && <span className="mc-history-dot" aria-hidden="true"> · </span>}{p}</span>
          ))}
        </span>
      ) : <span>{history.state === "none" && history.text ? history.text : "No games yet"}</span>}
    </p>
  );
}

const PLATE_ICON = {
  played: Check, closed: Check, waiting: Clock3, paused: PauseCircle, unavailable: Lock, coming_soon: Clock3,
} as const;

function CardAction({ entry, action, status, onPlay, starting, busy }: {
  entry: PublicModeEntry;
  action: ModeAction;
  status: CardStatus;
  onPlay: (entry: PublicModeEntry, action: PlayAction) => void;
  starting: boolean;
  busy: boolean;
}) {
  if (action.kind === "play" || action.kind === "start") {
    return (
      <Button
        className={cn("mc-play min-h-[44px] flex-1")}
        data-variant={status.state === "daily_first" ? "daily" : "play"}
        variant={status.state === "daily_first" ? "outline" : "default"}
        onClick={() => onPlay(entry, action)}
        data-testid="mode-card-play"
        disabled={busy}
        aria-label={`${starting ? "Starting" : action.label}: ${entry.title}`}
      >
        {starting ? "Starting…" : action.label}
      </Button>
    );
  }
  if (action.kind === "checking") {
    return <Skeleton className="h-11 flex-1 rounded-md" data-testid="mode-card-checking" />;
  }
  const plate = status.plate;
  if (!plate) return null;
  const Icon = PLATE_ICON[status.state as keyof typeof PLATE_ICON] ?? Lock;
  const testId = action.kind === "coming_soon" ? "mode-card-coming-soon" : `mode-card-${action.kind}`;
  return (
    <div className="mc-plate flex-1" data-testid={testId} data-state={status.state}>
      <Icon className="h-4 w-4 flex-none opacity-80" aria-hidden="true" />
      <span className="min-w-0">
        <strong className="block">{plate.label}</strong>
        {plate.detail && <span className="block text-[12px] opacity-85">{plate.detail}</span>}
      </span>
    </div>
  );
}

export function GameCardSkeleton() {
  return <Skeleton className="h-[136px] rounded-[0.9rem] sm:h-[300px]" />;
}
