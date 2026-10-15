/**
 * UGMP — Glyph Press, owner playtest. The ORIGINAL WP1.1 `GlyphPress`
 * primitive inside the real `CanonicalArena`, fed by the backend instead of a
 * round file the owner had to load from disk.
 *
 * The backend deals every verified WP1.1 round in a random order. This tab
 * holds the public structure and the disclosed ledger only: a sounding is
 * answered by the backend (which also enforces the budget), and the canonical
 * glyphs arrive only as the reveal to that round's own Lock. Clue images come
 * from an owner-authenticated endpoint, so no payload names an image path that
 * spells the answer. Nothing is stored: no match, attempt, score or rating.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CanonicalArena } from "@/components/ranked-arena/CanonicalArena";
import { arenaHeaderRowClass } from "@/components/ranked-arena/ArenaShell";
import { GlyphPress } from "@/components/interaction-grammar/GlyphPress";
import { useStageRoom } from "@/components/interaction-grammar/useStageRoom";
import { reconcileValue } from "@/lib/interaction-grammar/glyphPress";
import type {
  GlyphPressLedger, GlyphPressPublic, GlyphPressResponse, GlyphPressReveal, GlyphPressValue, InteractionPhase,
} from "@/lib/interaction-grammar/types";
import type { ModuleRenderer } from "@/lib/ranked-core/modules/types";
import {
  describePlaytestError, PlaytestApiError, playtestsApi,
  type GlyphPressPublicRound, type GlyphPressSession, type PlaytestsApi,
} from "@/lib/playtests/api";
import { labArenaView } from "@/pages/dev/interaction-lab/labArenaView";
import { OwnerRail, RoundControls, SERVER_PROTOTYPE_NOTE, SessionState } from "./ownerArena";

const MIN_LOCK_BEAT_MS = 420;

export function toGlyphPressPublic(r: GlyphPressPublicRound, clueSrc: string | null): GlyphPressPublic {
  return {
    prompt: r.content.prompt,
    categoryLabel: r.content.categoryLabel,
    clue: {
      media: clueSrc ? { src: clueSrc, alt: "" } : null,
      caption: r.content.clue.caption,
      monogram: r.content.clue.monogram,
    },
    structure: r.content.structure,
    alphabet: r.content.alphabet,
    soundingsAllowed: r.content.soundingsAllowed,
    footnote: r.content.footnote,
  };
}

interface Stage {
  key: string;
  content: GlyphPressPublic;
  ledger: GlyphPressLedger;
  phase: InteractionPhase;
  value: GlyphPressValue;
  reveal: GlyphPressReveal | null;
  onChange: (next: GlyphPressValue) => void;
  onSound: (glyph: string) => void;
  onLock: (response: GlyphPressResponse) => void;
}
const StageContext = createContext<Stage | null>(null);

function Viewport() {
  const s = useContext(StageContext);
  const ref = useRef<HTMLDivElement>(null);
  const maxHeight = useStageRoom(ref);
  if (!s) return null;
  return (
    <div ref={ref} data-testid="glyph-press-owner-viewport" className="flex min-h-0 flex-col">
      <GlyphPress key={s.key} content={s.content} ledger={s.ledger} phase={s.phase} value={s.value} maxHeight={maxHeight}
        onChange={s.onChange} onSound={s.onSound} onLock={s.onLock} reveal={s.reveal} />
    </div>
  );
}

const RENDERER: ModuleRenderer = {
  moduleId: "owner_playtest.glyph_press", moduleVersion: 1,
  ownsSubmission: true, ownsResultReveal: () => true,
  Viewport, projectQuestion: () => null, summaryLabel: () => null,
};

type Load = { state: "loading" } | { state: "ready"; session: GlyphPressSession; clues: Record<number, string | null> } | { state: "error"; message: string };

export default function GlyphPressOwnerPlaytest({ lead, api: injected }: { lead: ReactNode; api?: PlaytestsApi }) {
  const api = useMemo(() => injected ?? playtestsApi(), [injected]);
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [generation, setGeneration] = useState(0);
  const [index, setIndex] = useState(0);
  const [ledger, setLedger] = useState<GlyphPressLedger>({ engraved: [], soundings: [] });
  const [value, setValue] = useState<GlyphPressValue>([]);
  const [phase, setPhase] = useState<InteractionPhase>("open");
  const [reveal, setReveal] = useState<GlyphPressReveal | null>(null);
  const [error, setError] = useState<{ message: string; expired: boolean } | null>(null);
  const [verdicts, setVerdicts] = useState<Record<number, GlyphPressReveal["verdict"]>>({});
  const roundRef = useRef("");

  const beginRound = useCallback((r: GlyphPressPublicRound | undefined) => {
    setLedger(r ? r.ledger : { engraved: [], soundings: [] });
    setValue(r ? r.ledger.engraved.map(() => null) : []);
    setPhase("open"); setReveal(null); setError(null);
  }, []);

  // Deal a session, then fetch every clue image before the first round shows,
  // so no round swaps its monogram for art mid-play. A clue that fails falls
  // back to the monogram the round already carries.
  useEffect(() => {
    let cancelled = false;
    const urls: string[] = [];
    setLoad({ state: "loading" });
    api.startGlyphPress()
      .then(async (session) => {
        const settled = await Promise.allSettled(session.rounds.map((r) => api.clueImage(r.content.clue.mediaPath)));
        const clues: Record<number, string | null> = {};
        settled.forEach((s, i) => {
          clues[session.rounds[i].index] = s.status === "fulfilled" ? s.value : null;
          if (s.status === "fulfilled") urls.push(s.value);
        });
        if (cancelled) { urls.forEach((u) => URL.revokeObjectURL(u)); return; }
        setLoad({ state: "ready", session, clues });
        setIndex(0); setVerdicts({});
        beginRound(session.rounds[0]);
      })
      .catch((err: unknown) => { if (!cancelled) setLoad({ state: "error", message: describePlaytestError(err, "Dealing a Glyph Press session") }); });
    return () => { cancelled = true; urls.forEach((u) => URL.revokeObjectURL(u)); };
  }, [api, generation, beginRound]);

  const session = load.state === "ready" ? load.session : null;
  const round = session?.rounds[index] ?? null;
  const roundKey = session && round ? `${session.session_id}:${round.index}` : "";
  roundRef.current = roundKey;
  const clueSrc = load.state === "ready" && round ? load.clues[round.index] ?? null : null;
  const content = useMemo(() => (round ? toGlyphPressPublic(round, clueSrc) : null), [round, clueSrc]);

  const fail = (err: unknown, what: string) => setError({
    message: describePlaytestError(err, what),
    expired: err instanceof PlaytestApiError && err.code === "session_expired",
  });

  const onSound = useCallback((glyph: string) => {
    if (!session || !round) return;
    const key = `${session.session_id}:${round.index}`;
    api.soundGlyphPress(session.session_id, round.index, glyph)
      .then((result) => {
        if (roundRef.current !== key) return;
        setLedger(result.ledger);
        setValue((v) => reconcileValue(v, result.ledger));
      })
      .catch((err: unknown) => { if (roundRef.current === key) fail(err, "Sounding a glyph"); });
  }, [api, session, round]);

  const onLock = useCallback((response: GlyphPressResponse) => {
    if (!session || !round) return;
    const key = `${session.session_id}:${round.index}`;
    setPhase("locked");
    setError(null);
    const beat = new Promise((r) => window.setTimeout(r, MIN_LOCK_BEAT_MS));
    Promise.all([api.lockGlyphPress(session.session_id, round.index, response.glyphs), beat])
      .then(([result]) => {
        if (roundRef.current !== key) return;
        setReveal(result.reveal);
        setVerdicts((v) => ({ ...v, [round.index]: result.reveal.verdict }));
        setPhase("revealed");
      })
      .catch((err: unknown) => {
        if (roundRef.current !== key) return;
        setPhase("open");
        fail(err, "Locking this round");
      });
  }, [api, session, round]);

  const next = () => {
    if (!session) return;
    const to = index + 1;
    setIndex(to);
    beginRound(session.rounds[to]);
  };
  const restart = () => setGeneration((g) => g + 1);

  if (load.state === "loading") return <SessionState mode="glyph-press" state="loading" />;
  if (load.state === "error") return <SessionState mode="glyph-press" state="error" message={load.message} onRetry={restart} />;
  if (!session || !round || !content) return <SessionState mode="glyph-press" state="error" message="The backend dealt an empty session." onRetry={restart} />;

  const counts = Object.values(verdicts);
  const tally = (v: GlyphPressReveal["verdict"]) => counts.filter((x) => x === v).length;
  const stage: Stage = { key: roundKey, content, ledger, phase, value, reveal, onChange: setValue, onSound, onLock };
  const view = labArenaView({
    title: "Prototype · server-validated", renderer: RENDERER, phase, selection: value, reveal: null, verdict: null,
    revealId: 0, onSelect: () => {}, onSubmit: () => {},
    eyebrow: "Glyph Press · owner playtest", playtestNote: SERVER_PROTOTYPE_NOTE,
    left: <OwnerRail title="Round" testId="glyph-press-owner-rail-left" rows={[
      ["Round", `${index + 1} of ${session.rounds.length}`],
      ["Category", round.content.categoryLabel],
      ["Soundings", `${ledger.soundings.length} of ${round.content.soundingsAllowed} used`],
    ]} />,
    right: <OwnerRail title="Session" testId="glyph-press-owner-rail-right" rows={[
      ["Solved", String(tally("solved"))],
      ["Partial", String(tally("partial"))],
      ["Missed", String(tally("missed"))],
      ["Grading", "Each open glyph, graded by the backend (WP1.1 rules). Unrated."],
    ]} />,
  });

  const chrome = (
    <div data-testid="glyph-press-owner-chrome" className={`${arenaHeaderRowClass("wide")} flex-nowrap gap-x-2 overflow-x-auto whitespace-nowrap text-[11px] text-[#a9b3c1] [scrollbar-width:thin]`}>
      {lead}
      <RoundControls index={index} total={session.rounds.length} revealed={phase === "revealed"}
        onNext={next} onRestart={restart} testIdPrefix="glyph-press-owner" />
    </div>
  );

  return (
    <div data-testid="glyph-press-owner" data-phase={phase} data-round={index}>
      <StageContext.Provider value={stage}>
        <CanonicalArena view={view} chrome={chrome} />
      </StageContext.Provider>
      {error ? (
        <div role="alert" data-testid="glyph-press-owner-error" className="relative z-30 mx-auto flex max-w-3xl flex-wrap items-center gap-3 px-4 py-2 text-sm text-red-300">
          <span>{error.message}</span>
          {error.expired ? (
            <button type="button" onClick={restart} className="min-h-[36px] rounded border border-[#d5b66f] px-3 text-xs text-[#f6e6bb]">Start a new session</button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
