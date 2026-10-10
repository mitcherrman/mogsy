/**
 * PPQ2-C — isolated DEV preview of the Pro Play arena presentation.
 *
 *   /src/components/pro-play/arena/__preview__/index.html
 *     ?fixture=<PRO_PLAY_SAMPLES key> &state=pre|selected|correct|wrong
 *     &names=real|long &prompt=real|long &rails=panel|none &stage=seam|default
 *
 * Mounts the production `CanonicalArena` inside the same full-bleed page frame
 * `Layout` gives Ranked (`main.relative.z-20.w-full` under the header band),
 * without the app router, HUD or auth. Not part of the production build: Vite
 * builds only the root `index.html`.
 */
import { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import "@/index.css";
import { CanonicalArena } from "@/components/ranked-arena/CanonicalArena";
import { TooltipProvider } from "@/components/ui/tooltip";
import { previewView, readPreviewParams } from "./previewView";

const client = new QueryClient({ defaultOptions: { queries: { retry: 2, refetchOnWindowFocus: false } } });

function Preview() {
  const params = useMemo(() => readPreviewParams(window.location.search), []);
  const [selected, setSelected] = useState<string | null>(null);
  const { view, note } = previewView(params, {
    selectedOptionId: selected,
    onSelectOption: (o) => setSelected(o.id),
  });
  return (
    <div className="relative min-h-dvh pt-[var(--app-header-h)] pb-bottom-nav"
      data-ppq2c-preview={note} data-ppq2c-state={params.state}>
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
