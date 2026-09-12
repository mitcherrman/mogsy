// ---------------------------------------------------------------------------
// Generator Lab — inspecting the production Mastery generators.
//
// WHAT THIS IS NOT
// ────────────────
// It is not a question editor, and generated questions are not rows. A
// `mastery_slice` question is VIRTUAL until a match serves it: it is
// synthesized from canonical data when a segment opens, frozen onto that one
// round, and never stored as a reusable question anywhere. So this page is
// deliberately NOT a tab of Admin Quiz Review — Quiz Review is a table of
// stored questions with ids you can approve, edit and publish, and pouring
// virtual samples into it would teach an operator a model of the product that
// is false. The two surfaces are named apart for that reason: Static Questions
// live in Quiz Review, Generated Questions are inspected here, and nothing
// generated is ever added to that table.
//
// WHAT IT IS
// ──────────
// A window onto the PRODUCTION generator. Every question on this screen was
// produced by `MasterySliceModule.generate_segment` — the same call a live
// match makes, against the same canonical data — and drawn by
// `MasterySliceChallengeSurface`, the same component the Ranked arena draws a
// challenge with. Neither is an Admin copy. That is the point: "is this
// exactly what a player would see?" is answered by identity, not resemblance.
//
// WHAT IT COMPUTES: nothing. No prompt, option, answer, explanation, count,
// ceiling or provenance value is produced here. Every one is read verbatim
// from the backend, because a screen that derived any of them would eventually
// disagree with what players are actually served — and would do it quietly.
//
// WHAT IT WRITES: nothing. Generating a preview creates no attempt, no user
// history, no match, no round and no stored question. The backend proves that
// structurally (a sqlite authorizer denies every write on the preview path);
// this page simply never asks for one.
//
// The input controls are rendered by `ModuleConfigFields` from the BACKEND
// catalog — the identical component and the identical field descriptions the
// Ranked Format Builder uses — so the Lab holds no roster, no ability list, no
// certification list and no validation rule of its own. Which champions exist
// and which chains are certified is a backend fact, and it reaches this screen
// as data.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Dices, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdminAuthGate } from "@/components/admin/AdminAuthGate";
import { ModuleConfigFields } from "@/pages/admin/ranked/ModuleConfigFields";
import { MasterySliceChallengeSurface } from "@/lib/ranked-core/modules/MasterySliceChallengeSurface";
import { readMasterySliceChallenge } from "@/lib/ranked-public/contracts";
import type { MasterySliceChallengeView } from "@/lib/ranked-public/contracts";
import {
  fillVisibleSpecDefaults,
  normalizeSegmentSpecConfig,
  setSegmentSpecField,
} from "@/lib/admin/rankedFormatEditing";
import {
  RankedFormatApiError,
  fetchMasterySliceCoverage,
  fetchModuleCatalog,
  previewMasterySlice,
  type CatalogModule,
  type MasteryGeneratorCoverage,
  type MasterySliceCoverageView,
  type MasterySlicePreview,
  type SegmentSpecJson,
} from "@/lib/admin/rankedFormatApi";
import { cn } from "@/lib/utils";

/** The one module this page inspects. */
const MASTERY_MODULE_ID = "mastery_slice";
const MASTERY_MODULE_VERSION = 1;

/** Where Static Questions live. Named so the distinction is a link, not a note. */
export const STATIC_QUESTIONS_PATH = "/admin/quiz-content?tab=review";

/**
 * A fresh seed.
 *
 * Client-side on purpose, and it is NOT a second RNG path: the seed is an
 * arbitrary admin-supplied string, exactly as a match's `order_seed` is an
 * arbitrary server-supplied one. All the determinism lives in the backend's
 * single salt derivation, which turns whatever string it is given into a
 * rotation. A button that types a different string for you cannot be a second
 * source of randomness in the generator any more than the keyboard is.
 */
export function newSeed(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

type Load<T> =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "ok"; data: T }
  | { state: "error"; message: string };

