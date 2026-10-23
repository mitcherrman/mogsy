/**
 * ATL-P1-C — the comparison bridge.
 *
 * A bridge spans the dock row beneath the two Lenses it joins. It prints the
 * verdict the sources allowed (comparable / side-by-side / blocked), the
 * shared facets, and the delta only where the delta is honest.
 */
import { motion } from "framer-motion";
import { X } from "lucide-react";
import type { ComparisonView, FacetDifference } from "@/lib/atlas-p1c/types";
import { contextLabel } from "@/lib/atlas-p1c/context";
import { ATLAS_DURATION, atlasTransition } from "./motion";

function Delta({ row }: { row: FacetDifference }) {
  if (row.delta === null) return <span className="bridge__delta bridge__delta--blocked">— {row.deltaBlockedReason}</span>;
  const values = Array.isArray(row.delta) ? row.delta : [row.delta];
  return (
    <span className="bridge__delta">
      {values.map((v, i) => (
        <span key={i} className={`bridge__delta--${v > 0 ? "pos" : v < 0 ? "neg" : "zero"}`}>
          {i ? " / " : ""}
          {v > 0 ? "+" : ""}
          {v}
        </span>
      ))}
      {row.unit ? <span className="facet__unit"> {row.unit}</span> : null}
    </span>
  );
}

function cell(value: FacetDifference["a"]): string {
  if (value === null) return "—";
  return Array.isArray(value) ? value.join(" / ") : String(value);
}

export function ComparisonTile({ view, reduced, onRemove }: { view: ComparisonView; reduced: boolean; onRemove: () => void }) {
  const { a, b, verdict } = view;
  const label = verdict.kind === "comparable" ? "comparable" : verdict.kind === "side-by-side" ? "side by side" : "blocked";
  return (
    <motion.section
      layout={!reduced}
      transition={atlasTransition(ATLAS_DURATION.plate, reduced)}
      className="bridge"
      aria-label={`Comparison: ${a.title} and ${b.title}, ${label}`}
      data-testid="atlas-bridge"
    >
      <div className="bridge__head">
        <h3 className="bridge__title">
          {a.title} <span aria-hidden="true">⟷</span> {b.title}
        </h3>
        <span className={`bridge__verdict bridge__verdict--${verdict.kind}`}>{label}</span>
        <span className="at-chip">{contextLabel(a.effective.context)}</span>
        <span className="atlas__header-spacer" />
        <button type="button" className="at-btn at-btn--ghost at-btn--sm" onClick={onRemove} title="Remove this comparison (the Lenses stay)">
          <X size={13} aria-hidden="true" /> Remove
        </button>
      </div>
      {verdict.kind === "blocked" ? (
        <p className="bridge__blocked">{verdict.reason}</p>
      ) : (
        <>
          <table className="bridge__table">
            <thead>
              <tr>
                <th scope="col">Facet</th>
                <th scope="col">{a.title}</th>
                <th scope="col">{b.title}</th>
                <th scope="col">Δ (b − a)</th>
              </tr>
            </thead>
            <tbody>
              {verdict.rows.map((row) => (
                <tr key={row.key}>
                  <td>{row.label}</td>
                  <td className="mono">{cell(row.a)}</td>
                  <td className="mono">{cell(row.b)}</td>
                  <td>
                    <Delta row={row} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {verdict.notes.length ? (
            <ul className="bridge__notes">
              {verdict.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          ) : null}
        </>
      )}
    </motion.section>
  );
}
