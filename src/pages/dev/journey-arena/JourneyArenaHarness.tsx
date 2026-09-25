/**
 * JOURNEY-UI2/UI3 — dev-only harness: REAL J3 captures, replayed through the
 * REAL client path.
 *
 * Each step is one captured `GET /api/ranked/matches/{id}` envelope from a real
 * Bot match on the canonical DB (`lib/journey/__fixtures__/j3`). It goes
 * through the production parser (`readPublicRound`), the production module
 * renderer (`masterySliceModule`, which mounts the Journey board) and the
 * production `CanonicalArena` (banner flanks with the Journey crest on a
 * desktop, the phone match bar below `lg`).
 *
 * THE SERVER IS SIMULATED ONLY IN TIME. Server "now" is pinned to the
 * snapshot's own capture instant (`skewMs`) and runs on in real time, so a
 * beat snapshot ends at the server's own `own_card_started_at`. "Play" steps
 * to the next capture after the captured gap — the next poll. Nothing is
 * invented: no fixture value, no clock, no state.
 *
 * A Survival snapshot whose ruleset says `own_stage_finished` renders the way
 * the hosted Daily arena does at that instant: gameplay gone, the host's
 * placeholder up (`QuizRankedMatch`'s DC-SURV-UX branch).
 *
 *   /dev/journey-arena?capture=zed&step=6
 */
import { useEffect, useMemo, useState } from "react";
import { CanonicalArena } from "@/components/ranked-arena/CanonicalArena";
import { masterySliceModule } from "@/lib/ranked-core/modules/masterySliceModule";
import { readPublicRound, type PublicRoundView } from "@/lib/ranked-public/contracts";
import { journeyRailsFor } from "@/lib/journey/rail";
import { J3_CAPTURES, loadCapture, type CaptureKey, type CaptureSnapshot } from "@/lib/journey/realFixtures";
import { projectJourneyTimer } from "@/pages/quiz-ranked/rankedViews";
import type { ArenaRail, ArenaViewModel } from "@/lib/ranked-core/arenaView";
import { NO_INTERACTIONS, type CombatantView } from "@/lib/ranked-core/viewTypes";

const combatant = (over: Partial<CombatantView>): CombatantView => ({
  playerId: "you", name: "You", tag: "Jungle", side: "player", classId: "tank",
  roleId: "jungle", identityMode: "role", score: 0,
  hp: 150, maxHp: 170, xp: 0, level: 1, nextLevelThreshold: null,
  currentLevelThreshold: 0, hasSubmitted: false, abilityWindow: null,
  hasAbilitySelected: false, ...over,
});

export function journeyArenaView(round: PublicRoundView, at: string, skewMs: number): ArenaViewModel {
  const seg = round.segmentState!;
  const rails = seg.journey ? journeyRailsFor(seg.journey, {
    ownNextChallengeIndex: seg.ownNextChallengeIndex,
    ownCardStartedAt: seg.ownCardStartedAt, ownFinished: seg.ownFinished,
  }) : null;
  const rail = (which: "player" | "opponent"): ArenaRail => ({
    kind: "combatant",
    combatant: which === "player" ? combatant({})
      : combatant({ playerId: "opp", name: "Bot", side: "opponent", roleId: "top", tag: "Top" }),
    presentation: "banner", damage: [], outcome: null, damageDealt: null, feedback: null,
    reaction: null, award: null,
    journey: rails ? rails[which === "player" ? "subject" : "opponent"] : null,
  });
  // The header clock is the production Journey clock (`projectJourneyTimer`):
  // Standard's pooled active time, Survival's per-child window.
  const timer = projectJourneyTimer(seg, skewMs, Date.now());
  return {
    header: {
      eyebrow: "", title: "Module 10 / 10", transitionNote: null, playtestNote: null, presenceNote: null,
      timer, timerLabel: "Journey timer",
      centralResult: null, moduleTitle: null, moduleEventId: null,
    },
    roundBeat: null, segmentBeat: null, cardBeat: null,
    left: rail("player"), right: rail("opponent"),
    surface: {
      renderer: masterySliceModule,
      publicRound: round, segmentState: seg, selection: null,
      permissions: NO_INTERACTIONS,
      actions: { submitChallenge: () => {}, busy: false, error: null },
      skewMs, reveal: null, onSelect: () => {}, ownsSubmission: true,
      inputOpen: true, hasContent: true,
    },
    abilityHud: null, status: null, hudAction: null,
    timeline: {
      visibleNodes: 1, anchorIndex: 0, windowStart: 9, currentIndex: 0, currentRoundNumber: 10,
      anchored: true,
      nodes: [{ roundNumber: 10, index: 0, visible: true, state: "current",
        segmentKind: null, outcome: null, tag: null, topic: null }],
    },
    revealHold: false, progressionEnabled: false,
  } as ArenaViewModel;
}

