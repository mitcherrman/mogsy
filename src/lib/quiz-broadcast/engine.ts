import type { QuizQuestion } from "@/lib/quiz/api";
import { quizApi } from "@/lib/quiz/api";
import {
  type BroadcastConfig,
  type BroadcastPhase,
  type BroadcastTiming,
  type BroadcastVisuals,
  type BroadcastSfxPatch,
  type EngineSnapshot,
  DEFAULT_CONFIG,
  mergeSfx,
} from "./types";
import {
  type ActiveBroadcastSession,
  clearActiveSession,
  newSessionId,
  saveActiveSession,
} from "./session";
import { blog } from "./log";

/** How often the independent watchdog samples engine progress. */
const WATCHDOG_INTERVAL_MS = 4000;
/**
 * Grace beyond a phase's own scheduled end before the watchdog treats it as
 * stalled. Keyed off `phaseEndsAt` (the real, possibly-long scene duration)
 * so intentionally long scenes never trip it — only a phase that has blown
 * well past its own timer counts as stuck.
 */
const WATCHDOG_GRACE_MS = 6000;
/** Consecutive stalled ticks before escalating from a soft retry to a hard reinit. */
const WATCHDOG_MAX_STRIKES = 3;
/** Reveal fetch retry policy — transient API blips shouldn't blank the insight card. */
const REVEAL_FETCH_RETRIES = 2;
const REVEAL_FETCH_RETRY_DELAY_MS = 600;

type ConfigPatch = Partial<Omit<BroadcastConfig, "timing" | "visuals" | "sfx">> & {
  timing?: Partial<BroadcastTiming>;
  visuals?: Partial<BroadcastVisuals>;
  sfx?: BroadcastSfxPatch;
};

type Listener = (s: EngineSnapshot) => void;

/**
 * BroadcastEngine
 * --------------------------------------------------------------------------
 * Authoritative state machine for the 24/7 quiz broadcast. Owns the phase
 * timeline, playlist progression, playback mode, and reveal-data fetching.
 * The Studio instantiates one engine; the Broadcast Window only renders the
 * snapshots produced by it (sync handled via BroadcastChannel).
 */
export class BroadcastEngine {
  private listeners = new Set<Listener>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private playlist: QuizQuestion[] = [];
  private playlistId: string | null = null;
  private playlistName: string | null = null;
  private config: BroadcastConfig = DEFAULT_CONFIG;
  private phase: BroadcastPhase = "idle";
  private currentIndex = 0;
  private playing = false;
  private phaseStartedAt = 0;
  private phaseDurationMs = 0;
  private questionsPlayed = 0;
  private startedAt: number | null = null;
  private correctAnswer: string | null = null;
  private explanation: string | null = null;
  private revealRequestId = 0;
  private repeatsCompleted = 0;
  private playedHistory: Set<string | number> = new Set();
  private sessionId: string = newSessionId();
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private hydrating = false;

