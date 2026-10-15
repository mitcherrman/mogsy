/**
 * MIG — GLYPH PRESS (SPELL).
 *
 * An Academy typesetter's press. The phrase to be completed is a FORME: a
 * slate bed holding one brass socket per letter, the marks (an apostrophe, a
 * colon, a digit) engraved as given, the words spaced. Some sockets arrive
 * engraved — the glyphs the authority gave away — and the rest are the
 * player's to set. Under the forme turns the DRUM: a brass cylinder carrying
 * every glyph; the player turns it (drag, flick, the ‹ › keys, or simply a
 * letter on a physical keyboard) and taps a glyph to set it into the socket
 * under the cursor. A SOUNDING arms the press instead: the next glyph chosen
 * is sounded through the whole phrase, and the authority answers by engraving
 * it wherever it sits — or tarnishing it on the drum if it sits nowhere. One
 * Lock pulls the press. At the reveal the press INKS the forme left to right:
 * every socket prints — gold where the player was right, ember with the true
 * glyph stamped over a wrong one, an outlined gold glyph where a socket was
 * left blank — and the plaque turns to the completed answer.
 *
 * NOTHING HERE GRADES. `content` has no field that could hold an answer; the
 * `ledger` carries only what the authority has disclosed; the true glyphs
 * reach this component only through `reveal`, which it draws.
 *
 * CONTINUITY. Head, forme, drum, plate and status are reserved boxes; sockets
 * are positioned by transform inside a measured bed, the drum turns by
 * transform, the plaque's live record and proof are stacked layers that swap
 * by opacity. No region is added or removed by a phase change.
 */
import {
  useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState,
  type KeyboardEvent, type PointerEvent as ReactPointerEvent, type Ref, type RefObject,
} from "react";
import { AudioLines, Lock } from "lucide-react";
import { useReducedMotionPreference } from "@/hooks/useReducedMotionPreference";
import type {
  GlyphPressLedger, GlyphPressPublic, GlyphPressResponse, GlyphPressReveal, GlyphPressValue, InteractionPhase,
} from "@/lib/interaction-grammar/types";
import {
  CLEAR_TILE, assertGlyphPressContent, blankCount, clampDrum, drumIndexOf, drumOffsetPx, drumTiles, firstBlankSocket,
  glyphState, inkProgress, inkReached, keyToGlyph, layoutForme, planGlyphPressReveal, responseGlyphs, showsVerdict,
  soundingsLeft, stageAt, stepSocket, verdictWord, type FormeBox, type GlyphPressPlan, type GlyphPressStage,
} from "@/lib/interaction-grammar/glyphPress";
import { SubjectArt } from "./shared";
import "./glyphPress.css";

export type GlyphPressCue = "stamp" | "clear" | "arm" | "sound" | "sound-hit" | "sound-miss" | "lock" | "ink" | "resolve";

export interface GlyphPressProps {
  content: GlyphPressPublic;
  /** What the authority has disclosed so far. Host-owned; replaced after every sounding. */
  ledger: GlyphPressLedger;
  phase: InteractionPhase;
  /** The host-owned value: the player's glyph per socket. */
  value: GlyphPressValue;
  onChange: (next: GlyphPressValue) => void;
  /** The player asks the authority to sound a glyph. The answer arrives as a new `ledger`. */
  onSound: (glyph: string) => void;
  onLock: (response: GlyphPressResponse) => void;
  reveal?: GlyphPressReveal | null;
  /** Fires once per reveal, when the choreography (or, reduced, the first frame) is done. */
  onRevealComplete?: () => void;
  /** Scales the reveal choreography. Default 1800ms. */
  revealBudgetMs?: number;
  onCue?: (cue: GlyphPressCue) => void;
  promptRef?: Ref<HTMLHeadingElement>;
  /** A definite height for the whole instrument, from a host that measured its stage. */
  maxHeight?: number;
}

const TILE_W = 44;
const TILE_GAP = 4;
const DRAG_THRESHOLD_PX = 5;