function errorMessage(err: unknown): string {
  // The backend's own refusal, verbatim — the same sentence Save would give
  // for the same policy. A rephrasing here would be this screen holding an
  // opinion about legality that the schema is the authority on.
  return err instanceof RankedFormatApiError
    ? err.message
    : "Could not reach the admin backend.";
}

// --------------------------------------------------------------- diagnostics

function DetailRow({ label, value, mono = false }: {
  label: string; value: React.ReactNode; mono?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 py-1">
      <dt className="w-44 shrink-0 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </dt>
      <dd className={cn("min-w-0 flex-1 break-all text-[11px] text-foreground",
                        mono && "font-mono text-[10.5px]")}>
        {value ?? <span className="text-muted-foreground/60">—</span>}
      </dd>
    </div>
  );
}

/**
 * The provenance panel: what this slice WAS.
 *
 * Collapsed by default and never a raw dump — the raw JSON is one more click
 * below, for when a field this build does not know about is exactly what
 * someone needs to read.
 */
function DiagnosticsPanel({ preview }: { preview: MasterySlicePreview }) {
  const [open, setOpen] = useState(false);
  const [rawOpen, setRawOpen] = useState(false);
  const artifact = preview.mastery_artifact ?? null;

  return (
    <section
      className="rounded-lg border border-border/60 bg-background/40 p-3"
      data-testid="generator-diagnostics"
    >
      <button
        type="button"
        className="flex w-full items-center justify-between text-left"
        aria-expanded={open}
        data-testid="toggle-diagnostics"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Provenance &amp; diagnostics
        </span>
        <span className="text-[10px] text-muted-foreground">{open ? "Hide" : "Show"}</span>
      </button>

      {open && (
        <div className="mt-2 space-y-3">
          {artifact === null ? (
            <p className="text-[11px] text-amber-300" role="status" data-testid="artifact-absent">
              This generator stamped no provenance block. Absent means unknown,
              not broken — a slice generated before the served-artifact contract
              carries none either.
            </p>
          ) : (
            <dl className="divide-y divide-border/40" data-testid="artifact-details">
              <DetailRow label="Generator" value={artifact.generator_type} />
              <DetailRow label="Generator version" value={artifact.generator_version} mono />
              <DetailRow label="Artifact schema" value={artifact.artifact_schema_version} />
              <DetailRow label="Subject" value={artifact.subject_key} mono />
              <DetailRow label="Artifact instance" value={artifact.artifact_instance_id} mono />
              <DetailRow label="Mastery set" value={artifact.mastery_set_id} mono />
              <DetailRow label="Artifact digest" value={artifact.artifact_digest} mono />
              <DetailRow label="Source patch" value={artifact.patch_display} />
              <DetailRow label="Patch key digest" value={artifact.patch_key_digest} mono />
              {/* The backend's flag, reported and not interpreted. It is
                  tempting to gloss it as "did not go through the publication
                  gate" — that is true of the applied chain and NOT true of a
                  Champion or Matchup slice, which are gated and still carry
                  the flag. A provenance panel that explained a field wrongly
                  would be worse than one that simply showed it. */}
              <DetailRow
                label="Prototype flag"
                value={artifact.is_prototype === null ? null
                  : artifact.is_prototype ? "true" : "false"}
              />
              <DetailRow
                label="Generator config"
                mono
                value={JSON.stringify(artifact.generator_config)}
              />
            </dl>
          )}

          <dl className="divide-y divide-border/40">
            <DetailRow label="Seed" value={preview.seed ?? "none — fixed preview"} mono />
            <DetailRow label="Selection salt" value={preview.selection_salt} mono />
            <DetailRow label="Response schema" value={preview.schema_version} mono />
          </dl>

          <button
            type="button"
            className="text-[10px] text-muted-foreground underline underline-offset-2"
            aria-expanded={rawOpen}
            data-testid="toggle-raw-json"
            onClick={() => setRawOpen((v) => !v)}
          >
            {rawOpen ? "Hide raw response" : "Show raw response"}
          </button>
          {rawOpen && (
            <pre
              className="max-h-80 overflow-auto rounded border border-border/60 bg-background/70 p-2 text-[10px] leading-relaxed"
              data-testid="raw-json"
            >
              {JSON.stringify(preview, null, 2)}
            </pre>
          )}
        </div>
      )}
    </section>
  );
}

