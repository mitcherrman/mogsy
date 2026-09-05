/**
 * PT1.7B — the Premium Practice Builder, on the Leaguecraft lobby.
 *
 * IT BUILDS A LIST; THE EXISTING RUNNER PLAYS IT.
 * This component never renders a question, never grades one and never owns a
 * session. It resolves a configuration into an answer-safe question list and
 * hands that list to the host through `onStartSession` — the same handoff
 * PT1.7A's "practise the ones you missed" already uses. There is no second
 * Practice engine here, and adding one would be the main thing this phase
 * exists to avoid.
 *
 * THE PAYWALL IS PRESENTATION.
 * Everything gated is gated on the server. What this file does with
 * `capability` is decide what to DRAW — and it draws from the capability's
 * fields rather than from a tier name, so a future achievement-earned Free
 * slot needs no branch here: such a reader simply arrives with `can_build`
 * true and a shorter `allowed_pools`, and the panel already renders that.
 *
 * PT1.8 HANDS IT A PRESET; IT DOES NOT HAND PT1.8 A SECOND BUILDER.
 * The Trends pane's "practise this" is a `preset` on this panel, applied
 * through the SAME `setConfig` a reader's own click goes through, so the
 * preview, the pool rules, the Pro Play opt-in mirror and the build path are
 * one code path with one behaviour. A weakness handoff that assembled its own
 * request would be a second builder with a second set of rules to keep true.
 *
 * FILTERS THE PRODUCT DOES NOT HAVE ARE STATED, NOT HIDDEN.
 * `quiz_questions` carries no champion or item column — that information lives
 * only in the answer-bearing metadata this API never projects — so champion and
 * matchup targeting are named as absent rather than shipped as empty controls
 * that would look broken.
 */
