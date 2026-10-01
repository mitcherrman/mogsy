import { useEffect, useState } from "react";

import { GUIDE_MOBILE_BREAKPOINT } from "./placement";
import type { GuideLayout } from "./types";

const MOBILE_QUERY = `(max-width: ${GUIDE_MOBILE_BREAKPOINT - 1}px)`;

function readLayout(): GuideLayout {
  if (typeof window === "undefined") return "desktop";
  return window.matchMedia?.(MOBILE_QUERY)?.matches ? "mobile" : "desktop";
}

export function useGuideLayout(): GuideLayout {
  const [layout, setLayout] = useState<GuideLayout>(readLayout);
  useEffect(() => {
    const sync = () => setLayout(readLayout());
    sync();
    const mq = window.matchMedia?.(MOBILE_QUERY);
    mq?.addEventListener?.("change", sync);
    return () => mq?.removeEventListener?.("change", sync);
  }, []);
  return layout;
}
