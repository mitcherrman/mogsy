/**
 * VIS-F3 — Ambience & sound controls (vis_f2_support/04 rule 5).
 *
 * One button in the run bar opens a sheet with two groups:
 *  - Sound: the global Mogzy mute (same key the rest of the app uses), a
 *    Dynasty volume, room loops on / off, and a test cue. Every sound is
 *    synthesized in the browser by `audio.ts`; nothing is loaded from disk.
 *  - Ambience: master switch, per-layer switches (Caster desk / Reactions /
 *    Chat) and density (Full / Reduced). On by default, stored locally.
 */
import { Volume2, VolumeX } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { dynastyAudio, playCue, useDynastyAudio } from "./audio";
import { ambience, useAmbience } from "./broadcast";
import { Eyebrow } from "./parts";

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[13px] text-white/85">
      <span className="min-w-0"><span className="block font-medium">{label}</span>{hint ? <span className="block text-[11px] text-white/50">{hint}</span> : null}</span>
      {children}
    </label>
  );
}

function Toggle({ on, onChange, testId, disabled }: { on: boolean; onChange: (v: boolean) => void; testId: string; disabled?: boolean }) {
  return (
    <input type="checkbox" role="switch" aria-checked={on} checked={on} disabled={disabled} data-testid={testId} onChange={(e) => onChange(e.target.checked)}
      className={cn("h-5 w-9 shrink-0 cursor-pointer appearance-none rounded-full border border-white/20 bg-white/10 transition-colors", "before:block before:h-4 before:w-4 before:translate-x-0 before:rounded-full before:bg-white/70 before:transition-transform", "checked:border-[#e3c66f]/70 checked:bg-[#e3c66f]/40 checked:before:translate-x-4 checked:before:bg-[#f6dd8f]", "disabled:cursor-not-allowed disabled:opacity-40", "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e3c66f]")} />
  );
}

export function AmbiencePanel() {
  const snd = useDynastyAudio();
  const amb = useAmbience();
  return (
    <div className="flex flex-col gap-4" data-testid="ambience-panel">
      <section className="flex flex-col gap-2" aria-labelledby="amb-sound">
        <Eyebrow><span id="amb-sound">Sound</span></Eyebrow>
        {!snd.supported ? <p className="text-[12px] text-amber-200/80">This browser has no Web Audio: the prototype stays silent.</p>
          : !snd.unlocked ? <p className="text-[12px] text-white/60" data-testid="snd-locked">Sound starts after your first tap or key press (browser autoplay rules).</p> : null}
        <Row label="Mute all Mogzy sounds" hint="Shared with the rest of the app">
          <Toggle on={snd.muted} onChange={(v) => dynastyAudio.setMuted(v)} testId="snd-muted" />
        </Row>
        <Row label="Dynasty volume" hint={`${Math.round(snd.volume * 100)} %`}>
          <input type="range" min={0} max={100} value={Math.round(snd.volume * 100)} data-testid="snd-volume" aria-label="Dynasty volume" disabled={snd.muted}
            onChange={(e) => dynastyAudio.setVolume(Number(e.target.value) / 100)} className="w-28 accent-[#e3c66f]" />
        </Row>
        <Row label="Room loops" hint="HQ hum, scrim room, backstage, stage, tension">
          <Toggle on={snd.loops} onChange={(v) => dynastyAudio.setLoops(v)} testId="snd-loops" disabled={snd.muted} />
        </Row>
        <div className="flex items-center justify-between gap-2">
          <button type="button" data-testid="snd-test" onClick={() => { void dynastyAudio.unlock().then(() => playCue("dynasty.obj.outcome_success")); }}
            className="rounded-lg border border-white/15 px-3 py-1.5 text-[12px] text-white/85 hover:border-[#e3c66f]/50 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e3c66f]">Play a test cue</button>
          <span className="text-[10.5px] text-white/45" data-testid="snd-state">{snd.muted ? "muted" : snd.unlocked ? `ready${snd.lastCue ? ` · ${snd.lastCue}` : ""}` : "locked"}</span>
        </div>
        <p className="text-[11px] leading-snug text-white/45">All cues and loops are synthesized in the browser for this prototype: original audio, no third-party or Riot sounds.</p>
      </section>

      <section className="flex flex-col gap-2" aria-labelledby="amb-text">
        <Eyebrow><span id="amb-text">Ambience</span></Eyebrow>
        <Row label="Ambient commentary" hint="Dynasty Desk, reactions and chat · all simulated">
          <Toggle on={amb.master} onChange={(v) => ambience.set({ master: v })} testId="amb-master" />
        </Row>
        <Row label="Caster desk"><Toggle on={amb.caster} onChange={(v) => ambience.set({ caster: v })} testId="amb-caster" disabled={!amb.master} /></Row>
        <Row label="Reactions"><Toggle on={amb.reactions} onChange={(v) => ambience.set({ reactions: v })} testId="amb-reactions" disabled={!amb.master} /></Row>
        <Row label="Chat"><Toggle on={amb.chat} onChange={(v) => ambience.set({ chat: v })} testId="amb-chat" disabled={!amb.master} /></Row>
        <div className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[13px] text-white/85">
          <span className="font-medium">Density</span>
          <div role="radiogroup" aria-label="Ambience density" className="flex rounded-lg border border-white/15 p-0.5">
            {(["full", "reduced"] as const).map((d) => (
              <button key={d} type="button" role="radio" aria-checked={amb.density === d} data-testid={`amb-density-${d}`} disabled={!amb.master} onClick={() => ambience.set({ density: d })}
                className={cn("rounded-md px-3 py-1 text-[12px] capitalize focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e3c66f]", amb.density === d ? "bg-[#e3c66f]/25 text-[#f6dd8f]" : "text-white/60 hover:text-white", !amb.master && "opacity-40")}>{d}</button>
            ))}
          </div>
        </div>
        <p className="text-[11px] leading-snug text-white/45">Limits: at least 8 s between items, at most 6 per game, one reaction and three chat bursts per game, nothing while a question is open. Reduced halves the caps.</p>
      </section>
    </div>
  );
}

export function AmbienceButton({ className }: { className?: string }) {
  const snd = useDynastyAudio();
  const Icon = snd.muted ? VolumeX : Volume2;
  return (
    <Sheet>
      <SheetTrigger asChild>
        <button type="button" data-testid="ambience-open" aria-label="Ambience and sound settings" title="Ambience & sound"
          className={cn("flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 bg-[#07111f]/80 text-white/80 backdrop-blur transition-colors hover:border-[#e3c66f]/50 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e3c66f]", className)}>
          <Icon className="h-4 w-4" aria-hidden />
        </button>
      </SheetTrigger>
      <SheetContent side="right" className="dyn-scroll w-full overflow-y-auto border-white/10 bg-[#0b1727] text-white sm:max-w-md" data-testid="ambience-sheet">
        <SheetHeader><SheetTitle className="dyn-title text-white">Ambience &amp; sound</SheetTitle><SheetDescription className="text-white/60">Prototype settings, stored on this device.</SheetDescription></SheetHeader>
        <div className="mt-4"><AmbiencePanel /></div>
      </SheetContent>
    </Sheet>
  );
}
