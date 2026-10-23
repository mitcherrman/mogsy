/**
 * CON1 / CC2 — visual differential verification for the browser content export.
 *
 * The deterministic Playwright capture is the AUTHORITY. This harness runs the
 * browser export (`src/lib/quiz-screenshot/contentExport.ts` →
 * `runBrowserExport.ts`) over the same questions, modes, formats and slides, and
 * compares its PNGs against `captureOne` — the very function the CLI and
 * Content Studio use — pixel for pixel.
 *
 * CC2: every Content Studio mode is covered — classic states, the single-
 * question and answer-reveal posts, the multi-question challenge and the daily
 * package. The authority side is driven by `planCaptureJobs`, the generator's
 * own expansion, with the generator's zoom-envelope and answer-plan rules, so
 * "the browser matched the authority" means "the browser matched what
 * `npm run quiz:screenshots` would have produced".
 *
 * It is a QA tool, not part of the product: it writes only under the gitignored
 * export root and never touches a backend. Browser execution belongs in CI
 * (`.github/workflows/content-creator-browser-parity.yml`, bundled headless
 * Chromium, one browser at a time) — see AGENTS.md before running it locally.
 *
 *   npx tsx scripts/quiz-screenshots/verify-browser-export.ts [--base-url <url>] [--exporter chromium|firefox]
 *
 * `--exporter firefox` runs the BROWSER EXPORT in Playwright's bundled Firefox
 * while the authority stays Chromium — the only way this repo measures Firefox.
 *
 * A dev server must already be serving the app (the exporter is loaded as a
 * source module, so this runs against a Vite dev server, not a build).
 *
 * The diff itself is computed in the browser with a canvas, so the script adds
 * no image dependency. Reported per card:
 *   dimensions   — must match exactly; anything else is a hard failure
 *   identical %  — pixels within a 12/765 channel-sum tolerance (AA noise)
 *   gross %      — pixels differing by more than 90/765 (a real difference)
 *   meanDelta    — mean per-channel difference across the whole frame
 *   bandShifts / alignedMeanDelta / worstBandAligned — see `diffInBrowser`.
 *
 * Verdicts (exit code 1 on any hard failure):
 *   MATCH          both produced the card; dimensions equal; aligned Δ ≤ 10
 *   BOTH-REFUSED   the authority's QA failed the card AND the browser withheld it
 *   DIVERGED       aligned Δ above 10 (hard)
 *   NO OUTPUT      the browser withheld a card the authority accepted (hard)
 *   LEAKED         the browser exported a card the authority's QA failed (hard)
 *   DIMENSIONS     sizes differ (hard)
 */
import { chromium, firefox, type Browser, type Page } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { captureOne } from "./capture";
import { adaptScreenshotQuestions } from "../../src/lib/quiz-screenshot/adapt";
import { planCaptureJobs } from "../../src/lib/quiz-screenshot/captureJobs";
import type { DifficultyTier } from "../../src/lib/quiz-screenshot/difficulty";
import { getFormat } from "../../src/lib/quiz-screenshot/formats";
import { resolveAnswerPlan } from "../../src/lib/quiz-screenshot/states";
import type { RenderQuestion, RenderState } from "../../src/lib/quiz-screenshot/types";

type Mode = "classic" | "single-question" | "answer-reveal" | "multi-question";

/** One export, described the way an Admin operator would ask for it. */
type Scenario =
  | {
      kind: "run";
      name: string;
      note: string;
      mode: Mode;
      ids: string[];
      formats: string[];
      states?: RenderState[];
      difficulty?: DifficultyTier;
      challenge?: { repeatVariant?: 1 | 2 | null; midCtaVariant?: 1 | 2 | 3 | null };
    }
  | {
      kind: "daily";
      name: string;
      note: string;
      prefix: string;
      featured: string;
      challenge: string[];
      reuse: boolean;
      repeatVariant?: 1 | 2;
      midCtaVariant?: 1 | 2 | 3;
      formats: string[];
    };

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(HERE, "visual-qa-fixture.json");

const exporterIndex = process.argv.indexOf("--exporter");
const EXPORTER: "chromium" | "firefox" =
  exporterIndex >= 0 && process.argv[exporterIndex + 1] === "firefox" ? "firefox" : "chromium";
const OUT_ROOT = path.join(process.cwd(), "quiz_content_exports", "browser-export-parity", EXPORTER);
const ALIGNED_DELTA_LIMIT = 10;

/**
 * The CON1 classic cases (one per content class, across the four publishable
 * shapes), then one scenario per CC2 mode.
 */
