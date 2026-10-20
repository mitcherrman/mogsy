/**
 * VIS-F2 — the ambient broadcast layer: stingers (short title plates for
 * signature moments), caster pop-ins (two fictional casters), chat moments
 * (a fictional viewer chat) and the crowd meter. All lines are generated
 * deterministically from the moment and a key, so a seed replays the same
 * broadcast. Nothing here reads or writes engine state, draws no dice, and
 * every element is decorative: it never carries information the screen does
 * not already show in text.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useSfx } from "@/lib/audio/useSfx";
import { useMotionAllowed } from "@/lib/motion/useReveal";
import { cn } from "@/lib/utils";
import { MEDIA_SLOTS, pick } from "./media";

// ───────────────────────────────────────────────────────────── stingers

export type StingerTone = "gold" | "violet" | "ember" | "ice" | "red" | "neutral";
export interface StingerSpec { id: string; kicker?: string; title: string; sub?: string; tone?: StingerTone; ms?: number; cue?: string }

const StingerCtx = createContext<{ fire: (s: StingerSpec) => void } | null>(null);

/** Hosts the stinger plate at the top of the viewport. One at a time; a new one replaces the current. */
export function StingerHost({ children }: { children: ReactNode }) {
  const [cur, setCur] = useState<StingerSpec | null>(null);
  const [take, setTake] = useState(0);
  const timer = useRef<number | null>(null);
  const motion = useMotionAllowed();
  const sfx = useSfx();
  const fire = useCallback((s: StingerSpec) => {
    if (timer.current) window.clearTimeout(timer.current);
    setCur(s); setTake((t) => t + 1);
    if (s.cue) sfx.play(s.cue as never);
    timer.current = window.setTimeout(() => setCur(null), s.ms ?? (motion ? 1700 : 1400));
  }, [motion, sfx]);
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);
  const value = useMemo(() => ({ fire }), [fire]);
  return (
    <StingerCtx.Provider value={value}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 top-[5.75rem] z-40 flex justify-center px-4" data-testid="stinger-host">
        {cur ? (
          <div key={take} data-testid="stinger" data-stinger={cur.id} data-tone={cur.tone ?? "gold"}
            className={cn("dyn-stinger pointer-events-auto flex max-w-[34rem] items-center gap-3 rounded-xl border px-4 py-2.5 text-left shadow-[0_24px_48px_-24px_rgba(0,0,0,0.9)]", `dyn-stinger--${cur.tone ?? "gold"}`, motion && "dyn-stinger--in")}
            onClick={() => setCur(null)} role="status">
            <span aria-hidden className="dyn-stinger-bar h-9 w-1 rounded-full" />
            <span className="min-w-0">
              {cur.kicker ? <span className="block text-[10px] font-bold uppercase tracking-[0.22em] opacity-80">{cur.kicker}</span> : null}
              <span className="dyn-title block truncate text-[18px] font-bold leading-tight sm:text-[20px]">{cur.title}</span>
              {cur.sub ? <span className="block truncate text-[11.5px] opacity-80">{cur.sub}</span> : null}
            </span>
          </div>
        ) : null}
      </div>
    </StingerCtx.Provider>
  );
}

export function useStinger() {
  const ctx = useContext(StingerCtx);
  return ctx?.fire ?? (() => undefined);
}

// ───────────────────────────────────────────────────────────── casters

export type Moment =
  | "run.start" | "org.choose" | "player.sign" | "draft.lock" | "stage.open" | "objective.offer" | "objective.result"
  | "stage.result" | "game.win" | "game.loss" | "series.point" | "finals.intro" | "championship" | "run.defeat";

export const CASTERS = {
  analyst: { name: "SYN-Lyra", role: "Analyst", slot: "caster.analyst" },
  hype: { name: "SYN-Dax", role: "Play-by-play", slot: "caster.hype" },
} as const;
export type CasterId = keyof typeof CASTERS;

