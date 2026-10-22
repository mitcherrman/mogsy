/**
 * ATL-P1-C — the Context Deck.
 *
 * Docked on desktop, a bottom sheet on phones; the same sections either way
 * so a phone never loses a semantic choice. Sections: the global context
 * (two typed slots), the summon list, the compare tray, memory-only
 * workspace snapshots, the showcase journey and the spatial rules.
 */
import { Scale, Snowflake, Pin, Copy, GripVertical, Sparkles, Lock, Grid2x2, Eraser, Camera } from "lucide-react";
import { useState } from "react";
import { contextKey, contextLabel, leaguecraftCurrentLabel } from "@/lib/atlas-p1c/context";
import { CALENDAR_YEARS, PATCHES, PRO_SEASONS, SAMPLE_SNAPSHOTS } from "@/lib/atlas-p1c/fixtures";
import type { GlobalSlot, SubjectRef, TemporalContext, WorkspaceSnapshot } from "@/lib/atlas-p1c/types";
import { abilitySubject, exactMatchupSubject, proChampionSubject } from "@/lib/atlas-p1c/workspace";
import type { AtlasWorkspace } from "./useAtlasWorkspace";

type LcOption = { key: string; label: string; context: TemporalContext; hint?: string };

const LC_OPTIONS: LcOption[] = [
  { key: "current", label: leaguecraftCurrentLabel(), context: { kind: "current" } },
  ...PATCHES.filter((p) => !p.isCurrent).map((p) => ({
    key: `lc-patch:${p.patch}`,
    label: `Patch ${p.patch}${p.orderingCertified ? "" : " (ordering ?)"}`,
    context: { kind: "lc-patch", patch: p.patch } as TemporalContext,
  })),
];

const PRO_OPTIONS: LcOption[] = [
  { key: "current", label: "Current season (resolves to 2026 Season)", context: { kind: "current" } },
  ...PRO_SEASONS.map((s) => ({ key: `pro-season:${s.season}`, label: `${s.label} · season scope`, context: { kind: "pro-season", season: s.season } as TemporalContext })),
  ...CALENDAR_YEARS.map((y) => ({ key: `calendar-year:${y}`, label: `Calendar ${y} · date window`, context: { kind: "calendar-year", year: y } as TemporalContext })),
];