const SCENARIOS: Scenario[] = [
  { kind: "run", name: "vq-01-mobile-classic", note: "plain stored MCQ", mode: "classic", ids: ["vq-01"], formats: ["mobile-social"], states: ["question", "correct"] },
  { kind: "run", name: "vq-01-square-classic", note: "plain stored MCQ, 1:1", mode: "classic", ids: ["vq-01"], formats: ["square"], states: ["question"] },
  { kind: "run", name: "vq-04-mobile-classic", note: "item recipe — asset-bearing", mode: "classic", ids: ["vq-04"], formats: ["mobile-social"], states: ["question", "correct"] },
  { kind: "run", name: "vq-05-vertical-classic", note: "family band presentation, 9:16", mode: "classic", ids: ["vq-05"], formats: ["vertical"], states: ["question"] },
  { kind: "run", name: "vq-07-landscape-classic", note: "family band, 16:9 two-column", mode: "classic", ids: ["vq-07"], formats: ["landscape"], states: ["question", "correct"] },
  { kind: "run", name: "vq-08-mobile-classic", note: "Mastery generated row", mode: "classic", ids: ["vq-08"], formats: ["mobile-social"], states: ["question", "correct"] },
  { kind: "run", name: "vq-09-mobile-vertical-classic", note: "Daily frozen card", mode: "classic", ids: ["vq-09"], formats: ["mobile-social", "vertical"], states: ["question"] },
  { kind: "run", name: "vq-03-mobile-classic", note: "Pro Play question.context", mode: "classic", ids: ["vq-03"], formats: ["mobile-social"], states: ["question", "correct"] },
  { kind: "run", name: "vq-12-square-classic", note: "Pro Play player scope, 1:1 (known CON1 zoom outlier)", mode: "classic", ids: ["vq-12"], formats: ["square"], states: ["question"] },
  { kind: "run", name: "vq-10-mobile-explanation", note: "explanation card (fits its own zoom)", mode: "classic", ids: ["vq-10"], formats: ["mobile-social"], states: ["question", "explanation"] },
  // CC2 — post types, difficulty, challenge, daily package.
  { kind: "run", name: "single-question-post", note: "post: question + app CTA, gold badge", mode: "single-question", ids: ["vq-01"], formats: ["mobile-social", "square"], difficulty: "gold" },
  { kind: "run", name: "answer-reveal-post", note: "post: recap + answer + community", mode: "answer-reveal", ids: ["vq-04"], formats: ["vertical"] },
  { kind: "run", name: "challenge-5", note: "challenge of 5, repeat + mid-CTA copy", mode: "multi-question", ids: ["vq-01", "vq-03", "vq-04", "vq-08", "vq-10"], formats: ["mobile-social"], challenge: { repeatVariant: 1, midCtaVariant: 2 } },
  { kind: "run", name: "challenge-7-landscape", note: "challenge of 7 — two answer pages", mode: "multi-question", ids: ["vq-01", "vq-02", "vq-03", "vq-04", "vq-06", "vq-08", "vq-10"], formats: ["landscape"] },
  { kind: "daily", name: "daily-package", note: "daily package: featured reused as opener", prefix: "parity-daily", featured: "vq-01", challenge: ["vq-03", "vq-08", "vq-10"], reuse: true, repeatVariant: 1, midCtaVariant: 3, formats: ["square"] },
];

function loadQuestions(): RenderQuestion[] {
  const raw = JSON.parse(fs.readFileSync(FIXTURE, "utf8")) as { questions: unknown[] };
  const { adapted, skipped } = adaptScreenshotQuestions(raw.questions as never[]);
  if (skipped.length) {
    console.warn(`fixture rows skipped by the adapter: ${skipped.map((s) => `${s.id} (${s.reason})`).join(", ")}`);
  }
  return adapted;
}

async function launch(kind: "chromium" | "firefox"): Promise<Browser> {
  // Bundled, headless, no channel and no executablePath: never the user's
  // installed Edge/Chrome (AGENTS.md).
  return kind === "firefox" ? firefox.launch({ headless: true }) : chromium.launch({ headless: true });
}

