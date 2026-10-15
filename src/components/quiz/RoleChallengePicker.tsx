/**
 * RC8 — the Role Challenge mode of the Quiz Hub's centre parchment.
 *
 * Any champion, any of the five League roles (off-meta included), twelve
 * questions in the EXISTING Ranked arena. Unrated: the match is a canonical
 * bot Ranked match the backend hosts as `role_challenge`, excluded from Ranked
 * rating, Ranked history and the permanent library.
 *
 * AUTHORITY
 * ─────────
 * The server decides everything that matters: the champion roster (catalog),
 * whether a start is allowed today (`status.next_start`), the active run to
 * resume (`status.active_run`) and the match itself (`POST /start`). The
 * session's Premium flag only chooses wording.
 *
 * IDEMPOTENT RETRY
 * ────────────────
 * One user action = one `start_key`. A failed press that might have reached
 * the server (network loss, 5xx) keeps the key, so pressing Play again replays
 * the same start instead of spending a second slot. Changing the champion or
 * role is a new action and drops the key.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Crown, Loader2, RotateCcw, Search } from "lucide-react";
import {
  getRoleChallengeCatalog,
  getRoleChallengeStatus,
  startRoleChallenge,
  RoleChallengeApiError,
} from "@/lib/role-challenge/client";
import type {
  RoleChallengeCatalog,
  RoleChallengeChampion,
  RoleChallengeRole,
  RoleChallengeRun,
  RoleChallengeStatus,
} from "@/lib/role-challenge/contracts";
import {
  championIconUrlPath,
  eligibilityView,
  filterChampions,
  type RoleChallengePlan,
} from "@/lib/role-challenge/presentation";
import { resolveQuizAssetUrl } from "@/lib/quiz/api";
import { RANKED_ROLES, RANKED_ROLE_LABELS } from "@/lib/ranked-public/roles";
import { getRankedRoleMascotPath } from "@/components/mascot/mascot-assets";
import { LEAGUECRAFT_INK } from "@/components/quiz/leaguecraft-ink";
import { usePremiumSession } from "@/hooks/usePremiumSession";

const INK = LEAGUECRAFT_INK;
const PREMIUM_HREF = "/lol/premium";
/** Phone labels: the abbreviations League players use (and the Academy
 *  Record's role filter prints). The accessible name stays the full role. */
const ROLE_SHORT: Record<RoleChallengeRole, string> = {
  top: "Top", jungle: "Jng", mid: "Mid", adc: "ADC", support: "Sup",
};

type Props = {
  enabled: boolean;
  hasAccount: boolean;
  onRequireAccount: () => void;
  onEnterMatch: (matchId: string) => void;
  /** Test seam: the clock the reset countdown reads. */
  now?: () => Date;
};

type LoadState = "loading" | "ready" | "error";

function newStartKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `rc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function startErrorMessage(error: unknown): { message: string; keepKey: boolean; refresh: boolean } {
  if (error instanceof RoleChallengeApiError) {
    if (error.kind === "account_required") {
      return { message: "Sign in to play Role Challenge.", keepKey: false, refresh: false };
    }
    if (error.kind === "network" || error.kind === "invalid_response" ||
        (error.kind === "backend" && error.status >= 500 && error.code !== "ROLE_CHALLENGE_UNAVAILABLE"
          && error.code !== "ROLE_CHALLENGE_ENTITLEMENT_UNAVAILABLE")) {
      return {
        message: "Connection problem — press Play again to retry safely. You won't be charged a second start.",
        keepKey: true, refresh: false,
      };
    }
    switch (error.code) {
      case "ROLE_CHALLENGE_DAILY_LIMIT_REACHED":
        return { message: "Today's free Role Challenge is already used.", keepKey: false, refresh: true };
      case "ROLE_CHALLENGE_UNAVAILABLE":
        return {
          message: "This champion and role can't be built right now. Try another pick.",
          keepKey: false, refresh: false,
        };
      case "ROLE_CHALLENGE_ENTITLEMENT_UNAVAILABLE":
        return {
          message: "We couldn't confirm your Premium access. Try again in a moment.",
          keepKey: true, refresh: true,
        };
      case "ROLE_CHALLENGE_START_KEY_CONFLICT":
        return { message: "That start changed — press Play again.", keepKey: false, refresh: true };
      case "RANKED_ACTIVE_MATCH_EXISTS":
      case "RANKED_ALREADY_QUEUED":
        return { message: "Finish your active match first.", keepKey: false, refresh: true };
      default:
        return { message: error.message || "Could not start Role Challenge.", keepKey: false, refresh: true };
    }
  }
  return { message: "Could not start Role Challenge.", keepKey: true, refresh: false };
}

function ChampionPortrait({
  champion, size, className = "",
}: { champion: Pick<RoleChallengeChampion, "name" | "riotId">; size: number; className?: string }) {
  const [failed, setFailed] = useState(false);
  const initials = champion.name.replace(/[^A-Za-z]/g, "").slice(0, 2).toUpperCase();
  return (
    <span
      className={`relative block shrink-0 overflow-hidden rounded-md ${className}`}
      style={{ width: size, height: size, border: `1px solid ${INK.rule}`, background: INK.inset }}
    >
      {failed ? (
        <span
          className="flex h-full w-full items-center justify-center text-[11px] font-black"
          style={{ color: INK.body }}
          aria-hidden="true"
        >
          {initials}
        </span>
      ) : (
        <img
          src={resolveQuizAssetUrl(championIconUrlPath(champion))}
          alt=""
          aria-hidden="true"
          loading="lazy"
          width={size}
          height={size}
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
          data-testid="rc-champion-portrait"
        />
      )}
    </span>
  );
}

function RunCard({
  run, title, action, riotId,
}: { run: RoleChallengeRun; title: string; action?: React.ReactNode; riotId: string | null }) {
  return (
    <div
      className="flex items-center gap-3 rounded-lg p-2.5 text-left"
      style={{ border: `1px solid ${INK.rule}`, background: INK.inset }}
    >
      <ChampionPortrait champion={{ name: run.championName, riotId }} size={44} />
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.18em]" style={{ color: INK.faint }}>
          {title}
        </p>
        <p className="truncate text-sm font-extrabold" style={{ color: INK.strong }}>
          {run.championName} · {RANKED_ROLE_LABELS[run.role]}
        </p>
      </div>
      {action}
    </div>
  );
}

export default function RoleChallengePicker({
  enabled, hasAccount, onRequireAccount, onEnterMatch, now = () => new Date(),
}: Props) {
  const { isPro, proStatus } = usePremiumSession();
  const plan: RoleChallengePlan = proStatus === "unknown" ? "unknown" : isPro ? "premium" : "free";

  const [catalog, setCatalog] = useState<RoleChallengeCatalog | null>(null);
  const [status, setStatus] = useState<RoleChallengeStatus | null>(null);
  const [catalogState, setCatalogState] = useState<LoadState>("loading");
  const [statusState, setStatusState] = useState<LoadState>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [role, setRole] = useState<RoleChallengeRole>("mid");
  const [champion, setChampion] = useState<string>("");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A retry of ONE user action must reuse exactly the same start key. A ref,
  // not state, so a double press cannot read a stale null and mint two.
  const startKey = useRef<string | null>(null);

  const refreshStatus = useCallback(async (signal?: AbortSignal) => {
    if (!hasAccount) { setStatus(null); setStatusState("ready"); return; }
    setStatusState("loading");
    try {
      const next = await getRoleChallengeStatus(signal);
      if (signal?.aborted) return;
      setStatus(next);
      setStatusState("ready");
    } catch (e) {
      if (signal?.aborted) return;
      setStatusState("error");
      setLoadError(e instanceof Error ? e.message : "Role Challenge status unavailable");
    }
  }, [hasAccount]);

  useEffect(() => {
    if (!enabled) return;
    const ctrl = new AbortController();
    setCatalogState("loading");
    setLoadError(null);
    getRoleChallengeCatalog(ctrl.signal).then((next) => {
      if (ctrl.signal.aborted) return;
      setCatalog(next);
      setCatalogState("ready");
    }).catch((e: unknown) => {
      if (ctrl.signal.aborted) return;
      setCatalogState("error");
      setLoadError(e instanceof Error ? e.message : "Role Challenge unavailable");
    });
    void refreshStatus(ctrl.signal);
    return () => ctrl.abort();
  }, [enabled, refreshStatus, reloadToken]);

  const roster = useMemo(
    () => catalog?.roles.find((x) => x.role === role)?.champions ?? [],
    [catalog, role],
  );
  const filtered = useMemo(() => filterChampions(roster, query), [roster, query]);
  const selected = roster.find((c) => c.id === champion) ?? null;
  const activeRun = status?.activeRun ?? null;
  const riotIdOf = (id: string) =>
    catalog?.roles[0]?.champions.find((c) => c.id === id)?.riotId ?? null;
  const todaysRun = status?.dailySlot.run ?? null;
  const eligibility = status ? eligibilityView(status, plan, now()) : null;
  const loading = catalogState === "loading" || (hasAccount && statusState === "loading" && !status);
  const canStart = !!selected && hasAccount && !!eligibility?.canStart && !busy && catalogState === "ready";

  const choose = (next: () => void) => {
    if (busy) return;
    next();
    startKey.current = null;
    setError(null);
  };

  const start = async () => {
    if (!hasAccount) { onRequireAccount(); return; }
    if (!canStart || !selected) return;
    const key = startKey.current ?? newStartKey();
    startKey.current = key;
    setBusy(true);
    setError(null);
    try {
      const result = await startRoleChallenge(role, selected.id, key);
      startKey.current = null;
      onEnterMatch(result.matchId);
    } catch (e) {
      const outcome = startErrorMessage(e);
      if (!outcome.keepKey) startKey.current = null;
      setError(outcome.message);
      if (outcome.refresh) void refreshStatus();
    } finally {
      setBusy(false);
    }
  };

  const retryLoad = () => setReloadToken((n) => n + 1);

  return (
    /* PARCHMENT CONTINUITY — the picker FILLS the centre stage (it never sizes
       it). Header and footer keep their natural height; the champion grid is
       the one flexible region and scrolls inside its own bounded frame, so
       173 champions never stretch the sheet and the Play button always sits
       above the foot roller. */
    <div data-testid="role-challenge-picker" className="flex h-full min-h-0 w-full flex-col gap-2 text-left">
      <div className="shrink-0 text-center">
        <h2
          className="lc-scroll-title whitespace-nowrap font-black uppercase leading-none tracking-[0.13em]"
          style={{ color: INK.strong, textShadow: INK.press }}
        >
          Role Challenge
        </h2>
        <p className="mx-auto mt-1.5 max-w-[19rem] text-[12.5px] font-semibold leading-snug" style={{ color: INK.body }}>
          Any champion, any role · 12 questions.
        </p>
        <div className="mt-1 flex flex-wrap items-center justify-center gap-1 text-[10px] font-extrabold uppercase tracking-[0.1em]">
          <span className="rounded-full px-2 py-0.5" style={{ border: `1px solid ${INK.rule}`, color: INK.faint }}
            data-testid="rc-unrated-chip">
            Unrated
          </span>
          {hasAccount ? (
            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5"
              style={{ border: `1px solid ${INK.rule}`, color: INK.brass }} data-testid="rc-plan-chip">
              {plan === "premium" ? <Crown className="h-3 w-3" aria-hidden="true" /> : null}
              {eligibility?.planLabel ?? (plan === "premium" ? "Premium · Unlimited starts" : "Free · 1 start per UTC day")}
            </span>
          ) : null}
        </div>
      </div>

      {activeRun ? (
        <div className="shrink-0" data-testid="role-active-run">
          <RunCard
            run={activeRun}
            riotId={riotIdOf(activeRun.champion)}
            title="Challenge in progress"
            action={(
              <button
                type="button"
                onClick={() => onEnterMatch(activeRun.matchId)}
                className="shrink-0 rounded-md px-3 py-2 text-xs font-black uppercase tracking-wide text-amber-50"
                style={{ background: INK.accent }}
              >
                Resume
              </button>
            )}
          />
        </div>
      ) : todaysRun && todaysRun.matchStatus === "complete" && todaysRun.slotKind === "daily" ? (
        <div className="shrink-0" data-testid="role-today-run">
          <RunCard run={todaysRun} riotId={riotIdOf(todaysRun.champion)} title="Today's free challenge · complete" />
        </div>
      ) : null}

      <div role="radiogroup" aria-label="Role" className="grid shrink-0 grid-cols-5 gap-1.5" data-testid="rc-role-group">
        {RANKED_ROLES.map((id) => {
          const active = role === id;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={RANKED_ROLE_LABELS[id]}
              disabled={busy}
              onClick={() => choose(() => { setRole(id); setChampion(""); })}
              className="flex min-w-0 flex-col items-center gap-0.5 rounded-lg px-0.5 py-1 transition-colors hover:bg-[#fff4d6]/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#5e1220] disabled:opacity-60"
              style={{
                border: `1px solid ${active ? INK.brass : INK.rule}`,
                background: active ? "rgba(255, 244, 214, 0.7)" : "transparent",
                boxShadow: active ? "inset 0 0 0 1px rgba(83,56,8,0.45), 0 1px 2px rgba(42,26,4,0.18)" : undefined,
              }}
            >
              <img
                src={getRankedRoleMascotPath(id, "compact")}
                alt=""
                aria-hidden="true"
                className="h-8 w-8 object-contain"
              />
              <span className="lc-cq-narrow text-[10px] font-extrabold uppercase tracking-normal"
                style={{ color: active ? INK.strong : INK.faint }} aria-hidden="true">
                {ROLE_SHORT[id]}
              </span>
              <span className="lc-cq-wide text-[10px] font-extrabold uppercase tracking-normal"
                style={{ color: active ? INK.strong : INK.faint }} aria-hidden="true">
                {RANKED_ROLE_LABELS[id]}
              </span>
            </button>
          );
        })}
      </div>

      <div className="relative shrink-0">
        <label className="sr-only" htmlFor="rc-champion-search">Find a champion</label>
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: INK.faint }}
          aria-hidden="true" />
        <input
          id="rc-champion-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={catalog ? `Search ${roster.length} champions` : "Search champions"}
          className="w-full rounded-lg py-2 pl-8 pr-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-amber-800/50"
          style={{ border: `1px solid ${INK.rule}`, background: "rgba(255, 250, 236, 0.7)", color: INK.strong }}
        />
      </div>

      <div
        /* The flexible region. `flex-1 min-h-0` takes what the stage has left
           and scrolls inside it; the floor keeps a full row and a half of
           portraits in view on the shortest sheet. Scroll chaining is left on,
           so reaching the end of the grid hands the gesture back to the page
           instead of trapping it. */
        className="lc-rc-grid min-h-[6.5rem] flex-1 overflow-y-auto rounded-lg p-1.5"
        style={{ border: `1px solid ${INK.rule}`, background: "rgba(112, 82, 36, 0.08)" }}
        role="radiogroup"
        aria-label="Champion"
        aria-busy={catalogState === "loading"}
        data-testid="rc-champion-grid"
      >
        {catalogState === "loading" ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(3.5rem,1fr))] gap-1.5" role="status" aria-label="Loading champions">
            {Array.from({ length: 15 }, (_, i) => (
              <div key={i} className="flex flex-col items-center gap-1 p-1">
                <span className="h-11 w-11 animate-pulse rounded-md" style={{ background: INK.inset }} />
                <span className="h-2 w-10 animate-pulse rounded" style={{ background: INK.inset }} />
              </div>
            ))}
          </div>
        ) : catalogState === "error" ? (
          <div className="flex flex-col items-center gap-2 p-4 text-center" role="alert" data-testid="rc-catalog-error">
            <p className="text-sm font-bold" style={{ color: INK.rubric }}>Champion selection couldn't load.</p>
            <button type="button" onClick={retryLoad}
              className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-black uppercase"
              style={{ border: `1px solid ${INK.rule}`, color: INK.strong }}>
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> Retry
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <p className="p-4 text-center text-xs font-semibold" style={{ color: INK.faint }}>No champions found</p>
        ) : (
          /* As many columns as fit a readable name — four on a phone sheet,
             five on desktop — rather than a breakpoint two steps removed from
             the width the grid actually has. */
          <div className="grid grid-cols-[repeat(auto-fill,minmax(3.5rem,1fr))] gap-1">
            {filtered.map((c) => {
              const active = champion === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  aria-label={`${c.name}${c.conventional ? "" : ", off-meta in this role"}`}
                  disabled={busy}
                  onClick={() => choose(() => setChampion(c.id))}
                  className="group flex min-w-0 flex-col items-center gap-0.5 rounded-md p-1 transition-colors hover:bg-[#fff4d6]/45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-[#5e1220] disabled:opacity-60"
                  style={{
                    background: active ? "rgba(255, 244, 214, 0.75)" : undefined,
                    boxShadow: active ? `inset 0 0 0 2px ${INK.brass}` : undefined,
                  }}
                  data-testid="rc-champion-option"
                  data-champion={c.id}
                >
                  <ChampionPortrait champion={c} size={44} className="group-hover:brightness-110" />
                  {/* Two lines, not an ellipsis: "Aurelion Sol" and "Bel'Veth"
                      read whole instead of as "Aurelion …". */}
                  <span className="line-clamp-2 w-full break-words text-center text-[11px] font-bold leading-[1.15]"
                    style={{ color: active ? INK.strong : INK.body }} title={c.name}>
                    {c.name}
                  </span>
                  {c.conventional ? null : (
                    <span className="whitespace-nowrap text-[8.5px] font-extrabold uppercase tracking-wide" style={{ color: INK.faint }}>
                      Off-meta
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── The protected footer: never shrinks, always last. ─────────── */}
      <div className="flex shrink-0 flex-col gap-1.5" data-testid="rc-footer">
      <div className="flex min-h-[40px] items-center gap-2.5" data-testid="rc-selection">
        {selected ? (
          <>
            <ChampionPortrait champion={selected} size={38} />
            <div className="min-w-0 text-left">
              <p className="truncate text-sm font-extrabold" style={{ color: INK.strong }}>
                {selected.name} · {RANKED_ROLE_LABELS[role]}
              </p>
              <p className="text-[11px] font-semibold" style={{ color: INK.faint }}>
                {selected.conventional
                  ? "A conventional pick for this role"
                  : "Off-meta — still a full challenge"}
              </p>
            </div>
          </>
        ) : (
          <p className="text-[12px] font-semibold" style={{ color: INK.faint }}>
            {catalogState === "ready" ? "Choose a role and a champion." : " "}
          </p>
        )}
      </div>

      {hasAccount && statusState === "error" ? (
        <div className="flex items-center justify-between gap-2 text-xs" role="alert" data-testid="rc-status-error">
          <span style={{ color: INK.rubric }} className="font-bold">Couldn't check today's Role Challenge.</span>
          <button type="button" onClick={() => void refreshStatus()}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 font-black uppercase"
            style={{ border: `1px solid ${INK.rule}`, color: INK.strong }}>
            <RotateCcw className="h-3 w-3" aria-hidden="true" /> Retry
          </button>
        </div>
      ) : null}
      {hasAccount && eligibility?.message ? (
        <p role="status" className="text-[11.5px] font-semibold leading-snug" style={{ color: INK.body }}
          data-testid="rc-eligibility">
          {eligibility.message}
          {eligibility.offerUpgrade ? (
            <>
              {" "}
              <Link to={PREMIUM_HREF} className="font-extrabold underline underline-offset-2" style={{ color: INK.accent }}>
                Go Premium for unlimited starts
              </Link>
            </>
          ) : null}
          {eligibility.offerRetry ? (
            <>
              {" "}
              <button type="button" onClick={() => void refreshStatus()} className="font-extrabold underline"
                style={{ color: INK.accent }}>
                Retry
              </button>
            </>
          ) : null}
        </p>
      ) : null}
      {error ? <p role="alert" className="text-[12px] font-bold" style={{ color: INK.rubric }}>{error}</p> : null}

      <button
        type="button"
        disabled={hasAccount ? !canStart : catalogState === "loading"}
        onClick={start}
        className="inline-flex w-full items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3 py-3 text-[13px] font-black uppercase tracking-[0.06em] text-amber-50 shadow-sm transition-opacity disabled:cursor-not-allowed disabled:opacity-45"
        style={{ background: "linear-gradient(180deg, #6b4510 0%, #3f2706 100%)", border: "1px solid #2a1a04" }}
        data-testid="rc-play"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
        {!hasAccount ? "Sign in to play" : busy ? "Starting…" : activeRun ? "Challenge in progress" : "Play Role Challenge"}
      </button>
      <p className="text-center text-[10px] font-semibold leading-tight" style={{ color: INK.faint }}>
        {loading ? "Loading…" : "Unrated · No effect on Ranked rating or history"}
      </p>
      </div>
    </div>
  );
}
