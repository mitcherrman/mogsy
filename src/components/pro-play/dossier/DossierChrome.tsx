// ---------------------------------------------------------------------------
// The dossier's chrome: folio surfaces, archival section tabs, Mogzy's
// marginal notes, the gold rule, and the progressive-disclosure control.
//
// WHY THESE AND NOT `Panel`. `Panel` wraps everything in one identical card,
// which is exactly the "SaaS dashboard with parchment colors" this page is
// meant to stop being. A dossier has a hierarchy of MATERIALS: the folio is
// the leather cover, a parchment insert is a pasted-in sheet, an archival tab
// names a chapter, and a margin note is the author's hand. Choosing among
// them is how a reader knows what they are looking at without reading a word.
//
// SEMANTICS ARE NOT DECORATION. `MogzyNote` renders server-authored sentences
// — the no-prediction note, the pool note, the side-by-side disclaimer. Phase
// 3 moves them out of the reader's way; it never stops printing them, and it
// never rewords them. `tone="quiet"` is a visual weight, not an edit.
//
// All styling lives under `.proplay-dossier` in index.css so this vocabulary
// cannot leak into the rest of the product.
// ---------------------------------------------------------------------------

import { useId, useState, type ReactNode } from "react";
import { ChevronDown, Info } from "lucide-react";

/** The page-level surface. Everything else in the dossier sits inside this. */
export function Dossier({ children }: { children: ReactNode }) {
  return (
    <div className="proplay-dossier" data-testid="dossier">
      {children}
    </div>
  );
}

/**
 * A chapter. The heading is an archival tab rather than a card title, and the
 * body sits on the folio directly — no nested rectangle.
 */
export function DossierSection({
  title,
  eyebrow,
  actions,
  children,
  testId,
}: {
  title: string;
  eyebrow?: string;
  actions?: ReactNode;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <section className="dossier-section" data-testid={testId}>
      <div className="dossier-section__head">
        <span className="dossier-tab">
          {eyebrow ? <span className="dossier-tab__eyebrow">{eyebrow}</span> : null}
          <span className="dossier-tab__title">{title}</span>
        </span>
        {actions ? <div className="dossier-section__actions">{actions}</div> : null}
      </div>
      <div className="dossier-section__body">{children}</div>
    </section>
  );
}

/** A pasted-in sheet. Used for anything that reads as evidence. */
export function Parchment({
  children,
  className,
  testId,
}: {
  children: ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <div className={["dossier-parchment", className].filter(Boolean).join(" ")} data-testid={testId}>
      {children}
    </div>
  );
}

/** The gold archival rule. Ornament, and the only one on the page. */
export function GoldRule({ label }: { label?: string }) {
  return (
    <div className="dossier-rule" role="presentation">
      <span className="dossier-rule__line" />
      {label ? <span className="dossier-rule__label">{label}</span> : null}
      <span className="dossier-rule__line" />
    </div>
  );
}

/**
 * A margin annotation in Mogzy's hand. This is where the server's careful
 * sentences live now — present, readable, and no longer the first paragraph
 * the reader meets.
 */
export function MogzyNote({
  children,
  label = "Mogzy's Notes",
  testId,
}: {
  children: ReactNode;
  label?: string;
  testId?: string;
}) {
  if (!children) return null;
  return (
    <aside className="dossier-note" data-testid={testId ?? "mogzy-note"}>
      <span className="dossier-note__seal" aria-hidden="true" />
      <div>
        <span className="dossier-note__label">{label}</span>
        <p className="dossier-note__body">{children}</p>
      </div>
    </aside>
  );
}

/**
 * A truthful sentence the reader can summon but does not have to read. Used
 * for the audit-language the page must keep and must not lead with.
 */
export function FinePrint({ children, testId }: { children: ReactNode; testId?: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  if (!children) return null;
  return (
    <div className="dossier-fineprint" data-testid={testId ?? "dossier-fineprint"}>
      <button
        type="button"
        className="dossier-fineprint__toggle"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
      >
        <Info className="h-3 w-3" aria-hidden="true" />
        What this means
      </button>
      {/* Rendered either way so the sentence is in the accessibility tree and
          in the DOM for anything that reads the page — hidden, never absent. */}
      <p id={id} className="dossier-fineprint__body" hidden={!open}>
        {children}
      </p>
    </div>
  );
}

/**
 * Summary first, evidence second. The detail is always RENDERED when open and
 * never filtered away when closed — this is a display control over rows the
 * page already holds, exactly like the "Show all N" it replaces.
 */
export function Disclosure({
  label,
  openLabel,
  children,
  testId,
  defaultOpen = false,
}: {
  label: string;
  openLabel?: string;
  children: ReactNode;
  testId?: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <div className="dossier-disclosure" data-testid={testId}>
      <button
        type="button"
        className="dossier-disclosure__toggle"
        aria-expanded={open}
        aria-controls={id}
        data-testid={testId ? `${testId}-toggle` : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        <ChevronDown
          className={["h-3.5 w-3.5 transition-transform", open ? "rotate-180" : ""].join(" ")}
          aria-hidden="true"
        />
        {open ? (openLabel ?? label) : label}
      </button>
      <div id={id} hidden={!open} data-testid={testId ? `${testId}-body` : undefined}>
        {open ? children : null}
      </div>
    </div>
  );
}

/** A single figure on the dossier. Tabular, technical, cyan-keyed. */
export function Figure({
  label,
  value,
  hint,
  testId,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  testId?: string;
}) {
  return (
    <div className="dossier-figure" data-testid={testId}>
      <span className="dossier-figure__label">{label}</span>
      <span className="dossier-figure__value">{value}</span>
      {hint ? <span className="dossier-figure__hint">{hint}</span> : null}
    </div>
  );
}