/** Load the app once; the exporter is imported from it as a source module. */
async function openExporterPage(browser: Browser, baseUrl: string): Promise<Page> {
  const context = await browser.newContext({
    // Deliberately NOT a format-sized viewport. Admin runs at a desktop size,
    // and the point of the check is that the exported PNG does not depend on it.
    viewport: { width: 1600, height: 1000 },
    deviceScaleFactor: 1,
    locale: "en-US",
    timezoneId: "UTC",
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => console.warn("  [pageerror]", error.message.slice(0, 200)));
  // tsx compiles this file with esbuild's `keepNames`, which wraps every
  // function in a `__name(...)` helper — including the ones serialised into
  // `page.evaluate`, where that helper does not exist. Supply a no-op.
  await page.addInitScript("globalThis.__name = globalThis.__name || ((fn) => fn);");
  await page.goto(`${baseUrl}/`, { waitUntil: "load" });
  // The stylesheet bundle is read from the live document, so the app's CSS must
  // have landed before the first export.
  await page.waitForFunction(() => document.styleSheets.length > 0);
  await page.addScriptTag({ path: "node_modules/jszip/dist/jszip.min.js" });
  return page;
}

type BrowserCard = {
  runId: string;
  path: string;
  status: string;
  reason: string | null;
  classification: string | null;
  usedScale: number | null;
  dataUrl: string | null;
};
type BrowserScenarioResult = {
  cards: BrowserCard[];
  runs: Array<{ runId: string; status: string; failures: number; slides: number; entries: string[] }>;
  archive: { fileName: string; entries: string[]; zipEntries: string[]; bytes: number };
  support: { engine: string; status: string; notes: string[] };
  planErrors: string[];
};

/** Run one scenario through the real browser export, in the page. */
async function exportInBrowser(page: Page, questions: RenderQuestion[], scenario: Scenario): Promise<BrowserScenarioResult> {
  return page.evaluate(
    async ({ qs, sc }) => {
      const [{ buildExportPlan, buildDailyPackagePlan }, { runContentExport }] = await Promise.all([
        import("/src/lib/quiz-screenshot/exportPlan.ts" as string),
        import("/src/lib/quiz-screenshot/contentExport.ts" as string),
      ]);
      const request =
        sc.kind === "daily"
          ? {
              kind: "daily",
              plan: buildDailyPackagePlan({
                prefix: sc.prefix,
                featuredQuestionId: sc.featured,
                challengeQuestionIds: sc.challenge,
                reuseFeaturedAsOpener: sc.reuse,
                repeatVariant: sc.repeatVariant ?? null,
                midCtaVariant: sc.midCtaVariant ?? null,
                formats: sc.formats,
                questions: qs,
              }),
            }
          : {
              kind: "run",
              plan: buildExportPlan({
                selection: sc.ids.map((id: string) => ({ id, label: `#${id}` })),
                formats: sc.formats,
                states: sc.states ?? ["question", "correct"],
                post: null,
                mode: sc.mode,
                runId: sc.name,
                questions: qs,
                difficulty: sc.difficulty ?? null,
                challenge: sc.challenge,
              }),
            };
      if (request.plan.errors.length) {
        return {
          cards: [],
          runs: [],
          archive: { fileName: "", entries: [], zipEntries: [], bytes: 0 },
          support: { engine: "", status: "", notes: [] },
          planErrors: request.plan.errors,
        };
      }
      const result = await runContentExport({ request, questions: qs });
      const toDataUrl = (blob: Blob) =>
        new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.readAsDataURL(blob);
        });
      const cards = [];
      for (const run of result.runs) {
        for (const outcome of run.result.outcomes) {
          const relative = `${outcome.card.dirSlug}/${outcome.card.fileName}`;
          const image = run.report.images.find((i: { path: string }) => i.path === relative);
          cards.push({
            runId: run.report.runId,
            path: relative,
            status: image ? "captured" : outcome.status === "captured" ? "failed" : outcome.status,
            reason: outcome.status === "captured" ? (image ? null : "rejected by the run report") : outcome.reason,
            classification: outcome.status === "failed" ? outcome.classification : null,
            usedScale: outcome.status === "captured" ? outcome.usedScale : null,
            dataUrl: image ? await toDataUrl(image.blob) : null,
          });
        }
      }
      const JSZip = (window as unknown as { JSZip: typeof import("jszip") }).JSZip;
      const reloaded = await JSZip.loadAsync(result.archive.blob);
      return {
        cards,
        runs: result.runs.map((r: { report: { runId: string; status: string; failures: unknown[]; manifest: { slides: unknown[] } } }) => ({
          runId: r.report.runId,
          status: r.report.status,
          failures: r.report.failures.length,
          slides: r.report.manifest.slides.length,
          entries: [],
        })),
        archive: {
          fileName: result.archive.fileName,
          entries: [...result.archive.entries].sort(),
          zipEntries: Object.keys(reloaded.files).filter((n) => !reloaded.files[n].dir).sort(),
          bytes: result.archive.blob.size,
        },
        support: result.support,
        planErrors: [],
      };
    },
    { qs: questions, sc: scenario },
  );
}

type AuthorityCard = {
  runId: string;
  path: string;
  png: Buffer | null;
  usedScale: number | null;
  qaFailures: string[];
  skipped: string | null;
};

