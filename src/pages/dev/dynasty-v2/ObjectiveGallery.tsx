/**
 * UX-1 / VIS-F1 — objective gallery (`/dev/dynasty-v2?view=objectives`): every
 * outcome variant of the reusable encounter, plus a live panel per kind.
 */
import { useState } from "react";
import "./vis.css";
import { ObjectivePanel, OutcomeCard } from "./ObjectivePanel";
import { OBJECTIVES, objectiveOutcome, type ObjectiveKind } from "./objectives";
import { Btn, Eyebrow, ProtoBanner, Sigil } from "./parts";

const KINDS: ObjectiveKind[] = ["baron", "dragon", "elder"];

export function ObjectiveGallery() {
  const [kind, setKind] = useState<ObjectiveKind>("baron");
  const [closeout, setCloseout] = useState(true);
  const total = OBJECTIVES[kind].questions;
  return (
    <div className="dyn min-h-screen pt-11" data-mood={kind} data-testid="objective-gallery">
      <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 pb-10 pt-4">
        <ProtoBanner />
        <header className="flex items-center gap-3">
          <Sigil kind={kind} size={52} breathe />
          <div>
            <Eyebrow>VIS-F1 · Objective gallery</Eyebrow>
            <h1 tabIndex={-1} className="dyn-title text-[24px] font-semibold leading-tight outline-none">Dragon, Baron and Elder encounters</h1>
          </div>
        </header>
        <div role="group" aria-label="Objective" className="flex flex-wrap items-center gap-2">
          {KINDS.map((k) => <Btn key={k} testId={`gallery-kind-${k}`} primary={k === kind} onClick={() => setKind(k)}>{OBJECTIVES[k].title}</Btn>)}
          {kind === "baron" ? <label className="ml-auto flex items-center gap-2 text-xs text-white/70"><input type="checkbox" checked={closeout} onChange={(e) => setCloseout(e.target.checked)} data-testid="gallery-closeout" /> Closeout offered</label> : null}
        </div>
        <p className="text-sm text-white/70">{OBJECTIVES[kind].intro}</p>
        <section aria-label="All outcomes" className="grid gap-3 sm:grid-cols-2" data-testid="gallery-outcomes">
          {Array.from({ length: total + 1 }, (_, c) => <OutcomeCard key={`${kind}-${c}-${closeout}`} testId={`gallery-outcome-${c}`} outcome={objectiveOutcome(kind, c, { closeoutOffered: closeout })} />)}
        </section>
        <Eyebrow tone="muted">Live panel</Eyebrow>
        <ObjectivePanel key={`${kind}-${closeout}`} kind={kind} seed={`gallery|${kind}`} closeoutOffered={closeout && kind === "baron"} onResolve={() => undefined} />
        <p className="text-[11px] text-white/40">Questions are synthetic placeholders about the prototype's own rules.</p>
      </main>
    </div>
  );
}
