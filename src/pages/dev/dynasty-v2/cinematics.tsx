/**
 * VIS-F3 — comic-book cinematic frames.
 *
 * Two weights, per vis_f2_support/01:
 *   W2 `CineFrame`  — an in-flow comic panel with a caption bar and a stamp,
 *                     for the signing, the tunnel walk, draft lock, a rare
 *                     outplay and an elimination-game victory. Never blocks.
 *   W3 `FullFrame`  — full screen, ≤ 3 s, skippable by tap, key or button,
 *                     static under reduced motion. Only two exist: the Worlds
 *                     Final intro and the championship.
 *
 * `LineupStrip` is the champion presentation at draft lock: five tiles slide
 * in with the class glyph, the composition identity and when it peaks.
 * All art is drawn here (original); synthetic champions use class glyphs
 * because no verified-rights League assets are wired into the prototype.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useMotionAllowed } from "@/lib/motion/useReveal";
import { cn } from "@/lib/utils";
import { playMoment, type MomentId } from "./audio";
import { CLASS_COLOR, ClassGlyph } from "./cards";
import { readComposition } from "./engine";
import { CHAMPS_BY_ROLE, ROLES, type Champion, type Org, type Role } from "./fixtures";
import { Btn, Crest, Eyebrow, ORG_ACCENT } from "./parts";

export type FrameKind = "signing" | "tunnel" | "draft_lock" | "outplay" | "elim_victory";

const G = "#e3c66f";

/** Original panel art per frame; a 1000×400 stage, cropped by the frame. */
function FrameArt({ kind, accent = G }: { kind: FrameKind; accent?: string }) {
  switch (kind) {
    case "signing":
      return (
        <svg viewBox="0 0 1000 400" preserveAspectRatio="xMidYMid slice" aria-hidden className="dyn-frame-pan">
          <defs><linearGradient id="fa-desk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#13213a" /><stop offset="1" stopColor="#070d18" /></linearGradient><linearGradient id="fa-paper" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#f3ead2" /><stop offset="1" stopColor="#d9cba6" /></linearGradient></defs>
          <rect width="1000" height="400" fill="url(#fa-desk)" />
          <path d="M0 400 L1000 400 L1000 250 L0 290 Z" fill="#0b1727" />
          <path d="M0 290 L1000 250" stroke={accent} strokeOpacity="0.5" strokeWidth="2" />
          {/* the contract, slightly turned */}
          <g transform="rotate(-6 500 300)"><rect x="340" y="200" width="320" height="220" rx="4" fill="url(#fa-paper)" /><rect x="370" y="232" width="200" height="8" fill="#2b3a55" opacity="0.6" />{[0, 1, 2, 3, 4].map((i) => <rect key={i} x="370" y={254 + i * 16} width={240 - (i % 3) * 30} height="5" fill="#2b3a55" opacity="0.35" />)}<path d="M380 372 C400 340 430 390 460 356 C480 336 500 376 530 352" fill="none" stroke="#1d2a44" strokeWidth="3" strokeLinecap="round" /><path d="M520 340 L560 300 L574 314 L534 354 Z" fill="#1d2a44" /><circle cx="600" cy="380" r="18" fill={accent} fillOpacity="0.35" stroke={accent} strokeWidth="2" /></g>
          {/* two crests above */}
          <path d="M260 110 L300 132 V176 L260 198 L220 176 V132 Z" fill="#0b1727" stroke={accent} strokeWidth="3" /><path d="M740 110 L780 132 V176 L740 198 L700 176 V132 Z" fill="#0b1727" stroke="#9fb0c8" strokeWidth="3" />
          <path d="M310 154 L690 154" stroke={accent} strokeOpacity="0.35" strokeDasharray="4 8" />
          <circle cx="500" cy="154" r="10" fill={accent} />
          {/* flash bulbs */}
          {[80, 140, 860, 920].map((x, i) => <circle key={x} cx={x} cy={60 + (i % 2) * 30} r="4" fill="#fff" opacity="0.7" />)}
        </svg>
      );
    case "tunnel":
      return (
        <svg viewBox="0 0 1000 400" preserveAspectRatio="xMidYMid slice" aria-hidden className="dyn-frame-pan">
          <defs><radialGradient id="fa-tl" cx="50%" cy="46%" r="30%"><stop offset="0" stopColor="#fff3c4" stopOpacity="0.95" /><stop offset="0.5" stopColor={G} stopOpacity="0.3" /><stop offset="1" stopColor={G} stopOpacity="0" /></radialGradient></defs>
          <rect width="1000" height="400" fill="#05090f" /><rect width="1000" height="400" fill="url(#fa-tl)" />
          {[0, 1, 2, 3, 4, 5].map((i) => { const k = 1 - i * 0.15; return <rect key={i} x={500 - 480 * k} y={190 - 180 * k} width={960 * k} height={360 * k} fill="none" stroke={G} strokeOpacity={0.06 + i * 0.04} strokeWidth="1.5" />; })}
          <path d="M20 20 L500 190 M980 20 L500 190 M20 380 L500 190 M980 380 L500 190" stroke={G} strokeOpacity="0.16" />
          {[380, 440, 500, 560, 620].map((x, i) => <g key={x}><circle cx={x} cy={196 + Math.abs(i - 2) * 6} r="16" fill="#05090f" /><path d={`M${x - 20} ${236 + Math.abs(i - 2) * 6} L${x + 20} ${236 + Math.abs(i - 2) * 6} L${x + 28} 400 L${x - 28} 400 Z`} fill="#05090f" /><rect x={x - 8} y={250 + Math.abs(i - 2) * 6} width="16" height="6" fill={accent} fillOpacity="0.8" /></g>)}
          {[60, 940].map((x) => <circle key={x} cx={x} cy="70" r="5" fill="#fff" opacity="0.6" />)}
        </svg>
      );
    case "draft_lock":
      return (
        <svg viewBox="0 0 1000 400" preserveAspectRatio="xMidYMid slice" aria-hidden>
          <rect width="1000" height="400" fill="#07101d" />
          <path d="M0 0 L1000 0 L1000 60 L0 90 Z" fill={accent} fillOpacity="0.12" />
          {[100, 300, 500, 700, 900].map((x) => <rect key={x} x={x - 70} y="120" width="140" height="200" rx="8" fill="#0b1727" stroke="#223755" />)}
        </svg>
      );
    case "outplay":
      return (
        <svg viewBox="0 0 1000 400" preserveAspectRatio="xMidYMid slice" aria-hidden className="dyn-frame-pan">
          <defs><radialGradient id="fa-flash" cx="60%" cy="45%" r="40%"><stop offset="0" stopColor="#fff3c4" stopOpacity="0.9" /><stop offset="0.4" stopColor={G} stopOpacity="0.35" /><stop offset="1" stopColor={G} stopOpacity="0" /></radialGradient></defs>
          <rect width="1000" height="400" fill="#07111f" />
          <path d="M0 300 L1000 260 L1000 400 L0 400 Z" fill="#0b1a2c" /><path d="M0 300 L1000 260" stroke="#2a4066" />
          {/* lane with a turret */}
          <path d="M760 110 L840 110 L860 300 L740 300 Z" fill="#132238" stroke="#2a4066" /><path d="M750 110 L850 110 L830 80 L770 80 Z" fill="#1a2d49" /><circle cx="800" cy="95" r="6" fill="#7fd6ef" />
          <rect width="1000" height="400" fill="url(#fa-flash)" />
          {/* speed lines */}
          {Array.from({ length: 14 }, (_, i) => <path key={i} d={`M${20 + i * 70} ${40 + (i % 4) * 70} l${180 - (i % 3) * 40} ${-(i % 5) * 6}`} stroke={G} strokeOpacity="0.35" strokeWidth={i % 2 ? 1 : 2} />)}
          {/* our champion silhouette vs two */}
          <g fill="#05090f"><circle cx="560" cy="200" r="20" /><path d="M530 240 L590 240 L600 330 L520 330 Z" /><path d="M590 230 L680 170" stroke="#05090f" strokeWidth="10" strokeLinecap="round" /></g>
          <g fill="#0f1b2c" opacity="0.9"><circle cx="420" cy="215" r="17" /><path d="M396 250 L444 250 L452 330 L388 330 Z" /><circle cx="340" cy="222" r="16" /><path d="M318 256 L362 256 L370 330 L310 330 Z" /></g>
          {/* comic burst */}
          <path d="M560 70 L585 110 L630 95 L612 135 L655 150 L610 165 L625 205 L585 185 L560 225 L540 185 L498 205 L512 165 L470 150 L512 135 L495 95 L540 110 Z" fill={G} />
          <text x="560" y="160" textAnchor="middle" fontFamily="Cinzel, serif" fontWeight="900" fontSize="34" fill="#07111f">1v2</text>
        </svg>
      );
    case "elim_victory":
      return (
        <svg viewBox="0 0 1000 400" preserveAspectRatio="xMidYMid slice" aria-hidden className="dyn-frame-pan">
          <defs><linearGradient id="fa-ev" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#ff6b7a" stopOpacity="0.45" /><stop offset="1" stopColor={G} stopOpacity="0.5" /></linearGradient></defs>
          <rect width="1000" height="400" fill="#07111f" /><rect width="1000" height="400" fill="url(#fa-ev)" />
          {[0, 1, 2].map((t) => <path key={t} d={`M0 ${90 + t * 60} Q500 ${30 + t * 60} 1000 ${90 + t * 60} L1000 ${140 + t * 60} Q500 ${80 + t * 60} 0 ${140 + t * 60} Z`} fill="#05090f" opacity={0.75 + t * 0.08} />)}
          {Array.from({ length: 40 }, (_, i) => <circle key={i} cx={(i * 97) % 1000} cy={60 + ((i * 53) % 120)} r="1.8" fill="#fff" opacity={0.4 + ((i * 13) % 50) / 100} />)}
          <path d="M100 300 L900 300 L1000 400 L0 400 Z" fill="#101b2e" /><path d="M100 300 L900 300" stroke={G} strokeWidth="4" />
          {[300, 400, 500, 600, 700].map((x) => <g key={x}><circle cx={x} cy="250" r="16" fill="#05090f" /><path d={`M${x - 22} 290 L${x + 22} 290 L${x + 20} 300 L${x - 20} 300 Z`} fill="#05090f" /><path d={`M${x - 12} 234 L${x} 200 L${x + 12} 234`} stroke="#05090f" strokeWidth="8" strokeLinecap="round" fill="none" /></g>)}
        </svg>
      );
  }
}

