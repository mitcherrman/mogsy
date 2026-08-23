/**
 * THE ARENA'S OUTER FRAME AND ITS STYLING CONTEXT (ARENA1 Step 3).
 *
 * Moved here verbatim from `QuizRankedPage`'s local `Frame`. Nothing about the
 * markup changed; what changed is who owns it.
 *
 * WHY IT HAD TO MOVE
 * ──────────────────
 * `.ranked-academy` is not decoration — it is the context half the arena's CSS
 * is written against. `index.css` carries rule after rule of the form
 * `.ranked-academy .ranked-folio …`, `.ranked-academy .ranked-header-plate …`,
 * `.ranked-academy [data-answers-state] [data-quiz-choice] …`. A subtree
 * rendered without that ancestor gets the arena's structure and none of its
 * skin, silently, with no error and no visual clue that anything is missing.
 *
 * That already happened. The Daily Challenge applies `ranked-folio` in three
 * files, none of which has a `.ranked-academy` ancestor, so its parchment has
 * never rendered — the class is inert and always has been.
 *
 * The class used to be applied by ONE page, which made "remember to wrap your
 * mode in `.ranked-academy`" a rule a mode author had to know and could not
 * discover. It is applied here now, by the component `CanonicalArena` renders
 * unconditionally, so a mode that reaches the arena at all cannot miss it.
 *
 * NOT A THEME SYSTEM. Every rule it activates lives in index.css, it is
 * applied nowhere else in the app, and no shared component (question surface,
 * quiz answer grid, arena primitives) knows it exists. The background it
 * paints is a fixed layer, so it adds no height and cannot reach the navbar or
 * any floating control.
 */
import type { ReactNode } from "react";

export interface ArenaShellProps {
  children: ReactNode;
  /**
   * Optional chrome above the arena — a title row, a way back. Rendered INSIDE
   * the shell so it sits in the same styling and stacking context the arena
   * does; a sibling above the shell would paint under the fixed backdrop.
   */
  header?: ReactNode;
  /**
   * `default` is the reading-width frame the non-match states use. `wide` is
   * the live arena: RA10 widened it a step at xl, and RA11 lets it take the
   * full stage at large desktops. The centre question track — not the fixed
   * duelist rails — absorbs every extra pixel.
   */
  size?: "default" | "wide";
  /** Overrides the default `quiz-ranked` hook. */
  testId?: string;
}

export function ArenaShell({
  children, header, size = "default", testId = "quiz-ranked",
}: ArenaShellProps) {
  return (
    /* RG1 — THE RECLAIMED HUD BAND AND THE STAGE FLOOR.
       The app shell reserves `--app-header-h` at the top of every page
       (Layout's `pt-[var(--app-header-h)]`), a reservation older than the
       chrome it reserves for: the navbar was replaced by `GlobalHud`, which is
       `position: fixed`, `pointer-events: none`, and paints exactly two corner
       chips — measured at 1440px, a 44px hat at x 12–56 and a 224px identity
       cluster at x 1204–1428. The other ~80% of that strip is empty, and here
       it pushed the arena down 56px for nothing. So from `lg` up the frame
       pulls itself back up into the band, the same way `/lol` and `/quiz`
       already do; Layout is untouched, so every other route keeps the
       reservation (and with it the RA1 1.1 route-loading overflow fix).

       From `lg` up the frame is also a flex column with
       `min-h: --ranked-stage-h` — a FLOOR, deliberately not a cap. The stage
       always fills the viewport, so the arena is as large as the screen
       allows rather than as small as the current round needs; and content the
       floor cannot seat GROWS the stage instead of being clipped or handed a
       scrollbar of its own. An earlier draft capped the stage and gave the
       question card `overflow-y-auto`; the content audit that followed showed
       the trade was never necessary (prompts ≤108 chars, options ≤63), so the
       floor seats real content whole and the pathological case pushes the
       page, which is the browser's job.

       Below `lg` neither applies: the arena stacks into one column whose
       natural height genuinely exceeds any phone or tablet viewport.

       NOT A THEME SYSTEM — see the note above about `.ranked-academy`. */
    <div className={`ranked-shell ranked-academy mx-auto flex w-full flex-col gap-2 px-4 pt-3 pb-3
      lg:-mt-[var(--app-header-h)] lg:gap-1 lg:pb-2 lg:pt-1
      lg:min-h-[var(--ranked-stage-h)] ${
      size === "wide" ? "max-w-6xl xl:max-w-[76rem] min-[1500px]:max-w-[90rem]" : "max-w-3xl"}`}
      data-testid={testId}>
      {header}
      {/* The one region the arena is given. `flex-1` grows it into everything
          the chrome row leaves; there is deliberately no `min-h-0`, because
          that is exactly the switch that lets a flex child be shorter than its
          content — which is what would clip a question or force it to scroll.
          Without it the automatic minimum size holds, so an oversized round
          grows this box, grows the stage, and scrolls the PAGE. */}
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}

/**
 * The chrome row's geometry, exported because the row's CONTENT belongs to
 * whichever mode supplies it while its PLACEMENT belongs to the shell.
 *
 * RG1 moved this row INTO the reclaimed HUD band from `lg`, which is what the
 * two insets are for: `pl` clears `GlobalHud`'s hat chip and `pr` clears its
 * identity cluster, so the row occupies the strip's empty middle and collides
 * with neither. They are `lg:` for a measured reason and not for tidiness —
 * the two chips together are ~290px of chrome, and at 379px they leave the
 * band with no free middle at all (the cluster alone spans x 147–371 there,
 * straight through where a title would be). So narrow widths keep the app
 * shell's reservation and this row stays below it, exactly as before.
 *
 * The row is sized to its TEXT (one 28px line), not to the band it now sits
 * in: filling `--app-header-h` here spent 24px holding a strip open for chrome
 * that is `position: fixed` and does not need it. Those 24px went to the
 * question.
 *
 * `shrink-0` keeps the row out of the stage budget's flex distribution — the
 * row is chrome, and only the arena below it may take the rest.
 *
 * `size` is accepted and deliberately unused: the insets are measured against
 * the fixed HUD chips, which do not move with the frame's width.
 */
export function arenaHeaderRowClass(_size: "default" | "wide" = "default"): string {
  void _size;
  return "flex min-h-7 shrink-0 items-center justify-between gap-3"
    + " lg:min-h-8 lg:pl-14 lg:pr-56";
}
