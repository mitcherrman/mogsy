/**
 * The finals intro (a port of the Dynasty `FullFrame kind="finals_intro"`):
 * the two finalists slide in from either side, a bolt of light crosses, the
 * VS stamps. Auto-dismisses; skippable with tap, Esc, Enter or Space.
 * Reduced motion: a single static VS frame, dismissible.
 */
import { useEffect, useRef, useState, type CSSProperties } from "react";

import { useSfx } from "@/lib/audio/useSfx";
import { useMotionAllowed } from "@/lib/motion/useReveal";
import { cn } from "@/lib/utils";

import { ARENA_SFX } from "../audio";
import type { ArenaEntrant } from "../contracts";
import { accentStyle } from "../identity";
import { TA } from "../motion";
import { Btn, EntrantAvatar, Eyebrow, VersusMark } from "../ui/parts";

export function FinalsIntro({ a, b, title, kicker = "The final", bestOf, onDone, holdMs, sfxId }: {
  a: ArenaEntrant | null;
  b: ArenaEntrant | null;
  title: string;
  kicker?: string;
  bestOf: number;
  onDone: () => void;
  holdMs?: number;
  /** Stable id so the cue plays once per occasion. */
  sfxId: string;
}) {
  const motion = useMotionAllowed();
  const sfx = useSfx();
  const [gone, setGone] = useState(false);
  const done = useRef(false);
  const hold = holdMs ?? (motion ? TA.finalsIntro : 2400);
  useEffect(() => {
    sfx.play(ARENA_SFX.versus, { eventId: sfxId });
  }, [sfx, sfxId]);
  useEffect(() => {
    const finish = () => { if (done.current) return; done.current = true; setGone(true); onDone(); };
    const t = window.setTimeout(finish, hold);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" || e.key === "Enter" || e.key === " ") { e.preventDefault(); finish(); } };
    window.addEventListener("keydown", onKey);
    return () => { window.clearTimeout(t); window.removeEventListener("keydown", onKey); };
  }, [hold, onDone]);
  if (gone) return null;
  const skip = () => { if (done.current) return; done.current = true; setGone(true); onDone(); };
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="ta-finals-intro"
      onClick={skip}
      className={cn("ta ta-cine cursor-pointer select-none", motion && "ta-cine--in ta-cine--motion")}
      style={{ "--ta-light": "262 70% 64%" } as CSSProperties}
    >
      <span aria-hidden="true" className="ta-cine-spot" />
      <span aria-hidden="true" className="ta-cine-bolt pointer-events-none absolute inset-y-0 left-1/2 w-[18vw] -translate-x-1/2 bg-[linear-gradient(90deg,transparent,rgba(255,243,196,0.35),transparent)] opacity-0" />
      <div className="relative flex w-full max-w-3xl flex-col items-center gap-5 px-6 text-center">
        <Eyebrow><span className="text-[#c9a7ff]">{kicker}</span></Eyebrow>
        <div className="flex items-center justify-center gap-6 sm:gap-12">
          <Seat entrant={a} side="left" />
          <span className="relative inline-flex items-center justify-center">
            <span aria-hidden="true" className="ta-cine-vs-ring absolute inset-[-10%] rounded-full border border-[#f6dd8f]/60 opacity-0" />
            <span className="ta-cine-word"><VersusMark size={92} /></span>
          </span>
          <Seat entrant={b} side="right" />
        </div>
        <h2 className="ta-title ta-cine-word ta-title--gold text-[30px] font-bold uppercase tracking-[0.18em] sm:text-[44px]">{title}</h2>
        <p className="ta-cine-rows text-[12.5px] text-white/70">Best of {bestOf} · the winner takes the Arena</p>
      </div>
      <div className="absolute bottom-6 right-6" onClick={(e) => e.stopPropagation()}>
        <Btn size="sm" onClick={skip} data-testid="ta-cine-skip">Skip</Btn>
      </div>
    </div>
  );
}

function Seat({ entrant, side }: { entrant: ArenaEntrant | null; side: "left" | "right" }) {
  return (
    <div className={cn("flex flex-col items-center gap-3", side === "left" ? "ta-cine-left" : "ta-cine-right")} style={accentStyle(entrant?.profile_id)} data-testid={`ta-finals-seat-${side}`}>
      <span className="ta-seat__figure ta-seat__figure--float">
        <EntrantAvatar entrant={entrant} size="xl" crown={false} facing={side === "left" ? "right" : "left"} className="!h-full !w-full !rounded-[1.2rem]" />
      </span>
      <span className="ta-title max-w-[9rem] truncate text-[15px] font-semibold text-white sm:max-w-[12rem] sm:text-[18px]">{entrant?.display_name ?? "TBD"}</span>
      {entrant?.seed && <span className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-[var(--ta-accent)]">Seed {entrant.seed}</span>}
    </div>
  );
}