const STAMP: Record<FrameKind, string> = { signing: "Signed", tunnel: "Walk out", draft_lock: "Locked", outplay: "Rare play", elim_victory: "Still alive" };

/** W2 comic frame: art, caption bar, stamp. Decorative, never blocking; the screen's own text carries the facts. */
export function CineFrame({ kind, kicker, title, caption, accent, children, className, testId = "comic-frame" }: {
  kind: FrameKind; kicker?: string; title: string; caption?: string; accent?: string; children?: ReactNode; className?: string; testId?: string;
}) {
  const motion = useMotionAllowed();
  return (
    <figure data-testid={testId} data-kind={kind} className={cn("dyn-frame h-[150px] sm:h-[190px]", motion && "dyn-frame--motion", className)} style={{ "--dyn-accent": accent } as CSSProperties}>
      <FrameArt kind={kind} accent={accent} />
      {children ? <div className="absolute inset-x-0 top-0 p-3">{children}</div> : null}
      <span aria-hidden className="dyn-frame-stamp dyn-title absolute right-3 top-3 rotate-[-6deg] rounded-md border-2 border-[#e3c66f]/80 px-2 py-0.5 text-[11px] font-black uppercase tracking-[0.22em] text-[#f6dd8f] shadow-[0_0_18px_-6px_rgba(227,198,111,0.9)]">{STAMP[kind]}</span>
      <figcaption className="dyn-frame-caption">
        {kicker ? <span className="block text-[10px] font-bold uppercase tracking-[0.22em] text-[#e3c66f]">{kicker}</span> : null}
        <span className="dyn-title block truncate text-[18px] font-bold leading-tight text-white sm:text-[21px]">{title}</span>
        {caption ? <span className="block truncate text-[12px] text-white/70">{caption}</span> : null}
      </figcaption>
    </figure>
  );
}

