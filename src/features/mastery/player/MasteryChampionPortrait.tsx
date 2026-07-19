/**
 * Champion portrait with a graceful fallback (J1).
 *
 * Shows the champion's square icon from the Mastery assets context. When no icon
 * is available (no manifest, unknown champion, or a load error) it renders a
 * neutral initial badge instead — never a broken image and never a layout
 * collapse. The champion name is always shown as adjacent text by callers, so the
 * portrait is decorative.
 */
import { useState } from "react";

import { useMasteryAssets } from "./MasteryAssets";
import { championName } from "./playerFormat";

export function MasteryChampionPortrait({
  championId,
  displayName,
  size = 40,
  className = "",
}: {
  championId: string;
  displayName?: string | null;
  size?: number;
  className?: string;
}) {
  const { championIconUrl } = useMasteryAssets();
  const [failed, setFailed] = useState(false);
  const name = displayName ?? championName(championId);
  const url = failed ? null : championIconUrl(championId, displayName);
  const dim = { width: size, height: size };

  if (!url) {
    return (
      <div
        aria-hidden="true"
        data-testid={`mastery-portrait-fallback-${championId}`}
        className={`flex shrink-0 items-center justify-center rounded-full border border-border bg-muted text-xs font-semibold text-muted-foreground ${className}`}
        style={dim}
      >
        {name.slice(0, 1).toUpperCase()}
      </div>
    );
  }
  return (
    <img
      src={url}
      alt={`${name} portrait`}
      width={size}
      height={size}
      loading="lazy"
      onError={() => setFailed(true)}
      data-testid={`mastery-portrait-${championId}`}
      className={`shrink-0 rounded-full border border-border object-cover ${className}`}
      style={dim}
    />
  );
}
