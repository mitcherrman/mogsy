// ---------------------------------------------------------------------------
// `match.v1` renderer (MG-P3) — Match Grid.
//
// The player seats every dealt entity (a sigil) under a group (a seal) and
// locks the whole board once. The M1 `MatchGrid` primitive draws it; this
// wrapper only maps the server's public block onto the primitive, keeps the
// player's unsubmitted draft, emits ONE `{assignments}` choice on Lock, and
// maps the server's post-lock reveal onto the primitive's choreography.
//
// Authority: this file grades NOTHING and knows no canonical map. Entity and
// group identity is the server's opaque positional token (`e0..` / `g0..`),
// passed through exactly; no label, art path or glyph is ever read as an
// identity. Correctness, the canonical board and every fact (tree, keystone /
// minor) arrive only in the server's reveal after Lock. The opponent's board
// is never read here.
// ---------------------------------------------------------------------------

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { HeightTier } from "@/lib/match-grid/layout";
import { MatchGrid } from "@/components/match-grid/MatchGrid";
import { RUNE_TREE_HUE, RuneTreeGlyph } from "@/components/match-grid/RuneTreeGlyph";
import { seatEntity } from "@/lib/match-grid/board";
import type {
  MatchFact, MatchPublic, MatchResponse, MatchReveal, MatchSeat, MatchValue, SubjectMedia,
} from "@/lib/match-grid/contract";
import { resolveQuizAssetUrl } from "@/lib/quiz/api";
import { msUntilServerInstant, useServerInstantWake } from "@/lib/ranked-core/flow/useServerInstantWake";
import type { QuestionView } from "@/lib/ranked-core/viewTypes";
import type { SegmentChoice } from "@/lib/ranked-public/client";
import {
  MATCH_MODULE_ID,
  type MatchAssignmentView,
  type MatchBlockView,
  type MatchChallengeReveal,
  type PublicRoundView,
  type ReconstructMedia,
  type SegmentStateView,
} from "@/lib/ranked-public/contracts";
import type { ModuleRenderer, ModuleViewportProps } from "./types";

export { MATCH_MODULE_ID };
export const MATCH_MODULE_VERSION = 1;

/** The only challenge a `match` v1 segment has. */
const CHALLENGE_INDEX = 0;

/** Server art path -> the URL the page requests. Resolves the server's path; identifies nothing. */
export function matchMedia(media: ReconstructMedia): SubjectMedia | null {
  return media ? { src: resolveQuizAssetUrl(media.src) ?? null, alt: media.alt } : null;
}

/**
 * Public block -> the primitive's `MatchPublic`. A field mapping: tokens are
 * the server's ids verbatim, labels/art are displayed, the glyph only picks a
 * seal face and its hue.
 */
export function toMatchPublic(block: MatchBlockView): MatchPublic {
  return {
    prompt: block.prompt,
    context: null,
    // Speech nouns for the family the server names; generic otherwise.
    entityNoun: block.family === "rune_tree" ? "rune" : "entry",
    groupNoun: block.family === "rune_tree" ? "rune tree" : "group",
    entities: block.entities.map((e) => ({ token: e.entityId, label: e.label, media: matchMedia(e.media) })),
    groups: block.groups.map((g) => ({
      token: g.groupId,
      label: g.label,
      glyph: g.glyph,
      hue: g.glyph !== null ? RUNE_TREE_HUE[g.glyph] ?? null : null,
    })),
    membership: block.membership,
  };
}

/** The primitive's response -> the transport choice. Ids pass through unchanged. */
export function toMatchChoice(response: MatchResponse): Extract<SegmentChoice, { assignments: unknown }> {
  return { assignments: response.assignments.map((a) => ({ entity_id: a.entity, group_id: a.group })) };
}

/**
 * A server-recorded board -> seats for the primitive. Seats are presentation
 * only (first free seat per group, in the server's row order).
 */
export function boardFromAssignments(content: MatchPublic, rows: readonly MatchAssignmentView[]): MatchValue {
  let v: Record<string, MatchSeat> = {};
  for (const r of rows) v = seatEntity(content, v, r.entityId, r.groupId).next;
  return v;
}

const RUNE_TYPE_WORD: Readonly<Record<string, string>> = { keystone: "Keystone", minor: "Minor rune" };

/**
 * The server's reveal -> the primitive's. Every mark, every canonical group
 * and every fact is copied from the server; nothing is compared or derived.
 * A `rune_type` the server sends is worded; an unknown one is shown as sent.
 */
