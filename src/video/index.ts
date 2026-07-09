import { registerRoot } from "remotion";
import { MotionGlobalConfig } from "framer-motion";
// Tailwind styles — the export renders the real quiz-broadcast components,
// which are styled with Tailwind classes (see remotion.config.ts enableTailwind).
import "../index.css";
import { RemotionRoot } from "./Root";

// Determinism: broadcast components carry decorative framer-motion loops
// (breathing glows, shimmer sweeps, Ken Burns) that are wall-clock driven.
// Skipping animations snaps every motion value to its final state, so each
// frame renders identically no matter when it is captured. This runs ONLY
// in the Remotion bundle — the live app never imports this entry.
MotionGlobalConfig.skipAnimations = true;

registerRoot(RemotionRoot);
