/**
 * JX2 — FORMULAS & CALCULATOR: a formula notecard over a basic calculator,
 * opened from the Journey board header. The same bottom `Sheet` the State
 * sheet uses, so it overlays the arena on a phone and a desktop alike and
 * never takes a player rail. Content is capped narrow and centred.
 */
import { JOURNEY_FORMULAS } from "@/lib/journey/formulas";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { BasicCalculator } from "./BasicCalculator";

export function JourneyFormulaCard() {
  return (
    <section data-testid="journey-formula-card" aria-label="Formulas"
      className="space-y-2 rounded-lg border border-[#d4b35a]/30 bg-[#0c1a2e] p-3">
      {JOURNEY_FORMULAS.map((f) => (
        <div key={f.id} data-formula={f.id} className="space-y-0.5">
          <h3 className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#e8c97a]">{f.title}</h3>
          {f.lines.map((line) => (
            <p key={line} className="break-words font-mono text-[12px] leading-snug text-white/90">{line}</p>
          ))}
          {f.note && <p className="text-[11px] leading-snug text-white/60">{f.note}</p>}
          {f.example && <p className="text-[11px] leading-snug text-white/50">e.g. {f.example}</p>}
        </div>
      ))}
    </section>
  );
}

export function JourneyWorkbenchSheet({ open, onOpenChange }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" data-testid="journey-workbench-sheet"
        className="theme-lol max-h-[90dvh] overflow-y-auto border-[#d4b35a]/40 bg-[#07111f] px-4 text-white">
        <div className="mx-auto w-full max-w-md space-y-3">
          <SheetHeader>
            <SheetTitle className="ranked-title text-[#f3dca0]">Formulas & Calculator</SheetTitle>
            <SheetDescription className="text-white/70">
              The formulas this Journey uses, and a calculator.
            </SheetDescription>
          </SheetHeader>
          <JourneyFormulaCard />
          <BasicCalculator />
        </div>
      </SheetContent>
    </Sheet>
  );
}