/** Drives one requestAnimationFrame clock for a plan; returns elapsed ms. */
function useRevealClock(plan: GlyphPressPlan, active: boolean, key: string): number {
  const [run, setRun] = useState<{ key: string; elapsed: number } | null>(null);
  useEffect(() => {
    if (!active || plan.instant) { setRun(null); return; }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const elapsed = now - start;
      setRun({ key, elapsed });
      if (elapsed < plan.totalMs) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, plan, key]);
  return run && run.key === key ? run.elapsed : 0;
}

/** An element's box, kept current by a ResizeObserver. */
function useBox(ref: RefObject<HTMLElement | null>): FormeBox | null {
  const [box, setBox] = useState<FormeBox | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => {
      const r = el.getBoundingClientRect();
      const width = Math.round(r.width);
      const height = Math.round(r.height);
      if (!width || !height) return;
      setBox((b) => (b && b.width === width && b.height === height ? b : { width, height }));
    };
    read();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return box;
}

export function GlyphPress({
  content, ledger, phase, value, onChange, onSound, onLock, reveal = null, onRevealComplete, revealBudgetMs, onCue, promptRef, maxHeight,
}: GlyphPressProps) {
  assertGlyphPressContent(content);
  const reduced = useReducedMotionPreference();
  const promptId = useId();
  const statusId = useId();
  const drumId = useId();
  const open = phase === "open";
  const { structure, alphabet } = content;
  const n = structure.glyphCount;
  const tiles = useMemo(() => drumTiles(alphabet), [alphabet]);
  const left = soundingsLeft(content, ledger);

  // ---- the forme's geometry
  const bedRef = useRef<HTMLDivElement>(null);
  const formeRef = useRef<HTMLDivElement>(null);
  const bedBox = useBox(bedRef);
  const layout = useMemo(() => (bedBox ? layoutForme(structure, bedBox) : null), [structure, bedBox]);

  // ---- ephemeral UI state (never graded, never submitted)
  const [cursor, setCursor] = useState<number | null>(() => firstBlankSocket(value, ledger));
  const [armed, setArmed] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [drumIndex, setDrumIndex] = useState<number>(() => Math.max(1, drumIndexOf(alphabet[0], alphabet)));
  const [drumFloat, setDrumFloat] = useState<number | null>(null);
  const dragRef = useRef<{ pointerId: number; startX: number; startIndex: number; moved: boolean; tile: string | null } | null>(null);
  const drumWinRef = useRef<HTMLDivElement>(null);
  const drumBox = useBox(drumWinRef);
  const [focusVisible, setFocusVisible] = useState(false);
  const focusFrom = useRef<"pointer" | "keyboard">("keyboard");
  const [announcement, setAnnouncement] = useState("");

  // The cursor never rests on an engraved socket.
  useLayoutEffect(() => {
    setCursor((c) => (c !== null && ledger.engraved[c] === null ? c : firstBlankSocket(value, ledger)));
  }, [ledger, value]);

  // A sounding the ledger has answered is no longer pending; cue the result.
  const soundingCount = useRef(ledger.soundings.length);
  useEffect(() => {
    const prev = soundingCount.current;
    soundingCount.current = ledger.soundings.length;
    if (ledger.soundings.length > prev) {
      const last = ledger.soundings[ledger.soundings.length - 1];
      setPending((p) => (p === last.glyph ? null : p));
      onCue?.(last.hits > 0 ? "sound-hit" : "sound-miss");
      setAnnouncement(`${last.hits > 0 ? `${last.glyph} sits in ${last.hits} ${last.hits === 1 ? "socket" : "sockets"}.` : `No ${last.glyph} in this answer.`} ${soundingsLeft(content, ledger)} ${soundingsLeft(content, ledger) === 1 ? "sounding" : "soundings"} left.`);
    }
  }, [ledger, content, onCue]);

  // An armed press and a drag never survive the forme closing.
  useEffect(() => { if (!open) { setArmed(false); dragRef.current = null; setDrumFloat(null); } }, [open]);

  // ---- reveal
  const revealed = phase === "revealed" && reveal !== null;
  const plan = useMemo(() => planGlyphPressReveal({ reduced, budgetMs: revealBudgetMs, glyphCount: n }), [reduced, revealBudgetMs, n]);
  const revealKey = revealed ? reveal.results.join("") + reveal.answerText : "";
  const elapsed = useRevealClock(plan, revealed, revealKey);
  const stage: GlyphPressStage | null = revealed ? stageAt(plan, elapsed) : null;
  const progress = revealed ? inkProgress(plan, elapsed) : 0;

  const completedFor = useRef("");
  useEffect(() => {
    if (!revealed) { completedFor.current = ""; return; }
    if (stage === "done" && completedFor.current !== revealKey) {
      completedFor.current = revealKey;
      onRevealComplete?.();
    }
  }, [revealed, stage, revealKey, onRevealComplete]);

  const cuedStage = useRef<GlyphPressStage | null>(null);
  useEffect(() => {
    if (!revealed || !stage || cuedStage.current === stage) return;
    cuedStage.current = stage;
    if (stage === "ink") onCue?.("ink");
    else if (stage === "verdict" || (stage === "done" && plan.instant)) onCue?.("resolve");
  }, [revealed, stage, plan.instant, onCue]);
  useEffect(() => { if (!revealed) cuedStage.current = null; }, [revealed]);

  // ---- actions: every input path commits here
  const commitValue = useCallback((next: GlyphPressValue) => { onChange(next); }, [onChange]);

  const rotateTo = useCallback((glyph: string) => {
    const i = drumIndexOf(glyph, alphabet);
    if (i >= 0) setDrumIndex(i);
  }, [alphabet]);

  const stamp = useCallback((glyph: string) => {
    if (!open || cursor === null) return;
    if (glyphState(glyph, ledger.soundings, pending) !== "free") return;
    rotateTo(glyph);
    const next = value.slice();
    while (next.length < n) next.push(null);
    next[cursor] = glyph;
    commitValue(next);
    const to = stepSocket(cursor, 1, ledger);
    setCursor(to ?? cursor);
    setAnnouncement(`${glyph} set in socket ${cursor + 1} of ${n}.`);
    onCue?.("stamp");
  }, [open, cursor, ledger, pending, rotateTo, value, n, commitValue, onCue]);

  const clearAt = useCallback((index: number) => {
    if (!open || ledger.engraved[index] !== null || !value[index]) return;
    const next = value.slice();
    next[index] = null;
    commitValue(next);
    setAnnouncement(`Socket ${index + 1} cleared.`);
    onCue?.("clear");
  }, [open, ledger, value, commitValue, onCue]);

  const backspace = useCallback(() => {
    if (!open || cursor === null) return;
    if (value[cursor]) { clearAt(cursor); return; }
    const prev = stepSocket(cursor, -1, ledger);
    if (prev === null || prev === cursor) return;
    setCursor(prev);
    clearAt(prev);
  }, [open, cursor, value, clearAt, ledger]);

  const sound = useCallback((glyph: string) => {
    if (!open || left <= 0 || pending !== null) return;
    if (glyphState(glyph, ledger.soundings, pending) !== "free") return;
    rotateTo(glyph);
    setPending(glyph);
    setArmed(false);
    setAnnouncement(`Sounding ${glyph}.`);
    onCue?.("sound");
    onSound(glyph);
  }, [open, left, pending, ledger.soundings, rotateTo, onCue, onSound]);

  const actOnGlyph = useCallback((glyph: string) => { if (armed) sound(glyph); else stamp(glyph); }, [armed, sound, stamp]);
  const actOnTile = useCallback((tile: string) => { if (tile === CLEAR_TILE) backspace(); else actOnGlyph(tile); }, [backspace, actOnGlyph]);

  // The cue is the host's setState: it belongs in the handler. A functional updater would run it
  // inside render whenever React cannot take the eager path ("Cannot update X while rendering").
  const toggleArmed = () => {
    if (!open || left <= 0 || pending !== null) return;
    if (!armed) onCue?.("arm");
    setArmed(!armed);
  };

  // One Lock per round of input. A host that acknowledges asynchronously keeps `phase` open for a
  // beat; a second click in that beat must not submit again. Any edit, sounding or phase change
  // re-arms it, so a host that refuses a lock can accept a corrected one.
  const lockedRef = useRef(false);
  useEffect(() => { lockedRef.current = false; }, [open, value, ledger]);

  const lock = () => {
    if (!open || lockedRef.current) return;
    lockedRef.current = true;
    setArmed(false);
    onCue?.("lock");
    setAnnouncement("Locked. The press is inking.");
    onLock({ glyphs: responseGlyphs(value, ledger) });
  };

  // ---- keyboard: letters and Backspace anywhere in the instrument; arrows per widget
  const onRootKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!open || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === "Escape") { if (armed) { setArmed(false); e.preventDefault(); } return; }
    const g = keyToGlyph(e.key, alphabet);
    if (g) { e.preventDefault(); actOnGlyph(g); return; }
    if (e.key === "Backspace") { e.preventDefault(); backspace(); return; }
    if (e.key === "Delete") { e.preventDefault(); if (cursor !== null) clearAt(cursor); }
  };
  const onFormeKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!open) return;
    let to: number | null | undefined;
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") to = stepSocket(cursor, -1, ledger);
    else if (e.key === "ArrowRight" || e.key === "ArrowDown") to = stepSocket(cursor, 1, ledger);
    else if (e.key === "Home") to = stepSocket(null, 1, ledger);
    else if (e.key === "End") to = stepSocket(null, -1, ledger);
    if (to === undefined) return;
    e.preventDefault();
    focusFrom.current = "keyboard";
    setFocusVisible(true);
    if (to !== null) setCursor(to);
  };
  const onDrumKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!open) return;
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); setDrumIndex((i) => clampDrum(i - 1, alphabet)); return; }
    if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); setDrumIndex((i) => clampDrum(i + 1, alphabet)); return; }
    if (e.key === "Home") { e.preventDefault(); setDrumIndex(1); return; }
    if (e.key === "End") { e.preventDefault(); setDrumIndex(alphabet.length); return; }
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); actOnTile(tiles[drumIndex]); }
  };

  // ---- pointer on the forme: a tap on a socket moves the cursor
  const selectSocket = (index: number) => (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!open || ledger.engraved[index] !== null) return;
    e.preventDefault();
    setCursor(index);
    focusFrom.current = "pointer";
    setFocusVisible(false);
    formeRef.current?.focus({ preventScroll: true });
  };

  // ---- pointer on the drum: drag turns it, a tap sets the glyph under the finger
  const onDrumPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!open || (e.pointerType === "mouse" && e.button !== 0)) return;
    const tile = (e.target as HTMLElement).closest<HTMLElement>("[data-tile]")?.dataset.tile ?? null;
    dragRef.current = { pointerId: e.pointerId, startX: e.clientX, startIndex: drumIndex, moved: false, tile };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* jsdom / released */ }
    e.preventDefault();
  };
  const onDrumPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const dx = e.clientX - d.startX;
    if (!d.moved && Math.abs(dx) < DRAG_THRESHOLD_PX) return;
    d.moved = true;
    const f = Math.max(0, Math.min(alphabet.length, d.startIndex - dx / (TILE_W + TILE_GAP)));
    setDrumFloat(f);
  };
  const endDrumPointer = (e: ReactPointerEvent<HTMLDivElement>, commit: boolean) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    dragRef.current = null;
    if (d.moved) {
      const f = Math.max(0, Math.min(alphabet.length, d.startIndex - (e.clientX - d.startX) / (TILE_W + TILE_GAP)));
      setDrumFloat(null);
      if (commit) setDrumIndex(clampDrum(f, alphabet));
      return;
    }
    setDrumFloat(null);
    if (commit && d.tile) actOnTile(d.tile);
  };

  // ---- derived display
  const setCount = ledger.engraved.reduce((s, g, i) => s + (g === null && value[i] ? 1 : 0), 0);
  const openCount = ledger.engraved.filter((g) => g === null).length;
  const blanks = blankCount(value, ledger);
  const verdictOn = revealed && stage !== null && showsVerdict(stage);
  const lastSounding = ledger.soundings[ledger.soundings.length - 1] ?? null;
  const soundedGlyphs = useMemo(() => new Set(ledger.soundings.filter((s) => s.hits > 0).map((s) => s.glyph)), [ledger.soundings]);
  const drumPos = drumFloat ?? drumIndex;
  const drumShift = drumBox ? drumOffsetPx(drumPos, drumBox.width, TILE_W, TILE_GAP) : 0;
  const centredTile = tiles[clampDrum(drumPos, alphabet)];

  const statusLine = !open
    ? (revealed ? content.footnote ?? "" : "Locked. The press is inking…")
    : armed ? `Sounding armed — choose the glyph to sound. ${left} left.`
    : pending ? `Sounding ${pending}…`
    : setCount === 0 ? "Type a glyph, or turn the drum and tap one. Sound a glyph to find every socket it sits in."
    : `${setCount} of ${openCount} set · ${left} ${left === 1 ? "sounding" : "soundings"} left · Backspace clears. Lock when it reads right.`;
  const resultText = revealed
    ? `${verdictWord(reveal)}. ${reveal.scoreText}. The answer is ${reveal.answerText}.`
    : "";
  const soundingRecord = ledger.soundings.length
    ? ledger.soundings.map((s) => `${s.glyph} ${s.hits > 0 ? `×${s.hits}` : "—"}`).join(" · ")
    : "none yet";

  // Fresh engravings (the last sounding's) flash in reading order.
  let freshOrder = 0;

  return (
    <div data-testid="mig-glyph-press" data-mig-primitive="glyph-press" data-phase={phase}
      data-reveal-stage={stage ?? undefined} data-verdict={verdictOn ? reveal?.verdict : undefined}
      data-armed={armed ? "true" : "false"} data-reduced={reduced ? "true" : "false"}
      className="gp" style={maxHeight !== undefined ? { height: maxHeight, flex: "none" } : undefined}
      onKeyDown={onRootKeyDown}>
      <header data-part="head" data-testid="gp-head" className="gp-head">
        <span className="gp-art">
          <SubjectArt media={content.clue.media} monogram={content.clue.monogram ?? content.categoryLabel} className="h-full w-full" />
        </span>
        <div className="gp-head-text">
          <p className="gp-eyebrow">Glyph Press · {content.categoryLabel}</p>
          <h2 ref={promptRef} id={promptId} tabIndex={-1} className="gp-prompt" data-testid="gp-prompt">{content.prompt}</h2>
          <p className="gp-caption" data-testid="gp-caption">{content.clue.caption ?? " "}</p>
        </div>
      </header>

      <div ref={formeRef} data-part="forme" data-testid="gp-forme" className="gp-forme"
        role="group" aria-labelledby={promptId} aria-describedby={statusId} tabIndex={open ? 0 : -1}
        data-focus-visible={focusVisible ? "true" : "false"} data-overflow={layout?.overflow ? "true" : "false"}
        onKeyDown={onFormeKeyDown}
        onFocus={() => setFocusVisible(focusFrom.current === "keyboard")}
        onBlur={() => { setFocusVisible(false); focusFrom.current = "keyboard"; }}>
        <span aria-hidden className="gp-bezel" />
        <span aria-hidden className="gp-corner" data-at="tl" /><span aria-hidden className="gp-corner" data-at="tr" />
        <span aria-hidden className="gp-corner" data-at="bl" /><span aria-hidden className="gp-corner" data-at="br" />
        <div ref={bedRef} className="gp-bed" data-testid="gp-bed">
          {layout && bedBox ? (
            <div className="gp-block" data-testid="gp-block" data-rows={layout.rows}
              style={{
                width: layout.width, height: layout.height,
                transform: `translate(${Math.round((bedBox.width - layout.width) / 2)}px, ${Math.round((bedBox.height - layout.height) / 2)}px)`,
                ["--gp-cell" as string]: `${layout.cell}px`,
              }}>
              {layout.items.map((item) => {
                if (item.kind === "mark") {
                  return (
                    <span key={`m${item.x}-${item.y}`} className="gp-mark" data-testid="gp-mark" aria-hidden
                      style={{ transform: `translate(${item.x}px, ${item.y}px)`, width: item.w }}>{item.text}</span>
                  );
                }
                if (item.kind === "break") {
                  return <span key={`b${item.x}-${item.y}`} className="gp-break" data-testid="gp-break" aria-hidden style={{ transform: `translate(${item.x}px, ${item.y}px)`, width: item.w }} />;
                }
                const i = item.index;
                const engraved = ledger.engraved[i];
                const set = engraved === null ? value[i] ?? null : null;
                const state = engraved !== null ? "engraved" : set ? "set" : "empty";
                const origin = engraved !== null ? (soundedGlyphs.has(engraved) ? "sounded" : "given") : undefined;
                const fresh = engraved !== null && lastSounding !== null && lastSounding.glyph === engraved && origin === "sounded";
                const freshIndex = fresh ? freshOrder++ : undefined;
                const result = revealed && reveal ? reveal.results[i] : undefined;
                const resolved = revealed && reveal ? (plan.instant || inkReached(progress, item.x + item.w / 2, layout.width)) : false;
                const trueGlyph = resolved && reveal ? reveal.glyphs[i] : null;
                const wrongGlyph = resolved && reveal && result === "wrong" ? reveal.locked[i] : null;
                const shown = engraved ?? (resolved ? trueGlyph : set) ?? set;
                return (
                  <button key={`g${i}`} type="button" className="gp-cell" data-testid={`gp-cell-${i}`}
                    data-state={state} data-origin={origin} data-cursor={open && cursor === i ? "true" : "false"}
                    data-fresh={fresh ? "true" : undefined} data-result={resolved ? result : undefined}
                    tabIndex={-1} aria-current={open && cursor === i ? "true" : undefined}
                    aria-label={`Socket ${i + 1} of ${n}: ${engraved ? `${engraved}, engraved` : set ? set : "blank"}`}
                    style={{ transform: `translate(${item.x}px, ${item.y}px)`, ["--gp-fresh" as string]: freshIndex ?? 0 }}
                    onPointerDown={selectSocket(i)}>
                    <span className="gp-cell-face" data-testid={`gp-face-${i}`}>{shown ?? ""}</span>
                    {wrongGlyph ? <span className="gp-cell-wrong" aria-hidden>{wrongGlyph}</span> : null}
                  </button>
                );
              })}
              <span aria-hidden className="gp-ink" data-on={stage === "ink" ? "true" : "false"}
                style={{ transform: `translateX(${Math.round(progress * (layout.width + 24)) - 12}px)` }} />
            </div>
          ) : null}
        </div>
        {/* The engraved plaque under the bed: the sounding record while open, the answer once revealed. */}
        <div data-part="plaque" data-testid="gp-plaque" className="gp-plaque">
          <div className="gp-plaque-layer gp-plaque-live" data-testid="gp-plaque-live" data-shown={verdictOn ? "false" : "true"} aria-hidden={verdictOn || undefined}>
            <span className="gp-plaque-label">Soundings</span>
            <span className="gp-plaque-value" data-testid="gp-sounding-record">{soundingRecord}</span>
          </div>
          <div className="gp-plaque-layer gp-plaque-proof" data-part="proof" data-testid="gp-proof" data-shown={verdictOn ? "true" : "false"} aria-hidden={!verdictOn || undefined}>
            <span className="gp-plaque-answer" data-testid="gp-answer">{verdictOn ? reveal?.answerText : ""}</span>
            <span className="gp-plaque-score" data-testid="gp-score">
              {verdictOn ? <>{reveal?.scoreText}{reveal?.note ? <> · {reveal.note}</> : null}</> : ""}
            </span>
          </div>
        </div>
      </div>

      <div data-part="drum" data-testid="gp-drum" className="gp-drum">
        <button type="button" className="gp-btn gp-drum-step" data-testid="gp-drum-prev" aria-label="Turn the drum back"
          onClick={() => setDrumIndex((i) => clampDrum(i - 1, alphabet))} disabled={!open}>‹</button>
        <div ref={drumWinRef} className="gp-drum-window" data-testid="gp-drum-window" role="listbox" aria-label="Glyph drum"
          aria-activedescendant={`${drumId}-${clampDrum(drumPos, alphabet)}`} aria-disabled={!open || undefined}
          tabIndex={open ? 0 : -1} data-dragging={drumFloat !== null ? "true" : "false"}
          onKeyDown={onDrumKeyDown}
          onPointerDown={onDrumPointerDown} onPointerMove={onDrumPointerMove}
          onPointerUp={(e) => endDrumPointer(e, true)} onPointerCancel={(e) => endDrumPointer(e, false)}>
          <div className="gp-drum-band" style={{ transform: `translateX(${drumShift}px)` }}>
            {tiles.map((t, i) => {
              const isClear = t === CLEAR_TILE;
              const gs = isClear ? "free" : glyphState(t, ledger.soundings, pending);
              return (
                <span key={t} id={`${drumId}-${i}`} role="option" aria-selected={clampDrum(drumPos, alphabet) === i}
                  aria-label={isClear ? "Clear the socket" : gs === "sounded" ? `${t}, sounded and placed` : gs === "tarnished" ? `${t}, sounded, not in this answer` : t}
                  className="gp-tile" data-tile={t} data-testid={`gp-tile-${isClear ? "clear" : t}`} data-kind={isClear ? "clear" : "glyph"}
                  data-state={gs} data-centred={centredTile === t ? "true" : "false"}>
                  <span aria-hidden className="gp-tile-face">{t}</span>
                </span>
              );
            })}
          </div>
          <span aria-hidden className="gp-drum-pointer" />
        </div>
        <button type="button" className="gp-btn gp-drum-step" data-testid="gp-drum-next" aria-label="Turn the drum forward"
          onClick={() => setDrumIndex((i) => clampDrum(i + 1, alphabet))} disabled={!open}>›</button>
      </div>

      <div data-part="plate" data-testid="gp-plate" className="gp-plate">
        <button type="button" className="gp-btn gp-sound" data-testid="gp-sound" aria-pressed={armed}
          onClick={toggleArmed} disabled={!open || left <= 0 || pending !== null}
          aria-label={`Sound a glyph: ${left} of ${content.soundingsAllowed} left`}>
          <AudioLines aria-hidden /> <span>Sound</span>
        </button>
        <span className="gp-charges" data-testid="gp-charges" aria-hidden>
          {Array.from({ length: content.soundingsAllowed }, (_, i) => (
            <i key={i} data-on={i < left ? "true" : "false"} />
          ))}
        </span>
        <span className="gp-fill" data-testid="gp-fill" aria-hidden>{setCount}<small>/{openCount}</small></span>
        <div className="gp-lockwrap" data-part="lock" data-testid="gp-lockwrap">
          <button type="button" className="gp-lock" data-testid="gp-lock" data-shown={open ? "true" : "false"}
            onClick={lock} disabled={!open} aria-describedby={statusId}>
            <Lock aria-hidden /> {blanks === 0 ? "Lock answer" : `Lock · ${blanks} blank`}
          </button>
          <span className="gp-lockstate" data-testid="gp-lockstate" data-shown={open ? "false" : "true"}
            data-verdict={verdictOn ? reveal?.verdict : undefined} aria-hidden={open || undefined}>
            {verdictOn && reveal ? verdictWord(reveal) : <><Lock aria-hidden className="!size-3.5" /> Locked <span aria-hidden className="gp-dots"><i /><i /><i /></span></>}
          </span>
        </div>
      </div>

      <p data-part="status" data-testid="gp-status" id={statusId} className="gp-status">{statusLine}</p>
      <p role="status" aria-live="polite" data-testid="gp-live" className="sr-only">{resultText || announcement}</p>
    </div>
  );
}
