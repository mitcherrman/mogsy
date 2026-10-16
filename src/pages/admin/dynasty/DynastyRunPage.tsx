/**
 * ROG1-D1 — Worlds Dynasty, the owner-only run prototype at `/admin/dynasty`.
 *
 * Mounted inside `<AdminRoute>`; every call goes to the ROG1-C1 backend
 * (`/api/admin/dynasty`, `DYNASTY_ENABLED` + `require_admin`). The page holds
 * no authoritative state: the backend owns the seed, offers, opponent, rolls
 * and score, and this page renders its public snapshot.
 *
 *   begin/resume → draft (7 picks) → relic (1 of 3) → lineup → match → result
 *
 * `transport` is injectable so tests and the DEV preview (`/dev/dynasty`)
 * can drive the same page with recorded backend responses.
 */
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowLeft, Crown, PowerOff, RefreshCw, ShieldAlert, X } from "lucide-react";
import { MogzyMascot } from "@/components/mascot/MogzyMascot";
import { useSfx } from "@/lib/audio/useSfx";
import { httpDynastyTransport, type DynastyTransport } from "@/lib/dynasty/client";
import type { DynastySnapshot } from "@/lib/dynasty/contracts";
import { cn } from "@/lib/utils";
import { DraftStage } from "./DraftStage";
import { LineupStage } from "./LineupStage";
import { MatchStage } from "./MatchStage";
import { RelicStage } from "./RelicStage";
import { Eyebrow, GOLD_TEXT, PhaseRail, RosterRail, SURFACE, SyntheticBanner } from "./parts";
import { useDynastyRun, type DynastyFatal, type DynastyNotice } from "./useDynastyRun";

export interface DynastyRunPageProps {
  transport?: DynastyTransport;
  storageKey?: string;
  retryDelaysMs?: number[];
  /** Shown above the board (the DEV preview's fixture note); re-rendered with each snapshot. */
  topSlot?: (snapshot: DynastySnapshot | null) => ReactNode;
}

