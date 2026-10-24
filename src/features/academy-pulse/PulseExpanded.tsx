/**
 * Academy Pulse — the expanded view.
 *
 * A modal (Radix Dialog: focus is trapped and returned, Escape closes) that
 * shows the current scene at full size with whatever it has to say at length:
 * the whole announcement, the Premium rows with their summaries, an
 * achievement's criteria, a creator's video or stream. The rotation is held
 * for as long as it is open (the shell sets the hold).
 */
import * as Dialog from "@radix-ui/react-dialog";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";

import { pulseItemLabel } from "./content/live/live-items";
import type { PulseItem } from "./model/pulse-types";
import PulseVideoViewer from "./PulseVideoViewer";
import SceneRenderer, { SCENE_ACCENT } from "./scenes/SceneRenderer";
import { MASCOT_NAME, mascotSrc } from "./scenes/scene-kit";

function Detail({ item, reduced, onInteract }: { item: PulseItem; reduced: boolean; onInteract(): void }) {
  switch (item.kind) {
    case "creator":
      return (
        <>
          <PulseVideoViewer item={item} reduced={reduced} />
          {item.challenge && (
            <section className="apulse-x-section" aria-label="Creator challenge">
              <p className="apulse-kicker">Creator challenge</p>
              <p className="apulse-title apulse-title-sm">{item.challenge.title}</p>
              <p className="apulse-body">{item.challenge.detail}</p>
              {item.challenge.href ? (
                <Link to={item.challenge.href} className="apulse-btn apulse-btn-primary">Take the challenge</Link>
              ) : (
                <p className="apulse-note">Sample challenge: entry opens when a real creator challenge is connected.</p>
              )}
            </section>
          )}
        </>
      );
    case "news":
      return (
        <article className="apulse-x-article">
          <p className="apulse-kicker">{item.kicker} · {item.dateLabel}</p>
          {item.body.map((para) => <p key={para} className="apulse-x-para">{para}</p>)}
          {item.href && <Link to={item.href} className="apulse-btn apulse-btn-primary">{item.ctaLabel}</Link>}
        </article>
      );
    case "premium":
      return (
        <section className="apulse-x-article">
          <ul className="apulse-x-benefits">
            {item.benefits.map((b) => (
              <li key={b.id}>
                <b>{b.label}</b>
                <span>{b.summary}</span>
              </li>
            ))}
          </ul>
          <Link to={item.ctaHref} className="apulse-btn apulse-btn-gold">{item.ctaLabel}</Link>
        </section>
      );
    case "activity":
      return (
        <section className="apulse-x-achievement">
          <img src={mascotSrc(item.player.mascot)} alt="" className="apulse-x-mascot" draggable={false} />
          <div className="apulse-stack">
            <p className="apulse-kicker">{item.achievement.context}</p>
            <p className="apulse-title apulse-gold-text">{item.achievement.name}</p>
            <p className="apulse-body">{item.achievement.description}</p>
            <ul className="apulse-criteria">{item.achievement.criteria.map((c) => <li key={c}>{c}</li>)}</ul>
            <p className="apulse-muted">
              {item.player.displayName} · {MASCOT_NAME[item.player.mascot]} · {item.score.label} {item.score.value.toLocaleString("en-US")}
            </p>
          </div>
        </section>
      );
    default:
      return (
        <motion.div className="apulse-x-scene apulse-viewport-inner" initial="enter" animate="show">
          <SceneRenderer item={item} reduced={reduced} onInteract={onInteract} onExpand={() => {}} />
        </motion.div>
      );
  }
}

export default function PulseExpanded({
  item,
  open,
  onOpenChange,
  reduced,
  onInteract,
  returnFocus,
}: {
  item: PulseItem | null;
  open: boolean;
  onOpenChange(open: boolean): void;
  reduced: boolean;
  onInteract(): void;
  /** Where focus goes back to on close (the button that opened it). */
  returnFocus(): HTMLElement | null;
}) {
  return (
    <Dialog.Root open={open && !!item} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="apulse-x-overlay" />
        {item && (
          <Dialog.Content
            className="apulse-x"
            data-kind={item.kind}
            style={{ ["--apulse-accent" as string]: SCENE_ACCENT[item.kind] }}
            data-testid="pulse-expanded"
            aria-describedby={undefined}
            onCloseAutoFocus={(e) => {
              const el = returnFocus();
              if (el?.isConnected) { e.preventDefault(); el.focus(); }
            }}
          >
            <header className="apulse-x-head">
              <p className="apulse-x-cat">
                <span className="apulse-signal" aria-hidden><i /><i /><i /></span>
                Academy Pulse · {pulseItemLabel(item)}
                {item.provenance === "fixture" && <span className="apulse-sample-inline">Preview sample</span>}
              </p>
              <Dialog.Title className="apulse-x-title">{item.title}</Dialog.Title>
              <Dialog.Close className="apulse-icon-btn apulse-x-close" aria-label="Close" data-testid="pulse-expanded-close">
                <svg viewBox="0 0 24 24" aria-hidden focusable="false"><path d="M6 6l12 12M18 6 6 18" /></svg>
              </Dialog.Close>
            </header>
            <div className="apulse-x-body">
              <Detail item={item} reduced={reduced} onInteract={onInteract} />
            </div>
          </Dialog.Content>
        )}
      </Dialog.Portal>
    </Dialog.Root>
  );
}