type Ctx = { team?: string; opp?: string; player?: string; stage?: string; label?: string; score?: string; objective?: string; tier?: string; org?: string };

const LINES: Record<Moment, { who: CasterId; text: (c: Ctx) => string }[]> = {
  "run.start": [
    { who: "analyst", text: (c) => `A new ${c.org ?? "organization"} roster takes the house. Two stars, three academy names, and a season to prove it.` },
    { who: "hype", text: () => "Doors open on a brand new campaign. Let's see who they build." },
  ],
  "org.choose": [
    { who: "analyst", text: (c) => `${c.org ?? "This org"} has an identity before it has a roster. The question is whether the signings fit it.` },
  ],
  "player.sign": [
    { who: "hype", text: (c) => `${c.player ?? "A new name"} is in the building. Paperwork done, honeymoon on.` },
    { who: "analyst", text: (c) => `Signing ${c.player ?? "mid-season"} buys talent and costs chemistry. Watch the cohesion meter.` },
  ],
  "draft.lock": [
    { who: "hype", text: () => "Draft is locked. No more swaps, no more comfort picks. Walk out." },
    { who: "analyst", text: (c) => `${c.label ?? "This composition"} tells you exactly when they want to fight.` },
  ],
  "stage.open": [
    { who: "hype", text: (c) => `${c.stage ?? "Stage"} opens with ${c.team ?? "the roster"} against ${c.opp ?? "the opposition"}.` },
    { who: "analyst", text: (c) => `${c.stage ?? "This stage"} is where ${c.team ?? "they"} said they would be strong. Prove it now.` },
  ],
  "objective.offer": [
    { who: "hype", text: (c) => `${c.objective ?? "The objective"} is up and both teams are posturing!` },
    { who: "analyst", text: (c) => `${c.objective ?? "This"} is a knowledge call. Three clean answers change the map; three wrong ones hand it over.` },
  ],
  "objective.result": [
    { who: "hype", text: (c) => `${c.tier ?? "It's decided"}! That is the call of the game so far.` },
    { who: "analyst", text: (c) => `${c.tier ?? "That outcome"}. You can see it in the advantage meter already.` },
  ],
  "stage.result": [
    { who: "hype", text: (c) => `${c.score ?? "Seven points"}, ${c.label ?? "and the stage is published"}.` },
    { who: "analyst", text: (c) => `${c.label ?? "That result"} in ${c.stage ?? "this stage"}: the lanes told the story before the team fight did.` },
  ],
  "game.win": [
    { who: "hype", text: (c) => `${c.team ?? "They"} take the game! Series score ${c.score ?? "moves"}.` },
  ],
  "game.loss": [
    { who: "analyst", text: (c) => `${c.opp ?? "The opponent"} close it. Nothing is decided in a best of five until three.` },
  ],
  "series.point": [
    { who: "hype", text: () => "MATCH POINT. One more game and this series is over." },
  ],
  "finals.intro": [
    { who: "hype", text: (c) => `Welcome to the Worlds Final. ${c.team ?? "Our team"} versus ${c.opp ?? "the last obstacle"}. Everything they built is on this stage.` },
    { who: "analyst", text: () => "Best of five, Fearless draft, no tomorrow. The season remembers whoever lifts it." },
  ],
  "championship": [
    { who: "hype", text: (c) => `${c.team ?? "THEY"} ARE YOUR WORLDS DYNASTY CHAMPIONS!` },
    { who: "analyst", text: () => "From an academy fill to the trophy. That is the roster story this run will be remembered for." },
  ],
  "run.defeat": [
    { who: "analyst", text: (c) => `${c.team ?? "The run"} ends here. Keep the duo, fix the early game, and come back for the title.` },
  ],
};

export function casterLine(moment: Moment, key: string, ctx: Ctx = {}): { who: CasterId; text: string } {
  const l = pick(LINES[moment], `${moment}|${key}`);
  return { who: l.who, text: l.text(ctx) };
}

