/**
 * VIS-F4 — the player spotlight: a wide character plate for recruitment
 * offers and roster stars. A large portrait from the four-tier chain, the
 * name plaque, role emblem and kind ribbon, the phase curve, and the
 * simulated traits with their Generated in-run mark — outside the frame.
 */
import type { ReactNode } from "react";
import { useMotionAllowed } from "@/lib/motion/useReveal";
import { cn } from "@/lib/utils";
import { RoleEmblem } from "@/components/ranked-arena/RoleEmblem";
import { PhaseCurve, TraitChip } from "./cards";
import { ROLE_LABEL, type Player } from "./fixtures";
import { KindRibbon, Monogram, PLATE, RANKED_ROLE } from "./parts";
import { PortraitSlot } from "./portraits";

export function PlayerSpotlight({ p, selected, note, mono, children, className, testId }: { p: Player; selected?: boolean; note?: string; mono?: string; children?: ReactNode; className?: string; testId?: string }) {
  const motion = useMotionAllowed();
  const formTone = p.conf >= 4 ? "ring-[#e3c66f]/70" : p.conf <= 2 ? "ring-rose-400/50" : "ring-white/15";
  return (
    <div data-testid={testId ?? "player-spotlight"} data-kind={p.kind} className={cn(PLATE, "dyn-spotlight-plate flex gap-3 p-3", p.kind === "star" && "dyn-plate--ornate", selected && "dyn-plate--selected", motion && "dyn-enter-fast", className)}>
      <div className={cn("relative h-[112px] w-[92px] shrink-0 overflow-hidden rounded-xl border border-white/10 bg-[#07111f] ring-2", formTone)} data-slot="player.portrait">
        <PortraitSlot p={p} size="spotlight" mono={mono} fallback={<Monogram p={p} size={56} />} />
        <span className="absolute bottom-1 left-1 rounded-sm border border-white/15 bg-[#07111f]/90 px-1"><RoleEmblem role={RANKED_ROLE[p.role]} size="xs" decorative /></span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-1.5 text-[10px] uppercase tracking-wider text-white/50">{ROLE_LABEL[p.role]} <KindRibbon kind={p.kind} /></p>
        <p className="dyn-title mt-0.5 truncate text-[20px] font-semibold leading-tight text-white sm:text-[22px]">{p.name.replace(/^SYN-/, "")}</p>
        {note ? <p className="mt-0.5 text-[11.5px] leading-snug text-white/60">{note}</p> : null}
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-white/55">Curve <PhaseCurve phase={p.phase} /></span>
          {p.traits.map((t) => <TraitChip key={t} label={t} tone={t === "Overconfident" ? "amber" : t === "Honeymoon" ? "gold" : "plain"} title="Generated in-run" />)}
        </div>
        {children}
      </div>
    </div>
  );
}