/** The same scenario through `captureOne`, exactly as `runGeneration` expands it. */
async function captureAuthority(
  browser: Browser,
  baseUrl: string,
  questions: RenderQuestion[],
  scenario: Scenario,
): Promise<AuthorityCard[]> {
  const byId = new Map(questions.map((q) => [String(q.id), q]));
  const runs: Array<{ runId: string; mode: Mode; ids: string[]; challenge?: { repeatVariant?: number | null; midCtaVariant?: number | null }; difficulty?: DifficultyTier; states: RenderState[] }> = [];
  if (scenario.kind === "daily") {
    const opener = scenario.reuse ? [scenario.featured] : [];
    runs.push({ runId: `${scenario.prefix}-post-1-single-question`, mode: "single-question", ids: [scenario.featured], states: ["question", "correct"] });
    runs.push({ runId: `${scenario.prefix}-post-2-answer-reveal`, mode: "answer-reveal", ids: [scenario.featured], states: ["question", "correct"] });
    runs.push({
      runId: `${scenario.prefix}-post-3-multi-question`,
      mode: "multi-question",
      ids: [...opener, ...scenario.challenge],
      states: ["question", "correct"],
      challenge: { repeatVariant: scenario.reuse ? scenario.repeatVariant ?? null : null, midCtaVariant: scenario.midCtaVariant ?? null },
    });
  } else {
    runs.push({
      runId: scenario.name,
      mode: scenario.mode,
      ids: scenario.ids,
      states: scenario.states ?? ["question", "correct"],
      challenge: scenario.challenge,
      difficulty: scenario.difficulty,
    });
  }

  const out: AuthorityCard[] = [];
  for (const run of runs) {
    const runQuestions = run.ids.map((id) => byId.get(id)!).filter(Boolean);
    const plan = planCaptureJobs(
      {
        states: run.states,
        post: run.mode === "single-question" || run.mode === "answer-reveal" ? run.mode : null,
        multiQuestion: run.mode === "multi-question" ? (run.challenge as never) ?? {} : null,
        difficulty: run.difficulty ?? null,
      },
      runQuestions,
    );
    const challenge = plan.challengeSpecs !== null;
    for (const group of plan.groups) {
      const scaleByFormat = new Map<string, number>();
      for (const job of group.jobs) {
        let expected = { selectedIndex: null as number | null, showExplanation: false };
        if (job.slide === "quiz" || job.slide === "recap") {
          const answerPlan = resolveAnswerPlan(job.question, job.slide === "recap" ? "question" : job.state);
          if (answerPlan.kind === "skip") {
            for (const formatKey of scenario.formats) {
              out.push({ runId: run.runId, path: `${group.dirSlug}/${job.fileFor(formatKey)}`, png: null, usedScale: null, qaFailures: [], skipped: answerPlan.reason });
            }
            continue;
          }
          expected = answerPlan.plan;
        }
        for (const formatKey of scenario.formats) {
          const format = getFormat(formatKey)!;
          const authority = await captureOne({
            browser,
            baseUrl,
            question: job.question,
            state: job.state,
            format,
            expectedSelectedIndex: expected.selectedIndex,
            expectExplanation: expected.showExplanation,
            forcedScale: job.sharesZoom ? scaleByFormat.get(formatKey) : undefined,
            slide: job.slide,
            difficulty: job.difficulty ?? undefined,
            injectQuestions: job.injectAll || challenge ? runQuestions : undefined,
            extraParams: job.extraParams,
          });
          if (job.sharesZoom && !scaleByFormat.has(formatKey) && authority.usedScale !== null) {
            scaleByFormat.set(formatKey, authority.usedScale);
          }
          out.push({
            runId: run.runId,
            path: `${group.dirSlug}/${job.fileFor(formatKey)}`,
            png: authority.png,
            usedScale: authority.usedScale,
            qaFailures: authority.qa.failures.map((f) => `${f.code}: ${f.message.slice(0, 140)}`),
            skipped: null,
          });
        }
      }
    }
  }
  return out;
}

/** Compare two PNGs inside the page, using a canvas — no image dependency. */
async function diffInBrowser(page: Page, aDataUrl: string, bDataUrl: string) {
  return page.evaluate(
    async ([a, b]) => {
      const decode = (src: string) =>
        new Promise<HTMLImageElement>((resolve, reject) => {
          const image = new Image();
          image.onload = () => resolve(image);
          image.onerror = () => reject(new Error("decode failed"));
          image.src = src;
        });
      const [imageA, imageB] = await Promise.all([decode(a), decode(b)]);
      if (imageA.naturalWidth !== imageB.naturalWidth || imageA.naturalHeight !== imageB.naturalHeight) {
        return {
          dimensionsMatch: false,
          authority: `${imageA.naturalWidth}x${imageA.naturalHeight}`,
          browser: `${imageB.naturalWidth}x${imageB.naturalHeight}`,
        };
      }
      const width = imageA.naturalWidth;
      const height = imageA.naturalHeight;
      const read = (image: HTMLImageElement) => {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d")!;
        context.drawImage(image, 0, 0);
        return context.getImageData(0, 0, width, height).data;
      };
      const da = read(imageA);
      const db = read(imageB);

      let identical = 0;
      let gross = 0;
      let sum = 0;
      for (let i = 0; i < da.length; i += 4) {
        const delta =
          Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]);
        if (delta <= 12) identical++;
        if (delta > 90) gross++;
        sum += delta;
      }
      const pixels = width * height;

      // A composition that CHANGED and a composition that merely sits a few
      // pixels lower are different defects, and one whole-frame number cannot
      // tell them apart. Measure the best vertical alignment inside horizontal
      // BANDS: if every band lines up at a small offset and matches almost
      // exactly once aligned, the picture is the same picture and the only
      // difference is placement drift — which is what `maxBandShift` and
      // `alignedMeanDelta` report. A band that stays different at every offset
      // is a real divergence, and `worstBandAligned` names how bad it gets.
      const BANDS = 12;
      const bandShifts: number[] = [];
      let alignedSum = 0;
      let alignedCount = 0;
      let worstBandAligned = 0;
      for (let band = 0; band < BANDS; band++) {
        const y0 = Math.floor((band * height) / BANDS);
        const y1 = Math.floor(((band + 1) * height) / BANDS);
        let bandBestMean = Infinity;
        let bandBestShift = 0;
        let bandBestSum = 0;
        let bandBestCount = 0;
        for (let dy = -24; dy <= 24; dy++) {
          let bandSum = 0;
          let counted = 0;
          for (let y = Math.max(y0, -dy); y < Math.min(y1, height - dy); y += 2) {
            for (let x = 0; x < width; x += 2) {
              const i = (y * width + x) * 4;
              const j = ((y + dy) * width + x) * 4;
              bandSum +=
                Math.abs(da[i] - db[j]) + Math.abs(da[i + 1] - db[j + 1]) + Math.abs(da[i + 2] - db[j + 2]);
              counted++;
            }
          }
          if (!counted) continue;
          const mean = bandSum / counted / 3;
          if (mean < bandBestMean) {
            bandBestMean = mean;
            bandBestShift = dy;
            bandBestSum = bandSum;
            bandBestCount = counted;
          }
        }
        if (bandBestCount === 0) continue;
        bandShifts.push(bandBestShift);
        alignedSum += bandBestSum;
        alignedCount += bandBestCount;
        worstBandAligned = Math.max(worstBandAligned, bandBestMean);
      }

      return {
        dimensionsMatch: true,
        width,
        height,
        identicalPct: +((100 * identical) / pixels).toFixed(2),
        grossPct: +((100 * gross) / pixels).toFixed(2),
        meanDelta: +(sum / pixels / 3).toFixed(2),
        maxBandShift: bandShifts.length ? Math.max(...bandShifts.map(Math.abs)) : 0,
        bandShifts,
        alignedMeanDelta: alignedCount ? +(alignedSum / alignedCount / 3).toFixed(2) : null,
        worstBandAligned: +worstBandAligned.toFixed(2),
      };
    },
    [aDataUrl, bDataUrl] as const,
  );
}

