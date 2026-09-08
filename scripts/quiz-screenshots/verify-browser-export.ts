/**
 * CON1 — visual differential verification for the Admin browser export.
 *
 * The deterministic Playwright capture is the AUTHORITY. This harness runs the
 * browser exporter (`src/lib/quiz-screenshot/runBrowserExport.ts`) over the same
 * questions, formats and states, and compares its PNGs against `captureOne` —
 * the very function the CLI and Content Studio use — pixel for pixel.
 *
 * It is a QA tool, not part of the product: it writes only under the gitignored
 * export root and never touches the backend.
 *
 *   npx tsx scripts/quiz-screenshots/verify-browser-export.ts [--base-url <url>]
 *
 * A dev server must already be serving the app (the exporter is loaded as a
 * source module, so this runs against `npm run dev`, not a build).
 *
 * The diff itself is computed in the browser with a canvas, so the script adds
 * no image dependency. Reported per case:
 *   dimensions   — must match exactly; anything else is a hard failure
 *   identical %  — pixels within a 12/765 channel-sum tolerance (AA noise)
 *   gross %      — pixels differing by more than 90/765 (a real difference)
 *   meanDelta    — mean per-channel difference across the whole frame
 *   bestShift    — the vertical offset that minimises the difference, and the
 *                  mean delta at that offset. A large drop between meanDelta
 *                  and shiftedMean means the two frames are the same picture in
 *                  a slightly different place, which reads very differently
 *                  from a composition that actually diverged.
 */
import { chromium, type Browser, type Page } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { captureOne } from "./capture";
import { adaptScreenshotQuestions } from "../../src/lib/quiz-screenshot/adapt";
import { getFormat } from "../../src/lib/quiz-screenshot/formats";
import type { RenderQuestion, RenderState } from "../../src/lib/quiz-screenshot/types";

type Case = { questionId: string; format: string; states: RenderState[]; note: string };

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(HERE, "visual-qa-fixture.json");
const OUT_ROOT = path.join(process.cwd(), "quiz_content_exports", "browser-export-parity");

/**
 * One case per content class the task names, spread across the four publishable
 * shapes so a format-specific composition bug cannot hide behind a portrait-only
 * check.
 */
const CASES: Case[] = [
  { questionId: "vq-01", format: "mobile-social", states: ["question", "correct"], note: "plain stored MCQ" },
  { questionId: "vq-01", format: "square", states: ["question"], note: "plain stored MCQ, 1:1" },
  { questionId: "vq-04", format: "mobile-social", states: ["question", "correct"], note: "item recipe — asset-bearing" },
  { questionId: "vq-05", format: "vertical", states: ["question"], note: "family band presentation, 9:16" },
  { questionId: "vq-07", format: "landscape", states: ["question", "correct"], note: "family band, 16:9 two-column" },
  { questionId: "vq-08", format: "mobile-social", states: ["question", "correct"], note: "Mastery generated row" },
  { questionId: "vq-09", format: "mobile-social", states: ["question"], note: "Daily frozen card" },
  { questionId: "vq-09", format: "vertical", states: ["question"], note: "Daily frozen card, 9:16" },
  { questionId: "vq-03", format: "mobile-social", states: ["question", "correct"], note: "Pro Play question.context" },
  { questionId: "vq-12", format: "square", states: ["question"], note: "Pro Play player scope, 1:1" },
  { questionId: "vq-10", format: "mobile-social", states: ["question", "explanation"], note: "explanation card" },
];

function loadQuestions(): RenderQuestion[] {
  const raw = JSON.parse(fs.readFileSync(FIXTURE, "utf8")) as { questions: unknown[] };
  const { adapted, skipped } = adaptScreenshotQuestions(raw.questions as never[]);
  if (skipped.length) {
    console.warn(`fixture rows skipped by the adapter: ${skipped.map((s) => `${s.id} (${s.reason})`).join(", ")}`);
  }
  return adapted;
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
  return page;
}