function readParams(): { capture: CaptureKey; step: number } {
  const p = new URLSearchParams(window.location.search);
  const c = (p.get("capture") ?? "zed") as CaptureKey;
  return { capture: c in J3_CAPTURES ? c : "zed", step: Math.max(0, Number(p.get("step") ?? "1") || 0) };
}

export default function JourneyArenaHarness() {
  const initial = useMemo(readParams, []);
  const [capture, setCapture] = useState<CaptureKey>(initial.capture);
  const [snaps, setSnaps] = useState<CaptureSnapshot[] | null>(null);
  const [step, setStep] = useState(initial.step);
  const [shownAt, setShownAt] = useState(() => Date.now());
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    let alive = true;
    setSnaps(null);
    void loadCapture(capture).then((s) => { if (alive) setSnaps(s); });
    return () => { alive = false; };
  }, [capture]);

  const go = (n: number) => { setStep(n); setShownAt(Date.now()); };
  const snap: CaptureSnapshot | null = snaps ? snaps[Math.min(step, snaps.length - 1)] : null;
  const round = useMemo(() => (snap ? readPublicRound(snap.envelope) : null), [snap]);
  // Server now = the capture instant, running on from the moment it was shown.
  const skewMs = snap ? Date.parse(snap.at) - shownAt : 0;

  useEffect(() => {
    if (!playing || !snaps || step >= snaps.length - 1) return;
    const gap = Date.parse(snaps[step + 1].at) - Date.parse(snaps[step].at);
    const id = window.setTimeout(() => go(step + 1), Math.min(Math.max(gap, 600), 4000));
    return () => window.clearTimeout(id);
  }, [playing, snaps, step]);

  // Strike 3, or the match already settled (the last child's answer completes
  // a one-module capture): the hosted Daily shows its placeholder here.
  const stopped = round?.ruleset?.ownStageFinished === true || (round !== null && !round.segmentState);
  const chrome = (
    <p className="text-sm font-semibold">
      Daily Challenge · Journey · J3 capture: {capture} · {snap?.label ?? "…"}
    </p>
  );
  return (
    <div data-testid="journey-arena-harness" data-capture={capture} data-label={snap?.label} className="relative">
      <nav aria-label="Journey capture controls"
        className="fixed bottom-2 left-1/2 z-[60] flex max-w-[96vw] -translate-x-1/2 flex-wrap items-center justify-center gap-1 rounded-md border border-white/15 bg-black/85 px-2 py-1 text-[11px] text-white">
        <select data-testid="harness-capture" value={capture} className="bg-black"
          onChange={(e) => { setCapture(e.target.value as CaptureKey); go(1); }}>
          {Object.keys(J3_CAPTURES).map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
        <button type="button" data-testid="harness-prev" disabled={step === 0} onClick={() => go(step - 1)}
          className="px-1.5 disabled:opacity-30">◀</button>
        <span data-testid="harness-step">{step + 1}/{snaps?.length ?? "…"} {snap?.label}</span>
        <button type="button" data-testid="harness-next" disabled={!snaps || step >= snaps.length - 1}
          onClick={() => go(step + 1)} className="px-1.5 disabled:opacity-30">▶</button>
        <button type="button" data-testid="harness-play" onClick={() => setPlaying((p) => !p)} className="px-1.5">
          {playing ? "Pause" : "Play"}
        </button>
      </nav>
      {!round || !snap ? (
        <p className="p-8 text-sm text-muted-foreground">Loading capture…</p>
      ) : stopped ? (
        <CanonicalArena view={null} chrome={chrome}
          recovering={{ eyebrow: "Daily Challenge", message: "Stage complete…" }} />
      ) : (
        <CanonicalArena key={capture} view={journeyArenaView(round, snap.at, skewMs)} chrome={chrome} />
      )}
    </div>
  );
}
