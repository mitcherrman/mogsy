/**
 * VIS-F2/F3/F4 — locations. A `Scene` paints one of seven spaces behind the
 * screen content. VIS-F4 replaces the room drawings with the production
 * environments in `environments.tsx`, which take an `EnvState` so the rooms
 * show the run (org mark and accent, the starters at their stations, the
 * results wall, trophies, a welcome banner after a signing, the opponent on
 * the boards, stadium momentum). Backstage keeps its VIS-F3 drawing.
 *
 * `Scene` also drives the ambient sound: entering a scene moves the Dynasty
 * audio engine to that room's loop (400 ms crossfade).
 */
import { useEffect, type ReactNode } from "react";
import { useMotionAllowed } from "@/lib/motion/useReveal";
import { cn } from "@/lib/utils";
import { setScene as setAudioScene } from "./audio";
import { HQRoom, PracticeRoom, StadiumScene, TrophyHall, TunnelScene, WarRoomScene, type EnvState } from "./environments";
import { MEDIA_SLOTS, SCENE_META, type SceneId } from "./media";
import { Eyebrow } from "./parts";

export type StadiumVariant = "normal" | "elimination" | "finals";

function Backstage() {
  return (
    <svg aria-hidden viewBox="0 0 1000 600" preserveAspectRatio="xMidYMin slice" className="absolute inset-0 h-full w-full">
      <rect width="1000" height="600" fill="#080c13" />
      {[80, 200, 320, 440, 560, 680, 800, 920].map((x) => (<g key={x}><circle cx={x} cy="40" r="26" fill="#ffb86b" fillOpacity="0.10" /><circle cx={x} cy="40" r="7" fill="#ffd9a3" fillOpacity="0.9" /></g>))}
      <rect x="0" y="62" width="1000" height="2" fill="#e3c66f" fillOpacity="0.3" />
      <rect x="60" y="120" width="300" height="180" rx="6" fill="#071626" stroke="#1f3f66" strokeWidth="3" /><rect x="72" y="132" width="276" height="156" fill="#0b2a44" opacity="0.8" /><path d="M72 288 L348 132" stroke="#6fd0a6" strokeOpacity="0.4" strokeWidth="2" /><circle cx="150" cy="250" r="3" fill="#ffd27a" /><circle cx="240" cy="190" r="3" fill="#e0777c" />
      <rect x="640" y="200" width="280" height="24" fill="#1a2740" /><path d="M640 224 L640 320 L920 320 L920 224" fill="none" stroke="#2a4066" strokeWidth="3" />
      <rect x="60" y="430" width="260" height="170" rx="8" fill="#0b1727" stroke="#e3c66f" strokeOpacity="0.2" /><rect x="60" y="470" width="260" height="6" fill="#1a2740" />{[90, 150, 210, 270].map((x) => <rect key={x} x={x} y="430" width="18" height="170" fill="#121f36" />)}
      <rect x="700" y="470" width="220" height="130" rx="8" fill="#0b1727" stroke="#e3c66f" strokeOpacity="0.2" />
      <rect x="0" y="560" width="1000" height="40" fill="#05080e" />
    </svg>
  );
}

export function Scene({ id, children, className, caption = true, variant = "normal", loud, env = {}, champion = false }: {
  id: SceneId; children?: ReactNode; className?: string; caption?: boolean; variant?: StadiumVariant; loud?: boolean; env?: EnvState; champion?: boolean;
}) {
  const motion = useMotionAllowed();
  const slot = MEDIA_SLOTS[`scene.${id}`];
  const meta = SCENE_META[id];
  useEffect(() => { setAudioScene(id, false, !!loud); }, [id, loud]);
  const e: EnvState = { ...env, variant: env.variant ?? variant };
  return (
    <div className={cn("relative", className)} data-scene={id} data-variant={id === "stadium" ? e.variant : undefined} data-mood={env.mood} data-testid="scene">
      <div aria-hidden className={cn("dyn-scene pointer-events-none fixed inset-0 -z-[1] overflow-hidden", `dyn-scene--${id}`, motion && "dyn-scene--motion")}>
        {slot?.src ? <img src={slot.src} alt="" decoding="async" loading="lazy" className="dyn-scene-art absolute inset-0 h-full w-full object-cover" /> : null}
        {id === "hq" ? <HQRoom env={e} /> : null}
        {id === "practice" ? <PracticeRoom env={e} /> : null}
        {id === "warroom" ? <WarRoomScene env={e} /> : null}
        {id === "stadium" ? <StadiumScene env={e} motion={motion} /> : null}
        {id === "tunnel" ? <TunnelScene env={e} /> : null}
        {id === "backstage" ? <Backstage /> : null}
        {id === "trophy" ? <TrophyHall env={e} champion={champion} /> : null}
        <div className="dyn-scene-wash absolute inset-0" />
      </div>
      {caption ? (
        <div className="pointer-events-none mb-1 flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-white/40" data-testid="scene-caption">
          <span aria-hidden className="h-1.5 w-1.5 rotate-45 bg-[#e3c66f]/70" /><Eyebrow tone="muted" className="!text-[10px] !tracking-[0.18em] !text-white/45">{meta.name}</Eyebrow><span>· {meta.caption}</span>
        </div>
      ) : null}
      {children}
    </div>
  );
}
