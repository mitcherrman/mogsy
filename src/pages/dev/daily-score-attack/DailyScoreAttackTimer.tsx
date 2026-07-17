/**
 * Display-only countdown derived from the server's expires_at. Never
 * authoritative: at zero it asks the page to reconcile with the server.
 */

import { useEffect, useRef, useState } from "react";

type Props = {
  expiresAt: string;
  /** Server remaining_ms at projection time, used as a reconciliation seed. */
  serverRemainingMs: number;
  running: boolean;
  onZero: () => void;
  onAnnounce: (message: string) => void;
};

export default function DailyScoreAttackTimer({
  expiresAt,
  serverRemainingMs,
  running,
  onZero,
  onAnnounce,
}: Props) {
  const [remainingMs, setRemainingMs] = useState(serverRemainingMs);
  const zeroFired = useRef(false);
  const announced = useRef<{ thirty: boolean; ten: boolean }>({ thirty: false, ten: false });
  const onZeroRef = useRef(onZero);
  onZeroRef.current = onZero;
  const onAnnounceRef = useRef(onAnnounce);
  onAnnounceRef.current = onAnnounce;

  useEffect(() => {
    // Reconcile local drift against the fresh server projection: offset the
    // wall clock so `expires_at - now` lines up with server remaining_ms.
    const expiresEpoch = Date.parse(expiresAt);
    const skewMs = expiresEpoch - Date.now() - serverRemainingMs;
    zeroFired.current = false;
    const tick = () => {
      const left = Math.max(0, expiresEpoch - Date.now() - skewMs);
      setRemainingMs(left);
      if (left <= 30_000 && !announced.current.thirty) {
        announced.current.thirty = true;
        onAnnounceRef.current("30 seconds remaining");
      }
      if (left <= 10_000 && !announced.current.ten) {
        announced.current.ten = true;
        onAnnounceRef.current("10 seconds remaining");
      }
      if (left <= 0 && !zeroFired.current) {
        zeroFired.current = true;
        onZeroRef.current();
      }
    };
    tick();
    if (!running) return undefined;
    const interval = window.setInterval(tick, 250);
    return () => window.clearInterval(interval);
  }, [expiresAt, serverRemainingMs, running]);

  const totalSeconds = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const urgent = remainingMs <= 10_000;

  return (
    <div
      data-testid="dsa-timer"
      className={`font-mono text-4xl font-bold tabular-nums ${
        urgent ? "text-red-400" : "text-foreground"
      }`}
      aria-live="off"
      aria-label={`Time remaining ${minutes}:${String(seconds).padStart(2, "0")}`}
    >
      {minutes}:{String(seconds).padStart(2, "0")}
    </div>
  );
}
