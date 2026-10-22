/**
 * VIS-F4 — the draft lock-in. A short full-frame sequence (≤ 2 s, skippable,
 * static under reduced motion) that stamps the five locked champions one by
 * one — role, class glyph, name, proficiency — then slams the composition
 * identity in, before the game view opens on the walkout. Every fact on it
 * comes from the draft state (picks, proficiency, `readComposition`).
 */
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useMotionAllowed } from "@/lib/motion/useReveal";
import { cn } from "@/lib/utils";
import { playCue } from "./audio";
import { CLASS_COLOR, ClassGlyph } from "./cards";
import { readComposition, type Run } from "./engine";
import { CHAMPS_BY_ROLE, ROLES, ROLE_LABEL, SEASON, type Role } from "./fixtures";
import { Btn, Crest, Eyebrow, ORG_ACCENT } from "./parts";

export function DraftLockSequence({ run, picks, onDone }: { run: Run; picks: Partial<Record<Role, string>>; onDone: () => void }) {
  const motion = useMotionAllowed();
  const [gone, setGone] = useState(false);
  const done = useRef(false);
  const finish = () => { if (done.current) return; done.current = true; setGone(true); onDone(); };
  const node = SEASON[run.nodeIdx];
  const chosen = ROLES.map((r) => picks[r]).filter(Boolean) as string[];
  const ro = chosen.length === 5 ? readComposition(chosen, node.opp.tags) : null;
  useEffect(() => {
    const timers: number[] = [];
    if (motion) ROLES.forEach((_, i) => timers.push(window.setTimeout(() => playCue("dynasty.draft.lock_role"), 420 + i * 160)));
    timers.push(window.setTimeout(() => playCue("dynasty.draft.lock_all"), motion ? 1150 : 50));
    timers.push(window.setTimeout(finish, motion ? 2100 : 1200));
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" || e.key === "Enter" || e.key === " ") finish(); };
    window.addEventListener("keydown", onKey);
    return () => { timers.forEach((t) => window.clearTimeout(t)); window.removeEventListener("keydown", onKey); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (gone) return null;
  const accent = ORG_ACCENT[run.org.id]?.hex ?? "#e3c66f";
  return (
    <div role="status" aria-live="polite" data-testid="lock-seq" onClick={finish} className={cn("dyn-lock cursor-pointer select-none", motion && "dyn-lock--in dyn-lock--motion")} style={{ "--dyn-light": "44 90% 62%", "--dyn-accent": accent } as CSSProperties}>
      <div className="flex w-full max-w-3xl flex-col items-center gap-4 px-4 text-center">
        <div className="flex items-center gap-3"><Crest org={run.org} size={40} /><Eyebrow>Game {run.series!.games.length + 1} · vs {node.opp.name.replace(/^SYN /, "")} · Fearless</Eyebrow></div>
        <div className="grid w-full grid-cols-5 gap-1.5 sm:gap-3">
          {ROLES.map((r, i) => {
            const c = CHAMPS_BY_ROLE[r].find((x) => x.id === picks[r]);
            const p = run.starters[r];
            const prof = c ? (p.prof[CHAMPS_BY_ROLE[r].indexOf(c)] ?? 0) : 0;
            return (
              <div key={r} data-testid="lock-tile" style={{ "--i": i } as CSSProperties} className="dyn-lock-tile flex min-w-0 flex-col items-center gap-1.5 overflow-hidden rounded-xl border border-white/15 bg-[#0b1727]/90 px-1 py-3 sm:px-1.5 sm:py-4">
                <span className="w-full truncate text-[9px] font-bold uppercase tracking-[0.2em] text-white/50">{ROLE_LABEL[r]}</span>
                {c ? <span className="flex h-11 w-11 items-center justify-center rounded-full border sm:h-14 sm:w-14" style={{ borderColor: `${CLASS_COLOR[c.cls]}88`, background: `${CLASS_COLOR[c.cls]}22` }}><ClassGlyph cls={c.cls} size={24} /></span> : <span className="h-11 w-11 rounded-full border border-white/10 sm:h-14 sm:w-14" />}
                <span className="dyn-title w-full truncate text-[11px] font-semibold text-white sm:text-[14px]">{c ? c.name.replace(/^SYN /, "") : "—"}</span>
                <span className="w-full truncate text-[9.5px] text-white/55 sm:text-[11px]">{p.name.replace(/^SYN-/, "")}</span>
                <span className="w-full truncate text-[9px] uppercase tracking-[0.14em]" style={{ color: prof === 2 ? "#7ee6d2" : prof === 1 ? "#f2dc98" : "#f6a5c0" }}>{prof === 2 ? "Great" : prof === 1 ? "Fine" : "Off-pool"}</span>
                <span className="dyn-lock-stamp dyn-title rotate-[-8deg] rounded border-2 border-[#e3c66f]/80 px-1 text-[8px] font-black uppercase tracking-[0.18em] text-[#f6dd8f] sm:text-[9px]">Locked</span>
              </div>
            );
          })}
        </div>
        {ro ? <>
          <span className="dyn-lock-identity dyn-title rounded-full border border-[#e3c66f]/50 bg-[#e3c66f]/10 px-5 py-1.5 text-[18px] font-bold text-[#f6dd8f] sm:text-[24px]" data-testid="lock-identity">{ro.identity}</span>
          <p className="dyn-lock-sub text-[12px] text-white/70">{ro.strengths[0]?.text ?? "Five locked. Walk out."}{ro.warnings[0] ? <span className="text-amber-200/80"> · {ro.warnings[0].text}</span> : null}</p>
        </> : null}
      </div>
      <div className="absolute bottom-6 right-6" onClick={(e) => e.stopPropagation()}><Btn testId="lock-skip" className="min-h-[36px] px-4 py-1.5 text-[12px]" onClick={finish}>Skip</Btn></div>
    </div>
  );
}
