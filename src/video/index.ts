import { registerRoot } from "remotion";
import { MotionGlobalConfig } from "framer-motion";
import { loadFont } from "@remotion/google-fonts/Inter";
// Tailwind styles — the export renders the real quiz-broadcast components,
// which are styled with Tailwind classes (see remotion.config.ts enableTailwind).
import "../index.css";
import { RemotionRoot } from "./Root";

// The live app loads Inter via <link> tags in index.html, which the Remotion
// bundle never sees. Load the same family here; Remotion delays rendering
// until the font is ready, so every frame uses the broadcast typeface.
// Restricted to the latin subset + the weights the broadcast actually uses
// (400 base, 500 medium, 600 semibold, 700 bold, 800 extrabold, 900 black)
// so the loader doesn't fan out dozens of subset requests per render tab.
loadFont("normal", {
  subsets: ["latin"],
  weights: ["400", "500", "600", "700", "800", "900"],
});

// Determinism: broadcast components carry decorative framer-motion loops
// (breathing glows, shimmer sweeps, Ken Burns) that are wall-clock driven.
// Skipping animations snaps every motion value to its final state, so each
// frame renders identically no matter when it is captured. This runs ONLY
// in the Remotion bundle — the live app never imports this entry.
MotionGlobalConfig.skipAnimations = true;

registerRoot(RemotionRoot);
