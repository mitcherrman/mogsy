/**
 * Remotion CLI config for the quiz video export pipeline (src/video/).
 * Isolated from the Vite app build — Remotion bundles its own entry.
 *
 * Tailwind is enabled so the export can render the REAL quiz-broadcast
 * scene components (src/components/quiz-broadcast/) instead of a separate
 * visual template. The broadcast look is the single source of truth.
 */
import path from "node:path";
import { Config } from "@remotion/cli/config";
import { enableTailwind } from "@remotion/tailwind";

/**
 * Vite parity for root-absolute CSS urls: the app CSS references public-dir
 * assets as url("/assets/…"). Vite leaves those untouched (served from
 * public/), but webpack's css-loader tries to bundle them relative to the
 * project root and fails the whole build. Remotion's dev/render server also
 * serves public/ at the root, so the correct behavior is Vite's: skip them.
 */
type WebpackRule = {
  oneOf?: WebpackRule[];
  use?: Array<string | { loader?: string; options?: Record<string, unknown> }>;
};

function skipAbsoluteCssUrls(rules: WebpackRule[] | undefined): void {
  for (const rule of rules ?? []) {
    if (rule.oneOf) skipAbsoluteCssUrls(rule.oneOf);
    for (const use of Array.isArray(rule.use) ? rule.use : []) {
      if (typeof use === "object" && use.loader?.includes("css-loader") &&
          !use.loader.includes("postcss")) {
        use.options = {
          ...use.options,
          url: { filter: (url: string) => !url.startsWith("/") },
        };
      }
    }
  }
}

Config.overrideWebpackConfig((config) => {
  const withTailwind = enableTailwind(config);
  skipAbsoluteCssUrls(withTailwind.module?.rules as WebpackRule[] | undefined);
  return {
    ...withTailwind,
    resolve: {
      ...withTailwind.resolve,
      alias: {
        ...withTailwind.resolve?.alias,
        // Mirror the Vite "@" → src alias so shared broadcast components resolve.
        "@": path.resolve(process.cwd(), "src"),
      },
    },
  };
});
Config.setEntryPoint("src/video/index.ts");
Config.setVideoImageFormat("jpeg");
Config.setJpegQuality(95);
Config.setOverwriteOutput(true);
