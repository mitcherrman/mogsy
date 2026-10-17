/**
 * PGM1 — a public mode's Rules, in Mogzy's own explainer scroll.
 *
 * The same `MogzyExplainsPanel` Ranked's rules use, in the dock's rules slot,
 * rendering `buildModeRules` (the server catalog's copy). It is controlled:
 * the caller owns `open`, so a catalog can open it for the card the player
 * pressed and a Phase 2 game screen can mount it beside the arena.
 */
import { BookOpen } from "lucide-react";
import { DOCK_ORDER } from "@/components/mogzy-dock/MogzyDock";
import { MogzyExplainsPanel } from "@/components/ranked-rules/MogzyExplainsPanel";
import type { ModeRules } from "@/lib/public-modes/rules";

export function ModeRulesContent({ rules }: { rules: ModeRules }) {
  return (
    <div data-testid={`mode-rules-content-${rules.rulesId}`}>
      {rules.sections.map((s) => (
        <section key={s.heading} className="mt-3 first:mt-0">
          <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#6b5220]">{s.heading}</h3>
          <p className="mt-1 text-[13px] leading-snug">{s.body}</p>
        </section>
      ))}
    </div>
  );
}

export function ModeRulesPanel({ rules, open, onOpen, onClose }: {
  rules: ModeRules;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
}) {
  return (
    <MogzyExplainsPanel
      open={open}
      onOpen={onOpen}
      onClose={onClose}
      dockOrder={DOCK_ORDER.rules}
      title={rules.title}
      tabIcon={<BookOpen className="h-3.5 w-3.5" />}
      tabLabel="Rules"
      openLabel={`View ${rules.title}`}
      testId="mode-rules"
    >
      <ModeRulesContent rules={rules} />
    </MogzyExplainsPanel>
  );
}
