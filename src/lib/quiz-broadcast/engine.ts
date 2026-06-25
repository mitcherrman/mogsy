import type { QuizQuestion } from "@/lib/quiz/api";
import { quizApi } from "@/lib/quiz/api";
import {
  type BroadcastConfig,
  type BroadcastPhase,
  type EngineSnapshot,
  DEFAULT_CONFIG,
} from "./types";

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

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    fn(this.snapshot());
    return () => this.listeners.delete(fn);
  }

  snapshot(): EngineSnapshot {
    const q = this.playlist[this.currentIndex] ?? null;
    return {
      phase: this.phase,
      playing: this.playing,
      currentIndex: this.currentIndex,
      currentQuestion: q,
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
    };
  }

  private emit() {
    const s = this.snapshot();
    this.listeners.forEach((l) => l(s));
  }

  setPlaylist(questions: QuizQuestion[], meta?: { id?: string; name?: string }) {
    this.playlist = questions.slice();
    this.playlistId = meta?.id ?? null;
    this.playlistName = meta?.name ?? null;
    if (this.currentIndex >= this.playlist.length) this.currentIndex = 0;
    this.emit();
  }

  setConfig(next: Partial<BroadcastConfig>) {
    this.config = {
      ...this.config,
      ...next,
      timing: { ...this.config.timing, ...(next.timing ?? {}) },
      visuals: { ...this.config.visuals, ...(next.visuals ?? {}) },
    };
    this.emit();
  }

  start() {
    if (this.playlist.length === 0) return;
    if (this.playing) return;
    this.playing = true;
    if (this.startedAt == null) this.startedAt = Date.now();
    this.enterPhase("question");
  }

  pause() {
    if (!this.playing) return;
    this.playing = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.emit();
  }

  resume() {
    if (this.playing) return;
    if (this.playlist.length === 0) return;
    this.playing = true;
    // Resume by re-entering current phase with full duration (simple model).
    this.enterPhase(this.phase === "idle" ? "question" : this.phase);
  }

  stop() {
    this.playing = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.phase = "idle";
    this.currentIndex = 0;
    this.questionsPlayed = 0;
    this.startedAt = null;
    this.correctAnswer = null;
    this.explanation = null;
    this.repeatsCompleted = 0;
    this.playedHistory.clear();
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
    if (this.playlist.length === 0) return;
    const mode = this.config.playback;
    const len = this.playlist.length;
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
    // Try metadata first — mock data and overrides ship it inline.
    const meta = (question.metadata ?? {}) as Record<string, unknown>;
    const inlineAnswer = (meta.correct_answer as string | undefined) ?? null;
    const inlineExplanation = (meta.explanation as string | undefined) ?? null;
    if (inlineAnswer) {
      this.correctAnswer = inlineAnswer;
      this.explanation = inlineExplanation;
      return;
    }
    const id = ++this.revealRequestId;
    try {
      const firstChoice = question.choices?.[0];
      const sel = typeof firstChoice === "string" ? firstChoice : firstChoice?.label ?? "";
      const res = await quizApi.submitAnswer({
        user_id: "broadcast",
        question_id: question.id,
        selected_answer: sel,
      });
      if (id !== this.revealRequestId) return; // outdated
      this.correctAnswer = res.correct_answer ?? null;
      this.explanation = res.explanation ?? null;
    } catch {
      this.correctAnswer = null;
      this.explanation = null;
    }
    this.emit();
  }

  private enterPhase(phase: BroadcastPhase) {
    if (this.timer) clearTimeout(this.timer);
    this.phase = phase;
    this.phaseStartedAt = Date.now();
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
    this.emit();
    if (!this.playing || dur === 0) return;
    this.timer = setTimeout(() => this.nextPhase(), dur);
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
        return this.enterPhase("question");
      default:
        return;
    }
  }

  destroy() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.listeners.clear();
  }
}