/**
 * The parts of the contract an image diff cannot see.
 *
 * Each runs in a real browser against the real exporter — the gate has to
 * refuse a card the CLI would refuse, the archive has to contain the paths a
 * local run would write, and the normal path has to touch no local renderer.
 */
async function runBehaviourChecks(page: Page, questions: RenderQuestion[]): Promise<{ name: string; pass: boolean; detail: string }[]> {
  const requested: string[] = [];
  page.on("request", (request) => requested.push(request.url()));
  const checks: { name: string; pass: boolean; detail: string }[] = [];
  const poisonedAsset = {
    status: "unresolved",
    reason: "the canonical resolver found no file for the declared path",
    references: [{ channel: "image_path", path: "assets/items/3113.png", requirement: "required", resolution: "missing" }],
    unresolved: [{ channel: "image_path", path: "assets/items/3113.png", requirement: "required", resolution: "missing" }],
    degraded_to_text: false,
    optional_unresolved: false,
    case_repaired: false,
  };

  // 1 — an unresolved REQUIRED asset must block, with a reason, and produce
  //     no file. This is the Step 1E gate, unchanged, applied in Admin.
  const blocked = await page.evaluate(async ({ qs, poison }) => {
    const [{ buildExportPlan }, { runBrowserExport }] = await Promise.all([
      import("/src/lib/quiz-screenshot/exportPlan.ts" as string),
      import("/src/lib/quiz-screenshot/runBrowserExport.ts" as string),
    ]);
    const poisoned = qs.map((q: Record<string, unknown>) => (q.id === "vq-04" ? { ...q, asset_status: poison } : q));
    const plan = buildExportPlan({
      selection: [{ id: "vq-04", label: "#vq-04" }],
      formats: ["mobile-social"],
      states: ["question"],
      post: null,
      runId: "gate",
    });
    const run = await runBrowserExport({ plan, questions: poisoned });
    return { files: run.files.length, outcomes: run.outcomes.map((o) => ({ status: o.status, reason: (o as { reason?: string }).reason })) };
  }, { qs: questions as unknown as Record<string, unknown>[], poison: poisonedAsset });
  checks.push({
    name: "unresolved required asset blocks",
    pass: blocked.files === 0 && blocked.outcomes[0]?.status === "failed",
    detail: `${blocked.files} file(s); ${blocked.outcomes[0]?.status}: ${(blocked.outcomes[0]?.reason ?? "").slice(0, 110)}`,
  });

  // 2 — the /admin/quiz-content delivery is unchanged: a multi-card run is an
  //     archive whose paths match the run-directory layout a local run writes.
  const archive = await page.evaluate(async ({ qs }) => {
    const [{ buildExportPlan }, { runBrowserExport }, { deliverExportedFiles }] = await Promise.all([
      import("/src/lib/quiz-screenshot/exportPlan.ts" as string),
      import("/src/lib/quiz-screenshot/runBrowserExport.ts" as string),
      import("/src/lib/quiz-screenshot/deliverExport.ts" as string),
    ]);
    const JSZip = (window as unknown as { JSZip: typeof import("jszip") }).JSZip;
    let saved: { name: string; blob: Blob } | null = null;
    const originalCreate = URL.createObjectURL;
    const originalClick = HTMLAnchorElement.prototype.click;
    let pending: Blob | null = null;
    URL.createObjectURL = (blob: Blob) => { pending = blob; return "blob:intercepted"; };
    HTMLAnchorElement.prototype.click = function intercepted(this: HTMLAnchorElement) {
      saved = { name: this.download, blob: pending! };
    };
    const plan = buildExportPlan({
      selection: [{ id: "vq-01", label: "#vq-01" }, { id: "vq-10", label: "#vq-10" }],
      formats: ["mobile-social"],
      states: ["question", "correct"],
      post: null,
      runId: "bundle",
    });
    try {
      const run = await runBrowserExport({ plan, questions: qs });
      const delivered = await deliverExportedFiles(run.files, plan.zipFileName);
      const reloaded = await JSZip.loadAsync(saved!.blob);
      return {
        planned: plan.cards.length,
        delivery: plan.delivery,
        zipFileName: saved!.name,
        deliveredKind: delivered?.kind ?? null,
        entries: Object.keys(reloaded.files).filter((n) => !reloaded.files[n].dir).sort(),
        bytes: saved!.blob.size,
        failures: run.outcomes.filter((o) => o.status !== "captured").map((o) => `${o.card.zipPath}: ${(o as { reason?: string }).reason}`),
      };
    } finally {
      URL.createObjectURL = originalCreate;
      HTMLAnchorElement.prototype.click = originalClick;
    }
  }, { qs: questions });
  const expected = [
    "bundle/question_vq-01/mobile-social_correct.png",
    "bundle/question_vq-01/mobile-social_question.png",
    "bundle/question_vq-10/mobile-social_correct.png",
    "bundle/question_vq-10/mobile-social_question.png",
  ];
  checks.push({
    name: "multi-card run delivers a ZIP",
    pass:
      archive.delivery === "zip" &&
      archive.deliveredKind === "zip" &&
      archive.zipFileName === "bundle.zip" &&
      JSON.stringify(archive.entries) === JSON.stringify(expected) &&
      archive.bytes > 0,
    detail: `${archive.entries.length}/${archive.planned} entries, ${archive.bytes} bytes, ${archive.zipFileName}${archive.failures.length ? `; ${archive.failures.join("; ")}` : ""}`,
  });

  // 3 — the export must not touch the page it runs on. The harness themes
  //     the document it renders into, and React renders the export tree from
  //     THIS realm, so a bare `document` there is Admin's: the operator used
  //     to watch the console turn League-dark mid-export.
  const isolation = await page.evaluate(async ({ qs }) => {
    const [{ buildExportPlan }, { runBrowserExport }] = await Promise.all([
      import("/src/lib/quiz-screenshot/exportPlan.ts" as string),
      import("/src/lib/quiz-screenshot/runBrowserExport.ts" as string),
    ]);
    document.documentElement.className = "theme-mogsy";
    const before = document.documentElement.className;
    const mutations: string[] = [];
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.target === document.documentElement) mutations.push(document.documentElement.className);
      }
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style"] });
    const splash = document.createElement("div");
    splash.id = "initial-shell";
    document.body.appendChild(splash);
    const plan = buildExportPlan({
      selection: [{ id: "vq-01", label: "#vq-01" }],
      formats: ["mobile-social"],
      states: ["question"],
      post: null,
      runId: "isolation",
    });
    const run = await runBrowserExport({ plan, questions: qs });
    observer.disconnect();
    const splashSurvived = !!document.getElementById("initial-shell");
    splash.remove();
    const after = document.documentElement.className;
    document.documentElement.className = "";
    return { before, after, mutations, splashSurvived, captured: run.files.length };
  }, { qs: questions });
  checks.push({
    name: "export never touches the Admin document",
    pass:
      isolation.captured === 1 &&
      isolation.mutations.length === 0 &&
      isolation.before === isolation.after &&
      isolation.splashSurvived,
    detail:
      `root class "${isolation.before}" -> "${isolation.after}", ` +
      `${isolation.mutations.length} root mutation(s), splash kept=${isolation.splashSurvived}, ` +
      `${isolation.captured} card captured`,
  });

  // 4 — CC2: a blocked card inside a challenge fails the RUN, is listed in
  //     failures.json, and is absent from the manifest — never a silent gap.
  const partial = await page.evaluate(async ({ qs, poison }) => {
    const [{ buildExportPlan }, { runContentExport }] = await Promise.all([
      import("/src/lib/quiz-screenshot/exportPlan.ts" as string),
      import("/src/lib/quiz-screenshot/contentExport.ts" as string),
    ]);
    const poisoned = qs.map((q: Record<string, unknown>) => (q.id === "vq-04" ? { ...q, asset_status: poison } : q));
    const plan = buildExportPlan({
      selection: ["vq-01", "vq-04", "vq-08"].map((id) => ({ id, label: `#${id}` })),
      formats: ["square"],
      states: [],
      post: null,
      mode: "multi-question",
      runId: "partial",
      questions: poisoned,
    });
    const result = await runContentExport({ request: { kind: "run", plan }, questions: poisoned });
    const report = result.runs[0].report;
    const JSZip = (window as unknown as { JSZip: typeof import("jszip") }).JSZip;
    const zip = await JSZip.loadAsync(result.archive.blob);
    const failures = JSON.parse(await zip.file("partial/failures.json")!.async("string"));
    const manifest = JSON.parse(await zip.file("partial/manifest.json")!.async("string"));
    return {
      status: report.status,
      failed: failures.map((f: { state: string; classification: string }) => `${f.state}:${f.classification}`),
      slides: manifest.slides.map((s: { slug: string }) => s.slug),
      hasContactSheet: !!zip.file("partial/index.html"),
    };
  }, { qs: questions as unknown as Record<string, unknown>[], poison: poisonedAsset });
  checks.push({
    name: "a blocked challenge slide fails the run honestly",
    pass:
      partial.status === "failed" &&
      partial.failed.some((f: string) => f.startsWith("q02:")) &&
      !partial.slides.includes("q02") &&
      partial.slides.includes("q01") &&
      partial.hasContactSheet,
    detail: `status=${partial.status}; failures=[${partial.failed.join(", ")}]; manifest slides=[${partial.slides.join(", ")}]`,
  });

  // 5 — nothing in the normal path reached a local renderer.
  const localRenderer = requested.filter((url) => /:(8790|8791)\//.test(url));
  checks.push({
    name: "no local renderer contacted",
    pass: localRenderer.length === 0,
    detail: localRenderer.length ? localRenderer.slice(0, 3).join(", ") : "no request to the Content Workspace API",
  });
  return checks;
}

