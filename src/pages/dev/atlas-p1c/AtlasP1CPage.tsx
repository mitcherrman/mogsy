/**
 * ATL-P1-C — Atlas flagship interaction prototype.
 *
 * DEVELOPMENT / OWNER ONLY. Registered in App.tsx at `/lol/dev/atlas-p1c`
 * behind `import.meta.env.DEV` and at `/admin/atlas-p1c` behind the parent
 * AdminRoute. Every number is a memory-only fixture (DEMO DATA). No backend
 * adapter, no network, no persistence, no share links.
 *
 *   ?motion=reduce   force the reduced-motion path (also honours the OS and
 *                    app settings through useReducedMotionPreference)
 *   ?start=<snap>    restore a sample workspace on load (lane-scout,
 *                    divergence, mid-matrix); default is an empty stage
 */
import { MotionConfig } from "framer-motion";
import { ChevronsLeft, ChevronsRight, Layers, Redo2, Scale, SlidersHorizontal, Undo2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { APP_REDUCE_MOTION_CLASS, useReducedMotionPreference } from "@/hooks/useReducedMotionPreference";
import { contextChip } from "@/lib/atlas-p1c/context";
import { EMPTY_WORKSPACE, SAMPLE_SNAPSHOTS } from "@/lib/atlas-p1c/fixtures";
import { abilitySubject } from "@/lib/atlas-p1c/workspace";
import { AtlasStage } from "./AtlasStage";
import { ContextDeck } from "./ContextDeck";
import { useAtlasViewport } from "./useAtlasViewport";
import { useAtlasWorkspace } from "./useAtlasWorkspace";
import "./atlas-p1c.css";

const JOURNEY = [
  { n: 1, label: "Ahri Q · Syndra Q", hint: "Two current-value Leaguecraft Lenses, compared." },
  { n: 2, label: "Patch & override", hint: "Global to 26.16; Syndra Q overridden to current. Divergence explained; history honest." },
  { n: 3, label: "To Pro Play", hint: "Both Lenses transformed at champion level; the Q facet dropped, reversibly." },
  { n: 4, label: "Faker × Chovy", hint: "A 2×2 of independent player-on-champion records; exact matchup sealed." },
  { n: 5, label: "Restore", hint: "A memory-only sample workspace comes back with its layout." },
] as const;

export default function AtlasP1CPage() {
  const [params] = useSearchParams();
  const forceReduce = params.get("motion") === "reduce";
  const start = params.get("start");
  const initial = useMemo(() => SAMPLE_SNAPSHOTS.find((s) => s.id === `snap-${start}`), [start]);
  const api = useAtlasWorkspace(initial?.state ?? EMPTY_WORKSPACE, initial?.order);
  const reduced = useReducedMotionPreference() || forceReduce;
  const { viewport, short } = useAtlasViewport();
  const compact = viewport === "phone" || short;
  const [deckOpen, setDeckOpen] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!forceReduce) return;
    document.documentElement.classList.add(APP_REDUCE_MOTION_CLASS);
    return () => document.documentElement.classList.remove(APP_REDUCE_MOTION_CLASS);
  }, [forceReduce]);

  useEffect(() => {
    const previous = document.title;
    document.title = "Atlas · P1-C prototype";
    return () => {
      document.title = previous;
    };
  }, []);

  useEffect(() => {
    if (!api.announcement.trim()) return;
    setToast(api.announcement.trim());
    const t = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(t);
  }, [api.announcement]);

  const onRootKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.defaultPrevented) return;
    const target = event.target as HTMLElement;
    if (target.tagName === "INPUT" || target.tagName === "SELECT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;
    const mod = event.ctrlKey || event.metaKey;
    if (!mod) return;
    const key = event.key.toLowerCase();
    if (key === "z" && !event.shiftKey) {
      if (api.canUndo) api.act({ type: "undo" });
      event.preventDefault();
    } else if (key === "y" || (key === "z" && event.shiftKey)) {
      if (api.canRedo) api.act({ type: "redo" });
      event.preventDefault();
    }
  };

  const runStep = (n: number) => {
    const { state } = api;
    const find = (champion: "ahri" | "syndra") => state.lenses.find((l) => l.subject.kind === "ability" && l.subject.champion === champion && l.subject.slot === "Q");
    switch (n) {
      case 1: {
        if (!find("ahri")) api.act({ type: "addLens", subject: abilitySubject("ahri", "Q") });
        if (!find("syndra")) api.act({ type: "addLens", subject: abilitySubject("syndra", "Q") });
        // Compare once both exist; ids are deterministic from seq, so look them
        // up after React applies the dispatches on the next tick.
        window.setTimeout(() => {
          const s = stateRef.current;
          const a = s.lenses.find((l) => l.subject.kind === "ability" && l.subject.champion === "ahri");
          const b = s.lenses.find((l) => l.subject.kind === "ability" && l.subject.champion === "syndra");
          if (a && b) api.act({ type: "compare", a: a.id, b: b.id });
        }, 0);
        api.announce("Step 1: Ahri Q and Syndra Q summoned at current values.");
        break;
      }
      case 2: {
        api.act({ type: "setGlobal", slot: "leaguecraft", context: { kind: "lc-patch", patch: "26.16" } });
        const syndra = find("syndra");
        if (syndra) api.act({ type: "setOverride", id: syndra.id, context: { kind: "current" } });
        api.announce("Step 2: global Leaguecraft context is patch 26.16; Syndra Q overridden to current. Ahri Q shows recorded change lines, never historical values.");
        break;
      }
      case 3: {
        for (const champion of ["ahri", "syndra"] as const) {
          const lens = find(champion);
          if (lens) api.act({ type: "transformToProChampion", id: lens.id });
        }
        api.announce("Step 3: both Lenses transformed to Pro Play at champion level. The Q facet is dropped and each plate offers Revert.");
        break;
      }
      case 4: {
        if (!state.groups.length) api.act({ type: "addMatrix", players: ["faker", "chovy"], champions: ["ahri", "syndra"] });
        api.announce("Step 4: Faker and Chovy on Ahri and Syndra as four independent Lenses. Exact head-to-head stays sealed.");
        break;
      }
      case 5: {
        api.restore(SAMPLE_SNAPSHOTS[0]);
        break;
      }
    }
  };

  const stateRef = useRef(api.state);
  stateRef.current = api.state;

  const lensChips = api.visual.order
    .map((id) => api.views.get(id))
    .filter((v): v is NonNullable<typeof v> => Boolean(v));

  return (
    <MotionConfig reducedMotion={reduced ? "always" : "never"}>
      <div ref={rootRef} className="atlas" data-reduced={reduced} data-deck={deckOpen ? "open" : "rail"} data-viewport={viewport} onKeyDown={onRootKeyDown} data-testid="atlas-root">
        <div className="atlas__chart" aria-hidden="true" />

        <header className="atlas__header">
          <span className="atlas__wordmark">
            <Layers size={16} aria-hidden="true" /> ATLAS <small>P1-C flagship prototype</small>
          </span>
          <span className="atlas__demo-seal">DEMO DATA</span>
          <span className="atlas__header-spacer" />
          <div className="atlas__header-actions">
            <button type="button" className="at-btn at-btn--ghost at-btn--icon" onClick={() => api.act({ type: "undo" })} disabled={!api.canUndo} aria-label="Undo" title="Undo (Ctrl+Z)">
              <Undo2 size={16} aria-hidden="true" />
            </button>
            <button type="button" className="at-btn at-btn--ghost at-btn--icon" onClick={() => api.act({ type: "redo" })} disabled={!api.canRedo} aria-label="Redo" title="Redo (Ctrl+Y)">
              <Redo2 size={16} aria-hidden="true" />
            </button>
            {!compact ? (
              <button type="button" className="at-btn at-btn--ghost at-btn--icon" onClick={() => setDeckOpen((o) => !o)} aria-label={deckOpen ? "Collapse the context deck" : "Open the context deck"} aria-expanded={deckOpen} title="Toggle the context deck">
                {deckOpen ? <ChevronsLeft size={16} aria-hidden="true" /> : <ChevronsRight size={16} aria-hidden="true" />}
              </button>
            ) : null}
          </div>
        </header>

        {compact ? (
          <nav className="rail" aria-label="Lenses on stage">
            {lensChips.length === 0 ? <span className="at-why">No Lenses yet. Open Context to summon one.</span> : null}
            {lensChips.map((v) => (
              <button
                key={v.lens.id}
                type="button"
                className="rail__chip"
                aria-current={api.visual.focusId === v.lens.id ? "true" : undefined}
                onClick={() => {
                  const el = document.querySelector<HTMLElement>(`[data-lens-id="${v.lens.id}"]`);
                  el?.scrollIntoView({ block: "start", behavior: reduced ? "auto" : "smooth" });
                  el?.focus({ preventScroll: true });
                }}
              >
                <span className="rail__dot" data-universe={v.universe} aria-hidden="true" />
                {v.title}
                <span className="at-chip">{contextChip(v.effective.context)}</span>
              </button>
            ))}
          </nav>
        ) : null}

        <div className="atlas__body">
          {!compact ? (
            <aside className="atlas__deck" aria-label="Context deck">
              {deckOpen ? (
                <ContextDeck api={api} />
              ) : (
                <div className="atlas__deck-rail">
                  <button type="button" className="at-btn at-btn--ghost at-btn--icon" onClick={() => setDeckOpen(true)} aria-label="Open the context deck">
                    <SlidersHorizontal size={16} aria-hidden="true" />
                  </button>
                  <span className="atlas__deck-rail-label">Context · {contextChip(api.state.global.leaguecraft)} · {contextChip(api.state.global.proPlay)}</span>
                </div>
              )}
            </aside>
          ) : null}

          <div className="atlas__stage-wrap">
            <nav className="journey" aria-label="Showcase journey" style={{ display: "flex", gap: 6, flexWrap: compact ? "nowrap" : "wrap", overflowX: "auto", marginBottom: 14, paddingBottom: 2 }}>
              <span className="at-eyebrow" style={{ alignSelf: "center", marginRight: 4, whiteSpace: "nowrap" }}>
                Journey
              </span>
              {JOURNEY.map((step) => (
                <button key={step.n} type="button" className="at-btn at-btn--sm" onClick={() => runStep(step.n)} title={step.hint} style={{ flex: "none" }}>
                  <span className="at-kbd" aria-hidden="true">
                    {step.n}
                  </span>{" "}
                  {step.label}
                </button>
              ))}
            </nav>
            <AtlasStage api={api} reduced={reduced} compact={compact} />
          </div>
        </div>

        {compact ? (
          <>
            <div className="phone-bar" role="toolbar" aria-label="Workspace actions">
              <button type="button" className="at-btn" onClick={() => setSheetOpen(true)} aria-haspopup="dialog">
                <SlidersHorizontal aria-hidden="true" /> Context
              </button>
              <button
                type="button"
                className="at-btn"
                disabled={api.visual.compareTray.length < 2}
                onClick={() => {
                  const [a, b] = api.visual.compareTray;
                  api.act({ type: "compare", a, b });
                  api.see({ type: "trayClear" });
                }}
                title={api.visual.compareTray.length < 2 ? "Select two Lenses first" : "Compose comparison"}
              >
                <Scale aria-hidden="true" /> Compare {api.visual.compareTray.length}/2
              </button>
              <button type="button" className="at-btn" onClick={() => api.act({ type: "undo" })} disabled={!api.canUndo}>
                <Undo2 aria-hidden="true" /> Undo
              </button>
              <button type="button" className="at-btn" onClick={() => api.act({ type: "redo" })} disabled={!api.canRedo}>
                <Redo2 aria-hidden="true" /> Redo
              </button>
            </div>
            <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
              <SheetContent side="bottom" className="sheet atlas-sheet" style={{ padding: 0 }}>
                <div className="sheet__handle" aria-hidden="true" />
                <SheetTitle className="deck__title" style={{ padding: "8px 14px 0" }}>
                  Context deck
                </SheetTitle>
                <SheetDescription className="at-why" style={{ padding: "0 14px" }}>
                  The same controls as the desktop deck. DEMO DATA, memory only.
                </SheetDescription>
                <ContextDeck api={api} onClose={() => setSheetOpen(false)} />
              </SheetContent>
            </Sheet>
          </>
        ) : null}

        <div className="atlas__sr" role="status" aria-live="polite" aria-atomic="true">
          {api.announcement}
        </div>
        {toast ? (
          <div className="atlas__toast" aria-hidden="true">
            {toast}
          </div>
        ) : null}
      </div>
    </MotionConfig>
  );
}
