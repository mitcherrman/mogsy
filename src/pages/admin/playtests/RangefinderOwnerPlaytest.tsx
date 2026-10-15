/**
 * UGMP — Rangefinder, owner playtest. The ORIGINAL GM-R1 `Rangefinder`
 * primitive inside the real `CanonicalArena`, fed by the backend instead of a
 * capture file the owner had to load from disk.
 *
 * The backend deals a session of ten abilities: each round is public content
 * plus that session's opaque stop tokens. The canonical stop never reaches this
 * tab before Lock; the Lock is posted, the backend grades it with GM-R1's exact
 * rule (no tolerance) and returns the reveal, which the primitive draws.
 * Nothing is stored: no match, attempt, score or rating.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CanonicalArena } from "@/components/ranked-arena/CanonicalArena";
import { arenaHeaderRowClass } from "@/components/ranked-arena/ArenaShell";
import { Rangefinder } from "@/components/interaction-grammar/Rangefinder";
import { formatUnits } from "@/lib/interaction-grammar/rangefinder";
import type {
  InteractionPhase, RangefinderPublic, RangefinderResponse, RangefinderReveal, RangefinderValue,
} from "@/lib/interaction-grammar/types";
import type { ModuleRenderer } from "@/lib/ranked-core/modules/types";
import { getAbilityIconUrl, getChampionSquareIconUrl, type AbilitySlot } from "@/lib/combat-lab/abilityIcons";
import {
  describePlaytestError, PlaytestApiError, playtestsApi,
  type PlaytestsApi, type RangefinderPublicRound, type RangefinderServerReveal, type RangefinderSession,
} from "@/lib/playtests/api";
import { labArenaView } from "@/pages/dev/interaction-lab/labArenaView";
import { OwnerRail, RoundControls, SERVER_PROTOTYPE_NOTE, SessionState, useOwnerStageRoom } from "./ownerArena";

/**
 * GM-R1's two optics (`labAuthority.LAB_LENSES`), restated here so this owner
 * chunk imports no lab authority at all. Presentation only, identical for every
 * round; nothing about any answer.
 */
const LENSES: RangefinderPublic["field"]["lenses"] = [
  { id: "field", label: "Field", maxUnits: 1500, ringEveryUnits: 100, labelEveryUnits: 500 },
  { id: "horizon", label: "Horizon", maxUnits: 6000, ringEveryUnits: 500, labelEveryUnits: 1000 },
];

/** The same short beat the original lab gave its stand-in server. */
const MIN_LOCK_BEAT_MS = 420;

export function toRangefinderPublic(r: RangefinderPublicRound): RangefinderPublic {
  const { champion, slot } = r.art;
  return {
    prompt: r.content.prompt,
    measureLabel: r.content.measureLabel,
    subject: {
      ...r.content.subject,
      media: { src: getAbilityIconUrl(champion, slot as AbilitySlot), alt: `${r.content.subject.label} (${champion} ${slot})` },
      originMedia: { src: getChampionSquareIconUrl(champion), alt: champion },
    },
    field: { unitLabel: r.content.field.unitLabel, stops: r.content.field.stops, lenses: LENSES },
    footnote: r.content.footnote,
  };
}

export function toRangefinderReveal(r: RangefinderServerReveal): RangefinderReveal {
  const delta = r.deltaUnits;
  return {
    lockedToken: r.lockedToken,
    canonicalToken: r.canonicalToken,
    verdict: r.verdict,
    measurement: { label: r.measurementLabel, valueText: formatUnits(r.canonicalUnits) },
    lockedText: formatUnits(r.lockedUnits),
    deltaText: delta === 0 ? null : `${delta > 0 ? "+" : "−"}${formatUnits(Math.abs(delta))} units`,
    note: r.note,
    source: r.source,
  };
}

interface Stage {
  key: string;
  content: RangefinderPublic;
  phase: InteractionPhase;
  value: RangefinderValue;
  reveal: RangefinderReveal | null;
  onChange: (token: string) => void;
  onLock: (response: RangefinderResponse) => void;
}
const StageContext = createContext<Stage | null>(null);

function Viewport() {
  const s = useContext(StageContext);
  const ref = useRef<HTMLDivElement>(null);
  // The host hands the primitive a definite height, as a Ranked module does (see useOwnerStageRoom).
  const maxHeight = useOwnerStageRoom(ref);
  if (!s) return null;
  return (
    <div ref={ref} data-testid="rangefinder-owner-viewport" className="flex min-h-0 flex-col">
      <Rangefinder key={s.key} content={s.content} phase={s.phase} value={s.value} maxHeight={maxHeight}
        onChange={s.onChange} onLock={s.onLock} reveal={s.reveal} />
    </div>
  );
}

const RENDERER: ModuleRenderer = {
  moduleId: "owner_playtest.rangefinder", moduleVersion: 1,
  ownsSubmission: true, ownsResultReveal: () => true,
  Viewport, projectQuestion: () => null, summaryLabel: () => null,
};

type Load = { state: "loading" } | { state: "ready"; session: RangefinderSession } | { state: "error"; message: string };

