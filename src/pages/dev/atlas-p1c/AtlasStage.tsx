/**
 * ATL-P1-C — the Stage (dock).
 *
 * A flow dock: Lenses occupy grid cells in a visual order the player owns.
 * Pointer drag moves a floating ghost while the real plate slides to its new
 * slot live (framer `layout`), so the transform of the dragged element never
 * fights the layout animation. Keyboard: Shift+arrows move, arrows alone walk
 * focus. Everything the pointer can do, the keyboard can do.
 */
import { AnimatePresence, motion, useMotionValue } from "framer-motion";
import { GripVertical, Lock } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { CHAMPIONS, PLAYERS } from "@/lib/atlas-p1c/fixtures";
import { exactMatchupSubject } from "@/lib/atlas-p1c/workspace";
import { ComparisonTile } from "./ComparisonTile";
import { LensTile } from "./LensTile";
import { ATLAS_DURATION, atlasTransition, plateVariants } from "./motion";
import type { AtlasWorkspace, DockItem } from "./useAtlasWorkspace";

interface DragState {
  key: string;
  pointerId: number;
}

export function AtlasStage({ api, reduced, compact }: { api: AtlasWorkspace; reduced: boolean; compact: boolean }) {
  const { state, visual, views, comparisons, dock, act, see } = api;
  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const rafRef = useRef<number | null>(null);
  const ghostX = useMotionValue(0);
  const ghostY = useMotionValue(0);
  const [ghost, setGhost] = useState<string | null>(null);
  const movable = dock.filter((i) => i.kind !== "comparison");

  const endDrag = useCallback(() => {
    const drag = dragRef.current;
    dragRef.current = null;
    setGhost(null);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (drag) {
      see({ type: "lift", id: null });
      const items = api.dock.filter((i) => i.kind !== "comparison");
      const index = items.findIndex((i) => i.key === drag.key);
      if (index >= 0) api.announce(`Dropped at position ${index + 1} of ${items.length}.`);
    }
  }, [api, see]);

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      ghostX.set(event.clientX + 14);
      ghostY.set(event.clientY + 14);
      if (rafRef.current) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        const stack = document.elementsFromPoint(event.clientX, event.clientY);
        for (const el of stack) {
          const host = (el as HTMLElement).closest?.("[data-dock-key]") as HTMLElement | null;
          if (!host) continue;
          const key = host.dataset.dockKey;
          if (!key || key === drag.key || key.startsWith("cmp:")) break;
          const items = api.dock.filter((i) => i.kind !== "comparison");
          const index = items.findIndex((i) => i.key === key);
          if (index >= 0) api.moveItemTo(drag.key, index, false);
          break;
        }
      });
    };
    const onUp = (event: PointerEvent) => {
      if (dragRef.current && event.pointerId === dragRef.current.pointerId) endDrag();
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [api, endDrag, ghostX, ghostY]);

  const startDrag = (key: string, title: string, liftId: string) => (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    event.preventDefault();
    dragRef.current = { key, pointerId: event.pointerId };
    ghostX.set(event.clientX + 14);
    ghostY.set(event.clientY + 14);
    setGhost(title);
    see({ type: "lift", id: liftId });
  };

  const onStageKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.defaultPrevented) return;
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const target = event.target as HTMLElement;
    if (!target.matches?.("[data-lens-id]")) return;
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight" && event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    const tiles = Array.from(stageRef.current?.querySelectorAll<HTMLElement>("[data-lens-id]") ?? []);
    const index = tiles.indexOf(target);
    if (index < 0) return;
    const delta = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1;
    const next = tiles[index + delta];
    if (next) {
      event.preventDefault();
      next.focus();
    }
  };

  const renderLens = (id: string, item: DockItem) => {
    const view = views.get(id);
    if (!view) return null;
    const index = movable.findIndex((i) => i.key === item.key);
    return (
      <LensTile
        key={id}
        view={view}
        focused={visual.focusId === id}
        collapsed={Boolean(visual.collapsed[id])}
        expanded={Boolean(visual.expanded[id])}
        lifted={visual.lifted === id}
        inTray={visual.compareTray.includes(id)}
        compact={compact}
        reduced={reduced}
        position={{ index, count: movable.length }}
        act={act}
        onFocus={() => see({ type: "focus", id })}
        onToggleCollapse={() => see({ type: "toggleCollapse", id }, visual.collapsed[id] ? `${view.title} opened.` : `${view.title} collapsed to its header.`)}
        onToggleExpand={() => see({ type: "toggleExpand", id }, visual.expanded[id] ? `${view.title} narrowed.` : `${view.title} expanded across two columns.`)}
        onToggleTray={() => see({ type: "trayToggle", id }, visual.compareTray.includes(id) ? `${view.title} deselected.` : `${view.title} selected for comparison (${Math.min(visual.compareTray.length + 1, 2)} of 2).`)}
        onGripPointerDown={startDrag(item.key, view.title, id)}
        onMove={(delta) => api.moveItem(item.key, delta)}
      />
    );
  };

  return (
    <div ref={stageRef} className="stage" role="region" aria-label="Atlas stage" onKeyDown={onStageKeyDown} data-testid="atlas-stage">
      <AnimatePresence initial={false} mode="popLayout">
        {dock.length === 0 ? (
          <motion.div key="empty" className="stage__empty" variants={plateVariants(reduced)} initial="enter" animate="center" exit="exit" transition={atlasTransition(ATLAS_DURATION.plate, reduced)}>
            <h2>The stage is empty</h2>
            <p>Summon a Lens from the deck, or restore a sample workspace. Every number you will see is DEMO DATA.</p>
            <div className="stage__empty-actions">
              <button type="button" className="at-btn at-btn--primary" onClick={() => act({ type: "addLens", subject: { kind: "ability", universe: "leaguecraft", champion: "ahri", slot: "Q" } })}>
                Summon Ahri Q
              </button>
              <button type="button" className="at-btn" onClick={() => act({ type: "addLens", subject: { kind: "ability", universe: "leaguecraft", champion: "syndra", slot: "Q" } })}>
                Summon Syndra Q
              </button>
            </div>
          </motion.div>
        ) : null}
        {dock.map((item) => {
          if (item.kind === "lens") {
            const expanded = Boolean(visual.expanded[item.id]);
            return (
              <motion.div
                key={item.key}
                layout={!reduced}
                className={`dock-item${expanded ? " dock-item--expanded" : ""}`}
                data-dock-key={item.key}
                variants={plateVariants(reduced)}
                initial="enter"
                animate="center"
                exit="exit"
                transition={atlasTransition(ATLAS_DURATION.plate, reduced)}
              >
                {renderLens(item.id, item)}
              </motion.div>
            );
          }
          if (item.kind === "comparison") {
            const view = comparisons.get(item.id);
            if (!view) return null;
            return (
              <motion.div key={item.key} layout={!reduced} className="dock-item dock-item--wide" data-dock-key={item.key} variants={plateVariants(reduced)} initial="enter" animate="center" exit="exit" transition={atlasTransition(ATLAS_DURATION.plate, reduced)}>
                <ComparisonTile view={view} reduced={reduced} onRemove={() => act({ type: "uncompare", id: item.id })} />
              </motion.div>
            );
          }
          const group = state.groups.find((g) => g.id === item.id);
          if (!group) return null;
          const hasExact = state.lenses.some((l) => l.subject.kind === "exact-matchup");
          return (
            <motion.div key={item.key} layout={!reduced} className="dock-item dock-item--wide" data-dock-key={item.key} variants={plateVariants(reduced)} initial="enter" animate="center" exit="exit" transition={atlasTransition(ATLAS_DURATION.plate, reduced)}>
              <section className="group" aria-label={`Matrix: ${group.label}`} data-testid="atlas-group">
                <div className="group__head">
                  <button
                    type="button"
                    className="lens__grip"
                    aria-label={`Drag to move the matrix ${group.label}. Use Shift + arrow keys on any cell to move it.`}
                    onPointerDown={startDrag(item.key, group.label, item.lensIds[0])}
                    onKeyDown={(e) => {
                      if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                        e.preventDefault();
                        api.moveItem(item.key, -1);
                      } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                        e.preventDefault();
                        api.moveItem(item.key, 1);
                      }
                    }}
                  >
                    <GripVertical size={14} aria-hidden="true" />
                  </button>
                  <h3 className="group__title">{group.label}</h3>
                  <span className="at-chip">{group.players.length}×{group.champions.length} player × champion</span>
                  <span className="atlas__header-spacer" />
                  <button
                    type="button"
                    className="at-btn at-btn--sm"
                    disabled={hasExact}
                    title={hasExact ? "A sealed exact-matchup Lens is already on the stage." : "Owner-only exact same-game head-to-head. Adds a sealed Lens; the route is never called."}
                    onClick={() => act({ type: "addLens", subject: exactMatchupSubject({ player: group.players[0], champion: group.champions[0] }, { player: group.players[1] ?? group.players[0], champion: group.champions[1] ?? group.champions[0] }) })}
                  >
                    <Lock size={12} aria-hidden="true" /> Exact head-to-head <span className="at-chip at-chip--rose">owner only</span>
                  </button>
                  <p className="group__note">
                    Each cell is an independently sourced player-on-champion record for {group.players.map((p) => PLAYERS[p].name).join(" and ")} on {group.champions.map((c) => CHAMPIONS[c].name).join(" and ")}. Cells are not head-to-head; only the sealed exact matchup is.
                  </p>
                </div>
                <div className="group__grid">
                  {item.lensIds.map((id) => renderLens(id, item))}
                </div>
              </section>
            </motion.div>
          );
        })}
      </AnimatePresence>
      {ghost ? (
        <motion.div className="ghost" style={{ x: ghostX, y: ghostY }} aria-hidden="true">
          {ghost}
        </motion.div>
      ) : null}
    </div>
  );
}
