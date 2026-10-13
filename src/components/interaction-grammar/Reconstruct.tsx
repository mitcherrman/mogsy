/**
 * MIG — RECONSTRUCT. Unordered multiset assembly.
 *
 * One target, 2–4 sockets, a tray of choices. The player fills EVERY socket and
 * locks; the host grades the placement as a multiset and hands back a reveal.
 *
 *   OPEN → add choices (tap, drag or keyboard) → LOCK → (caller-owned) → REVEAL
 *
 * CONTENT-NEUTRAL. It knows labels, tokens, art and placement limits. It does
 * not know what a part is, what the target is made of, or what any figure means.
 *
 * NO LEAK, NO GRADING. `content` (ReconstructPublic) has no field that could
 * hold the answer. Correctness, the settled sockets and every evidence figure
 * arrive only through `reveal`; the primitive DISPLAYS them and never imports
 * `gradeAssembly` (a source test pins that). Socket position carries no
 * meaning, here or in the grader, so no socket is numbered on screen.
 *
 * STATE OWNERSHIP
 *   host      `value` (the board), `phase`, `reveal`, grading, what happens after
 *             the reveal. `onChange` is the only way the board changes.
 *   primitive the pointer drag in flight, the roving focus stops, the
 *             announcement text and the reveal's stage clock. All ephemeral UI
 *             state: none of it is graded or submitted.
 *
 * INPUT (R2: no select-then-place, no armed state). Every path calls ONE
 * placement, `placeFromTray`, so every path yields the same `{placement}`:
 *   * tap / click a tray choice: one copy goes into the next empty socket;
 *     tapping again adds another copy, within the limit;
 *   * drag a tray choice (pointer events: mouse, touch, pen), starting on the
 *     card itself: the drop is FORGIVING — anywhere in the assembly region
 *     (the socket row grown by `DROP_SLACK`) snaps to the nearest socket, and
 *     a drop on a filled socket deliberately replaces its part;
 *   * keyboard: Enter / Space on a choice adds it; Delete / Backspace (or
 *     Enter) on a filled socket removes its part.
 * Tapping a filled socket removes its part. Drag is never required.
 *
 * KEYBOARD. Two tab stops (tray, sockets) plus Lock. Arrows (and Home/End) move
 * inside a group. Focus never moves on its own: every control keeps its
 * element across a placement. The one exception is the Lock itself, which
 * unmounts the pressed button: a lock made from the board lands focus on the
 * prompt heading instead of dropping it to <body> (R3A).
 *
 * QUANTITY. A choice shows how many copies are PLACED (×1, ×2…) and nothing
 * else: the reuse limit is enforced, never drawn, so nothing on screen says how
 * many copies the answer needs.
 *
 * SCREEN READER. One polite `role="status"` region, written only on discrete
 * actions (add, replace, remove, refuse, lock) and once for the whole reveal.
 *
 * REVEAL. Marks → settle → evidence on one bounded clock
 * (`lib/interaction-grammar/reconstructReveal`, ≤ 1.5 s). Reduced motion (OS or
 * in-app) skips the clock: the first reveal frame is the settled frame. The
 * evidence is a BREAKDOWN the host words entirely: one block per canonical
 * part (art, name, figure, what it is made of, the joining term) and a closing
 * equation. `onRevealComplete` tells the host when the choreography has ended.
 *
 * R3C — A TIMED-OUT REVEAL (`reveal.timedOut`). The player locked nothing, so
 * no socket gets a mark or a "your pick": the sockets stay empty through the
 * marks stage, the answer settles in on the same clock (tagged "Answer"), the
 * breakdown follows, and the verdict line says TIMED OUT. Nothing on the board
 * is drawn as a choice the player made.
 *
 * R3A — THE BREAKDOWN IS ONE CONNECTED CALCULATION. One LEDGER ROW per part
 * (name, quantity pill, figure on the right; a built part adds one indented
 * line of what it is made of and its combining term), then the equation
 * directly beneath, as a card of the same surface. Rows and equation take the
 * tray's own card tokens (`SURFACE`), surface and ink chosen together, so the
 * revealed board is the unanswered board's card family in both app themes.
 * The list keeps its natural height inside the fixed region (the equation
 * follows the last row, not the region's floor); only a build too tall for
 * the region scrolls, inside the list, with the equation pinned.
 *
 * FIXED GEOMETRY (R1, re-measured per animation frame in R2). Every phase draws
 * the same boxes at the same size: the target header, the sockets with their
 * two-line labels, the status line, and ONE stage region of fixed height that
 * holds the tray + Lock layer and, at the evidence stage, the breakdown layer
 * stacked over it (absolute, crossfaded on opacity). Nothing appears or
 * disappears in flow; the drag ghost is a fixed-position portal.
 *
 * PRESENTATION. Stable hooks for a host scene to restyle: `data-mig-primitive`,
 * `data-phase`, `data-reveal-stage` on the root, and `data-part` (`target`,
 * `sockets`, `slot`, `socket`, `stage-region`, `tray`, `option`, `usage`,
 * `lock`, `pick`, `evidence`, `breakdown-part`, `equation`) with
 * `data-state` / `data-mark` on the parts. There are no styling props.
 */