/** A caster pop-in: portrait, name plate and one line. Decorative; the screen's own text carries the facts. */
export function CasterPop({ moment, k, ctx, className, compact }: { moment: Moment; k: string; ctx?: Ctx; className?: string; compact?: boolean }) {
  const motion = useMotionAllowed();
  const line = useMemo(() => casterLine(moment, k, ctx), [moment, k, ctx]);
  const c = CASTERS[line.who];
  const src = MEDIA_SLOTS[c.slot]?.src ?? null;
  return (
    <aside data-testid="caster-pop" data-caster={line.who} data-moment={moment} aria-label={`${c.name}, ${c.role}`}
      className={cn("dyn-caster relative flex items-end gap-2", motion && "dyn-caster--in", className)}>
      {src ? <img src={src} alt="" decoding="async" loading="lazy" className={cn("shrink-0 object-contain object-bottom", compact ? "h-12 w-9" : "h-16 w-12")} /> : null}
      <div className={cn("relative min-w-0 flex-1 rounded-xl rounded-bl-sm border border-white/12 bg-[#0b1727]/92 px-3 py-2 shadow-[0_12px_28px_-18px_rgba(0,0,0,0.9)]", compact && "px-2.5 py-1.5")}>
        <span aria-hidden className="absolute -left-1.5 bottom-3 h-3 w-3 rotate-45 border-b border-l border-white/12 bg-[#0b1727]" />
        <p className="flex items-center gap-1.5 text-[9.5px] font-bold uppercase tracking-[0.18em] text-[#e3c66f]"><span className="inline-block h-1.5 w-1.5 rounded-full bg-rose-400 shadow-[0_0_8px_rgba(244,63,94,0.9)]" aria-hidden />{c.name} <span className="text-white/40">· {c.role}</span></p>
        <p className={cn("mt-0.5 leading-snug text-white/85", compact ? "text-[12px]" : "text-[13px]")}>{line.text}</p>
      </div>
    </aside>
  );
}

// ───────────────────────────────────────────────────────────── chat

const HANDLES = ["GoldCardGwen", "baronpit_enjoyer", "KindaWinningFan", "scuttle_andy", "FearlessFiona", "plates_only", "late_game_larry", "SYN_viewer_7", "cohesion_truther", "midlanemaddie", "TopDiffTom", "wardvision"];
const CHAT: Record<Moment, string[]> = {
  "run.start": ["new run new me", "academy fills again?? respect", "LETS GOOO", "this org is cursed trust"],
  "org.choose": ["good pick", "that trait is OP", "front to back enjoyers rise", "early tempo or nothing"],
  "player.sign": ["WHAT A SIGNING", "honeymoon arc", "cohesion -1 pain", "bench him already lol"],
  "draft.lock": ["locked in", "that comp scales", "no engage??", "fearless is brutal"],
  "stage.open": ["here we go", "early game decides it", "mid diff incoming", "pray for late"],
  "objective.offer": ["BARON BARON BARON", "DO NOT", "knowledge check time", "they're going for it"],
  "objective.result": ["POGGERS", "THROW", "called it", "that was clean", "pain", "WHAT"],
  "stage.result": ["7-0????", "kinda winning is a vibe", "even stage, coinflip", "ggs", "comeback loading"],
  "game.win": ["GG EZ", "VICTORY", "clean", "series lead!!"],
  "game.loss": ["pain", "it's fine we have late", "reverse sweep arc", "F"],
  "series.point": ["MATCH POINT", "one more", "do not choke", "close it out"],
  "finals.intro": ["WORLDS FINAL", "history tonight", "chills", "whoever wins deserves it"],
  "championship": ["CHAMPIONS", "DYNASTY", "I CRIED", "from academy to the cup", "legacy"],
  "run.defeat": ["gg run", "next seed", "so close", "keep the duo"],
};

