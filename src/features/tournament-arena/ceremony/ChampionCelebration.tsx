/**
 * The championship (a port of the Dynasty `FullFrame kind="championship"`):
 * black → flash → the cup rises → rotating conic rays → CSS confetti → the
 * champion's name in Cinzel → their mascot celebrates. Reduced motion: a
 * static trophy plate with the name; no confetti, no rays. Skippable.
 */
import { useEffect, useRef, useState, type CSSProperties } from "react";

import { RoleMascot } from "@/components/mascot/RoleMascot";
import { useSfx } from "@/lib/audio/useSfx";
import { useMotionAllowed } from "@/lib/motion/useReveal";
import { cn } from "@/lib/utils";

import { ARENA_SFX } from "../audio";
import type { ArenaEntrant } from "../contracts";
import { accentFor, accentStyle, entrantRole } from "../identity";
import { Btn, EntrantAvatar } from "../ui/parts";
import { Trophy } from "./Trophy";

const G = "#e3c66f";

export function ChampionCelebration({ champion, runnerUp, eventTitle, score, onDone, sfxId, holdMs }: {
  champion: ArenaEntrant;
  runnerUp?: ArenaEntrant | null;
  eventTitle: string;
  /** "3–1" when the final had one. */
  score?: string | null;
  onDone: () => void;
  sfxId: string;
  holdMs?: number;
}) {
  const motion = useMotionAllowed();
  const sfx = useSfx();
  const [gone, setGone] = useState(false);
  const done = useRef(false);
  const accent = accentFor(champion.profile_id).hex;
  const role = entrantRole(champion);
  const hold = holdMs ?? (motion ? 6500 : 3500);
  useEffect(() => {
    const t = window.setTimeout(() => sfx.play(ARENA_SFX.champion, { eventId: sfxId }), motion ? 650 : 0);
    return () => window.clearTimeout(t);
  }, [sfx, sfxId, motion]);
  useEffect(() => {
    const finish = () => { if (done.current) return; done.current = true; setGone(true); onDone(); };
    const t = window.setTimeout(finish, hold);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" || e.key === "Enter" || e.key === " ") { e.preventDefault(); finish(); } };
    window.addEventListener("keydown", onKey);
    return () => { window.clearTimeout(t); window.removeEventListener("keydown", onKey); };
  }, [hold, onDone]);
  if (gone) return null;
  const skip = () => { if (done.current) return; done.current = true; setGone(true); onDone(); };
  const confetti = Array.from({ length: 40 }, (_, i) => ({
    left: `${(i * 173) % 100}%`,
    "--x": `${((i * 37) % 140) - 70}px`,
    "--r": `${300 + ((i * 97) % 500)}deg`,
    "--d": (i * 53) % 900,
    background: i % 4 === 0 ? "#fff1b8" : i % 4 === 1 ? G : i % 4 === 2 ? accent : "#8fd3ff",
  }) as CSSProperties);
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="ta-champion"
      onClick={skip}
      className={cn("ta ta-cine cursor-pointer select-none", motion && "ta-cine--in ta-cine--motion")}
      style={{ "--ta-light": "44 90% 62%", ...accentStyle(champion.profile_id) } as CSSProperties}
    >
      <span aria-hidden="true" className="ta-cine-spot" />
      <div className="relative flex w-full max-w-3xl flex-col items-center gap-2 px-6 text-center">
        <span
          aria-hidden="true"
          className="ta-champ-rays pointer-events-none absolute left-1/2 top-[38%] h-[160vmax] w-[160vmax] -translate-x-1/2 -translate-y-1/2"
          style={{ background: "repeating-conic-gradient(from 0deg, rgba(246,221,143,0.12) 0 5deg, transparent 5deg 16deg)" }}
        />
        {motion && (
          <div aria-hidden="true" className="pointer-events-none fixed inset-0 overflow-hidden" data-testid="ta-confetti">
            {confetti.map((s, i) => <span key={i} className="ta-confetti" style={s} />)}
          </div>
        )}
        <div className="ta-champ-trophy relative"><Trophy accent={accent} size={140} /></div>
        <h2 className="ta-title ta-champ-title ta-title--gold relative text-[34px] font-black uppercase tracking-[0.2em] sm:text-[58px]">Champion</h2>
        <div className="ta-champ-name relative mt-1 flex items-center gap-3">
          <EntrantAvatar entrant={champion} size="md" />
          <p className="ta-title text-[20px] text-white sm:text-[26px]">{champion.display_name}</p>
        </div>
        <p className="ta-champ-meta relative text-[12.5px] uppercase tracking-[0.18em] text-[#f6dd8f]/80">
          {eventTitle}
          {runnerUp ? <span className="text-white/60"> · over {runnerUp.display_name}</span> : null}
          {score ? <span className="text-white/60"> · {score}</span> : null}
        </p>
        {role && (
          <div className="ta-champ-mascot pointer-events-none absolute -bottom-40 left-1/2 h-40 w-32 -translate-x-1/2 sm:-bottom-44 sm:h-44 sm:w-36" aria-hidden="true">
            <RoleMascot role={role} art="compact" fit="contain" action="celebrate" actionId={sfxId} className="h-full w-full" loading="eager" />
          </div>
        )}
      </div>
      <span aria-hidden="true" className="ta-champ-black pointer-events-none absolute inset-0 bg-black" />
      <span aria-hidden="true" className="ta-champ-flash pointer-events-none absolute inset-0 bg-[#fff3c4]" />
      <div className="absolute bottom-6 right-6" onClick={(e) => e.stopPropagation()}>
        <Btn size="sm" onClick={skip} data-testid="ta-cine-skip">Continue</Btn>
      </div>
    </div>
  );
}