import { useEffect, useRef, useState } from "react";
import { Loader2, SlidersHorizontal, Sparkles, Target, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import type { QuizQuestion } from "@/lib/quiz/api";
import {
  builderApi,
  isPremiumRefusal,
  shortfallReason,
  type BuilderPool,
  type SavedSet,
} from "@/lib/quiz/builderApi";
import { usePracticeBuilder } from "./usePracticeBuilder";
import { trackFunnelEvent } from "@/lib/funnel-analytics";

const POOL_HINTS: Record<BuilderPool, string> = {
  bank: "Anything the Academy can ask.",
  owned: "Questions you have permanently collected in Ranked.",
  missed: "Questions you have answered wrongly before.",
  weak: "The categories your recent results say you are weakest at.",
};

/** A configuration handed in from elsewhere on the page. `nonce` is what makes
 *  pressing the same weak category twice apply twice: the values may be
 *  identical, and the reader still asked for it again. */
export type BuilderPreset = {
  pool?: BuilderPool;
  category?: string | null;
  nonce: number;
};

export default function PracticeBuilderPanel({
  open,
  onStartSession,
  preset,
  onPresetApplied,
}: {
  open: boolean;
  /** Hand the built list to the host's existing Practice runner. */
  onStartSession: (questions: QuizQuestion[], label: string) => void;
  /** PT1.8: a configuration to adopt, e.g. from a recurring weak category. */
  preset?: BuilderPreset | null;
  /** Fired once a preset has been adopted, so the host can scroll here. */
  onPresetApplied?: () => void;
}) {
  const state = usePracticeBuilder(open);
  const [building, setBuilding] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [sets, setSets] = useState<SavedSet[]>([]);
  const appliedPreset = useRef<number | null>(null);

  useEffect(() => setSets(state.sets), [state.sets]);
  useEffect(() => {
    if (open) trackFunnelEvent("practice_builder_opened", {});
  }, [open]);

  /* PT1.8's handoff. It applies ONLY once the server has said this caller may
     build: a preset that landed on a Free panel would silently rewrite a
     configuration nobody can run, and the paywall below would then be showing
     someone else's choice back to them. */
  useEffect(() => {
    if (!preset || !open) return;
    if (!state.capability?.can_build) return;
    if (appliedPreset.current === preset.nonce) return;
    appliedPreset.current = preset.nonce;
    state.setConfig({
      pool: preset.pool ?? "weak",
      ...(preset.category !== undefined ? { category: preset.category } : {}),
    });
    onPresetApplied?.();
    // `state` is recreated each render; the nonce is the real dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset?.nonce, open, state.capability?.can_build]);

  if (!open) return null;

  if (state.loading) {
    return (
      <div data-testid="practice-builder-loading" className="flex items-center gap-2 p-4 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
        Loading the builder…
      </div>
    );
  }

  const capability = state.capability;
  const catalog = state.catalog;

  /**
   * A FAILURE IS NOT A PAYWALL.
   *
   * This branch has to come first. Without it, any catalog request that did
   * not return — a 503 from an entitlement lookup that could not run, a 404
   * from a backend that has not deployed these routes yet, a dropped
   * connection — leaves `capability` null, falls into the `!can_build` test
   * below, and tells a paying subscriber they need to subscribe. That is the
   * single worst thing this panel can say, and it is the mistake the backend's
   * 503-not-Free policy exists to prevent; the client has to hold the same
   * line or the policy stops at the network boundary.
   */
  if (state.error && !capability) {
    return (
      <div data-testid="practice-builder-error" className="rounded-lg border border-border/50 bg-card/60 p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.16em] text-primary/80">
          <SlidersHorizontal className="h-4 w-4" aria-hidden />
          Practice Builder
        </h3>
        <p className="mt-2 text-xs text-muted-foreground">
          The builder is unavailable right now. This is not a subscription
          problem — nothing about your account changed.
        </p>
        <Button size="sm" variant="outline" className="mt-3"
                data-testid="builder-retry" onClick={state.reload}>
          Try again
        </Button>
      </div>
    );
  }

  // The paywall. Drawn from `can_build`, never from a tier the client guessed.
  if (!capability?.can_build) {
    return (
      <div data-testid="practice-builder-locked" className="rounded-lg border border-[#c9a84c]/30 bg-card/60 p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.16em] text-primary/80">
          <SlidersHorizontal className="h-4 w-4" aria-hidden />
          Practice Builder
        </h3>
        <p className="mt-2 text-xs text-muted-foreground">
          Build your own practice sets — from the whole bank, from questions you
          own, from the ones you have missed, or from your weakest categories.
          Mogzy Premium.
        </p>
        {sets.length > 0 && (
          // A lapsed subscriber keeps their sets, and is told so plainly.
          <p className="mt-2 text-xs text-muted-foreground" data-testid="builder-lapsed-note">
            Your {sets.length} saved {sets.length === 1 ? "set is" : "sets are"} still
            here, and stay yours.
          </p>
        )}
        <Button asChild size="sm" className="mt-3">
          <a href="/lol/premium">See Mogzy Premium</a>
        </Button>
      </div>
    );
  }

  const owned = catalog?.pools.find((p) => p.value === "owned")?.owned;
  const preview = state.preview;

  const runBuild = async () => {
    setBuilding(true);
    trackFunnelEvent("practice_builder_build_attempted", { pool: state.config.pool });
    try {
      const result = await builderApi.session(state.config);
      if (result.status !== "ready" || !result.questions?.length) {
        toast.error(shortfallReason(result));
        return;
      }
      trackFunnelEvent("practice_builder_build_succeeded", {
        pool: result.config.pool,
        total_questions: result.questions.length,
      });
      onStartSession(result.questions, "Custom practice");
    } catch (err) {
      toast.error(isPremiumRefusal(err)
        ? "Mogzy Premium is required to build a custom set."
        : "Could not build that set.");
    } finally {
      setBuilding(false);
    }
  };

  const runSaved = async (set: SavedSet) => {
    try {
      const result = await builderApi.runSet(set.id);
      if (result.status !== "ready" || !result.questions?.length) {
        toast.error(shortfallReason(result));
        return;
      }
      trackFunnelEvent("practice_builder_set_run", { total_questions: result.questions.length });
      onStartSession(result.questions, set.name);
    } catch (err) {
      toast.error(isPremiumRefusal(err)
        ? "Mogzy Premium is required to run a saved set."
        : "Could not run that set.");
    }
  };

  const saveCurrent = async () => {
    const name = saveName.trim();
    if (!name) return;
    try {
      const { set } = await builderApi.createSet(name, state.config);
      setSets((current) => [set, ...current]);
      setSaveName("");
      trackFunnelEvent("practice_builder_set_created", { pool: state.config.pool });
      toast.success(`Saved “${set.name}”.`);
    } catch (err) {
      toast.error(err instanceof Error && err.message.includes("DUPLICATE_NAME")
        ? "You already have a set with that name."
        : "Could not save that set.");
    }
  };

  const removeSaved = async (set: SavedSet) => {
    try {
      await builderApi.deleteSet(set.id);
      setSets((current) => current.filter((s) => s.id !== set.id));
    } catch {
      toast.error("Could not delete that set.");
    }
  };

  return (
    <div data-testid="practice-builder" className="rounded-lg border border-[#c9a84c]/30 bg-card/60 p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.16em] text-primary/80">
        <SlidersHorizontal className="h-4 w-4" aria-hidden />
        Practice Builder
      </h3>

      {/* Pools */}
      <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Question source">
        {catalog?.pools
          .filter((pool) => capability.allowed_pools.includes(pool.value))
          .map((pool) => (
            <button
              key={pool.value}
              type="button"
              data-testid={`builder-pool-${pool.value}`}
              data-selected={state.config.pool === pool.value}
              aria-pressed={state.config.pool === pool.value}
              onClick={() => state.setConfig({ pool: pool.value })}
              className={`rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                state.config.pool === pool.value
                  ? "border-primary/60 bg-primary/10 text-foreground"
                  : "border-border/50 text-muted-foreground hover:border-primary/40"
              }`}
            >
              {pool.label}
            </button>
          ))}
      </div>
      <p className="mt-1.5 text-[11px] text-muted-foreground">
        {POOL_HINTS[state.config.pool]}
      </p>

      {/* F2: the honest OWNED ratio, and what the remainder is — not a loss. */}
      {state.config.pool === "owned" && owned && (
        <p className="mt-1.5 text-[11px] text-muted-foreground" data-testid="builder-owned-compatibility">
          {owned.runnable} of your {owned.total_owned} owned{" "}
          {owned.total_owned === 1 ? "question" : "questions"} can currently be
          practised here. The rest are Ranked and Mastery questions — they are
          still yours and still in your library, they just are not part of this
          practice bank.
        </p>
      )}

      {state.config.pool === "weak" && (
        <p className="mt-1.5 text-[11px] text-muted-foreground" data-testid="builder-weak-scope">
          Worked out from your Practice and Time Trial answers over the last 90
          days. Ranked, the Daily Challenge and Mastery keep their own records
          and are not counted.
        </p>
      )}

      {/* Filters */}
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="text-[11px] text-muted-foreground">
          Category
          <select
            data-testid="builder-category"
            className="mt-1 h-8 w-full rounded-md border border-border/60 bg-background/60 px-2 text-xs"
            value={state.config.category ?? ""}
            onChange={(e) => state.setConfig({ category: e.target.value || null })}
          >
            <option value="">Any category</option>
            {catalog?.categories.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label} ({option.count}){option.opt_in ? " — opt in" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[11px] text-muted-foreground">
          Subject
          <select
            data-testid="builder-source-type"
            className="mt-1 h-8 w-full rounded-md border border-border/60 bg-background/60 px-2 text-xs"
            value={state.config.source_type ?? ""}
            onChange={(e) => state.setConfig({ source_type: e.target.value || null })}
          >
            <option value="">Any subject</option>
            {catalog?.source_types.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label} ({option.count})
              </option>
            ))}
          </select>
        </label>
        <label className="text-[11px] text-muted-foreground">
          Hardest difficulty
          <select
            data-testid="builder-difficulty-max"
            className="mt-1 h-8 w-full rounded-md border border-border/60 bg-background/60 px-2 text-xs"
            value={state.config.difficulty_max}
            onChange={(e) => state.setConfig({ difficulty_max: Number(e.target.value) })}
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>
        <label className="text-[11px] text-muted-foreground">
          Questions
          <select
            data-testid="builder-length"
            className="mt-1 h-8 w-full rounded-md border border-border/60 bg-background/60 px-2 text-xs"
            value={state.config.length}
            onChange={(e) => state.setConfig({ length: Number(e.target.value) })}
          >
            {capability.allowed_lengths.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>
      </div>

      {/* What the product does not offer, said out loud. */}
      {catalog?.unsupported_filters?.length ? (
        <p className="mt-2 text-[11px] text-muted-foreground/80" data-testid="builder-unsupported">
          No champion or matchup filter yet — the bank does not record which
          champion a question is about in a way this can safely read.
        </p>
      ) : null}

      {/* Preview — the honest count, before anything is built. */}
      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-[11px] text-muted-foreground" data-testid="builder-preview">
          {state.previewing
            ? "Counting…"
            : preview
            ? preview.status === "ready"
              ? `${preview.available} questions match. Building ${preview.requested}.`
              : shortfallReason(preview)
            : ""}
        </p>
        <Button
          size="sm"
          data-testid="builder-build"
          disabled={building || preview?.status === "insufficient_pool"}
          onClick={runBuild}
        >
          {building ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" aria-hidden />
                    : <Target className="mr-2 h-3.5 w-3.5" aria-hidden />}
          Build session
        </Button>
      </div>

      {/* Saved sets */}
      <div className="mt-4 border-t border-border/40 pt-3">
        <div className="flex items-center gap-2">
          <Input
            data-testid="builder-save-name"
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            placeholder="Name this set…"
            className="h-8 text-xs"
            maxLength={60}
          />
          <Button size="sm" variant="outline" data-testid="builder-save"
                  disabled={!saveName.trim() || !capability.can_save}
                  onClick={saveCurrent}>
            <Sparkles className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            Save
          </Button>
        </div>
        {sets.length > 0 && (
          <ul className="mt-2 flex flex-col gap-1" data-testid="builder-saved-sets">
            {sets.map((set) => (
              <li key={set.id} className="flex items-center gap-2 rounded-md border border-border/40 px-2 py-1">
                <span className="min-w-0 flex-1 truncate text-[11px]">{set.name}</span>
                <button type="button" data-testid={`builder-run-${set.id}`}
                        className="text-[11px] text-primary hover:underline"
                        onClick={() => runSaved(set)}>
                  Run
                </button>
                <button type="button" data-testid={`builder-delete-${set.id}`}
                        aria-label={`Delete ${set.name}`}
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => removeSaved(set)}>
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