export default function DynastyRunPage({ transport, storageKey, retryDelaysMs, topSlot }: DynastyRunPageProps) {
  const t = useMemo(() => transport ?? httpDynastyTransport(), [transport]);
  const run = useDynastyRun({ transport: t, storageKey, retryDelaysMs });
  const sfx = useSfx();
  const { snapshot } = run;

  // A new phase is a new screen: start it from the top.
  const lastPhase = useRef<string | null>(null);
  useEffect(() => {
    const phase = snapshot?.phase ?? null;
    if (lastPhase.current && phase && phase !== lastPhase.current) {
      try { window.scrollTo({ top: 0 }); } catch { /* jsdom */ }
    }
    lastPhase.current = phase;
  }, [snapshot?.phase]);

  const press = <A extends unknown[]>(fn: (...a: A) => unknown) => (...a: A) => {
    sfx.play("ui.button.press");
    void fn(...a);
  };

  let body: ReactNode;
  if (run.fatal) {
    body = <FatalPanel fatal={run.fatal} onNewRun={press(run.beginNew)} />;
  } else if (!snapshot) {
    body = (
      <Lobby
        loading={run.load === "loading"}
        unreachable={run.load === "unreachable"}
        hasStoredRun={run.hasStoredRun}
        onBegin={press(run.begin)}
        onNew={press(run.beginNew)}
      />
    );
  } else {
    const showRail = snapshot.phase !== "completed";
    const stage = (() => {
      switch (snapshot.phase) {
        case "draft":
          return <DraftStage snapshot={snapshot} champions={run.champions} busy={run.busy !== null} onPick={press((id: string) => run.act("draft_pick", { player_id: id }))} />;
        case "relic":
          return (
            <RelicStage
              snapshot={snapshot}
              busy={run.busy !== null}
              onChoose={press((id: string, role: string | null) => run.act("choose_relic", role ? { relic_id: id, target_role: role } : { relic_id: id }))}
            />
          );
        case "lineup":
          return (
            <LineupStage
              snapshot={snapshot}
              champions={run.champions}
              busy={run.busy}
              onPick={press((role: string, key: string) => run.act("pick_champion", { role, champion_key: key }))}
              onSwap={press((id: string) => run.act("swap_substitute", { player_id: id }))}
              onPlay={press(() => run.act("play_match", {}))}
            />
          );
        case "completed":
          return <MatchStage snapshot={snapshot} fresh={run.freshMatch} onNewRun={press(run.beginNew)} busy={run.busy !== null} />;
      }
    })();
    body = (
      <div className={cn("grid gap-4", showRail && "lg:grid-cols-[minmax(0,1fr)_300px]")}>
        <div className="min-w-0">{stage}</div>
        {showRail ? <aside className="min-w-0 lg:sticky lg:top-4 lg:self-start"><RosterRail snapshot={snapshot} champions={run.champions} /></aside> : null}
      </div>
    );
  }

  return (
    <div
      className="min-h-screen bg-[radial-gradient(ellipse_at_top,hsl(214_60%_14%),hsl(220_60%_5%)_70%)] text-white"
      data-testid="dynasty-page"
      data-phase={snapshot?.phase ?? "none"}
    >
      <div className="mx-auto w-full max-w-6xl space-y-4 px-4 pb-24 pt-4 sm:px-6 sm:pt-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Link to="/admin" className="rounded-lg p-1.5 text-white/60 transition hover:bg-white/10 hover:text-white" aria-label="Back to admin">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="min-w-0">
              <Eyebrow>Owner prototype · ROG1</Eyebrow>
              <h1 className="mt-1 flex items-center gap-2 text-2xl font-black tracking-tight sm:text-3xl">
                <Crown className={cn("h-6 w-6", GOLD_TEXT)} aria-hidden /> Worlds Dynasty
              </h1>
            </div>
          </div>
          <PhaseRail phase={snapshot?.phase ?? null} />
        </header>
        <SyntheticBanner snapshot={snapshot} />
        {topSlot?.(snapshot)}
        {run.notice ? (
          <NoticeBar notice={run.notice} canRetry={run.canRetry} retrying={run.busy !== null} onRetry={press(run.retry)} onDismiss={run.dismissNotice} />
        ) : null}
        {body}
      </div>
    </div>
  );
}