// --------------------------------------------------------------- coverage

function FamilyList({ label, kind, families }: {
  label: string;
  /** Which side of the universe this list is. Part of each row's test id
   *  because a matchup legitimately holds the same family on BOTH sides —
   *  `ability_cooldown` as a comparison and as atomic recall are two different
   *  counts, and one shared id would make them indistinguishable. */
  kind: "comparison" | "atomic";
  families: { family: string; count: number }[];
}) {
  if (families.length === 0) return null;
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <ul className="mt-1 flex flex-wrap gap-1">
        {families.map((f) => (
          <li
            key={f.family}
            className="rounded border border-border/60 bg-muted/40 px-1.5 py-0.5 text-[10px]"
            data-testid={`coverage-${kind}-family-${f.family}`}
          >
            {f.family} <span className="text-muted-foreground">· {f.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CoveragePanel({ view }: { view: MasterySliceCoverageView }) {
  const c: MasteryGeneratorCoverage = view.coverage;
  return (
    <section
      className="space-y-2 rounded-lg border border-border/60 bg-background/40 p-3"
      data-testid="generator-coverage"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          What this subject can supply
        </p>
        <p className="text-[11px] text-foreground">
          <span
            className="text-base font-semibold"
            data-testid="coverage-total"
          >{c.total_candidates}</span>{" "}
          <span className="text-muted-foreground">
            generatable question{c.total_candidates === 1 ? "" : "s"}
          </span>
        </p>
      </div>
      <p className="text-[10px] text-muted-foreground">
        {view.subject_label} · minimum servable slice: {view.min_challenge_count}
      </p>

      {c.certified === false && (
        <p className="rounded border border-destructive/40 bg-destructive/10 px-2 py-1 text-[10.5px] text-destructive"
           role="status" data-testid="coverage-uncertified">
          This attacker/ability/target combination is not certified for the
          applied chain. The generator refuses it outright — this is not a
          shortage of questions.
        </p>
      )}

      {typeof c.comparison_candidates === "number" && (
        <p className="text-[10.5px] text-muted-foreground">
          {c.comparison_candidates} comparison
          {c.comparison_candidates === 1 ? "" : "s"} · {c.atomic_candidates} atomic recall
        </p>
      )}

      <FamilyList label="Comparison families" kind="comparison" families={c.comparison_families} />
      <FamilyList label="Families" kind="atomic" families={c.families} />

      <p className="text-[9.5px] italic leading-relaxed text-muted-foreground/80">
        {c.note}
      </p>
    </section>
  );
}

// --------------------------------------------------------------- the page

export function MasteryGeneratorLab() {
  const [catalog, setCatalog] = useState<Load<CatalogModule>>({ state: "loading" });
  // The draft is shaped exactly like a Ranked segment, because that is what the
  // backend validates and what `ModuleConfigFields` edits. Reusing the shape is
  // what lets this page reuse the Builder's field renderer wholesale.
  const [draft, setDraft] = useState<SegmentSpecJson | null>(null);
  const [seed, setSeed] = useState<string>("");
  const [preview, setPreview] = useState<Load<MasterySlicePreview>>({ state: "idle" });
  const [coverage, setCoverage] = useState<Load<MasterySliceCoverageView>>({ state: "idle" });

  useEffect(() => {
    let cancelled = false;
    void fetchModuleCatalog()
      .then((cat) => {
        if (cancelled) return;
        const entry = cat.modules.find(
          (m) => m.module_id === MASTERY_MODULE_ID
            && m.module_version === MASTERY_MODULE_VERSION);
        if (!entry) {
          setCatalog({
            state: "error",
            message: "This deployment's module catalog does not offer mastery_slice.",
          });
          return;
        }
        setCatalog({ state: "ok", data: entry });
        // The catalog's own defaults — a real, currently-generatable subject
        // chosen by the backend, not a champion name typed here.
        setDraft({ ...entry.defaults });
      })
      .catch((err) => !cancelled && setCatalog({ state: "error", message: errorMessage(err) }));
    return () => { cancelled = true; };
  }, []);

  const moduleConfig = useMemo(
    () => (draft?.module_config ?? {}) as Record<string, unknown>, [draft]);
  const challengeCount = typeof draft?.challenge_count === "number"
    ? draft.challenge_count : null;

  // A sample and a coverage report both describe ONE policy. The moment the
  // policy changes they are stale, and showing a stale sample beside edited
  // settings is worse than showing none.
  const policyKey = JSON.stringify([moduleConfig, challengeCount]);
  useEffect(() => {
    setPreview({ state: "idle" });
    setCoverage({ state: "idle" });
  }, [policyKey]);

  const fields = catalog.state === "ok" ? catalog.data.fields : null;
  const defaults = catalog.state === "ok" ? catalog.data.defaults : undefined;

  /**
   * Apply one field edit, then make the config legal for the mode it now names.
   *
   * Switching generator is not a single-field edit. Champion → Matchup leaves
   * `champion_id` behind and leaves `champion_a_id` / `champion_b_id` unset,
   * and the backend rejects a config carrying another mode's fields — so
   * without this the Lab would refuse to generate the moment anyone changed
   * the generator, with a 422 and nothing on screen explaining why.
   *
   * Both steps are the Format Builder's own helpers rather than a second
   * implementation: the Builder solved exactly this at exactly this moment,
   * and two answers to "what does switching a tagged-union config mean" is
   * how the two screens start disagreeing about what is saveable.
   */
  const onChange = useCallback((key: string, value: unknown) => {
    setDraft((current) => {
      if (!current || !fields) return current;
      const edited = setSegmentSpecField(current, key, value);
      return fillVisibleSpecDefaults(
        normalizeSegmentSpecConfig(edited, fields), fields, defaults);
    });
  }, [fields, defaults]);

  const runGenerate = useCallback(async (withSeed: string) => {
    if (challengeCount === null) return;
    setPreview({ state: "loading" });
    try {
      const data = await previewMasterySlice(
        moduleConfig, challengeCount, withSeed || null);
      setPreview({ state: "ok", data });
    } catch (err) {
      setPreview({ state: "error", message: errorMessage(err) });
    }
  }, [moduleConfig, challengeCount]);

  const runCoverage = useCallback(async () => {
    setCoverage({ state: "loading" });
    try {
      setCoverage({ state: "ok", data: await fetchMasterySliceCoverage(moduleConfig) });
    } catch (err) {
      setCoverage({ state: "error", message: errorMessage(err) });
    }
  }, [moduleConfig]);

  /**
   * The generated challenges, in the arena's own wire shape.
   *
   * Parsed by the arena's own parser, so a malformed challenge is refused here
   * exactly as it would be in a match rather than rendered as half a question.
   */
  const challenges = useMemo<{ views: MasterySliceChallengeView[]; error: string | null }>(() => {
    if (preview.state !== "ok") return { views: [], error: null };
    try {
      return {
        views: preview.data.challenges.map(
          (c, i) => readMasterySliceChallenge(c, `challenge[${i}]`)),
        error: null,
      };
    } catch (err) {
      return {
        views: [],
        error: err instanceof Error ? err.message : "unreadable challenge payload",
      };
    }
  }, [preview]);

  return (
    <AdminAuthGate>
      <div className="mx-auto w-full max-w-5xl space-y-4 p-3 sm:p-4" data-testid="mastery-generator-lab">
        <header className="space-y-1.5">
          <h1 className="text-lg font-semibold">Mastery Generator Lab</h1>
          <p className="max-w-3xl text-[11.5px] leading-relaxed text-muted-foreground">
            Run the production Mastery generators and inspect what they produce.
            These questions are <strong>generated, not stored</strong>: a{" "}
            <code className="rounded bg-muted/60 px-1">mastery_slice</code>{" "}
            question is synthesized when a match reaches the segment, frozen onto
            that one round, and never kept as a reusable question. Previewing
            here writes nothing — no attempt, no history, no match, no round,
            no stored question.
          </p>
          <p className="text-[11px] text-muted-foreground">
            Looking for stored questions you can review and publish?{" "}
            <Link
              to={STATIC_QUESTIONS_PATH}
              className="underline underline-offset-2 hover:text-foreground"
              data-testid="static-questions-link"
            >
              Static Questions — Admin Quiz Review
            </Link>
            . Nothing generated here appears there, and nothing there is
            generated.
          </p>
        </header>

        {catalog.state === "loading" && (
          <p className="text-xs text-muted-foreground" role="status">Loading generators…</p>
        )}
        {catalog.state === "error" && (
          <p className="rounded border border-destructive/40 bg-destructive/10 px-2 py-1 text-xs text-destructive"
             role="alert" data-testid="catalog-error">
            {catalog.message}
          </p>
        )}

        {catalog.state === "ok" && draft && (
          <>
            <section className="space-y-3 rounded-lg border border-border/60 bg-background/40 p-3">
              <div>
                <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Generator
                </h2>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground/90">
                  {catalog.data.description}
                </p>
              </div>

              {/* The Format Builder's own field renderer, over the backend's own
                  field descriptions. Which generators exist, which champions
                  each offers and which chains are certified are backend facts
                  that arrive as data — this page holds no roster and no
                  validation rule of its own. */}
              <ModuleConfigFields
                fields={catalog.data.fields}
                segment={draft}
                index={0}
                onChange={onChange}
              />

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <label
                    htmlFor="generator-seed"
                    className="block text-[11px] font-medium text-muted-foreground"
                  >
                    Seed
                  </label>
                  <div className="flex gap-1.5">
                    <Input
                      id="generator-seed"
                      aria-label="Seed"
                      className="h-8 font-mono text-xs"
                      placeholder="none — the fixed preview"
                      value={seed}
                      onChange={(e) => setSeed(e.target.value)}
                      data-testid="seed-input"
                    />
                    <Button
                      type="button" size="sm" variant="secondary"
                      className="h-8 shrink-0 px-2"
                      data-testid="new-seed"
                      onClick={() => { const s = newSeed(); setSeed(s); void runGenerate(s); }}
                    >
                      <Dices className="mr-1 h-3.5 w-3.5" aria-hidden />
                      New seed
                    </Button>
                  </div>
                  <p className="text-[10px] leading-relaxed text-muted-foreground/80">
                    Stands where a live match's own seed stands. The same seed
                    over the same canonical data always reproduces the same
                    slice; a different one draws a different valid sample from
                    the same pool.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button" size="sm"
                  data-testid="generate"
                  disabled={preview.state === "loading" || challengeCount === null}
                  onClick={() => void runGenerate(seed)}
                >
                  {preview.state === "loading" && (
                    <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden />
                  )}
                  {preview.state === "loading" ? "Generating…" : "Generate"}
                </Button>
                <Button
                  type="button" size="sm" variant="secondary"
                  data-testid="regenerate-same-seed"
                  disabled={preview.state === "loading" || challengeCount === null}
                  onClick={() => void runGenerate(seed)}
                >
                  <RefreshCw className="mr-1 h-3.5 w-3.5" aria-hidden />
                  Regenerate with this seed
                </Button>
                <Button
                  type="button" size="sm" variant="outline"
                  data-testid="check-coverage"
                  disabled={coverage.state === "loading"}
                  onClick={() => void runCoverage()}
                >
                  {coverage.state === "loading" ? "Counting…" : "Check coverage"}
                </Button>
                <span className="text-[9.5px] text-muted-foreground/70">
                  Generated live. Nothing is saved.
                </span>
              </div>
            </section>

            {coverage.state === "error" && (
              <p className="rounded border border-destructive/40 bg-destructive/10 px-2 py-1 text-xs text-destructive"
                 role="alert" data-testid="coverage-error">
                {coverage.message}
              </p>
            )}
            {coverage.state === "ok" && <CoveragePanel view={coverage.data} />}

            {preview.state === "error" && (
              <p className="rounded border border-destructive/40 bg-destructive/10 px-2 py-1 text-xs text-destructive"
                 role="alert" data-testid="preview-error">
                {preview.message}
              </p>
            )}

            {preview.state === "ok" && (
              <>
                <DiagnosticsPanel preview={preview.data} />

                <section className="space-y-3" data-testid="generated-slice">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      Generated questions — as a player would see them
                    </h2>
                    <p className="text-[10px] text-muted-foreground">
                      {preview.data.challenge_count} question
                      {preview.data.challenge_count === 1 ? "" : "s"}
                    </p>
                  </div>
                  {/* The caveat travels with the samples, and comes from the
                      payload rather than being restated here. */}
                  <p className="text-[9.5px] italic leading-relaxed text-muted-foreground/80">
                    {preview.data.note}
                  </p>

                  {challenges.error !== null && (
                    <p className="rounded border border-destructive/40 bg-destructive/10 px-2 py-1 text-xs text-destructive"
                       role="alert" data-testid="challenge-parse-error">
                      This slice could not be read through the Ranked wire
                      contract: {challenges.error}
                    </p>
                  )}

                  {challenges.views.map((challenge, index) => {
                    const raw = preview.data.challenges[index];
                    return (
                      <article
                        key={challenge.challengeIndex}
                        className="space-y-2 rounded-lg border border-border/60 bg-background/40 p-3"
                        data-testid={`generated-question-${challenge.challengeIndex}`}
                      >
                        <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                          Question {challenge.challengeIndex + 1} ·{" "}
                          {challenge.questionFamily} · {challenge.interactionKind}
                        </p>
                        {/* THE PRODUCTION RENDERER. The same component the
                            Ranked arena draws a challenge with, not a
                            lookalike — which is what makes "is this exactly
                            what a player would see?" answerable by identity.

                            Rendered LIVE rather than disabled: selecting an
                            option, typing a number and picking a side are the
                            states an admin most needs to see, and a surface
                            held in its `submitting` state would show none of
                            them. The only inert control is the terminal one —
                            there is no session here to lock an answer into,
                            and the answer is stated below instead. Grading is
                            deliberately NOT reproduced: this page would have
                            to hold its own opinion of correctness to do it,
                            and the server is the only authority on that. */}
                        <MasterySliceChallengeSurface
                          challenge={challenge}
                          total={preview.data.challenge_count}
                          submitting={false}
                          onSubmit={() => { /* no session to submit into */ }}
                        />
                        {/* The admin-only half, kept visually apart from the
                            player-facing half above so the two are never
                            mistaken for one screen. */}
                        {/* Emerald at a LEGIBLE weight in both themes. The
                            Admin shell renders light, where a 300-weight
                            emerald on a 5%-tint ground is very nearly
                            invisible — and an answer key an operator has to
                            squint at is not an answer key. */}
                        <div className="rounded border border-emerald-500/40 bg-emerald-500/10 px-2 py-1.5">
                          <p className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300"
                             data-testid={`answer-${challenge.challengeIndex}`}>
                            Answer: {String(raw?.correct_answer ?? "—")}
                          </p>
                          <p className="mt-0.5 text-[9.5px] text-muted-foreground">
                            Admin-only. The lock-in control above is inert here
                            — there is no session to answer into, and the
                            server remains the only authority on correctness.
                          </p>
                          {raw?.explanation && (
                            <p className="mt-1 text-[10.5px] leading-relaxed text-foreground/80">
                              {raw.explanation}
                            </p>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </section>
              </>
            )}
          </>
        )}
      </div>
    </AdminAuthGate>
  );
}

export default MasteryGeneratorLab;