import {
  useEffect, useId, useLayoutEffect, useMemo, useRef, useState,
  type KeyboardEvent, type MutableRefObject, type PointerEvent as ReactPointerEvent, type Ref, type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { Check, Lock, Timer, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useReducedMotionPreference } from "@/hooks/useReducedMotionPreference";
import type {
  AssemblyOption, InteractionPhase, ReconstructBreakdownPart, ReconstructPublic,
  ReconstructResponse, ReconstructReveal, ReconstructValue,
} from "@/lib/interaction-grammar/types";
import {
  assertReconstructContent, clearSlot, countUses, filledSummary, isBoardFull,
  normalizePlacement, numberWord, placeFromTray, snapToSocket, type SnapRect,
} from "@/lib/interaction-grammar/reconstruct";
import {
  planReveal, RECONSTRUCT_TIMING, settleDelayMs, showsEvidence, showsSettled, stageAt,
  type ReconstructPlan, type ReconstructStage,
} from "@/lib/interaction-grammar/reconstructReveal";
import { SubjectArt, SuspenseDots } from "./shared";

export interface ReconstructProps {
  content: ReconstructPublic;
  phase: InteractionPhase;
  /** The pending board, owned by the caller: one token or null per socket. */
  value: ReconstructValue;
  onChange: (next: (string | null)[]) => void;
  /** Commit. Fires only when every socket is filled; carries identity, never correctness. */
  onLock: (response: ReconstructResponse) => void;
  /** Null until the caller's authority resolves. */
  reveal?: ReconstructReveal | null;
  /** Fires once per reveal when its choreography has finished (at once under reduced motion). */
  onRevealComplete?: () => void;
  /** The prompt heading (focusable, `tabIndex=-1`), so a host can move focus to it. */
  promptRef?: Ref<HTMLHeadingElement>;
}

/** Tray columns. Up / Down arrows move by this many options. */
const TRAY_COLS = 3;
/** Tray cell height and gap (px); a tall stage (>= 800px) has larger cells. */
const TRAY_CELL_PX = 92;
const TRAY_CELL_TALL_PX = 108;
const TRAY_GAP_PX = 8;
/** The tray rows + gap + the 48px Lock footer. */
const trayAndFooter = (rows: number, cell: number) => rows * cell + (rows - 1) * TRAY_GAP_PX + 8 + 48;
/**
 * The stage region's FIXED height (px), the same in every phase of a given
 * viewport: the tray + the Lock footer on a wide stage (248, or 280 when the
 * stage is tall); a phone (< 640px wide) reserves 288 so the breakdown's 2×2
 * blocks fit. Each is a constant of the VIEWPORT, never of the phase.
 */
const REGION_WIDE_PX = trayAndFooter(2, TRAY_CELL_PX);
const REGION_WIDE_TALL_PX = trayAndFooter(2, TRAY_CELL_TALL_PX);
const REGION_NARROW_PX = 288;
/**
 * R2 CONTINUITY — the SHORT-DESKTOP tier (>= 1024px wide, < 720px tall).
 *
 * From `lg` the arena caps the stage to the height the viewport leaves and
 * clips it (`.ranked-panel` is overflow: hidden): a viewport must YIELD, never
 * overflow. R1's board (478px) overflowed the body a 650px-tall window leaves
 * (424px), and `overflow: hidden` still scrolls programmatically — so the
 * click on Lock focused a half-clipped button, Chrome scrolled the stage to
 * show it, and the whole board jumped 16px (measured on R1 and on R2 before
 * this tier; the owner's live report). Fixed geometry could not see it: no
 * box changed size, a clipped ancestor scrolled. The cure is to FIT: below
 * 720px tall every box takes a compact size, constant in every phase, sized so
 * the board fits the 374px body a 600px window leaves.
 */
const TRAY_CELL_COMPACT_PX = 64;
const REGION_COMPACT_PX = 2 * TRAY_CELL_COMPACT_PX + TRAY_GAP_PX + 8 + 44;
/** Pointer travel (px) before a press on a choice becomes a drag. */
const DRAG_THRESHOLD_PX = 6;
/** How far beyond the socket row a drop still lands (px). */
const DROP_SLACK = { x: 28, y: 64 };

/**
 * ONE surface, ONE ink, for every card the primitive draws (tray choices,
 * sockets, breakdown rows, the closing equation).
 *
 * R3A — the owner's "dark-gray cards with dark-brown text". The breakdown's
 * cards painted `dark:bg-card/60` (a theme token: navy-gray in the dark app
 * theme) while every word inside them took `--ranked-ink` (the parchment's
 * fixed dark brown). Two token systems on one box: 1.5–3.0:1 in the dark theme
 * (measured), fine in the light one, which is why it was only ever seen live.
 * The tray cards beside it used the theme pair (`dark:bg-card` +
 * `dark:text-foreground`) correctly, so the unanswered and revealed boards
 * disagreed. Now a card's surface and its ink are chosen TOGETHER, here, and
 * the revealed rows are the same card as the tray's.
 */
const CARD_FILL = "bg-[#f4e9cc] text-[#2c2417] dark:bg-card dark:text-foreground";
const SURFACE = `border-[#7a6236]/55 ${CARD_FILL}`;
/** Ink for text drawn ON a `SURFACE` card: strong, and the muted step. */
const CARD_INK = "text-[#2c2417] dark:text-foreground";
const CARD_MUTED = "text-[#5a4a2e] dark:text-foreground/75";
/**
 * Focus: a dark ring (13:1 on the vellum) with a parchment gap, visible against
 * the always-light folio in both app themes. The theme's `ring-primary` blue is
 * 2.5:1 (light theme) / 2.1:1 (dark theme) on #f4e9cc, below the 3:1 non-text
 * floor.
 */
const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-[#2a2110] focus-visible:ring-offset-2 focus-visible:ring-offset-[#f4e9cc]";
/** Text drawn straight on the folio (target, prompt, labels, status). */
const INK = "text-[var(--ranked-ink,#2c2417)]";
const MUTED = "text-[var(--ranked-ink-muted,#5a4a2e)]";
/**
 * Correctness, as fixed values rather than the theme's `emerald-500` (2.1:1 on
 * #f4e9cc) and `destructive` (4.1:1 in the light theme, 3.1:1 in the dark one):
 * these are 4.5:1 and 5.4:1, and every mark also carries a glyph and a word.
 */
const RIGHT_BG = "bg-[#047857]";
const WRONG_BG = "bg-[#b91c1c]";
const RIGHT_RING = "ring-[#047857]";
const WRONG_RING = "ring-[#b91c1c]";

// ------------------------------------------------------------------ reveal clock

/**
 * The reveal's stage, driven by `plan`. The stage is DERIVED while a reveal's
 * key is new (so a reduced-motion reveal never paints a frame of the unsettled
 * board first), then advanced by one timer per boundary. A new key restarts it;
 * a re-render with an equal reveal does not.
 */
function useRevealStage(plan: ReconstructPlan, active: boolean, key: string): ReconstructStage {
  const [run, setRun] = useState<{ key: string; stage: ReconstructStage } | null>(null);
  useEffect(() => {
    if (!active) { setRun(null); return; }
    setRun({ key, stage: stageAt(plan, 0) });
    const timers = plan.stages.map(({ end }) =>
      window.setTimeout(() => setRun({ key, stage: stageAt(plan, end) }), end));
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [active, plan, key]);
  return run && run.key === key ? run.stage : stageAt(plan, 0);
}

/**
 * True while `ref`'s box scrolls (its content is taller than it). Used only to
 * make the breakdown list a keyboard-reachable scroller in the one case it can
 * scroll: a four-part build on the shortest phones. Reads layout, writes
 * nothing to it.
 */
function useScrolls(ref: RefObject<HTMLElement>, active: boolean): boolean {
  const [scrolls, setScrolls] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!active || !el) { setScrolls(false); return; }
    const measure = () => setScrolls(el.scrollHeight > el.clientHeight + 1);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, active]);
  return scrolls;
}