// ───────────────────────────────────────────────────────────── champion presentation

export function LineupStrip({ picks, oppTags, className }: { picks: Partial<Record<Role, string>>; oppTags: string[]; className?: string }) {
  const motion = useMotionAllowed();
  const champs = useMemo(() => ROLES.map((r) => CHAMPS_BY_ROLE[r].find((c) => c.id === picks[r]) ?? null), [picks]);
  const chosen = champs.filter((c): c is Champion => !!c);
  const ro = chosen.length === 5 ? readComposition(chosen.map((c) => c.id), oppTags) : null;
  const peak = useMemo(() => {
    const sum = { early: 0, mid: 0, late: 0 };
    chosen.forEach((c) => { sum.early += c.phase.early; sum.mid += c.phase.mid; sum.late += c.phase.late; });
    return (Object.entries(sum) as [keyof typeof sum, number][]).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "mid";
  }, [chosen]);
  return (
    <div data-testid="lineup-strip" data-comp={ro?.identity ?? ""} data-slot="draft.champion_splash_strip" className={cn("flex flex-col gap-2", className)}>
      <div className={cn("grid grid-cols-5 gap-1.5", motion && "dyn-frame--motion")}>
        <div className="dyn-frame-lineup contents">
          {champs.map((c, i) => (
            <div key={ROLES[i]} style={{ "--i": i } as CSSProperties} className="relative flex min-w-0 flex-col items-center gap-1 rounded-lg border border-white/12 bg-[#0b1727]/85 px-1 py-2 text-center" data-testid="lineup-tile">
              {c ? <><span className="flex h-9 w-9 items-center justify-center rounded-full border" style={{ borderColor: `${CLASS_COLOR[c.cls]}66`, background: `${CLASS_COLOR[c.cls]}1a` }}><ClassGlyph cls={c.cls} size={20} /></span>
                <span className="dyn-title w-full truncate text-[10.5px] font-semibold text-white sm:text-[12px]">{c.name.replace(/^SYN /, "")}</span>
                <span className="text-[9px] uppercase tracking-[0.14em] text-white/45">{ROLES[i]}</span></> : <span className="text-white/30">—</span>}
            </div>
          ))}
        </div>
      </div>
      {ro ? (
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-white/70">
          <span className="dyn-title rounded-full border border-[#e3c66f]/40 bg-[#e3c66f]/[0.08] px-3 py-0.5 text-[12px] text-[#f2dc98]" data-slot="draft.comp_identity_badge" data-testid="lineup-identity">{ro.identity}</span>
          <span>peaks <b className="text-white/90">{peak === "early" ? "Early" : peak === "mid" ? "Mid" : "Late"}</b></span>
          <span className="text-white/40">· synthetic champions, class glyph tiles</span>
        </div>
      ) : null}
    </div>
  );
}

