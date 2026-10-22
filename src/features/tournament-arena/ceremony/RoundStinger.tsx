/**
 * Title plates for signature moments (a port of the Dynasty `StingerHost`):
 * one at a time, `aria-live`, a new one replaces the current. "Semifinals",
 * "Match point", "Round complete". Reduced motion: the plate shows briefly
 * with no slide.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { useMotionAllowed } from "@/lib/motion/useReveal";
import { cn } from "@/lib/utils";

import { TA } from "../motion";

export type StingerTone = "gold" | "violet" | "ice";
export interface StingerSpec {
  id: string;
  kicker?: string;
  title: string;
  sub?: string;
  tone?: StingerTone;
  ms?: number;
}

const StingerCtx = createContext<{ fire: (s: StingerSpec) => void } | null>(null);

export function StingerHost({ children, className }: { children: ReactNode; className?: string }) {
  const [cur, setCur] = useState<StingerSpec | null>(null);
  const [take, setTake] = useState(0);
  const timer = useRef<number | null>(null);
  const motion = useMotionAllowed();
  const fire = useCallback((s: StingerSpec) => {
    if (timer.current) window.clearTimeout(timer.current);
    setCur(s);
    setTake((t) => t + 1);
    timer.current = window.setTimeout(() => setCur(null), s.ms ?? (motion ? TA.stinger : 1300));
  }, [motion]);
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);
  const value = useMemo(() => ({ fire }), [fire]);
  return (
    <StingerCtx.Provider value={value}>
      {children}
      <div aria-live="polite" className={cn("pointer-events-none absolute inset-x-0 top-3 z-40 flex justify-center px-4", className)} data-testid="ta-stinger-host">
        {cur ? (
          <div
            key={take}
            data-testid="ta-stinger"
            data-stinger={cur.id}
            role="status"
            onClick={() => setCur(null)}
            className={cn("ta-stinger pointer-events-auto flex max-w-[34rem] items-center gap-3 rounded-xl border px-4 py-2.5 text-left shadow-[0_24px_48px_-24px_rgba(0,0,0,0.9)]", cur.tone && cur.tone !== "gold" && `ta-stinger--${cur.tone}`, motion && "ta-stinger--in")}
          >
            <span aria-hidden="true" className="ta-stinger__bar h-9 w-1 rounded-full" />
            <span className="min-w-0">
              {cur.kicker ? <span className="block text-[10px] font-bold uppercase tracking-[0.22em] opacity-80">{cur.kicker}</span> : null}
              <span className="ta-title block truncate text-[18px] font-bold leading-tight sm:text-[20px]">{cur.title}</span>
              {cur.sub ? <span className="block truncate text-[11.5px] opacity-80">{cur.sub}</span> : null}
            </span>
          </div>
        ) : null}
      </div>
    </StingerCtx.Provider>
  );
}

export function useStinger() {
  const ctx = useContext(StingerCtx);
  return ctx?.fire ?? (() => undefined);
}
