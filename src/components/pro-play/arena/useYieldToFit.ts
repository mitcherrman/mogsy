/**
 * PPQ2-E — a height-locked box that drops optional rows instead of clipping.
 *
 * From `lg` the arena stage is locked to the viewport, and its regions take
 * what the stage has left. A reveal footer taller than the HUD row's reserve
 * (a long server explanation, or the partial-evidence note beside it at
 * 1024×768) shrinks the stage, and the anchor plate and the dossier flank
 * were cutting their lower rows off at their bottom edge (measured on the
 * production route: 5–34px).
 *
 * So rows that REPEAT something shown elsewhere on screen carry
 * `data-pp-yield="<n>"` (1 goes first). On every resize all of them are
 * restored, then dropped in order while the column still overflows. Below
 * `lg` these boxes are as tall as their content: nothing overflows and
 * nothing is dropped. jsdom has no layout, so nothing is ever dropped there.
 *
 * The column is the element whose overflow is measured: `columnSelector`
 * inside the root, or the root itself.
 */
import { useLayoutEffect, useRef } from "react";

export function useYieldToFit<T extends HTMLElement>(key: unknown, columnSelector?: string) {
  const ref = useRef<T>(null);
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const fit = () => {
      const column = columnSelector ? root.querySelector<HTMLElement>(columnSelector) : root;
      if (!column) return;
      const rows = Array.from(root.querySelectorAll<HTMLElement>("[data-pp-yield]"))
        .sort((a, b) => Number(a.dataset.ppYield) - Number(b.dataset.ppYield));
      for (const row of rows) {
        row.style.removeProperty("display");
        delete row.dataset.ppYielded;
      }
      for (const row of rows) {
        if (column.scrollHeight <= column.clientHeight + 0.5) break;
        row.style.display = "none";
        row.dataset.ppYielded = "true";
      }
    };
    fit();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(fit);
    observer.observe(root);
    return () => observer.disconnect();
  }, [key, columnSelector]);
  return ref;
}