function Lobby({ loading, unreachable, hasStoredRun, onBegin, onNew }: {
  loading: boolean; unreachable: boolean; hasStoredRun: boolean; onBegin: () => void; onNew: () => void;
}) {
  return (
    <section className={cn(SURFACE, "flex flex-col items-center gap-5 p-6 text-center sm:flex-row sm:text-left")} data-testid="dynasty-lobby">
      <MogzyMascot pose={loading ? "thinking" : "explaining"} decorative scale="compact" className="h-36 w-24 shrink-0 object-contain" />
      <div className="min-w-0 flex-1 space-y-2">
        <h2 className="text-xl font-bold tracking-tight">{hasStoredRun ? "Resume your run" : "Build a dynasty"}</h2>
        <p className="max-w-xl text-[13px] leading-relaxed text-white/65">
          Draft seven players from offers of three, equip one relic, lock champions and play one simulated match:
          five lane battles worth a point each and a team battle worth two. First to 4 of 7 wins.
          Every offer, roll and score comes from the server.
        </p>
        {unreachable ? (
          <p className="text-[12.5px] text-rose-300" role="alert">The Dynasty backend did not answer. Start it locally with <code>DYNASTY_ENABLED=1</code>, then try again.</p>
        ) : null}
        <div className="flex flex-wrap justify-center gap-2 pt-1 sm:justify-start">
          <button
            type="button"
            onClick={onBegin}
            disabled={loading}
            className="rounded-xl bg-[#e3c66f] px-5 py-2.5 text-sm font-bold text-[#1a1406] shadow transition hover:bg-[#f1dc95] disabled:opacity-50"
            data-testid="dynasty-begin"
          >
            {loading ? "Connecting…" : hasStoredRun ? "Resume run" : "Begin run"}
          </button>
          {hasStoredRun ? (
            <button type="button" onClick={onNew} disabled={loading} className="rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-white/85 transition hover:bg-white/10 disabled:opacity-50">
              Start a new run instead
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function NoticeBar({ notice, canRetry, retrying, onRetry, onDismiss }: {
  notice: DynastyNotice; canRetry: boolean; retrying: boolean; onRetry: () => void; onDismiss: () => void;
}) {
  const tone = {
    error: "border-rose-400/40 bg-rose-500/10 text-rose-100",
    warning: "border-amber-400/40 bg-amber-400/10 text-amber-100",
    info: "border-sky-400/30 bg-sky-400/10 text-sky-100",
  }[notice.tone];
  return (
    <div role={notice.tone === "info" ? "status" : "alert"} className={cn("flex items-start gap-3 rounded-xl border px-3 py-2.5", tone)} data-testid="dynasty-notice" data-code={notice.code ?? ""}>
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1 text-[12.5px] leading-snug">
        <p className="font-semibold">{notice.title}</p>
        <p className="opacity-85">{notice.message}</p>
      </div>
      {canRetry ? (
        <button type="button" onClick={onRetry} disabled={retrying} className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-current/30 px-2.5 py-1 text-[12px] font-semibold hover:bg-white/10 disabled:opacity-50" data-testid="dynasty-retry">
          <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Retry
        </button>
      ) : null}
      <button type="button" onClick={onDismiss} className="shrink-0 rounded p-1 opacity-70 hover:opacity-100" aria-label="Dismiss">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function FatalPanel({ fatal, onNewRun }: { fatal: DynastyFatal; onNewRun: () => void }) {
  const copy: Record<DynastyFatal["kind"], { icon: ReactNode; title: string; message: string; action?: string }> = {
    disabled: {
      icon: <PowerOff className="h-5 w-5 text-amber-300" aria-hidden />,
      title: "Worlds Dynasty is switched off on this backend",
      message: "The backend answered DYNASTY_DISABLED. Set DYNASTY_ENABLED=1 on a local backend running the ROG1-C1 branch to play.",
    },
    forbidden: {
      icon: <ShieldAlert className="h-5 w-5 text-rose-300" aria-hidden />,
      title: "Owner session required",
      message: "The backend refused this session. Sign in as the owner and reload.",
    },
    not_found: {
      icon: <AlertTriangle className="h-5 w-5 text-amber-300" aria-hidden />,
      title: "That run no longer exists",
      message: "The backend has no run for this browser's saved key (a fresh local database, or another owner account).",
      action: "Start a new run",
    },
    integrity: {
      icon: <ShieldAlert className="h-5 w-5 text-rose-300" aria-hidden />,
      title: "The server refused this run",
      message: "The run failed its replay check, so the server will not continue it. Nothing was changed.",
      action: "Start a new run",
    },
    invalid: {
      icon: <AlertTriangle className="h-5 w-5 text-rose-300" aria-hidden />,
      title: "Unexpected response",
      message: "The backend answered with something this page cannot read safely. Is the backend on the ROG1-C1 contract?",
    },
  };
  const c = copy[fatal.kind];
  const detail = "message" in fatal ? fatal.message : null;
  return (
    <section className={cn(SURFACE, "flex items-start gap-3 p-5")} role="alert" data-testid="dynasty-fatal" data-kind={fatal.kind}>
      {c.icon}
      <div className="min-w-0 flex-1 space-y-1.5">
        <h2 className="text-base font-bold">{c.title}</h2>
        <p className="text-[13px] leading-relaxed text-white/70">{c.message}</p>
        {detail ? <p className="break-words font-mono text-[11px] text-white/45">{detail}</p> : null}
        {c.action ? (
          <button type="button" onClick={onNewRun} className="mt-2 rounded-xl bg-[#e3c66f] px-4 py-2 text-sm font-bold text-[#1a1406]">{c.action}</button>
        ) : null}
      </div>
    </section>
  );
}
