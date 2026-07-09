/**
 * Remotion CLI config for the quiz video export pipeline (src/video/).
 * Isolated from the Vite app build — Remotion bundles its own entry.
 */
import { Config } from "@remotion/cli/config";

Config.setEntryPoint("src/video/index.ts");
Config.setVideoImageFormat("jpeg");
Config.setJpegQuality(95);
Config.setOverwriteOutput(true);
