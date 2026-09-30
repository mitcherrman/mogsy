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
 *
 * JP4 — THE HOST IS MODELLED. The flanks are the HOST's, as in production
 * (`QuizRankedMatch`): the admin reference Journey (`jref-*`) is an unhosted
 * Ranked Bot match, so its flanks draw the Journey crest; every other capture
 * is a Daily stage (Standard or Survival), whose flanks keep the Daily's own
 * presentation. `?host=ranked|daily` overrides.
 *
 * JP5 — A PROBE FOR THE REVEAL WINDOW (`?revealMs=3500`). DEV ONLY: it rewrites
 * the captured snapshot's `reveal_window_ms` (and the instants that follow
 * from it) before the production parser reads it, so the real client path runs
 * the reveal it WOULD run if the server froze that window. It changes no
 * server, no fixture file and no production default: without the parameter the
 * captures replay at the window they were captured with.
 *
 * `&revealChild=3` limits the probe to ONE child's reveal (0-based): every other
 * reveal keeps its captured window — a preview of a per-child reveal window,
 * which the server does not serve today.
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

export type HarnessHost = "ranked" | "daily";

/** The host a capture was recorded under: the admin reference is Ranked; the rest are Daily stages. */
export const hostOfCapture = (capture: string): HarnessHost => (capture.startsWith("jref") ? "ranked" : "daily");

export function journeyArenaView(round: PublicRoundView, at: string, skewMs: number, host: HarnessHost = "ranked"): ArenaViewModel {
  const seg = round.segmentState!;
  // A hosted (Daily) match keeps its own columns: no Journey rails.
  const rails = seg.journey && host === "ranked" ? journeyRailsFor(seg.journey, {
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

/**
 * JP5 — one capture, as the server would have sent it with a different frozen
 * reveal window (dev / probe / tests only; see the header). On a snapshot that
 * is revealing, the reveal starts at the snapshot's own instant and the next
 * card keeps the gap it was captured with after it. With `child`, only that
 * child's reveal is rewritten.
 */
export function withRevealWindow(snap: CaptureSnapshot, ms: number, child: number | null = null): CaptureSnapshot {
  const envelope = structuredClone(snap.envelope) as { payload?: { segment_state?: Record<string, unknown> | null } };
  const seg = envelope.payload?.segment_state;
  if (!seg || typeof seg.reveal_window_ms !== "number") return snap;
  if (child !== null && seg.own_revealing_card_index !== child) return snap;
  seg.reveal_window_ms = ms;
  if (seg.own_revealing_card_index !== null && typeof seg.own_reveal_until === "string") {
    const until = Date.parse(snap.at) + ms;
    if (typeof seg.own_card_started_at === "string") {
      const lag = Date.parse(seg.own_card_started_at) - Date.parse(seg.own_reveal_until);
      seg.own_card_started_at = new Date(until + lag).toISOString();
    }
    seg.own_reveal_until = new Date(until).toISOString();
  }
  return { ...snap, envelope: envelope as CaptureSnapshot["envelope"] };
}

function readParams(): {
  capture: CaptureKey; step: number; host: HarnessHost | null; revealMs: number | null; revealChild: number | null;
} {
  const p = new URLSearchParams(window.location.search);
  const c = (p.get("capture") ?? "zed") as CaptureKey;
  const h = p.get("host");
  const ms = Number(p.get("revealMs"));
  const child = p.get("revealChild");
  return {
    capture: c in J3_CAPTURES ? c : "zed", step: Math.max(0, Number(p.get("step") ?? "1") || 0),
    host: h === "ranked" || h === "daily" ? h : null,
    revealMs: Number.isInteger(ms) && ms > 0 ? ms : null,
    revealChild: child !== null && /^\d+$/.test(child) ? Number(child) : null,
  };
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
  const captured: CaptureSnapshot | null = snaps ? snaps[Math.min(step, snaps.length - 1)] : null;
  const snap = useMemo(() => (captured && initial.revealMs
    ? withRevealWindow(captured, initial.revealMs, initial.revealChild) : captured),
  [captured, initial.revealMs, initial.revealChild]);
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
  const host = initial.host ?? hostOfCapture(capture);
  // One truncating line: the dev label must never change the page's height
  // (a label that wraps differently per snapshot would move the stage).
  const chrome = (
    <p className="truncate text-sm font-semibold">
      {host === "ranked" ? "Ranked Bot · Reference Journey" : "Daily Challenge · Journey"} · capture: {capture} · {snap?.label ?? "…"}
      {initial.revealMs ? ` · probe reveal ${initial.revealMs}ms${initial.revealChild !== null ? ` (step ${initial.revealChild + 1} only)` : ""}` : ""}
    </p>
  );
  return (
    <div data-testid="journey-arena-harness" data-capture={capture} data-label={snap?.label} data-host={host}
      data-reveal-ms={initial.revealMs ?? undefined} className="relative">
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
        <CanonicalArena key={capture} view={journeyArenaView(round, snap.at, skewMs, host)} chrome={chrome} />
      )}
    </div>
  );
}