export function toMatchReveal(r: MatchChallengeReveal): MatchReveal {
  const assignments: Record<string, string> = {};
  for (const a of r.assignments) assignments[a.entityId] = a.groupId;
  const canonical: Record<string, string[]> = {};
  for (const a of r.canonicalAssignments) canonical[a.entityId] = [a.groupId];
  const facts: Record<string, MatchFact[]> = {};
  for (const [id, f] of Object.entries(r.entityFacts)) {
    facts[id] = f.runeType ? [{ label: "Slot", value: RUNE_TYPE_WORD[f.runeType] ?? f.runeType }] : [];
  }
  return {
    assignments,
    canonical,
    entityCorrect: { ...r.entityCorrect },
    isCorrect: r.isCorrect,
    facts,
    source: null,
  };
}

/**
 * The arena frames the module inside a stage roughly 250px shorter than the
 * window, so the board's height tier is chosen from that budget, not from the
 * raw viewport the M1 lab used (measured MG-P3: 1600×900 leaves ~650px).
 */
const ARENA_TALL_QUERY = "(min-height: 1360px) and (min-width: 820px)";
const ARENA_NORMAL_QUERY = "(min-height: 1100px)";

function readArenaTier(): HeightTier {
  if (typeof window === "undefined" || !window.matchMedia) return "normal";
  if (window.matchMedia(ARENA_TALL_QUERY).matches) return "tall";
  return window.matchMedia(ARENA_NORMAL_QUERY).matches ? "normal" : "compact";
}

function useArenaHeightTier(): HeightTier {
  const [tier, setTier] = useState<HeightTier>(readArenaTier);
  useEffect(() => {
    const queries = [ARENA_TALL_QUERY, ARENA_NORMAL_QUERY]
      .map((q) => window.matchMedia?.(q)).filter(Boolean) as MediaQueryList[];
    const sync = () => setTier(readArenaTier());
    sync();
    queries.forEach((mq) => mq.addEventListener?.("change", sync));
    return () => queries.forEach((mq) => mq.removeEventListener?.("change", sync));
  }, []);
  return tier;
}

/**
 * MG-P3.1 — the room the arena's question stage gives the module, in px, or
 * undefined where the stage grows with its content (phones) or is absent.
 *
 * Read from the STAGE (fixed by the arena's grid on desktop), never from the
 * module's own wrapper, which is sized by its content and would feed back.
 * The board uses it to choose a composition that fits at FULL size (the
 * ledger's rail arrangement on short desktops) — it is never scaled.
 */
const STAGE_SLACK_PX = 12;

function useStageRoom(ref: React.RefObject<HTMLElement>): number | undefined {
  const [room, setRoom] = useState<number | undefined>(undefined);
  useLayoutEffect(() => {
    const el = ref.current;
    const stage = el?.closest<HTMLElement>(".ranked-question-stage");
    const host = el?.parentElement?.parentElement;
    if (!el || !stage || !host) return;
    const read = () => {
      if (!getComputedStyle(host).display.includes("flex")) { setRoom(undefined); return; }
      const cs = getComputedStyle(stage);
      const inner = stage.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      const next = Math.floor(inner - STAGE_SLACK_PX);
      setRoom((r) => (r === next ? r : next));
    };
    // Committed before paint, so a board never paints in the wrong composition.
    read();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => flushSync(read));
    ro.observe(stage);
    return () => ro.disconnect();
  }, [ref]);
  return room;
}

/** The latest of the instants at which the server lets this challenge be answered. */
function opensAt(state: SegmentStateView, roundStartedAt: string | null): string | null {
  const instants = [state.challengeStartedAt, roundStartedAt]
    .filter((x): x is string => typeof x === "string" && !Number.isNaN(Date.parse(x)));
  return instants.length === 0
    ? null : instants.reduce((a, b) => (Date.parse(b) > Date.parse(a) ? b : a));
}