// ----------------------------------------------------------------------- pieces

function MarkBadge({ right, animate }: { right: boolean; animate: boolean }) {
  return (
    <span aria-hidden data-part="mark" data-mark={right ? "right" : "wrong"}
      style={animate ? { animationDuration: `${RECONSTRUCT_TIMING.marksTween}ms` } : undefined}
      className={`absolute -right-1.5 -top-1.5 z-10 flex h-6 w-6 items-center justify-center rounded-full border-2 border-[#f4e9cc] text-white ${
        right ? RIGHT_BG : WRONG_BG} ${
        animate ? "animate-in fade-in zoom-in-50 fill-mode-both" : ""}`}>
      {right ? <Check className="!size-3.5" /> : <X className="!size-3.5" />}
    </span>
  );
}

/**
 * The player's wrong pick, kept on its socket as a corner badge once the
 * missing part has settled in. Absolute: it occupies no layout, so its
 * arrival moves nothing (reserved invisible before the settle stage).
 */
function PickBadge({ option, slot, shown, animate, delay }: {
  option: AssemblyOption | undefined; slot: number; shown: boolean; animate: boolean; delay: number;
}) {
  return (
    <span aria-hidden data-part="pick" data-testid={`reconstruct-pick-${slot}`} data-shown={shown ? "true" : "false"}
      title={option ? `Your pick: ${option.label}` : undefined}
      style={shown && animate
        ? { animationDuration: `${RECONSTRUCT_TIMING.settleTween}ms`, animationDelay: `${delay}ms` } : undefined}
      className={`absolute -left-2 -top-2 z-10 h-7 w-7 overflow-hidden rounded-md border-2 border-[#b91c1c] bg-[#f4e9cc] shadow ${
        shown ? "" : "invisible"} ${shown && animate ? "animate-in fade-in zoom-in-150 fill-mode-both" : ""}`}>
      <SubjectArt media={option?.media} monogram={(option?.label ?? "?").slice(0, 1)}
        className="h-full w-full opacity-80 [&_span]:!text-[10px]" />
      <X className="absolute inset-0 m-auto !size-5 text-[#b91c1c] drop-shadow" />
      <span className="sr-only">{`Your pick: ${option?.label ?? ""}`}</span>
    </span>
  );
}

/**
 * One canonical part of the breakdown, drawn as a LEDGER ROW (R3A).
 *
 * R2 laid the parts out as side-by-side cards, which on a 4-part build left
 * each ~130px wide: names, captions and sub-part names were ellipsised (9
 * truncated spans at 1440x900, measured) while a basic part used a card as tall
 * as a built one. A row spends the width the board has: the part's name and
 * figure on one line (the figure right-aligned, so a column of figures reads
 * as a sum), and, only when the part is itself built, one indented line of
 * what it is made of, ending in its combining term. Hierarchy is size, weight
 * and the guide rule: the part is 14px bold beside 36px art; its sub-parts are
 * 12px beside 16px art, under a rule.
 *
 * Every string is the host's and every figure is a server string; the
 * `data-testid` hooks are unchanged from R2.
 */