/** Reaction pools split by how it went, for the moments where chat must not cheer a disaster. */
const CHAT_GOOD: Partial<Record<Moment, string[]>> = {
  "objective.result": ["POGGERS", "called it", "that was clean", "LETS GO", "map control secured"],
  "stage.result": ["7-0????", "kinda winning is a vibe", "ggs", "clean stage"],
};
const CHAT_BAD: Partial<Record<Moment, string[]>> = {
  "objective.result": ["THROW", "pain", "WHAT", "who called that", "it's over... or is it"],
  "stage.result": ["even stage, coinflip", "comeback loading", "pain", "late game pls"],
};

export function chatBurst(moment: Moment, key: string, n = 4, good?: boolean): { handle: string; text: string; tone: number }[] {
  const pool = good === undefined ? CHAT[moment] : good ? (CHAT_GOOD[moment] ?? CHAT[moment]) : (CHAT_BAD[moment] ?? CHAT[moment]);
  const out: { handle: string; text: string; tone: number }[] = [];
  for (let i = 0; i < n; i++) {
    const k = `${moment}|${key}|${i}`;
    out.push({ handle: pick(HANDLES, `h|${k}`), text: pick(pool, `t|${k}`), tone: i % 4 });
  }
  return out;
}

const CHAT_TONES = ["text-[#f2dc98]", "text-sky-200", "text-emerald-200", "text-fuchsia-200"];

/** A chat moment: a short burst of fictional viewer messages that slide in one after another. */
export function ChatBurst({ moment, k, n = 4, className, good }: { moment: Moment; k: string; n?: number; className?: string; good?: boolean }) {
  const motion = useMotionAllowed();
  const msgs = useMemo(() => chatBurst(moment, k, n, good), [moment, k, n, good]);
  return (
    <div data-testid="chat-burst" data-moment={moment} aria-label="Fictional viewer chat" className={cn("flex flex-col gap-1 rounded-xl border border-white/10 bg-[#07111f]/80 px-2.5 py-2 text-[11.5px]", className)}>
      <p className="flex items-center gap-1.5 text-[9.5px] font-bold uppercase tracking-[0.18em] text-white/40"><span aria-hidden className="h-1.5 w-1.5 rounded-full bg-fuchsia-400" />Chat · synthetic</p>
      {msgs.map((m, i) => (
        <p key={i} style={{ "--i": i } as CSSProperties} className={cn("truncate", motion && "dyn-chat-line")}><span className={cn("font-semibold", CHAT_TONES[m.tone])}>{m.handle}</span><span className="text-white/40">: </span><span className="text-white/85">{m.text}</span></p>
      ))}
    </div>
  );
}

// ───────────────────────────────────────────────────────────── crowd

/** Crowd meter: 0..1 hype, from the lead and the moment. Visual only. */
export function CrowdMeter({ level, label = "Crowd", className }: { level: number; label?: string; className?: string }) {
  const motion = useMotionAllowed();
  const pct = Math.max(0.08, Math.min(1, level));
  const bars = 14;
  return (
    <div data-testid="crowd-meter" data-level={pct.toFixed(2)} className={cn("flex items-center gap-2 text-[9.5px] font-bold uppercase tracking-[0.18em] text-white/45", className)} role="img" aria-label={`${label} ${Math.round(pct * 100)} percent`}>
      <span>{label}</span>
      <span className="flex h-3.5 items-end gap-[2px]">
        {Array.from({ length: bars }, (_, i) => {
          const on = i / bars < pct;
          return <span key={i} aria-hidden style={{ "--i": i, height: `${35 + ((i * 37) % 65)}%` } as CSSProperties} className={cn("w-[3px] rounded-[1px]", on ? cn("bg-[#e3c66f]", motion && "dyn-crowd-bar") : "bg-white/15")} />;
        })}
      </span>
    </div>
  );
}

export function crowdLevel(lead: number, bonus = 0): number { return 0.35 + Math.min(0.45, Math.abs(lead) * 0.1) + bonus; }