function MatchPhase({ state, actions, skewMs, roundStartedAt }: {
  state: SegmentStateView;
  actions: ModuleViewportProps["actions"];
  skewMs: number;
  roundStartedAt: string | null;
}) {
  const block = state.block?.contract === "match" ? state.block : null;
  const heightTier = useArenaHeightTier();
  const phaseRef = useRef<HTMLDivElement>(null);
  const maxHeight = useStageRoom(phaseRef);
  // Every poll re-parses the snapshot into NEW objects. The primitive keys its
  // reveal clock on object identity, so everything handed to it is memoised
  // by VALUE: a fresh-but-equal snapshot must not restart the choreography.
  const blockKey = block ? JSON.stringify(block) : null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const content = useMemo(() => (block ? toMatchPublic(block) : null), [blockKey]);

  // Keyed on (segment, challenge), not on snapshot identity: the arena
  // re-renders with a fresh snapshot every second.
  const key = `${state.segmentNumber}:${CHALLENGE_INDEX}`;
  const [draft, setDraft] = useState<{ key: string; board: MatchValue } | null>(null);
  const [pending, setPending] = useState<{ key: string; board: MatchValue } | null>(null);
  useEffect(() => { setPending((p) => (p !== null && p.key !== key ? null : p)); }, [key]);

  const revealRow = state.ownChallengeReveals.find((r) => r.challengeIndex === CHALLENGE_INDEX);
  const served = revealRow?.match ?? null;
  const servedKey = served ? JSON.stringify(served) : null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const reveal = useMemo(() => (served ? toMatchReveal(served) : null), [servedKey]);

  // The server's echo of an accepted lock survives a refresh.
  const echoed = state.ownSubmittedAssignments?.[CHALLENGE_INDEX] ?? null;
  const serverLocked = echoed !== null
    || state.ownNextChallengeIndex > CHALLENGE_INDEX || state.ownFinished;

  const wakeAt = opensAt(state, roundStartedAt);
  useServerInstantWake(wakeAt, skewMs);
  const notOpen = wakeAt !== null && msUntilServerInstant(wakeAt, skewMs, Date.now()) > 0;

  const rows = served?.assignments ?? echoed;
  const rowsKey = rows ? JSON.stringify(rows) : null;
  const lockedBoard = useMemo(() => {
    if (!content) return null;
    return rows ? boardFromAssignments(content, rows) : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, rowsKey]);

  if (!content) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="match-grid-loading">
        Loading the board…
      </p>
    );
  }

  const ownPending = pending?.key === key ? pending.board : null;
  const phase = reveal ? "revealed" : serverLocked || ownPending ? "locked" : "open";
  const own = draft?.key === key ? draft.board : {};
  // After Lock the board the player locked stays put (their own seats while
  // this tab holds them; the server's echo after a refresh).
  const value = phase === "open" ? own : ownPending ?? lockedBoard ?? own;

  const onLock = (response: MatchResponse) => {
    if (notOpen || pending !== null || serverLocked) return;
    setPending({ key, board: own });
    const result = actions.submitChallenge(CHALLENGE_INDEX, toMatchChoice(response));
    // A refused or failed lock stored nothing: reopen so the player can retry.
    if (result && typeof (result as Promise<boolean>).then === "function") {
      void (result as Promise<boolean>).then((accepted) => {
        if (!accepted) setPending((p) => (p?.key === key ? null : p));
      });
    }
  };

  return (
    <div ref={phaseRef} data-testid="match-grid-phase" data-phase={phase}
      data-not-open={phase === "open" && notOpen ? "true" : undefined}
      {...(phase === "open" && notOpen ? { inert: "" } : {})}>
      {/* The primitive's own status line already says "Locked in · waiting…",
          so no second opponent line is added beneath it. */}
      <MatchGrid key={key} content={content} phase={phase} value={value}
        onChange={(board) => setDraft({ key, board })} onLock={onLock} reveal={reveal}
        renderGroupGlyph={(g) => <RuneTreeGlyph glyph={g.glyph} />} heightTier={heightTier}
        maxHeight={maxHeight} />
    </div>
  );
}

function MatchViewport({ segmentState, actions, skewMs, publicRound }: ModuleViewportProps) {
  return (
    <div className="relative isolate space-y-3" data-testid="match-grid-viewport">
      {segmentState ? (
        <MatchPhase state={segmentState} actions={actions} skewMs={skewMs}
          roundStartedAt={publicRound?.activeRound?.startedAt ?? null} />
      ) : (
        <p className="text-sm text-muted-foreground" data-testid="match-grid-loading">
          Loading the segment…
        </p>
      )}
      {actions.error && (
        <p role="alert" data-testid="match-grid-error" className="text-sm text-destructive">
          {actions.error}
        </p>
      )}
    </div>
  );
}

export const matchGridModule: ModuleRenderer = {
  moduleId: MATCH_MODULE_ID,
  moduleVersion: MATCH_MODULE_VERSION,
  // Only the contract this renderer reads; a future v2 fails closed.
  servesVersion: (version) => version === MATCH_MODULE_VERSION,
  ownsSubmission: true,
  // Once the viewer's reveal is on the board, the settled board IS the result.
  ownsResultReveal: (state) => !!state?.ownChallengeReveals.some(
    (r) => r.challengeIndex === CHALLENGE_INDEX && !!r.match),
  Viewport: MatchViewport,
  projectQuestion: (_pub: PublicRoundView): QuestionView | null => null,
  summaryLabel: (pub) => {
    const state = pub.segmentState;
    if (!state) return null;
    return state.ownNextChallengeIndex > CHALLENGE_INDEX ? "Board locked in" : "Seat each rune";
  },
};