  // --- Reliability instrumentation (24/7 self-recovery) ---------------------
  /** Independent recovery timer, decoupled from the phase-transition chain. */
  private watchdog: ReturnType<typeof setInterval> | null = null;
  /** Monotonic progress heartbeat — bumped on every phase entry. */
  private progressSeq = 0;
  /** Consecutive watchdog ticks that observed a stalled (overdue) phase. */
  private watchdogStrikes = 0;
  /**
   * Re-entrancy guard for phase advancement. Prevents a late phase timer and
   * a watchdog recovery from double-advancing. Always released in `finally`
   * so it can never latch permanently (the classic stuck-lock failure mode).
   */
  private transitionLock = false;

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    // Guard the immediate priming call the same way emit() guards fan-out — a
    // throwing subscriber must never break subscription or the caller.
    try {
      fn(this.snapshot());
    } catch (err) {
      blog("error", "listener.error", {
        message: err instanceof Error ? err.message : String(err),
        where: "subscribe",
      });
    }
    return () => this.listeners.delete(fn);
  }

  snapshot(): EngineSnapshot {
    const q = this.playlist[this.currentIndex] ?? null;
    return {
      phase: this.phase,
      playing: this.playing,
      currentIndex: this.currentIndex,
      currentQuestion: q,
      playlist: this.playlist,
      correctAnswer: this.correctAnswer,
      explanation: this.explanation,
      phaseStartedAt: this.phaseStartedAt,
      phaseDurationMs: this.phaseDurationMs,
      playlistLength: this.playlist.length,
      questionsPlayed: this.questionsPlayed,
      startedAt: this.startedAt,
      config: this.config,
      playlistId: this.playlistId,
      playlistName: this.playlistName,
      sessionId: this.sessionId,
    };
  }

  private emit() {
    const s = this.snapshot();
    // Isolate every listener: a single throwing subscriber (e.g. a
    // BroadcastChannel.postMessage DataCloneError, or a synchronous React
    // render error) must never propagate back into the state machine. Before
    // this guard, such a throw inside enterPhase() orphaned the phase timer
    // chain and froze the broadcast on a completed scene — the overnight
    // stall. Listener failures are logged and swallowed.
    this.listeners.forEach((l) => {
      try {
        l(s);
      } catch (err) {
        blog("error", "listener.error", {
          message: err instanceof Error ? err.message : String(err),
          phase: this.phase,
        });
      }
    });
    this.schedulePersist();
  }

  /** Build the durable session blob from current engine state. */
  private toSession(): ActiveBroadcastSession {
    return {
      schemaVersion: 1,
      sessionId: this.sessionId,
      startedAt: this.startedAt,
      updatedAt: Date.now(),
      playlistId: this.playlistId,
      playlistName: this.playlistName,
      questions: this.playlist,
      currentIndex: this.currentIndex,
      phase: this.phase,
      playing: this.playing,
      questionsPlayed: this.questionsPlayed,
      repeatsCompleted: this.repeatsCompleted,
      playedHistory: Array.from(this.playedHistory),
      phaseStartedAt: this.phaseStartedAt,
      phaseDurationMs: this.phaseDurationMs,
      phaseEndsAt: this.phaseStartedAt + this.phaseDurationMs,
      lastTickAt: Date.now(),
      config: this.config,
    };
  }

  private schedulePersist() {
    if (this.hydrating) return;
    if (this.persistTimer) return;
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      saveActiveSession(this.toSession());
    }, 200);
  }

  /** Force an immediate write (used on Start/Stop/Pause/Resume/Clear). */
  private persistNow() {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    if (this.hydrating) return;
    saveActiveSession(this.toSession());
  }

  /**
   * Rehydrate engine state from a persisted session. Called once by the
   * singleton on first construction. If `playing===true` and the previously
   * active phase still has remaining time, the engine re-enters that phase
   * with a timer for the remaining duration; otherwise it advances normally.
   */
  hydrateFromSession(session: ActiveBroadcastSession) {
    this.hydrating = true;
    try {
      this.sessionId = session.sessionId;
      this.playlist = session.questions.slice();
      this.playlistId = session.playlistId;
      this.playlistName = session.playlistName;
      this.config = session.config;
      this.currentIndex = Math.min(session.currentIndex, Math.max(0, this.playlist.length - 1));
      this.phase = session.phase;
      this.playing = session.playing;
      this.questionsPlayed = session.questionsPlayed;
      this.repeatsCompleted = session.repeatsCompleted;
      this.playedHistory = new Set(session.playedHistory);
      this.startedAt = session.startedAt;
      this.phaseStartedAt = session.phaseStartedAt;
      this.phaseDurationMs = session.phaseDurationMs;
    } finally {
      this.hydrating = false;
    }

    blog("info", "hydrate", {
      playing: this.playing,
      phase: this.phase,
      index: this.currentIndex,
      playlistLength: this.playlist.length,
    });

    // Resume phase timing if we were playing mid-phase.
    if (this.playing && this.phase !== "idle" && this.phaseDurationMs > 0) {
      this.startWatchdog();
      const remaining = session.phaseEndsAt - Date.now();
      if (remaining > 0) {
        // Re-arm timer for the remaining duration without resetting phaseStartedAt.
        if (this.timer) clearTimeout(this.timer);
        this.progressSeq++;
        const scheduledSeq = this.progressSeq;
        this.timer = setTimeout(() => this.onPhaseTimer(scheduledSeq), remaining);
        blog("debug", "timer.schedule", { phase: this.phase, ms: remaining, resumed: true, seq: scheduledSeq });
        // If we landed in "question", make sure reveal data refetches.
        if (this.phase === "question" && this.playlist[this.currentIndex]) {
          void this.fetchReveal(this.playlist[this.currentIndex]);
        }
        this.emit();
        return;
      }
      // Phase expired while we were gone — advance.
      this.onPhaseTimer();
      return;
    }
    this.emit();
  }

  setPlaylist(questions: QuizQuestion[], meta?: { id?: string; name?: string }) {
    this.playlist = questions.slice();
    if (meta) {
      this.playlistId = meta.id ?? null;
      this.playlistName = meta.name ?? null;
    }
    if (this.currentIndex >= this.playlist.length) this.currentIndex = 0;
    this.emit();
    this.persistNow();
  }

  setConfig(next: ConfigPatch) {
    this.config = {
      ...this.config,
      ...next,
      timing: { ...this.config.timing, ...(next.timing ?? {}) },
      visuals: { ...this.config.visuals, ...(next.visuals ?? {}) },
      sfx: mergeSfx(this.config.sfx, next.sfx),
    };
    this.emit();
    this.persistNow();
  }

  start() {
    if (this.playlist.length === 0) {
      blog("warn", "start", { skipped: "empty playlist" });
      return;
    }
    if (this.playing) return;
    this.playing = true;
    if (this.startedAt == null) this.startedAt = Date.now();
    blog("info", "start", { playlistLength: this.playlist.length, index: this.currentIndex });
    this.startWatchdog();
    this.enterPhase("question");
    this.persistNow();
  }

  pause() {
    if (!this.playing) return;
    this.playing = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.stopWatchdog();
    blog("info", "pause", { phase: this.phase, index: this.currentIndex });
    this.emit();
    this.persistNow();
  }

  resume() {
    if (this.playing) return;
    if (this.playlist.length === 0) return;
    this.playing = true;
    blog("info", "resume", { phase: this.phase, index: this.currentIndex });
    this.startWatchdog();
    // Resume by re-entering current phase with full duration (simple model).
    this.enterPhase(this.phase === "idle" ? "question" : this.phase);
    this.persistNow();
  }

  stop() {
    this.playing = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.stopWatchdog();
    blog("info", "stop", {});
    this.phase = "idle";
    this.currentIndex = 0;
    this.questionsPlayed = 0;
    this.startedAt = null;
    this.correctAnswer = null;
    this.explanation = null;
    this.revealRequestId++; // invalidate any in-flight reveal fetch
    this.repeatsCompleted = 0;
    this.playedHistory.clear();
    this.phaseStartedAt = 0;
    this.phaseDurationMs = 0;
    this.emit();
    this.persistNow();
  }

  /**
   * Destructive: wipes the active playlist + persisted session and rotates
   * the sessionId. This is the only path that drops the active playlist.
   */
  clearSession() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.stopWatchdog();
    blog("info", "clear", {});
    this.playing = false;
    this.phase = "idle";
    this.playlist = [];
    this.playlistId = null;
    this.playlistName = null;
    this.currentIndex = 0;
    this.questionsPlayed = 0;
    this.repeatsCompleted = 0;
    this.playedHistory.clear();
    this.startedAt = null;
    this.correctAnswer = null;
    this.explanation = null;
    this.revealRequestId++; // invalidate any in-flight reveal fetch
    this.phaseStartedAt = 0;
    this.phaseDurationMs = 0;
    this.sessionId = newSessionId();
    clearActiveSession();
    this.emit();
  }

  skip() {
    this.advanceIndex();
    if (this.playing) this.enterPhase("question");
    else this.emit();
  }

  previous() {
    if (this.playlist.length === 0) return;
    this.currentIndex = (this.currentIndex - 1 + this.playlist.length) % this.playlist.length;
    if (this.playing) this.enterPhase("question");
    else this.emit();
  }

  restartCurrent() {
    if (this.playing) this.enterPhase("question");
    else this.emit();
  }

  jumpTo(index: number) {
    if (index < 0 || index >= this.playlist.length) return;
    this.currentIndex = index;
    if (this.playing) this.enterPhase("question");
    else this.emit();
  }

  private advanceIndex() {
    if (this.playlist.length === 0) {
      blog("warn", "queue.empty", { where: "advanceIndex" });
      return;
    }
    const mode = this.config.playback;
    const len = this.playlist.length;
    // Defensive clamp: a corrupted/rehydrated index must never point past the
    // playlist or the current-question lookup returns null and the scene
    // renders blank forever.
    if (this.currentIndex < 0 || this.currentIndex >= len) {
      this.currentIndex = 0;
    }
    const currentId = this.playlist[this.currentIndex]?.id;
    if (currentId != null) this.playedHistory.add(currentId);
    this.questionsPlayed += 1;

    switch (mode) {
      case "loop_single":
        return; // stay on same index
      case "random":
      case "weighted_random":
      case "forever":
        this.currentIndex = Math.floor(Math.random() * len);
        return;
      case "random_no_repeat": {
        const remaining = this.playlist
          .map((q, i) => ({ q, i }))
          .filter((x) => !this.playedHistory.has(x.q.id));
        if (remaining.length === 0) {
          this.playedHistory.clear();
          this.currentIndex = Math.floor(Math.random() * len);
        } else {
          this.currentIndex = remaining[Math.floor(Math.random() * remaining.length)].i;
        }
        return;
      }
      case "repeat_n": {
        const nextIdx = this.currentIndex + 1;
        if (nextIdx >= len) {
          this.repeatsCompleted += 1;
          if (this.repeatsCompleted >= this.config.repeatCount) {
            this.stop();
            return;
          }
          this.currentIndex = 0;
        } else this.currentIndex = nextIdx;
        return;
      }
      case "loop_playlist":
      case "playlist_order":
      case "sequential":
      default: {
        const nextIdx = this.currentIndex + 1;
        if (nextIdx >= len) this.currentIndex = 0;
        else this.currentIndex = nextIdx;
      }
    }
  }

  private async fetchReveal(question: QuizQuestion) {
    // Every reveal fetch — including the synchronous inline path — bumps the
    // request id so any in-flight response for a previous question is
    // invalidated. Otherwise a slow API reveal can land after the engine has
    // advanced and overwrite the current question's answer/explanation.
    const id = ++this.revealRequestId;

    // Try metadata first — mock data and overrides ship it inline.
    const meta = (question.metadata ?? {}) as Record<string, unknown>;
    const inlineAnswer = (meta.correct_answer as string | undefined) ?? null;
    const inlineExplanation = (meta.explanation as string | undefined) ?? null;
    if (inlineAnswer) {
      this.correctAnswer = inlineAnswer;
      this.explanation = inlineExplanation;
      return;
    }
    const firstChoice = question.choices?.[0];
    const sel = typeof firstChoice === "string" ? firstChoice : firstChoice?.label ?? "";
    // Retry transient reveal fetches. This never gates phase progression (the
    // timer chain advances independently), so a total failure just leaves the
    // insight card blank rather than stalling — but retrying keeps content
    // healthy across API blips during a 24/7 run.
    for (let attempt = 0; attempt <= REVEAL_FETCH_RETRIES; attempt++) {
      blog("debug", "reveal.fetch", { questionId: question.id, attempt });
      try {
        const res = await quizApi.submitAnswer({
          user_id: "broadcast",
          question_id: question.id,
          selected_answer: sel,
        });
        if (id !== this.revealRequestId) return; // outdated
        this.correctAnswer = res.correct_answer ?? null;
        this.explanation = res.explanation ?? null;
        this.emit();
        return;
      } catch (err) {
        if (id !== this.revealRequestId) return; // outdated failure — keep current data
        if (attempt < REVEAL_FETCH_RETRIES) {
          blog("warn", "reveal.fetch.retry", {
            questionId: question.id,
            attempt,
            message: err instanceof Error ? err.message : String(err),
          });
          await new Promise((r) => setTimeout(r, REVEAL_FETCH_RETRY_DELAY_MS));
          if (id !== this.revealRequestId) return; // advanced while we waited
          continue;
        }
        blog("error", "reveal.fetch.fail", {
          questionId: question.id,
          message: err instanceof Error ? err.message : String(err),
        });
        this.correctAnswer = null;
        this.explanation = null;
        this.emit();
        return;
      }
    }
  }

  private enterPhase(phase: BroadcastPhase) {
    if (this.timer) {
      clearTimeout(this.timer);
      blog("debug", "timer.clear", { phase: this.phase });
    }
    this.timer = null;
    const prev = this.phase;
    this.phase = phase;
    this.phaseStartedAt = Date.now();
    // Progress heartbeat — the watchdog watches this to distinguish a healthy
    // (recently-advanced) engine from a stalled one.
    this.progressSeq++;
    const t = this.config.timing;
    let dur = 0;
    switch (phase) {
      case "question":
        dur = t.questionMs;
        this.correctAnswer = null;
        this.explanation = null;
        if (this.playlist[this.currentIndex]) {
          void this.fetchReveal(this.playlist[this.currentIndex]);
        }
        break;
      case "reveal":
        dur = t.revealMs;
        break;
      case "explanation":
        dur = t.explanationMs;
        break;
      case "transition":
        dur = t.transitionMs + t.delayBeforeNextMs;
        break;
      case "idle":
        dur = 0;
        break;
    }
    this.phaseDurationMs = dur;
    // Routine per-phase heartbeat — gated to debug so a 24/7 run doesn't flood
    // the console (~4–6 lines every scene). Lifecycle + anomalies stay at info+.
    blog("debug", "phase", {
      from: prev,
      to: phase,
      index: this.currentIndex,
      questionId: this.playlist[this.currentIndex]?.id ?? null,
      durationMs: dur,
      seq: this.progressSeq,
    });

    // Arm the next transition BEFORE emitting. `emit()` fans out to external
    // listeners; even though it is now fully guarded, scheduling first makes
    // it structurally impossible for snapshot fan-out to orphan the timer
    // chain. A healthy phase always has a scheduled successor.
    //
    // The scheduled callback captures the current generation (`progressSeq`).
    // Any subsequent phase entry — normal advance, manual skip/jump/previous,
    // watchdog recovery, pause/resume — bumps `progressSeq`, so a stale timer
    // callback that was already queued when the phase changed will no-op
    // instead of advancing the wrong phase. `clearTimeout` below stays as
    // first-line defense; the generation check covers the un-cancellable
    // "already-fired, callback queued" window that clearTimeout can't.
    if (this.playing && dur > 0) {
      const scheduledSeq = this.progressSeq;
      this.timer = setTimeout(() => this.onPhaseTimer(scheduledSeq), dur);
      blog("debug", "timer.schedule", { phase, ms: dur, seq: scheduledSeq });
    }
    this.emit();
  }

  /**
   * Guarded entry point for every scheduled phase transition. Wrapped so a
   * throw inside advancement can never kill the loop, and locked so a late
   * timer and a watchdog recovery cannot double-advance. The lock is always
   * released in `finally`.
   *
   * @param scheduledSeq generation captured when this callback was scheduled.
   *   Omitted by the watchdog recovery path (which intentionally forces an
   *   advance regardless of generation). When present and stale, the callback
   *   is a leftover from a phase that has since been superseded — skip it.
   */
  private onPhaseTimer(scheduledSeq?: number) {
    if (scheduledSeq != null && scheduledSeq !== this.progressSeq) {
      blog("debug", "timer.clear", {
        stale: true,
        scheduledSeq,
        currentSeq: this.progressSeq,
        phase: this.phase,
      });
      return;
    }
    if (this.transitionLock) {
      blog("warn", "lock", { skipped: true, phase: this.phase });
      return;
    }
    this.transitionLock = true;
    const from = this.phase;
    blog("debug", "transition.start", { from, index: this.currentIndex });
    try {
      this.nextPhase();
      blog("debug", "transition.success", { from, to: this.phase, index: this.currentIndex });
    } catch (err) {
      blog("error", "transition.start", {
        failed: true,
        from,
        message: err instanceof Error ? err.message : String(err),
      });
      // Don't leave the machine dead — let the watchdog pick up recovery on
      // its next tick (transitionLock is cleared in finally below).
    } finally {
      this.transitionLock = false;
    }
  }

  private nextPhase() {
    switch (this.phase) {
      case "question":
        return this.enterPhase("reveal");
      case "reveal":
        return this.enterPhase("explanation");
      case "explanation":
        return this.enterPhase("transition");
      case "transition":
        this.advanceIndex();
        blog("debug", "advance", {
          index: this.currentIndex,
          questionId: this.playlist[this.currentIndex]?.id ?? null,
          questionsPlayed: this.questionsPlayed,
          queueLength: this.playlist.length,
        });
        return this.enterPhase("question");
      default:
        return;
    }
  }

  // --- Watchdog -------------------------------------------------------------
  /**
   * Start the independent recovery timer. Decoupled from the phase-transition
   * setTimeout chain, so if that chain dies (thrown listener, cleared-and-
   * never-rescheduled timer, rejected async path) the watchdog still fires and
   * restores progression. Idempotent.
   */
  private startWatchdog() {
    if (this.watchdog) return;
    this.watchdogStrikes = 0;
    this.watchdog = setInterval(() => {
      try {
        this.watchdogTick();
      } catch (err) {
        blog("error", "watchdog.tick", {
          failed: true,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }, WATCHDOG_INTERVAL_MS);
    blog("info", "watchdog.tick", { started: true, intervalMs: WATCHDOG_INTERVAL_MS });
  }

  private stopWatchdog() {
    if (this.watchdog) {
      clearInterval(this.watchdog);
      this.watchdog = null;
    }
    this.watchdogStrikes = 0;
  }

  /** Exposed for tests: run a single watchdog evaluation synchronously. */
  runWatchdogCheck() {
    this.watchdogTick();
  }

  private watchdogTick() {
    if (!this.playing || this.phase === "idle" || this.phaseDurationMs <= 0) return;
    const now = Date.now();
    const phaseEndsAt = this.phaseStartedAt + this.phaseDurationMs;
    const overdue = now - phaseEndsAt;
    blog("debug", "watchdog.tick", {
      phase: this.phase,
      overdueMs: overdue,
      seq: this.progressSeq,
      strikes: this.watchdogStrikes,
    });

    // Within the scene (plus grace) — a long scene is not a stall.
    if (overdue <= WATCHDOG_GRACE_MS) {
      this.watchdogStrikes = 0;
      return;
    }

    this.watchdogStrikes += 1;
    blog("warn", "watchdog.stall", {
      phase: this.phase,
      overdueMs: overdue,
      strikes: this.watchdogStrikes,
      sessionId: this.sessionId,
      playlistId: this.playlistId,
      index: this.currentIndex,
      questionId: this.playlist[this.currentIndex]?.id ?? null,
      queueLength: this.playlist.length,
    });

    if (this.watchdogStrikes >= WATCHDOG_MAX_STRIKES) {
      this.watchdogFallback();
      return;
    }

    // Soft recovery: perform the transition the dead timer owed us. This clears
    // and re-arms the timer chain via enterPhase().
    blog("info", "watchdog.recover", { phase: this.phase, index: this.currentIndex });
    this.onPhaseTimer();
  }

  /**
   * Last-resort recovery when soft retries failed WATCHDOG_MAX_STRIKES times.
   * Rebuilds/clamps the queue and hard-reinitialises the phase cycle from a
   * clean question scene. Never destroys the playlist.
   */
  private watchdogFallback() {
    this.watchdogStrikes = 0;
    blog("error", "watchdog.fallback", {
      phase: this.phase,
      index: this.currentIndex,
      queueLength: this.playlist.length,
    });

    if (this.playlist.length === 0) {
      // Nothing to broadcast — stop cleanly rather than spin forever.
      blog("error", "queue.empty", { where: "watchdogFallback" });
      this.stop();
      return;
    }

    // Rebuild the play cursor into a known-good state.
    if (this.currentIndex < 0 || this.currentIndex >= this.playlist.length) {
      this.currentIndex = 0;
    }
    blog("info", "queue.refill", {
      index: this.currentIndex,
      queueLength: this.playlist.length,
    });

    this.transitionLock = false; // paranoia: never carry a stuck lock into reinit
    try {
      this.enterPhase("question");
    } catch (err) {
      blog("error", "watchdog.fallback", {
        reinitFailed: true,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  destroy() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.stopWatchdog();
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = null;
    this.listeners.clear();
  }
}