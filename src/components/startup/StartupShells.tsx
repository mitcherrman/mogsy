/**
 * Destination-shaped startup shells.
 *
 * These replace the old full-screen pulsing-logo loader. Each one paints the
 * surface the visitor is actually navigating to — right background, right
 * geometry — so the real page can swap in underneath without the screen
 * changing character or jumping.
 *
 * Hard rule for everything in this file: a shell may be rendered *before* auth,
 * app settings, profile, Pro entitlement or tutorial state are known. So it may
 * only contain content that is true for every visitor. No usernames, no
 * entitlement badges, no counts, no privileged controls, no placeholder profile
 * data that could later turn out to be wrong.
 */

import { ENTRY_BASE_BG, LOL_BASE_BG, DEFAULT_BASE_BG, isLolSectionPath, isEntryPath } from "@/lib/startup-shell";

/** Shared wrapper: announces "busy" once, hides the decorative filler from AT. */
function ShellFrame({
  label,
  background,
  children,
  className = "",
}: {
  label: string;
  background: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={label}
      data-startup-shell-surface
      className={`min-h-dvh w-full relative overflow-hidden ${className}`}
      style={{ background }}
    >
      <div aria-hidden="true" className="absolute inset-0">
        {children}
      </div>
    </div>
  );
}

/**
 * Neutral app surface. Used for routes that have no bespoke shell yet: it holds
 * the viewport open in the app's base colour rather than flashing a logo.
 */
export function NeutralBootShell() {
  return (
    <ShellFrame label="Loading" background={DEFAULT_BASE_BG}>
      <div
        className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-full max-w-[88rem] bg-background mask-fade-xy"
      />
    </ShellFrame>
  );
}

/**
 * Academy entrance shell for `/`. Mirrors MogzyEntryV2's fixed, centre-dominant
 * frame: the title band and the doorway keep their space so the real entrance
 * mounts into an already-correct layout instead of pushing it around.
 */
export function EntryShell() {
  return (
    <ShellFrame label="Loading the Academy entrance" background={ENTRY_BASE_BG} className="h-[100dvh]">
      {/* Faint warm pool where the doorway lantern sits. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(52% 34% at 50% 42%, rgba(201,168,76,0.07) 0%, transparent 70%)",
        }}
      />
      {/* Reserved title band + doorway, so nothing shifts once the façade mounts. */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 px-6">
        <div className="h-[3.5rem] w-full max-w-[34rem] rounded-sm bg-[#c9a84c]/[0.05]" />
        <div className="h-px w-full max-w-[20rem] bg-[#c9a84c]/15" />
        <div className="h-[38dvh] w-[min(58vw,17rem)] rounded-t-[45%] bg-black/40 ring-1 ring-[#c9a84c]/10" />
      </div>
    </ShellFrame>
  );
}

/**
 * Library-hub shell for `/lol`. Safe to render with nothing known about the
 * visitor: the academy backdrop, the heading band and six book silhouettes are
 * identical for a signed-out first-timer and a Pro account.
 */
export function LibraryHubShell() {
  return (
    <ShellFrame label="Loading the League academy" background={LOL_BASE_BG}>
      {/* Atmospheric library wash — matches the static shell in index.html and
          `.theme-lol body`, so the surface never changes colour on handoff. */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(60% 45% at 50% 0%, rgba(217,174,66,0.10) 0%, transparent 60%)," +
            "radial-gradient(90% 60% at 50% 100%, rgba(69,30,30,0.35) 0%, transparent 70%)," +
            "linear-gradient(180deg, #050d15 0%, #04090f 100%)",
        }}
      />
      {/* Header clearance, so the hub does not jump down when the navbar mounts. */}
      <div className="relative flex h-full flex-col px-4 pt-[calc(var(--app-header-h)+0.75rem)] md:px-3 lg:px-4 xl:px-6">
        {/* Academy heading band */}
        <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-2">
          <div className="h-[1.6rem] w-[min(85%,26rem)] rounded-sm bg-[#c9a84c]/[0.07]" />
          <div className="h-[1.6rem] w-[min(70%,22rem)] rounded-sm bg-[#c9a84c]/[0.06]" />
        </div>
        {/* Desktop: two flanking book columns around the central lane */}
        <div className="mt-4 hidden min-h-0 flex-1 md:grid grid-cols-[1fr_minmax(200px,0.34fr)_1fr] items-center gap-x-2 lg:gap-x-3">
          <div className="flex flex-col justify-center gap-y-[clamp(2px,0.8vh,12px)]">
            <BookSilhouette />
            <BookSilhouette />
            <BookSilhouette />
          </div>
          <div />
          <div className="flex flex-col justify-center gap-y-[clamp(2px,0.8vh,12px)]">
            <BookSilhouette />
            <BookSilhouette />
            <BookSilhouette />
          </div>
        </div>
        {/* Mobile: the stacked Hextech panel rail */}
        <div className="mt-5 grid grid-cols-1 gap-3 md:hidden">
          <PanelSilhouette />
          <PanelSilhouette />
          <PanelSilhouette />
          <PanelSilhouette />
          <PanelSilhouette />
          <PanelSilhouette />
        </div>
      </div>
    </ShellFrame>
  );
}

function BookSilhouette() {
  return (
    <div
      data-shell-book
      className="h-[clamp(72px,13vh,124px)] w-full rounded-md border border-[#c9a84c]/10 bg-[#0a1020]/35"
    />
  );
}

function PanelSilhouette() {
  return (
    <div
      data-shell-book
      className="h-[76px] w-full rounded-md border border-[#c9a84c]/10 bg-[#0a1020]/35"
    />
  );
}

/**
 * Picks the shell that matches where the browser is actually headed. Route is
 * the only input — never user state — so this is safe at any point in boot.
 */
export function RouteBootShell({ pathname }: { pathname: string }) {
  if (isLolSectionPath(pathname)) return <LibraryHubShell />;
  if (isEntryPath(pathname)) return <EntryShell />;
  return <NeutralBootShell />;
}
