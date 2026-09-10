/**
 * RB3 — one informational page in the guided playtest.
 *
 * NOT GAMEPLAY, which is the only reason it is allowed to be playtest-specific
 * at all. It renders no question, holds no timer, submits nothing, and knows
 * nothing about a match. Everything the player actually answers goes through
 * the untouched Ranked renderer.
 *
 * It borrows the Ranked shell's own classes (`ranked-panel`, `ranked-eyebrow`,
 * `ranked-title`) rather than inventing a second visual language, so a page
 * between two segments reads as part of the same match.
 */
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { MogzyMascot } from "@/components/mascot/MogzyMascot";
import type { PlaytestInterstitial as Page } from "@/lib/playtest/preset";

export function PlaytestInterstitialView({
  page,
  onAdvance,
  children,
}: {
  page: Page;
  onAdvance: () => void;
  /** Optional extra content under the copy — the outro's offer/feedback area. */
  children?: ReactNode;
}) {
  return (
    <section
      aria-label="Playtest"
      data-testid="playtest-interstitial"
      data-page={page.id}
      className="mx-auto w-full max-w-xl space-y-4"
    >
      <div className="ranked-panel space-y-3 px-5 py-7 text-center">
        <MogzyMascot pose="base" decorative
          className="mx-auto h-20 w-20 sm:h-24 sm:w-24" />
        <div className="ranked-eyebrow ranked-eyebrow--cyan"
          data-testid="playtest-eyebrow">
          {page.eyebrow}
        </div>
        <h2 className="ranked-title text-2xl font-black uppercase tracking-[0.05em]"
          data-testid="playtest-heading">
          {page.heading}
        </h2>
        <div className="space-y-2">
          {page.body.map((paragraph, i) => (
            <p key={i} className="text-sm leading-relaxed text-muted-foreground">
              {paragraph}
            </p>
          ))}
        </div>
        {children}
      </div>
      <Button
        type="button"
        data-testid="playtest-advance"
        onClick={onAdvance}
        className="min-h-[46px] w-full"
      >
        {page.action}
      </Button>
    </section>
  );
}
