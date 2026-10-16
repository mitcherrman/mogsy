/**
 * PGM2 — Glyph Press, the public bonus game. The same WP1.1 `GlyphPress`
 * primitive and the same server grading as the owner lab, dealt by the PUBLIC
 * player-scoped session route. Soundings are answered (and budgeted) by the
 * server; the full name arrives only as the reveal to that round's own Lock.
 * Clue images come from the player-authenticated public route as blob URLs.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { CanonicalArena } from "@/components/ranked-arena/CanonicalArena";
import { arenaHeaderRowClass } from "@/components/ranked-arena/ArenaShell";
import { GlyphPress } from "@/components/interaction-grammar/GlyphPress";
import { reconcileValue } from "@/lib/interaction-grammar/glyphPress";
import type {
  GlyphPressLedger, GlyphPressPublic, GlyphPressResponse, GlyphPressReveal, GlyphPressValue, InteractionPhase,
} from "@/lib/interaction-grammar/types";
import type { ModuleRenderer } from "@/lib/ranked-core/modules/types";
import type { GlyphPressPublicRound, GlyphPressSession } from "@/lib/playtests/api";
import { toGlyphPressPublic } from "@/pages/admin/playtests/GlyphPressOwnerPlaytest";
import { useOwnerStageRoom } from "@/pages/admin/playtests/ownerArena";
import { labArenaView } from "@/pages/dev/interaction-lab/labArenaView";
import { BonusSessionError, bonusSessionsApi, describeBonusError, type BonusSessionsApi } from "@/lib/public-modes/sessionsApi";
import type { PublicModeEntry } from "@/lib/public-modes/contracts";
import {
  BONUS_GAME_NOTE, GameError, GameLead, GameRail, GameResults, GameState, PHONE_DOCK_RESERVE_PX, RoundBar,
  useBonusRoundReport,
} from "./publicGame";

const MIN_LOCK_BEAT_MS = 420;
const TITLE = "Glyph Press";

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
  const maxHeight = useOwnerStageRoom(ref, PHONE_DOCK_RESERVE_PX);
  if (!s) return null;
  return (
    <div ref={ref} data-testid="glyph-press-game-viewport" className="flex min-h-0 flex-col">
      <GlyphPress key={s.key} content={s.content} ledger={s.ledger} phase={s.phase} value={s.value} maxHeight={maxHeight}
        onChange={s.onChange} onSound={s.onSound} onLock={s.onLock} reveal={s.reveal} />
    </div>
  );
}

const RENDERER: ModuleRenderer = {
  moduleId: "bonus_game.glyph_press", moduleVersion: 1,
  ownsSubmission: true, ownsResultReveal: () => true,
  Viewport, projectQuestion: () => null, summaryLabel: () => null,
};

type Load =
  | { state: "loading" }
  | { state: "ready"; session: GlyphPressSession; clues: Record<number, string | null> }
  | { state: "error"; message: string };

export default function GlyphPressGame({ entry, api: injected }: { entry: PublicModeEntry | null; api?: BonusSessionsApi }) {
  const api = useMemo(() => injected ?? bonusSessionsApi(), [injected]);
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [generation, setGeneration] = useState(0);
  const [index, setIndex] = useState(0);
  const [ledger, setLedger] = useState<GlyphPressLedger>({ engraved: [], soundings: [] });
  const [value, setValue] = useState<GlyphPressValue>([]);
  const [phase, setPhase] = useState<InteractionPhase>("open");
  const [reveal, setReveal] = useState<GlyphPressReveal | null>(null);
  const [error, setError] = useState<{ message: string; expired: boolean } | null>(null);
  const [results, setResults] = useState<Record<number, GlyphPressReveal>>({});
  const [finished, setFinished] = useState(false);
  const roundRef = useRef("");

  const beginRound = useCallback((r: GlyphPressPublicRound | undefined) => {
    setLedger(r ? r.ledger : { engraved: [], soundings: [] });
    setValue(r ? r.ledger.engraved.map(() => null) : []);
    setPhase("open"); setReveal(null); setError(null);
  }, []);

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
        setIndex(0); setResults({}); setFinished(false);
        beginRound(session.rounds[0]);
      })
      .catch((err: unknown) => { if (!cancelled) setLoad({ state: "error", message: describeBonusError(err) }); });
    return () => { cancelled = true; urls.forEach((u) => URL.revokeObjectURL(u)); };
  }, [api, generation, beginRound]);

  const session = load.state === "ready" ? load.session : null;
  const round = session?.rounds[index] ?? null;
  const roundKey = session && round ? `${session.session_id}:${round.index}` : "";
  roundRef.current = roundKey;
  const clueSrc = load.state === "ready" && round ? load.clues[round.index] ?? null : null;
  const content = useMemo(() => (round ? toGlyphPressPublic(round, clueSrc) : null), [round, clueSrc]);

  useBonusRoundReport(entry, round && !finished ? {
    runtimeQuestionId: roundKey,
    prompt: [round.content.prompt, round.content.categoryLabel, round.content.clue.caption].filter(Boolean).join(" · "),
    selectedAnswer: reveal ? reveal.locked.map((g) => g ?? "_").join("") : null,
    sessionId: session?.session_id ?? null,
    roundNumber: index + 1,
    moduleType: "glyph_press",
  } : null, reveal ? {
    revealed: true,
    canonicalAnswer: reveal.answerText,
    evidence: reveal.source ? [reveal.source.label, reveal.source.url].filter(Boolean).join(" · ") : null,
  } : { revealed: false });

  const fail = (err: unknown) => setError({
    message: describeBonusError(err), expired: err instanceof BonusSessionError && err.expired,
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
      .catch((err: unknown) => { if (roundRef.current === key) fail(err); });
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
        setResults((v) => ({ ...v, [round.index]: result.reveal }));
        setPhase("revealed");
      })
      .catch((err: unknown) => {
        if (roundRef.current !== key) return;
        setPhase("open");
        fail(err);
      });
  }, [api, session, round]);

  const next = () => {
    if (!session) return;
    const to = index + 1;
    setIndex(to);
    beginRound(session.rounds[to]);
  };
  const restart = () => setGeneration((g) => g + 1);

  if (load.state === "loading") return <GameState title={TITLE} state="loading" />;
  if (load.state === "error") return <GameState title={TITLE} state="error" message={load.message} onRetry={restart} />;
  if (!session || !round || !content) return <GameState title={TITLE} state="error" message="This game could not be dealt." onRetry={restart} />;

  const played = session.rounds.map((r) => ({ r, res: results[r.index] ?? null }));
  const tally = (v: GlyphPressReveal["verdict"]) => played.filter((p) => p.res?.verdict === v).length;

  if (finished) {
    const solved = tally("solved");
    return (
      <GameResults title={TITLE} headline={`${solved} of ${session.rounds.length} solved`}
        stats={[["Solved", String(solved)], ["Partial", String(tally("partial"))], ["Missed", String(tally("missed"))]]}
        rows={played.map(({ r, res }) => ({
          label: res ? res.answerText : r.content.categoryLabel,
          detail: res ? `${res.verdict === "solved" ? "Solved" : res.verdict === "partial" ? "Partial" : "Missed"} · ${res.scoreText}` : "—",
          tone: res?.verdict === "solved" ? "good" : res ? "bad" : "neutral",
        }))}
        onPlayAgain={restart} />
    );
  }

  const stage: Stage = { key: roundKey, content, ledger, phase, value, reveal, onChange: setValue, onSound, onLock };
  const view = labArenaView({
    title: entry?.title ?? TITLE, renderer: RENDERER, phase, selection: value, reveal: null, verdict: null,
    revealId: 0, onSelect: () => {}, onSubmit: () => {},
    eyebrow: "More Challenges", playtestNote: BONUS_GAME_NOTE,
    left: <GameRail title="Name" testId="glyph-press-game-rail-left" rows={[
      ["Round", `${index + 1} of ${session.rounds.length}`],
      ["Category", round.content.categoryLabel],
      ["Soundings", `${ledger.soundings.length} of ${round.content.soundingsAllowed} used`],
    ]} />,
    right: <GameRail title="This game" testId="glyph-press-game-rail-right" rows={[
      ["Solved", String(tally("solved"))], ["Partial", String(tally("partial"))], ["Missed", String(tally("missed"))],
    ]} />,
  });

  const chrome = (
    <div data-testid="glyph-press-game-chrome" className={`${arenaHeaderRowClass("wide")} flex-nowrap gap-x-2 overflow-x-auto whitespace-nowrap text-[11px] text-[#a9b3c1] [scrollbar-width:thin]`}>
      <GameLead title={TITLE} />
      <RoundBar index={index} total={session.rounds.length} revealed={phase === "revealed"}
        onNext={next} onFinish={() => setFinished(true)} />
    </div>
  );

  return (
    <div data-testid="glyph-press-game" data-phase={phase} data-round={index}>
      <StageContext.Provider value={stage}>
        <CanonicalArena view={view} chrome={chrome} />
      </StageContext.Provider>
      {error ? <GameError message={error.message} expired={error.expired} onRestart={restart} /> : null}
    </div>
  );
}
