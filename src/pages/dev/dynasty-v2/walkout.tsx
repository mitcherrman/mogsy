/**
 * VIS-F4 — walking onto the stage. A two-beat in-flow sequence (W2, never
 * modal, skippable) that replaces the flat tunnel frame:
 *
 *   beat "tunnel" — the corridor with the five starters walking out, their
 *                   names, roles and locked champions, the opponent on the
 *                   wall board; backstage murmur under a hush.
 *   beat "stage"  — the stadium reveal: the big board with both teams,
 *                   the game label and the variant, a flash, the crowd swell.
 *
 * Holds ~3.4 s in total, then calls `onDone`; the game view keeps the
 * compact lineup strip afterwards. Reduced motion shows the stage beat only,
 * static, for 2 s.
 */
import { useEffect, useRef, useState } from "react";
import { useMotionAllowed } from "@/lib/motion/useReveal";
import { cn } from "@/lib/utils";
import { hush, playCue, playMoment } from "./audio";
import { StadiumScene, TunnelScene, type EnvState } from "./environments";
import { CHAMPS_BY_ROLE, ROLES, type Role } from "./fixtures";
import { Btn } from "./parts";

const ROLE_SHORT: Record<Role, string> = { top: "TOP", jng: "JNG", mid: "MID", bot: "BOT", sup: "SUP" };

export function WalkoutSequence({ env, picks, gameLabel, onDone, className }: { env: EnvState; picks: Partial<Record<Role, string>>; gameLabel: string; onDone: () => void; className?: string }) {
  const motion = useMotionAllowed();
  const [beat, setBeat] = useState<"tunnel" | "stage">(motion ? "tunnel" : "stage");
  const done = useRef(false);
  const finish = () => { if (done.current) return; done.current = true; onDone(); };
  useEffect(() => {
    hush(350);
    const timers: number[] = [];
    if (motion) {
      timers.push(window.setTimeout(() => { setBeat("stage"); playMoment("dyn.crowd.swell"); playCue("dynasty.game.stage_open"); }, 1700));
      timers.push(window.setTimeout(finish, 3400));
    } else {
      playMoment("dyn.crowd.swell");
      timers.push(window.setTimeout(finish, 2000));
    }
    return () => timers.forEach((t) => window.clearTimeout(t));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const team = (env.team ?? "").replace(/^SYN /, ""), opp = (env.opp ?? "").replace(/^SYN /, "");
  const rim = env.variant === "finals" ? "text-[#c9a7ff]" : env.variant === "elimination" ? "text-rose-200" : "text-[#f6dd8f]";
  return (
    <figure data-testid="walkout" data-beat={beat} className={cn("dyn-walkout h-[230px] sm:h-[310px]", motion && "dyn-walkout--motion", className)} style={{ "--hold": motion ? "3.4s" : "2s" } as React.CSSProperties}>
      {beat === "tunnel" ? (
        <div className="dyn-walkout-beat" data-beat="tunnel">
          <TunnelScene env={env} walking />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(7,17,31,0.85),rgba(7,17,31,0.35)_45%,rgba(7,17,31,0.1))]" />
          <div className="absolute inset-y-0 left-0 flex w-[58%] flex-col justify-center gap-1 px-4 sm:w-[46%]">
            <span className="text-[9.5px] font-bold uppercase tracking-[0.22em] text-[#e3c66f]">{gameLabel} · walking out</span>
            <ol className="dyn-walkout-names mt-1 flex flex-col gap-0.5" data-testid="walkout-names">
              {ROLES.map((r, i) => {
                const p = env.roster?.find((x) => x.role === r);
                const c = CHAMPS_BY_ROLE[r].find((x) => x.id === picks[r]);
                return <li key={r} style={{ "--i": i } as React.CSSProperties} className="flex items-baseline gap-2 text-[12px] leading-tight text-white/90 sm:text-[13px]"><span className="w-7 text-[9px] font-bold tracking-[0.18em] text-white/45">{ROLE_SHORT[r]}</span><span className="dyn-title truncate font-semibold">{(p?.name ?? "—").replace(/^SYN-/, "")}</span>{c ? <span className="truncate text-[10.5px] text-white/50">{c.name.replace(/^SYN /, "")}</span> : null}</li>;
              })}
            </ol>
            <span className="mt-1 text-[10px] uppercase tracking-[0.18em] text-white/50">vs <b className="text-white/80">{opp || "the opposition"}</b></span>
          </div>
        </div>
      ) : (
        <div className="dyn-walkout-beat" data-beat="stage">
          <StadiumScene env={{ ...env, live: false, score: "VS", stageLabel: gameLabel }} motion={motion} />
          <span aria-hidden className="dyn-walkout-flash absolute inset-0 bg-[#fff3c4] opacity-0" />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(7,17,31,0.15),rgba(7,17,31,0.1)_55%,rgba(7,17,31,0.9))]" />
          <div className="dyn-walkout-board absolute inset-x-0 bottom-3 flex flex-col items-center gap-1 px-4 text-center">
            <span className={cn("text-[9.5px] font-bold uppercase tracking-[0.24em]", rim)}>{env.variant === "finals" ? "Worlds Final" : env.variant === "elimination" ? "Elimination game" : "Main stage"} · {gameLabel}</span>
            <span className="dyn-title text-[20px] font-bold leading-tight text-white sm:text-[26px]"><span className="text-[#f6dd8f]">{team || "Us"}</span> <span className="text-white/50">vs</span> {opp || "Them"}</span>
          </div>
        </div>
      )}
      <div className="absolute right-2 top-2"><Btn testId="walkout-skip" className="min-h-[30px] px-3 py-1 text-[11px]" onClick={finish}>Skip</Btn></div>
      <div className="dyn-walkout-progress" aria-hidden><span /></div>
    </figure>
  );
}
