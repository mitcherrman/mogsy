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

Config.overrideWebpackConfig((config) => {
  const withTailwind = enableTailwind(config);
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