async function exportInBrowser(
  page: Page,
  questions: RenderQuestion[],
  questionId: string,
  format: string,
  states: RenderState[],
): Promise<{ state: string; dataUrl: string | null; problem: string | null; usedScale: number | null }[]> {
  return page.evaluate(
    async ({ questions: qs, questionId: qid, format: fmt, states: sts }) => {
      const [{ buildExportPlan }, { runBrowserExport }] = await Promise.all([
        import("/src/lib/quiz-screenshot/exportPlan.ts" as string),
        import("/src/lib/quiz-screenshot/runBrowserExport.ts" as string),
      ]);
      const plan = buildExportPlan({
        selection: [{ id: qid, label: qid }],
        formats: [fmt],
        states: sts,
        post: null,
        runId: "parity",
      });
      if (plan.errors.length) throw new Error(plan.errors.join("; "));
      const run = await runBrowserExport({ plan, questions: qs });
      const toDataUrl = (blob: Blob) =>
        new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.readAsDataURL(blob);
        });
      const results: { state: string; dataUrl: string | null; problem: string | null; usedScale: number | null }[] = [];
      for (const outcome of run.outcomes) {
        results.push(
          outcome.status === "captured"
            ? {
                state: outcome.card.state,
                dataUrl: await toDataUrl(outcome.file.blob),
                problem: null,
                usedScale: outcome.usedScale,
              }
            : { state: outcome.card.state, dataUrl: null, problem: `${outcome.status}: ${outcome.reason}`, usedScale: null },
        );
      }
      return results;
    },
    { questions, questionId, format, states },
  );
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
async function runBehaviourChecks(baseUrl: string): Promise<{ name: string; pass: boolean; detail: string }[]> {
  const browser = await chromium.launch();
  const page = await openExporterPage(browser, baseUrl);
  const requested: string[] = [];
  page.on("request", (request) => requested.push(request.url()));
  const questions = loadQuestions();
  const checks: { name: string; pass: boolean; detail: string }[] = [];

  try {
    // 1 — an unresolved REQUIRED asset must block, with a reason, and produce
    //     no file. This is the Step 1E gate, unchanged, applied in Admin.
    const blocked = await page.evaluate(async ({ qs }) => {
      const [{ buildExportPlan }, { runBrowserExport }] = await Promise.all([
        import("/src/lib/quiz-screenshot/exportPlan.ts" as string),
        import("/src/lib/quiz-screenshot/runBrowserExport.ts" as string),
      ]);
      const poisoned = qs.map((q: Record<string, unknown>) =>
        q.id === "vq-04"
          ? {
              ...q,
              asset_status: {
                status: "unresolved",
                reason: "the canonical resolver found no file for the declared path",
                references: [
                  { channel: "image_path", path: "assets/items/3113.png", requirement: "required", resolution: "missing" },
                ],
                unresolved: [
                  { channel: "image_path", path: "assets/items/3113.png", requirement: "required", resolution: "missing" },
                ],
                degraded_to_text: false,
                optional_unresolved: false,
                case_repaired: false,
              },
            }
          : q,
      );
      const plan = buildExportPlan({
        selection: [{ id: "vq-04", label: "#vq-04" }],
        formats: ["mobile-social"],
        states: ["question"],
        post: null,
        runId: "gate",
      });
      const run = await runBrowserExport({ plan, questions: poisoned });
      return { files: run.files.length, outcomes: run.outcomes.map((o) => ({ status: o.status, reason: (o as { reason?: string }).reason })) };
    }, { qs: questions as unknown as Record<string, unknown>[] });
    checks.push({
      name: "unresolved required asset blocks",
      pass: blocked.files === 0 && blocked.outcomes[0]?.status === "failed",
      detail: `${blocked.files} file(s); ${blocked.outcomes[0]?.status}: ${(blocked.outcomes[0]?.reason ?? "").slice(0, 110)}`,
    });

    // 2 — a multi-card run is delivered as an archive whose paths match the
    //     run-directory layout a local run writes.
    // The real delivery path is exercised, not a re-implementation: JSZip is
    // supplied to the page as a global so the archive can be read back.
    await page.addScriptTag({ path: "node_modules/jszip/dist/jszip.min.js" });
    const archive = await page.evaluate(async ({ qs }) => {
      const [{ buildExportPlan }, { runBrowserExport }, { deliverExportedFiles }] = await Promise.all([
        import("/src/lib/quiz-screenshot/exportPlan.ts" as string),
        import("/src/lib/quiz-screenshot/runBrowserExport.ts" as string),
        import("/src/lib/quiz-screenshot/deliverExport.ts" as string),
      ]);
      const JSZip = (window as unknown as { JSZip: typeof import("jszip") }).JSZip;
      // Intercept the save so the harness can inspect what the operator's
      // browser was handed, without a real download prompt.
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
      detail: `${archive.entries.length}/${archive.planned} entries, ${archive.bytes} bytes, ${archive.zipFileName}`,
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
      // A sitewide theme the operator might be using, so the check also proves
      // it is neither disturbed here nor leaked into the export surface.
      document.documentElement.className = "theme-mogsy";
      const before = document.documentElement.className;
      const mutations: string[] = [];
      const observer = new MutationObserver((records) => {
        for (const record of records) {
          if (record.target === document.documentElement) {
            mutations.push(document.documentElement.className);
          }
        }
      });
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style"] });
      // The boot splash the harness used to strip from whichever document it
      // could reach. Admin's must survive an export untouched.
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

    // 4 — nothing in the normal path reached a local renderer.
    const localRenderer = requested.filter((url) => /:(8790|8791)\//.test(url));
    checks.push({
      name: "no local renderer contacted",
      pass: localRenderer.length === 0,
      detail: localRenderer.length ? localRenderer.slice(0, 3).join(", ") : "no request to the Content Workspace API",
    });
  } finally {
    await browser.close();
  }
  return checks;
}

async function main() {
  const baseIndex = process.argv.indexOf("--base-url");
  const baseUrl = (baseIndex >= 0 ? process.argv[baseIndex + 1] : "http://localhost:5199").replace(/\/$/, "");

  fs.mkdirSync(OUT_ROOT, { recursive: true });
  const questions = loadQuestions();
  const byId = new Map(questions.map((q) => [String(q.id), q]));

  const browser = await chromium.launch();
  const exporterPage = await openExporterPage(browser, baseUrl);
  const rows: Record<string, unknown>[] = [];

  try {
    for (const testCase of CASES) {
      const format = getFormat(testCase.format)!;
      const question = byId.get(testCase.questionId);
      if (!question) {
        console.warn(`skip ${testCase.questionId}: not in the fixture`);
        continue;
      }

      const exported = await exportInBrowser(
        exporterPage,
        questions,
        testCase.questionId,
        testCase.format,
        testCase.states,
      );

      // The authority. Same envelope rule the CLI applies: fit on the first
      // state, force that zoom on the rest.
      let reuseScale: number | undefined;
      for (const state of testCase.states) {
        const authority = await captureOne({
          browser,
          baseUrl,
          question,
          state,
          format,
          injectQuestions: questions,
          forcedScale: reuseScale,
        });
        if (reuseScale === undefined && authority.usedScale !== null) reuseScale = authority.usedScale;

        const tag = `${testCase.questionId}_${testCase.format}_${state}`;
        fs.writeFileSync(path.join(OUT_ROOT, `${tag}__authority.png`), authority.png);

        const mine = exported.find((e) => e.state === state);
        if (!mine || !mine.dataUrl) {
          rows.push({ tag, note: testCase.note, verdict: "NO OUTPUT", detail: mine?.problem ?? "not attempted" });
          console.log(`${tag.padEnd(44)} NO OUTPUT — ${mine?.problem ?? "not attempted"}`);
          continue;
        }
        fs.writeFileSync(
          path.join(OUT_ROOT, `${tag}__browser.png`),
          Buffer.from(mine.dataUrl.split(",")[1], "base64"),
        );

        const diff = await diffInBrowser(
          exporterPage,
          `data:image/png;base64,${authority.png.toString("base64")}`,
          mine.dataUrl,
        );
        const scales = { authorityScale: authority.usedScale, browserScale: mine.usedScale };
        rows.push({ tag, note: testCase.note, ...scales, ...diff });
        const brief = {
          scale: scales.authorityScale === scales.browserScale ? "same" : `${scales.authorityScale}!=${scales.browserScale}`,
          dims: (diff as { dimensionsMatch?: boolean }).dimensionsMatch,
          maxBandShift: (diff as { maxBandShift?: number }).maxBandShift,
          alignedMeanDelta: (diff as { alignedMeanDelta?: number }).alignedMeanDelta,
          worstBandAligned: (diff as { worstBandAligned?: number }).worstBandAligned,
        };
        console.log(`${tag.padEnd(44)} ${JSON.stringify(brief)}`);
      }
    }
  } finally {
    await browser.close();
  }

  fs.writeFileSync(path.join(OUT_ROOT, "parity.json"), JSON.stringify(rows, null, 2));

  // Behavioural checks that need a real browser but not an image diff: the
  // fail-closed gate, and what the operator's browser is actually handed.
  const behaviour = await runBehaviourChecks(baseUrl);
  for (const check of behaviour) {
    console.log(`${check.name.padEnd(44)} ${check.pass ? "PASS" : "FAIL"} — ${check.detail}`);
    if (!check.pass) process.exitCode = 1;
  }
  fs.writeFileSync(path.join(OUT_ROOT, "behaviour.json"), JSON.stringify(behaviour, null, 2));
  console.log(`\nwrote ${rows.length} comparisons to ${OUT_ROOT}`);

  const hardFailures = rows.filter((r) => r.verdict === "NO OUTPUT" || r.dimensionsMatch === false);
  if (hardFailures.length) {
    console.error(`${hardFailures.length} case(s) produced no output or the wrong dimensions.`);
    process.exitCode = 1;
  }
}

void main();
