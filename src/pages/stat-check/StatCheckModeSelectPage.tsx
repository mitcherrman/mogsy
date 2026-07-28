/**
 * Public Stat Check entrance. One screen, three modes: the local bot game, the
 * existing private-room flow, and a visibly locked Online Queue placeholder.
 *
 * This page owns no game or room state whatsoever — it is a router surface.
 * In particular the private option only *navigates* to the room route; room
 * creation still happens behind the room page's own "Create room" control, so
 * simply landing on /quiz/stat-check can no longer create a room.
 */
import { Link } from "react-router-dom";
import { Bot, Globe2, Lock, Swords, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import stoneSurfaceUrl from "@/assets/stat-check/board/stat-check-stone-surface.png";

type ModeTone = "primary" | "secondary";

function ModeCard({
  to,
  eyebrow,
  title,
  description,
  Icon,
  tone,
  testId,
}: {
  to: string;
  eyebrow: string;
  title: string;
  description: string;
  Icon: typeof Bot;
  tone: ModeTone;
  testId: string;
}) {
  const primary = tone === "primary";
  return (
    <Link
      to={to}
      data-testid={testId}
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-2xl border-2 p-5 text-left transition-transform",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#050b12]",
        "hover:-translate-y-0.5 motion-reduce:transform-none",
        primary
          ? "border-[#d6b55d] shadow-[inset_0_2px_0_rgba(244,215,125,0.3),0_6px_0_-2px_#241d0e,0_18px_36px_rgba(0,0,0,0.55)] sm:p-6"
          : "border-cyan-300/30 shadow-[inset_0_1px_0_rgba(120,220,240,0.18),0_4px_0_-2px_#0a1520,0_14px_28px_rgba(0,0,0,0.45)]",
      )}
      style={{
        backgroundImage: `linear-gradient(180deg, rgba(27,37,54,0.55) 0%, rgba(9,14,24,0.82) 100%), url(${stoneSurfaceUrl})`,
        backgroundSize: "auto, 640px 640px",
      }}
    >
      <span
        className={cn(
          "grid h-11 w-11 shrink-0 place-items-center rounded-full border-2",
          primary ? "border-[#d6b55d]/60 bg-[#1c1730] text-[#f4d77d]" : "border-cyan-300/40 bg-black/40 text-cyan-200",
        )}
      >
        <Icon className="h-6 w-6" aria-hidden="true" />
      </span>
      <span
        className={cn(
          "mt-3 text-[10px] font-black uppercase tracking-[0.2em]",
          primary ? "text-[#f4d77d]" : "text-cyan-200/80",
        )}
      >
        {eyebrow}
      </span>
      <span className={cn("mt-0.5 font-black text-white", primary ? "text-2xl" : "text-xl")}>{title}</span>
      <span className="mt-1 text-sm text-slate-300">{description}</span>
    </Link>
  );
}

export default function StatCheckModeSelectPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050b12] px-4 py-10 text-slate-100">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_18%,rgba(25,187,211,0.18),transparent_38%),radial-gradient(circle_at_50%_100%,rgba(201,168,76,0.14),transparent_38%),linear-gradient(180deg,#091421_0%,#071018_45%,#04070b_100%)]" />

      <div className="relative mx-auto w-full max-w-5xl">
        <header className="text-center">
          <div className="flex items-center justify-center gap-2 text-[11px] font-bold uppercase tracking-[0.22em] text-[#d6b55d]">
            <Swords className="h-4 w-4" aria-hidden="true" /> Stat Check
          </div>
          <h1 className="mt-1 text-3xl font-black leading-tight sm:text-4xl">Choose your match</h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-300">
            Build a hand, commit champions to three stat lanes, and win the board.
          </p>
        </header>

        <div className="mt-7 grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <ModeCard
              to="/quiz/stat-check/bot"
              eyebrow="Play now"
              title="Play vs Bot"
              description="Practice against the Stat Check bot. Learn champion stats and test your decisions."
              Icon={Bot}
              tone="primary"
              testId="sc-mode-bot"
            />
          </div>

          <ModeCard
            to="/quiz/stat-check/private"
            eyebrow="Invite a friend"
            title="Private Match"
            description="Create a room and share the invite link with one opponent."
            Icon={Users}
            tone="secondary"
            testId="sc-mode-private"
          />

          {/*
           * Online Queue is deliberately inert: a native <button disabled>, so
           * it is skipped by keyboard traversal and cannot be activated by
           * click, Enter or Space. It has no onClick, issues no request and
           * creates no room. No wait time, queue depth or player count is shown
           * because none exists.
           */}
          <button
            type="button"
            disabled
            aria-disabled="true"
            data-testid="sc-mode-queue"
            aria-describedby="sc-mode-queue-note"
            className={cn(
              "group relative flex cursor-not-allowed flex-col overflow-hidden rounded-2xl border-2 border-slate-500/35 p-5 text-left",
              "shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_4px_0_-2px_#0a1018]",
            )}
            style={{
              backgroundImage: `linear-gradient(180deg, rgba(20,26,36,0.72) 0%, rgba(6,9,14,0.9) 100%), url(${stoneSurfaceUrl})`,
              backgroundSize: "auto, 640px 640px",
            }}
          >
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full border-2 border-slate-400/35 bg-black/45 text-slate-300">
              <Globe2 className="h-6 w-6" aria-hidden="true" />
            </span>
            <span className="mt-3 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
              <Lock className="h-3 w-3" aria-hidden="true" /> Coming soon
            </span>
            <span className="mt-0.5 text-xl font-black text-slate-200">Online Queue</span>
            <span id="sc-mode-queue-note" className="mt-1 text-sm text-slate-400">
              Online matchmaking is not available yet. Play a private match with a friend in the
              meantime.
            </span>
          </button>
        </div>
      </div>
    </main>
  );
}
