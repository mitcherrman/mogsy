/**
 * PGM1 — `/quiz/more-challenges`, the public More Challenges catalog.
 *
 * The thirteen approved bonus modes, exactly as `GET /api/game-modes` lists
 * them: the server owns which modes exist, their copy, their order and what
 * the public can launch. Every card is drawn the same way; only its action
 * differs, and that is decided by `resolveModeAction` (lib/public-modes/launch)
 * from the server's launch plus the player's own Daily — never from the fact
 * that a mode is approved. A mode with no public launch says "Coming soon" and
 * has no Play button.
 *
 * WAYS IN AND OUT
 * ───────────────
 * In: the Daily's main result ("Play More Challenges"), a bonus stage's result,
 * the Daily recap, and Leaguecraft's More Challenges section. Out: Play hands
 * a Daily bonus stage to the Daily page (which owns the run, the match and the
 * result; that result offers the way back here). Browsing is public; the Daily
 * itself decides who may play.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import SEOHead from "@/components/SEOHead";
import { ModeRulesPanel } from "@/components/public-modes/ModeRulesPanel";
import { track } from "@/lib/analytics/track";
import { httpDailyRunTransport } from "@/lib/daily-challenge/run/client";
import type { DailyRun } from "@/lib/daily-challenge/run/contracts";
import { usePublicModeCatalog } from "@/lib/public-modes/client";
import type { PublicModeEntry } from "@/lib/public-modes/contracts";
import {
  MORE_CHALLENGES_ROUTE,
  readMoreChallengesSource,
  resolveModeAction,
  type DailyContext,
  type ModeAction,
} from "@/lib/public-modes/launch";
import {
  MORE_CHALLENGES_MODE_SELECTED,
  MORE_CHALLENGES_VIEWED,
  modeSelectedMetadata,
} from "@/lib/public-modes/report";
import { buildModeRules } from "@/lib/public-modes/rules";
import { cn } from "@/lib/utils";

/** The player's Daily, read once per visit. A GET: no identity is minted. */
function useTodaysDaily(): DailyContext {
  const q = useQuery<DailyRun | null>({
    queryKey: ["daily-run", "today", "more-challenges"],
    queryFn: ({ signal }) => httpDailyRunTransport.readToday(signal),
    staleTime: 0,
    retry: false,
    refetchOnWindowFocus: true,
  });
  if (q.isPending) return { state: "loading" };
  if (q.isError) return { state: "error" };
  return { state: "ready", run: q.data ?? null };
}