// ───────────────────────────────────────────────────────────── W3 full frame

export type FullFrameKind = "finals_intro" | "championship";

function OppCrest({ name, size = 72 }: { name: string; size?: number }) {
  const mono = name.replace(/^SYN /, "").split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <svg viewBox="0 0 64 72" width={size} height={size * 1.125} aria-hidden>
      <path d="M32 2 L60 18 V54 L32 70 L4 54 V18 Z" fill="#0b1727" stroke="#9fb0c8" strokeWidth="2.5" />
      <path d="M32 10 L53 22 V50 L32 62 L11 50 V22 Z" fill="none" stroke="#9fb0c8" strokeOpacity="0.4" />
      <text x="32" y="43" textAnchor="middle" fontFamily="Cinzel, serif" fontWeight="700" fontSize="20" fill="#dfe8f5">{mono}</text>
    </svg>
  );
}

function TrophyArt({ accent = G }: { accent?: string }) {
  // Original Dynasty cup: a tall chalice with a laurel band. Not a Summoner's Cup likeness.
  return (
    <svg viewBox="0 0 200 260" width="150" height="195" aria-hidden className="dyn-cine-trophy">
      <defs><linearGradient id="tr-gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fff1b8" /><stop offset="0.5" stopColor={G} /><stop offset="1" stopColor="#8a6a1f" /></linearGradient></defs>
      <path d="M50 30 L150 30 L140 120 C135 150 115 165 100 165 C85 165 65 150 60 120 Z" fill="url(#tr-gold)" />
      <path d="M50 40 C20 40 15 90 50 100 L56 86 C36 82 36 52 54 52 Z M150 40 C180 40 185 90 150 100 L144 86 C164 82 164 52 146 52 Z" fill="url(#tr-gold)" />
      <rect x="92" y="165" width="16" height="30" fill="url(#tr-gold)" /><path d="M60 195 L140 195 L150 215 L50 215 Z" fill="url(#tr-gold)" />
      <rect x="40" y="215" width="120" height="30" rx="4" fill="#0b1727" stroke={G} strokeWidth="2" />
      <path d="M70 70 Q100 56 130 70 Q100 84 70 70 Z" fill="none" stroke="#fff1b8" strokeWidth="2" />
      <path d="M100 18 L104 28 L114 28 L106 34 L109 44 L100 38 L91 44 L94 34 L86 28 L96 28 Z" fill="#fff1b8" />
      <circle cx="100" cy="230" r="6" fill={accent} />
    </svg>
  );
}