function SlotSelect({ slot, label, options, value, onChange }: { slot: GlobalSlot; label: string; options: LcOption[]; value: TemporalContext; onChange: (ctx: TemporalContext) => void }) {
  const id = `atlas-global-${slot}`;
  const current = contextKey(value);
  return (
    <div className="deck__slot">
      <label className="deck__slot-label" htmlFor={id}>
        <strong>{label}</strong>
        <span className="at-chip">{value.kind === "current" ? "current" : value.kind}</span>
      </label>
      <select
        id={id}
        className="at-select"
        value={current}
        onChange={(e) => {
          const opt = options.find((o) => o.key === e.target.value);
          if (opt) onChange(opt.context);
        }}
      >
        {options.map((o) => (
          <option key={o.key} value={o.key}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function ContextDeck({ api, onClose }: { api: AtlasWorkspace; onClose?: () => void }) {
  const { state, visual, views, act, see } = api;
  const [memory, setMemory] = useState<WorkspaceSnapshot[]>([]);

  const tally = (slot: GlobalSlot) => {
    let inherits = 0;
    let overrides = 0;
    let held = 0;
    for (const v of views.values()) {
      if (v.effective.slot !== slot) continue;
      if (v.effective.origin === "global") inherits += 1;
      else if (v.effective.origin === "override") overrides += 1;
      else held += 1;
    }
    return { inherits, overrides, held };
  };
  const lc = tally("leaguecraft");
  const pro = tally("proPlay");

  const trayViews = visual.compareTray.map((id) => views.get(id)).filter(Boolean);
  const composeReason = (() => {
    if (visual.compareTray.length < 2) return "Select two Lenses first.";
    const [a, b] = trayViews;
    if (!a || !b) return "Select two Lenses first.";
    if (a.universe !== b.universe) return "Different universes: transform one Lens first. You can still compose to see the blocked verdict.";
    return null;
  })();

  const summon = (subject: SubjectRef, label: string) => {
    act({ type: "addLens", subject });
    api.announce(`${label} summoned.`);
    onClose?.();
  };

  return (
    <div className="deck" data-testid="atlas-deck">
      <section className="deck__section" aria-labelledby="deck-global">
        <h2 className="deck__title" id="deck-global">
          Global context
        </h2>
        <SlotSelect slot="leaguecraft" label="Leaguecraft" options={LC_OPTIONS} value={state.global.leaguecraft} onChange={(ctx) => act({ type: "setGlobal", slot: "leaguecraft", context: ctx })} />
        <p className="deck__inherit">
          <b>{lc.inherits}</b> inherit · <b>{lc.overrides}</b> override · <b>{lc.held}</b> held
        </p>
        <SlotSelect slot="proPlay" label="Pro Play" options={PRO_OPTIONS} value={state.global.proPlay} onChange={(ctx) => act({ type: "setGlobal", slot: "proPlay", context: ctx })} />
        <p className="deck__inherit">
          <b>{pro.inherits}</b> inherit · <b>{pro.overrides}</b> override · <b>{pro.held}</b> held
        </p>
        <p className="at-why" style={{ marginTop: 8 }}>
          Two typed slots. A patch steers Leaguecraft Lenses; a season scope or calendar year steers Pro Play Lenses. The prototype never maps one onto the other.
        </p>
      </section>

      <section className="deck__section" aria-labelledby="deck-summon">
        <h2 className="deck__title" id="deck-summon">
          Summon a Lens
        </h2>
        <div className="deck__summon">
          <button type="button" className="at-btn" onClick={() => summon(abilitySubject("ahri", "Q"), "Ahri Q")}>
            <span className="rail__dot" data-universe="leaguecraft" aria-hidden="true" /> Ahri Q
          </button>
          <button type="button" className="at-btn" onClick={() => summon(abilitySubject("syndra", "Q"), "Syndra Q")}>
            <span className="rail__dot" data-universe="leaguecraft" aria-hidden="true" /> Syndra Q
          </button>
          <button type="button" className="at-btn" onClick={() => summon(proChampionSubject("ahri"), "Pro Play Ahri")}>
            <span className="rail__dot" data-universe="pro-play" aria-hidden="true" /> Pro Ahri
          </button>
          <button type="button" className="at-btn" onClick={() => summon(proChampionSubject("syndra"), "Pro Play Syndra")}>
            <span className="rail__dot" data-universe="pro-play" aria-hidden="true" /> Pro Syndra
          </button>
          <button
            type="button"
            className="at-btn at-btn--wide"
            onClick={() => {
              act({ type: "addMatrix", players: ["faker", "chovy"], champions: ["ahri", "syndra"] });
              onClose?.();
            }}
          >
            <Grid2x2 size={14} aria-hidden="true" /> Faker · Chovy × Ahri · Syndra matrix
          </button>
          <button
            type="button"
            className="at-btn at-btn--wide"
            onClick={() => {
              act({ type: "addLens", subject: exactMatchupSubject({ player: "faker", champion: "ahri" }, { player: "chovy", champion: "syndra" }) });
              onClose?.();
            }}
            title="Owner-only. Adds a sealed Lens; the route is never called."
          >
            <Lock size={14} aria-hidden="true" /> Exact head-to-head <span className="at-chip at-chip--rose">owner only</span>
          </button>
        </div>
      </section>

      <section className="deck__section" aria-labelledby="deck-compare">
        <h2 className="deck__title" id="deck-compare">
          Compare tray
          <button type="button" className="at-btn at-btn--ghost at-btn--sm" onClick={() => see({ type: "trayClear" }, "Compare tray cleared.")} disabled={visual.compareTray.length === 0}>
            Clear
          </button>
        </h2>
        <div className="deck__tray">
          {[0, 1].map((i) => {
            const v = trayViews[i];
            return (
              <div key={i} className={`deck__tray-slot${v ? " deck__tray-slot--filled" : ""}`}>
                <Scale size={13} aria-hidden="true" />
                {v ? (
                  <>
                    <span>{v.title}</span>
                    <span className="at-chip" style={{ marginLeft: "auto" }}>
                      {v.universe === "leaguecraft" ? "LC" : "PRO"}
                    </span>
                  </>
                ) : (
                  <span>Slot {i + 1}: press Select on a Lens</span>
                )}
              </div>
            );
          })}
          <button
            type="button"
            className="at-btn at-btn--primary"
            disabled={visual.compareTray.length < 2}
            title={composeReason ?? "Compose a comparison bridge beneath the two Lenses"}
            onClick={() => {
              const [a, b] = visual.compareTray;
              act({ type: "compare", a, b });
              see({ type: "trayClear" });
              onClose?.();
            }}
          >
            Compose comparison
          </button>
          {composeReason ? <p className="at-why">{composeReason}</p> : null}
        </div>
      </section>

      <section className="deck__section" aria-labelledby="deck-memory">
        <h2 className="deck__title" id="deck-memory">
          Workspace memory
        </h2>
        <div className="deck__snapshots">
          {[...SAMPLE_SNAPSHOTS, ...memory].map((snap) => (
            <button
              key={snap.id}
              type="button"
              className="deck__snapshot"
              onClick={() => {
                api.restore(snap);
                onClose?.();
              }}
            >
              <strong>{snap.label}</strong>
              <span>{snap.description}</span>
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            className="at-btn at-btn--sm"
            disabled={state.lenses.length === 0}
            onClick={() => {
              const snap = api.snapshotNow(`Snapshot ${memory.length + 1}`);
              setMemory((m) => [...m, snap]);
              api.announce(`Snapshot ${memory.length + 1} kept in memory for this tab only.`);
            }}
          >
            <Camera size={13} aria-hidden="true" /> Snapshot now
          </button>
          <button type="button" className="at-btn at-btn--sm" disabled={state.lenses.every((l) => l.pinned)} onClick={() => act({ type: "clearUnpinned" })} title="Closes every unpinned Lens. Undo brings them back.">
            <Eraser size={13} aria-hidden="true" /> Clear unpinned
          </button>
        </div>
        <p className="deck__memory-note">Memory only. Nothing is saved to an account or a server, and there is no share link. Reloading the page forgets everything.</p>
      </section>

      <section className="deck__section" aria-labelledby="deck-rules">
        <h2 className="deck__title" id="deck-rules">
          Spatial rules
        </h2>
        <div className="deck__rules">
          <ul>
            <li>
              <b>
                <GripVertical size={11} aria-hidden="true" /> Move
              </b>
              <span>
                Drag the grip, or focus a Lens and press <kbd className="at-kbd">Shift</kbd>+<kbd className="at-kbd">←</kbd>/<kbd className="at-kbd">→</kbd>. Order is visual; nothing about the data changes.
              </span>
            </li>
            <li>
              <b>
                <Pin size={11} aria-hidden="true" /> Pin
              </b>
              <span>Keeps a Lens through Clear and in restores. <kbd className="at-kbd">P</kbd></span>
            </li>
            <li>
              <b>
                <Snowflake size={11} aria-hidden="true" /> Hold
              </b>
              <span>Freezes the Lens on its current context; global changes pass it by. <kbd className="at-kbd">H</kbd></span>
            </li>
            <li>
              <b>
                <Copy size={11} aria-hidden="true" /> Clone
              </b>
              <span>Duplicates a Lens beside the original, provenance included. <kbd className="at-kbd">D</kbd></span>
            </li>
            <li>
              <b>
                <Scale size={11} aria-hidden="true" /> Compare
              </b>
              <span>Select two, then Compose. The sources decide whether a difference is allowed. <kbd className="at-kbd">S</kbd></span>
            </li>
            <li>
              <b>
                <Sparkles size={11} aria-hidden="true" /> Transform
              </b>
              <span>Carries a Lens into Pro Play at champion level and says what it dropped. Reversible. <kbd className="at-kbd">T</kbd></span>
            </li>
            <li>
              <b>Undo</b>
              <span>
                Every meaning change is undoable: <kbd className="at-kbd">Ctrl</kbd>+<kbd className="at-kbd">Z</kbd> / <kbd className="at-kbd">Y</kbd> while the workspace has focus.
              </span>
            </li>
          </ul>
        </div>
      </section>

      <section className="deck__section" aria-labelledby="deck-legend">
        <h2 className="deck__title" id="deck-legend">
          Reading the plates
        </h2>
        <div className="deck__rules">
          <ul>
            <li>
              <b>{contextLabel({ kind: "current" })}</b>
              <span>Teal filament: Leaguecraft. Violet filament: Pro Play. Gold: your focus, pins and bridges.</span>
            </li>
            <li>
              <b>Hatched</b>
              <span>A value the source does not record. Never a guess.</span>
            </li>
            <li>
              <b>Sealed</b>
              <span>Owner-only. The route is named, never called.</span>
            </li>
          </ul>
        </div>
      </section>
    </div>
  );
}