export default function MoreChallengesPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [source] = useState(() => readMoreChallengesSource(location.state));
  const catalog = usePublicModeCatalog();
  const daily = useTodaysDaily();
  const [rulesFor, setRulesFor] = useState<PublicModeEntry | null>(null);

  const viewed = useRef(false);
  useEffect(() => {
    if (viewed.current) return;
    viewed.current = true;
    track(MORE_CHALLENGES_VIEWED, { metadata: { source } });
  }, [source]);

  const modes = useMemo(() => catalog.data?.modes ?? [], [catalog.data]);
  const actions = useMemo(
    () => new Map(modes.map((m) => [m.id, resolveModeAction(m, daily)] as const)),
    [modes, daily],
  );
  const open = modes.filter((m) => m.launch !== null).length;

  const play = (entry: PublicModeEntry, action: Extract<ModeAction, { kind: "play" }>) => {
    track(MORE_CHALLENGES_MODE_SELECTED, { metadata: modeSelectedMetadata(entry.id, "play", source) });
    navigate(action.to, { state: action.state });
  };
  const showRules = (entry: PublicModeEntry) => {
    track(MORE_CHALLENGES_MODE_SELECTED, { metadata: modeSelectedMetadata(entry.id, "rules", source) });
    setRulesFor(entry);
  };

  return (
    <>
      <SEOHead
        title="More Challenges — League of Legends Bonus Modes | Mogzy"
        description="Bonus League of Legends knowledge modes on Mogzy: Time Trial, Survival and more. None of them change your Daily score or Ranked rating."
        path={MORE_CHALLENGES_ROUTE}
      />
      <div
        className="ranked-academy relative mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 pb-12 pt-3"
        data-testid="more-challenges"
        data-source={source}
      >
        <header className="flex flex-col gap-2">
          <Link
            to="/quiz"
            data-testid="more-challenges-back"
            className="self-start text-xs text-muted-foreground/80 underline underline-offset-2 hover:text-muted-foreground"
          >
            Back to Leaguecraft
          </Link>
          <div className="ranked-eyebrow">Leaguecraft · Bonus modes</div>
          <h1 className="ranked-title text-3xl font-bold leading-tight sm:text-4xl">More Challenges</h1>
          <p className="max-w-2xl text-sm text-[color:var(--ranked-muted)]">
            Bonus modes to play after your Daily Challenge. None of them change your Daily score
            or your Ranked rating. New modes open here as they're ready.
          </p>
        </header>

        {catalog.isPending ? (
          <CatalogSkeleton />
        ) : catalog.isError ? (
          <section className="ranked-panel p-5" data-testid="more-challenges-error">
            <div className="ranked-eyebrow ranked-eyebrow--cyan">Unavailable</div>
            <h2 className="mt-1 font-semibold">More Challenges could not be loaded.</h2>
            <Button className="mt-3" variant="outline" onClick={() => void catalog.refetch()}
              disabled={catalog.isFetching} data-testid="more-challenges-retry">
              Try again
            </Button>
          </section>
        ) : (
          <>
            <p className="text-xs text-[color:var(--ranked-muted)]" data-testid="more-challenges-count">
              {modes.length} bonus modes · {open} open now
            </p>
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="more-challenges-grid">
              {modes.map((m) => (
                <li key={m.id}>
                  <ModeCard
                    entry={m}
                    action={actions.get(m.id) ?? { kind: "coming_soon" }}
                    onPlay={play}
                    onRules={() => showRules(m)}
                  />
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
      {rulesFor && (
        <ModeRulesPanel
          rules={buildModeRules(rulesFor)}
          open
          onOpen={() => {}}
          onClose={() => setRulesFor(null)}
        />
      )}
    </>
  );
}

function statusChip(action: ModeAction): { label: string; tone: "open" | "done" | "muted" } {
  switch (action.kind) {
    case "play": return { label: "Open", tone: "open" };
    case "done": return { label: action.label, tone: "done" };
    case "checking": return { label: "Checking…", tone: "muted" };
    case "blocked": return { label: "Not now", tone: "muted" };
    case "coming_soon": return { label: "Coming soon", tone: "muted" };
  }
}

function ModeCard({ entry, action, onPlay, onRules }: {
  entry: PublicModeEntry;
  action: ModeAction;
  onPlay: (entry: PublicModeEntry, action: Extract<ModeAction, { kind: "play" }>) => void;
  onRules: () => void;
}) {
  const chip = statusChip(action);
  const dimmed = action.kind === "coming_soon" || action.kind === "blocked";
  return (
    <article
      className={cn("ranked-panel flex h-full flex-col gap-3 p-4", dimmed && "opacity-80")}
      data-testid="mode-card"
      data-mode-id={entry.id}
      data-action={action.kind}
      aria-label={entry.title}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="ranked-eyebrow ranked-eyebrow--cyan" data-testid="mode-card-theme">{entry.theme}</span>
        <span
          data-testid="mode-card-status"
          className={cn(
            "rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]",
            chip.tone === "open" && "border-[rgba(240,215,140,0.8)] bg-[rgba(201,168,76,0.18)] text-[#f0d78c]",
            chip.tone === "done" && "border-[rgba(80,170,220,0.5)] text-[#9fd6f0]",
            chip.tone === "muted" && "border-[rgba(169,179,193,0.35)] text-[color:var(--ranked-muted)]",
          )}
        >
          {chip.label}
        </span>
      </div>

      <h2 className="ranked-title text-xl font-semibold leading-snug" data-testid="mode-card-title">{entry.title}</h2>
      <p className="text-sm leading-snug text-[color:var(--ranked-text)]" data-testid="mode-card-summary">
        {entry.summary}
      </p>

      <div className="mt-auto flex flex-col gap-2">
        <ModeCardAction entry={entry} action={action} onPlay={onPlay} />
        <button
          type="button"
          onClick={onRules}
          data-testid="mode-card-rules"
          className="flex items-center justify-center gap-1.5 self-center rounded text-xs text-[color:var(--ranked-muted)]
            underline underline-offset-2 hover:text-[color:var(--ranked-text)]
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(201,168,76,0.6)]"
          aria-label={`Rules for ${entry.title}`}
        >
          <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
          Rules
        </button>
      </div>
    </article>
  );
}

function ModeCardAction({ entry, action, onPlay }: {
  entry: PublicModeEntry;
  action: ModeAction;
  onPlay: (entry: PublicModeEntry, action: Extract<ModeAction, { kind: "play" }>) => void;
}) {
  const box = "rounded-md border border-dashed border-[rgba(169,179,193,0.35)] px-3 py-2 text-center text-xs text-[color:var(--ranked-muted)]";
  switch (action.kind) {
    case "play":
      return (
        <>
          <Button className="min-h-[44px] w-full" onClick={() => onPlay(entry, action)} data-testid="mode-card-play">
            {action.label}
          </Button>
          {action.note && (
            <p className="text-center text-[11px] text-[color:var(--ranked-muted)]" data-testid="mode-card-note">
              {action.note}
            </p>
          )}
        </>
      );
    case "checking":
      return <Skeleton className="h-11 w-full rounded-md" data-testid="mode-card-checking" />;
    case "coming_soon":
      return <div className={box} data-testid="mode-card-coming-soon">Coming soon</div>;
    case "done":
    case "blocked":
      return (
        <div className={box} data-testid={`mode-card-${action.kind}`}>
          <span className="font-semibold text-[color:var(--ranked-text)]">{action.label}</span>
          {action.note && <span className="block pt-0.5">{action.note}</span>}
        </div>
      );
  }
}

function CatalogSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="more-challenges-loading" aria-busy="true">
      {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-56 rounded-xl" />)}
    </div>
  );
}