export function FullFrame({ kind, org, opp, team, onDone, cue, holdMs }: { kind: FullFrameKind; org: Org; opp?: string; team: string; onDone: () => void; cue?: MomentId; holdMs?: number }) {
  const motion = useMotionAllowed();
  const [gone, setGone] = useState(false);
  const done = useRef(false);
  const accent = ORG_ACCENT[org.id]?.hex ?? G;
  const hold = holdMs ?? (motion ? 3000 : 2500);
  useEffect(() => { if (cue) playMoment(cue); }, [cue]);
  useEffect(() => {
    const finish = () => { if (done.current) return; done.current = true; setGone(true); onDone(); };
    const t = window.setTimeout(finish, hold);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" || e.key === "Enter" || e.key === " ") finish(); };
    window.addEventListener("keydown", onKey);
    return () => { window.clearTimeout(t); window.removeEventListener("keydown", onKey); };
  }, [hold, onDone]);
  if (gone) return null;
  const skip = () => { if (done.current) return; done.current = true; setGone(true); onDone(); };
  const confetti = Array.from({ length: 36 }, (_, i) => ({ left: `${(i * 173) % 100}%`, "--x": `${((i * 37) % 120) - 60}px`, "--r": `${300 + ((i * 97) % 500)}deg`, "--d": (i * 53) % 700, background: i % 3 === 0 ? "#fff1b8" : i % 3 === 1 ? G : accent }) as CSSProperties);
  return (
    <div role="status" aria-live="polite" data-testid="cine-full" data-kind={kind} onClick={skip}
      className={cn("dyn-cine cursor-pointer select-none", motion && "dyn-cine--in dyn-cine--motion")} style={{ "--dyn-light": kind === "championship" ? "44 90% 62%" : "262 70% 64%", "--dyn-accent": accent } as CSSProperties}>
      <span aria-hidden className="dyn-cine-spot" />
      {kind === "finals_intro" ? (
        <div className="relative flex w-full max-w-3xl flex-col items-center gap-4 px-6 text-center" data-slot="finals.intro_card">
          <Eyebrow><span className="text-[#c9a7ff]">Worlds Dynasty · the last series</span></Eyebrow>
          <div className="flex items-center justify-center gap-5 sm:gap-10">
            <div className="dyn-cine-left flex flex-col items-center gap-2"><Crest org={org} size={84} /><span className="dyn-title max-w-[9rem] truncate text-[14px] font-semibold text-white sm:text-[16px]">{team}</span></div>
            <span className="dyn-title dyn-cine-title text-[42px] font-black leading-none text-[#f6dd8f] sm:text-[64px]" data-slot="finals.vs_plate">VS</span>
            <div className="dyn-cine-right flex flex-col items-center gap-2"><OppCrest name={opp ?? ""} size={76} /><span className="dyn-title max-w-[9rem] truncate text-[14px] font-semibold text-white/90 sm:text-[16px]">{(opp ?? "").replace(/^SYN /, "")}</span></div>
          </div>
          <h2 className="dyn-title dyn-cine-title text-[30px] font-bold uppercase tracking-[0.18em] text-white sm:text-[44px]">Worlds Final</h2>
          <p className="dyn-cine-rows text-[12.5px] text-white/70">Best of five · Fearless draft · <span data-slot="season.worlds_mark" className="text-[#c9a7ff]">✦ original Worlds mark</span></p>
        </div>
      ) : (
        <div className="relative flex w-full max-w-3xl flex-col items-center gap-3 px-6 text-center" data-slot="frame.championship">
          <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden" data-slot="end.confetti">{confetti.map((s, i) => <span key={i} className="dyn-confetti" style={s} />)}</div>
          <TrophyArt accent={accent} />
          <h2 className="dyn-title dyn-cine-title text-[34px] font-black uppercase tracking-[0.2em] text-[#f6dd8f] sm:text-[56px]" data-slot="end.champion_banner">Champions</h2>
          <p className="dyn-cine-rows dyn-title text-[16px] text-white sm:text-[20px]">{team} · Worlds Dynasty</p>
        </div>
      )}
      <span aria-hidden className="dyn-cine-whiteout pointer-events-none absolute inset-0 bg-[#fff3c4] opacity-0" />
      <div className="absolute bottom-6 right-6" onClick={(e) => e.stopPropagation()}><Btn testId="cine-skip" className="min-h-[36px] px-4 py-1.5 text-[12px]" onClick={skip}>Skip</Btn></div>
    </div>
  );
}