function writeSummary(lines: string[]) {
  const file = process.env.GITHUB_STEP_SUMMARY;
  if (file) fs.appendFileSync(file, `${lines.join("\n")}\n`);
}

async function main() {
  const baseIndex = process.argv.indexOf("--base-url");
  const baseUrl = (baseIndex >= 0 ? process.argv[baseIndex + 1] : "http://127.0.0.1:5199").replace(/\/$/, "");

  fs.mkdirSync(OUT_ROOT, { recursive: true });
  const questions = loadQuestions();
  const rows: Record<string, unknown>[] = [];
  const archives: Record<string, unknown>[] = [];
  let behaviour: { name: string; pass: boolean; detail: string }[] = [];

  // Authority is always bundled Chromium; the exporter is Chromium or Firefox.
  const authorityBrowser = await launch("chromium");
  const exporterBrowser = EXPORTER === "chromium" ? authorityBrowser : await launch("firefox");
  const shutdown = async () => {
    await exporterBrowser.close().catch(() => {});
    if (exporterBrowser !== authorityBrowser) await authorityBrowser.close().catch(() => {});
  };
  process.once("SIGINT", () => void shutdown().then(() => process.exit(130)));
  process.once("SIGTERM", () => void shutdown().then(() => process.exit(143)));

  try {
    const exporterPage = await openExporterPage(exporterBrowser, baseUrl);
    const diffPage = EXPORTER === "chromium" ? exporterPage : await openExporterPage(authorityBrowser, baseUrl);

    // Warm-up: a dev server compiles modules on first request, which can eat
    // most of a card's 20s ready budget. Load the exporter and harness modules
    // once, and render one throwaway authority card, before anything is timed.
    await exporterPage.evaluate(async () => {
      await Promise.all([
        import("/src/lib/quiz-screenshot/contentExport.ts" as string),
        import("/src/lib/quiz-screenshot/runBrowserExport.ts" as string),
        import("/src/pages/dev/quiz-render/QuizRenderPage.tsx" as string),
      ]);
    });
    await captureOne({
      browser: authorityBrowser,
      baseUrl,
      question: questions[0],
      state: "question",
      format: getFormat("square")!,
      expectedSelectedIndex: null,
      expectExplanation: false,
    }).catch(() => {});

    for (const scenario of SCENARIOS) {
      console.log(`\n── ${scenario.name} — ${scenario.note}`);
      const exported = await exportInBrowser(exporterPage, questions, scenario);
      if (exported.planErrors.length) {
        rows.push({ scenario: scenario.name, verdict: "PLAN ERROR", detail: exported.planErrors.join("; ") });
        console.log(`  PLAN ERROR — ${exported.planErrors.join("; ")}`);
        continue;
      }
      archives.push({ scenario: scenario.name, ...exported.archive, runs: exported.runs, support: exported.support });
      const authority = await captureAuthority(authorityBrowser, baseUrl, questions, scenario);

      if (authority.length !== exported.cards.length) {
        rows.push({ scenario: scenario.name, verdict: "COUNT", detail: `authority ${authority.length} vs browser ${exported.cards.length}` });
        console.log(`  COUNT — authority ${authority.length} card(s), browser ${exported.cards.length}`);
      }
      for (let i = 0; i < authority.length; i++) {
        const a = authority[i];
        const b = exported.cards.find((c) => c.runId === a.runId && c.path === a.path);
        const tag = `${a.runId}/${a.path}`;
        const fileTag = tag.replace(/[\\/]/g, "__").replace(/\.png$/, "");
        const order = exported.cards[i] && exported.cards[i].runId === a.runId && exported.cards[i].path === a.path;
        const base = { scenario: scenario.name, tag, orderMatches: order };
        if (a.png) fs.writeFileSync(path.join(OUT_ROOT, `${fileTag}__authority.png`), a.png);
        if (b?.dataUrl) fs.writeFileSync(path.join(OUT_ROOT, `${fileTag}__browser.png`), Buffer.from(b.dataUrl.split(",")[1], "base64"));

        let verdict: string;
        let detail: Record<string, unknown> = {};
        if (!b) {
          verdict = "MISSING";
        } else if (a.skipped) {
          verdict = b.status === "skipped" ? "BOTH-SKIPPED" : "SKIP-MISMATCH";
          detail = { authority: a.skipped, browser: b.reason };
        } else if (a.qaFailures.length) {
          verdict = b.dataUrl ? "LEAKED" : "BOTH-REFUSED";
          detail = { authority: a.qaFailures, browser: `${b.classification}: ${b.reason}` };
        } else if (!b.dataUrl) {
          verdict = "NO OUTPUT";
          detail = { browser: `${b.status} ${b.classification ?? ""}: ${b.reason}` };
        } else {
          const diff = (await diffInBrowser(diffPage, `data:image/png;base64,${a.png!.toString("base64")}`, b.dataUrl)) as Record<string, unknown>;
          detail = { authorityScale: a.usedScale, browserScale: b.usedScale, ...diff };
          verdict =
            diff.dimensionsMatch === false
              ? "DIMENSIONS"
              : (diff.alignedMeanDelta as number) > ALIGNED_DELTA_LIMIT
                ? "DIVERGED"
                : "MATCH";
        }
        if (!order && verdict === "MATCH") verdict = "ORDER";
        rows.push({ ...base, verdict, ...detail });
        const brief =
          verdict === "MATCH" || verdict === "DIVERGED"
            ? {
                scale: detail.authorityScale === detail.browserScale ? "same" : `${detail.authorityScale}!=${detail.browserScale}`,
                maxBandShift: detail.maxBandShift,
                alignedMeanDelta: detail.alignedMeanDelta,
                worstBandAligned: detail.worstBandAligned,
              }
            : detail;
        console.log(`  ${verdict.padEnd(12)} ${tag.padEnd(72)} ${JSON.stringify(brief).slice(0, 400)}`);
      }
      console.log(`  archive ${exported.archive.fileName}: ${exported.archive.zipEntries.length} entries, ${exported.archive.bytes} bytes; runs ${exported.runs.map((r) => `${r.runId}=${r.status}`).join(", ")}`);
    }

    behaviour = await runBehaviourChecks(exporterPage, questions);
  } finally {
    await shutdown();
  }

  fs.writeFileSync(path.join(OUT_ROOT, "parity.json"), JSON.stringify(rows, null, 2));
  fs.writeFileSync(path.join(OUT_ROOT, "archives.json"), JSON.stringify(archives, null, 2));
  fs.writeFileSync(path.join(OUT_ROOT, "behaviour.json"), JSON.stringify(behaviour, null, 2));

  console.log("");
  for (const check of behaviour) {
    console.log(`${check.name.padEnd(48)} ${check.pass ? "PASS" : "FAIL"} — ${check.detail}`);
  }

  const HARD = new Set(["MISSING", "SKIP-MISMATCH", "LEAKED", "NO OUTPUT", "DIMENSIONS", "DIVERGED", "ORDER", "COUNT", "PLAN ERROR"]);
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(String(row.verdict), (counts.get(String(row.verdict)) ?? 0) + 1);
  const hard = rows.filter((r) => HARD.has(String(r.verdict)));
  const behaviourFailed = behaviour.filter((c) => !c.pass);
  const tally = [...counts.entries()].map(([k, v]) => `${k} ${v}`).join(", ");
  console.log(`\nexporter=${EXPORTER}; ${rows.length} comparison(s): ${tally}; behaviour ${behaviour.length - behaviourFailed.length}/${behaviour.length} pass`);
  console.log(`wrote results to ${OUT_ROOT}`);

  writeSummary([
    `### Browser export parity — exporter: ${EXPORTER}`,
    "",
    `${rows.length} card comparison(s): ${tally}`,
    `Behaviour checks: ${behaviour.length - behaviourFailed.length}/${behaviour.length} pass`,
    "",
    "| verdict | card | scale | max drift | aligned Δ | worst band |",
    "| --- | --- | --- | --- | --- | --- |",
    ...rows.map((r) =>
      `| ${r.verdict} | \`${r.tag ?? r.scenario}\` | ${r.authorityScale === undefined ? "" : r.authorityScale === r.browserScale ? "same" : `${r.authorityScale}/${r.browserScale}`} | ${r.maxBandShift ?? ""} | ${r.alignedMeanDelta ?? ""} | ${r.worstBandAligned ?? ""} |`,
    ),
    "",
    ...behaviour.map((c) => `- ${c.pass ? "✅" : "❌"} ${c.name} — ${c.detail}`),
  ]);

  if (hard.length || behaviourFailed.length) {
    console.error(`${hard.length} hard parity failure(s), ${behaviourFailed.length} behaviour failure(s).`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : err);
  process.exitCode = 1;
});
