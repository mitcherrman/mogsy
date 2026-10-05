import { describe, expect, it } from "vitest";
import { PATCH_REPORTS_KEY as PH2_LIST_KEY, patchReportKey as ph2ReportKey } from "@/lib/patch-impact-loader/evidence";
import { PATCH_REPORTS_KEY, patchReportKey } from "./plan";
import hookSource from "@/hooks/usePatchCatchUpLoader.ts?raw";
import pageSource from "@/pages/lol/PatchReports.tsx?raw";

const loaderSources = import.meta.glob(["./*.ts", "!./*.test.ts", "!./test-support.ts"], {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;
/** Code only: comments may legitimately name what the code must not do. */
const stripComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const production: Record<string, string> = Object.fromEntries(
  Object.entries({ ...loaderSources, "usePatchCatchUpLoader.ts": hookSource }).map(([file, source]) => [
    file,
    stripComments(source),
  ]),
);

describe("shared cache identity", () => {
  it("uses exactly the keys Patch Impact (PH2-C) uses", () => {
    expect(PATCH_REPORTS_KEY).toEqual(PH2_LIST_KEY);
    expect(patchReportKey("26.14")).toEqual(ph2ReportKey("26.14"));
  });

  it("uses exactly the keys the Patch Reports page uses", () => {
    expect(pageSource).toContain('queryKey: ["patch-reports"]');
    expect(pageSource).toContain('queryKey: ["patch-report", selectedVersion]');
  });
});

describe("what the loader source may touch", () => {
  it("has production files to check", () => {
    expect(Object.keys(production).length).toBeGreaterThanOrEqual(5);
  });

  it.each(Object.entries(production))("%s: no champion stats, no Patch Impact, no writes, no storage", (_file, source) => {
    expect(source).not.toMatch(/champion-base-stats|fetchChampionBaseStats|league-docs/);
    expect(source).not.toMatch(/@\/lib\/patch-impact["'/-]/);
    expect(source).not.toMatch(/useMutation|method:\s*["'](POST|PUT|PATCH|DELETE)|localStorage|sessionStorage/);
    expect(source).not.toMatch(/\bfetch\(/); // network only through the public accessors
  });

  it("the domain-facing pieces never read timestamps or release dates to order patches", () => {
    for (const [file, source] of Object.entries(production)) {
      expect(source, file).not.toMatch(/built_at|release_date|Date\.parse|new Date\(/);
    }
  });
});
