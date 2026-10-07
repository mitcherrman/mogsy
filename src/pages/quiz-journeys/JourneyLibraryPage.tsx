/**
 * JLIB-FE — `/quiz/journeys`, the public Journey Library.
 *
 * NOT `/quiz/mastery`. That route is the legacy standalone Mastery system and
 * is untouched; this page is the Library for the stateful Journey runtime
 * that Ranked and the Daily Challenge already play.
 *
 * WHAT IT DOES
 * ────────────
 * Lists what `GET /api/journeys` returns — every Library Journey at its
 * ACTIVE version — and starts one with
 * `POST /api/journeys/{recipe_id}/{recipe_version}/launch`. The launch answers
 * the queue's own `matched` snapshot, so Start hands the match id to
 * `/quiz/ranked` exactly as the lobby's match-entry scroll does, plus a
 * `journey_library` origin so the result screen offers the way back here. No
 * Journey content, player, grader, arena or renderer lives in this file.
 *
 * ACCESS
 * ──────
 * Browsing is public. Starting needs a signed-in, non-guest account — Free,
 * Premium or admin alike; there is deliberately no Premium check here. A
 * signed-out visitor (or a guest) is shown the same Create account / Sign in
 * pair `/quiz/ranked` uses, returning to this page, and no request is sent.
 *
 * STALE OR UNAVAILABLE
 * ────────────────────
 * Cards are keyed by `(recipe_id, recipe_version)`. A card with
 * `available: false` cannot be started. A 409 `JOURNEY_VERSION_NOT_ACTIVE`
 * means the Library changed under this page: the list is refetched and the
 * stale version is never retried or substituted. A 503 `JOURNEY_UNAVAILABLE`
 * keeps the player here and marks that card unavailable.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { useChampionAssets, getChampionIcon } from "@/hooks/useChampionAssets";
import { getChampionSquareIconUrl } from "@/lib/combat-lab/abilityIcons";
import { authHref } from "@/lib/auth/auth-destination";
import { launchJourney, RankedApiError } from "@/lib/ranked-public/client";
import {
  journeyRoleLabel,
  journeyRoles,
  matchesJourneyFilter,
  type JourneyChampion,
  type JourneyLibraryEntry,
} from "@/lib/journey-library/contracts";
import { useJourneyLibrary } from "@/lib/journey-library/useJourneyLibrary";
import { JOURNEY_LIBRARY_ROUTE } from "@/pages/quiz-ranked/matchOrigin";
import { cn } from "@/lib/utils";
import SEOHead from "@/components/SEOHead";

type Notice =
  | { kind: "account"; title: string }
  | { kind: "stale"; title: string }
  | { kind: "unavailable"; title: string }
  | { kind: "active_match" }
  | { kind: "rate_limited" }
  | { kind: "disabled" }
  | { kind: "failed"; title: string };

export default function JourneyLibraryPage() {
  const { user, loading: authLoading } = useAuth();
  const hasAccount = !!user && (user as { is_anonymous?: boolean }).is_anonymous !== true;
  const navigate = useNavigate();
  const library = useJourneyLibrary();

  const [role, setRole] = useState<string | null>(null);
  const [champion, setChampion] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [launchingKey, setLaunchingKey] = useState<string | null>(null);
  // Cards the server refused with 503 during this visit. Keyed by the exact
  // (recipe_id, recipe_version), so a refetched NEW version is not hidden.
  const [refused, setRefused] = useState<ReadonlySet<string>>(() => new Set());
  const launchingRef = useRef(false);
  // A notice answers a press that may be far down the grid (a phone), so it
  // is brought into view rather than appearing off screen.
  const noticeRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (notice) noticeRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [notice]);

  const journeys = useMemo(() => library.data?.journeys ?? [], [library.data]);
  const roles = useMemo(() => journeyRoles(journeys), [journeys]);
  const shown = useMemo(
    () => journeys.filter((j) => matchesJourneyFilter(j, { role, champion })),
    [journeys, role, champion],
  );
  const filtering = role !== null || champion.trim() !== "";

  const start = useCallback(async (entry: JourneyLibraryEntry) => {
    if (launchingRef.current) return;
    if (!hasAccount) {
      setNotice({ kind: "account", title: entry.title });
      return;
    }
    if (!entry.available || refused.has(entry.key)) return;
    launchingRef.current = true;
    setLaunchingKey(entry.key);
    setNotice(null);
    try {
      const status = await launchJourney(entry.recipeId, entry.recipeVersion);
      if (status.status === "matched" && status.matchId) {
        navigate("/quiz/ranked", {
          state: { matchId: status.matchId, origin: "journey_library" },
        });
        return;
      }
      setNotice({ kind: "failed", title: entry.title });
    } catch (e) {
      const code = e instanceof RankedApiError ? e.code : null;
      const status = e instanceof RankedApiError ? e.status : 0;
      if (code === "JOURNEY_VERSION_NOT_ACTIVE" || code === "JOURNEY_NOT_FOUND") {
        setNotice({ kind: "stale", title: entry.title });
        void library.refetch();
      } else if (code === "JOURNEY_UNAVAILABLE") {
        setRefused((prev) => new Set(prev).add(entry.key));
        setNotice({ kind: "unavailable", title: entry.title });
      } else if (code === "AUTH_REQUIRED" || code === "ACCOUNT_REQUIRED"
        || status === 401 || status === 403) {
        setNotice({ kind: "account", title: entry.title });
      } else if (code === "RANKED_ACTIVE_MATCH_EXISTS") {
        setNotice({ kind: "active_match" });
      } else if (code === "RANKED_RATE_LIMITED" || status === 429) {
        setNotice({ kind: "rate_limited" });
      } else if (code === "FEATURE_DISABLED") {
        setNotice({ kind: "disabled" });
      } else {
        setNotice({ kind: "failed", title: entry.title });
      }
    } finally {
      launchingRef.current = false;
      setLaunchingKey(null);
    }
  }, [hasAccount, library, navigate, refused]);

  return (
    <>
      <SEOHead
        title="Journey Library — League of Legends Matchup Training | Mogzy"
        description="Browse guided League of Legends matchup Journeys on Mogzy. Pick a lane matchup and practice with short, unrated question sets against a bot."
        path="/quiz/journeys"
      />
      <div
      className="ranked-academy relative mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 pb-12 pt-3"
      data-testid="journey-library"
    >
      <header className="flex flex-col gap-2">
        <Link
          to="/quiz"
          data-testid="journey-library-back"
          className="self-start text-xs text-muted-foreground/80 underline underline-offset-2 hover:text-muted-foreground"
        >
          Back to Leaguecraft
        </Link>
        <div className="ranked-eyebrow">Leaguecraft · Academy</div>
        <h1 className="ranked-title text-3xl font-bold leading-tight sm:text-4xl">Journey Library</h1>
        <p className="max-w-2xl text-sm text-[color:var(--ranked-muted)]">
          Pick a lane matchup and play a guided Journey through it against a bot.
          Every Journey is a short, unrated set of questions about that matchup.
        </p>
        {!hasAccount && !authLoading && (
          <p className="text-xs text-[color:var(--ranked-muted)]" data-testid="journey-library-signed-out-hint">
            Browse freely. <Link to={authHref(JOURNEY_LIBRARY_ROUTE)} className="underline underline-offset-2">Sign in</Link>{" "}
            to start a Journey. A free account is enough.
          </p>
        )}
      </header>

      <div aria-live="polite" ref={noticeRef} className="scroll-mt-20">
        {notice && <LibraryNotice notice={notice} onDismiss={() => setNotice(null)} />}
      </div>

      {library.isPending ? (
        <LibrarySkeleton />
      ) : library.isError ? (
        <section className="ranked-panel p-5" data-testid="journey-library-error">
          <div className="ranked-eyebrow ranked-eyebrow--cyan">Library unavailable</div>
          <h2 className="mt-1 font-semibold">The Journey Library could not be loaded.</h2>
          <Button className="mt-3" variant="outline" onClick={() => void library.refetch()}
            disabled={library.isFetching}>
            Try again
          </Button>
        </section>
      ) : journeys.length === 0 ? (
        <section className="ranked-panel p-5" data-testid="journey-library-empty">
          <h2 className="font-semibold">No Journeys yet</h2>
          <p className="text-sm text-muted-foreground">The Library has nothing to play right now.</p>
        </section>
      ) : (
        <>
          <section className="ranked-subpanel flex flex-col gap-3 p-3 sm:p-4" aria-label="Filter Journeys"
            data-testid="journey-library-filters">
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Role">
              <RoleChip label="All roles" active={role === null} onClick={() => setRole(null)} testId="journey-role-all" />
              {roles.map((r) => (
                <RoleChip key={r} label={journeyRoleLabel(r)} active={role === r}
                  onClick={() => setRole(role === r ? null : r)} testId={`journey-role-${r}`} />
              ))}
            </div>
            <div className="relative max-w-sm">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true" />
              <input
                type="text"
                value={champion}
                onChange={(e) => setChampion(e.target.value)}
                placeholder="Search champions"
                aria-label="Search champions"
                data-testid="journey-champion-search"
                className="h-9 w-full rounded-md border border-[rgba(201,168,76,0.35)] bg-[rgba(5,13,26,0.8)] pl-8 pr-8 text-sm
                  text-[color:var(--ranked-text)] placeholder:text-muted-foreground focus-visible:outline-none
                  focus-visible:ring-2 focus-visible:ring-[rgba(201,168,76,0.6)]"
              />
              {champion && (
                <button type="button" onClick={() => setChampion("")} aria-label="Clear champion search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
            </div>
          </section>

          <div className="flex items-center justify-between gap-3 text-xs text-[color:var(--ranked-muted)]">
            <span data-testid="journey-library-count">
              {filtering
                ? `${shown.length} of ${journeys.length} Journeys`
                : `${journeys.length} Journey${journeys.length === 1 ? "" : "s"}`}
            </span>
            {filtering && (
              <button type="button" className="underline underline-offset-2 hover:text-foreground"
                onClick={() => { setRole(null); setChampion(""); }} data-testid="journey-filters-clear">
                Clear filters
              </button>
            )}
          </div>

          {shown.length === 0 ? (
            <section className="ranked-panel p-5" data-testid="journey-library-no-match">
              <h2 className="font-semibold">No Journeys match</h2>
              <p className="text-sm text-muted-foreground">Try another role or champion.</p>
            </section>
          ) : (
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="journey-library-grid">
              {shown.map((j) => (
                <li key={j.key}>
                  <JourneyCard
                    entry={j}
                    available={j.available && !refused.has(j.key)}
                    launching={launchingKey === j.key}
                    busy={launchingKey !== null || !!authLoading}
                    onStart={() => void start(j)}
                    onPickChampion={(c) => setChampion(c.label)}
                  />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function RoleChip({ label, active, onClick, testId }:
{ label: string; active: boolean; onClick: () => void; testId: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      data-testid={testId}
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(201,168,76,0.6)]",
        active
          ? "border-[rgba(240,215,140,0.8)] bg-[rgba(201,168,76,0.18)] text-[#f0d78c]"
          : "border-[rgba(80,170,220,0.3)] text-[color:var(--ranked-muted)] hover:border-[rgba(201,168,76,0.5)] hover:text-[color:var(--ranked-text)]",
      )}
    >
      {label}
    </button>
  );
}

function JourneyCard({ entry, available, launching, busy, onStart, onPickChampion }: {
  entry: JourneyLibraryEntry;
  available: boolean;
  launching: boolean;
  busy: boolean;
  onStart: () => void;
  onPickChampion: (c: JourneyChampion) => void;
}) {
  const [first, second] = entry.champions;
  return (
    <article
      className={cn("ranked-panel flex h-full flex-col gap-3 p-4", !available && "opacity-75")}
      data-testid="journey-card"
      data-journey-key={entry.key}
      data-available={available ? "true" : "false"}
      aria-label={entry.title}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="ranked-eyebrow ranked-eyebrow--cyan" data-testid="journey-card-role">
          {journeyRoleLabel(entry.role)}
        </span>
        <span className="text-[11px] text-[color:var(--ranked-muted)]" data-testid="journey-card-questions">
          {entry.questions} question{entry.questions === 1 ? "" : "s"}
        </span>
      </div>

      <div className="flex items-center justify-center gap-3 py-1">
        {first && <ChampionFace champion={first} onPick={onPickChampion} />}
        {second && (
          <>
            <span className="ranked-title text-sm font-semibold text-[#f0d78c]" aria-hidden="true">vs</span>
            <ChampionFace champion={second} onPick={onPickChampion} />
          </>
        )}
        {entry.champions.slice(2).map((c) => <ChampionFace key={c.id} champion={c} onPick={onPickChampion} />)}
      </div>

      <h2 className="ranked-title text-center text-lg font-semibold leading-snug" data-testid="journey-card-title">
        {entry.title}
      </h2>

      <div className="mt-auto">
        {available ? (
          <Button className="w-full" onClick={onStart} disabled={busy} data-testid="journey-card-start">
            {launching ? "Starting…" : "Start Journey"}
          </Button>
        ) : (
          <div
            className="rounded-md border border-dashed border-[rgba(169,179,193,0.35)] px-3 py-2 text-center text-xs text-[color:var(--ranked-muted)]"
            data-testid="journey-card-unavailable"
          >
            Unavailable right now
          </div>
        )}
      </div>
    </article>
  );
}

function ChampionFace({ champion, onPick }: { champion: JourneyChampion; onPick: (c: JourneyChampion) => void }) {
  const { data: manifest } = useChampionAssets();
  const src = getChampionIcon(manifest, champion.label)
    ?? getChampionIcon(manifest, champion.id)
    ?? getChampionSquareIconUrl(champion.label);
  const [broken, setBroken] = useState(false);
  return (
    <button
      type="button"
      onClick={() => onPick(champion)}
      title={`Show Journeys with ${champion.label}`}
      className="flex w-20 flex-col items-center gap-1 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(201,168,76,0.6)]"
      data-testid="journey-card-champion"
    >
      {src && !broken ? (
        <img src={src} alt="" loading="lazy" onError={() => setBroken(true)}
          className="h-14 w-14 rounded-full border border-[rgba(201,168,76,0.55)] object-cover shadow-[0_0_14px_-4px_rgba(201,168,76,0.5)]" />
      ) : (
        <span aria-hidden="true"
          className="flex h-14 w-14 items-center justify-center rounded-full border border-[rgba(201,168,76,0.55)] bg-[rgba(9,20,40,0.9)] text-lg font-semibold text-[#f0d78c]">
          {(champion.label.trim()[0] || "?").toUpperCase()}
        </span>
      )}
      <span className="truncate text-xs font-medium text-[color:var(--ranked-text)]">{champion.label}</span>
    </button>
  );
}

function LibraryNotice({ notice, onDismiss }: { notice: Notice; onDismiss: () => void }) {
  if (notice.kind === "account") {
    // The same account gate `/quiz/ranked` shows, returning to this page.
    return (
      <section data-testid="journey-account-required" className="ranked-panel p-5">
        <div className="ranked-eyebrow ranked-eyebrow--cyan">Account required</div>
        <h2 className="mt-1 font-semibold">Sign in to start {notice.title}</h2>
        <p className="text-sm text-muted-foreground">
          Journeys need a signed-in account so your results are saved. A free account is enough.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button asChild data-testid="journey-signup-link">
            <Link to={authHref(JOURNEY_LIBRARY_ROUTE, { mode: "signup" })}>Create account</Link>
          </Button>
          <Button asChild variant="outline" data-testid="journey-signin-link">
            <Link to={authHref(JOURNEY_LIBRARY_ROUTE)}>Sign in</Link>
          </Button>
        </div>
      </section>
    );
  }
  const copy: Record<Exclude<Notice["kind"], "account">, string> = {
    stale: "This Journey was updated. The Library has been refreshed. Pick it again to play the current version.",
    unavailable: "This Journey can't be started right now. Try another one.",
    active_match: "You already have a match in progress.",
    rate_limited: "Too many starts in a row. Wait a moment and try again.",
    disabled: "Journeys can't be started right now. Please try again later.",
    failed: "That Journey could not be started. Please try again.",
  };
  const title = "title" in notice ? notice.title : null;
  return (
    <section className="ranked-subpanel flex items-start justify-between gap-3 p-3 text-sm"
      data-testid={`journey-notice-${notice.kind}`} role="status">
      <p>
        {title && <span className="font-semibold">{title}: </span>}
        {copy[notice.kind]}
        {notice.kind === "active_match" && (
          <> <Link to="/quiz/ranked" className="underline underline-offset-2" data-testid="journey-notice-resume">
            Return to it
          </Link></>
        )}
      </p>
      <button type="button" onClick={onDismiss} aria-label="Dismiss" className="text-muted-foreground hover:text-foreground">
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </section>
  );
}

function LibrarySkeleton() {
  return (
    <div className="flex flex-col gap-3" data-testid="journey-library-loading" aria-busy="true">
      <Skeleton className="h-20 w-full rounded-lg" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-56 rounded-xl" />)}
      </div>
      </div>
    </>  );
}