function BreakdownBlock({ part, option }: {
  part: ReconstructBreakdownPart; option: AssemblyOption | undefined;
}) {
  const label = option?.label ?? "";
  const many = part.quantity > 1;
  const built = part.children.length > 0 || Boolean(part.joinDisplay);
  return (
    <li data-part="breakdown-part" data-testid={`reconstruct-evidence-${part.token}`}
      className={`relative flex min-w-0 list-none items-start gap-2 rounded-lg border p-1 ${SURFACE} lg:[@media(max-height:719px)]:p-0.5`}>
      <SubjectArt media={option?.media} monogram={label.slice(0, 1)}
        className="h-7 w-7 shrink-0 rounded-md ring-1 ring-[#7a6236]/50 sm:h-8 sm:w-8 sm:[@media(min-height:800px)]:h-9 sm:[@media(min-height:800px)]:w-9 lg:[@media(max-height:719px)]:h-6 lg:[@media(max-height:719px)]:w-6 [&_span]:!text-xs" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0">
          {/* Whole words only: a name wraps, it is never cut. */}
          <span title={label} className={`min-w-0 break-normal text-[13px] font-bold leading-tight sm:text-[14px] sm:[@media(min-height:800px)]:text-[15px] ${CARD_INK}`}>{label}</span>
          {many && (
            <span data-part="quantity" data-testid={`reconstruct-evidence-qty-${part.token}`}
              className="shrink-0 rounded-full bg-[#2a2110] px-1.5 text-[12px] font-black tabular-nums leading-4 text-[#f6e6bb]">
              {`×${part.quantity}`}
            </span>
          )}
          {part.caption && (
            <span data-testid={`reconstruct-evidence-caption-${part.token}`}
              className={`text-[12px] font-semibold uppercase leading-tight tracking-[0.06em] ${CARD_MUTED}`}>
              {part.caption}
            </span>
          )}
          {part.annotation && (
            <span data-part="annotation" data-testid={`reconstruct-evidence-note-${part.token}`}
              className="shrink-0 rounded-sm bg-[#b91c1c]/10 px-1 text-[11px] font-bold tabular-nums leading-4 text-[#9b1c1c] dark:bg-[#fca5a5]/15 dark:text-[#fca5a5]">
              {part.annotation}
            </span>
          )}
          {part.valueDisplay !== null && (
            <span data-testid={`reconstruct-evidence-value-${part.token}`}
              className={`ml-auto shrink-0 text-[13px] font-bold tabular-nums leading-tight sm:text-[14px] ${CARD_INK}`}>
              {many && part.lineTotalDisplay ? `${part.valueDisplay} each · ${part.lineTotalDisplay}` : part.valueDisplay}
            </span>
          )}
        </div>
        {built && (
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0 border-l-2 border-[#7a6236]/50 pl-2">
            {part.children.length > 0 && (
              /* `contents`: the sub-parts and the combining term wrap as ONE run of
                 chips (the term shares the last line); `role=list` keeps the
                 semantics where `display: contents` would drop them. */
              <ul data-part="children" role="list" data-testid={`reconstruct-children-${part.token}`}
                className="m-0 contents list-none p-0">
                {part.children.map((k, i) => (
                  <li key={`${k.label}:${i}`} data-part="child"
                    className={`flex min-w-0 list-none items-center gap-1.5 text-[12px] leading-[18px] lg:[@media(max-height:719px)]:leading-4 ${CARD_INK}`}>
                    <SubjectArt media={k.media} monogram={k.label.slice(0, 1)}
                      className="h-4 w-4 shrink-0 rounded-sm [&_span]:!text-[8px]" />
                    <span title={k.label} className="font-semibold">{k.label}</span>
                    {k.quantity > 1 && <span className="shrink-0 font-black tabular-nums">{`×${k.quantity}`}</span>}
                    {k.valueDisplay && <span className={`shrink-0 tabular-nums ${CARD_MUTED}`}>{k.valueDisplay}</span>}
                  </li>
                ))}
              </ul>
            )}
            {part.joinDisplay && (
              <span data-testid={`reconstruct-evidence-join-${part.token}`}
                className={`text-[12px] font-semibold leading-[18px] tabular-nums lg:[@media(max-height:719px)]:leading-4 ${CARD_MUTED}`}>
                {part.joinDisplay}
              </span>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

// -------------------------------------------------------------------- component

interface DragState {
  token: string;
  pointerId: number;
  x0: number;
  y0: number;
  x: number;
  y: number;
  active: boolean;
  target: number | null;
}

export function Reconstruct({
  content, phase, value, onChange, onLock, reveal = null, onRevealComplete, promptRef,
}: ReconstructProps) {
  assertReconstructContent(content);
  const reduced = useReducedMotionPreference();
  const animate = !reduced;
  const promptId = useId();
  const hintId = useId();
  const trayHintId = useId();
  const lockHintId = useId();
  const open = phase === "open";
  const total = content.slotCount;
  const byToken = useMemo(() => new Map(content.options.map((o) => [o.token, o])), [content.options]);
  const labelOf = (token: string | null) => (token !== null ? byToken.get(token)?.label ?? "" : "");

  const board = normalizePlacement(content, value);
  const uses = countUses(board);
  const filled = board.filter((t) => t !== null).length;
  const full = isBoardFull(board);

  // ---- ephemeral UI state (never graded, never submitted)
  const [announcement, setAnnouncement] = useState("");
  const [trayStop, setTrayStop] = useState<string | null>(null);
  const [slotStop, setSlotStop] = useState(0);
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const suppressClick = useRef(false);
  const trayRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const slotRefs = useRef<Map<number, HTMLElement>>(new Map());

  // ---- reveal
  const revealed = phase === "revealed" && reveal !== null;
  const hasEvidence = Boolean(reveal?.evidence && reveal.evidence.parts.length > 0);
  const timedOut = Boolean(reveal?.timedOut);
  // A timed-out board has no picks to mark, but its answer still settles in.
  const anyWrong = timedOut || Boolean(reveal?.slotCorrect.some((c) => c === false));
  const plan = useMemo(() => planReveal({ reduced, anyWrong, hasEvidence }), [reduced, anyWrong, hasEvidence]);
  const revealKey = revealed && reveal
    ? JSON.stringify([reveal.placement, reveal.settled, reveal.slotCorrect]) : "";
  const stage = useRevealStage(plan, revealed, revealKey);
  const settledOn = revealed && showsSettled(stage);
  const evidenceOn = revealed && showsEvidence(stage);

  const completedFor = useRef("");
  useEffect(() => {
    if (!revealed) { completedFor.current = ""; return; }
    if (stage === "done" && completedFor.current !== revealKey) {
      completedFor.current = revealKey;
      onRevealComplete?.();
    }
  }, [revealed, stage, revealKey, onRevealComplete]);

  // A drag never survives the board closing.
  useEffect(() => { if (!open) { dragRef.current = null; setDrag(null); } }, [open]);

  // ---- actions
  const say = (text: string) => setAnnouncement(text);
  const where = (slot: number) => `socket ${slot + 1} of ${total}`;

  /** THE placement: every input path ends here (see `placeFromTray`). */
  const place = (token: string, slot?: number) => {
    if (!open) return;
    const out = placeFromTray(content, board, token, slot);
    const label = labelOf(token);
    if (out.kind === "full") { say(`All ${numberWord(total)} parts are filled. Remove one to change the build.`); return; }
    if (out.kind === "same") { say(`${label} is already there.`); return; }
    if (out.kind === "at-limit") { say(`${label} can't be added again. Remove one first.`); return; }
    if (out.kind === "invalid") return;
    onChange(out.next);
    const copies = countUses(out.next).get(token) ?? 0;
    const count = out.next.filter((t) => t !== null).length;
    say(`${label} added${copies > 1 ? `, ${numberWord(copies)} placed` : ""}${
      out.kind === "replaced" ? `, replacing ${labelOf(out.previous)}` : ""}. ${filledSummary(count, total)}`);
  };

  const remove = (slot: number) => {
    if (!open) return;
    const { next, removed } = clearSlot(board, slot);
    if (removed === null) { say("That socket is empty. Choose a part from the tray to add it."); return; }
    onChange(next);
    say(`${labelOf(removed)} removed. ${filledSummary(next.filter((t) => t !== null).length, total)}`);
  };

  // Locking removes the very button that was pressed. Without a landing the
  // browser drops focus to <body>, and a keyboard or screen-reader user starts
  // again from the top of the page; so a lock made FROM INSIDE the board hands
  // focus to its prompt heading (already `tabIndex=-1`), once the board closes.
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const setHeading = (el: HTMLHeadingElement | null) => {
    headingRef.current = el;
    if (typeof promptRef === "function") promptRef(el);
    else if (promptRef) (promptRef as MutableRefObject<HTMLHeadingElement | null>).current = el;
  };
  const rootRef = useRef<HTMLDivElement>(null);
  const landFocus = useRef(false);
  useEffect(() => {
    if (open || !landFocus.current) return;
    landFocus.current = false;
    const a = document.activeElement;
    if (!a || a === document.body) headingRef.current?.focus({ preventScroll: true });
  }, [open]);

  // One lock per activation burst. `open` is a prop, so two activations in the
  // same task (a stuck key, a script, a double tap) both read it as true before
  // the host's phase change lands; this latch lets exactly one through and is
  // released on the next microtask, so a refused lock can always be retried.
  const lockLatch = useRef(false);
  const lock = () => {
    if (!(open && full) || lockLatch.current) return;
    lockLatch.current = true;
    queueMicrotask(() => { lockLatch.current = false; });
    landFocus.current = Boolean(rootRef.current?.contains(document.activeElement));
    onLock({ placement: board as string[] });
  };

  // ---- pointer drag (mouse, touch, pen), straight from the card
  const socketRects = (): SnapRect[] => Array.from({ length: total }, (_, i) => {
    const r = slotRefs.current.get(i)?.getBoundingClientRect();
    return r ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
      : { left: NaN, top: NaN, right: NaN, bottom: NaN };
  });
  const endDrag = () => { dragRef.current = null; setDrag(null); };

  const onOptionPointerDown = (token: string) => (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!open || (e.pointerType === "mouse" && e.button !== 0)) return;
    suppressClick.current = false;
    dragRef.current = { token, pointerId: e.pointerId, x0: e.clientX, y0: e.clientY,
      x: e.clientX, y: e.clientY, active: false, target: null };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* jsdom / released */ }
  };
  const onOptionPointerMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const moved = Math.hypot(e.clientX - d.x0, e.clientY - d.y0);
    if (!d.active && moved < DRAG_THRESHOLD_PX) return;
    const next: DragState = { ...d, x: e.clientX, y: e.clientY, active: true,
      target: snapToSocket({ x: e.clientX, y: e.clientY }, socketRects(), DROP_SLACK) };
    dragRef.current = next;
    setDrag(next);
  };
  const onOptionPointerUp = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    endDrag();
    if (!d.active) return;           // a press without travel: the click adds it
    // The click that follows a drag (same task) is not a tap; never let the
    // flag outlive it and swallow a later, genuine one.
    suppressClick.current = true;
    window.setTimeout(() => { suppressClick.current = false; }, 0);
    const target = snapToSocket({ x: e.clientX, y: e.clientY }, socketRects(), DROP_SLACK);
    if (target === null) { say(`${labelOf(d.token)} not added.`); return; }
    place(d.token, target);
  };

  const onOptionClick = (token: string) => {
    if (suppressClick.current) { suppressClick.current = false; return; }
    place(token);
  };

  // ---- keyboard (roving focus inside a group; Enter/Space are the button's own click)
  const focusOption = (token: string | undefined) => { if (token) trayRefs.current.get(token)?.focus(); };
  const optionKeys = (index: number) => (e: KeyboardEvent<HTMLButtonElement>) => {
    const last = content.options.length - 1;
    const to = e.key === "ArrowRight" ? index + 1
      : e.key === "ArrowLeft" ? index - 1
      : e.key === "ArrowDown" ? index + TRAY_COLS
      : e.key === "ArrowUp" ? index - TRAY_COLS
      : e.key === "Home" ? 0
      : e.key === "End" ? last : null;
    if (to === null) return;
    e.preventDefault();
    if (to >= 0 && to <= last) focusOption(content.options[to].token);
  };
  const socketKeys = (slot: number) => (e: KeyboardEvent<HTMLButtonElement>) => {
    const to = e.key === "ArrowRight" || e.key === "ArrowDown" ? slot + 1
      : e.key === "ArrowLeft" || e.key === "ArrowUp" ? slot - 1
      : e.key === "Home" ? 0
      : e.key === "End" ? total - 1 : null;
    if (to !== null) {
      e.preventDefault();
      if (to >= 0 && to < total) slotRefs.current.get(to)?.focus();
    } else if ((e.key === "Delete" || e.key === "Backspace") && board[slot] !== null) {
      e.preventDefault();
      remove(slot);
    }
  };

  // ---- derived display
  const settledTokens = reveal?.settled ?? [];
  const placementTokens = reveal?.placement ?? [];
  const shown = (i: number): string | null => {
    if (revealed && reveal) return (settledOn ? settledTokens[i] : placementTokens[i]) ?? null;
    return board[i] ?? null;
  };
  const rightCount = reveal ? reveal.slotCorrect.filter((c) => c).length : 0;
  const verdict = !revealed || !reveal ? ""
    : timedOut ? "Timed out"
    : reveal.isCorrect === true ? "Every part right"
    : reveal.slotCorrect.length > 0 ? `${rightCount} of ${reveal.slotCorrect.length} parts right`
    : "";

  const resultText = revealed && reveal ? revealSummary(reveal, byToken, total, verdict)
    : phase === "locked" ? "Build locked. Waiting for the reveal." : "";

  const wrongOrder = revealed && reveal
    ? reveal.slotCorrect.map((c, i) => (c === false ? i : -1)).filter((i) => i >= 0) : [];
  // The breakdown takes the stage region over IN PLACE at the evidence stage.
  const evidenceInRegion = revealed && hasEvidence && evidenceOn;
  // What each wrong pick WAS, stated from the host's own lists: a pick the
  // host's parts name is a copy too many; any other is not in the build.
  const partTokens = new Set((reveal?.evidence?.parts ?? []).map((p) => p.token));
  const wrongNotes = revealed && reveal && timedOut ? ["No build locked in. This was the answer."]
    : revealed && reveal && settledOn
    ? distinct(wrongOrder.map((i) => placementTokens[i]).filter((t): t is string => !!t)).map((t) =>
      (partTokens.has(t) ? `One ${labelOf(t)} too many` : `${labelOf(t)} isn't part of it`))
    : [];
  const statusLine = revealed && reveal ? verdict
    : phase === "locked" ? "Locked in. Waiting for the reveal."
    : full ? `All ${numberWord(total)} parts filled. Lock in when you're sure.`
    : `Tap or drag parts in. Order doesn't matter. ${sentenceCase(numberWord(filled))} of ${numberWord(total)} filled.`;

  const trayStopToken = trayStop && byToken.has(trayStop) ? trayStop : content.options[0].token;
  const trayRows = Math.ceil(content.options.length / TRAY_COLS);
  // Two tray rows (every Ranked tray: six pieces) fit the reserved classes;
  // a host with a third row gets a fixed inline height, the same in every phase.
  const tallTray = trayRows > 2 ? trayAndFooter(trayRows, TRAY_CELL_TALL_PX) : null;
  const dragging = drag?.active ? drag : null;
  const breakdownRef = useRef<HTMLUListElement>(null);
  const breakdownScrolls = useScrolls(breakdownRef, evidenceInRegion);

  return (
    <div ref={rootRef} data-testid="mig-reconstruct" data-mig-primitive="reconstruct" data-phase={phase}
      data-reveal-stage={revealed ? stage : undefined}
      data-timed-out={revealed && timedOut ? "true" : undefined}
      data-filled={filled} data-slots={total} data-dragging={dragging ? "true" : undefined}
      onKeyDown={(e) => { if (e.key === "Escape" && dragRef.current) endDrag(); }}
      className="flex w-full flex-col gap-2">
      {/* The target leads, beside the prompt: one row of FIXED height. */}
      <header data-part="target" data-testid="reconstruct-target"
        className={`flex h-14 items-center justify-center gap-3 [@media(min-height:800px)]:h-20 lg:[@media(max-height:719px)]:h-11`}>
        <SubjectArt media={content.target.media} monogram={content.target.label.slice(0, 1)}
          className={`h-14 w-14 shrink-0 rounded-lg ring-1 ring-[#7a6236]/70 [@media(min-height:800px)]:h-20 [@media(min-height:800px)]:w-20 lg:[@media(max-height:719px)]:h-11 lg:[@media(max-height:719px)]:w-11`} />
        <div className="flex min-w-0 flex-col items-start text-left">
          <h2 id={promptId} ref={setHeading} tabIndex={-1} data-testid="reconstruct-prompt"
            className={`outline-none text-[11px] font-bold uppercase tracking-[0.18em] ${MUTED}`}>
            {content.prompt}
          </h2>
          <p className={`line-clamp-2 max-w-full break-words font-serif text-lg font-bold leading-tight sm:text-xl [@media(min-height:800px)]:text-2xl lg:[@media(max-height:719px)]:line-clamp-1 lg:[@media(max-height:719px)]:text-lg ${INK}`}>
            {content.target.label}
          </p>
        </div>
      </header>

      <div role="group" aria-label={`Build of ${content.target.label}`} data-part="sockets"
        data-testid="reconstruct-sockets"
        className={`mx-auto flex w-full items-start justify-center gap-2 pt-1 lg:[@media(max-height:719px)]:pt-0.5`}>
        {board.map((_, i) => {
          const token = shown(i);
          const option = token !== null ? byToken.get(token) : undefined;
          const mark = revealed && reveal ? reveal.slotCorrect[i] ?? null : null;
          const pickToken = revealed && reveal && mark === false ? placementTokens[i] ?? null : null;
          const pickOption = pickToken !== null ? byToken.get(pickToken) : undefined;
          // R3C: a timed-out socket was never filled by the player; once the
          // answer settles in it is the answer, never a pick.
          const missed = revealed && timedOut;
          const state = missed ? (settledOn && token !== null ? "answer" : "empty")
            : revealed
            ? (mark === false ? (settledOn ? "settled" : "wrong") : mark === true ? "correct" : "filled")
            : phase === "locked" ? (token ? "locked" : "empty")
            : token ? "filled" : "empty";
          // A replaced socket's new token enters from below (the tray); a kept one does not move.
          const entering = revealed && settledOn && (mark === false || missed) && animate;
          const wrongIndex = missed ? i : wrongOrder.indexOf(i);
          const base = sentenceCase(where(i));
          const dropHere = dragging?.target === i;
          const socketName = token === null
            ? `${base}, empty.`
            : `${base}: ${labelOf(token)}. Press to remove.`;
          const statusText = missed ? (token !== null ? "Answer. You didn't lock in a build." : "Not filled.")
            : revealed
            ? (mark === true ? "Right part."
              : mark === false ? (settledOn ? `Your pick, ${labelOf(pickToken)}, was wrong.` : "Wrong part.") : "")
            : "";
          const socketBox = `relative h-14 w-14 [@media(min-height:800px)]:h-16 [@media(min-height:800px)]:w-16 lg:[@media(max-height:719px)]:h-11 lg:[@media(max-height:719px)]:w-11 shrink-0 rounded-lg border-2 ${SURFACE} ${
            token === null ? "border-dashed" : ""} ${
            mark === true ? `ring-2 ${RIGHT_RING}` : ""} ${
            mark === false && !settledOn ? `ring-2 ${WRONG_RING}` : ""} ${
            state === "settled" || state === "answer" ? "ring-2 ring-[#7a6236]" : ""}`;
          const art = (
            <span key={`${i}:${token ?? "empty"}`}
              style={entering ? { animationDuration: `${RECONSTRUCT_TIMING.settleTween}ms`, animationDelay: `${settleDelayMs(wrongIndex)}ms` } : undefined}
              className={`absolute inset-0 flex items-center justify-center overflow-hidden rounded-[6px] ${
                entering ? "animate-in fade-in slide-in-from-bottom-6 fill-mode-both" : ""}`}>
              {token !== null && (
                <SubjectArt media={option?.media} monogram={(option?.label ?? "?").slice(0, 1)} className="h-full w-full" />
              )}
            </span>
          );
          const setSlotRef = (el: HTMLElement | null) => {
            if (el) slotRefs.current.set(i, el); else slotRefs.current.delete(i);
          };
          return (
            <div key={i} data-part="slot" data-testid={`reconstruct-slot-${i}`} data-slot={i}
              className="flex min-w-0 max-w-[76px] flex-1 basis-0 flex-col items-center gap-1">
              {open ? (
                <button type="button" ref={setSlotRef}
                  data-part="socket" data-testid={`reconstruct-socket-${i}`} data-state={state}
                  data-token={token ?? undefined}
                  data-drop-target={dropHere ? "true" : undefined}
                  aria-label={socketName} aria-describedby={hintId}
                  tabIndex={slotStop === i ? 0 : -1}
                  onFocus={() => setSlotStop(i)}
                  onClick={() => remove(i)} onKeyDown={socketKeys(i)}
                  className={`${socketBox} cursor-pointer ${FOCUS} data-[drop-target=true]:ring-2 data-[drop-target=true]:ring-[#8a6516] data-[drop-target=true]:ring-offset-1`}>
                  {art}
                </button>
              ) : (
                <div ref={setSlotRef} data-part="socket" data-testid={`reconstruct-socket-${i}`} data-state={state}
                  data-token={token ?? undefined} data-mark={mark === null ? undefined : mark ? "right" : "wrong"}
                  className={socketBox}>
                  {art}
                  {mark !== null && (mark || !settledOn) && <MarkBadge right={mark} animate={animate} />}
                  {revealed && mark === false && (
                    <PickBadge option={pickOption} slot={i} shown={settledOn && pickToken !== null}
                      animate={animate} delay={settleDelayMs(Math.max(0, wrongIndex))} />
                  )}
                  {(state === "settled" || state === "answer") && (
                    <span aria-hidden data-part="answer-tag"
                      className="absolute -bottom-1.5 left-1/2 z-10 -translate-x-1/2 rounded-sm bg-[#2a2110] px-1 text-[9px] font-bold uppercase tracking-[0.1em] text-[#f6e6bb]">
                      Answer
                    </span>
                  )}
                  <span className="sr-only" data-testid={`reconstruct-slot-status-${i}`}>
                    {`${base}: ${labelOf(token)}. ${statusText}`}
                  </span>
                </div>
              )}
              <span data-part="slot-label" data-testid={`reconstruct-label-${i}`} aria-hidden
                className={`line-clamp-2 h-[2.5em] w-full break-words text-center text-[11px] font-semibold leading-tight lg:[@media(max-height:719px)]:line-clamp-1 lg:[@media(max-height:719px)]:h-[1.25em] ${INK}`}>
                {token !== null ? labelOf(token) : ""}
              </span>
            </div>
          );
        })}
      </div>

      {/* One fixed line in every phase: the instruction, then the lock, then
          the verdict with what each wrong pick was. */}
      <div id={hintId} data-part={revealed && verdict ? "verdict" : "status-line"}
        data-testid={revealed && verdict ? "reconstruct-verdict" : "reconstruct-hint"}
        data-correct={revealed && reveal ? String(reveal.isCorrect) : undefined}
        data-timed-out={revealed && timedOut ? "true" : undefined}
        className={`flex h-[34px] flex-col items-center justify-center overflow-hidden text-center leading-tight lg:[@media(max-height:719px)]:h-[30px]`}>
        {revealed && verdict ? (
          <>
            <span data-testid="reconstruct-verdict-text"
              className={`inline-flex items-center gap-1 text-[12px] font-bold uppercase tracking-[0.2em] ${
                timedOut ? "text-[#9b1c1c]" : INK}`}>
              {timedOut && <Timer aria-hidden className="!size-3.5" strokeWidth={3} />}
              {verdict}
            </span>
            <span data-testid="reconstruct-wrong-notes"
              className={`max-w-full truncate text-[11px] ${MUTED}`}>
              {wrongNotes.join(" · ")}
            </span>
          </>
        ) : (
          <span className={`text-[12px] ${MUTED}`}>{statusLine}</span>
        )}
      </div>

      {/* THE stage region: one fixed box in every phase. The tray + Lock layer
          is in it from the first frame; the breakdown is stacked over it at the
          evidence stage and the tray fades out beneath — nothing in flow moves. */}
      <div data-part="stage-region" data-testid="reconstruct-tray-box"
        className={`relative mx-auto h-[var(--rc-region-narrow)] w-full max-w-[34rem] sm:h-[var(--rc-region-wide)] sm:[@media(min-height:800px)]:h-[var(--rc-region-wide-tall)] lg:[@media(max-height:719px)]:h-[var(--rc-region-compact)]`}
        style={{ ["--rc-region-narrow" as string]: `${tallTray ?? REGION_NARROW_PX}px`,
          ["--rc-region-wide" as string]: `${tallTray ?? REGION_WIDE_PX}px`,
          ["--rc-region-wide-tall" as string]: `${tallTray ?? REGION_WIDE_TALL_PX}px`,
          ["--rc-region-compact" as string]: `${tallTray ?? REGION_COMPACT_PX}px` }}>
        <div data-part="tray-layer" aria-hidden={evidenceInRegion || undefined}
          className={`absolute inset-x-0 top-0 flex flex-col gap-2 ${
            animate ? "transition-opacity duration-300" : ""} ${evidenceInRegion ? "invisible opacity-0" : "opacity-100"}`}>
          <div role="group" aria-label="Parts" aria-describedby={trayHintId}
            data-part="tray" data-testid="reconstruct-tray"
            data-state={open ? "open" : "locked"}
            className="grid w-full grid-cols-3 content-start gap-2">
            {content.options.map((option, index) => {
              const used = uses.get(option.token) ?? 0;
              const lifted = dragging?.token === option.token;
              const name = `${option.label}${used > 0 ? `, ${numberWord(used)} placed` : ""}`;
              return (
                <button key={option.token} type="button"
                  ref={(el) => { if (el) trayRefs.current.set(option.token, el); else trayRefs.current.delete(option.token); }}
                  data-part="option" data-testid={`reconstruct-option-${option.token}`}
                  data-used={used} data-lifted={lifted ? "true" : undefined}
                  aria-label={name}
                  disabled={!open} tabIndex={trayStopToken === option.token ? 0 : -1}
                  onPointerDown={onOptionPointerDown(option.token)}
                  onPointerMove={onOptionPointerMove}
                  onPointerUp={onOptionPointerUp}
                  onPointerCancel={endDrag}
                  onLostPointerCapture={(e) => { if (dragRef.current?.pointerId === e.pointerId && !dragRef.current.active) dragRef.current = null; }}
                  onDragStart={(e) => e.preventDefault()}
                  onFocus={() => setTrayStop(option.token)}
                  onClick={() => onOptionClick(option.token)} onKeyDown={optionKeys(index)}
                  className={`flex h-[92px] min-w-0 touch-none select-none flex-col items-center gap-1 overflow-hidden rounded-lg border px-1.5 py-1.5 text-center [@media(min-height:800px)]:h-[108px] lg:[@media(max-height:719px)]:h-[64px] lg:[@media(max-height:719px)]:gap-0.5 lg:[@media(max-height:719px)]:py-1 ${SURFACE} ${FOCUS} ${
                    lifted ? "opacity-50" : ""} ${open ? "cursor-grab active:cursor-grabbing" : "cursor-default opacity-70"}`}>
                  <span className="relative shrink-0">
                    <SubjectArt media={option.media} monogram={option.label.slice(0, 1)}
                      className={`h-10 w-10 rounded-md [@media(min-height:800px)]:h-12 [@media(min-height:800px)]:w-12 lg:[@media(max-height:719px)]:h-6 lg:[@media(max-height:719px)]:w-6`} />
                    {/* How many copies are PLACED. Never a limit, never a target count. */}
                    <span aria-hidden data-part="usage" data-testid={`reconstruct-usage-${option.token}`}
                      className={`absolute -right-2.5 -top-1.5 min-w-[1.6rem] rounded-full bg-[#2a2110] px-1 text-center text-[11px] font-black tabular-nums leading-4 text-[#f6e6bb] ${
                        used > 0 ? "" : "invisible"}`}>
                      {used > 0 ? `×${used}` : ""}
                    </span>
                  </span>
                  <span aria-hidden className={`line-clamp-2 break-words text-[12px] font-bold leading-tight [@media(min-height:800px)]:text-[13px] lg:[@media(max-height:719px)]:text-[11.5px]`}>{option.label}</span>
                </button>
              );
            })}
          </div>
          <p id={trayHintId} className="sr-only">Press a part to add it. Order doesn't matter.</p>

          <footer data-part="footer" className={`flex h-12 flex-col items-center justify-center lg:[@media(max-height:719px)]:h-11`}>
            {open && (
              <>
                <Button type="button" data-part="lock" data-testid="reconstruct-lock" onClick={lock}
                  disabled={!full} aria-describedby={lockHintId}
                  className={`min-h-[48px] w-full max-w-[34rem] border border-[#d5b66f]/80 bg-[#2a2110] uppercase tracking-[0.2em] text-[#f6e6bb] hover:bg-[#3a2d14] ${FOCUS} lg:[@media(max-height:719px)]:min-h-[44px]`}>
                  <Lock aria-hidden /> Lock in
                </Button>
                <p id={lockHintId} data-testid="reconstruct-lock-hint" className="sr-only">
                  {full ? "Final once locked." : `Fill all ${total} parts to lock in.`}
                </p>
              </>
            )}
            {phase === "locked" && (
              <p data-testid="reconstruct-suspense"
                className={`inline-flex min-h-[44px] items-center gap-2 text-[11px] font-bold uppercase tracking-[0.24em] ${MUTED}`}>
                <Lock aria-hidden className="!size-4" /> Locked in · Waiting <SuspenseDots animate={animate} />
              </p>
            )}
          </footer>
        </div>

        {evidenceInRegion && reveal?.evidence && (
          <div data-part="evidence" data-testid="reconstruct-evidence" data-shown="true"
            style={animate ? { animationDuration: `${RECONSTRUCT_TIMING.evidenceTween}ms` } : undefined}
            className={`absolute inset-0 flex flex-col gap-1.5 overflow-hidden lg:[@media(max-height:719px)]:gap-1 ${
              animate ? "animate-in fade-in fill-mode-both" : ""}`}>
            {/* R3A: ONE calculation. The parts, then the total directly beneath
                them. The list takes its natural height (`flex: 0 1 auto`), so
                the equation follows the last part instead of being pushed to
                the region's floor; only a build that cannot fit scrolls INSIDE
                this list, with the equation pinned under it. */}
            <ul ref={breakdownRef} data-part="breakdown" data-testid="reconstruct-breakdown"
              data-scrolls={breakdownScrolls ? "true" : undefined}
              tabIndex={breakdownScrolls ? 0 : undefined}
              aria-label={breakdownScrolls ? "Breakdown, scrollable" : undefined}
              className={`m-0 flex min-h-0 list-none flex-col gap-1 overflow-y-auto overscroll-contain p-0 [flex:0_1_auto] lg:[@media(max-height:719px)]:gap-0.5 ${FOCUS}`}>
              {reveal.evidence.parts.map((part) => (
                <BreakdownBlock key={part.token} part={part} option={byToken.get(part.token)} />
              ))}
            </ul>
            {reveal.evidence.equation && (
              <p data-part="equation" data-testid="reconstruct-evidence-total"
                className={`flex min-h-[40px] shrink-0 flex-wrap items-baseline justify-center gap-x-1.5 rounded-lg border-2 px-2 py-1 text-center text-[13px] font-semibold leading-snug sm:text-[14px] lg:[@media(max-height:719px)]:min-h-[32px] lg:[@media(max-height:719px)]:py-0.5 border-[#7a6236] ${CARD_FILL}`}>
                {reveal.evidence.equation.terms.map((term, i) => (
                  <span key={`${term.label}:${i}`} className="inline-flex items-baseline gap-1">
                    {i > 0 && <span aria-hidden className="font-black">+</span>}
                    <span>{term.label}</span>
                    {term.valueDisplay && <span className="font-black tabular-nums">{term.valueDisplay}</span>}
                  </span>
                ))}
                <span aria-hidden className="font-black">=</span>
                <span className="inline-flex items-baseline gap-1">
                  <span>{reveal.evidence.equation.result.label}</span>
                  <span className="text-[15px] font-black tabular-nums sm:text-base">
                    {reveal.evidence.equation.result.valueDisplay}
                  </span>
                </span>
              </p>
            )}
          </div>
        )}
      </div>

      <p role="status" aria-live="polite" data-testid="reconstruct-live" className="sr-only">
        {open ? announcement : resultText}
      </p>

      {/* The drag ghost: a fixed-position portal, so it never takes layout. */}
      {dragging && typeof document !== "undefined" && createPortal(
        <span aria-hidden data-testid="reconstruct-drag-ghost"
          style={{ transform: `translate3d(${dragging.x - 28}px, ${dragging.y - 28}px, 0)` }}
          className="pointer-events-none fixed left-0 top-0 z-[100] h-14 w-14 overflow-hidden rounded-lg border-2 border-[#8a6516] shadow-xl">
          <SubjectArt media={byToken.get(dragging.token)?.media}
            monogram={labelOf(dragging.token).slice(0, 1)} className="h-full w-full" />
        </span>,
        document.body,
      )}
    </div>
  );
}

// ---------------------------------------------------------------------- helpers

function sentenceCase(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }

/** Tokens in order of first appearance. */
function distinct(tokens: readonly string[]): string[] {
  return [...new Set(tokens)];
}

/** The whole reveal in one string, for the single live region. */
function revealSummary(
  reveal: ReconstructReveal, byToken: Map<string, AssemblyOption>, total: number, verdict: string,
): string {
  const counts = new Map<string, number>();
  for (const t of reveal.settled) counts.set(t, (counts.get(t) ?? 0) + 1);
  const parts = [...counts].map(([t, n]) => {
    const label = byToken.get(t)?.label ?? "";
    return n > 1 ? `${label}, ${n} of the ${total} parts` : label;
  });
  const eq = reveal.evidence?.equation;
  const equation = eq
    ? `${eq.terms.map((x) => [x.label, x.valueDisplay].filter(Boolean).join(" ")).join(" plus ")} equals ${
      eq.result.label} ${eq.result.valueDisplay}.`
    : "";
  return [
    verdict ? `${verdict}.` : "Revealed.",
    parts.length > 0 ? `The build is: ${parts.join("; ")}.` : "",
    equation,
  ].filter(Boolean).join(" ");
}