export default function RangefinderOwnerPlaytest({ lead, api: injected }: { lead: ReactNode; api?: PlaytestsApi }) {
  const api = useMemo(() => injected ?? playtestsApi(), [injected]);
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [generation, setGeneration] = useState(0);
  const [index, setIndex] = useState(0);
  const [value, setValue] = useState<RangefinderValue>(null);
  const [phase, setPhase] = useState<InteractionPhase>("open");
  const [reveal, setReveal] = useState<RangefinderReveal | null>(null);
  const [error, setError] = useState<{ message: string; expired: boolean } | null>(null);
  const [verdicts, setVerdicts] = useState<Record<number, RangefinderReveal["verdict"]>>({});
  const roundRef = useRef("");

  useEffect(() => {
    let cancelled = false;
    setLoad({ state: "loading" });
    api.startRangefinder()
      .then((session) => {
        if (cancelled) return;
        setLoad({ state: "ready", session });
        setIndex(0); setValue(null); setPhase("open"); setReveal(null); setError(null); setVerdicts({});
      })
      .catch((err: unknown) => { if (!cancelled) setLoad({ state: "error", message: describePlaytestError(err, "Dealing a Rangefinder session") }); });
    return () => { cancelled = true; };
  }, [api, generation]);

  const session = load.state === "ready" ? load.session : null;
  const round = session?.rounds[index] ?? null;
  const roundKey = session && round ? `${session.session_id}:${round.index}` : "";
  roundRef.current = roundKey;
  const content = useMemo(() => (round ? toRangefinderPublic(round) : null), [round]);

  const onLock = useCallback((response: RangefinderResponse) => {
    if (!session || !round) return;
    const key = `${session.session_id}:${round.index}`;
    setPhase("locked");
    setError(null);
    const beat = new Promise((r) => window.setTimeout(r, MIN_LOCK_BEAT_MS));
    Promise.all([api.lockRangefinder(session.session_id, round.index, response.stop), beat])
      .then(([result]) => {
        if (roundRef.current !== key) return;
        const next = toRangefinderReveal(result.reveal);
        setReveal(next);
        setVerdicts((v) => ({ ...v, [round.index]: next.verdict }));
        setPhase("revealed");
      })
      .catch((err: unknown) => {
        if (roundRef.current !== key) return;
        setPhase("open");
        setError({
          message: describePlaytestError(err, "Locking this round"),
          expired: err instanceof PlaytestApiError && err.code === "session_expired",
        });
      });
  }, [api, session, round]);

  const next = () => {
    setIndex((i) => i + 1);
    setValue(null); setPhase("open"); setReveal(null); setError(null);
  };
  const restart = () => setGeneration((g) => g + 1);

  if (load.state === "loading") return <SessionState mode="rangefinder" state="loading" />;
  if (load.state === "error") return <SessionState mode="rangefinder" state="error" message={load.message} onRetry={restart} />;
  if (!session || !round || !content) return <SessionState mode="rangefinder" state="error" message="The backend dealt an empty session." onRetry={restart} />;

  const counts = Object.values(verdicts);
  const tally = (v: RangefinderReveal["verdict"]) => counts.filter((x) => x === v).length;
  const stage: Stage = { key: roundKey, content, phase, value, reveal, onChange: setValue, onLock };
  const view = labArenaView({
    title: "Prototype · server-validated", renderer: RENDERER, phase, selection: value, reveal: null, verdict: null,
    revealId: 0, onSelect: () => {}, onSubmit: () => {},
    eyebrow: "Rangefinder · owner playtest", playtestNote: SERVER_PROTOTYPE_NOTE,
    left: <OwnerRail title="Round" testId="rangefinder-owner-rail-left" rows={[
      ["Round", `${index + 1} of ${session.rounds.length}`],
      ["Ability", round.content.subject.label],
      ["Champion", round.content.subject.sublabel],
      ["Pool", `${session.pool_size} cast ranges · historical capture`],
    ]} />,
    right: <OwnerRail title="Session" testId="rangefinder-owner-rail-right" rows={[
      ["Exact", String(tally("exact"))],
      ["Short", String(tally("short"))],
      ["Long", String(tally("long"))],
      ["Grading", "Exact stop on the 25-unit lattice, graded by the backend. Unrated."],
    ]} />,
  });

  const chrome = (
    <div data-testid="rangefinder-owner-chrome" className={`${arenaHeaderRowClass("wide")} flex-nowrap gap-x-2 overflow-x-auto whitespace-nowrap text-[11px] text-[#a9b3c1] [scrollbar-width:thin]`}>
      {lead}
      <RoundControls index={index} total={session.rounds.length} revealed={phase === "revealed"}
        onNext={next} onRestart={restart} testIdPrefix="rangefinder-owner" />
    </div>
  );

  return (
    <div data-testid="rangefinder-owner" data-phase={phase} data-round={index}>
      <StageContext.Provider value={stage}>
        <CanonicalArena view={view} chrome={chrome} />
      </StageContext.Provider>
      {error ? (
        <div role="alert" data-testid="rangefinder-owner-error" className="relative z-30 mx-auto flex max-w-3xl flex-wrap items-center gap-3 px-4 py-2 text-sm text-red-300">
          <span>{error.message}</span>
          {error.expired ? (
            <button type="button" onClick={restart} className="min-h-[36px] rounded border border-[#d5b66f] px-3 text-xs text-[#f6e6bb]">Start a new session</button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
