/**
 * CON1 — what an Admin export will actually produce, decided before it runs.
 *
 * Pure module. It turns the SAME `ContentCommandConfig` the CLI line and the
 * workspace handoff are built from into an ordered list of cards, so the three
 * routes cannot describe different work. Every name it produces comes from
 * `./paths` — the Content Factory's existing filename authority — so a browser
 * export and a CLI run of the same selection land the same files under the same
 * run directory shape.
 *
 * It also decides the DELIVERY, because that is what the button has to promise:
 * one card is one PNG, and anything more is a ZIP. Chrome asks the operator to
 * confirm before it will save a second file from one gesture and Safari drops
 * it outright, so a "download them all" loop is a promise the browser does not
 * keep. The label says the card count AND the container, so neither is a
 * surprise.
 */
import { getFormat } from "./formats";
import { questionSlug, runDirName, screenshotFileName, slideFileName } from "./paths";
import { expandPost, type PostType, type SlideKind } from "./content-posts";
import type { RenderState } from "./types";

/** One capture: a question, a format, and the card to show. */
export type ExportCard = {
  /** Identity of the selected row, as the harness addresses it (`?q=`). */
  questionId: string;
  /** Operator-facing identity, for progress and error reporting. */
  questionLabel: string;
  formatKey: string;
  state: RenderState;
  slide: SlideKind;
  /** Path inside the ZIP, and the basis of a single file's name. */
  zipPath: string;
  /** Name used when this card is downloaded on its own. */
  flatFileName: string;
};

export type ExportPlan = {
  runDir: string;
  cards: ExportCard[];
  /** One card downloads directly; more than one is zipped. */
  delivery: "png" | "zip";
  /** Name of the ZIP, when there is one. */
  zipFileName: string;
  /** Why no plan could be made. Non-empty means the export cannot start. */
  errors: string[];
};

export type ExportSelectionRow = {
  /** `?q=` value: the stored id, or a generated row's review key. */
  id: string;
  /** What the operator sees in progress and error copy. */
  label: string;
};

export type ExportPlanInput = {
  selection: readonly ExportSelectionRow[];
  formats: readonly string[];
  states: readonly RenderState[];
  post: PostType | null;
  /** Optional run name; a timestamp is used when absent, exactly as the CLI. */
  runId?: string;
  now?: Date;
};

/**
 * Audit formats are deliberately not exportable from the browser.
 *
 * They are not a composition — they render the harness page as a normal
 * responsive document at a device viewport, so what they capture IS the
 * viewport. Admin's viewport is the operator's monitor, so a browser "audit
 * capture" would be a picture of the wrong device at the wrong size. The CLI
 * gives each one a real viewport; that is where they stay.
 */
export const BROWSER_EXPORTABLE_KIND = "social";

export function isBrowserExportableFormat(formatKey: string): boolean {
  return getFormat(formatKey)?.kind === BROWSER_EXPORTABLE_KIND;
}

/** Build the ordered card list for a selection + configuration. */
export function buildExportPlan(input: ExportPlanInput): ExportPlan {
  const errors: string[] = [];
  const { selection, formats, states, post } = input;

  if (selection.length === 0) errors.push("Select at least one question.");
  if (formats.length === 0) errors.push("Pick at least one destination.");

  const unsupported = formats.filter((key) => !isBrowserExportableFormat(key));
  if (unsupported.length > 0) {
    errors.push(
      `${unsupported.join(", ")} cannot be exported from the browser — ` +
        "it captures a device viewport, which only the local renderer can supply. " +
        "Deselect it, or use Developer tools.",
    );
  }
  if (post === null && states.length === 0) {
    errors.push("Pick at least one card.");
  }

  let runDir = "";
  try {
    runDir = runDirName(input.runId?.trim() ? input.runId.trim() : undefined, input.now ?? new Date());
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  const cards: ExportCard[] = [];
  if (errors.length === 0) {
    for (const row of selection) {
      // `questionSlug` zero-pads NUMERIC ids (`question_000123`) and slugifies
      // anything else. The selection carries ids as strings because that is how
      // the harness addresses them (`?q=`), so a stored id has to be handed back
      // as a number here — otherwise a browser export writes `question_123`
      // where a CLI run of the same question writes `question_000123`, and the
      // two stop being interchangeable on disk.
      const slug = questionSlug(/^\d+$/.test(row.id) ? Number(row.id) : row.id);
      for (const formatKey of formats) {
        if (post !== null) {
          for (const spec of expandPost(post)) {
            const file = slideFileName(formatKey, spec.index, spec.slug);
            cards.push({
              questionId: row.id,
              questionLabel: row.label,
              formatKey,
              state: spec.state,
              slide: spec.slideKind,
              zipPath: `${runDir}/${slug}/${file}`,
              flatFileName: `${slug}_${file}`,
            });
          }
        } else {
          for (const state of states) {
            const file = screenshotFileName(formatKey, state);
            cards.push({
              questionId: row.id,
              questionLabel: row.label,
              formatKey,
              state,
              slide: "quiz",
              zipPath: `${runDir}/${slug}/${file}`,
              flatFileName: `${slug}_${file}`,
            });
          }
        }
      }
    }
  }

  return {
    runDir,
    cards,
    delivery: cards.length === 1 ? "png" : "zip",
    zipFileName: `${runDir}.zip`,
    errors,
  };
}

/**
 * The primary button's own words.
 *
 * Derived from the plan rather than from the controls, so the button can never
 * promise a count the run will not produce.
 */
export function exportActionLabel(plan: ExportPlan): string {
  if (plan.errors.length > 0 || plan.cards.length === 0) return "Export";
  if (plan.cards.length === 1) return "Export PNG";
  return `Export ${plan.cards.length} PNGs as ZIP`;
}

/** One line describing what lands on disk, shown under the button. */
export function exportDeliveryHint(plan: ExportPlan): string {
  if (plan.cards.length === 0) return "";
  if (plan.delivery === "png") return `Downloads ${plan.cards[0].flatFileName}.`;
  return `Downloads ${plan.zipFileName}, one folder per question — the same layout a local run writes.`;
}
