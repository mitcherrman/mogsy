/**
 * PPQ2-D — isolated DEV preview of the Pro Play statistical reveal.
 *
 *   /src/components/pro-play/arena/reveal/__preview__/index.html
 *     ?fixture=<PRO_PLAY_SAMPLES key> &grade=real|correct|wrong
 *     &evidence=full|partial|absent &ids=rich|plain
 *     &names=real|long &prompt=real|long &rails=panel|none &stage=seam|default
 *
 * Same frame as PPQ2-C's preview (production `CanonicalArena` in Layout's
 * full-bleed main). Not part of the production build.
 */
import { useMemo } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import "@/index.css";
import { CanonicalArena } from "@/components/ranked-arena/CanonicalArena";
import { TooltipProvider } from "@/components/ui/tooltip";
import { previewRevealView, readRevealParams } from "./previewRevealView";

const client = new QueryClient({ defaultOptions: { queries: { retry: 2, refetchOnWindowFocus: false } } });

function Preview() {
  const params = useMemo(() => readRevealParams(window.location.search), []);
  const { view, note } = previewRevealView(params);
  return (
    <div className="relative min-h-dvh pt-[var(--app-header-h)] pb-bottom-nav"
      data-ppq2d-preview={note} data-ppq2c-state={params.base.state}>
      <main className="relative z-20 w-full">
        <CanonicalArena view={view} />
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={client}>
    <TooltipProvider>
      <Preview />
    </TooltipProvider>
  </QueryClientProvider>,
);
